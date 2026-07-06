const statusBox = document.getElementById("status");
const nearbyPanel = document.getElementById("nearby-panel");
const nearbyMin = document.getElementById("nearby-min");
const nearbyMax = document.getElementById("nearby-max");
const nearbyValue = document.getElementById("nearby-value");
const mapPanel = document.getElementById("map-panel");
const mapFrame = document.getElementById("map-frame");
const allowedPage = /^(https?:\/\/((localhost|127\.0\.0\.1)(:\d+)?|([^/]+\.)?geoguessr\.com)\/|file:\/\/)/;

async function activeTab() {
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
  const min = Math.max(0, Math.min(5000, Number(nearbyMin.value)));
  const max = Math.max(0, Math.min(5000, Number(nearbyMax.value)));
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

function updateNearbyValue() {
  const range = nearbyScoreRange();
  nearbyValue.textContent = `${range.min}-${range.max}`;
}

function mapUrl(lat, lng) {
  const span = 6;
  const minLat = Math.max(-85, lat - span);
  const maxLat = Math.min(85, lat + span);
  const minLng = Math.max(-180, lng - span);
  const maxLng = Math.min(180, lng + span);
  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLng}%2C${minLat}%2C${maxLng}%2C${maxLat}&layer=mapnik&marker=${lat}%2C${lng}`;
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
  if (event.target.closest("[data-nearby-toggle]")) {
    nearbyPanel.hidden = !nearbyPanel.hidden;
    statusBox.textContent = "";
    return;
  }

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

[nearbyMin, nearbyMax].forEach((input) => input.addEventListener("input", updateNearbyValue));
updateNearbyValue();
