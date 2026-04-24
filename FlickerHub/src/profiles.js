export const BUILTIN_PROFILES = {
  baseline60: {
    id: "baseline60",
    name: "60 Hz Baseline",
    modeNote: "External monitor baseline validation",
    targetResolution: "3840x2160",
    nominalRefreshHz: 60,
    availableRefreshModes: [60, 50, 29.56],
    vrr: false,
    hdr: false,
    colorFormat: "RGB",
    bitDepth: 8,
    colorSpace: "SDR",
    recommendedEngineMode: "frame-locked",
    frequencyGroups: {
      recommended: [7.5, 10, 12, 15],
      experiment: [8, 12, 15, 20]
    },
    notes: "Stable integer-friendly baseline for SSVEP checks"
  },
  extended75: {
    id: "extended75",
    name: "75 Hz Extended",
    modeNote: "External monitor extended refresh mode",
    targetResolution: "3840x2160",
    nominalRefreshHz: 75,
    availableRefreshModes: [75, 71.93, 70.07, 60],
    vrr: false,
    hdr: false,
    colorFormat: "RGB",
    bitDepth: 8,
    colorSpace: "SDR",
    recommendedEngineMode: "frame-locked",
    frequencyGroups: {
      recommended: [7.5, 9.375, 12.5, 15],
      experiment: [8, 12, 15, 20]
    },
    notes: "Good compromise between smoothness and frame-lock simplicity"
  },
  high165: {
    id: "high165",
    name: "165 Hz High Refresh",
    modeNote: "Laptop internal panel high-performance mode",
    targetResolution: "2560x1600",
    nominalRefreshHz: 165.02,
    availableRefreshModes: [165.02],
    vrr: true,
    hdr: false,
    colorFormat: "RGB",
    bitDepth: 10,
    colorSpace: "SDR",
    recommendedEngineMode: "continuous-phase",
    frequencyGroups: {
      recommended: [11.79, 12.69, 13.75, 15],
      experiment: [8, 12, 15, 20]
    },
    notes: "Prefer continuous phase sampling for non-integer refresh"
  },
  quest120: {
    id: "quest120",
    name: "Quest 120 Hz Target",
    modeNote: "Future XR target profile emulation",
    targetResolution: "Unknown (HMD runtime-dependent)",
    nominalRefreshHz: 120,
    availableRefreshModes: [120, 90],
    vrr: false,
    hdr: false,
    colorFormat: "RGB",
    bitDepth: 8,
    colorSpace: "SDR",
    recommendedEngineMode: "frame-locked",
    frequencyGroups: {
      recommended: [8, 12, 15, 20],
      experiment: [8, 12, 15, 20]
    },
    notes: "Used for cross-device logic parity before Quest integration"
  }
};

export const DEFAULT_PROFILE_ID = "baseline60";

export function getProfileList() {
  return Object.values(BUILTIN_PROFILES);
}

export function validateFrequencyGroup(group) {
  if (!Array.isArray(group)) {
    return false;
  }
  if (group.length !== 4) {
    return false;
  }
  return group.every((f) => Number.isFinite(f) && f > 0);
}

export function createCustomProfile(input) {
  const recommended = input.recommendedFrequencies;
  const experiment = input.experimentFrequencies;

  if (!validateFrequencyGroup(recommended) || !validateFrequencyGroup(experiment)) {
    throw new Error("Custom profile requires 4 positive frequencies for each group");
  }

  const nominal = Number(input.nominalRefreshHz);
  if (!Number.isFinite(nominal) || nominal <= 0) {
    throw new Error("nominalRefreshHz must be a positive number");
  }

  return {
    id: input.id,
    name: input.name,
    modeNote: input.modeNote || "User-defined profile",
    targetResolution: input.targetResolution || "Unknown",
    nominalRefreshHz: nominal,
    availableRefreshModes: [nominal],
    vrr: Boolean(input.vrr),
    hdr: Boolean(input.hdr),
    colorFormat: input.colorFormat || "RGB",
    bitDepth: Number(input.bitDepth) || 8,
    colorSpace: input.colorSpace || "SDR",
    recommendedEngineMode: input.recommendedEngineMode || "continuous-phase",
    frequencyGroups: {
      recommended,
      experiment
    },
    notes: input.notes || "User profile"
  };
}
