// DX7 patch-bank cartridge for the FM-1 emulator: a library of classic 32-voice banks (the Yamaha
// DX7 factory ROM cartridges and more) that load into the booted firmware's patch slots. Loading a
// bank reboots the firmware with it (window.FM1.loadBank); clicking a voice sends a MIDI program
// change to select it. Only firmwares with a DX7 patch area take banks (window.FM1.supportsBanks()).
// Pure DOM; styled like a ROM cartridge. Classic script.
(function () {
  "use strict";
  const FM = () => window.FM1;
  let CAT = { banks: [] };

  function ready(fn) { const t = setInterval(() => { const nav = document.querySelector("header.site .wrap"); if (nav && window.FM1) { clearInterval(t); fn(nav); } }, 120); setTimeout(() => clearInterval(t), 9000); }
  ready(async (nav) => {
    try { CAT = await (await fetch("banks.json?v=23")).json(); } catch { CAT = { banks: [] }; }
    if (!CAT.banks.length) return;

    const css = document.createElement("style"); css.textContent = `
      #bank-btn{cursor:pointer}
      #bank-pop{position:fixed;z-index:9997;width:320px;max-width:94vw;max-height:80vh;overflow:auto;background:var(--ui-pop,#0c0d0f);border:1px solid var(--ui-line,#232428);
        border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,.6);padding:13px;display:none;flex-direction:column;gap:10px;color:var(--ui-text,#e9edf2);font:13px 'Space Grotesk',-apple-system,Segoe UI,Roboto,sans-serif}
      #bank-pop.open{display:flex}
      #bank-pop h3{margin:0;font-size:13px;display:flex;align-items:center;gap:7px}
      #bank-pop h3 .dot{width:8px;height:8px;border-radius:50%;background:var(--amber);box-shadow:0 0 8px var(--amber)}
      /* the cartridge */
      .cart{position:relative;height:74px;flex:0 0 74px;border-radius:9px 9px 7px 7px;background:linear-gradient(150deg,#26282c,#141518 72%);
        border:1px solid #2c2e33;box-shadow:inset 0 1px 0 var(--ui-line-hi,#3a3d44),inset 0 -8px 16px rgba(0,0,0,.5);overflow:hidden}
      .cart .lip{position:absolute;left:10px;right:10px;bottom:0;height:12px;background:repeating-linear-gradient(90deg,#1b1c1f 0 4px,#2a2c31 4px 8px);border-radius:0 0 6px 6px}
      .cart .lbl{position:absolute;left:10px;right:10px;top:9px;height:42px;border-radius:4px;background:linear-gradient(var(--amber),var(--amber-lo,color-mix(in srgb,var(--amber) 70%,#000)));
        box-shadow:0 1px 2px rgba(0,0,0,.4);padding:6px 9px;color:var(--ui-on-accent,#180a02)}
      .cart .lbl b{display:block;font:800 13px 'Space Grotesk',-apple-system,Segoe UI,sans-serif;letter-spacing:.02em}
      .cart .lbl span{font-size:10px;opacity:.8}
      #bank-pop select{width:100%;background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-text,#e9edf2);border-radius:7px;padding:6px 8px;font:inherit;font-size:12.5px}
      #bank-pop .about{font-size:11px;color:var(--ui-dim,#9aa0ab);margin:0;min-height:1.2em}
      #bank-pop .tp{display:flex;gap:7px}
      #bank-pop .tp button{flex:1;background:var(--ui-surface,#17181b);border:1px solid var(--ui-line,#2a2c31);color:var(--ui-text,#e9edf2);border-radius:7px;padding:9px;font:inherit;font-size:13px;cursor:pointer}
      #bank-pop .tp button.load{background:var(--amber);color:var(--ui-on-accent,#180a02);border:0;font-weight:700}
      #bank-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px}
      #bank-grid button{background:var(--ui-surface,#141518);border:1px solid var(--ui-line,#26282c);color:var(--ui-text2,#cfd4da);border-radius:6px;padding:5px 7px;font:inherit;font-size:11px;
        cursor:pointer;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #bank-grid button:hover{border-color:var(--amber);color:var(--ui-text,#fff)}
      #bank-grid button .n{color:var(--ui-dim,#6b6e76);margin-right:5px}
      #bank-badge{font-size:10.5px;padding:2px 7px;border-radius:999px;border:1px solid var(--ui-line,#2a2c31);color:var(--ui-dim,#8c93a0);margin-left:auto}
      #bank-badge.ok{border-color:var(--green,#c0c0c0);color:var(--green,#c0c0c0)}
      #bank-status{margin:0;font-size:11.5px;color:var(--ui-text2,#cfd4da);min-height:1em}
      #bank-pop a.syx{color:var(--amber-ink, var(--amber));font-size:11.5px}`;
    document.head.appendChild(css);

    const btn = document.createElement("a"); btn.id = "bank-btn"; btn.href = "#";
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 16 16" style="vertical-align:-2px;margin-right:5px"><rect x="2.5" y="1.5" width="11" height="13" rx="1.5" fill="var(--amber)"/><rect x="4" y="3" width="8" height="4" rx="1" fill="#0c0d0f"/><rect x="4" y="9" width="3" height="1.3" fill="#0c0d0f"/><rect x="4" y="11" width="3" height="1.3" fill="#0c0d0f"/><rect x="9" y="9" width="3" height="1.3" fill="#0c0d0f"/><rect x="9" y="11" width="3" height="1.3" fill="#0c0d0f"/></svg>Banks`;
    (document.querySelector(".sitenav") || nav).appendChild(btn);

    const pop = document.createElement("div"); pop.id = "bank-pop";
    pop.innerHTML = `
      <h3><span class="dot"></span> Patch Banks <span id="bank-badge">banks: ?</span></h3>
      <div class="cart"><div class="lbl"><b id="cart-name">DX7</b><span id="cart-sub">32-voice cartridge</span></div><div class="lip"></div></div>
      <select id="bank-sel"></select>
      <p class="about" id="bank-about"></p>
      <div class="tp"><button class="load" id="bank-load">⤵ Load into emu</button><button type="button" id="bank-send-hw" title="Send this bank's .syx to the paired FM-1 over MIDI out (USB or Bluetooth). Does not reboot the emulator.">⇪ Send bank</button><button type="button" id="bank-send-voice" title="Send only the first voice as a DX7 single-voice SysEx">⇪ Voice 1</button></div>
      <div id="bank-grid"></div>
      <p id="bank-status"></p>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;color:var(--ui-dim,#8c93a0)">Load reboots the emu with the bank. Send pushes SysEx to MIDI out. Click a voice for program change (also goes out).</span>
        <a class="syx" id="bank-own" href="#">Load .syx…</a></div>
      <input type="file" id="bank-file" accept=".syx" hidden>`;
    document.body.appendChild(pop);

    const sel = pop.querySelector("#bank-sel");
    CAT.banks.forEach((b, i) => sel.add(new Option(`${b.name} — 32 voices`, i)));
    const grid = pop.querySelector("#bank-grid");
    const about = pop.querySelector("#bank-about");
    const badge = pop.querySelector("#bank-badge");
    const statusEl = pop.querySelector("#bank-status");
    const cartName = pop.querySelector("#cart-name"), cartSub = pop.querySelector("#cart-sub");
    const status = (s) => { statusEl.textContent = s; };

    function showBank(i) {
      const b = CAT.banks[i]; if (!b) return;
      cartName.textContent = b.name.replace(/^DX7 /, ""); cartSub.textContent = "32-voice cartridge";
      about.textContent = b.about || "";
      grid.innerHTML = "";
      (b.voices || []).forEach((v, n) => {
        const cell = document.createElement("button");
        cell.innerHTML = `<span class="n">${String(n + 1).padStart(2, "0")}</span>${v}`;
        cell.title = `Voice ${n + 1}: ${v} — click to select`;
        cell.onclick = () => {
          if (!FM() || !FM().running()) { status("Press Start first."); return; }
          FM().midi([0xc0, n]);                      // program change -> this voice
          status(`Selected ${n + 1}: ${v}`);
        };
        grid.appendChild(cell);
      });
    }
    showBank(0);
    sel.onchange = () => showBank(+sel.value);

    // reflect whether the booted firmware takes DX7 banks
    setInterval(() => {
      if (!FM() || !FM().running()) { badge.textContent = "banks: no device"; badge.classList.remove("ok"); return; }
      const ok = FM().supportsBanks();
      badge.textContent = ok ? "banks: ready" : "banks: not this firmware";
      badge.classList.toggle("ok", ok);
    }, 700);

    async function load(bytes, name) {
      if (!FM() || !FM().running()) { status("Press Start to boot a firmware first."); return; }
      if (!FM().supportsBanks()) { status("This firmware has no DX7 patch slots — try a DX7-based one."); return; }
      status(`Loading ${name}…`);
      if (FM().loadBank(bytes, name)) status(`✓ Loaded ${name}. Reboots with it — play notes, click voices to pick.`);
      else status("Could not load that bank.");
    }
    async function fetchBankBytes() {
      const b = CAT.banks[+sel.value]; if (!b) return null;
      const r = await fetch(b.file + "?v=23"); if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { bytes: new Uint8Array(await r.arrayBuffer()), name: b.name };
    }
    pop.querySelector("#bank-load").onclick = async () => {
      try {
        const pack = await fetchBankBytes(); if (!pack) return;
        await load(pack.bytes, pack.name);
      } catch (e) { status(`✗ ${(e && e.message) || e}`); }
    };
    async function sendSysexPack(bytes, label) {
      if (!FM() || !FM().midiOutSendSysex) { status("MIDI out is not available in this build."); return; }
      if (!FM().hasMidiOut || !FM().hasMidiOut()) {
        status("Pick your FM-1 under MIDI out first (Play from / Menu).");
        return;
      }
      status(`Sending ${label} → ${FM().midiOutName()}…`);
      const res = await FM().midiOutSendSysex(bytes);
      if (res.ok) {
        const kinds = (window.FM1Midi && window.FM1Midi.splitSysex)
          ? window.FM1Midi.splitSysex(bytes).map((m) => (window.FM1Midi.classifyDx7Sysex(m) || {}).kind)
          : [];
        status(`✓ Sent ${label} (${res.count} SysEx${kinds.length ? ": " + kinds.join(",") : ""}) to ${FM().midiOutName()}. Unit may ask which bank A–D.`);
      } else if (res.reason === "sysex-denied") status("✗ Browser refused SysEx — allow MIDI SysEx, then try again.");
      else if (res.reason === "no-sysex") status("✗ That file has no SysEx messages.");
      else status(`✗ Send failed (${res.reason || "error"}).`);
    }
    pop.querySelector("#bank-send-hw").onclick = async () => {
      try {
        const pack = await fetchBankBytes(); if (!pack) return;
        await sendSysexPack(pack.bytes, pack.name);
      } catch (e) { status(`✗ ${(e && e.message) || e}`); }
    };
    pop.querySelector("#bank-send-voice").onclick = async () => {
      try {
        const pack = await fetchBankBytes(); if (!pack) return;
        const msgs = (window.FM1Midi && window.FM1Midi.splitSysex) ? window.FM1Midi.splitSysex(pack.bytes) : [];
        let voice = msgs.find((m) => (window.FM1Midi.classifyDx7Sysex(m) || {}).kind === "voice");
        if (!voice && msgs[0] && msgs[0].length >= 150 && msgs[0].length <= 200) voice = msgs[0];
        // Extract first voice from a VMEM bank is firmware/librarian work; if only a bank is present, send the whole bank.
        if (!voice) {
          status("No single-voice SysEx in that file — sending full bank instead.");
          await sendSysexPack(pack.bytes, pack.name + " (bank)");
          return;
        }
        await sendSysexPack(voice, pack.name + " voice");
      } catch (e) { status(`✗ ${(e && e.message) || e}`); }
    };
    const fileIn = pop.querySelector("#bank-file");
    pop.querySelector("#bank-own").onclick = (e) => { e.preventDefault(); fileIn.click(); };
    fileIn.onchange = async () => { const f = fileIn.files[0]; fileIn.value = ""; if (!f) return;
      await load(new Uint8Array(await f.arrayBuffer()), f.name.replace(/\.syx$/i, "")); };

    const place = () => { const r = (window.FM1PopAnchor && window.FM1PopAnchor(btn)) || btn.getBoundingClientRect(); pop.style.top = (r.bottom + 6) + "px"; pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 332)) + "px"; };
    btn.onclick = (e) => { e.preventDefault(); pop.classList.toggle("open"); if (pop.classList.contains("open")) place(); };
    window.addEventListener("resize", () => { if (pop.classList.contains("open")) place(); });
    document.addEventListener("click", (e) => { if (e.target !== btn && !btn.contains(e.target) && !pop.contains(e.target)) pop.classList.remove("open"); });
  });
})();
