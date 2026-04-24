const TWO_PI = Math.PI * 2;

export class StimulusEngine {
  constructor() {
    this.engineMode = "continuous-phase";
    this.outputMode = "binary";
    this.startTimeMs = null;
    this.frameIndex = 0;
  }

  setEngineMode(mode) {
    this.engineMode = mode;
  }

  setOutputMode(mode) {
    this.outputMode = mode;
  }

  reset() {
    this.startTimeMs = null;
    this.frameIndex = 0;
  }

  sampleTargets(timestamp, targets, estimatedRefreshHz, nominalRefreshHz) {
    if (this.startTimeMs === null) {
      this.startTimeMs = timestamp;
    }

    const t = (timestamp - this.startTimeMs) / 1000;
    const samplingHz = estimatedRefreshHz > 1 ? estimatedRefreshHz : nominalRefreshHz || 60;

    const sampled = targets.map((target) => {
      const frequencyHz = target.frequencyHz;
      const phaseOffset = target.phaseOffsetRad || 0;

      let intensity = 0;
      if (this.engineMode === "frame-locked") {
        intensity = this.sampleFrameLocked(this.frameIndex, samplingHz, frequencyHz, phaseOffset);
      } else {
        intensity = this.sampleContinuous(t, frequencyHz, phaseOffset);
      }

      return {
        ...target,
        intensity,
        active: intensity > 0.5
      };
    });

    this.frameIndex += 1;
    return sampled;
  }

  sampleFrameLocked(frameIndex, samplingHz, frequencyHz, phaseOffsetRad) {
    const halfCycleFrames = Math.max(1, Math.round(samplingHz / (2 * frequencyHz)));
    const periodFrames = halfCycleFrames * 2;
    const phaseFrames = Math.round((phaseOffsetRad / TWO_PI) * periodFrames);
    const position = (frameIndex + phaseFrames) % periodFrames;
    const binaryValue = position < halfCycleFrames ? 1 : 0;

    if (this.outputMode === "binary") {
      return binaryValue;
    }
    return binaryValue > 0 ? 1 : 0.1;
  }

  sampleContinuous(tSec, frequencyHz, phaseOffsetRad) {
    const phase = TWO_PI * frequencyHz * tSec + phaseOffsetRad;
    const sine = 0.5 + 0.5 * Math.sin(phase);

    if (this.outputMode === "binary") {
      return sine >= 0.5 ? 1 : 0;
    }
    return sine;
  }
}
