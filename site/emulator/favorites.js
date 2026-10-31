// Favorites for the FM-1 emulator fork: star the firmware you're on, and a quick-load dropdown of
// everything you've starred. Kept in localStorage; the Samplers-style filter chip lives in extras.js
// and reads window.FM1Fav. Pure DOM, injected after the page builds.
(function () {
  "use strict";

  const KEY = "fm1.favs.v1";
  const subs = new Set();
  let ids = load();

  function load() {
    try { const a = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(a) ? a.filter(x => typeof x === "string") : []; }
    catch { return []; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch (e) { console.warn("favorites: could not save", e); } }
  function emit() { for (const cb of subs) { try { cb(); } catch {} } }

  // public API (extras.js reads this for its filter chip)
  const Fav = window.FM1Fav = {
    has: (id) => ids.includes(id),
    ids: () => ids.slice(),
    count: () => ids.length,
    toggle(id) {
      if (!id) return false;
      const i = ids.indexOf(id);
      if (i >= 0) ids.splice(i, 1); else ids.unshift(id);   // newest first
      save(); emit();
      return ids.includes(id);
    },
    onChange(cb) { subs.add(cb); return () => subs.delete(cb); },
  };

  function ready(fn) {
    const t = setInterval(() => {
      const fwSel = document.getElementById("fw");
      const about = document.getElementById("about");
      if (fwSel && about) { clearInterval(t); fn(fwSel, about); }
    }, 120);
    setTimeout(() => clearInterval(t), 8000);
  }

  ready((fwSel, about) => {
    injectStyles();
    // keep each option's clean name so we can toggle a ★ prefix without losing it
    for (const o of fwSel.options) if (o.value) o.dataset.base = o.dataset.base || o.text;
    const nameOf = (id) => { const o = [...fwSel.options].find((o) => o.value === id); return o ? (o.dataset.base || o.text) : id; };
    // 0) show a ★ on favorited rows right in the main Firmware picker
    function decorateSelect() {
      for (const o of fwSel.options) {
        if (!o.value || !o.dataset.base) continue;
        o.text = (Fav.has(o.value) ? "★ " : "") + o.dataset.base;
      }
    }
    decorateSelect();

    // 1) star button that sits right after the firmware name in the info card.
    //    #about is rebuilt (replaceChildren) on every firmware change, so re-mount on each mutation.
    const star = document.createElement("button");
    star.type = "button"; star.className = "fw-fav-star";
    star.addEventListener("click", () => { Fav.toggle(fwSel.value); });
    function syncStar() {
      const on = Fav.has(fwSel.value);
      star.classList.toggle("on", on);
      star.textContent = on ? "★" : "☆";          // ★ / ☆
      star.title = on ? "Remove from favorites" : "Add to favorites";
      star.setAttribute("aria-pressed", on ? "true" : "false");
    }
    function mountStar() {
      const b = about.querySelector("b");
      if (b) { if (star.previousElementSibling !== b) b.insertAdjacentElement("afterend", star); }
      else if (!about.contains(star)) about.prepend(star);
      syncStar();
    }
    new MutationObserver(mountStar).observe(about, { childList: true });
    mountStar();
    fwSel.addEventListener("change", () => setTimeout(syncStar, 0));

    // 2) quick-load dropdown of the starred firmwares, in the sidebar near the search.
    const dd = document.createElement("select");
    dd.id = "fw-fav-dd"; dd.className = "fw-fav-dd"; dd.setAttribute("aria-label", "Jump to a favorite firmware");
    function rebuildDD() {
      const list = Fav.ids();
      dd.innerHTML = "";
      dd.add(new Option(list.length ? `★ Favorites (${list.length})` : "★ No favorites yet — tap the star", ""));
      for (const id of list) dd.add(new Option(nameOf(id), id));
      dd.value = "";
      dd.classList.toggle("empty", !list.length);
    }
    dd.addEventListener("change", () => {
      const v = dd.value; dd.value = "";
      if (v) { fwSel.value = v; fwSel.dispatchEvent(new Event("change", { bubbles: true })); }
    });
    rebuildDD();
    // place it with the search/chips (built by extras.js, which may not be ready yet) — wait for them,
    // and fall back to the firmware box if they never appear.
    (function placeDD() {
      const t = setInterval(() => {
        const after = document.querySelector(".fw-filters") || document.querySelector(".fw-quick") || document.getElementById("fw-search");
        if (after && after.parentNode) { clearInterval(t); after.parentNode.insertBefore(dd, after.nextSibling); }
      }, 120);
      setTimeout(() => { clearInterval(t); if (!dd.isConnected) { const box = fwSel.closest(".box"); if (box) box.insertBefore(dd, box.firstChild); } }, 6000);
    })();

    // keep star, dropdown and the (extras.js) filter in sync when favorites change anywhere
    Fav.onChange(() => {
      syncStar(); rebuildDD(); decorateSelect();
      document.getElementById("fw-search")?.dispatchEvent(new Event("input"));   // re-run active filter
    });
  });

  function injectStyles() {
    if (document.getElementById("fm1-fav-css")) return;
    const el = document.createElement("style");
    el.id = "fm1-fav-css";
    el.textContent = `
      .fw-fav-star{background:none;border:0;cursor:pointer;font-size:15px;line-height:1;color:var(--dim);
        padding:0 4px;vertical-align:-1px;transition:color .12s,transform .08s}
      .fw-fav-star:hover{color:var(--amber);transform:scale(1.12)}
      .fw-fav-star.on{color:var(--amber)}
      .fw-fav-dd{width:100%;background:var(--well);border:1px solid var(--line);color:var(--ink);
        border-radius:7px;padding:5px 8px;font:inherit;font-size:12px;margin-bottom:6px;cursor:pointer;outline:none}
      .fw-fav-dd:focus{border-color:var(--amber)}
      .fw-fav-dd.empty{color:var(--dim)}
    `;
    document.head.appendChild(el);
  }
})();
