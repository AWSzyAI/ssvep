import argparse
import json
import time
from pathlib import Path

import numpy as np
from brainflow.board_shim import BoardIds, BoardShim, BrainFlowInputParams


DEFAULT_FREQS = [8.0, 12.0, 15.0, 20.0]
DEFAULT_LABELS = ["8Hz", "12Hz", "15Hz", "20Hz", "none"]
CHANNEL_PRESETS = {
    "posterior2": [7, 8],
    "posterior4": [5, 6, 7, 8],
    "posterior6": [3, 4, 5, 6, 7, 8],
    "all": [],
}


def parse_float_list(raw: str) -> list[float]:
    return [float(x.strip()) for x in raw.split(",") if x.strip()]


def parse_int_list(raw: str) -> list[int]:
    return [int(x.strip()) for x in raw.split(",") if x.strip()]


def ensure_parent(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)


def select_channel_numbers(args_channels: str | None, preset_name: str, eeg_count: int) -> list[int]:
    if args_channels:
        channels = parse_int_list(args_channels)
    else:
        preset = CHANNEL_PRESETS[preset_name]
        channels = preset if preset else list(range(1, eeg_count + 1))
    invalid = [ch for ch in channels if ch < 1 or ch > eeg_count]
    if invalid:
        raise ValueError(f"Invalid channel numbers: {invalid}; board exposes 1..{eeg_count}")
    return channels


def wait_countdown(seconds: float):
    whole = int(np.ceil(max(seconds, 0.0)))
    for remain in range(whole, 0, -1):
        print(f"  ...{remain}s", flush=True)
        time.sleep(1.0)


def split_windows(signal: np.ndarray, window_samples: int, step_samples: int) -> np.ndarray:
    n_channels, n_total = signal.shape
    if n_total < window_samples:
        return np.zeros((0, n_channels, window_samples), dtype=np.float64)
    windows = []
    for start in range(0, n_total - window_samples + 1, step_samples):
        windows.append(signal[:, start : start + window_samples])
    return np.asarray(windows, dtype=np.float64)


def fft_feature_windows(windows: np.ndarray, sampling_rate: float, low_hz: float, high_hz: float) -> tuple[np.ndarray, np.ndarray]:
    if windows.shape[0] == 0:
        return np.zeros((0, 1), dtype=np.float64), np.zeros((0,), dtype=np.float64)
    n_windows, n_channels, n_samples = windows.shape
    centered = windows - np.mean(windows, axis=2, keepdims=True)
    spectrum = np.fft.rfft(centered, axis=2)
    freqs = np.fft.rfftfreq(n_samples, d=1.0 / sampling_rate)
    keep = (freqs >= low_hz) & (freqs <= high_hz)
    kept_freqs = freqs[keep]
    power = np.abs(spectrum[:, :, keep]) ** 2
    log_power = np.log1p(power)
    features = log_power.reshape(n_windows, n_channels * kept_freqs.shape[0])
    return features.astype(np.float64), kept_freqs.astype(np.float64)


class StandardScaler:
    def __init__(self):
        self.mean = None
        self.std = None

    def fit(self, x: np.ndarray):
        self.mean = np.mean(x, axis=0)
        self.std = np.std(x, axis=0)
        self.std[self.std < 1e-8] = 1.0
        return self

    def transform(self, x: np.ndarray) -> np.ndarray:
        return (x - self.mean) / self.std

    def fit_transform(self, x: np.ndarray) -> np.ndarray:
        self.fit(x)
        return self.transform(x)


