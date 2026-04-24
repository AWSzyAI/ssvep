export function installExternalApi(controller) {
  const api = {
    setTargets(targets) {
      controller.replaceTargetsFromExternal(targets);
    },
    setFrequencyGroup(groupKey) {
      controller.setFrequencyGroup(groupKey);
    },
    setProfile(profileId) {
      controller.setProfile(profileId);
    },
    setEngineMode(mode) {
      controller.setEngineMode(mode);
    },
    setOutputMode(mode) {
      controller.setOutputMode(mode);
    },
    setShape(shape) {
      controller.setShape(shape);
    },
    injectYoloDetections(detections) {
      controller.injectYoloDetections(detections);
    },
    pushDecoderResult(result) {
      controller.pushDecoderResult(result);
    },
    getState() {
      return controller.getPublicState();
    }
  };

  window.FlickerHubAPI = api;
}
