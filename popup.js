const statusBox = document.getElementById("status");
const nearbySlider = document.getElementById("nearby-slider");
const nearbyMin = document.getElementById("nearby-min");
const nearbyMax = document.getElementById("nearby-max");
const nearbyValMin = document.getElementById("nearby-val-min");
const nearbyValMax = document.getElementById("nearby-val-max");
const mapPanel = document.getElementById("map-panel");
const mapFrame = document.getElementById("map-frame");
const copyrightYear = document.getElementById("copyright-year");
const allowedPage = /^(https?:\/\/((localhost|127\.0\.0\.1)(:\d+)?|([^/]+\.)?geoguessr\.com)\/|file:\/\/)/;
const targetTabId = Number(new URLSearchParams(location.search).get("targetTabId"));
let draggedRangeHandle;
let lastMapKey = "";

async function activeTab() {
  if (Number.isInteger(targetTabId) && targetTabId > 0) {
    return chrome.tabs.get(targetTabId);
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function inject(tab, file, world) {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    files: [file],
    world,
  });
}

async function statusResults(tab) {
  return chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    world: "MAIN",
    func: () => {
      if (typeof window.__pnjCmdStatus === "function") {
        return window.__pnjCmdStatus();
      }

      const state = window.__pnjState;
      const current = state && state.current;

      return {
        ready: Boolean(window.__pnjInt),
        current,
        source: state?.source || "unknown",
        autoBot: Boolean(state?.autoBot),
        locations: state?.locations?.length || 0,
        maps: state?.maps?.length || 0,
        targets: document.querySelectorAll("canvas,[class*='map'],[data-qa*='map'],[aria-label*='Map'],[aria-label*='map']").length,
        clickTargets: 0,
        targetSummary: [],
        visibleActions: [],
        badge: document.getElementById("pnj-internal")?.textContent || "",
      };
    },
  });
}

function pickStatusResult(results) {
  return (
    results.find((item) => item.result?.current) ||
    results.find((item) => item.result?.ready)
  );
}

function pickStatus(results) {
  return pickStatusResult(results)?.result;
}

function formatStatus(data) {
  if (!data?.ready) return "internal not ready";
  if (!data.current) return "no round location yet";
  return "";
}

function nearbyScoreRange() {
  let min = Math.max(0, Math.min(5000, Number(nearbyMin?.value || 4500)));
  let max = Math.max(0, Math.min(5000, Number(nearbyMax?.value || 5000)));
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

function updateNearbyValue(e) {
  const isFromNumberBox = e && (e.target === nearbyValMin || e.target === nearbyValMax);
  const range = nearbyScoreRange();
  nearbySlider?.style.setProperty("--range-left", `${range.min / 50}%`);
  nearbySlider?.style.setProperty("--range-right", `${range.max / 50}%`);
  if (!isFromNumberBox) {
    if (nearbyValMin) nearbyValMin.value = range.min;
    if (nearbyValMax) nearbyValMax.value = range.max;
  }
}

function scoreFromPointer(event) {
  const bounds = nearbySlider.getBoundingClientRect();
  const percent = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
  return Math.round((percent * 5000) / 50) * 50;
}

function moveRangeHandle(handle, score) {
  if (handle === nearbyMin) {
    nearbyMin.value = Math.min(score, Number(nearbyMax.value));
  } else {
    nearbyMax.value = Math.max(score, Number(nearbyMin.value));
  }

  updateNearbyValue();
}

function nearestRangeHandle(score) {
  return Math.abs(score - Number(nearbyMin.value)) <= Math.abs(score - Number(nearbyMax.value))
    ? nearbyMin
    : nearbyMax;
}

function mapUrl(lat, lng) {
  return `https://maps.google.com/maps?q=${lat},${lng}&z=6&output=embed`;
}

async function pushScoreRange() {
  const tab = await activeTab();
  if (!tab?.id || !allowedPage.test(tab.url || "")) return;

  const range = nearbyScoreRange();
  await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    world: "MAIN",
    args: [range],
    func: (range) => {
      if (window.__pnjState) window.__pnjState.scoreRange = range;
      try {
        localStorage.setItem("pnj_score_range", JSON.stringify(range));
      } catch { }

      const panel = document.getElementById("pnj-pwa-panel");
      const minInput = panel?.querySelector("[data-pnj-min]");
      const maxInput = panel?.querySelector("[data-pnj-max]");
      if (minInput && maxInput) {
        minInput.value = range.min;
        maxInput.value = range.max;
        minInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
  });
}

async function pullScoreRange() {
  const tab = await activeTab();
  if (!tab?.id || !allowedPage.test(tab.url || "")) return;

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: () => {
      try {
        return JSON.parse(localStorage.getItem("pnj_score_range") || "null");
      } catch {
        return null;
      }
    },
  });

  const stored = results?.[0]?.result;
  if (!stored) return;

  const min = Math.max(0, Math.min(5000, Number(stored.min)));
  const max = Math.max(0, Math.min(5000, Number(stored.max)));
  if (!Number.isFinite(min) || !Number.isFinite(max)) return;

  const low = Math.min(min, max);
  const high = Math.max(min, max);
  if (nearbyValMin) nearbyValMin.value = low;
  if (nearbyValMax) nearbyValMax.value = high;
  if (nearbyMin) nearbyMin.value = low;
  if (nearbyMax) nearbyMax.value = high;
  updateNearbyValue();
}

