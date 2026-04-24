# FlickerHub Development Log

## 2026-04-14

### Goal

Implement the first complete runnable SSVEP stimulus front-end baseline according to design.md, with full project documentation and traceable development log.

### Completed Work

1. Project scaffold created under FlickerHub.
2. Multi-module architecture implemented:
   - src/profiles.js
   - src/frequency-manager.js
   - src/runtime-monitor.js
   - src/stimulus-engine.js
   - src/renderer.js
   - src/external-api.js
   - src/main.js
3. UI shell implemented in index.html:
   - left monitor panel
   - center stimulus stage
   - right control panel
4. Visual system implemented in styles.css:
   - responsive layout
   - profile-driven panel style
   - four target color coding
   - shape variants (circle/square/outline/block)
5. Core runtime capabilities implemented:
   - requestAnimationFrame render loop
   - frame timing summary and refresh estimate
   - dropped-frame counting heuristic
   - full-screen toggle
   - pause/resume loop control
6. Profile and frequency controls implemented:
   - built-in baseline/extended/high-refresh/Quest profiles
   - recommended vs experiment frequency groups
   - custom profile creation and validation
7. Extension-facing API installed on window.FlickerHubAPI:
   - state switching functions
   - external target override entry
   - YOLO/decoder placeholder data push methods
8. Documentation delivered:
   - full README.md
   - this Log.md

### Design Requirements Coverage Summary

- Four independent stimuli: done.
- Frequency not hardcoded globally: done via profile + group manager.
- Mode switch (frame-locked and continuous-phase): done.
- Distinguish observed vs configured parameters: done in separate panels.
- Fullscreen operation: done.
- Multi-display profile switching + custom profile: done.
- Observability essentials (refresh estimate, frame stats, dropped frame indicator): done.
- Future extension surface for YOLO/FIFO/EEG/ROS/Quest: interface layer prepared.

### Constraints / Limitations Observed

1. Runtime syntax check command through Node could not run in environment because Node executable is unavailable.
2. Physical-output accuracy is not validated yet (no photodiode/high-speed camera in this step).
3. Current target positions default to quadrant layout unless external target override is injected.

### Immediate Follow-up Suggestions

1. Add frame interval CSV export and per-profile experiment snapshots.
2. Add mock FIFO scheduler for candidate target queue testing.
3. Implement bbox-driven target placement adapter.
4. Add optional fixed-phase offsets among four stimuli for experimental control.
5. Prepare WebXR adapter branch for Quest runtime parity tests.

## 2026-04-15

### Runtime Environment Fixes

1. Encountered missing python3 command in target environment (fish + WSL).
2. Confirmed available npx command resolves to Windows path and serves wrong root due UNC fallback behavior.
3. Added WSL-safe fallback static server script:
   - tools/dev_server.pl
4. Updated README run instructions to include Perl fallback command:
   - perl tools/dev_server.pl 8000
5. Added HEAD method handling in fallback server for better tooling compatibility.

### Verification

1. Server started successfully from project root.
2. GET request to http://localhost:8000 returns FlickerHub index.html.
