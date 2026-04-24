import argparse
import json
import socket
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import numpy as np
from brainflow.board_shim import BoardIds, BoardShim, BrainFlowInputParams


ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"

CALIBRATION_MODES = {
    "normal": {"command": "d", "label": "Normal"},
    "ground": {"command": "0", "label": "GND Test"},
    "test_slow": {"command": "[", "label": "Slow Test"},
    "test_fast": {"command": "]", "label": "Fast Test"},
}

IMPEDANCE_TONE_HZ = 31.5
IMPEDANCE_CURRENT_AMPS = 6e-9
IMPEDANCE_SETTLE_SECONDS = 0.8
IMPEDANCE_WINDOW_SECONDS = 1.5
IMPEDANCE_INTER_CHANNEL_DELAY_SECONDS = 0.15


class EEGServerState:
    def __init__(self):
        self._lock = threading.RLock()
        self.board = None
        self.board_id = BoardIds.CYTON_BOARD.value
        self.serial_port = "COM4"
        self.sampling_rate = None
        self.eeg_channels = []
        self.channel_names = []
        self.window_seconds = 6
        self.status = "disconnected"
        self.last_error = ""
        self.calibration_mode = "normal"
        self.impedance = self._empty_impedance_state()

    def connect(self, board_id: int, serial_port: str):
        with self._lock:
            self.disconnect()

            params = BrainFlowInputParams()
            params.serial_port = serial_port

            board = BoardShim(board_id, params)
            board.prepare_session()
            board.start_stream(45000)

            self.board = board
            self.board_id = board_id
            self.serial_port = serial_port
            self.sampling_rate = BoardShim.get_sampling_rate(board_id)
            self.eeg_channels = BoardShim.get_eeg_channels(board_id)
            self.channel_names = [f"EEG {i + 1}" for i in range(len(self.eeg_channels))]
            self.status = "streaming"
            self.last_error = ""
            self.calibration_mode = "normal"
            self._initialize_impedance_state()

    def disconnect(self):
        with self._lock:
            if self.board is None:
                self.status = "disconnected"
                return

            try:
                self.board.stop_stream()
            except Exception:
                pass

            try:
                self.board.release_session()
            except Exception:
                pass

            self.board = None
            self.sampling_rate = None
            self.eeg_channels = []
            self.channel_names = []
            self.status = "disconnected"
            self.calibration_mode = "normal"
            self.impedance = self._empty_impedance_state()

    def set_calibration_mode(self, mode: str):
        with self._lock:
            if self.board is None:
                raise RuntimeError("Board is not connected")
            if mode not in CALIBRATION_MODES:
                raise ValueError(f"Unsupported calibration mode: {mode}")

            self.board.config_board(CALIBRATION_MODES[mode]["command"])
            self.calibration_mode = mode
            self.last_error = ""

    def calibration_snapshot(self):
        return {
            "mode": self.calibration_mode,
            "label": CALIBRATION_MODES[self.calibration_mode]["label"],
        }

    def _empty_impedance_state(self):
        return {
            "supported": False,
            "measuring": False,
            "scan_in_progress": False,
            "message": "Connect a Cyton board to measure impedance.",
            "last_updated": None,
            "results": [],
        }

    def _initialize_impedance_state(self):
        supported = self.board_id in {
            BoardIds.CYTON_BOARD.value,
            BoardIds.CYTON_DAISY_BOARD.value,
        }
        self.impedance = {
            "supported": supported,
            "measuring": False,
            "scan_in_progress": False,
            "message": "Ready" if supported else "Impedance measurement is only implemented for Cyton boards.",
            "last_updated": None,
            "results": [
                {
                    "channel_number": index + 1,
                    "channel_name": self.channel_names[index],
                    "impedance_kohm": None,
                    "signal_rms_uv": None,
                    "status": "unknown",
                    "status_label": "Not tested",
                    "last_measured_at": None,
                }
                for index in range(len(self.channel_names))
            ],
        }

    def impedance_snapshot(self):
        return json.loads(json.dumps(self.impedance))

    def measure_impedance(self, channel_number: int):
        with self._lock:
            if self.board is None:
                raise RuntimeError("Board is not connected")
            if not self.impedance.get("supported"):
                raise RuntimeError("Impedance measurement is only available for Cyton / Cyton Daisy")
            if channel_number < 1 or channel_number > len(self.eeg_channels):
                raise ValueError(f"Channel must be between 1 and {len(self.eeg_channels)}")

            self.impedance["measuring"] = True
            self.impedance["message"] = f"Measuring channel {channel_number}..."
            if self.calibration_mode != "normal":
                self.board.config_board(CALIBRATION_MODES["normal"]["command"])
                self.calibration_mode = "normal"
            try:
                self.board.get_board_data()
                self.board.config_board(self._impedance_command(channel_number, p_input=True, n_input=False))
                time.sleep(IMPEDANCE_SETTLE_SECONDS)
                raw = self.board.get_current_board_data(max(int(self.sampling_rate * IMPEDANCE_WINDOW_SECONDS), 1))

                eeg = raw[self.eeg_channels, :]
                if eeg.shape[1] < max(int(self.sampling_rate * 0.5), 8):
                    raise RuntimeError("Not enough data collected for impedance measurement")

                channel_index = channel_number - 1
                signal_uv = eeg[channel_index]
                tone_rms_uv = self._estimate_tone_rms_uv(signal_uv, self.sampling_rate, IMPEDANCE_TONE_HZ)
                impedance_kohm = self._estimate_impedance_kohm(tone_rms_uv)
                status, status_label = self._impedance_status(impedance_kohm)

                result = {
                    "channel_number": channel_number,
                    "channel_name": self.channel_names[channel_index],
                    "impedance_kohm": round(float(impedance_kohm), 2),
                    "signal_rms_uv": round(float(tone_rms_uv), 2),
                    "status": status,
                    "status_label": status_label,
                    "last_measured_at": round(time.time(), 3),
                }
                self.impedance["results"][channel_index] = result
                self.impedance["last_updated"] = result["last_measured_at"]
                self.impedance["message"] = f"Measured channel {channel_number}"
                return result
            finally:
                try:
                    self.board.config_board(self._impedance_command(channel_number, p_input=False, n_input=False))
                except Exception:
                    pass
                time.sleep(IMPEDANCE_INTER_CHANNEL_DELAY_SECONDS)
                self.impedance["measuring"] = False

    def scan_all_impedances(self):
        results = []
        with self._lock:
            if self.board is None:
                raise RuntimeError("Board is not connected")
            if not self.impedance.get("supported"):
                raise RuntimeError("Impedance measurement is only available for Cyton / Cyton Daisy")
            self.impedance["scan_in_progress"] = True
            self.impedance["message"] = "Scanning all channels..."

        try:
            for channel_number in range(1, len(self.eeg_channels) + 1):
                results.append(self.measure_impedance(channel_number))
        finally:
            with self._lock:
                self.impedance["scan_in_progress"] = False
                self.impedance["measuring"] = False
                self.impedance["message"] = "Full scan complete"
        return results

    def clear_impedance_results(self):
        with self._lock:
            if not self.impedance.get("results"):
                return self.impedance_snapshot()
            for item in self.impedance["results"]:
                item["impedance_kohm"] = None
                item["signal_rms_uv"] = None
                item["status"] = "unknown"
                item["status_label"] = "Not tested"
                item["last_measured_at"] = None
            self.impedance["message"] = "Impedance results cleared"
            self.impedance["last_updated"] = None
            return self.impedance_snapshot()

    def _impedance_command(self, channel_number: int, p_input: bool, n_input: bool):
        return f"z{channel_number}{1 if p_input else 0}{1 if n_input else 0}Z"

    def _estimate_tone_rms_uv(self, signal_uv: np.ndarray, sampling_rate: float, frequency_hz: float):
        n_samples = signal_uv.shape[0]
        if n_samples < 8:
            return 0.0

        centered = signal_uv - np.mean(signal_uv)
        window = np.hanning(n_samples)
        weighted = centered * window
        t = np.arange(n_samples) / sampling_rate
        sin_ref = np.sin(2 * np.pi * frequency_hz * t)
        cos_ref = np.cos(2 * np.pi * frequency_hz * t)
        scale = 2.0 / max(np.sum(window), 1e-9)
        sin_coeff = scale * np.dot(weighted, sin_ref)
        cos_coeff = scale * np.dot(weighted, cos_ref)
        amplitude_peak_uv = float(np.sqrt(sin_coeff**2 + cos_coeff**2))
        return amplitude_peak_uv / np.sqrt(2.0)

    def _estimate_impedance_kohm(self, tone_rms_uv: float):
        voltage_volts = max(tone_rms_uv, 0.0) * 1e-6
        impedance_ohms = voltage_volts / IMPEDANCE_CURRENT_AMPS
        return impedance_ohms / 1000.0

    def _impedance_status(self, impedance_kohm: float):
        if impedance_kohm < 0:
            return "unknown", "Not tested"
        if impedance_kohm <= 20:
            return "good", "Good"
        if impedance_kohm <= 50:
            return "fair", "Adjust"
        return "poor", "High"

    def snapshot(self, requested_window: float | None = None):
        with self._lock:
            if self.board is None:
                return {
                    "status": self.status,
                    "connected": False,
                    "error": self.last_error,
                    "calibration": self.calibration_snapshot(),
                    "impedance": self.impedance_snapshot(),
                }

            window_seconds = requested_window or self.window_seconds
            max_points = max(int(self.sampling_rate * window_seconds), 1)
            raw = self.board.get_current_board_data(max_points)
            eeg = raw[self.eeg_channels, :]

            if eeg.size == 0:
                return {
                    "status": self.status,
                    "connected": True,
                    "serial_port": self.serial_port,
                    "sampling_rate": self.sampling_rate,
                    "channels": self.channel_names,
                    "times": [],
                    "signals": [],
                    "spectra": [],
                    "band_powers": {},
                    "calibration": self.calibration_snapshot(),
                    "impedance": self.impedance_snapshot(),
                }

            times = (np.arange(eeg.shape[1]) / self.sampling_rate).tolist()
            signals = [self._downsample(channel) for channel in eeg]
            spectra, band_powers = self._spectral_summary(eeg)
            channel_stats = self._channel_stats(eeg)

            return {
                "status": self.status,
                "connected": True,
                "serial_port": self.serial_port,
                "board_id": self.board_id,
                "sampling_rate": self.sampling_rate,
                "channels": self.channel_names,
                "times": self._downsample(times),
                "signals": signals,
                "spectra": spectra,
                "band_powers": band_powers,
                "channel_stats": channel_stats,
                "points": eeg.shape[1],
                "calibration": self.calibration_snapshot(),
                "impedance": self.impedance_snapshot(),
            }

    def _downsample(self, values, limit: int = 600):
        arr = np.asarray(values)
        if arr.shape[-1] <= limit:
            return arr.tolist()
        indices = np.linspace(0, arr.shape[-1] - 1, limit).astype(int)
        return arr[..., indices].tolist()

    def _spectral_summary(self, eeg: np.ndarray):
        n_samples = eeg.shape[1]
        if n_samples < 8:
            return [], {}

        demeaned = eeg - np.mean(eeg, axis=1, keepdims=True)
        window = np.hanning(n_samples)
        spectrum = np.fft.rfft(demeaned * window, axis=1)
        freqs = np.fft.rfftfreq(n_samples, d=1.0 / self.sampling_rate)
        power = (np.abs(spectrum) ** 2) / np.sum(window**2)

        keep = freqs <= 60
        freqs = freqs[keep]
        power = power[:, keep]

        spectra = []
        for idx, name in enumerate(self.channel_names):
            if len(freqs) > 240:
                indices = np.linspace(0, len(freqs) - 1, 240).astype(int)
                display_freqs = freqs[indices]
                display_power = power[idx][indices]
            else:
                display_freqs = freqs
                display_power = power[idx]
            spectra.append(
                {
                    "channel": name,
                    "freqs": display_freqs.tolist(),
                    "power": display_power.tolist(),
                }
            )

        bands = {
            "delta": (1.0, 4.0),
            "theta": (4.0, 8.0),
            "alpha": (8.0, 13.0),
            "beta": (13.0, 30.0),
            "gamma": (30.0, 45.0),
        }
        band_powers = {}
        for band_name, (lo, hi) in bands.items():
            mask = (freqs >= lo) & (freqs < hi)
            if not np.any(mask):
                band_powers[band_name] = [0.0 for _ in self.channel_names]
            else:
                band_powers[band_name] = np.mean(power[:, mask], axis=1).round(4).tolist()
        return spectra, band_powers

    def _channel_stats(self, eeg: np.ndarray):
        stats = []
        for idx, name in enumerate(self.channel_names):
            ch = eeg[idx]
            stats.append(
                {
                    "channel": name,
                    "mean": round(float(np.mean(ch)), 3),
                    "std": round(float(np.std(ch)), 3),
                    "min": round(float(np.min(ch)), 3),
                    "max": round(float(np.max(ch)), 3),
                }
            )
        return stats


