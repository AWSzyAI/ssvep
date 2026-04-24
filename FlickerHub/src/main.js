import { DEFAULT_PROFILE_ID, createCustomProfile, getProfileList } from "./profiles.js";
import { FrequencyManager } from "./frequency-manager.js";
import { RuntimeMonitor } from "./runtime-monitor.js";
import { StimulusEngine } from "./stimulus-engine.js";
import { StimulusRenderer } from "./renderer.js";
import { installExternalApi } from "./external-api.js";

const state = {
  profiles: new Map(),
  selectedProfileId: DEFAULT_PROFILE_ID,
  frequencyGroupKey: "recommended",
  engineMode: "frame-locked",
  outputMode: "binary",
  shape: "circle",
  running: true,
  customTargetOverrides: null,
  decoderResult: null,
  yoloDetections: []
};

for (const profile of getProfileList()) {
  state.profiles.set(profile.id, profile);
}

const profileSelect = document.querySelector("#profile-select");
const freqGroupSelect = document.querySelector("#frequency-group-select");
const engineModeSelect = document.querySelector("#engine-mode-select");
const outputModeSelect = document.querySelector("#output-mode-select");
const shapeSelect = document.querySelector("#shape-select");
const fullscreenButton = document.querySelector("#fullscreen-button");
const toggleRunButton = document.querySelector("#toggle-run-button");
const observedValues = document.querySelector("#observed-values");
const profileValues = document.querySelector("#profile-values");
const stimulusValues = document.querySelector("#stimulus-values");
const eventLog = document.querySelector("#event-log");
const stage = document.querySelector("#stimulus-stage");

const customName = document.querySelector("#custom-name");
const customResolution = document.querySelector("#custom-resolution");
const customRefresh = document.querySelector("#custom-refresh");
const customRecommended = document.querySelector("#custom-recommended");
const customExperiment = document.querySelector("#custom-experiment");
const addProfileButton = document.querySelector("#add-profile-button");

const frequencyManager = new FrequencyManager(state.profiles.get(state.selectedProfileId), state.frequencyGroupKey);
const runtimeMonitor = new RuntimeMonitor();
const engine = new StimulusEngine();
const renderer = new StimulusRenderer(stage);

