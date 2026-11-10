// Compact header menus: fold the crowded top-bar tools into two dropdowns (Studio + Menu)
// instead of a row of sitelinks. Relocates existing buttons so handlers/popups stay intact.
(function () {
  "use strict";
  // Studio = capture / visualise / play assists. Menu = browse + case + banks + docs-ish tools.
  // Buttons already inlined into deck modules (midi/tape/tuner/rec/scope) get display:none there;
  // leaving them out of WANT keeps them from reappearing in the header.
  const GROUPS = [
    {
      id: "studio",
      label: "Studio",
      title: "Play assists, capture and visualise",
      want: ["assist-btn", "turbo-btn", "mon-btn", "wav-btn", "snap-btn", "fxcc-btn", "hostpanel-btn"],
    },
    {
      id: "menu",
      label: "Menu",
      title: "Browse, resources, keys, stickers, banks, customize, updates",
      want: ["gal-btn", "res-btn", "keys-btn", "stk-btn", "bank-btn", "session-btn", "fm1-cz-btn", "howto-btn", "help-btn", "app-upd-btn"],
    },
  ];

  function ready(fn) {
    const t = setInterval(() => {
      const nav = document.querySelector("#site-menu-host") || document.querySelector(".sitenav") || document.querySelector("header.site .wrap");
      // Wait for the slow Menu anchors (Browse + Customize + Banks) so racey late buttons aren't left orphaned in the header.
      if (nav && document.getElementById("gal-btn") && document.getElementById("fm1-cz-btn") && document.getElementById("bank-btn")) {
        clearInterval(t); fn(nav);
      }
    }, 150);
    setTimeout(() => clearInterval(t), 12000);
  }

  function adoptLabel(el) {
    if (!el) return;
    if (el.id === "help-btn" && (el.textContent || "").trim() === "?") el.textContent = "Help";
    if (el.id === "bank-btn") {
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (t && !/^Banks$/i.test(t)) el.textContent = "Banks";
    }
  }

  ready((nav) => {
    const css = document.createElement("style");
    css.textContent = `
      .tool-group{position:relative;display:inline-block}
      .tool-group-btn .caret{font-size:8px;margin-left:3px;opacity:.7;vertical-align:middle}
      .tool-group.open .tool-group-btn{color:var(--amber-ink,var(--amber))}
      .tool-menu{position:fixed;z-index:10020;min-width:148px;
        background:#0c0d0f;border:1px solid #232428;border-radius:8px;box-shadow:0 12px 30px rgba(0,0,0,.55);
        padding:4px;display:none;flex-direction:column;gap:1px}
      .tool-group.open .tool-menu{display:flex}
      .tool-menu .tool-item{display:block;padding:6px 9px;border-radius:6px;white-space:nowrap;font-size:12.5px;color:var(--ui-text,#e9edf2);text-decoration:none;background:transparent;border:0;text-align:left;width:100%;cursor:pointer;font:inherit}
      .tool-menu .tool-item:hover{background:#17181b}
      .tool-menu .tool-item svg{display:none}`;
    document.head.appendChild(css);

    const built = [];
    const menusById = new Map();
    for (const g of GROUPS) {
      const present = g.want.map((id) => document.getElementById(id)).filter(Boolean);
      if (!present.length) continue;
      const group = document.createElement("div");
      group.id = "tool-group-" + g.id;
      group.className = "tool-group";
      const studioBtn = document.createElement("a");
      studioBtn.href = "#";
      studioBtn.className = "sitelink tool-group-btn";
      studioBtn.innerHTML = `${g.label}<span class="caret">▾</span>`;
      studioBtn.title = g.title;
      const menu = document.createElement("div");
      menu.className = "tool-menu";
      group.appendChild(studioBtn);
      group.appendChild(menu);

      const anchor = present[0];
      (anchor.parentNode || nav).insertBefore(group, anchor);
      for (const b of present) {
        adoptLabel(b);
        b.classList.add("tool-item");
        menu.appendChild(b);
        menusById.set(b.id, menu);
      }

      let open = false;
      const place = () => {
        const r = studioBtn.getBoundingClientRect();
        menu.style.top = `${Math.round(r.bottom + 4)}px`;
        menu.style.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - 160)))}px`;
      };
      const openMenu = () => {
        for (const x of built) if (x.open && x.group !== group) x.closeMenu();
        open = true; group.classList.add("open"); place();
      };
      const closeMenu = () => { open = false; group.classList.remove("open"); };
      studioBtn.onclick = (e) => { e.preventDefault(); open ? closeMenu() : openMenu(); };
      built.push({ group, openMenu, closeMenu, place, want: g.want, menu, get open() { return open; } });
    }

    // Late buttons (Keys/Stickers/Help/Updates) that mount after the first paint still get folded in.
    const absorb = () => {
      for (const x of built) {
        for (const id of x.want) {
          if (menusById.has(id)) continue;
          const b = document.getElementById(id);
          if (!b || x.menu.contains(b)) continue;
          adoptLabel(b);
          b.classList.add("tool-item");
          x.menu.appendChild(b);
          menusById.set(id, x.menu);
        }
      }
    };
    absorb();
    const absorbTimer = setInterval(absorb, 200);
    setTimeout(() => clearInterval(absorbTimer), 8000);

    window.addEventListener("resize", () => { for (const x of built) if (x.open) x.place(); });
    window.addEventListener("scroll", () => { for (const x of built) if (x.open) x.place(); }, true);

    document.addEventListener("click", (e) => {
      for (const x of built) {
        if (!x.open) continue;
        if (x.group.contains(e.target)) continue;
        if (e.target.closest && e.target.closest('[id$="-pop"]')) continue;
        x.closeMenu();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      for (const x of built) if (x.open) x.closeMenu();
    });

    window.FM1Tools = {
      open: (id) => built.find((x) => x.group.id === "tool-group-" + id)?.openMenu(),
      close: () => built.forEach((x) => x.closeMenu()),
      items: () => GROUPS.flatMap((g) => g.want.slice()),
    };
  });
})();
