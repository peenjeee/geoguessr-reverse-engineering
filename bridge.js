(() => {
  if (window.__pnjBridge) return;
  window.__pnjBridge = true;
  const RECENT_TELEMETRY_KEYS = 8;
  const recentTelemetryKeys = [];

  function forwardTelemetry(payload) {
    const isRoundUpdate = typeof payload?.lat === "number" && typeof payload?.lng === "number";
    const isOpponentUpdate = payload?.type === "opponent_update" && Array.isArray(payload.opponents);
    if ((!isRoundUpdate && !isOpponentUpdate) || !payload.userId) return;

    // internal.js emits both a CustomEvent and postMessage for compatibility. Collapse
    // the identical pair before it wakes the service worker and performs duplicate POSTs.
    // Round and opponent updates are emitted in the same task, so their pairs interleave
    // and a single remembered key would miss the twin.
    const key = JSON.stringify(payload);
    if (recentTelemetryKeys.includes(key)) return;
    recentTelemetryKeys.push(key);
    if (recentTelemetryKeys.length > RECENT_TELEMETRY_KEYS) recentTelemetryKeys.shift();

    try {
      chrome.runtime.sendMessage({ type: "pnj-telemetry", payload }).catch(() => {});
    } catch (err) {
    }
  }

  window.addEventListener("pnj_loc_upd", (event) => {
    const coord = event.detail;
    if (typeof coord?.lat !== "number" || typeof coord?.lng !== "number") return;

    try {
      if (chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: "pnj-location", coord }).catch(() => {});
      }
    } catch (err) {
    }
  });

  window.addEventListener("pnj_opp_upd", (event) => {
    try {
      if (chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: "pnj-opponent", view: event.detail }).catch(() => {});
      }
    } catch (err) {
    }
  });

  window.addEventListener("pnj_telemetry", (event) => {
    forwardTelemetry(event.detail);
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type === "pnj-open-panel") {
      try {
        if (chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: "pnj-open-panel" }).catch(() => {});
        }
      } catch (err) {
      }
      return;
    }

    if (event.data?.type !== "pnj-telemetry") return;
    forwardTelemetry(event.data.payload);
  });
})();
