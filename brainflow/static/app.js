const els = {
  serialPort: document.getElementById("serial-port"),
  boardId: document.getElementById("board-id"),
  windowSeconds: document.getElementById("window-seconds"),
  connectBtn: document.getElementById("connect-btn"),
  disconnectBtn: document.getElementById("disconnect-btn"),
  calibrationText: document.getElementById("calibration-text"),
  calibrationNormalBtn: document.getElementById("calibration-normal-btn"),
  calibrationGroundBtn: document.getElementById("calibration-ground-btn"),
  calibrationSlowBtn: document.getElementById("calibration-slow-btn"),
  calibrationFastBtn: document.getElementById("calibration-fast-btn"),
  impedanceScanAllBtn: document.getElementById("impedance-scan-all-btn"),
  impedanceClearBtn: document.getElementById("impedance-clear-btn"),
  impedanceBody: document.getElementById("impedance-body"),
  impedanceNote: document.getElementById("impedance-note"),
  message: document.getElementById("message"),
  statusDot: document.getElementById("status-dot"),
  statusText: document.getElementById("status-text"),
  metaText: document.getElementById("meta-text"),
  signals: document.getElementById("signals"),
  spectra: document.getElementById("spectra"),
  bands: document.getElementById("bands"),
  statsDistribution: document.getElementById("stats-distribution"),
  statsBody: document.getElementById("stats-body"),
};

const palette = [
  "#4fc3f7",
  "#7be5b8",
  "#ffd166",
  "#ff8f70",
  "#c77dff",
  "#72efdd",
  "#f9c74f",
  "#f94144",
];

let pollHandle = null;
const calibrationButtons = {
  normal: els.calibrationNormalBtn,
  ground: els.calibrationGroundBtn,
  test_slow: els.calibrationSlowBtn,
  test_fast: els.calibrationFastBtn,
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const contentType = response.headers.get("Content-Type") || "";
  const rawText = await response.text();
  let data = {};

  if (rawText) {
    if (contentType.includes("application/json")) {
      data = JSON.parse(rawText);
    } else {
      throw new Error(`接口 ${path} 返回了非 JSON 响应，请确认后端已经重启到最新版本`);
    }
  }

  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

function setMessage(text, isError = false) {
  els.message.textContent = text;
  els.message.style.color = isError ? "var(--warn)" : "var(--muted)";
}

function updateStatus(snapshot) {
  els.statusDot.className = "status-dot";
  updateCalibration(snapshot.calibration, snapshot.connected);
  if (!snapshot.connected) {
    els.impedanceScanAllBtn.disabled = true;
    els.impedanceClearBtn.disabled = true;
  }
  if (snapshot.connected) {
    els.statusDot.classList.add("live");
    els.statusText.textContent = "Streaming";
    els.metaText.textContent = `${snapshot.serial_port} · ${snapshot.sampling_rate} Hz · ${snapshot.channels.length} EEG channels`;
  } else if (snapshot.error) {
    els.statusDot.classList.add("error");
    els.statusText.textContent = "Error";
    els.metaText.textContent = snapshot.error;
  } else {
    els.statusText.textContent = "Disconnected";
    els.metaText.textContent = "等待连接设备";
  }
}

function updateCalibration(calibration, connected = false) {
  const mode = calibration?.mode || "normal";
  els.calibrationText.textContent = calibration?.label || "Normal";
  Object.entries(calibrationButtons).forEach(([key, button]) => {
    if (!button) {
      return;
    }
    button.classList.toggle("active", key === mode);
    button.disabled = !connected;
  });
}

function clearVisuals() {
  els.signals.innerHTML = "";
  els.spectra.innerHTML = "";
  els.bands.innerHTML = "";
  els.statsDistribution.innerHTML = "";
  els.statsBody.innerHTML = "";
  els.impedanceBody.innerHTML = "";
}

function renderCombinedChart(container, xValues, series, titleText, axisOptions = {}) {
  container.innerHTML = "";
  if (!series.length) {
    const meta = document.createElement("div");
    meta.className = "chart-meta";
    meta.textContent = "等待数据";
    container.appendChild(meta);
    return;
  }

  const meta = document.createElement("div");
  meta.className = "chart-meta";
  meta.textContent = titleText;

  const legend = document.createElement("div");
  legend.className = "legend";
  series.forEach((item, index) => {
    const entry = document.createElement("div");
    entry.className = "legend-item";
    entry.innerHTML = `<span class="legend-swatch" style="background:${palette[index % palette.length]}"></span><span>${item.label}</span>`;
    legend.appendChild(entry);
  });

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "chart");
  svg.setAttribute("viewBox", "0 0 960 300");
  svg.innerHTML = buildMultiSeriesSvg(xValues, series, 960, 300, axisOptions);

  container.append(meta, legend, svg);
}