class NumpyMLP:
    def __init__(self, input_dim: int, hidden_dim: int, output_dim: int, seed: int = 42):
        rng = np.random.default_rng(seed)
        self.w1 = rng.normal(0, np.sqrt(2.0 / input_dim), size=(input_dim, hidden_dim))
        self.b1 = np.zeros((1, hidden_dim))
        self.w2 = rng.normal(0, np.sqrt(2.0 / hidden_dim), size=(hidden_dim, output_dim))
        self.b2 = np.zeros((1, output_dim))

    @staticmethod
    def _relu(x: np.ndarray) -> np.ndarray:
        return np.maximum(0.0, x)

    @staticmethod
    def _softmax(x: np.ndarray) -> np.ndarray:
        z = x - np.max(x, axis=1, keepdims=True)
        exp_z = np.exp(z)
        return exp_z / np.sum(exp_z, axis=1, keepdims=True)

    def predict_proba(self, x: np.ndarray) -> np.ndarray:
        z1 = x @ self.w1 + self.b1
        a1 = self._relu(z1)
        logits = a1 @ self.w2 + self.b2
        return self._softmax(logits)

    def predict(self, x: np.ndarray) -> np.ndarray:
        return np.argmax(self.predict_proba(x), axis=1)

    def fit(
        self,
        x_train: np.ndarray,
        y_train: np.ndarray,
        x_val: np.ndarray,
        y_val: np.ndarray,
        epochs: int,
        learning_rate: float,
        batch_size: int,
    ):
        n_samples = x_train.shape[0]
        n_classes = self.b2.shape[1]
        best_val_acc = 0.0
        best_state = None
        rng = np.random.default_rng(123)

        for epoch in range(1, epochs + 1):
            indices = rng.permutation(n_samples)
            x_shuf = x_train[indices]
            y_shuf = y_train[indices]

            for start in range(0, n_samples, batch_size):
                end = min(start + batch_size, n_samples)
                xb = x_shuf[start:end]
                yb = y_shuf[start:end]
                m = xb.shape[0]

                z1 = xb @ self.w1 + self.b1
                a1 = self._relu(z1)
                logits = a1 @ self.w2 + self.b2
                probs = self._softmax(logits)

                target = np.zeros((m, n_classes), dtype=np.float64)
                target[np.arange(m), yb] = 1.0

                dlogits = (probs - target) / m
                dw2 = a1.T @ dlogits
                db2 = np.sum(dlogits, axis=0, keepdims=True)
                da1 = dlogits @ self.w2.T
                dz1 = da1 * (z1 > 0)
                dw1 = xb.T @ dz1
                db1 = np.sum(dz1, axis=0, keepdims=True)

                self.w2 -= learning_rate * dw2
                self.b2 -= learning_rate * db2
                self.w1 -= learning_rate * dw1
                self.b1 -= learning_rate * db1

            train_acc = np.mean(self.predict(x_train) == y_train)
            val_acc = np.mean(self.predict(x_val) == y_val)
            if val_acc >= best_val_acc:
                best_val_acc = val_acc
                best_state = (self.w1.copy(), self.b1.copy(), self.w2.copy(), self.b2.copy())
            if epoch == 1 or epoch % 10 == 0 or epoch == epochs:
                print(f"[epoch {epoch:03d}] train_acc={train_acc:.4f} val_acc={val_acc:.4f}", flush=True)

        if best_state is not None:
            self.w1, self.b1, self.w2, self.b2 = best_state


def train_val_split(x: np.ndarray, y: np.ndarray, val_ratio: float, seed: int = 42):
    rng = np.random.default_rng(seed)
    n = x.shape[0]
    idx = rng.permutation(n)
    n_val = max(1, int(round(n * val_ratio)))
    val_idx = idx[:n_val]
    train_idx = idx[n_val:]
    if train_idx.shape[0] == 0:
        train_idx = val_idx
    return x[train_idx], y[train_idx], x[val_idx], y[val_idx]


