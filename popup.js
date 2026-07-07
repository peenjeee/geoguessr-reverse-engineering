const statusBox = document.getElementById("status");
const nearbySlider = document.getElementById("nearby-slider");
const nearbyMin = document.getElementById("nearby-min");
const nearbyMax = document.getElementById("nearby-max");
const nearbyValue = document.getElementById("nearby-value");
const mapPanel = document.getElementById("map-panel");
const mapFrame = document.getElementById("map-frame");
const copyrightYear = document.getElementById("copyright-year");
const allowedPage = /^(https?:\/\/((localhost|127\.0\.0\.1)(:\d+)?|([^/]+\.)?geoguessr\.com)\/|file:\/\/)/;
const targetTabId = Number(new URLSearchParams(location.search).get("targetTabId"));
let draggedRangeHandle;

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
      if (typeof window.__localInjectorStatus === "function") {
        return window.__localInjectorStatus();
      }

      const state = window.__localInjectorState;
      const current = state && state.current;

      return {
        ready: Boolean(window.__localInjectorInternal),
        current,
        source: state?.source || "unknown",
        locations: state?.locations?.length || 0,
        maps: state?.maps?.length || 0,
        targets: document.querySelectorAll("canvas,[class*='map'],[data-qa*='map'],[aria-label*='Map'],[aria-label*='map']").length,
        clickTargets: 0,
        targetSummary: [],
        visibleActions: [],
        badge: document.getElementById("local-injector-internal")?.textContent || "",
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
  let max = Math.max(0, Math.min(5000, Number(nearbyMax?.value || 4900)));

  if (nearbyMin && nearbyMax && min > max) {
    if (document.activeElement === nearbyMin) max = min;
    else min = max;
    nearbyMin.value = min;
    nearbyMax.value = max;
  }

  return { min, max };
}

function updateNearbyValue() {
  const range = nearbyScoreRange();
  nearbySlider?.style.setProperty("--range-left", `${range.min / 50}%`);
  nearbySlider?.style.setProperty("--range-right", `${range.max / 50}%`);
  if (nearbyValue) nearbyValue.textContent = `${range.min}-${range.max}`;
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
      if (typeof window.__localInjectorPlace !== "function") return { ok: false, reason: "not ready" };
      return window.__localInjectorPlace(coord, placeMode, options);
    },
  });

  const placed =
    results.map((item) => item.result).find((item) => item?.ok) ||
    results.map((item) => item.result).find((item) => item?.status);

  statusBox.textContent = placed?.ok ? "" : `${mode} failed.`;
}

async function openMapInPopup() {
  const { data } = await currentRound();
  if (!data?.current) return;

  const { lat, lng } = data.current;
  mapFrame.src = mapUrl(lat, lng);
  mapPanel.hidden = false;
  statusBox.textContent = "";
}

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-map-toggle]")) {
    openMapInPopup().catch((error) => {
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

[nearbyMin, nearbyMax].filter(Boolean).forEach((input) => input.addEventListener("input", updateNearbyValue));

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
  });

  nearbySlider.addEventListener("pointercancel", () => {
    draggedRangeHandle = null;
  });
}

updateNearbyValue();
if (copyrightYear) copyrightYear.textContent = new Date().getFullYear();
openMapInPopup().catch(() => {});