function buildMultiSeriesSvg(xs, series, width, height, axisOptions = {}) {
  const padding = { top: 12, right: 12, bottom: 30, left: 48 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const allY = series.flatMap((item) => item.values || []);
  if (!xs.length || !allY.length) {
    return "";
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);
  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;

  const toX = (x) => padding.left + ((x - minX) / dx) * innerWidth;
  const toY = (y) => padding.top + innerHeight - ((y - minY) / dy) * innerHeight;

  const formatCompact = (value) => {
    const abs = Math.abs(value);
    if (abs >= 1e9) {
      return `${(value / 1e9).toFixed(2)}G`;
    }
    if (abs >= 1e6) {
      return `${(value / 1e6).toFixed(2)}M`;
    }
    if (abs >= 1e3) {
      return `${(value / 1e3).toFixed(2)}k`;
    }
    return null;
  };

  const formatTick = (value, mode = "auto") => {
    if (mode === "compact") {
      const compact = formatCompact(value);
      if (compact !== null) {
        return compact;
      }
    }

    const abs = Math.abs(value);
    if (abs >= 10000) {
      return value.toExponential(1);
    }
    if (abs >= 100) {
      return value.toFixed(0);
    }
    if (abs >= 10) {
      return value.toFixed(1);
    }
    if (abs >= 1) {
      return value.toFixed(2);
    }
    if (abs >= 0.01) {
      return value.toFixed(3);
    }
    return value.toExponential(1);
  };

  const xTicks = Array.from({ length: 7 }, (_, i) => minX + (dx * i) / 6);
  const yTicks = Array.from({ length: 5 }, (_, i) => minY + (dy * i) / 4);
  const xTickMode = axisOptions.xTickMode || "auto";
  const yTickMode = axisOptions.yTickMode || "auto";

  const grid = [0.25, 0.5, 0.75].map((ratio) => {
    const y = padding.top + innerHeight * ratio;
    return `<line class="grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>`;
  }).join("");

  const axis = [
    `<line class="axis-line" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"></line>`,
    `<line class="axis-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}"></line>`,
  ].join("");

  const tickMarks = [
    ...xTicks.map((value) => {
      const x = toX(value);
      return `<line class="axis-tick" x1="${x}" y1="${height - padding.bottom}" x2="${x}" y2="${height - padding.bottom + 5}"></line>`;
    }),
    ...yTicks.map((value) => {
      const y = toY(value);
      return `<line class="axis-tick" x1="${padding.left - 5}" y1="${y}" x2="${padding.left}" y2="${y}"></line>`;
    }),
  ].join("");

  const tickLabels = [
    ...xTicks.map((value) => {
      const x = toX(value);
      return `<text class="axis-label" x="${x}" y="${height - 8}" text-anchor="middle">${formatTick(value, xTickMode)}</text>`;
    }),
    ...yTicks.map((value) => {
      const y = toY(value);
      return `<text class="axis-label" x="${padding.left - 8}" y="${y + 3}" text-anchor="end">${formatTick(value, yTickMode)}</text>`;
    }),
  ].join("");

  const axisLabels = [
    axisOptions.xLabel
      ? `<text class="axis-label axis-title" x="${padding.left + innerWidth / 2}" y="${height - 2}" text-anchor="middle">${axisOptions.xLabel}</text>`
      : "",
    axisOptions.yLabel
      ? `<text class="axis-label axis-title" x="14" y="${padding.top + innerHeight / 2}" text-anchor="middle" transform="rotate(-90 14 ${padding.top + innerHeight / 2})">${axisOptions.yLabel}</text>`
      : "",
  ].join("");

  const paths = series.map((item, index) => {
    const color = palette[index % palette.length];
    const d = xs.map((x, pointIndex) => {
      const y = item.values[pointIndex];
      const px = toX(x);
      const py = toY(y);
      return `${pointIndex === 0 ? "M" : "L"} ${px.toFixed(2)} ${py.toFixed(2)}`;
    }).join(" ");
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.92"></path>`;
  }).join("");

  return `${grid}${axis}${tickMarks}${tickLabels}${axisLabels}${paths}`;
}

function renderSignals(snapshot) {
  els.signals.innerHTML = "";
  const channels = snapshot.channels || [];
  const times = snapshot.times || [];
  if (!channels.length) {
    const meta = document.createElement("div");
    meta.className = "chart-meta";
    meta.textContent = "等待数据";
    els.signals.appendChild(meta);
    return;
  }

  const meta = document.createElement("div");
  meta.className = "chart-meta";
  meta.textContent = "最近窗口内各通道独立波形（每行一个通道）";

  const rows = document.createElement("div");
  rows.className = "signal-rows";

  channels.forEach((channel, index) => {
    const row = document.createElement("div");
    row.className = "signal-row";

    const label = document.createElement("div");
    label.className = "signal-label";
    label.textContent = channel;

    const plotWrap = document.createElement("div");
    plotWrap.className = "signal-plot";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "chart");
    svg.setAttribute("viewBox", "0 0 960 120");
    svg.innerHTML = buildMultiSeriesSvg(
      times,
      [{ label: channel, values: snapshot.signals?.[index] || [] }],
      960,
      120,
      {
        xLabel: index === channels.length - 1 ? "Time (s)" : "",
        yLabel: "uV",
        xTickMode: "auto",
        yTickMode: "compact",
      },
    );

    plotWrap.appendChild(svg);
    row.append(label, plotWrap);
    rows.appendChild(row);
  });

  els.signals.append(meta, rows);
}

