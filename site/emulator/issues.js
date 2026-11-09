/* Problems worth telling the user about (audio dropouts, a failed boot, a failed save), shown as a
   small status chip in the transport bar. Clicking it opens the details. Nothing here moves the
   page layout or covers the machine: the chip sits in a toolbar slot that is always there, and the
   details open from it only when asked for. A notice clears itself when its cause goes away or
   after a while; the most recent one stays available until then. */
(function () {
  "use strict";
  const AUTO_HIDE_MS = 45000;
  const items = new Map();        // key -> { title, text, level, actions, onDismiss, at }
  let chip = null, pop = null, timer = 0;

  function css() {
    if (document.getElementById("fm1-issues-style")) return;
    const st = document.createElement("style"); st.id = "fm1-issues-style";
    st.textContent = `
      #fm1-issue{display:none;align-items:center;gap:6px;flex:none;max-width:260px;height:26px;padding:0 10px;
        border-radius:999px;border:1px solid color-mix(in srgb,var(--issue-c) 55%,var(--ui-line,#2a2c31));
        background:color-mix(in srgb,var(--issue-c) 12%,var(--ui-surface,#17181b));color:var(--ui-text,#e9edf2);
        font:600 11.5px/1 'Space Grotesk',-apple-system,Segoe UI,Roboto,sans-serif;cursor:pointer;white-space:nowrap}
      #fm1-issue.on{display:inline-flex}
      #fm1-issue .d{width:7px;height:7px;border-radius:50%;background:var(--issue-c);flex:none}
      #fm1-issue .t{overflow:hidden;text-overflow:ellipsis}
      #fm1-issue-pop{position:fixed;z-index:9996;width:340px;max-width:calc(100vw - 16px);max-height:calc(100vh - 80px);overflow:auto;
        display:none;flex-direction:column;gap:10px;padding:12px 14px;border-radius:10px;background:var(--ui-pop,#0c0d0f);
        border:1px solid var(--ui-line,#2a2c31);box-shadow:0 14px 36px rgba(0,0,0,.5);color:var(--ui-text,#e9edf2);
        font:12.5px/1.45 'Space Grotesk',-apple-system,Segoe UI,Roboto,sans-serif}
      #fm1-issue-pop.on{display:flex}
      #fm1-issue-pop h4{margin:0;font-size:13px;display:flex;align-items:center;gap:7px}
      #fm1-issue-pop p{margin:0;color:var(--ui-text2,#cfd4da)}
      #fm1-issue-pop .acts{display:flex;flex-wrap:wrap;gap:6px}
      #fm1-issue-pop button,#fm1-issue-pop a{background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);
        color:var(--ui-text,#e9edf2);border-radius:7px;padding:5px 10px;font:inherit;font-size:12px;cursor:pointer;text-decoration:none}
      #fm1-issue-pop button.primary{background:var(--amber);border-color:transparent;color:var(--ui-on-accent,#180a02);font-weight:700}
      #fm1-issue-pop .x{margin-left:auto;padding:2px 7px}`;
    document.head.appendChild(st);
  }
  const LEVEL = { warn: "#e8b24a", error: "#ff6b5e", info: "#6ec6ff" };

  function host() {
    return document.getElementById("fm1-transport") || document.querySelector(".deck-head") || document.querySelector("header.site .wrap");
  }
  function ensure() {
    css();
    const h = host();
    if (!chip) {
      chip = document.createElement("button"); chip.type = "button"; chip.id = "fm1-issue";
      chip.innerHTML = `<span class="d"></span><span class="t"></span>`;
      chip.onclick = () => (pop.classList.contains("on") ? close() : open());
      pop = document.createElement("div"); pop.id = "fm1-issue-pop"; pop.setAttribute("role", "dialog");
      document.body.appendChild(pop);
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
      document.addEventListener("pointerdown", (e) => { if (pop.classList.contains("on") && !pop.contains(e.target) && !chip.contains(e.target)) close(); });
      addEventListener("resize", place);
    }
    if (h && chip.parentNode !== h) {
      // in the transport bar, just before its right-hand hint, so it takes no row of its own
      const hint = h.querySelector(".t-hint");
      if (hint) h.insertBefore(chip, hint); else h.appendChild(chip);
    }
  }
  function latest() { let best = null; for (const [k, v] of items) if (!best || v.at > best[1].at) best = [k, v]; return best; }
  function render() {
    ensure();
    const top = latest();
    chip.classList.toggle("on", !!top);
    if (!top) { close(); return; }
    const [, v] = top;
    chip.style.setProperty("--issue-c", LEVEL[v.level] || LEVEL.warn);
    chip.querySelector(".t").textContent = items.size > 1 ? `${v.title} (+${items.size - 1})` : v.title;
    chip.title = v.text;
    if (pop.classList.contains("on")) fill();
  }
  function fill() {
    pop.replaceChildren();
    for (const [key, v] of [...items].sort((a, b) => b[1].at - a[1].at)) {
      const sec = document.createElement("section"); sec.style.cssText = "display:flex;flex-direction:column;gap:7px";
      const h = document.createElement("h4");
      h.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:${LEVEL[v.level] || LEVEL.warn}"></span>`;
      h.append(v.title);
      const x = document.createElement("button"); x.type = "button"; x.className = "x"; x.textContent = "Dismiss"; x.onclick = () => dismiss(key);
      h.appendChild(x);
      const p = document.createElement("p"); p.textContent = v.text;
      sec.append(h, p);
      if (v.actions?.length) {
        const a = document.createElement("div"); a.className = "acts";
        for (const act of v.actions) {
          const el = act.href ? document.createElement("a") : document.createElement("button");
          if (act.href) { el.href = act.href; el.target = "_blank"; el.rel = "noopener"; } else el.type = "button";
          if (act.primary) el.className = "primary";
          el.textContent = act.label;
          if (act.run) el.onclick = async () => { try { await act.run(el); } catch (e) { console.error("notice action failed", e); } if (act.closes !== false) clear(key); };
          a.appendChild(el);
        }
        sec.appendChild(a);
      }
      pop.appendChild(sec);
    }
    place();
  }
  function place() {
    if (!pop || !pop.classList.contains("on")) return;
    const r = chip.getBoundingClientRect(), w = pop.offsetWidth;
    pop.style.top = Math.round(r.bottom + 6) + "px";
    pop.style.left = Math.round(Math.max(8, Math.min(innerWidth - w - 8, r.right - w))) + "px";
  }
  function open() { pop.classList.add("on"); fill(); clearTimeout(timer); }
  function close() { pop?.classList.remove("on"); arm(); }
  function arm() { clearTimeout(timer); if (items.size) timer = setTimeout(() => { if (!pop.classList.contains("on")) { items.clear(); render(); } }, AUTO_HIDE_MS); }
  function dismiss(key) { const v = items.get(key); clear(key); try { v?.onDismiss?.(); } catch {} }

  function show(key, opts) {
    items.set(key, { title: opts.title || "Notice", text: opts.text || "", level: opts.level || "warn", actions: opts.actions || [], onDismiss: opts.onDismiss, at: Date.now() });
    render(); arm();
  }
  function clear(key) { if (items.delete(key)) render(); if (!items.size) close(); }

  window.FM1Issues = { show, clear, list: () => [...items.keys()] };
})();