function setMapCoord(coord) {
  if (typeof coord?.lat !== "number" || typeof coord?.lng !== "number") return;

  const mapKey = `${coord.lat},${coord.lng}`;
  if (mapKey !== lastMapKey) {
    mapFrame.src = mapUrl(coord.lat, coord.lng);
    lastMapKey = mapKey;
  }
  mapPanel.hidden = false;
  statusBox.textContent = "";
}

async function currentRound() {
  const tab = await activeTab();

  if (!tab?.id || !allowedPage.test(tab.url || "")) {
    statusBox.textContent = "";
    return {};
  }

  await inject(tab, "internal.js", "MAIN");

  const pickedStatus = pickStatusResult(await statusResults(tab));
  const data = pickedStatus?.result;
  if (!data?.current) {
    statusBox.textContent = formatStatus(data);
    return {};
  }

  return { tab, pickedStatus, data };
}

async function placePin(mode = "exact") {
  const { tab, pickedStatus, data } = await currentRound();
  if (!data?.current) return;

  const target = Number.isInteger(pickedStatus.frameId)
    ? { tabId: tab.id, frameIds: [pickedStatus.frameId] }
    : { tabId: tab.id };

  const results = await chrome.scripting.executeScript({
    target,
    world: "MAIN",
    args: [data.current, mode, mode === "nearby" ? { scoreRange: nearbyScoreRange() } : null],
    func: (coord, placeMode, options) => {
      if (typeof window.__pnjCmdPlace !== "function") return { ok: false, reason: "not ready" };
      return window.__pnjCmdPlace(coord, placeMode, options);
    },
  });

  const placed =
    results.map((item) => item.result).find((item) => item?.ok) ||
    results.map((item) => item.result).find((item) => item?.status);

  statusBox.textContent = placed?.ok ? "" : `${mode} failed.`;
}

function updateAutoBotUi(isAutoBot) {
  const btn = document.getElementById("btn-autobot");
  if (btn) {
    btn.textContent = isAutoBot ? "AUTO BOT: ON" : "AUTO BOT: OFF";
    btn.style.background = isAutoBot ? "linear-gradient(180deg, #00d647, #008f2f)" : "linear-gradient(180deg, #d61a00, #8f1100)";
  }
}

async function openMapInPopup() {
  const { data } = await currentRound();
  if (data) {
    updateAutoBotUi(data.autoBot);
  }
  if (!data?.current) return;

  setMapCoord(data.current);
}

async function toggleAutoBot() {
  try {
    await pushScoreRange();
  } catch { }

  const { tab, pickedStatus } = await currentRound();
  if (!tab?.id) return;

  const target = Number.isInteger(pickedStatus?.frameId)
    ? { tabId: tab.id, frameIds: [pickedStatus.frameId] }
    : { tabId: tab.id };

  const results = await chrome.scripting.executeScript({
    target,
    world: "MAIN",
    func: () => {
      const state = window.__pnjState;
      if (state) {
        state.autoBot = !state.autoBot;
        localStorage.setItem("pnj_auto_bot", state.autoBot ? "true" : "false");
        window.dispatchEvent(new CustomEvent("pnj_autobot_upd", { detail: state.autoBot }));
        return state.autoBot;
      }
      return false;
    },
  });

  const newState = results?.[0]?.result;
  updateAutoBotUi(newState);
}

async function copyUserId() {
  const tab = await activeTab();
  if (!tab?.id || !allowedPage.test(tab.url || "")) {
    statusBox.textContent = "open GeoGuessr first";
    return;
  }

  await inject(tab, "internal.js", "MAIN");
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: () => {
      const id = localStorage.getItem("pnj_user_id") || "";
      const coord = window.__pnjCmdStatus?.().current || window.__pnjState?.current;
      if (coord && typeof coord.lat === "number" && typeof coord.lng === "number") {
        window.__pnjBroadcastToWeb?.(coord);
      }
      return id;
    },
  });
  const id = result?.result;
  if (!id) {
    statusBox.textContent = "no user id yet";
    return;
  }

  await navigator.clipboard.writeText(id);
  statusBox.textContent = "ID copied";
}