function renderSpectra(snapshot) {
  const spectra = snapshot.spectra || [];
  const xs = spectra[0]?.freqs || [];
  const series = spectra.map((item) => ({
    label: item.channel,
    values: item.power || [],
  }));
  renderCombinedChart(els.spectra, xs, series, "0-60 Hz 频谱叠加显示", {
    xLabel: "Frequency (Hz)",
    yLabel: "Power (uV^2)",
    xTickMode: "auto",
    yTickMode: "compact",
  });
}

function renderBands(snapshot) {
  els.bands.innerHTML = "";
  const bands = snapshot.band_powers || {};
  const channels = snapshot.channels || [];
  const entries = Object.entries(bands);
  if (!entries.length) {
    els.bands.textContent = "等待数据";
    return;
  }

  const maxValue = Math.max(
    ...entries.flatMap(([, values]) => values),
    1,
  );

  const header = document.createElement("div");
  header.className = "band-row";
  header.innerHTML = `<span class="band-name">Band</span>${channels.map((channel) => `<span class="channel-chip">${channel.replace("EEG ", "Ch")}</span>`).join("")}`;
  els.bands.appendChild(header);

  entries.forEach(([band, values]) => {
    const row = document.createElement("div");
    row.className = "band-row";
    const cells = values.map((value, index) => {
      const intensity = value / maxValue;
      const hue = 190 - index * 8;
      const background = `hsla(${hue}, 85%, ${28 + intensity * 42}%, 0.95)`;
      return `<div class="band-cell" style="background:${background}" title="${band} ${channels[index]}: ${value.toFixed(4)}">${value.toFixed(2)}</div>`;
    }).join("");
    row.innerHTML = `<strong class="band-name">${band}</strong>${cells}`;
    els.bands.appendChild(row);
  });
}

