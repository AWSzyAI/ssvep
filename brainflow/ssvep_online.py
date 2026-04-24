import argparse
import signal
import sys
import time
from collections import Counter, deque

import numpy as np
from brainflow.board_shim import BoardIds, BoardShim, BrainFlowInputParams


DEFAULT_FREQS = [8.0, 12.0, 15.0, 20.0]
CHANNEL_PRESETS = {
    "posterior2": [7, 8],
    "posterior4": [5, 6, 7, 8],
    "posterior6": [3, 4, 5, 6, 7, 8],
    "all": [],
}


def parse_float_list(value: str) -> list[float]:
    return [float(item.strip()) for item in value.split(",") if item.strip()]


def parse_int_list(value: str) -> list[int]:
    return [int(item.strip()) for item in value.split(",") if item.strip()]


def build_reference(freq: float, sampling_rate: float, n_samples: int, harmonics: int) -> np.ndarray:
    t = np.arange(n_samples) / sampling_rate
    refs = []
    for harmonic in range(1, harmonics + 1):
        refs.append(np.sin(2 * np.pi * harmonic * freq * t))
        refs.append(np.cos(2 * np.pi * harmonic * freq * t))
    return np.asarray(refs, dtype=np.float64)


def canonical_correlation_score(eeg: np.ndarray, ref: np.ndarray) -> float:
    x = eeg.T
    y = ref.T
    x = x - np.mean(x, axis=0, keepdims=True)
    y = y - np.mean(y, axis=0, keepdims=True)

    s_xx = np.cov(x, rowvar=False) + 1e-6 * np.eye(x.shape[1])
    s_yy = np.cov(y, rowvar=False) + 1e-6 * np.eye(y.shape[1])
    s_xy = np.cov(x, y, rowvar=False)[: x.shape[1], x.shape[1] :]
    s_yx = s_xy.T

    matrix = np.linalg.pinv(s_xx) @ s_xy @ np.linalg.pinv(s_yy) @ s_yx
    eigenvalues = np.real(np.linalg.eigvals(matrix))
    max_eigenvalue = float(np.max(np.clip(eigenvalues, 0.0, None)))
    return float(np.sqrt(max_eigenvalue))


def fft_bandpass_notch(
    eeg: np.ndarray,
    sampling_rate: float,
    low_hz: float,
    high_hz: float,
    notch_hz: float | None,
    notch_width_hz: float,
) -> np.ndarray:
    centered = eeg - np.mean(eeg, axis=1, keepdims=True)
    spectrum = np.fft.rfft(centered, axis=1)
    freqs = np.fft.rfftfreq(centered.shape[1], d=1.0 / sampling_rate)

    keep = (freqs >= low_hz) & (freqs <= high_hz)
    if notch_hz and notch_hz > 0:
        keep &= np.abs(freqs - notch_hz) > notch_width_hz

    filtered = np.zeros_like(spectrum)
    filtered[:, keep] = spectrum[:, keep]
    return np.fft.irfft(filtered, n=centered.shape[1], axis=1)


def select_channel_numbers(args_channels: str | None, preset_name: str, eeg_count: int) -> list[int]:
    if args_channels:
        return parse_int_list(args_channels)
    preset = CHANNEL_PRESETS[preset_name]
    return preset if preset else list(range(1, eeg_count + 1))


def smooth_prediction(history: deque[float], fallback: float) -> float:
    if not history:
        return fallback
    return Counter(history).most_common(1)[0][0]


def format_scores(freqs: list[float], scores: list[float]) -> str:
    return " | ".join(f"{freq:>5.2f}Hz={score:.3f}" for freq, score in zip(freqs, scores))


def parse_args():
    parser = argparse.ArgumentParser(description="Minimal online SSVEP CCA decoder for OpenBCI via BrainFlow")
    parser.add_argument("--serial-port", default="COM4")
    parser.add_argument("--board-id", default=BoardIds.CYTON_BOARD.value, type=int)
    parser.add_argument("--window-sec", default=2.0, type=float)
    parser.add_argument("--step-sec", default=0.5, type=float)
    parser.add_argument("--harmonics", default=2, type=int)
    parser.add_argument("--target-freqs", default="8,12,15,20")
    parser.add_argument("--channel-preset", choices=sorted(CHANNEL_PRESETS.keys()), default="posterior4")
    parser.add_argument("--channels", default=None, help="Override preset, e.g. 5,6,7,8")
    parser.add_argument("--low-hz", default=6.0, type=float)
    parser.add_argument("--high-hz", default=40.0, type=float)
    parser.add_argument("--line-noise-hz", default=50.0, type=float)
    parser.add_argument("--notch-width-hz", default=1.0, type=float)
    parser.add_argument("--history-size", default=3, type=int)
    parser.add_argument("--confidence-threshold", default=0.02, type=float)
    return parser.parse_args()