def collect_dataset(args):
    freqs = parse_float_list(args.target_freqs)
    labels = [f"{f:g}Hz" for f in freqs] + ["none"]
    expected = len(freqs) + 1
    if args.class_order:
        labels = [x.strip() for x in args.class_order.split(",") if x.strip()]
    if len(labels) != expected:
        raise ValueError(f"class labels must contain {expected} entries")

    params = BrainFlowInputParams()
    params.serial_port = args.serial_port
    board = BoardShim(args.board_id, params)

    try:
        board.prepare_session()
        board.start_stream(45000)
        sampling_rate = BoardShim.get_sampling_rate(args.board_id)
        eeg_channels = BoardShim.get_eeg_channels(args.board_id)
        channel_numbers = select_channel_numbers(args.channels, args.channel_preset, len(eeg_channels))
        channel_indices = [c - 1 for c in channel_numbers]

        window_samples = int(round(args.window_sec * sampling_rate))
        step_samples = int(round(args.step_sec * sampling_rate))
        trial_samples = int(round(args.trial_sec * sampling_rate))
        if window_samples < 32:
            raise ValueError("window-sec too small, need >= 32 samples")
        if step_samples < 1:
            raise ValueError("step-sec too small")
        if trial_samples < window_samples:
            raise ValueError("trial-sec must be >= window-sec")

        print("=== SSVEP dataset collection started ===", flush=True)
        print(
            f"serial={args.serial_port} board={args.board_id} fs={sampling_rate}Hz channels={channel_numbers}",
            flush=True,
        )
        print(
            f"classes={labels} repeats={args.repeats} trial={args.trial_sec:.1f}s window={args.window_sec:.1f}s step={args.step_sec:.1f}s",
            flush=True,
        )
        print("Please display corresponding flicker frequency during each trial.", flush=True)

        all_windows = []
        all_labels = []
        trial_meta = []

        for repeat_idx in range(args.repeats):
            for class_idx, class_name in enumerate(labels):
                print(f"\n[Repeat {repeat_idx + 1}/{args.repeats}] Class: {class_name}", flush=True)
                input("Press Enter to start trial...")

                board.get_board_data()
                if args.prepare_sec > 0:
                    print(f"Prepare {args.prepare_sec:.1f}s before collecting...", flush=True)
                    wait_countdown(args.prepare_sec)

                print(f"Collecting {args.trial_sec:.1f}s EEG...", flush=True)
                wait_countdown(args.trial_sec)
                raw = board.get_current_board_data(trial_samples)
                eeg = raw[eeg_channels, :]
                if eeg.shape[1] < trial_samples:
                    print("Not enough samples in this trial, skipping.", flush=True)
                    continue

                selected = eeg[channel_indices, :]
                windows = split_windows(selected, window_samples=window_samples, step_samples=step_samples)
                if windows.shape[0] == 0:
                    print("No windows generated from this trial, skipping.", flush=True)
                    continue

                all_windows.append(windows)
                all_labels.append(np.full((windows.shape[0],), class_idx, dtype=np.int64))
                trial_meta.append(
                    {
                        "repeat": repeat_idx + 1,
                        "class_name": class_name,
                        "class_id": class_idx,
                        "windows": int(windows.shape[0]),
                    }
                )
                print(f"Saved {windows.shape[0]} windows for class '{class_name}'.", flush=True)
                if args.rest_sec > 0:
                    print(f"Rest {args.rest_sec:.1f}s...", flush=True)
                    wait_countdown(args.rest_sec)

        if not all_windows:
            raise RuntimeError("No data collected; dataset is empty")

        x_windows = np.concatenate(all_windows, axis=0)
        y = np.concatenate(all_labels, axis=0)

        out_path = Path(args.dataset_path).resolve()
        ensure_parent(out_path)
        np.savez_compressed(
            out_path,
            x_windows=x_windows,
            y=y,
            labels=np.asarray(labels, dtype=object),
            sampling_rate=np.asarray([sampling_rate], dtype=np.float64),
            channel_numbers=np.asarray(channel_numbers, dtype=np.int64),
            window_sec=np.asarray([args.window_sec], dtype=np.float64),
            step_sec=np.asarray([args.step_sec], dtype=np.float64),
            trial_meta=np.asarray([json.dumps(trial_meta, ensure_ascii=False)], dtype=object),
        )
        print(f"\nDataset saved to: {out_path}", flush=True)
        print(f"Total windows: {x_windows.shape[0]}, each shape: {x_windows.shape[1:]} (channels, samples)", flush=True)
    finally:
        try:
            board.stop_stream()
        except Exception:
            pass
        try:
            board.release_session()
        except Exception:
            pass


