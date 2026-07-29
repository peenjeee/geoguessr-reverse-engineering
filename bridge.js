(() => {
  if (window.__pnjBridge) return;
  window.__pnjBridge = true;
  let lastTelemetryKey = "";

  function forwardTelemetry(payload) {
    if (typeof payload?.lat !== "number" || typeof payload?.lng !== "number" || !payload.userId) return;

    // internal.js emits both a CustomEvent and postMessage for compatibility. Collapse
    // the identical pair before it wakes the service worker and performs duplicate POSTs.
    const key = JSON.stringify(payload);
    if (key === lastTelemetryKey) return;
    lastTelemetryKey = key;

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
