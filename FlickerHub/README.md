# FlickerHub

FlickerHub is a browser-based SSVEP stimulus console focused on reliable stimulus generation, profile-driven multi-display adaptation, and observability.

This implementation follows the architecture described in the design document and is intended as a practical base layer for future integration with YOLO/FIFO/EEG/ROS/Quest workflows.

## 1. What Is Implemented

- Four independent stimulus targets with frequency labels.
- Two stimulation engine modes:
  - frame-locked (discrete frame switching)
  - continuous-phase (time-continuous phase sampling)
- Two output modes:
  - binary black/white flicker (`#000000` / `#FFFFFF`)
  - grayscale intensity modulation (`#000000` to `#FFFFFF`)
- Multiple built-in display profiles:
  - 60 Hz baseline
  - 75 Hz extended
  - 165 Hz high refresh
  - Quest 120 Hz target
- Frequency group switching per profile:
  - recommended group
  - experiment group
- Runtime monitor panel with observed browser-side values.
- Configured profile panel with static device profile parameters.
- Stimulus state panel with live mode/frequency state.
- Fullscreen toggle for cleaner stimulus presentation.
- Custom profile creation from UI.
- Event log panel for run-time actions.
- External integration API on window.FlickerHubAPI for future module hookups.

## 2. Architecture Mapping

The current codebase is split to match the design-level six-layer idea:

- Device profile layer:
  - src/profiles.js
  - Static profile definitions and custom profile validation.

- Runtime detection layer:
  - src/runtime-monitor.js
  - requestAnimationFrame-driven frame interval statistics and refresh estimation.

- Frequency scheduling layer:
  - src/frequency-manager.js
  - Profile + group based frequency assignment to 4 slots.

- Stimulation engine layer:
  - src/stimulus-engine.js
  - Mode-specific intensity sampling per target.

- Layout/render layer:
  - src/renderer.js
  - Four-target stage rendering and shape mapping.

- External interface layer:
  - src/external-api.js
  - Integration hooks for external target source/decoder/detection control.

The orchestration entry is in src/main.js.

## 3. File Structure

- index.html: shell layout and control widgets.
- styles.css: visual style, responsive behavior, target shape styles.
- src/main.js: app state, UI wiring, RAF loop, panel updates.
- src/profiles.js: built-in profiles and custom profile utilities.
- src/frequency-manager.js: profile/group frequency scheduler.
- src/runtime-monitor.js: frame timing observability utilities.
- src/stimulus-engine.js: core stimulus sampler.
- src/renderer.js: stage target render/update logic.
- src/external-api.js: window API installation.
- Log.md: development implementation log.

## 4. Run Instructions

This is a static front-end app and should be served over a local HTTP server.

Option A (Python):

1. cd FlickerHub
2. python3 -m http.server 8000
3. Open http://localhost:8000

Option A-Alt (when python3 command is unavailable):

1. cd FlickerHub
2. perl tools/dev_server.pl 8000
3. Open http://localhost:8000

Option B (any static server):

1. Serve the FlickerHub directory root.
2. Open index.html from that server origin.

WSL note:

- If only Windows-side npx is available, it may start in Windows directory instead of the WSL project path.
- Prefer Option A or Option A-Alt inside WSL for correct project-root serving.

## 5. Usage Guide

1. Select a display profile in Control panel.
2. Select Frequency Group (recommended or experiment).
3. Select Engine Mode (frame-locked or continuous-phase).
4. Select Output Mode (binary or grayscale).
5. Select target shape.
6. Use Fullscreen to reduce desktop/UI interference.
7. Observe panels:
   - Runtime Monitor (observed values)
   - Profile (configured values)
   - Stimulus State (active frequencies and run state)

Pause/Resume can temporarily stop or continue stimulus updates.

## 6. Custom Profile Rules

Custom profile creation requires:

- Name: optional, auto-filled if empty.
- Resolution: optional.
- Nominal refresh: positive number.
- Recommended frequencies: exactly 4 positive numbers, comma separated.
- Experiment frequencies: exactly 4 positive numbers, comma separated.

Invalid input is rejected and logged in Event Log.

## 7. External API

The app exposes window.FlickerHubAPI:

- setProfile(profileId)
- setFrequencyGroup(groupKey)
- setEngineMode(mode)
- setOutputMode(mode)
- setShape(shape)
- setTargets(targetArrayOf4)
- injectYoloDetections(detections)
- pushDecoderResult(result)
- getState()

This API is intended for future integration with external detector/decoder/control modules.

## 8. Current Validation Scope

Implemented and validated by code inspection/manual architecture checks:

- Mode and group switches trigger immediate UI and state updates.
- Stimulus sampling is bound to requestAnimationFrame.
- Profile static values and observed browser values are explicitly separated in UI.
- Four-slot target abstraction exists and can be externally overridden.

Not yet fully validated in this commit:

- Physical photodiode/high-speed camera verification of output spectrum.
- Cross-browser timing behavior differences.
- Real YOLO/OpenBCI/ROS integration pipeline.

## 9. Next Recommended Steps

1. Multi-display trial on 60/75/165 Hz with recorded frame stats snapshots.
2. Add CSV export for frame-interval histogram and event log.
3. Replace fixed-position defaults with external bbox layout provider.
4. Add mock FIFO scheduler to rotate active target assignments.
5. Connect real detector/decoder adapters through window.FlickerHubAPI.

## 10. Notes

- requestAnimationFrame is used intentionally instead of setInterval.
- Browser timing is still not a substitute for physical calibration.
- The objective of this stage is architectural correctness and operational controllability.