function parseFrequencyList(value) {
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function formatHz(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return `${value.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")} Hz`;
}

function addLog(message) {
  const time = new Date().toLocaleTimeString();
  const li = document.createElement("li");
  li.textContent = `[${time}] ${message}`;
  eventLog.prepend(li);
  while (eventLog.children.length > 60) {
    eventLog.removeChild(eventLog.lastChild);
  }
}

function setKvList(listEl, rows) {
  listEl.innerHTML = "";
  for (const [key, value] of rows) {
    const li = document.createElement("li");
    const keySpan = document.createElement("span");
    const valueSpan = document.createElement("span");
    keySpan.className = "key";
    keySpan.textContent = key;
    valueSpan.textContent = value;
    li.appendChild(keySpan);
    li.appendChild(valueSpan);
    listEl.appendChild(li);
  }
}

function getCurrentProfile() {
  return state.profiles.get(state.selectedProfileId);
}

function buildTargets() {
  const frequencies = frequencyManager.getCurrentFrequencies();
  if (state.customTargetOverrides && state.customTargetOverrides.length === 4) {
    return state.customTargetOverrides.map((target, index) => ({
      ...frequencies[index],
      ...target,
      slotId: index,
      frequencyHz: target.frequencyHz || frequencies[index].frequencyHz,
      label: target.label || frequencies[index].label,
      colorClass: frequencies[index].colorClass
    }));
  }

  return frequencies.map((item, index) => ({
    ...item,
    id: `target-${index + 1}`,
    shape: state.shape,
    size: 1,
    visible: true,
    position: null,
    phaseOffsetRad: 0
  }));
}

function repopulateProfiles() {
  profileSelect.innerHTML = "";
  for (const profile of state.profiles.values()) {
    const opt = document.createElement("option");
    opt.value = profile.id;
    opt.textContent = `${profile.name} (${profile.nominalRefreshHz} Hz)`;
    profileSelect.appendChild(opt);
  }
  profileSelect.value = state.selectedProfileId;
}

function syncProfileDependentUI() {
  const profile = getCurrentProfile();
  if (!profile) {
    return;
  }

  if (profile.recommendedEngineMode) {
    state.engineMode = profile.recommendedEngineMode;
    engineModeSelect.value = state.engineMode;
  }

  frequencyManager.setProfile(profile);
  frequencyManager.setGroupKey(state.frequencyGroupKey);
  engine.setEngineMode(state.engineMode);
  engine.setOutputMode(state.outputMode);

  renderer.clearTargets();
  renderer.setShape(state.shape);
  renderer.setTargets(buildTargets());
}

function refreshObservedPanel() {
  const rt = runtimeMonitor.getSummary();
  const observed = [
    ["window", `${window.innerWidth} x ${window.innerHeight}`],
    ["screen", `${window.screen.width} x ${window.screen.height}`],
    ["devicePixelRatio", String(window.devicePixelRatio)],
    ["colorDepth", `${window.screen.colorDepth} bit`],
    ["estimatedRefresh", formatHz(rt.estimatedRefreshHz)],
    ["avgFrame", `${rt.avgFrameMs.toFixed(3)} ms`],
    ["frameRange", `${rt.minFrameMs.toFixed(3)} - ${rt.maxFrameMs.toFixed(3)} ms`],
    ["dropFrames", `${rt.droppedFrameCount} / ${rt.totalFrameCount}`],
    ["dropRate", `${(rt.dropRate * 100).toFixed(2)}%`],
    ["fullscreen", document.fullscreenElement ? "yes" : "no"]
  ];
  setKvList(observedValues, observed);
}

function refreshProfilePanel() {
  const profile = getCurrentProfile();
  if (!profile) {
    return;
  }

  const rows = [
    ["name", profile.name],
    ["mode", profile.modeNote],
    ["targetResolution", profile.targetResolution],
    ["nominalRefresh", formatHz(profile.nominalRefreshHz)],
    ["availableModes", profile.availableRefreshModes.join(", ")],
    ["colorFormat", profile.colorFormat],
    ["bitDepth", `${profile.bitDepth} bit`],
    ["colorSpace", profile.colorSpace],
    ["HDR", profile.hdr ? "on" : "off"],
    ["VRR", profile.vrr ? "supported" : "not supported"],
    ["notes", profile.notes]
  ];

  setKvList(profileValues, rows);
}

function refreshStimulusPanel() {
  const profile = getCurrentProfile();
  const frequencies = frequencyManager.getCurrentFrequencies();
  const rows = [
    ["profileId", profile.id],
    ["frequencyGroup", state.frequencyGroupKey],
    ["engineMode", state.engineMode],
    ["outputMode", state.outputMode],
    ["shape", state.shape],
    ["F1", formatHz(frequencies[0].frequencyHz)],
    ["F2", formatHz(frequencies[1].frequencyHz)],
    ["F3", formatHz(frequencies[2].frequencyHz)],
    ["F4", formatHz(frequencies[3].frequencyHz)],
    ["running", state.running ? "yes" : "paused"]
  ];

  if (state.decoderResult) {
    rows.push(["decoder", JSON.stringify(state.decoderResult)]);
  }
  if (state.yoloDetections.length > 0) {
    rows.push(["yolo", `${state.yoloDetections.length} detections`]);
  }

  setKvList(stimulusValues, rows);
}

function refreshPanels() {
  refreshObservedPanel();
  refreshProfilePanel();
  refreshStimulusPanel();
}

function setProfile(profileId) {
  if (!state.profiles.has(profileId)) {
    return;
  }
  state.selectedProfileId = profileId;
  state.customTargetOverrides = null;
  profileSelect.value = profileId;
  syncProfileDependentUI();
  refreshPanels();
  addLog(`Profile switched to ${profileId}`);
}

function setFrequencyGroup(groupKey) {
  state.frequencyGroupKey = groupKey;
  frequencyManager.setGroupKey(groupKey);
  renderer.clearTargets();
  renderer.setShape(state.shape);
  renderer.setTargets(buildTargets());
  refreshPanels();
  addLog(`Frequency group changed to ${groupKey}`);
}

function setEngineMode(mode) {
  state.engineMode = mode;
  engine.setEngineMode(mode);
  engine.reset();
  refreshPanels();
  addLog(`Engine mode changed to ${mode}`);
}

function setOutputMode(mode) {
  state.outputMode = mode;
  engine.setOutputMode(mode);
  refreshPanels();
  addLog(`Output mode changed to ${mode}`);
}

function setShape(shape) {
  state.shape = shape;
  renderer.setShape(shape);
  refreshPanels();
  addLog(`Shape changed to ${shape}`);
}

function replaceTargetsFromExternal(targets) {
  if (!Array.isArray(targets) || targets.length !== 4) {
    addLog("External targets ignored: expected array with length 4");
    return;
  }
  state.customTargetOverrides = targets;
  renderer.clearTargets();
  renderer.setShape(state.shape);
  renderer.setTargets(buildTargets());
  refreshPanels();
  addLog("External targets applied");
}

function injectYoloDetections(detections) {
  state.yoloDetections = Array.isArray(detections) ? detections : [];
  addLog(`YOLO detections updated: ${state.yoloDetections.length}`);
}

function pushDecoderResult(result) {
  state.decoderResult = result;
  addLog("Decoder result received");
}

function getPublicState() {
  return {
    selectedProfileId: state.selectedProfileId,
    frequencyGroupKey: state.frequencyGroupKey,
    engineMode: state.engineMode,
    outputMode: state.outputMode,
    shape: state.shape,
    running: state.running
  };
}

function createController() {
  return {
    setProfile,
    setFrequencyGroup,
    setEngineMode,
    setOutputMode,
    setShape,
    replaceTargetsFromExternal,
    injectYoloDetections,
    pushDecoderResult,
    getPublicState
  };
}

profileSelect.addEventListener("change", (event) => {
  setProfile(event.target.value);
});

freqGroupSelect.addEventListener("change", (event) => {
  setFrequencyGroup(event.target.value);
});

engineModeSelect.addEventListener("change", (event) => {
  setEngineMode(event.target.value);
});

outputModeSelect.addEventListener("change", (event) => {
  setOutputMode(event.target.value);
});

shapeSelect.addEventListener("change", (event) => {
  setShape(event.target.value);
});

toggleRunButton.addEventListener("click", () => {
  state.running = !state.running;
  toggleRunButton.textContent = state.running ? "Pause" : "Resume";
  refreshPanels();
  addLog(state.running ? "Render loop resumed" : "Render loop paused");
});

fullscreenButton.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      addLog("Entered fullscreen");
    } else {
      await document.exitFullscreen();
      addLog("Exited fullscreen");
    }
    refreshPanels();
  } catch (error) {
    addLog(`Fullscreen failed: ${error.message}`);
  }
});