function renderStats(stats) {
  renderStatsDistribution(stats);
  els.statsBody.innerHTML = "";
  stats.forEach((item) => {
    const mean = Number(item.mean);
    const std = Math.max(Number(item.std), 1e-9);
    const min = Number(item.min);
    const max = Number(item.max);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.channel}</td>
      <td class="stats-num" title="${mean.toFixed(3)} uV">${formatStatsValue(mean)}</td>
      <td class="stats-num" title="${std.toFixed(3)} uV">${formatStatsValue(std)}</td>
      <td class="stats-num" title="${min.toFixed(3)} uV">${formatStatsValue(min)}</td>
      <td class="stats-num" title="${max.toFixed(3)} uV">${formatStatsValue(max)}</td>
    `;
    els.statsBody.appendChild(tr);
  });
}

function renderStatsDistribution(stats) {
  if (!stats.length) {
    els.statsDistribution.innerHTML = "";
    const meta = document.createElement("div");
    meta.className = "chart-meta";
    meta.textContent = "等待统计数据";
    els.statsDistribution.appendChild(meta);
    return;
  }

  const valid = stats
    .map((item) => ({
      channel: item.channel,
      mean: Number(item.mean),
      std: Math.max(Number(item.std), 1e-9),
      min: Number(item.min),
      max: Number(item.max),
    }))
    .filter((item) => [item.mean, item.std, item.min, item.max].every(Number.isFinite));

  if (!valid.length) {
    els.statsDistribution.innerHTML = "";
    const meta = document.createElement("div");
    meta.className = "chart-meta";
    meta.textContent = "统计值不可用";
    els.statsDistribution.appendChild(meta);
    return;
  }

  const domainMin = Math.min(...valid.map((item) => Math.min(item.min, item.mean - 3 * item.std)));
  const domainMax = Math.max(...valid.map((item) => Math.max(item.max, item.mean + 3 * item.std)));
  const span = Math.max(domainMax - domainMin, 1e-6);
  const xs = Array.from({ length: 240 }, (_, index) => domainMin + (index / 239) * span);
  const sqrt2pi = Math.sqrt(2 * Math.PI);

  const series = valid.map((item) => ({
    label: item.channel,
    values: xs.map((x) => {
      const z = (x - item.mean) / item.std;
      return Math.exp(-0.5 * z * z) / (item.std * sqrt2pi);
    }),
  }));

  renderCombinedChart(
    els.statsDistribution,
    xs,
    series,
    "同图分布对比：峰值高低、均值位置、方差宽窄",
    {
      xLabel: "Amplitude (uV)",
      yLabel: "Density (1/uV)",
      xTickMode: "compact",
      yTickMode: "compact",
    },
  );
}

function formatStatsValue(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  const abs = Math.abs(value);
  if (abs >= 1e6) {
    return `${(value / 1e6).toFixed(2)}M`;
  }
  if (abs >= 1e3) {
    return `${(value / 1e3).toFixed(2)}k`;
  }
  return value.toFixed(2);
}

function formatImpedance(value) {
  if (value === null || value === undefined) {
    return "--";
  }
  return `${Number(value).toFixed(2)} kOhm`;
}

function formatSignalRms(value) {
  if (value === null || value === undefined) {
    return "--";
  }
  return `${Number(value).toFixed(2)} uVrms`;
}

function renderImpedance(impedance, connected) {
  els.impedanceBody.innerHTML = "";

  if (!connected) {
    els.impedanceNote.textContent = "连接 Cyton / Cyton Daisy 后即可进行单通道阻抗测试或一键轮测。";
    return;
  }

  if (!impedance?.supported) {
    els.impedanceNote.textContent = impedance?.message || "当前板卡未实现阻抗测量。";
    els.impedanceScanAllBtn.disabled = true;
    els.impedanceClearBtn.disabled = true;
    return;
  }

  els.impedanceNote.textContent =
    "估算值基于 Cyton 31.5 Hz 注入电流。目标是把接触阻抗降到较低水平，一般越低越稳，但不需要追求绝对 0。";

  (impedance.results || []).forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.channel_name.replace("EEG ", "Ch ")}</td>
      <td>${formatImpedance(item.impedance_kohm)}</td>
      <td>${formatSignalRms(item.signal_rms_uv)}</td>
      <td><span class="impedance-badge ${item.status}">${item.status_label}</span></td>
      <td><button class="secondary tiny-btn impedance-test-btn" data-channel="${item.channel_number}">测量</button></td>
    `;
    els.impedanceBody.appendChild(tr);
  });

  document.querySelectorAll(".impedance-test-btn").forEach((button) => {
    button.disabled = Boolean(impedance.measuring || impedance.scan_in_progress);
    button.addEventListener("click", async () => {
      const channel = Number(button.dataset.channel);
      await measureImpedance(channel);
    });
  });

  const busy = Boolean(impedance.measuring || impedance.scan_in_progress);
  els.impedanceScanAllBtn.disabled = busy;
  els.impedanceClearBtn.disabled = busy;
}

