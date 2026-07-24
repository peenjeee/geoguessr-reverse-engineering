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
})();