async function hidePagePanel() {
  const tab = await activeTab();
  if (!tab?.id || !allowedPage.test(tab.url || "")) return;

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: () => window.__pnjHidePanel?.(),
  });
}

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-map-toggle]")) {
    openMapInPopup().catch((error) => {
      statusBox.textContent = error.message;
    });
    return;
  }

  if (event.target.closest("[data-autobot]")) {
    toggleAutoBot().catch((error) => {
      statusBox.textContent = error.message;
    });
    return;
  }

  if (event.target.closest("[data-copy-id]")) {
    copyUserId().catch((error) => {
      statusBox.textContent = error.message;
    });
    return;
  }

  const placeButton = event.target.closest("[data-place]");
  if (!placeButton) return;

  placePin(placeButton.dataset.place).catch((error) => {
    statusBox.textContent = error.message;
  });
});

[nearbyMin, nearbyMax, nearbyValMin, nearbyValMax].filter(Boolean).forEach((input) => {
  input.addEventListener("input", (e) => {
    if (e.target === nearbyValMin || e.target === nearbyValMax) {
      if (Number(e.target.value) > 5000) e.target.value = 5000;
      if (Number(e.target.value) < 0 && e.target.value !== "") e.target.value = 0;
    }
    if (e.target === nearbyValMin && nearbyMin && nearbyValMin.value !== "") nearbyMin.value = nearbyValMin.value;
    if (e.target === nearbyValMax && nearbyMax && nearbyValMax.value !== "") nearbyMax.value = nearbyValMax.value;
    updateNearbyValue(e);
  });

  if (input === nearbyValMin || input === nearbyValMax) {
    input.addEventListener("change", () => {
      const readBox = (box, slider) => {
        const raw = String(box.value || "").trim();
        const num = raw === "" ? Number(slider.value) : Number(raw);
        return Math.max(0, Math.min(5000, Number.isFinite(num) ? num : Number(slider.value)));
      };

      let min = readBox(nearbyValMin, nearbyMin);
      let max = readBox(nearbyValMax, nearbyMax);
      if (input === nearbyValMin && min > max) max = min;
      else if (input === nearbyValMax && max < min) min = max;

      nearbyValMin.value = min;
      nearbyValMax.value = max;
      nearbyMin.value = min;
      nearbyMax.value = max;
      updateNearbyValue();
      pushScoreRange().catch(() => { });
    });
  }
});

if (nearbySlider && nearbyMin && nearbyMax) {
  nearbySlider.addEventListener("pointerdown", (event) => {
    const score = scoreFromPointer(event);
    draggedRangeHandle = nearestRangeHandle(score);
    nearbySlider.setPointerCapture(event.pointerId);
    moveRangeHandle(draggedRangeHandle, score);
  });

  nearbySlider.addEventListener("pointermove", (event) => {
    if (!draggedRangeHandle) return;
    moveRangeHandle(draggedRangeHandle, scoreFromPointer(event));
  });

  nearbySlider.addEventListener("pointerup", () => {
    draggedRangeHandle = null;
    pushScoreRange().catch(() => { });
  });

  nearbySlider.addEventListener("pointercancel", () => {
    draggedRangeHandle = null;
  });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "pnj-close-panel") {
    if (!message.tabId || message.tabId === targetTabId || !targetTabId) {
      document.documentElement.innerHTML = '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%}body{display:flex;align-items:center;justify-content:center;background:#1a1a2e;color:#666;font:11px/1.4 system-ui,sans-serif;user-select:none}span{opacity:0;animation:fade 2s ease forwards}@keyframes fade{to{opacity:1}}</style></head><body><span>Press <kbd>Insert</kbd> to open PNJ Tools</span></body>';
    }
    return;
  }

  if (message?.type !== "pnj-location") return;
  if (Number.isInteger(targetTabId) && targetTabId > 0 && sender.tab?.id !== targetTabId) return;

  if (targetTabId > 0) {
    setMapCoord(message.coord);
    return;
  }

  activeTab()
    .then((tab) => {
      if (tab?.id === sender.tab?.id) setMapCoord(message.coord);
    })
    .catch(() => { });
});

updateNearbyValue();
if (copyrightYear) copyrightYear.textContent = new Date().getFullYear();
hidePagePanel().catch(() => { });
openMapInPopup().catch(() => { });
pullScoreRange().catch(() => { });
