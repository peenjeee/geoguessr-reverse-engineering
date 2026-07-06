(function () {
  const SCRIPT_VERSION = "clean-v7";
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

  document.documentElement.dataset.localInjectorInternal = "ready";
  clearBadge();
  window.addEventListener("DOMContentLoaded", clearBadge, { once: true });
  patchFetch();
  patchXhr();
  hookMapLibrary("mapboxgl");
  hookMapLibrary("maplibregl");
  window.dispatchEvent(new CustomEvent("local-injector:internal-ready"));
})();