STATE = EEGServerState()


class EEGRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self._serve_file(STATIC_DIR / "index.html", "text/html; charset=utf-8")
            return
        if parsed.path == "/app.js":
            self._serve_file(STATIC_DIR / "app.js", "application/javascript; charset=utf-8")
            return
        if parsed.path == "/styles.css":
            self._serve_file(STATIC_DIR / "styles.css", "text/css; charset=utf-8")
            return
        if parsed.path == "/api/status":
            self._send_json(STATE.snapshot())
            return
        if parsed.path == "/api/stream":
            query = parse_qs(parsed.query)
            window = None
            if "window" in query:
                try:
                    window = float(query["window"][0])
                except ValueError:
                    window = None
            self._send_json(STATE.snapshot(window))
            return
        if parsed.path == "/api/impedance":
            self._send_json(STATE.impedance_snapshot())
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_POST(self):
        parsed = urlparse(self.path)
        body = self._read_json_body()

        if parsed.path == "/api/connect":
            board_id = int(body.get("board_id", BoardIds.CYTON_BOARD.value))
            serial_port = body.get("serial_port", "COM4")
            try:
                STATE.connect(board_id=board_id, serial_port=serial_port)
                self._send_json({"ok": True, "status": STATE.snapshot()})
            except Exception as exc:
                STATE.last_error = str(exc)
                STATE.status = "error"
                self._send_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return

        if parsed.path == "/api/disconnect":
            STATE.disconnect()
            self._send_json({"ok": True})
            return

        if parsed.path == "/api/calibrate":
            mode = body.get("mode", "normal")
            try:
                STATE.set_calibration_mode(mode)
                self._send_json({"ok": True, "status": STATE.snapshot()})
            except Exception as exc:
                STATE.last_error = str(exc)
                if STATE.board is not None:
                    STATE.status = "streaming"
                else:
                    STATE.status = "error"
                self._send_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return

        if parsed.path == "/api/impedance/test":
            try:
                channel_number = int(body.get("channel"))
                result = STATE.measure_impedance(channel_number)
                self._send_json({"ok": True, "result": result, "status": STATE.snapshot()})
            except Exception as exc:
                STATE.last_error = str(exc)
                self._send_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return

        if parsed.path == "/api/impedance/scan-all":
            try:
                results = STATE.scan_all_impedances()
                self._send_json({"ok": True, "results": results, "status": STATE.snapshot()})
            except Exception as exc:
                STATE.last_error = str(exc)
                self._send_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return

        if parsed.path == "/api/impedance/clear":
            try:
                snapshot = STATE.clear_impedance_results()
                self._send_json({"ok": True, "impedance": snapshot, "status": STATE.snapshot()})
            except Exception as exc:
                STATE.last_error = str(exc)
                self._send_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def log_message(self, fmt, *args):
        return

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if not length:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw)

    def _send_json(self, payload, status=HTTPStatus.OK):
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _serve_file(self, path: Path, content_type: str):
        if not path.exists():
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        content = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