def train_model(args):
    data = np.load(Path(args.dataset_path).resolve(), allow_pickle=True)
    x_windows = data["x_windows"].astype(np.float64)
    y = data["y"].astype(np.int64)
    labels = list(data["labels"])
    sampling_rate = float(data["sampling_rate"][0])

    features, fft_freqs = fft_feature_windows(
        x_windows,
        sampling_rate=sampling_rate,
        low_hz=args.low_hz,
        high_hz=args.high_hz,
    )

    x_train, y_train, x_val, y_val = train_val_split(features, y, val_ratio=args.val_ratio, seed=args.seed)
    scaler = StandardScaler()
    x_train_std = scaler.fit_transform(x_train)
    x_val_std = scaler.transform(x_val)

    model = NumpyMLP(
        input_dim=x_train_std.shape[1],
        hidden_dim=args.hidden_dim,
        output_dim=len(labels),
        seed=args.seed,
    )
    model.fit(
        x_train_std,
        y_train,
        x_val_std,
        y_val,
        epochs=args.epochs,
        learning_rate=args.lr,
        batch_size=args.batch_size,
    )

    val_pred = model.predict(x_val_std)
    val_acc = float(np.mean(val_pred == y_val))
    print(f"Validation accuracy: {val_acc:.4f}", flush=True)

    out_path = Path(args.model_path).resolve()
    ensure_parent(out_path)
    np.savez_compressed(
        out_path,
        w1=model.w1,
        b1=model.b1,
        w2=model.w2,
        b2=model.b2,
        scaler_mean=scaler.mean,
        scaler_std=scaler.std,
        labels=np.asarray(labels, dtype=object),
        fft_freqs=fft_freqs,
        low_hz=np.asarray([args.low_hz], dtype=np.float64),
        high_hz=np.asarray([args.high_hz], dtype=np.float64),
        sampling_rate=np.asarray([sampling_rate], dtype=np.float64),
        metrics=np.asarray([json.dumps({"val_accuracy": val_acc})], dtype=object),
    )
    print(f"Model saved to: {out_path}", flush=True)


def load_model(model_path: str):
    data = np.load(Path(model_path).resolve(), allow_pickle=True)
    labels = list(data["labels"])
    model = NumpyMLP(
        input_dim=int(data["w1"].shape[0]),
        hidden_dim=int(data["w1"].shape[1]),
        output_dim=int(data["w2"].shape[1]),
    )
    model.w1 = data["w1"]
    model.b1 = data["b1"]
    model.w2 = data["w2"]
    model.b2 = data["b2"]
    scaler_mean = data["scaler_mean"]
    scaler_std = data["scaler_std"]
    low_hz = float(data["low_hz"][0])
    high_hz = float(data["high_hz"][0])
    trained_fs = float(data["sampling_rate"][0])
    return model, scaler_mean, scaler_std, labels, low_hz, high_hz, trained_fs


