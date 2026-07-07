(function () {
  const SCRIPT_VERSION = "clean-v9";
  if (window.__localInjectorInternalVersion === SCRIPT_VERSION) return;

  window.__localInjectorInternal = true;
  window.__localInjectorInternalVersion = SCRIPT_VERSION;

  const STORE_KEY = "local-injector:round-locations";
  const MAP_TARGET_SELECTOR = [
    "canvas",
    "[class*='guess-map']",
    "[class*='guessMap']",
    "[class*='map']",
    "[data-qa*='map']",
    "[aria-label*='Map']",
    "[aria-label*='map']",
  ].join(",");
  const state = (window.__localInjectorState = window.__localInjectorState || {
    locations: loadLocations(),
    maps: [],
  });
  state.current = state.locations[state.locations.length - 1] || null;
  state.source = state.source || "stored";

  function clearBadge() {
    document.getElementById("local-injector-internal")?.remove();
  }

  function loadLocations() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "[]").filter(isCoord);
    } catch {
      return [];
    }
  }

  function saveLocations() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state.locations.slice(-20)));
  }

  function asNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function pickNumber(object, keys) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        const number = asNumber(object[key]);
        if (number !== null) return number;
      }
    }
    return null;
  }

  function isCoord(value) {
    return (
      value &&
      Number.isFinite(value.lat) &&
      Number.isFinite(value.lng) &&
      Math.abs(value.lat) <= 90 &&
      Math.abs(value.lng) <= 180
    );
  }

  function coordFromObject(object) {
    if (!object || typeof object !== "object") return null;

    const lat = pickNumber(object, ["lat", "latitude"]);
    const lng = pickNumber(object, ["lng", "lon", "long", "longitude"]);
    return isCoord({ lat, lng }) ? { lat, lng } : null;
  }

  function pathScore(path, url) {
    const urlText = String(url || "").toLowerCase();
    const pathText = path.join(".").toLowerCase();
    const text = `${urlText} ${pathText}`;
    let score = 0;

    if (/round|game|challenge|duel/.test(text)) score += 4;
    if (/answer|correct|location|pano/.test(text)) score += 4;
    if (/guess|pin|player|participant|bounds|viewport|mapbounds/.test(pathText)) score -= 8;
    if (/\/maps?\//.test(urlText)) score -= 6;

    return score;
  }

  function roundFromPath(path, object) {
    const explicit = pickNumber(object, ["round", "roundNumber", "roundIndex"]);
    if (explicit !== null) return explicit > 0 ? explicit : explicit + 1;

    const roundsIndex = path.indexOf("rounds");
    if (roundsIndex !== -1 && Number.isInteger(path[roundsIndex + 1])) {
      return path[roundsIndex + 1] + 1;
    }

    return null;
  }

  function collectCoords(value, url, path = [], seen = new WeakSet(), found = []) {
    if (!value || typeof value !== "object" || seen.has(value)) return found;
    seen.add(value);

    const coord = coordFromObject(value);
    if (coord) {
      const score = pathScore(path, url);
      if (score > 0) {
        found.push({ ...coord, round: roundFromPath(path, value), score, source: url || "unknown" });
      }
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => collectCoords(item, url, path.concat(index), seen, found));
    } else {
      Object.entries(value).forEach(([key, item]) => collectCoords(item, url, path.concat(key), seen, found));
    }

    return found;
  }

  function rememberLocations(candidates) {
    if (state.source === "google") return;

    candidates
      .sort((left, right) => right.score - left.score)
      .forEach((coord) => {
        const existing = state.locations.find(
          (item) =>
            Math.abs(item.lat - coord.lat) < 0.000001 &&
            Math.abs(item.lng - coord.lng) < 0.000001 &&
            item.round === coord.round,
        );

        if (!existing) state.locations.push({ lat: coord.lat, lng: coord.lng, round: coord.round || null, source: "json" });
        state.current = existing || state.locations[state.locations.length - 1];
      });

    state.locations = state.locations.slice(-20);
    saveLocations();

    if (state.current) {
      const round = state.current.round ? `R${state.current.round} ` : "";
      clearBadge();
      window.dispatchEvent(new CustomEvent("local-injector:location", { detail: state.current }));
    }
  }

  function rememberLocation(coord, round = null) {
    if (!isCoord(coord)) return;

    const existing = state.locations.find(
      (item) => Math.abs(item.lat - coord.lat) < 0.000001 && Math.abs(item.lng - coord.lng) < 0.000001,
    );

    if (!existing) state.locations.push({ lat: coord.lat, lng: coord.lng, round, source: "google" });
    state.current = existing || state.locations[state.locations.length - 1];
    state.source = "google";
    state.locations = state.locations.slice(-20);
    saveLocations();
    clearBadge();
    window.dispatchEvent(new CustomEvent("local-injector:location", { detail: state.current }));
  }

  function inspectGoogleMapsText(text) {
    const match = String(text || "").match(/-?\d+\.\d+,-?\d+\.\d+/);
    if (!match) return;

    const [lat, lng] = match[0].split(",").map(Number);
    rememberLocation({ lat, lng });
  }

  function inspectText(text, url) {
    if (!text || !/[{[]/.test(text[0])) return;

    try {
      rememberLocations(collectCoords(JSON.parse(text), url));
    } catch {
      // Not JSON.
    }
  }

  function patchFetch() {
    if (typeof window.fetch !== "function" || window.fetch.__localInjectorPatched) return;

    const originalFetch = window.fetch;
    window.fetch = function patchedFetch(input, init) {
      const url = typeof input === "string" ? input : input && input.url;

      return originalFetch.call(this, input, init).then((response) => {
        const copy = response.clone();
        const type = copy.headers && copy.headers.get("content-type");

        if (!type || type.includes("json")) {
          copy.text().then((text) => inspectText(text.trim(), url)).catch(() => {});
        }

        return response;
      });
    };
    window.fetch.__localInjectorPatched = true;
  }

  function patchXhr() {
    if (typeof window.XMLHttpRequest !== "function" || window.XMLHttpRequest.__localInjectorPatched) return;

    const OriginalXhr = window.XMLHttpRequest;

    function PatchedXhr() {
      const xhr = new OriginalXhr();
      let url = "";
      const open = xhr.open;

      xhr.open = function patchedOpen(method, requestUrl) {
        url = String(requestUrl || "");
        return open.apply(xhr, arguments);
      };

      xhr.addEventListener("load", () => {
        if (
          url.startsWith("https://maps.googleapis.com/$rpc/google.internal.maps.mapsjs.v1.MapsJsInternalService/GetMetadata") ||
          url.startsWith("https://maps.googleapis.com/$rpc/google.internal.maps.mapsjs.v1.MapsJsInternalService/SingleImageSearch")
        ) {
          try {
            inspectGoogleMapsText(xhr.responseText || xhr.response);
          } catch {
            // Some responseType values block responseText.
          }
          return;
        }

        const type = xhr.getResponseHeader("content-type") || "";
        if (type && !type.includes("json")) return;

        if (xhr.response && typeof xhr.response === "object") {
          rememberLocations(collectCoords(xhr.response, url));
          return;
        }

        try {
          inspectText(String(xhr.responseText || "").trim(), url);
        } catch {
          // Some responseType values block responseText.
        }
      });

      return xhr;
    }

    PatchedXhr.prototype = OriginalXhr.prototype;
    window.XMLHttpRequest = PatchedXhr;
    window.XMLHttpRequest.__localInjectorPatched = true;
  }

  function captureMap(map) {
    if (map && !state.maps.includes(map)) state.maps.push(map);
  }

  function patchMapLibrary(library) {
    if (!library || typeof library.Map !== "function" || library.__localInjectorPatched) return;

    const OriginalMap = library.Map;

    function PatchedMap() {
      const map = Reflect.construct(OriginalMap, arguments, new.target || PatchedMap);
      captureMap(map);
      return map;
    }

    Object.setPrototypeOf(PatchedMap, OriginalMap);
    PatchedMap.prototype = OriginalMap.prototype;
    library.Map = PatchedMap;
    library.__localInjectorPatched = true;
  }

  function hookMapLibrary(name) {
    let current = window[name];

    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get() {
          return current;
        },
        set(value) {
          current = value;
          patchMapLibrary(value);
        },
      });
    } catch {
      // Already locked by the page.
    }

    patchMapLibrary(current);
  }

  function visibleContainer(map) {
    const element = (map.getContainer && map.getContainer()) || (map.getCanvas && map.getCanvas());
    if (!element) return null;

    const rect = element.getBoundingClientRect();
    return rect.width > 20 && rect.height > 20 ? element : null;
  }

  function dispatchCanvasClick(map, coord, point) {
    const canvas = map.getCanvas && map.getCanvas();
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    dispatchElementClick(canvas, rect.left + point.x, rect.top + point.y);

    if (typeof map.fire === "function") {
      const options = { bubbles: true, cancelable: true, clientX: rect.left + point.x, clientY: rect.top + point.y };
      map.fire("click", {
        type: "click",
        target: map,
        point,
        lngLat: { lng: coord.lng, lat: coord.lat },
        originalEvent: new MouseEvent("click", options),
      });
    }
  }

  function dispatchElementClick(element, clientX, clientY) {
    const options = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      detail: 1,
      clientX,
      clientY,
      screenX: clientX,
      screenY: clientY,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    };

    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((type) => {
      const EventClass = type.startsWith("pointer") && window.PointerEvent ? PointerEvent : MouseEvent;
      element.dispatchEvent(new EventClass(type, options));
    });
  }

  function dispatchElementMove(element, clientX, clientY) {
    const options = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX,
      clientY,
      screenX: clientX,
      screenY: clientY,
      button: 0,
      buttons: 0,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    };

    ["pointerover", "pointerenter", "pointermove", "mouseover", "mouseenter", "mousemove"].forEach((type) => {
      const EventClass = type.startsWith("pointer") && window.PointerEvent ? PointerEvent : MouseEvent;
      element.dispatchEvent(new EventClass(type, options));
    });
  }

  function clickElementChain(element, clientX, clientY) {
    let current = element;
    let clicks = 0;

    while (current && current !== document.documentElement && clicks < 4) {
      dispatchElementClick(current, clientX, clientY);
      current = current.parentElement;
      clicks += 1;
    }

    return clicks > 0;
  }

  function moveElementChain(element, clientX, clientY) {
    let current = element;
    let moves = 0;

    while (current && current !== document.documentElement && moves < 4) {
      dispatchElementMove(current, clientX, clientY);
      current = current.parentElement;
      moves += 1;
    }

    return moves > 0;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function mercatorPoint(coord, rect) {
    const sin = Math.sin((coord.lat * Math.PI) / 180);

    return {
      x: ((coord.lng + 180) / 360) * rect.width,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * rect.height,
    };
  }

  function canvasScore(canvas) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const pageWidth = window.innerWidth || document.documentElement.clientWidth || rect.right;
    const pageHeight = window.innerHeight || document.documentElement.clientHeight || rect.bottom;
    const text = `${canvas.id || ""} ${canvas.className || ""} ${canvas.getAttribute("aria-label") || ""} ${
      canvas.getAttribute("data-qa") || ""
    }`.toLowerCase();
    let score = rect.width * rect.height;

    if (rect.width < pageWidth * 0.9 && rect.height < pageHeight * 0.9) score += 1000000;
    if (centerX > pageWidth / 2) score += 200000;
    if (centerY > pageHeight / 2) score += 200000;
    if (/guess|map/.test(text)) score += 1000000;
    if (/pano|street|modal|header|nav|button/.test(text)) score -= 1000000;

    return { canvas, rect, score };
  }

  function mapCandidates() {
    return Array.from(document.querySelectorAll(MAP_TARGET_SELECTOR))
      .map(canvasScore)
      .filter(Boolean)
      .sort((left, right) => right.score - left.score);
  }

  function targetSummary(limit = 5) {
    return mapCandidates()
      .slice(0, limit)
      .map(({ canvas, rect }) => ({
        tag: canvas.tagName,
        className: String(canvas.className || "").slice(0, 80),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        left: Math.round(rect.left),
        top: Math.round(rect.top),
      }));
  }

  function elementSummary(element, rect) {
    return {
      tag: element.tagName,
      className: String(element.className || "").slice(0, 80),
      text: String(element.textContent || "").trim().slice(0, 40),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      left: Math.round(rect.left),
      top: Math.round(rect.top),
    };
  }

  function visibleActionCandidates(limit = 10) {
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    const height = window.innerHeight || document.documentElement.clientHeight || 0;

    return Array.from(document.querySelectorAll("button,[role='button'],a,canvas,div,section"))
      .map((element) => ({ element, rect: element.getBoundingClientRect(), text: textSignal(element) }))
      .filter(({ element, rect }) => {
        if (rect.width < 20 || rect.height < 20) return false;
        if (rect.right < 0 || rect.bottom < 0 || rect.left > width || rect.top > height) return false;
        return rect.left > width * 0.45 || rect.top > height * 0.45;
      })
      .map((item) => {
        let score = item.rect.width * item.rect.height;
        if (/guess|map|pin|submit|button/.test(item.text)) score += 2000000;
        if (item.rect.left > width * 0.55) score += 300000;
        if (item.rect.top > height * 0.55) score += 300000;
        if (item.rect.width > width * 0.95 && item.rect.height > height * 0.95) score -= 2000000;
        return { ...item, score };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  function visibleActionSummary(limit = 5) {
    return visibleActionCandidates(limit).map(({ element, rect }) => elementSummary(element, rect));
  }

  function textSignal(element) {
    return `${element.id || ""} ${element.className || ""} ${element.getAttribute("aria-label") || ""} ${
      element.getAttribute("data-qa") || ""
    } ${element.textContent || ""}`.toLowerCase();
  }

  function openGuessMap() {
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    const height = window.innerHeight || document.documentElement.clientHeight || 0;
    const points = [
      [width - 80, height - 80],
      [width - 180, height - 140],
      [width - 260, height - 220],
      [width / 2, height - 120],
    ];

    points.forEach(([x, y]) => {
      const target = document.elementFromPoint(x, y);
      if (target) moveElementChain(target, x, y);
    });

    const buttons = Array.from(document.querySelectorAll("button,[role='button'],[aria-label],[data-qa]"))
      .map((element) => ({ element, rect: element.getBoundingClientRect(), text: textSignal(element) }))
      .filter(({ rect, text }) => rect.width > 1 && rect.height > 1 && /guess|map|pin/.test(text))
      .sort((left, right) => right.rect.width * right.rect.height - left.rect.width * left.rect.height);

    buttons.slice(0, 3).forEach(({ element, rect }) => {
      clickElementChain(element, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });

    visibleActionCandidates(10).forEach(({ element, rect }) => {
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      moveElementChain(element, x, y);
      clickElementChain(element, x, y);
    });
  }

  function viewportFallbackClick(coord) {
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    const height = window.innerHeight || document.documentElement.clientHeight || 0;
    const points = [
      [width - 90, height - 90],
      [width - 180, height - 140],
      [width - 260, height - 220],
      [width / 2, height - 120],
      [width / 2, height / 2],
    ];

    points.forEach(([x, y]) => {
      const target = document.elementFromPoint(x, y) || document.body || document.documentElement;
      moveElementChain(target, x, y);
      clickElementChain(target, x, y);
    });

    clearBadge();
    window.dispatchEvent(new CustomEvent("local-injector:placed", { detail: coord }));
    return true;
  }

  function nearbyCoord(coord, scoreRange = {}) {
    const minScore = Math.max(0, Math.min(5000, Number(scoreRange.min ?? 3000)));
    const maxScore = Math.max(0, Math.min(5000, Number(scoreRange.max ?? 4500)));
    const low = Math.min(minScore, maxScore);
    const high = Math.max(minScore, maxScore);
    const targetScore = low + Math.random() * (high - low);
    const earthRadiusKm = 6371;
    const scoreScaleKm = 1492;
    const distanceKm = targetScore > 0 ? -scoreScaleKm * Math.log(targetScore / 5000) : scoreScaleKm * 10;
    const bearing = Math.random() * Math.PI * 2;
    const startLat = (coord.lat * Math.PI) / 180;
    const startLng = (coord.lng * Math.PI) / 180;
    const angularDistance = distanceKm / earthRadiusKm;
    const endLat = Math.asin(
      (Math.sin(startLat) * Math.cos(angularDistance)) +
        (Math.cos(startLat) * Math.sin(angularDistance) * Math.cos(bearing)),
    );
    const endLng = startLng + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(startLat),
      Math.cos(angularDistance) - (Math.sin(startLat) * Math.sin(endLat)),
    );

    return {
      lat: Math.max(-90, Math.min(90, (endLat * 180) / Math.PI)),
      lng: (((((endLng * 180) / Math.PI) + 180) % 360) + 360) % 360 - 180,
      round: coord.round || null,
    };
  }

  function reactFiberKey(element) {
    return Object.keys(element).find((key) => key.startsWith("__reactFiber$"));
  }

  function latLngEvent(coord) {
    return {
      latLng: {
        lat: () => coord.lat,
        lng: () => coord.lng,
      },
    };
  }

  function callReactMapHandlers(mapClick, coord, streaks = false) {
    if (!mapClick || typeof mapClick !== "object") return false;

    let called = false;
    const event = latLngEvent(coord);
    const functionString = "(e.latLng.lat(),e.latLng.lng())}";

    Object.keys(mapClick).forEach((key) => {
      const props = mapClick[key];
      if (!props || typeof props !== "object") return;

      Object.keys(props).forEach((propKey) => {
        const handler = props[propKey];
        if (typeof handler !== "function") return;
        if (streaks && handler.toString().slice(5) !== functionString) return;

        handler(event);
        called = true;
      });
    });

    return called;
  }

  function placeViaReactMap(coord) {
    const element = document.querySelector('[class^="guess-map_canvas__"]');
    if (element) {
      const fiber = element[reactFiberKey(element)];
      const mapClick = fiber?.return?.return?.memoizedProps?.map?.__e3_?.click;

      if (callReactMapHandlers(mapClick, coord)) return true;
    }

    const streakElement = document.getElementsByClassName("region-map_mapCanvas__0dWlf")[0];
    if (streakElement) {
      const fiber = streakElement[reactFiberKey(streakElement)];
      const mapClick = fiber?.return?.return?.memoizedProps?.map?.__e3_?.click;

      if (callReactMapHandlers(mapClick, coord, true)) return true;
    }

    return false;
  }

  function placeOnCanvas(coord) {
    const candidates = mapCandidates().slice(0, 5);
    if (!candidates.length) return false;

    for (const candidate of candidates) {
      const point = mercatorPoint(coord, candidate.rect);
      const x = Math.min(candidate.rect.right - 1, Math.max(candidate.rect.left + 1, candidate.rect.left + point.x));
      const y = Math.min(candidate.rect.bottom - 1, Math.max(candidate.rect.top + 1, candidate.rect.top + point.y));
      const target = document.elementFromPoint(x, y) || candidate.canvas;

      clickElementChain(target, x, y);
      if (target !== candidate.canvas) clickElementChain(candidate.canvas, x, y);
    }

    clearBadge();
    window.dispatchEvent(new CustomEvent("local-injector:placed", { detail: coord }));
    return true;
  }

  function placeOnMap(coord, quiet = false) {
    if (placeViaReactMap(coord)) {
      clearBadge();
      window.dispatchEvent(new CustomEvent("local-injector:placed", { detail: coord }));
      return true;
    }

    const maps = state.maps.filter(visibleContainer);

    for (const map of maps) {
      try {
        if (typeof map.setCenter === "function") map.setCenter([coord.lng, coord.lat]);
        if (typeof map.setZoom === "function" && typeof map.getZoom === "function") {
          map.setZoom(Math.max(map.getZoom(), 2));
        }

        const point = map.project && map.project([coord.lng, coord.lat]);
        if (!point) continue;

        dispatchCanvasClick(map, coord, point);
        clearBadge();
        window.dispatchEvent(new CustomEvent("local-injector:placed", { detail: coord }));
        return true;
      } catch {
        // Try the next visible map.
      }
    }

    if (placeOnCanvas(coord)) return true;

    if (!quiet) return viewportFallbackClick(coord);

    return false;
  }

  function currentCoord() {
    return state.current || state.locations[state.locations.length - 1] || null;
  }

  function openMaps(coord = currentCoord()) {
    if (!isCoord(coord)) return false;

    window.open(`https://maps.google.com/?output=embed&q=${coord.lat},${coord.lng}&ll=${coord.lat},${coord.lng}&z=5`);
    clearBadge();
    return true;
  }

  window.__localInjectorStatus = function localInjectorStatus() {
    return {
      ready: true,
      current: currentCoord(),
      source: state.source,
      locations: state.locations.length,
      maps: state.maps.length,
      targets: document.querySelectorAll(MAP_TARGET_SELECTOR).length,
      clickTargets: mapCandidates().length,
      targetSummary: targetSummary(),
      visibleActions: visibleActionSummary(),
      badge: "",
    };
  };

  window.__localInjectorPlace = async function localInjectorPlace(coord, mode = "exact", options = {}) {
    const target = isCoord(coord) ? coord : currentCoord();
    if (!target) {
      clearBadge();
      return { ok: false, reason: "no location", status: window.__localInjectorStatus() };
    }

    if (mode === "maps") return { ok: openMaps(target), status: window.__localInjectorStatus() };

    const guess = mode === "nearby" ? nearbyCoord(target, options.scoreRange) : target;
    if (placeOnMap(guess, true)) return { ok: true, status: window.__localInjectorStatus() };

    openGuessMap();
    await delay(300);

    return { ok: placeOnMap(guess), status: window.__localInjectorStatus() };
  };

  function isPwaWindow() {
    return (
      window.navigator.standalone === true ||
      ["standalone", "minimal-ui", "fullscreen", "window-controls-overlay"].some((mode) =>
        window.matchMedia?.(`(display-mode: ${mode})`)?.matches,
      )
    );
  }

  function ensurePwaPanel(force = false) {
    if (window.top !== window || (!force && !isPwaWindow()) || document.getElementById("pnj-pwa-panel")) return;

    const host = document.createElement("div");
    host.id = "pnj-pwa-panel";
    host.dataset.open = "false";
    host.innerHTML = `
      <style>
        #pnj-pwa-panel {
          position: fixed;
          left: 18px;
          bottom: 18px;
          z-index: 2147483647;
          width: min(360px, calc(100vw - 36px));
          color: #fff;
          font: 950 14px/1.2 "Arial Rounded MT Bold", system-ui, sans-serif;
        }
        #pnj-pwa-panel * { box-sizing: border-box; }
        #pnj-pwa-panel button {
          width: 100%;
          min-height: 46px;
          margin: 0 0 10px;
          border: 0;
          border-radius: 999px;
          background: linear-gradient(180deg, #b999ff, #6d3ad6);
          box-shadow: inset 0 2px 0 rgba(255,255,255,.35), 0 5px 0 #321071;
          color: #fff;
          cursor: pointer;
          font: inherit;
          text-transform: uppercase;
          text-shadow: 0 2px 0 rgba(30,8,92,.55);
        }
        #pnj-pwa-panel .launcher {
          width: 112px;
          height: 58px;
          margin: 0;
          padding: 0 16px 0 56px;
          border-radius: 16px;
          background:
            10px center / 40px 40px no-repeat url("data:image/png;base64,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"),
            linear-gradient(180deg, #b999ff, #6d3ad6);
          font-size: 18px;
          text-align: right;
        }
        #pnj-pwa-panel .panel {
          padding: 16px;
          border: 3px solid #7551c8;
          border-radius: 22px;
          background: linear-gradient(180deg, #5b28b4, #35106f);
          box-shadow: 0 12px 28px rgba(17,5,47,.42), inset 0 0 0 2px #7551c8;
        }
        #pnj-pwa-panel h2 {
          margin: 0 0 14px;
          font-size: 20px;
          font-style: italic;
          text-align: center;
          text-shadow: 0 3px 0 rgba(25,8,85,.65);
        }
        #pnj-pwa-panel .range {
          margin-bottom: 12px;
          padding: 12px;
          border: 2px solid rgba(255,255,255,.18);
          border-radius: 16px;
          background: rgba(24,6,68,.42);
        }
        #pnj-pwa-panel .range-title {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 12px;
          text-transform: uppercase;
        }
        #pnj-pwa-panel .range-slider {
          --range-left: 90%;
          --range-right: 98%;
          position: relative;
          height: 34px;
          margin: 8px 0 14px;
        }
        #pnj-pwa-panel .range-slider::before,
        #pnj-pwa-panel .range-slider::after {
          content: "";
          position: absolute;
          top: 13px;
          height: 8px;
          border-radius: 999px;
        }
        #pnj-pwa-panel .range-slider::before {
          inset-inline: 0;
          background: rgba(255,255,255,.28);
        }
        #pnj-pwa-panel .range-slider::after {
          left: var(--range-left);
          right: calc(100% - var(--range-right));
          background: #ff416d;
        }
        #pnj-pwa-panel .range-slider input[type="range"] {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 34px;
          margin: 0;
          appearance: none;
          border: 0;
          outline: none;
          background: transparent;
          box-shadow: none;
          pointer-events: none;
        }
        #pnj-pwa-panel .range-slider input[type="range"]:focus {
          outline: none;
        }
        #pnj-pwa-panel .range-slider input[type="range"]::-webkit-slider-runnable-track {
          height: 8px;
          background: transparent;
        }
        #pnj-pwa-panel .range-slider input[type="range"]::-webkit-slider-thumb {
          width: 20px;
          height: 20px;
          margin-top: -6px;
          border: 0;
          border-radius: 50%;
          appearance: none;
          background: #ff416d;
          box-shadow: 0 2px 0 rgba(58,11,111,.65);
          pointer-events: auto;
        }
        #pnj-pwa-panel iframe {
          width: 100%;
          height: 210px;
          border: 2px solid rgba(255,255,255,.18);
          border-radius: 16px;
          background: rgba(24,6,68,.42);
        }
        #pnj-pwa-panel small {
          display: block;
          margin-top: 8px;
          color: #c7b5ff;
          text-align: center;
        }
        #pnj-pwa-panel[data-open="true"] .launcher { display: none; }
        #pnj-pwa-panel[data-open="false"] .panel { display: none; }
      </style>
      <button class="launcher" data-pnj-toggle type="button" aria-label="Open PNJ GeoGuessr Tools">PNJ</button>
      <div class="panel">
        <h2>PNJ GeoGuessr Tools</h2>
        <button data-pnj-toggle type="button">Close</button>
        <button data-pnj-place="exact" type="button">Place exact</button>
        <div class="range">
          <div class="range-title"><span>Score range</span><span data-pnj-range-value>4500-4900</span></div>
          <div class="range-slider" data-pnj-slider>
            <input data-pnj-min type="range" min="0" max="5000" step="50" value="4500">
            <input data-pnj-max type="range" min="0" max="5000" step="50" value="4900">
          </div>
          <button data-pnj-place="nearby" type="button">Place range</button>
        </div>
        <button data-pnj-refresh type="button">Refresh map</button>
        <iframe data-pnj-map title="Round map"></iframe>
        <small>&copy;<span data-pnj-year></span></small>
      </div>
    `;

    const minInput = host.querySelector("[data-pnj-min]");
    const maxInput = host.querySelector("[data-pnj-max]");
    const rangeValue = host.querySelector("[data-pnj-range-value]");
    const rangeSlider = host.querySelector("[data-pnj-slider]");
    const mapFrame = host.querySelector("[data-pnj-map]");
    const scoreRange = () => {
      const min = Math.max(0, Math.min(5000, Number(minInput.value || 4500)));
      const max = Math.max(0, Math.min(5000, Number(maxInput.value || 4900)));
      return { min: Math.min(min, max), max: Math.max(min, max) };
    };
    const updateRange = () => {
      const range = scoreRange();
      rangeSlider.style.setProperty("--range-left", `${range.min / 50}%`);
      rangeSlider.style.setProperty("--range-right", `${range.max / 50}%`);
      rangeValue.textContent = `${range.min}-${range.max}`;
    };
    const refreshMap = () => {
      const coord = currentCoord();
      if (isCoord(coord)) mapFrame.src = `https://maps.google.com/maps?q=${coord.lat},${coord.lng}&z=6&output=embed`;
    };

    host.querySelector("[data-pnj-year]").textContent = new Date().getFullYear();
    host.addEventListener("input", updateRange);
    host.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.pnjToggle !== undefined) {
        host.dataset.open = String(host.dataset.open !== "true");
        refreshMap();
        return;
      }
      if (button.dataset.pnjRefresh !== undefined) refreshMap();
      if (button.dataset.pnjPlace) {
        window.__localInjectorPlace(currentCoord(), button.dataset.pnjPlace, { scoreRange: scoreRange() }).then(refreshMap);
      }
    });
    window.addEventListener("local-injector:location", refreshMap);

    updateRange();
    refreshMap();
    document.documentElement.appendChild(host);
  }

  document.documentElement.dataset.localInjectorInternal = "ready";
  clearBadge();
  window.__pnjShowPanel = () => ensurePwaPanel(true);
  window.__pnjHidePanel = () => document.getElementById("pnj-pwa-panel")?.remove();
  ensurePwaPanel();
  window.addEventListener("DOMContentLoaded", ensurePwaPanel, { once: true });
  window.addEventListener("DOMContentLoaded", clearBadge, { once: true });
  patchFetch();
  patchXhr();
  hookMapLibrary("mapboxgl");
  hookMapLibrary("maplibregl");
  window.dispatchEvent(new CustomEvent("local-injector:internal-ready"));
})();
