(() => {
  if (window.__pnjLocationBridge) return;
  window.__pnjLocationBridge = true;

  window.addEventListener("local-injector:location", (event) => {
    const coord = event.detail;
    if (typeof coord?.lat !== "number" || typeof coord?.lng !== "number") return;

    chrome.runtime.sendMessage({ type: "pnj-location", coord }).catch(() => {});
  });
})();