def run_online(args):
    model, scaler_mean, scaler_std, labels, low_hz, high_hz, trained_fs = load_model(args.model_path)

    params = BrainFlowInputParams()
    params.serial_port = args.serial_port
    board = BoardShim(args.board_id, params)
    try:
        board.prepare_session()
        board.start_stream(45000)
        sampling_rate = BoardShim.get_sampling_rate(args.board_id)
        eeg_channels = BoardShim.get_eeg_channels(args.board_id)
        channel_numbers = select_channel_numbers(args.channels, args.channel_preset, len(eeg_channels))
        channel_indices = [c - 1 for c in channel_numbers]

        if abs(sampling_rate - trained_fs) > 1e-6:
            raise RuntimeError(
                f"Model sampling rate is {trained_fs}Hz but current board is {sampling_rate}Hz. "
                "Please recollect/train with the same board settings."
            )

        window_samples = int(round(args.window_sec * sampling_rate))
        if window_samples < 32:
            raise ValueError("window-sec too small")

        print("=== Online classification started ===", flush=True)
        print(
            f"serial={args.serial_port} fs={sampling_rate}Hz channels={channel_numbers} window={args.window_sec:.2f}s step={args.predict_every_sec:.2f}s",
            flush=True,
        )
        print(f"labels={labels}", flush=True)
        print("Press Ctrl+C to stop.", flush=True)

        while True:
            raw = board.get_current_board_data(window_samples)
            eeg = raw[eeg_channels, :]
            if eeg.shape[1] < window_samples:
                time.sleep(min(args.predict_every_sec, 0.1))
                continue

            selected = eeg[channel_indices, :]
            windows = selected[np.newaxis, :, :]
            feat, _ = fft_feature_windows(windows, sampling_rate=sampling_rate, low_hz=low_hz, high_hz=high_hz)
            feat_std = (feat - scaler_mean) / scaler_std
            probs = model.predict_proba(feat_std)[0]
            pred = int(np.argmax(probs))
            confidence = float(np.max(probs))
            timestamp = time.strftime("%H:%M:%S")
            score_text = " | ".join(f"{labels[i]}={probs[i]:.3f}" for i in range(len(labels)))
            print(f"[{timestamp}] pred={labels[pred]} confidence={confidence:.3f} | {score_text}", flush=True)
            time.sleep(args.predict_every_sec)
    finally:
        try:
            board.stop_stream()
        except Exception:
            pass
        try:
            board.release_session()
        except Exception:
            pass


def build_args():
    parser = argparse.ArgumentParser(
        description="BrainFlow SSVEP: collect 4 flickers + no-flicker, auto-split windows, FFT features, train MLP, and online classify per N seconds."
    )
    parser.add_argument("--mode", choices=["collect", "train", "online", "all"], default="all")
    parser.add_argument("--serial-port", default="COM4")
    parser.add_argument("--board-id", default=BoardIds.CYTON_BOARD.value, type=int)
    parser.add_argument("--channel-preset", choices=sorted(CHANNEL_PRESETS.keys()), default="posterior4")
    parser.add_argument("--channels", default=None, help="Override preset, e.g. 5,6,7,8")
    parser.add_argument("--target-freqs", default="8,12,15,20", help="Only used for collect labels")
    parser.add_argument("--class-order", default=None, help="Custom labels, e.g. 8Hz,12Hz,15Hz,20Hz,none")

    parser.add_argument("--dataset-path", default="artifacts/ssvep_dataset.npz")
    parser.add_argument("--model-path", default="artifacts/ssvep_mlp_model.npz")

    parser.add_argument("--repeats", default=10, type=int, help="Trials per class for collection")
    parser.add_argument("--prepare-sec", default=2.0, type=float)
    parser.add_argument("--trial-sec", default=6.0, type=float)
    parser.add_argument("--rest-sec", default=2.0, type=float)
    parser.add_argument("--window-sec", default=2.0, type=float, help="Window length for split and online inference")
    parser.add_argument("--step-sec", default=0.5, type=float, help="Window step for split")

    parser.add_argument("--low-hz", default=6.0, type=float)
    parser.add_argument("--high-hz", default=45.0, type=float)
    parser.add_argument("--epochs", default=120, type=int)
    parser.add_argument("--lr", default=1e-3, type=float)
    parser.add_argument("--batch-size", default=64, type=int)
    parser.add_argument("--hidden-dim", default=128, type=int)
    parser.add_argument("--val-ratio", default=0.2, type=float)
    parser.add_argument("--seed", default=42, type=int)

    parser.add_argument("--predict-every-sec", default=0.5, type=float, help="Online classification interval")
    return parser.parse_args()


def main():
    args = build_args()
    if args.mode in ("collect", "all"):
        collect_dataset(args)
    if args.mode in ("train", "all"):
        train_model(args)
    if args.mode == "online":
        run_online(args)
    if args.mode == "all":
        run_online(args)


if __name__ == "__main__":
    main()