async function poll() {
  try {
    const windowSeconds = Number(els.windowSeconds.value || 6);
    const snapshot = await api(`/api/stream?window=${windowSeconds}`);
    updateStatus(snapshot);
    if (!snapshot.connected) {
      clearVisuals();
      return;
    }
    renderSignals(snapshot);
    renderSpectra(snapshot);
    renderBands(snapshot);
    renderStats(snapshot.channel_stats || []);
    renderImpedance(snapshot.impedance, snapshot.connected);
  } catch (error) {
    updateStatus({ connected: false, error: error.message });
    setMessage(error.message, true);
  }
}

async function connect() {
  try {
    const payload = {
      serial_port: els.serialPort.value.trim(),
      board_id: Number(els.boardId.value),
    };
    const data = await api("/api/connect", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setMessage(`已连接 ${payload.serial_port}`);
    updateStatus(data.status);
    await poll();
    startPolling();
  } catch (error) {
    setMessage(error.message, true);
    updateStatus({ connected: false, error: error.message });
  }
}

async function disconnect() {
  try {
    await api("/api/disconnect", { method: "POST", body: "{}" });
    setMessage("设备已断开");
    updateStatus({ connected: false });
    clearVisuals();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function setCalibration(mode) {
  try {
    const data = await api("/api/calibrate", {
      method: "POST",
      body: JSON.stringify({ mode }),
    });
    setMessage(`校正模式已切换到 ${data.status.calibration.label}`);
    updateStatus(data.status);
    await poll();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function measureImpedance(channel) {
  try {
    setMessage(`正在测量 Channel ${channel} 阻抗...`);
    const data = await api("/api/impedance/test", {
      method: "POST",
      body: JSON.stringify({ channel }),
    });
    const result = data.result;
    setMessage(
      `Channel ${channel}: ${formatImpedance(result.impedance_kohm)} · ${result.status_label}`,
      result.status === "poor",
    );
    updateStatus(data.status);
    renderSignals(data.status);
    renderSpectra(data.status);
    renderBands(data.status);
    renderStats(data.status.channel_stats || []);
    renderImpedance(data.status.impedance, data.status.connected);
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function scanAllImpedances() {
  try {
    setMessage("正在轮测全部通道阻抗，请稍候...");
    els.impedanceScanAllBtn.disabled = true;
    const data = await api("/api/impedance/scan-all", {
      method: "POST",
      body: "{}",
    });
    setMessage(`轮测完成，已更新 ${data.results.length} 个通道的阻抗结果`);
    updateStatus(data.status);
    renderSignals(data.status);
    renderSpectra(data.status);
    renderBands(data.status);
    renderStats(data.status.channel_stats || []);
    renderImpedance(data.status.impedance, data.status.connected);
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function clearImpedanceResults() {
  try {
    const data = await api("/api/impedance/clear", {
      method: "POST",
      body: "{}",
    });
    setMessage("已清空阻抗结果");
    updateStatus(data.status);
    renderImpedance(data.status.impedance, data.status.connected);
  } catch (error) {
    setMessage(error.message, true);
  }
}

function startPolling() {
  stopPolling();
  pollHandle = setInterval(poll, 1000);
}

function stopPolling() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

els.connectBtn.addEventListener("click", connect);
els.disconnectBtn.addEventListener("click", disconnect);
els.calibrationNormalBtn.addEventListener("click", () => setCalibration("normal"));
els.calibrationGroundBtn.addEventListener("click", () => setCalibration("ground"));
els.calibrationSlowBtn.addEventListener("click", () => setCalibration("test_slow"));
els.calibrationFastBtn.addEventListener("click", () => setCalibration("test_fast"));
els.impedanceScanAllBtn.addEventListener("click", scanAllImpedances);
els.impedanceClearBtn.addEventListener("click", clearImpedanceResults);
window.addEventListener("beforeunload", stopPolling);

poll();