def main():
    args = parse_args()
    target_freqs = parse_float_list(args.target_freqs)

    params = BrainFlowInputParams()
    params.serial_port = args.serial_port

    board = BoardShim(args.board_id, params)
    should_stop = False

    def handle_stop(_sig, _frame):
        nonlocal should_stop
        should_stop = True

    signal.signal(signal.SIGINT, handle_stop)
    signal.signal(signal.SIGTERM, handle_stop)

    try:
        board.prepare_session()
        board.start_stream(45000)

        sampling_rate = BoardShim.get_sampling_rate(args.board_id)
        eeg_channels = BoardShim.get_eeg_channels(args.board_id)
        channel_numbers = select_channel_numbers(args.channels, args.channel_preset, len(eeg_channels))
        channel_indices = [channel_number - 1 for channel_number in channel_numbers]

        invalid = [channel for channel in channel_numbers if channel < 1 or channel > len(eeg_channels)]
        if invalid:
            raise ValueError(f"Invalid channel numbers {invalid}; board exposes 1..{len(eeg_channels)}")

        n_samples = int(round(args.window_sec * sampling_rate))
        if n_samples < 32:
            raise ValueError("window-sec is too small; need at least 32 samples")

        references = {
            freq: build_reference(freq, sampling_rate, n_samples, args.harmonics)
            for freq in target_freqs
        }
        history = deque(maxlen=max(args.history_size, 1))

        print(
            f"Streaming from {args.serial_port} | board_id={args.board_id} | fs={sampling_rate} Hz",
            flush=True,
        )
        print(
            f"Channels={channel_numbers} | preset={args.channel_preset} | target_freqs={target_freqs}",
            flush=True,
        )
        print(
            f"Window={args.window_sec:.2f}s | step={args.step_sec:.2f}s | band={args.low_hz:.1f}-{args.high_hz:.1f} Hz | notch={args.line_noise_hz:.1f} Hz",
            flush=True,
        )
        print("Press Ctrl+C to stop.", flush=True)

        while not should_stop:
            data = board.get_current_board_data(n_samples)
            eeg = data[eeg_channels, :]
            if eeg.shape[1] < n_samples:
                time.sleep(min(args.step_sec, 0.1))
                continue

            selected = eeg[channel_indices, :]
            filtered = fft_bandpass_notch(
                selected,
                sampling_rate=sampling_rate,
                low_hz=args.low_hz,
                high_hz=args.high_hz,
                notch_hz=args.line_noise_hz,
                notch_width_hz=args.notch_width_hz,
            )

            scores = [canonical_correlation_score(filtered, references[freq]) for freq in target_freqs]
            best_index = int(np.argmax(scores))
            best_freq = target_freqs[best_index]
            sorted_scores = sorted(scores, reverse=True)
            margin = sorted_scores[0] - sorted_scores[1] if len(sorted_scores) > 1 else sorted_scores[0]

            history.append(best_freq)
            smoothed = smooth_prediction(history, best_freq)
            confident = margin >= args.confidence_threshold
            label = smoothed if confident else None

            timestamp = time.strftime("%H:%M:%S")
            decision = f"{label:.2f}Hz" if label is not None else "uncertain"
            print(
                f"[{timestamp}] raw={best_freq:.2f}Hz smooth={smoothed:.2f}Hz output={decision} margin={margin:.3f} | {format_scores(target_freqs, scores)}",
                flush=True,
            )
            time.sleep(args.step_sec)

    finally:
        try:
            board.stop_stream()
        except Exception:
            pass
        try:
            board.release_session()
        except Exception:
            pass


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ssvep_online failed: {exc}", file=sys.stderr, flush=True)
        raise
