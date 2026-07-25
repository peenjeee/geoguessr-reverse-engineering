(() => {
  if (window.__pnjBridge) return;
  window.__pnjBridge = true;

  window.addEventListener("pnj_loc_upd", (event) => {
    const coord = event.detail;
    if (typeof coord?.lat !== "number" || typeof coord?.lng !== "number") return;

    try {
      if (chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: "pnj-location", coord }).catch(() => {});
      }
    } catch (err) {
      // Extension context invalidated, usually fixed by refreshing the page
    }
  });

  window.addEventListener("pnj_telemetry", (event) => {
    const payload = event.detail;
    if (typeof payload?.lat !== "number" || typeof payload?.lng !== "number" || !payload.userId) return;

    try {
      if (chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: "pnj-telemetry", payload }).catch(() => {});
      }
    } catch (err) {
      // Extension context invalidated, usually fixed by refreshing the page
    }
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type === "pnj-open-panel") {
      try {
        if (chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: "pnj-open-panel" }).catch(() => {});
        }
      } catch (err) {
        // Extension context invalidated, usually fixed by refreshing the page
      }
      return;
    }

    if (event.data?.type !== "pnj-telemetry") return;
    const payload = event.data.payload;
    if (typeof payload?.lat !== "number" || typeof payload?.lng !== "number" || !payload.userId) return;

    try {
      if (chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: "pnj-telemetry", payload }).catch(() => {});
      }
    } catch (err) {
      // Extension context invalidated, usually fixed by refreshing the page
    }
  });
})();
