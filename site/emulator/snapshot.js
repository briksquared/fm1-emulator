// Snapshot: save the FM-1 panel (with its live LCD) as a PNG, and copy it to
// the clipboard when the browser allows. The panel canvas is drawn from wasm
// memory via putImageData — same-origin, so toBlob is not tainted.
(function () {
  "use strict";
  const FM = () => window.FM1;

  // Pure and unit-tested: a safe, dated filename for the running firmware.
  function snapshotName(firmware, date) {
    const d = date || new Date();
    const stamp = d.toISOString().slice(0, 19).replace(/[:T]/g, "-");
    return ((firmware || "fm1") + "-" + stamp).replace(/[^A-Za-z0-9._-]/g, "_") + ".png";
  }

  function canvas() {
    const fm = FM();
    const c = fm && fm.panelCanvas;
    return c && c.width && c.height ? c : null;
  }

  function capture() {
    const c = canvas();
    if (!c) return Promise.resolve(null);
    return new Promise((resolve) => {
      try { c.toBlob((b) => resolve(b), "image/png"); }
      catch (e) { console.warn("snapshot: toBlob failed", e); resolve(null); }
    });
  }

  async function copy(blob) {
    try {
      if (!blob || !window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write) return false;
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return true;
    } catch (e) { return false; }   // clipboard needs focus/permission; a failure is not fatal
  }

  window.FM1Snapshot = { name: snapshotName, capture, copy };

  function ready(fn) {
    const t = setInterval(() => {
      const nav = document.querySelector(".sitenav") || document.querySelector("header.site .wrap");
      if (nav && window.FM1) { clearInterval(t); fn(nav); }
    }, 120);
    setTimeout(() => clearInterval(t), 9000);
  }
  ready((nav) => {
    const css = document.createElement("style");
    css.textContent = `
      #snap-btn .dot{display:inline-block;width:7px;height:7px;border-radius:2px;
        background:#3a3d44;margin-right:5px;vertical-align:middle}
      #snap-flash{position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:9996;transition:opacity .09s}
      #snap-flash.on{opacity:.5;transition:none}`;
    document.head.appendChild(css);

    const flash = document.createElement("div");
    flash.id = "snap-flash";
    document.body.appendChild(flash);

    const btn = document.createElement("a");
    btn.href = "#"; btn.id = "snap-btn"; btn.className = "sitelink";
    btn.innerHTML = `<span class="dot"></span>Snapshot`;
    btn.title = "Save the panel as a PNG (and copy it to the clipboard)";

    let busy = false;
    btn.onclick = async (e) => {
      e.preventDefault();
      if (busy) return;
      busy = true;
      const blob = await capture();
      if (!blob) { btn.title = "Nothing to capture — press Start first."; busy = false; return; }
      // Brief flash so it reads as a camera shutter.
      flash.classList.add("on");
      requestAnimationFrame(() => requestAnimationFrame(() => flash.classList.remove("on")));
      const fm = FM();
      const rf = (fm.runningFirmware && fm.runningFirmware()) || {};
      const name = snapshotName(rf.name, new Date());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      const copied = await copy(blob);
      btn.title = `Saved ${name}${copied ? " · copied to clipboard" : ""}`;
      busy = false;
    };
    nav.insertBefore(btn, nav.firstChild ? nav.firstChild.nextSibling : null);
  });
})();
