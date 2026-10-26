(function () {
  "use strict";

  const TILE_SIZE = 256;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 18;
  const MAX_FIT_ZOOM = 12;
  const SINGLE_MARKER_ZOOM = 6;
  const EMPTY_VIEW_ZOOM = 2;
  const EMPTY_VIEW_LAT = 20;
  const EMPTY_VIEW_LNG = 0;
  const FIT_PADDING = 40;
  const MAX_LATITUDE = 85.0511287798;
  const WHEEL_STEP_MS = 150;
  const ZOOM_ANIMATION_MS = 220;
  const ANSWER_ID = "answer";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const PIN_COLORS = { answer: "#e53935", opponent: "#1e6bff" };
  const OPPONENT_NOTES = {
    guessed: "Opponent guessed · coordinates hidden",
    waiting: "Opponent · no pin yet",
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function wrap(value, size) {
    return ((value % size) + size) % size;
  }

  function worldSize(zoom) {
    return TILE_SIZE * 2 ** zoom;
  }

  function project(lat, lng, zoom) {
    const sin = Math.sin((clamp(lat, -MAX_LATITUDE, MAX_LATITUDE) * Math.PI) / 180);
    const size = worldSize(zoom);
    return {
      x: ((lng + 180) / 360) * size,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
    };
  }

  function centreOn(lat, lng, zoom) {
    const point = project(lat, lng, zoom);
    return { zoom, x: point.x, y: point.y };
  }

  function boundsAt(markers, zoom) {
    const points = markers.map((m) => project(m.lat, m.lng, zoom));
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }

  function boundsFit(box, width, height) {
    return (
      box.maxX - box.minX + 2 * FIT_PADDING <= width &&
      box.maxY - box.minY + 2 * FIT_PADDING <= height
    );
  }

  // Bounds ignore antimeridian wrapping.
  function fitView(markers, width, height) {
    if (markers.length === 0) return centreOn(EMPTY_VIEW_LAT, EMPTY_VIEW_LNG, EMPTY_VIEW_ZOOM);
    if (markers.length === 1) return centreOn(markers[0].lat, markers[0].lng, SINGLE_MARKER_ZOOM);
    let zoom = MAX_FIT_ZOOM;
    let box = boundsAt(markers, zoom);
    while (zoom > MIN_ZOOM && !boundsFit(box, width, height)) {
      zoom -= 1;
      box = boundsAt(markers, zoom);
    }
    return { zoom, x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  }

  function fitKeyOf(markers) {
    return markers.map((m) => `${m.lat.toFixed(5)},${m.lng.toFixed(5)}`).join("|");
  }

  function answerKeyOf(markers) {
    return fitKeyOf(markers.filter((m) => m.kind === "answer"));
  }

  function normalizeView(view) {
    const size = worldSize(view.zoom);
    return { zoom: view.zoom, x: wrap(view.x, size), y: clamp(view.y, 0, size) };
  }

  function panBy(view, dx, dy) {
    return normalizeView({ zoom: view.zoom, x: view.x - dx, y: view.y - dy });
  }

  function zoomAt(view, nextZoom, px, py, width, height) {
    const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    if (zoom === view.zoom) return view;
    const factor = 2 ** (zoom - view.zoom);
    const dx = px - width / 2;
    const dy = py - height / 2;
    return normalizeView({
      zoom,
      x: (view.x + dx) * factor - dx,
      y: (view.y + dy) * factor - dy,
    });
  }

  // Integer origin keeps tiles seam-free and markers glued to them.
  function viewOrigin(view, width, height) {
    return { x: Math.round(view.x - width / 2), y: Math.round(view.y - height / 2) };
  }

  // Tiles exist only at whole zoom levels; a view between two levels shows the nearer one, scaled.
  function tileZoomOf(view) {
    return clamp(Math.round(view.zoom), MIN_ZOOM, MAX_ZOOM);
  }

  // Each edge is rounded on its own, so neighbouring tiles meet without a seam at any scale.
  function tileRect(tileZoom, col, row, view, origin) {
    const span = TILE_SIZE * 2 ** (view.zoom - tileZoom);
    const left = Math.round(col * span) - origin.x;
    const top = Math.round(row * span) - origin.y;
    return {
      left,
      top,
      width: Math.round((col + 1) * span) - origin.x - left,
      height: Math.round((row + 1) * span) - origin.y - top,
    };
  }

  function visibleTiles(view, width, height) {
    const zoom = tileZoomOf(view);
    const count = 2 ** zoom;
    const span = TILE_SIZE * 2 ** (view.zoom - zoom);
    const origin = viewOrigin(view, width, height);
    const firstCol = Math.floor(origin.x / span);
    const lastCol = Math.floor((origin.x + width - 1) / span);
    const firstRow = Math.max(0, Math.floor(origin.y / span));
    const lastRow = Math.min(count - 1, Math.floor((origin.y + height - 1) / span));
    const tiles = [];
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let col = firstCol; col <= lastCol; col += 1) {
        const x = wrap(col, count);
        tiles.push({
          // Unwrapped column: at low zoom the same tile can appear twice side by side.
          key: `${zoom}/${col}/${row}`,
          coord: `${zoom}/${x}/${row}`,
          url: `https://mt${(x + row) % 4}.google.com/vt/lyrs=m&hl=en&x=${x}&y=${row}&z=${zoom}`,
          zoom,
          col,
          row,
          ...tileRect(zoom, col, row, view, origin),
        });
      }
    }
    return tiles;
  }

  function placeMarkers(markers, view, width, height) {
    const origin = viewOrigin(view, width, height);
    const size = worldSize(view.zoom);
    return markers.map((marker) => {
      const point = project(marker.lat, marker.lng, view.zoom);
      const dx = point.x - view.x;
      const nearestX = view.x + dx - size * Math.round(dx / size);
      return { marker, x: Math.round(nearestX - origin.x), y: Math.round(point.y - origin.y) };
    });
  }

  function isMarker(value) {
    return (
      Boolean(value) &&
      typeof value.id === "string" &&
      (value.kind === "answer" || value.kind === "opponent") &&
      Number.isFinite(value.lat) &&
      Number.isFinite(value.lng)
    );
  }

  function parseMarkers(input) {
    if (!Array.isArray(input)) return [];
    return input.filter(isMarker).map((m) => ({
      id: m.id,
      kind: m.kind,
      lat: m.lat,
      lng: m.lng,
      label: typeof m.label === "string" ? m.label : "",
    }));
  }

  function formatCount(value) {
    return Math.round(value).toLocaleString("en-US");
  }

  function opponentLabel(opponent) {
    const parts = [opponent.status === "guess" ? "Guess" : "Pin"];
    if (Number.isFinite(opponent.distanceKm)) {
      parts.push(`${formatCount(opponent.distanceKm)} km`);
      if (Number.isFinite(opponent.score)) parts.push(`≈${formatCount(opponent.score)}`);
    }
    return parts.join(" · ");
  }

  function markersFor(answer, view) {
    const markers = [];
    if (answer && Number.isFinite(answer.lat) && Number.isFinite(answer.lng)) {
      markers.push({ id: ANSWER_ID, kind: "answer", lat: answer.lat, lng: answer.lng });
    }

    const notes = [];
    const opponents = Array.isArray(view?.opponents) ? view.opponents.filter(Boolean) : [];
    for (const opponent of opponents) {
      if (Number.isFinite(opponent.lat) && Number.isFinite(opponent.lng)) {
        markers.push({
          id: opponent.playerId,
          kind: "opponent",
          lat: opponent.lat,
          lng: opponent.lng,
          label: opponentLabel(opponent),
        });
      } else if (OPPONENT_NOTES[opponent.status]) {
        notes.push(OPPONENT_NOTES[opponent.status]);
      }
    }
    return { markers, note: notes.join("\n") };
  }

  function createLayerElement(doc) {
    const element = doc.createElement("div");
    element.style.cssText =
      "position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;pointer-events:none;";
    return element;
  }

  function createTileImage(doc, tile, onLoad) {
    const img = doc.createElement("img");
    img.setAttribute("data-pnj-tile", tile.coord);
    img.alt = "";
    img.draggable = false;
    img.decoding = "async";
    img.style.cssText =
      "position:absolute;display:block;max-width:none;max-height:none;margin:0;padding:0;border:0;user-select:none;";
    img.addEventListener("load", onLoad);
    img.addEventListener("error", onLoad);
    img.src = tile.url;
    return img;
  }

  function placeTile(img, rect, layer) {
    img.style.left = `${rect.left}px`;
    img.style.top = `${rect.top}px`;
    img.style.width = `${rect.width}px`;
    img.style.height = `${rect.height}px`;
    img.style.zIndex = layer;
  }

  // When the zoom level changes, the previous level's tiles stay underneath, scaled to the
  // new view, until every new tile has loaded, so a zoom never flashes an empty map.
  function createTileLayer(doc, onTileLoad) {
    const element = createLayerElement(doc);
    // Its own stacking context keeps the tile z-indexes below the marker layer.
    element.style.zIndex = "0";
    const tiles = new Map();
    return {
      element,
      sync(view, width, height) {
        const visible = visibleTiles(view, width, height);
        const zoom = tileZoomOf(view);
        const origin = viewOrigin(view, width, height);
        const wanted = new Set();
        for (const tile of visible) {
          wanted.add(tile.key);
          let entry = tiles.get(tile.key);
          if (!entry) {
            entry = { img: createTileImage(doc, tile, onTileLoad), zoom: tile.zoom, col: tile.col, row: tile.row };
            tiles.set(tile.key, entry);
            element.appendChild(entry.img);
          }
          placeTile(entry.img, tile, "1");
        }
        const loading = visible.some((tile) => !tiles.get(tile.key).img.complete);
        for (const [key, entry] of tiles) {
          if (wanted.has(key)) continue;
          if (!loading || Math.abs(entry.zoom - zoom) !== 1) {
            entry.img.remove();
            tiles.delete(key);
          } else {
            placeTile(entry.img, tileRect(entry.zoom, entry.col, entry.row, view, origin), "0");
          }
        }
      },
    };
  }

  function createPinGraphic(doc, color) {
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 28 40");
    svg.setAttribute("width", "28");
    svg.setAttribute("height", "40");
    svg.style.cssText =
      "position:absolute;left:-14px;top:-39px;display:block;overflow:visible;" +
      "filter:drop-shadow(0 1px 2px rgba(0,0,0,0.45));";
    const body = doc.createElementNS(SVG_NS, "path");
    body.setAttribute("d", "M14 1C6.8 1 1 6.7 1 13.8 1 23.6 14 39 14 39s13-15.4 13-25.2C27 6.7 21.2 1 14 1z");
    body.setAttribute("fill", color);
    body.setAttribute("stroke", "#ffffff");
    body.setAttribute("stroke-width", "2");
    const dot = doc.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", "14");
    dot.setAttribute("cy", "14");
    dot.setAttribute("r", "4.5");
    dot.setAttribute("fill", "#ffffff");
    svg.append(body, dot);
    return svg;
  }

  function createChip(doc, color) {
    const chip = doc.createElement("div");
    chip.style.cssText =
      "position:absolute;left:0;bottom:42px;transform:translateX(-50%);display:none;" +
      `white-space:nowrap;padding:3px 7px;border-radius:10px;background:${color};color:#ffffff;` +
      'font:600 11px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:normal;' +
      "text-transform:none;margin:0;box-shadow:0 1px 3px rgba(0,0,0,0.4);pointer-events:none;";
    return chip;
  }

  function setChipLabel(chip, label) {
    if (chip.textContent !== label) chip.textContent = label;
    chip.style.display = label ? "block" : "none";
  }

  function createPin(doc, marker) {
    const element = doc.createElement("div");
    element.setAttribute("data-pnj-marker", marker.kind);
    element.setAttribute("data-pnj-marker-id", marker.id);
    element.style.cssText =
      "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;" +
      `z-index:${marker.kind === "answer" ? 2 : 1};`;
    element.appendChild(createPinGraphic(doc, PIN_COLORS[marker.kind]));
    let chip = null;
    if (marker.kind === "opponent") {
      chip = createChip(doc, PIN_COLORS.opponent);
      element.appendChild(chip);
    }
    return { element, chip };
  }

  function createMarkerLayer(doc) {
    const element = createLayerElement(doc);
    const pins = new Map();
    return {
      element,
      sync(placed) {
        const wanted = new Set();
        for (const { marker, x, y } of placed) {
          const key = `${marker.kind}/${marker.id}`;
          wanted.add(key);
          let pin = pins.get(key);
          if (!pin) {
            pin = createPin(doc, marker);
            pins.set(key, pin);
            element.appendChild(pin.element);
          }
          pin.element.style.transform = `translate(${x}px, ${y}px)`;
          if (pin.chip) setChipLabel(pin.chip, marker.label);
        }
        for (const [key, pin] of pins) {
          if (!wanted.has(key)) {
            pin.element.remove();
            pins.delete(key);
          }
        }
      },
    };
  }

  function createAttribution(doc) {
    const element = doc.createElement("div");
    element.textContent = "Map data ©Google";
    element.style.cssText =
      "position:absolute;right:0;bottom:0;z-index:3;padding:1px 4px;" +
      'font:10px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#444444;' +
      "background:rgba(255,255,255,0.7);pointer-events:none;";
    return element;
  }

  function attachInteraction(container, { getView, setView, zoomBy, finishZoom }) {
    let drag = null;
    let lastWheelStepAt = -Infinity;

    const zoomAround = (event, step) => {
      const rect = container.getBoundingClientRect();
      zoomBy(step, event.clientX - rect.left, event.clientY - rect.top);
    };

    const onPointerDown = (event) => {
      if (event.button !== 0 || drag) return;
      finishZoom();
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      container.style.cursor = "grabbing";
      try {
        container.setPointerCapture(event.pointerId);
      } catch {
        // The pointer already ended; dragging still works without capture.
      }
    };

    const onPointerMove = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag = { pointerId: drag.pointerId, x: event.clientX, y: event.clientY };
      setView(panBy(getView(), dx, dy));
    };

    const onPointerEnd = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag = null;
      container.style.cursor = "grab";
    };

    // A trackpad swipe emits dozens of wheel events, so one step per interval keeps zoom controllable.
    const onWheel = (event) => {
      event.preventDefault();
      const step = Math.sign(-event.deltaY);
      if (step === 0 || event.timeStamp - lastWheelStepAt < WHEEL_STEP_MS) return;
      lastWheelStepAt = event.timeStamp;
      zoomAround(event, step);
    };

    const onDoubleClick = (event) => zoomAround(event, 1);

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerEnd);
    container.addEventListener("pointercancel", onPointerEnd);
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("dblclick", onDoubleClick);

    return function detach() {
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerEnd);
      container.removeEventListener("pointercancel", onPointerEnd);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("dblclick", onDoubleClick);
      drag = null;
    };
  }

  function mount(container) {
    const doc = container.ownerDocument;
    Object.assign(container.style, {
      position: "relative",
      overflow: "hidden",
      touchAction: "none",
      backgroundColor: "#e5e3df",
      cursor: "grab",
      userSelect: "none",
      // Contains marker z-indexes so they never leak into the host page.
      isolation: "isolate",
    });

    const win = doc.defaultView || window;
    let renderQueued = false;
    const scheduleRender = () => {
      if (renderQueued || destroyed) return;
      renderQueued = true;
      win.requestAnimationFrame(() => {
        renderQueued = false;
        if (!destroyed) render();
      });
    };

    const tileLayer = createTileLayer(doc, scheduleRender);
    const markerLayer = createMarkerLayer(doc);
    container.replaceChildren(tileLayer.element, markerLayer.element, createAttribution(doc));

    let state = { markers: [], view: fitView([], 0, 0), fitKey: "", answerKey: "", userMoved: false };
    let destroyed = false;
    let zoomAnimation = null;

    function render() {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      const fitKey = fitKeyOf(state.markers);
      if (fitKey !== state.fitKey) {
        const answerKey = answerKeyOf(state.markers);
        // Opponent pins move constantly, so after the user pans or zooms only a new answer re-fits.
        const refit = !state.userMoved || answerKey !== state.answerKey;
        if (refit) stopZoom();
        state = refit
          ? { ...state, view: fitView(state.markers, width, height), fitKey, answerKey, userMoved: false }
          : { ...state, fitKey, answerKey };
      }
      tileLayer.sync(state.view, width, height);
      markerLayer.sync(placeMarkers(state.markers, state.view, width, height));
    }

    function setView(view) {
      state = { ...state, view, userMoved: true };
      render();
    }

    function stopZoom() {
      if (!zoomAnimation) return;
      win.cancelAnimationFrame(zoomAnimation.frame);
      zoomAnimation = null;
    }

    // A drag lands the zoom on its target first, so the map never rests between two levels.
    function finishZoom() {
      if (!zoomAnimation) return;
      const { finish } = zoomAnimation;
      stopZoom();
      finish();
    }

    // Each step eases to the next whole zoom around the pointer. A step during an animation
    // starts from wherever the view is and moves the target one level further.
    function zoomBy(step, px, py) {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      const from = state.view;
      const target = clamp((zoomAnimation ? zoomAnimation.target : Math.round(from.zoom)) + step, MIN_ZOOM, MAX_ZOOM);
      stopZoom();
      if (target === from.zoom) return;

      const startedAt = win.performance.now();
      const animation = { target, frame: 0, finish: () => setView(zoomAt(from, target, px, py, width, height)) };
      const tick = (now) => {
        if (zoomAnimation !== animation) return;
        const progress = clamp((now - startedAt) / ZOOM_ANIMATION_MS, 0, 1);
        const eased = 1 - (1 - progress) ** 3;
        const zoom = progress === 1 ? target : from.zoom + (target - from.zoom) * eased;
        setView(zoomAt(from, zoom, px, py, width, height));
        if (progress < 1) animation.frame = win.requestAnimationFrame(tick);
        else zoomAnimation = null;
      };
      zoomAnimation = animation;
      animation.frame = win.requestAnimationFrame(tick);
    }

    const detach = attachInteraction(container, { getView: () => state.view, setView, zoomBy, finishZoom });
    const observer = new ResizeObserver(render);
    observer.observe(container);

    return {
      setMarkers(markers) {
        if (destroyed) return;
        state = { ...state, markers: parseMarkers(markers) };
        render();
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        stopZoom();
        observer.disconnect();
        detach();
        container.replaceChildren();
      },
    };
  }

  window.__pnjTileMap = { mount, fitView, markersFor };
})();