def parse_args():
    parser = argparse.ArgumentParser(description="Local EEG dashboard for BrainFlow boards")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8765, type=int)
    parser.add_argument("--serial-port", default="COM4")
    parser.add_argument("--board-id", default=BoardIds.CYTON_BOARD.value, type=int)
    parser.add_argument("--auto-connect", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    STATE.serial_port = args.serial_port
    STATE.board_id = args.board_id

    print(
        f"Starting EEG dashboard with serial port {args.serial_port}, "
        f"board id {args.board_id}, host {args.host}, port {args.port}",
        flush=True,
    )

    if args.auto_connect:
        print(f"Attempting auto-connect on {args.serial_port}...", flush=True)
        try:
            STATE.connect(board_id=args.board_id, serial_port=args.serial_port)
        except Exception as exc:
            STATE.last_error = str(exc)
            STATE.status = "error"
            print(f"Auto-connect failed: {exc}", flush=True)

    try:
        server = ThreadingHTTPServer((args.host, args.port), EEGRequestHandler)
    except PermissionError as exc:
        raise SystemExit(
            f"Unable to bind HTTP server to http://{args.host}:{args.port}. "
            "Windows denied access to that port. "
            f"Try another port such as 8765: python app.py --serial-port {args.serial_port} --port 8765"
        ) from exc
    except OSError as exc:
        if exc.errno == getattr(socket, "EADDRINUSE", 10048):
            raise SystemExit(
                f"Port {args.port} is already in use on {args.host}. "
                f"Try another port such as 8765: python app.py --serial-port {args.serial_port} --port 8765"
            ) from exc
        raise
    print(f"EEG dashboard running at http://{args.host}:{args.port}", flush=True)
    print(f"Default serial port: {args.serial_port}", flush=True)
    print("Press Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        STATE.disconnect()


if __name__ == "__main__":
    main()
