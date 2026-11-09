// The overlay layer for the FM-1 emulator: any number of pictures and stickers laid on the case,
// each draggable, resizable, rotatable and removable, and kept across visits. Shared by the sticker
// palette (stickers.js) and the picture tool (customize.js) through window.FM1Overlay. Pure DOM.
(function () {
  "use strict";
  const KEY = "fm1.overlays.v1";
  let stage = null, layer = null, items = [], selected = null, nextId = 1, editing = false, changeCb = null;
  const editSources = new Set();   // stickers palette / customize drawer; items are interactive only while one is open
  function notify() { try { changeCb && changeCb(items.length); } catch (e) {} }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(items.map((i) => ({ type: i.type, data: i.data, x: i.x, y: i.y, size: i.size, rot: i.rot })))); }
    catch (e) { console.warn("FM1 overlays: couldn't save (storage full? a large picture can exceed the quota)", e); }
  }
  function clampXY(v) { return Math.max(0, Math.min(100, v)); }

  // keep-out zones (fractions of the 1280x820 panel canvas) so stickers can't cover the controls:
  // the screen, the two knob clusters, the OCT buttons and the FX..REC button grid. Keys are fine.
  const KEEPOUT = [
    [0.275, 0.029, 0.678, 0.659], // screen well
    [0.043, 0.098, 0.238, 0.427], // MASTER/SELECT/PRESETS/ALGORITHM knobs
    [0.695, 0.091, 0.984, 0.201], // KNOB1-4
    [0.043, 0.478, 0.238, 0.546], // OCT- / OCT+
    [0.702, 0.276, 0.986, 0.461], // FX..GLO / HOME..REC
  ];
  // nudge a sticker's centre out of any control zone (inflated by its half-size so the whole
  // sticker clears). Pictures are left free.
  function pushOut(it) {
    if (it.type !== "sticker") return;
    const canvas = window.FM1 && window.FM1.panelCanvas; if (!canvas || !stage) return;
    const sr = stage.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
    if (!cr.width || !cr.height || !sr.width) return;
    const hx = (it.size * 0.42) / cr.width, hy = (it.size * 0.42) / cr.height;
    for (let pass = 0; pass < 5; pass++) {
      const fx = (sr.left + it.x / 100 * sr.width - cr.left) / cr.width;
      const fy = (sr.top + it.y / 100 * sr.height - cr.top) / cr.height;
      let moved = false;
      for (const [x0, y0, x1, y1] of KEEPOUT) {
        if (fx > x0 - hx && fx < x1 + hx && fy > y0 - hy && fy < y1 + hy) {
          const dl = fx - (x0 - hx), dr = (x1 + hx) - fx, dt = fy - (y0 - hy), db = (y1 + hy) - fy;
          const m = Math.min(dl, dr, dt, db);
          let nfx = fx, nfy = fy;
          if (m === dl) nfx = x0 - hx; else if (m === dr) nfx = x1 + hx;
          else if (m === dt) nfy = y0 - hy; else nfy = y1 + hy;
          it.x = clampXY((cr.left + nfx * cr.width - sr.left) / sr.width * 100);
          it.y = clampXY((cr.top + nfy * cr.height - sr.top) / sr.height * 100);
          moved = true;
        }
      }
      if (!moved) break;
    }
  }
  function deselect() { if (selected) { selected.el.classList.remove("sel"); selected = null; } }
  function select(it) { deselect(); selected = it; it.el.classList.add("sel"); layer.appendChild(it.el); } // raise

  function placeEl(it) {
    it.el.style.left = it.x + "%";
    it.el.style.top = it.y + "%";
    it.el.style.transform = `translate(-50%,-50%) rotate(${it.rot}deg)`;
    if (it.type === "img") it.content.style.width = it.size + "px";
    else it.content.style.fontSize = it.size + "px";
  }

  function render(it) {
    const el = document.createElement("div"); el.className = "fm1-ov"; it.el = el;
    const content = document.createElement(it.type === "img" ? "img" : "div");
    content.className = "fm1-ov-c"; it.content = content;
    if (it.type === "img") { content.src = it.data; content.draggable = false; }
    else { content.textContent = it.data; }
    el.appendChild(content);
    // chrome handles (shown only when selected, via CSS)
    el.insertAdjacentHTML("beforeend",
      `<button class="h del" title="Remove">×</button><div class="h rot" title="Rotate">↻</div><div class="h rsz" title="Resize">⤡</div>`);
    layer.appendChild(el);
    placeEl(it);
    wire(it);
    return it;
  }

  function wire(it) {
    const el = it.el;
    // move (drag the body)
    let mode = null, sx = 0, sy = 0, cx = 0, cy = 0, s0 = 0, r0 = 0, a0 = 0;
    const center = () => { const r = stage.getBoundingClientRect(); return { x: r.left + it.x / 100 * r.width, y: r.top + it.y / 100 * r.height, r }; };
    el.addEventListener("pointerdown", (e) => {
      if (e.target.classList.contains("h")) return; // handles have their own
      e.preventDefault(); select(it); mode = "move"; el.setPointerCapture(e.pointerId);
      const c = center(); sx = e.clientX - c.x; sy = e.clientY - c.y;
    });
    el.addEventListener("pointermove", (e) => {
      if (mode !== "move") return;
      const r = stage.getBoundingClientRect();
      it.x = clampXY((e.clientX - sx - r.left) / r.width * 100);
      it.y = clampXY((e.clientY - sy - r.top) / r.height * 100);
      pushOut(it);
      placeEl(it);
    });
    el.addEventListener("pointerup", (e) => { if (mode) { mode = null; persist(); try { el.releasePointerCapture(e.pointerId); } catch {} } });
    // wheel to resize
    el.addEventListener("wheel", (e) => { e.preventDefault(); select(it); it.size = Math.max(14, Math.min(900, it.size * (e.deltaY < 0 ? 1.1 : 0.9))); pushOut(it); placeEl(it); persist(); }, { passive: false });
    // delete
    el.querySelector(".del").addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); remove(it); });
    // resize handle
    const rsz = el.querySelector(".rsz");
    rsz.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); select(it); mode = "rsz"; rsz.setPointerCapture(e.pointerId); const c = center(); cx = c.x; cy = c.y; s0 = it.size; const d = Math.hypot(e.clientX - cx, e.clientY - cy); a0 = d || 1; });
    rsz.addEventListener("pointermove", (e) => { if (mode !== "rsz") return; const d = Math.hypot(e.clientX - cx, e.clientY - cy); it.size = Math.max(14, Math.min(900, s0 * d / a0)); pushOut(it); placeEl(it); });
    rsz.addEventListener("pointerup", (e) => { if (mode === "rsz") { mode = null; persist(); try { rsz.releasePointerCapture(e.pointerId); } catch {} } });
    // rotate handle
    const rot = el.querySelector(".rot");
    rot.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); select(it); mode = "rot"; rot.setPointerCapture(e.pointerId); const c = center(); cx = c.x; cy = c.y; r0 = it.rot; a0 = Math.atan2(e.clientY - cy, e.clientX - cx); });
    rot.addEventListener("pointermove", (e) => { if (mode !== "rot") return; const a = Math.atan2(e.clientY - cy, e.clientX - cx); it.rot = Math.round((r0 + (a - a0) * 180 / Math.PI) % 360); placeEl(it); });
    rot.addEventListener("pointerup", (e) => { if (mode === "rot") { mode = null; persist(); try { rot.releasePointerCapture(e.pointerId); } catch {} } });
    // double-click removes too (quick for kids)
    el.addEventListener("dblclick", (e) => { e.preventDefault(); remove(it); });
  }

  function remove(it) { it.el.remove(); items = items.filter((x) => x !== it); if (selected === it) selected = null; persist(); notify(); }

  function add(type, data, opts) {
    opts = opts || {};
    // when no drop point is given, cascade so repeated adds don't stack exactly on each other
    const casc = (items.length % 6) * 4 - 10;
    const it = { id: nextId++, type, data, x: opts.x ?? (50 + casc), y: opts.y ?? (42 + casc), size: opts.size ?? (type === "img" ? 180 : 64), rot: opts.rot ?? 0 };
    it.x = clampXY(it.x); it.y = clampXY(it.y);
    items.push(it); render(it); pushOut(it); placeEl(it); select(it); persist(); notify();
    return it;
  }

  const api = {
    _live: true,
    addSticker: (char, opts) => stage ? add("sticker", char, opts) : null,
    addImage: (src, opts) => stage ? add("img", src, opts) : null,
    clear: () => { items.slice().forEach(remove); },
    count: () => items.length,
    // interactive (drag/resize/delete) only while arranging; otherwise clicks pass to the panel
    setEditing: (on, source) => {
      source = source || "default";
      if (on) editSources.add(source); else editSources.delete(source);
      editing = editSources.size > 0;
      if (layer) layer.classList.toggle("edit", editing);
      if (!editing) deselect();
    },
    editing: () => editing,
    onChange: (fn) => { changeCb = fn; },
    // draw every overlay onto a 2D context whose pixels map 1:1 to the panel canvas
    compositeOnto(ctx, canvas) {
      if (!stage || !canvas) return;
      const sr = stage.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
      const sx = canvas.width / cr.width, sy = canvas.height / cr.height;   // display px -> canvas px
      for (const it of items) {
        const px = (sr.left + it.x / 100 * sr.width - cr.left) * sx;
        const py = (sr.top + it.y / 100 * sr.height - cr.top) * sy;
        ctx.save(); ctx.translate(px, py); ctx.rotate(it.rot * Math.PI / 180);
        if (it.type === "img" && it.content.complete && it.content.naturalWidth) {
          const w = it.size * sx, h = w * (it.content.naturalHeight / it.content.naturalWidth || 1);
          ctx.drawImage(it.content, -w / 2, -h / 2, w, h);
        } else if (it.type === "sticker") {
          ctx.font = `${it.size * sy}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(it.data, 0, 0);
        }
        ctx.restore();
      }
    },
  };

  function styles() {
    const el = document.createElement("style"); el.textContent = `
      #fm1-ov-layer{position:absolute;inset:0;z-index:45;pointer-events:none;overflow:hidden}
      /* items are display-only (clicks pass through to the panel) until edit mode is on */
      .fm1-ov{position:absolute;pointer-events:none;cursor:move;touch-action:none;user-select:none;will-change:transform}
      #fm1-ov-layer.edit .fm1-ov{pointer-events:auto}
      .fm1-ov .fm1-ov-c{display:block;filter:drop-shadow(0 3px 5px rgba(0,0,0,.45));pointer-events:none;
        line-height:1;font-family:"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif;text-align:center}
      .fm1-ov img.fm1-ov-c{height:auto}
      .fm1-ov .h{position:absolute;display:none;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;
        background:var(--ui-pop,#0c0d0f);border:1.5px solid var(--amber);color:var(--ui-text,#fff);font-size:15px;cursor:pointer;z-index:2;line-height:1;padding:0}
      #fm1-ov-layer.edit .fm1-ov.sel{outline:1.5px dashed color-mix(in srgb,var(--amber) 90%,transparent);outline-offset:3px}
      #fm1-ov-layer.edit .fm1-ov.sel .h{display:flex}
      /* a faint dashed frame on every item while arranging, so you can see what's grabbable */
      #fm1-ov-layer.edit .fm1-ov{outline:1px dashed color-mix(in srgb,var(--amber) 35%,transparent);outline-offset:2px}
      .fm1-ov .del{top:-13px;right:-13px;cursor:pointer}
      .fm1-ov .rot{top:-13px;left:-13px;cursor:grab;font-size:14px}
      .fm1-ov .rsz{bottom:-13px;right:-13px;cursor:nwse-resize}
      @media (pointer:coarse){ .fm1-ov .h{width:32px;height:32px;font-size:17px} }`;
    document.head.appendChild(el);
  }

  function boot(st) {
    stage = st;
    if (getComputedStyle(stage).position === "static") stage.style.position = "relative";
    styles();
    layer = document.createElement("div"); layer.id = "fm1-ov-layer"; stage.appendChild(layer);
    // click empty area deselects
    stage.addEventListener("pointerdown", (e) => { if (!e.target.closest(".fm1-ov")) deselect(); }, true);
    // restore saved overlays
    let saved = []; try { saved = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch {}
    // migrate the old single picture decal, if any
    try { const old = JSON.parse(localStorage.getItem("fm1.decal") || "null"); if (old && old.src) { saved.push({ type: "img", data: old.src, x: (old.x ?? 40) + 10, y: (old.y ?? 30) + 10, size: old.w ?? 180, rot: 0 }); localStorage.removeItem("fm1.decal"); } } catch {}
    for (const s of (Array.isArray(saved) ? saved : [])) {
      const it = { id: nextId++, type: s.type === "img" ? "img" : "sticker", data: s.data, x: s.x ?? 50, y: s.y ?? 42, size: s.size ?? 64, rot: s.rot ?? 0 };
      items.push(it); render(it);
    }
    deselect();
    persist();
    window.FM1Overlay = api;
  }

  // wait for the panel stage
  const t = setInterval(() => { if (window.FM1 && window.FM1.stage) { clearInterval(t); boot(window.FM1.stage); } }, 120);
  setTimeout(() => clearInterval(t), 9000);
  // a lightweight stub so callers before boot don't crash
  window.FM1Overlay = window.FM1Overlay || { addSticker() {}, addImage() {}, clear() {}, count() { return 0; }, compositeOnto() {}, setEditing() {}, editing() { return false; }, onChange() {} };
})();