addProfileButton.addEventListener("click", () => {
  try {
    const id = `custom-${Date.now()}`;
    const profile = createCustomProfile({
      id,
      name: customName.value.trim() || `Custom ${state.profiles.size + 1}`,
      targetResolution: customResolution.value.trim() || "Unknown",
      nominalRefreshHz: Number(customRefresh.value),
      recommendedFrequencies: parseFrequencyList(customRecommended.value),
      experimentFrequencies: parseFrequencyList(customExperiment.value),
      recommendedEngineMode: "continuous-phase",
      modeNote: "Custom profile"
    });

    state.profiles.set(profile.id, profile);
    repopulateProfiles();
    setProfile(profile.id);
    addLog(`Custom profile created: ${profile.name}`);
  } catch (error) {
    addLog(`Custom profile failed: ${error.message}`);
  }
});

window.addEventListener("resize", refreshPanels);
document.addEventListener("fullscreenchange", refreshPanels);

function tick(timestamp) {
  runtimeMonitor.update(timestamp);

  if (state.running) {
    const profile = getCurrentProfile();
    const frequencies = frequencyManager.getCurrentFrequencies();
    const activeTargets = buildTargets().map((target, index) => ({
      ...target,
      frequencyHz: frequencies[index].frequencyHz
    }));

    const sampled = engine.sampleTargets(
      timestamp,
      activeTargets,
      runtimeMonitor.getSummary().estimatedRefreshHz,
      profile.nominalRefreshHz
    );

    renderer.update(sampled);
  }

  if (Math.round(timestamp) % 200 < 16) {
    refreshPanels();
  }

  requestAnimationFrame(tick);
}

function bootstrap() {
  repopulateProfiles();
  profileSelect.value = state.selectedProfileId;
  freqGroupSelect.value = state.frequencyGroupKey;
  outputModeSelect.value = state.outputMode;
  shapeSelect.value = state.shape;

  syncProfileDependentUI();
  refreshPanels();
  installExternalApi(createController());
  addLog("System initialized");
  requestAnimationFrame(tick);
}

bootstrap();
