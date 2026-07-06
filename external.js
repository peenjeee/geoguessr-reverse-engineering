(function () {
  if (document.documentElement.dataset.localInjectorExternal === "ready") return;

  document.documentElement.dataset.localInjectorExternal = "ready";

  window.addEventListener("local-injector:internal-ready", () => {
    document.documentElement.dataset.localInjectorBridge = "seen";
  });

  window.addEventListener("local-injector:key", (event) => {
    document.documentElement.dataset.localInjectorLastKey = event.detail.key;
    console.info("[local-injector] key received:", event.detail.key);
  });

  window.addEventListener("local-injector:location", (event) => {
    const coord = event.detail;
    document.documentElement.dataset.localInjectorLocation = `${coord.lat},${coord.lng}`;
    console.info("[local-injector] location saved:", coord);
  });

  window.addEventListener("local-injector:placed", (event) => {
    const coord = event.detail;
    document.documentElement.dataset.localInjectorPlaced = `${coord.lat},${coord.lng}`;
    console.info("[local-injector] pin placed:", coord);
  });

  console.info("[local-injector] external.js injected");
})();
