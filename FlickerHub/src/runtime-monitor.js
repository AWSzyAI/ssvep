export class RuntimeMonitor {
  constructor() {
    this.lastTimestamp = null;
    this.intervals = [];
    this.maxSamples = 600;
    this.estimatedRefreshHz = 0;
    this.droppedFrameCount = 0;
    this.totalFrameCount = 0;
    this.avgFrameMs = 0;
    this.minFrameMs = 0;
    this.maxFrameMs = 0;
  }

  update(timestamp) {
    if (this.lastTimestamp === null) {
      this.lastTimestamp = timestamp;
      return;
    }

    const delta = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    if (!Number.isFinite(delta) || delta <= 0) {
      return;
    }

    this.intervals.push(delta);
    if (this.intervals.length > this.maxSamples) {
      this.intervals.shift();
    }

    this.totalFrameCount += 1;

    const sum = this.intervals.reduce((acc, value) => acc + value, 0);
    this.avgFrameMs = sum / this.intervals.length;

    const sorted = [...this.intervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || this.avgFrameMs;

    this.minFrameMs = sorted[0] || this.avgFrameMs;
    this.maxFrameMs = sorted[sorted.length - 1] || this.avgFrameMs;

    const instantHz = 1000 / median;
    if (!Number.isFinite(this.estimatedRefreshHz) || this.estimatedRefreshHz <= 0) {
      this.estimatedRefreshHz = instantHz;
    } else {
      this.estimatedRefreshHz = this.estimatedRefreshHz * 0.92 + instantHz * 0.08;
    }

    const expectedFrameMs = this.estimatedRefreshHz > 0 ? 1000 / this.estimatedRefreshHz : this.avgFrameMs;
    if (delta > expectedFrameMs * 1.5) {
      this.droppedFrameCount += 1;
    }
  }

  getSummary() {
    const dropRate = this.totalFrameCount > 0 ? this.droppedFrameCount / this.totalFrameCount : 0;
    return {
      estimatedRefreshHz: this.estimatedRefreshHz,
      avgFrameMs: this.avgFrameMs,
      minFrameMs: this.minFrameMs,
      maxFrameMs: this.maxFrameMs,
      droppedFrameCount: this.droppedFrameCount,
      totalFrameCount: this.totalFrameCount,
      dropRate
    };
  }
}
