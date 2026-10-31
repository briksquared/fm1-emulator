// Sticker palette for the FM-1 emulator: hundreds of stickers in categories you can click or drag
// onto the case. Feeds the shared overlay layer (window.FM1Overlay). For kids and grown-ups alike.
// Pure DOM; a top-bar button opens the palette. Classic script.
(function () {
  "use strict";
  const S = (s) => s.trim().split(/\s+/);
  // each category: name -> emoji (space-separated). Hundreds in all.
  const LIB = {
    "Smileys": S(`😀 😃 😄 😁 😆 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👹 👺 🤡 💩 👻 💀 ☠️ 👽 👾 🤖`),
    "Hearts": S(`❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 💌 💋 😻 🫶 💑 💏`),
    "Stars & FX": S(`⭐ 🌟 ✨ 💫 ⚡ 🔥 💥 ☀️ 🌈 ❄️ 💧 🌊 🌀 🌙 🔆 ✴️ ❇️ ➕ ✖️ ♾️ 💯 ✅ ❌ ⭕ ❓ ❗ 💤 🎵 🎶 🔔 📢 💬 💭 🗯️ ♻️ ⚠️ 🚫 ☑️ 🔱 ⚜️ 🏳️‍🌈`),
    "Animals": S(`🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐽 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🐣 🐥 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪰 🪲 🪳 🦟 🦗 🕷️ 🕸️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🦧 🐘 🦛 🦏 🐪 🐫 🦒 🦘 🦬 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🐩 🦮 🐈 🐓 🦃 🦚 🦜 🦢 🦩 🕊️ 🐇 🦝 🦨 🦡 🦦 🦥 🐁 🐀 🐿️ 🦔`),
    "Food": S(`🍎 🍏 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🫒 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🫓 🥪 🌮 🌯 🫔 🥙 🧆 🍜 🍲 🍛 🍣 🍱 🥟 🦪 🍤 🍙 🍚 🍘 🍥 🥠 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 🍼 ☕ 🍵 🧃 🥤 🧋 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾`),
    "Nature": S(`🌸 💮 🏵️ 🌹 🥀 🌺 🌻 🌼 🌷 🌱 🪴 🌲 🌳 🌴 🌵 🌾 🌿 ☘️ 🍀 🍁 🍂 🍃 🍄 🪨 🪵 🐚 🌍 🌎 🌏 🌋 🏔️ ⛰️ 🗻 🏕️ 🏖️ 🏜️ 🏝️ 🌅 🌄 🌠 🎇 🎆 🌇 🌁`),
    "Travel": S(`🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🚚 🚛 🚜 🛴 🚲 🛵 🏍️ 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩️ 💺 🚁 🚀 🛸 🚢 ⛵ 🛶 ⚓ 🗺️ 🗿 🗽 🗼 🏰 🏯 🎡 🎢 🎠 🎪 🏠 🏡 🏢 🏬 🏭 🏗️ 🏙️`),
    "Objects": S(`⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💽 💾 💿 📀 📷 📸 📹 🎥 📞 ☎️ 📟 📠 📺 📻 🎙️ 🎚️ 🎛️ 🧭 ⏱️ ⏲️ ⏰ 🕰️ ⌛ ⏳ 📡 🔋 🔌 💡 🔦 🕯️ 🧯 🛢️ 💸 💵 💴 💶 💷 💰 💳 💎 ⚖️ 🧰 🔧 🔨 ⚒️ 🛠️ ⛏️ 🔩 ⚙️ 🧱 ⛓️ 🧲 🔫 💣 🧨 🪓 🔪 🗡️ ⚔️ 🛡️ 🚬 ⚰️ 🔮 📿 🧿 💈 🔭 🔬 🩺 💊 💉 🩹 🚽 🚿 🛁 🧴 🧷 🧹 🧺 🧻 🔑 🗝️ 🚪 🛋️ 🛏️ 🖼️ 🛍️ 🎈 📚 ✏️ 🖊️ 🖌️ 🖍️ 📌 📎 ✂️ 📐 📏`),
    "Music & Art": S(`🎵 🎶 🎼 🎙️ 🎧 🎷 🎸 🎹 🎺 🎻 🥁 🪘 🎤 🎬 🎨 🖌️ 🖍️ 🎭 🩰 🎪 🎟️ 🎫 🪕 📻 💿`),
    "Sports": S(`⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🪃 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧘 🏄 🏊 🤽 🚣 🧗 🚵 🚴 🏆 🥇 🥈 🥉 🏅 🎖️ 🎗️`),
    "Fantasy": S(`🦸 🦹 🧙 🧚 🧛 🧜 🧝 🧞 🧟 👑 👸 🤴 🧑‍🎄 🎅 🤶 🧑‍🚀 🧑‍🚒 👮 🕵️ 💂 👷 🧏 🙅 🙆 💁 🙋 🙇 🤦 🤷 👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 🧕 👲`),
    "Party": S(`🎉 🎊 🎈 🎁 🎀 🪅 🪩 🎄 🎃 🎆 🎇 🧨 🎍 🎋 🎎 🎏 🎐 🎑 🧧 🕯️ 🪔 🎂 🍾 🥳`),
    "Weather": S(`☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ 🌨️ ❄️ ☃️ ⛄ 🌬️ 💨 🌪️ 🌫️ 🌈 🌙 ⭐ ☄️ 🌛 🌜 🌝 🌞 🌚 🔥 💧 🌊`),
    "Flags": S(`🏁 🚩 🎌 🏴 🏳️ 🏳️‍🌈 🏳️‍⚧️ 🏴‍☠️`),
    "Hands": S(`👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 🙏 ✍️ 💅 🤳 💪 👏 🙌 👐 🤲 🫰 🫱 🫲 🫳 🫴 🫵`),
    "Symbols": S(`💗 ❤️ 🧡 💛 💚 💙 💜 ⚡ ⭐ 🔥 💥 ✨ ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 🕎 ☯️ ⚛️ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 🔟 🔢 #️⃣ *️⃣ ▶️ ⏸️ ⏯️ ⏹️ 🔀 🔁 🔂 🔼 🔽 ⏫ ⏬ 🔊 🔇 📶 🛜 🔞 ♿ 🚻 🅰️ 🅱️ 🆎 🅾️ 🆚 🉐 ㊗️ ㊙️ 🈶 🈚`),
  };

  // ----- Image stickers: hand-drawn vector art, NOT emoji. Dropped via FM1Overlay.addImage as
  // <img> data-URLs, so they scale crisp, theme the same in light/dark, and export to PNG cleanly.
  // They get their own tabs (Synth / Retro / Badges) alongside the emoji categories. -----
  const SV = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">${inner}</svg>`;
  const svgURL = (svg) => "data:image/svg+xml," + encodeURIComponent(svg);
  const BADGE = (txt, bg, fg, fs) => `<rect x="5" y="31" width="90" height="38" rx="10" fill="${bg}" stroke="#1a1a1a" stroke-width="4"/><text x="50" y="${(50 + fs * 0.34).toFixed(1)}" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="${fs}" fill="${fg}" text-anchor="middle" letter-spacing="0.5">${txt}</text>`;
  const IMG = {
    "Synth": [
      { n: "cassette", kw: "tape mixtape music", svg: `<rect x="8" y="24" width="84" height="52" rx="8" fill="#ff7a1a" stroke="#1a1a1a" stroke-width="4"/><rect x="20" y="34" width="60" height="22" rx="4" fill="#fff6e6" stroke="#1a1a1a" stroke-width="3"/><circle cx="37" cy="45" r="7" fill="#1a1a1a"/><circle cx="63" cy="45" r="7" fill="#1a1a1a"/><circle cx="37" cy="45" r="2.5" fill="#fff6e6"/><circle cx="63" cy="45" r="2.5" fill="#fff6e6"/><rect x="30" y="64" width="40" height="7" rx="3.5" fill="#1a1a1a"/>` },
      { n: "vinyl", kw: "record disc dj turntable", svg: `<circle cx="50" cy="50" r="42" fill="#141414" stroke="#1a1a1a" stroke-width="3"/><circle cx="50" cy="50" r="34" fill="none" stroke="#3a3a3a" stroke-width="2"/><circle cx="50" cy="50" r="27" fill="none" stroke="#3a3a3a" stroke-width="2"/><circle cx="50" cy="50" r="20" fill="none" stroke="#3a3a3a" stroke-width="2"/><circle cx="50" cy="50" r="14" fill="#ff3b6b" stroke="#1a1a1a" stroke-width="3"/><circle cx="50" cy="50" r="3.5" fill="#141414"/>` },
      { n: "floppy", kw: "disk save data 90s", svg: `<rect x="16" y="16" width="68" height="68" rx="6" fill="#2f7ae5" stroke="#1a1a1a" stroke-width="4"/><path d="M30 16h40v22H30z" fill="#dfe8f5" stroke="#1a1a1a" stroke-width="3"/><rect x="56" y="20" width="9" height="14" fill="#1a1a1a"/><rect x="28" y="50" width="44" height="30" rx="2" fill="#dfe8f5" stroke="#1a1a1a" stroke-width="3"/><path d="M34 58h32M34 66h32M34 74h20" stroke="#1a1a1a" stroke-width="2.5"/>` },
      { n: "patch cable", kw: "cable jack modular patch wire", svg: `<path d="M26 26C26 56 74 44 74 74" fill="none" stroke="#ffcf33" stroke-width="7" stroke-linecap="round"/><circle cx="26" cy="26" r="12" fill="#e23b3b" stroke="#1a1a1a" stroke-width="4"/><circle cx="26" cy="26" r="4" fill="#1a1a1a"/><circle cx="74" cy="74" r="12" fill="#2fb36b" stroke="#1a1a1a" stroke-width="4"/><circle cx="74" cy="74" r="4" fill="#1a1a1a"/>` },
      { n: "knob", kw: "dial pot control tweak", svg: `<circle cx="50" cy="50" r="34" fill="#2a2a2a" stroke="#1a1a1a" stroke-width="4"/><circle cx="50" cy="50" r="23" fill="#4a4a4a" stroke="#1a1a1a" stroke-width="2"/><rect x="47" y="26" width="6" height="22" rx="3" fill="#ffcf33"/><g fill="#1a1a1a"><circle cx="50" cy="13" r="2"/><circle cx="76" cy="26" r="2"/><circle cx="87" cy="50" r="2"/><circle cx="24" cy="26" r="2"/><circle cx="13" cy="50" r="2"/></g>` },
      { n: "headphones", kw: "cans audio listen", svg: `<path d="M22 60V50a28 28 0 0 1 56 0v10" fill="none" stroke="#1a1a1a" stroke-width="6" stroke-linecap="round"/><rect x="13" y="54" width="18" height="30" rx="7" fill="#ff7a1a" stroke="#1a1a1a" stroke-width="4"/><rect x="69" y="54" width="18" height="30" rx="7" fill="#ff7a1a" stroke="#1a1a1a" stroke-width="4"/>` },
      { n: "waveform", kw: "wave sine oscilloscope scope signal", svg: `<rect x="12" y="16" width="76" height="68" rx="14" fill="#101418" stroke="#1a1a1a" stroke-width="4"/><path d="M20 50q7-26 14 0t14 0 14 0 14 0" fill="none" stroke="#39e0a0" stroke-width="5" stroke-linecap="round"/>` },
      { n: "boombox", kw: "ghetto blaster stereo speakers music", svg: `<rect x="10" y="32" width="80" height="46" rx="8" fill="#5a3bdc" stroke="#1a1a1a" stroke-width="4"/><circle cx="32" cy="55" r="12" fill="#1a1a1a"/><circle cx="32" cy="55" r="5" fill="#c9b8ff"/><circle cx="68" cy="55" r="12" fill="#1a1a1a"/><circle cx="68" cy="55" r="5" fill="#c9b8ff"/><rect x="43" y="40" width="14" height="7" rx="2" fill="#c9b8ff" stroke="#1a1a1a" stroke-width="2"/><path d="M28 32L66 18" stroke="#1a1a1a" stroke-width="4" stroke-linecap="round"/>` },
      { n: "microphone", kw: "mic vocal sing record", svg: `<rect x="38" y="14" width="24" height="44" rx="12" fill="#c0c7d0" stroke="#1a1a1a" stroke-width="4"/><path d="M42 24h16M42 32h16M42 40h16" stroke="#1a1a1a" stroke-width="2.5"/><path d="M30 50a20 20 0 0 0 40 0" fill="none" stroke="#1a1a1a" stroke-width="5" stroke-linecap="round"/><rect x="47" y="70" width="6" height="14" fill="#1a1a1a"/><rect x="36" y="84" width="28" height="6" rx="3" fill="#1a1a1a"/>` },
      { n: "bolt", kw: "lightning power zap electric", svg: `<path d="M56 8L24 54h20l-6 38 40-52H52z" fill="#ffd21a" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/>` },
      { n: "speaker", kw: "monitor sound loud volume", svg: `<rect x="26" y="14" width="48" height="72" rx="8" fill="#e23b3b" stroke="#1a1a1a" stroke-width="4"/><circle cx="50" cy="58" r="16" fill="#1a1a1a"/><circle cx="50" cy="58" r="7" fill="#ffd9d9"/><circle cx="50" cy="30" r="6" fill="#1a1a1a"/>` },
      { n: "SID chip", kw: "chip sid c64 ic silicon", svg: `<g fill="#1a1a1a"><rect x="18" y="38" width="10" height="5"/><rect x="18" y="48" width="10" height="5"/><rect x="18" y="58" width="10" height="5"/><rect x="72" y="38" width="10" height="5"/><rect x="72" y="48" width="10" height="5"/><rect x="72" y="58" width="10" height="5"/></g><rect x="28" y="28" width="44" height="44" rx="4" fill="#1f1f1f" stroke="#1a1a1a" stroke-width="3"/><circle cx="36" cy="36" r="3" fill="#39e0a0"/><text x="50" y="56" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="14" fill="#39e0a0" text-anchor="middle">SID</text>` },
      { n: "drum pad", kw: "mpc pads beat sampler drum", svg: `<rect x="16" y="16" width="68" height="68" rx="10" fill="#2a2a2a" stroke="#1a1a1a" stroke-width="4"/><g fill="#ff7a1a" stroke="#1a1a1a" stroke-width="2.5"><rect x="26" y="26" width="18" height="18" rx="3"/><rect x="56" y="26" width="18" height="18" rx="3"/><rect x="26" y="56" width="18" height="18" rx="3"/><rect x="56" y="56" width="18" height="18" rx="3"/></g>` },
      { n: "MIDI port", kw: "midi din 5 pin connector plug", svg: `<circle cx="50" cy="50" r="36" fill="#3a3a3a" stroke="#1a1a1a" stroke-width="4"/><circle cx="50" cy="50" r="27" fill="#1f1f1f"/><g fill="#d9d9d9"><circle cx="50" cy="32" r="4.5"/><circle cx="32" cy="45" r="4.5"/><circle cx="68" cy="45" r="4.5"/><circle cx="39" cy="64" r="4.5"/><circle cx="61" cy="64" r="4.5"/></g><rect x="44" y="70" width="12" height="7" rx="2" fill="#1a1a1a"/>` },
      { n: "fader", kw: "slider fader level volume", svg: `<rect x="42" y="14" width="16" height="72" rx="5" fill="#2a2a2a" stroke="#1a1a1a" stroke-width="3"/><rect x="48" y="18" width="4" height="64" rx="2" fill="#555"/><rect x="34" y="34" width="32" height="16" rx="3" fill="#ff7a1a" stroke="#1a1a1a" stroke-width="3"/><path d="M34 42h32" stroke="#1a1a1a" stroke-width="2"/>` },
      { n: "metronome", kw: "metronome tempo click beat", svg: `<path d="M38 18h24l10 66H28z" fill="#ff7a1a" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/><rect x="30" y="70" width="40" height="6" fill="#1a1a1a"/><path d="M50 78L62 28" stroke="#1a1a1a" stroke-width="4" stroke-linecap="round"/><rect x="54" y="40" width="10" height="7" rx="2" fill="#1a1a1a"/><circle cx="50" cy="78" r="3" fill="#1a1a1a"/>` },
      { n: "tape reel", kw: "reel open tape spool", svg: `<circle cx="50" cy="50" r="38" fill="#2a2a2a" stroke="#1a1a1a" stroke-width="4"/><circle cx="50" cy="50" r="30" fill="none" stroke="#1a1a1a" stroke-width="2"/><circle cx="50" cy="50" r="10" fill="#ff7a1a" stroke="#1a1a1a" stroke-width="3"/><g fill="#1a1a1a"><circle cx="50" cy="26" r="5"/><circle cx="71" cy="62" r="5"/><circle cx="29" cy="62" r="5"/></g><circle cx="50" cy="50" r="3" fill="#1a1a1a"/>` },
      { n: "sequencer", kw: "sequencer steps grid pads", svg: `<rect x="12" y="30" width="76" height="40" rx="6" fill="#2a2a2a" stroke="#1a1a1a" stroke-width="4"/><g stroke="#1a1a1a" stroke-width="2"><rect x="18" y="36" width="12" height="12" rx="2" fill="#39e0a0"/><rect x="34" y="36" width="12" height="12" rx="2" fill="#2a2a2a"/><rect x="50" y="36" width="12" height="12" rx="2" fill="#39e0a0"/><rect x="66" y="36" width="12" height="12" rx="2" fill="#2a2a2a"/><rect x="18" y="52" width="12" height="12" rx="2" fill="#2a2a2a"/><rect x="34" y="52" width="12" height="12" rx="2" fill="#ff7a1a"/><rect x="50" y="52" width="12" height="12" rx="2" fill="#2a2a2a"/><rect x="66" y="52" width="12" height="12" rx="2" fill="#2a2a2a"/></g>` },
      { n: "VU meter", kw: "vu meter level needle analog", svg: `<rect x="12" y="24" width="76" height="52" rx="8" fill="#fff6e6" stroke="#1a1a1a" stroke-width="4"/><path d="M20 64q30-34 60 0" fill="none" stroke="#1a1a1a" stroke-width="2"/><path d="M50 68L66 36" stroke="#e23b3b" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="68" r="3" fill="#1a1a1a"/><g stroke="#1a1a1a" stroke-width="2"><path d="M28 50l-3-4M50 40v-5M72 50l3-4"/></g>` },
      { n: "pedal", kw: "stompbox pedal effects fx guitar", svg: `<rect x="22" y="16" width="56" height="68" rx="6" fill="#36d1dc" stroke="#1a1a1a" stroke-width="4"/><circle cx="37" cy="32" r="6" fill="#1a1a1a"/><circle cx="63" cy="32" r="6" fill="#1a1a1a"/><rect x="34" y="44" width="32" height="12" rx="3" fill="#1a1a1a"/><circle cx="50" cy="50" r="2.5" fill="#39e0a0"/><rect x="34" y="64" width="32" height="14" rx="4" fill="#2a2a2a" stroke="#1a1a1a" stroke-width="3"/>` },
      { n: "tuning fork", kw: "tuning fork pitch tune a440", svg: `<path d="M38 20v34a12 12 0 0 0 24 0V20" fill="none" stroke="#c0c7d0" stroke-width="7" stroke-linecap="round"/><rect x="46" y="60" width="8" height="24" rx="3" fill="#c0c7d0" stroke="#1a1a1a" stroke-width="2"/><g stroke="#1a1a1a" stroke-width="2" fill="none" opacity=".55"><path d="M30 24c-4 4-4 10 0 14M70 24c4 4 4 10 0 14"/></g>` },
    ],
    "Retro": [
      { n: "starburst", kw: "pow burst bang star explode", svg: `<path d="M50 6l9 20 21-9-9 21 20 9-20 9 9 21-21-9-9 20-9-20-21 9 9-21-20-9 20-9-9-21 21 9z" fill="#ff3b6b" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/>` },
      { n: "flame", kw: "fire hot lit burn", svg: `<path d="M50 8c6 18-14 22-14 40a14 14 0 0 0 28 0c0-6-2-10-2-10 8 6 10 16 10 22a30 30 0 1 1-60 0C22 44 44 34 50 8z" fill="#ff7a1a" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/><path d="M50 46c3 10-6 12-6 22a8 8 0 0 0 16 0c0-9-6-11-10-22z" fill="#ffd21a"/>` },
      { n: "diamond", kw: "gem jewel crystal shine", svg: `<path d="M30 20h40l18 22-38 42L12 42z" fill="#36d1dc" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/><path d="M12 42h76M30 20l12 22M70 20L58 42M42 42l8 42M58 42l-8 42" stroke="#1a1a1a" stroke-width="2.5" fill="none"/>` },
      { n: "cool face", kw: "smiley sunglasses happy cool", svg: `<circle cx="50" cy="50" r="40" fill="#ffd21a" stroke="#1a1a1a" stroke-width="4"/><path d="M18 42h28v6a10 10 0 0 1-20 0v-2l-8-1z" fill="#1a1a1a"/><path d="M54 42h28l-8 1v2a10 10 0 0 1-20 0z" fill="#1a1a1a"/><path d="M46 44h8" stroke="#1a1a1a" stroke-width="3"/><path d="M34 64q16 16 32 0" fill="none" stroke="#1a1a1a" stroke-width="5" stroke-linecap="round"/>` },
      { n: "skull", kw: "skull bones danger metal", svg: `<path d="M50 12a32 32 0 0 0-22 55v9a6 6 0 0 0 6 6h32a6 6 0 0 0 6-6v-9A32 32 0 0 0 50 12z" fill="#f2f2f2" stroke="#1a1a1a" stroke-width="4"/><circle cx="37" cy="48" r="9" fill="#1a1a1a"/><circle cx="63" cy="48" r="9" fill="#1a1a1a"/><path d="M50 60l-5 11h10z" fill="#1a1a1a"/><path d="M40 82v6M50 82v6M60 82v6" stroke="#1a1a1a" stroke-width="3"/>` },
      { n: "rainbow", kw: "rainbow pride arc color", svg: `<path d="M12 78a38 38 0 0 1 76 0" fill="none" stroke="#ff3b6b" stroke-width="7"/><path d="M23 78a27 27 0 0 1 54 0" fill="none" stroke="#ffd21a" stroke-width="7"/><path d="M34 78a16 16 0 0 1 32 0" fill="none" stroke="#39e0a0" stroke-width="7"/><circle cx="12" cy="78" r="5" fill="#fff" stroke="#1a1a1a" stroke-width="2"/><circle cx="88" cy="78" r="5" fill="#fff" stroke="#1a1a1a" stroke-width="2"/>` },
      { n: "heart", kw: "heart love like", svg: `<path d="M50 84L22 56a17 17 0 0 1 24-24l4 4 4-4a17 17 0 0 1 24 24z" fill="#ff3b6b" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/>` },
      { n: "music note", kw: "note music eighth beamed song", svg: `<rect x="38" y="24" width="5" height="44" fill="#1a1a1a"/><rect x="64" y="18" width="5" height="44" fill="#1a1a1a"/><path d="M38 24l31-6v11l-31 6z" fill="#1a1a1a"/><ellipse cx="33" cy="70" rx="12" ry="9" fill="#5a3bdc" stroke="#1a1a1a" stroke-width="3"/><ellipse cx="59" cy="64" rx="12" ry="9" fill="#5a3bdc" stroke="#1a1a1a" stroke-width="3"/>` },
      { n: "star", kw: "star gold fave favorite", svg: `<path d="M50 10l11 25 27 2-21 18 7 26-24-14-24 14 7-26-21-18 27-2z" fill="#ffd21a" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/>` },
      { n: "crown", kw: "crown king queen royal", svg: `<path d="M20 68l-6-34 20 16 16-26 16 26 20-16-6 34z" fill="#ffd21a" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/><rect x="20" y="68" width="60" height="10" rx="2" fill="#ffd21a" stroke="#1a1a1a" stroke-width="4"/><circle cx="50" cy="40" r="3" fill="#e23b3b"/>` },
      { n: "dice", kw: "dice die game luck roll", svg: `<rect x="18" y="18" width="64" height="64" rx="12" fill="#fff6e6" stroke="#1a1a1a" stroke-width="4"/><g fill="#1a1a1a"><circle cx="34" cy="34" r="5"/><circle cx="66" cy="34" r="5"/><circle cx="50" cy="50" r="5"/><circle cx="34" cy="66" r="5"/><circle cx="66" cy="66" r="5"/></g>` },
      { n: "8-ball", kw: "eight ball pool magic", svg: `<circle cx="50" cy="50" r="40" fill="#1a1a1a"/><circle cx="50" cy="46" r="16" fill="#fff"/><text x="50" y="54" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="20" fill="#1a1a1a" text-anchor="middle">8</text><circle cx="38" cy="32" r="6" fill="#fff" opacity=".4"/>` },
      { n: "peace", kw: "peace sign symbol hippie", svg: `<circle cx="50" cy="50" r="38" fill="#39e0a0" stroke="#1a1a1a" stroke-width="4"/><g stroke="#1a1a1a" stroke-width="5" fill="none"><circle cx="50" cy="50" r="30"/><path d="M50 20v60M50 50L28 72M50 50l22 22"/></g>` },
      { n: "yin yang", kw: "yin yang balance tao zen", svg: `<circle cx="50" cy="50" r="38" fill="#fff" stroke="#1a1a1a" stroke-width="4"/><path d="M50 12a38 38 0 0 1 0 76 19 19 0 0 1 0-38 19 19 0 0 0 0-38z" fill="#1a1a1a"/><circle cx="50" cy="31" r="5" fill="#fff"/><circle cx="50" cy="69" r="5" fill="#1a1a1a"/>` },
      { n: "eye", kw: "eye see look watch", svg: `<path d="M12 50q38-34 76 0-38 34-76 0z" fill="#fff" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/><circle cx="50" cy="50" r="14" fill="#36d1dc" stroke="#1a1a1a" stroke-width="3"/><circle cx="50" cy="50" r="6" fill="#1a1a1a"/><circle cx="45" cy="45" r="3" fill="#fff"/>` },
    ],
    "Space": [
      { n: "saturn", kw: "planet saturn ring space", svg: `<ellipse cx="50" cy="48" rx="40" ry="12" fill="none" stroke="#ff7a1a" stroke-width="6" transform="rotate(-20 50 48)"/><circle cx="50" cy="48" r="22" fill="#ffd21a" stroke="#1a1a1a" stroke-width="4"/><ellipse cx="50" cy="48" rx="40" ry="12" fill="none" stroke="#1a1a1a" stroke-width="2" transform="rotate(-20 50 48)"/>` },
      { n: "rocket", kw: "rocket ship launch space blastoff", svg: `<path d="M32 54l-12 14 16-4M68 54l12 14-16-4" fill="#e23b3b" stroke="#1a1a1a" stroke-width="3" stroke-linejoin="round"/><path d="M50 10c14 10 18 28 18 44l-8 10H40l-8-10c0-16 4-34 18-44z" fill="#fff6e6" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/><circle cx="50" cy="40" r="7" fill="#36d1dc" stroke="#1a1a1a" stroke-width="3"/><path d="M42 64h16l-4 16-4 6-4-6z" fill="#ff7a1a" stroke="#1a1a1a" stroke-width="3" stroke-linejoin="round"/>` },
      { n: "UFO", kw: "ufo flying saucer alien space", svg: `<path d="M40 70l-6 14M60 70l6 14M50 72v16" stroke="#39e0a0" stroke-width="3" stroke-linecap="round" opacity=".7"/><ellipse cx="50" cy="58" rx="34" ry="12" fill="#9aa0ab" stroke="#1a1a1a" stroke-width="4"/><path d="M34 52a18 12 0 0 1 32 0z" fill="#c9b8ff" stroke="#1a1a1a" stroke-width="4"/><g fill="#ffd21a"><circle cx="34" cy="60" r="3"/><circle cx="50" cy="63" r="3"/><circle cx="66" cy="60" r="3"/></g>` },
      { n: "alien", kw: "alien head et space green", svg: `<path d="M50 14c20 0 30 16 30 34 0 22-18 38-30 38S20 70 20 48c0-18 10-34 30-34z" fill="#39e0a0" stroke="#1a1a1a" stroke-width="4"/><ellipse cx="37" cy="54" rx="7" ry="12" fill="#1a1a1a" transform="rotate(20 37 54)"/><ellipse cx="63" cy="54" rx="7" ry="12" fill="#1a1a1a" transform="rotate(-20 63 54)"/>` },
      { n: "comet", kw: "comet shooting star meteor", svg: `<path d="M48 42L14 70M52 48L18 82M60 50L30 84" stroke="#ff7a1a" stroke-width="5" stroke-linecap="round"/><circle cx="64" cy="36" r="16" fill="#36d1dc" stroke="#1a1a1a" stroke-width="4"/>` },
      { n: "moon", kw: "moon crescent night star", svg: `<path d="M64 20a34 34 0 1 0 0 60 28 28 0 0 1 0-60z" fill="#ffd21a" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/><path d="M74 24l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#fff6e6" stroke="#1a1a1a" stroke-width="2.5" stroke-linejoin="round"/>` },
      { n: "satellite", kw: "satellite orbit dish space", svg: `<g fill="#2f7ae5" stroke="#1a1a1a" stroke-width="3"><rect x="10" y="42" width="26" height="16"/><rect x="64" y="42" width="26" height="16"/></g><g stroke="#1a1a1a" stroke-width="1.5"><path d="M18 42v16M26 42v16M72 42v16M80 42v16"/></g><rect x="42" y="40" width="16" height="20" rx="3" fill="#9aa0ab" stroke="#1a1a1a" stroke-width="3"/><path d="M50 40l10-14" stroke="#1a1a1a" stroke-width="3"/><path d="M60 26a12 12 0 0 1 12 12" fill="none" stroke="#1a1a1a" stroke-width="3"/>` },
      { n: "astronaut", kw: "astronaut helmet space suit", svg: `<circle cx="50" cy="50" r="38" fill="#fff6e6" stroke="#1a1a1a" stroke-width="4"/><path d="M32 42a22 18 0 0 1 36 0v16a22 18 0 0 1-36 0z" fill="#1a1a1a"/><path d="M38 44a14 10 0 0 1 20 2" fill="none" stroke="#39e0a0" stroke-width="4" opacity=".7"/><rect x="40" y="20" width="20" height="6" rx="3" fill="#9aa0ab" stroke="#1a1a1a" stroke-width="2"/>` },
    ],
    "Arcade": [
      { n: "invader", kw: "space invader alien pixel game", svg: `<g fill="#39e0a0"><rect x="36" y="24" width="7" height="7"/><rect x="57" y="24" width="7" height="7"/><rect x="29" y="31" width="42" height="7"/><rect x="22" y="38" width="56" height="7"/><rect x="22" y="45" width="7" height="14"/><rect x="43" y="45" width="14" height="7"/><rect x="71" y="45" width="7" height="14"/><rect x="29" y="52" width="7" height="7"/><rect x="64" y="52" width="7" height="7"/><rect x="36" y="59" width="7" height="7"/><rect x="57" y="59" width="7" height="7"/></g><rect x="40" y="38" width="5" height="5" fill="#101418"/><rect x="55" y="38" width="5" height="5" fill="#101418"/>` },
      { n: "pixel heart", kw: "pixel heart 8bit love game", svg: `<g fill="#ff3b6b"><rect x="26" y="26" width="16" height="16"/><rect x="58" y="26" width="16" height="16"/><rect x="18" y="34" width="64" height="16"/><rect x="26" y="50" width="48" height="10"/><rect x="34" y="60" width="32" height="10"/><rect x="42" y="70" width="16" height="8"/></g>` },
      { n: "controller", kw: "controller gamepad game console", svg: `<rect x="12" y="38" width="76" height="30" rx="15" fill="#5a3bdc" stroke="#1a1a1a" stroke-width="4"/><g fill="#1a1a1a"><rect x="24" y="46" width="6" height="18"/><rect x="18" y="52" width="18" height="6"/></g><circle cx="64" cy="48" r="5" fill="#ff3b6b"/><circle cx="74" cy="56" r="5" fill="#39e0a0"/>` },
      { n: "coin", kw: "coin money token gold game", svg: `<circle cx="50" cy="50" r="38" fill="#ffd21a" stroke="#1a1a1a" stroke-width="4"/><circle cx="50" cy="50" r="28" fill="none" stroke="#1a1a1a" stroke-width="2"/><text x="50" y="63" font-family="'Arial Black',Arial,sans-serif" font-weight="900" font-size="34" fill="#1a1a1a" text-anchor="middle">$</text>` },
      { n: "1-up", kw: "mushroom 1up power up game", svg: `<path d="M50 20c-18 0-30 12-30 26 0 4 2 6 6 6h48c4 0 6-2 6-6 0-14-12-26-30-26z" fill="#39e0a0" stroke="#1a1a1a" stroke-width="4"/><circle cx="34" cy="38" r="6" fill="#fff"/><circle cx="66" cy="38" r="6" fill="#fff"/><rect x="38" y="52" width="24" height="26" rx="5" fill="#fff6e6" stroke="#1a1a1a" stroke-width="4"/><g fill="#1a1a1a"><rect x="44" y="60" width="4" height="8"/><rect x="52" y="60" width="4" height="8"/></g>` },
      { n: "joystick", kw: "joystick arcade stick control", svg: `<ellipse cx="50" cy="76" rx="30" ry="10" fill="#2a2a2a" stroke="#1a1a1a" stroke-width="4"/><rect x="46" y="34" width="8" height="40" fill="#1a1a1a"/><circle cx="50" cy="30" r="12" fill="#e23b3b" stroke="#1a1a1a" stroke-width="4"/><rect x="66" y="64" width="10" height="10" rx="2" fill="#ffd21a" stroke="#1a1a1a" stroke-width="2"/>` },
      { n: "ghost", kw: "ghost pacman arcade game spooky", svg: `<path d="M20 50a30 30 0 0 1 60 0v30l-10-8-10 8-10-8-10 8-10-8z" fill="#ff3b6b" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/><circle cx="40" cy="46" r="7" fill="#fff"/><circle cx="60" cy="46" r="7" fill="#fff"/><circle cx="42" cy="47" r="3.5" fill="#2f7ae5"/><circle cx="62" cy="47" r="3.5" fill="#2f7ae5"/>` },
      { n: "pac", kw: "pacman arcade game chomp", svg: `<path d="M50 50L86 30a40 40 0 1 0 0 40z" fill="#ffd21a" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/><circle cx="50" cy="32" r="5" fill="#1a1a1a"/>` },
    ],
    "Nature": [
      { n: "sun", kw: "sun sunny hot rays summer", svg: `<g stroke="#ffd21a" stroke-width="7" stroke-linecap="round"><path d="M50 12v12M50 76v12M12 50h12M76 50h12M23 23l8 8M69 69l8 8M77 23l-8 8M31 69l-8 8"/></g><circle cx="50" cy="50" r="20" fill="#ffd21a" stroke="#1a1a1a" stroke-width="4"/>` },
      { n: "cloud", kw: "cloud sky weather fluffy", svg: `<path d="M30 70a15 15 0 0 1 0-30 20 20 0 0 1 39-5 14 14 0 0 1 3 35z" fill="#fff6e6" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/>` },
      { n: "wave", kw: "wave ocean sea surf water", svg: `<path d="M14 60c0-20 24-30 38-14 6 7 2 16-6 16-6 0-8-6-4-9-10-2-14 8-10 16 6 10 24 10 34-2v15H14z" fill="#36d1dc" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/><g fill="#fff"><circle cx="30" cy="40" r="2.5"/><circle cx="38" cy="36" r="2"/></g>` },
      { n: "mountain", kw: "mountain peak snow hike alps", svg: `<path d="M6 82L34 32l14 22 12-18 28 46z" fill="#5a6b7a" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/><path d="M34 32l8 13-5 2-4-3-4 4z" fill="#fff6e6" stroke="#1a1a1a" stroke-width="2"/><path d="M60 36l6 10-4 1-3-3-4 3z" fill="#fff6e6" stroke="#1a1a1a" stroke-width="2"/>` },
      { n: "palm", kw: "palm tree beach tropical island", svg: `<path d="M46 40c0 14-2 44-2 44h8s-2-30-2-44z" fill="#8a5a2b" stroke="#1a1a1a" stroke-width="3"/><g fill="#2fb36b" stroke="#1a1a1a" stroke-width="3" stroke-linejoin="round"><path d="M50 36C40 22 22 24 16 32c12-2 22 2 34 8z"/><path d="M50 36C60 22 78 24 84 32c-12-2-22 2-34 8z"/><path d="M50 36C44 20 50 10 60 8c-4 10-4 18-10 28z"/><path d="M50 36c-6-10-4-22 4-26-2 10 0 18-4 26z"/></g>` },
      { n: "tulip", kw: "tulip flower bloom spring", svg: `<path d="M50 50V84" stroke="#2fb36b" stroke-width="5" stroke-linecap="round"/><path d="M38 66c-8-2-12-10-10-16 6 2 10 6 12 12M62 66c8-2 12-10 10-16-6 2-10 6-12 12" fill="#2fb36b" stroke="#1a1a1a" stroke-width="2"/><path d="M34 34c0-10 16-22 16-22s16 12 16 22-7 18-16 18-16-8-16-18z" fill="#ff3b6b" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/><path d="M50 12v40M38 20c-2 10 0 22 12 30M62 20c2 10 0 22-12 30" fill="none" stroke="#1a1a1a" stroke-width="2"/>` },
      { n: "mushroom", kw: "mushroom toadstool fungi fairy", svg: `<path d="M20 50a30 20 0 0 1 60 0z" fill="#e23b3b" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/><g fill="#fff6e6"><circle cx="38" cy="42" r="5"/><circle cx="58" cy="40" r="6"/><circle cx="48" cy="46" r="3"/></g><path d="M42 50h16v22a8 8 0 0 1-16 0z" fill="#fff6e6" stroke="#1a1a1a" stroke-width="4"/>` },
      { n: "leaf", kw: "leaf plant green eco nature", svg: `<path d="M50 84C30 70 20 44 50 16c30 28 20 54 0 68z" fill="#2fb36b" stroke="#1a1a1a" stroke-width="4" stroke-linejoin="round"/><path d="M50 78V26M50 60l14-12M50 48L36 38M50 40l12-10" fill="none" stroke="#1a1a1a" stroke-width="2.5"/>` },
    ],
    "Badges": [
      { n: "FM-1", kw: "fm1 badge label", svg: BADGE("FM-1", "#fa5400", "#fff", 25) },
      { n: "LO-FI", kw: "lofi chill tape", svg: BADGE("LO-FI", "#141414", "#39e0a0", 23) },
      { n: "808", kw: "808 bass drum", svg: BADGE("808", "#ff3b6b", "#fff", 27) },
      { n: "ACID", kw: "acid 303 squelch", svg: BADGE("ACID", "#c6ff00", "#141414", 24) },
      { n: "MIDI", kw: "midi note control", svg: BADGE("MIDI", "#2f7ae5", "#fff", 24) },
      { n: "SYNTH", kw: "synth synthesizer", svg: BADGE("SYNTH", "#5a3bdc", "#fff", 22) },
      { n: "BASS", kw: "bass low sub", svg: BADGE("BASS", "#141414", "#ffd21a", 24) },
      { n: "DEMO", kw: "demo preview wip", svg: BADGE("DEMO", "#fff6e6", "#e23b3b", 24) },
      { n: "NEW!", kw: "new fresh", svg: BADGE("NEW!", "#ff3b6b", "#fff", 24) },
      { n: "v1.0", kw: "version release", svg: BADGE("v1.0", "#2a2a2a", "#39e0a0", 25) },
      { n: "FM", kw: "fm radio frequency", svg: BADGE("FM", "#39e0a0", "#141414", 27) },
      { n: "WAV", kw: "wav audio sample file", svg: BADGE("WAV", "#2f7ae5", "#fff", 25) },
      { n: "DUB", kw: "dub reggae bass", svg: BADGE("DUB", "#141414", "#ff7a1a", 25) },
      { n: "RAVE", kw: "rave party dance", svg: BADGE("RAVE", "#c6ff00", "#141414", 23) },
      { n: "BPM", kw: "bpm tempo beats", svg: BADGE("BPM", "#e23b3b", "#fff", 25) },
      { n: "REC", kw: "rec record red", svg: BADGE("REC", "#141414", "#ff3b6b", 25) },
      { n: "LIVE", kw: "live on air stream", svg: BADGE("LIVE", "#ff3b6b", "#fff", 24) },
      { n: "LFO", kw: "lfo modulation wobble", svg: BADGE("LFO", "#5a3bdc", "#fff", 26) },
    ],
  };
  // precompute a data URL for each image sticker once
  for (const arr of Object.values(IMG)) for (const it of arr) it.url = svgURL(SV(it.svg));

  // search keywords for common stickers (emoji carry no searchable text). Query matches these
  // or a category name; e.g. "cat", "pizza", "heart", "fire", "car" all find something.
  const KEYWORDS = {
    "😀":"happy smile grin","😂":"laugh lol tears joy funny","🤣":"rofl laugh funny","😊":"happy blush smile",
    "😍":"love heart eyes","🥰":"love adore","😘":"kiss love","😎":"cool sunglasses","🤓":"nerd geek glasses",
    "🥳":"party celebrate birthday","😭":"cry sad sob tears","😢":"cry sad tear","😡":"angry mad rage","🤬":"angry swear",
    "😱":"scream shock scared","😴":"sleep tired zzz","🤔":"think hmm","🤯":"mind blown shock","🥺":"pleading cute please",
    "😉":"wink","😜":"silly tongue","🙄":"eye roll","😬":"grimace awkward","🤗":"hug","🤫":"quiet shh secret",
    "🤢":"sick gross nausea","🤮":"vomit sick","🥵":"hot sweat","🥶":"cold freeze","😷":"mask sick","🤠":"cowboy",
    "😈":"devil evil","👿":"devil angry","👹":"ogre monster","🤡":"clown","💩":"poop","👻":"ghost spooky halloween",
    "💀":"skull dead death","☠️":"skull crossbones danger","👽":"alien ufo","👾":"alien game invader","🤖":"robot bot ai","🎃":"pumpkin halloween",
    "❤️":"heart love red","🧡":"heart orange","💛":"heart yellow","💚":"heart green","💙":"heart blue","💜":"heart purple",
    "🖤":"heart black","🤍":"heart white","💔":"broken heart breakup","💕":"hearts love","💖":"sparkle heart love","💘":"cupid heart arrow",
    "⭐":"star","🌟":"star glow shine","✨":"sparkle shine glitter","💫":"dizzy star","⚡":"lightning bolt electric power","🔥":"fire flame lit hot",
    "💥":"explosion boom","☀️":"sun sunny","🌈":"rainbow","❄️":"snow snowflake cold","💧":"water drop","🌊":"wave water ocean","🌙":"moon night",
    "💯":"hundred perfect score","✅":"check yes done tick","❌":"cross no wrong x","❓":"question","❗":"exclamation","💬":"speech bubble chat talk","🎵":"music note","🎶":"music notes",
    "🐶":"dog puppy","🐱":"cat kitten kitty","🐭":"mouse","🐹":"hamster","🐰":"rabbit bunny","🦊":"fox","🐻":"bear","🐼":"panda",
    "🐨":"koala","🐯":"tiger","🦁":"lion","🐮":"cow","🐷":"pig","🐸":"frog","🐵":"monkey","🐔":"chicken","🐧":"penguin","🐦":"bird",
    "🦅":"eagle bird","🦉":"owl","🦇":"bat","🐝":"bee","🦋":"butterfly","🐌":"snail","🐞":"ladybug beetle","🕷️":"spider","🦂":"scorpion",
    "🐢":"turtle","🐍":"snake","🦖":"dinosaur trex","🦕":"dinosaur","🐙":"octopus","🦈":"shark","🐳":"whale","🐬":"dolphin","🐟":"fish",
    "🦄":"unicorn","🐴":"horse","🦓":"zebra","🐘":"elephant","🦒":"giraffe","🐓":"rooster","🦜":"parrot bird","🐇":"rabbit bunny","🦔":"hedgehog",
    "🍎":"apple fruit","🍌":"banana","🍉":"watermelon","🍇":"grapes","🍓":"strawberry","🍒":"cherry","🍑":"peach","🍍":"pineapple",
    "🥑":"avocado","🍅":"tomato","🌽":"corn","🥕":"carrot","🍔":"burger hamburger","🍟":"fries","🍕":"pizza","🌭":"hotdog","🌮":"taco","🌯":"burrito",
    "🥪":"sandwich","🍗":"chicken meat","🍖":"meat","🥩":"steak meat","🍳":"egg","🧀":"cheese","🍞":"bread","🥐":"croissant","🥨":"pretzel",
    "🍰":"cake","🎂":"birthday cake","🧁":"cupcake","🍩":"donut","🍪":"cookie","🍫":"chocolate","🍬":"candy","🍭":"lollipop","🍿":"popcorn","🍦":"ice cream",
    "☕":"coffee","🍵":"tea","🥤":"soda drink cup","🍺":"beer","🍻":"beers cheers","🍷":"wine","🍸":"cocktail martini","🥂":"champagne cheers",
    "🌸":"flower blossom","🌹":"rose flower","🌻":"sunflower","🌷":"tulip flower","🌵":"cactus","🌲":"tree pine","🌴":"palm tree","🍀":"clover luck","🍄":"mushroom","🌍":"earth world globe","🌎":"earth world","🌚":"moon face",
    "🚗":"car","🚕":"taxi car","🚓":"police car","🚑":"ambulance","🚒":"fire truck","🏎️":"race car","🏍️":"motorcycle","🚲":"bike bicycle","✈️":"plane airplane fly","🚀":"rocket space","🛸":"ufo alien","🚁":"helicopter","🚢":"ship boat","⛵":"sailboat","🚂":"train","🏰":"castle","🎡":"ferris wheel","🎢":"roller coaster",
    "⌚":"watch time","📱":"phone mobile","💻":"laptop computer","🖥️":"computer desktop","📷":"camera photo","🎥":"movie camera film","📺":"tv television","📻":"radio","🔋":"battery","💡":"idea lightbulb","🔦":"flashlight","💰":"money bag","💵":"money dollar cash","💎":"diamond gem","🔧":"wrench tool","🔨":"hammer tool","⚙️":"gear settings","🔫":"gun","💣":"bomb","🔪":"knife","🗝️":"key","🔑":"key","🎈":"balloon party","🎁":"gift present","📚":"books","✏️":"pencil write","✂️":"scissors cut",
    "🎸":"guitar","🎹":"piano keyboard","🎺":"trumpet","🎷":"saxophone sax","🥁":"drums","🎤":"microphone mic sing","🎧":"headphones","🎨":"art paint","🎭":"theater drama masks","🎬":"movie film clapper",
    "⚽":"soccer football ball","🏀":"basketball","🏈":"football","⚾":"baseball","🎾":"tennis","🏐":"volleyball","🎱":"pool billiards 8ball","🏓":"ping pong","🎳":"bowling","🏆":"trophy win","🥇":"gold medal first","🥈":"silver medal","🥉":"bronze medal","🎯":"target dart bullseye","🎮":"game controller gaming","🎲":"dice game","♟️":"chess",
    "👑":"crown king queen","💍":"ring diamond","👓":"glasses","🎩":"top hat","🧢":"cap hat","👟":"shoe sneaker","👠":"heel shoe","🩴":"flip flop sandal",
    "👍":"thumbs up like yes good","👎":"thumbs down dislike no","👌":"ok okay perfect","✌️":"peace victory","🤞":"fingers crossed luck","🤟":"love you rock","🤘":"rock horns metal","👊":"fist bump punch","✊":"fist power","👏":"clap applause","🙏":"pray thanks please","💪":"muscle strong flex","🤝":"handshake deal","👋":"wave hi hello bye",
    "☮️":"peace","☯️":"yin yang balance","♻️":"recycle","⚠️":"warning caution","🚫":"no stop forbidden","✝️":"cross christian","☪️":"islam crescent","✡️":"star of david jewish","♈":"aries zodiac","♌":"leo zodiac","🔞":"18 adult","♿":"wheelchair accessible",
    "🏁":"checkered flag finish race","🚩":"flag red","🏴‍☠️":"pirate flag skull","🏳️‍🌈":"pride rainbow flag lgbt",
    "⛄":"snowman","🌪️":"tornado","☁️":"cloud","⛅":"cloud sun partly","🌧️":"rain","⛈️":"storm thunder","🎆":"fireworks","🎇":"sparkler fireworks",
  };
  const FM = () => window.FM1;
  function ready(fn) { const t = setInterval(() => { const nav = document.querySelector("header.site .wrap"); if (nav && window.FM1 && window.FM1Overlay) { clearInterval(t); fn(nav); } }, 120); setTimeout(() => clearInterval(t), 9000); }
  ready((nav) => {
    const total = Object.values(LIB).reduce((n, a) => n + a.length, 0) + Object.values(IMG).reduce((n, a) => n + a.length, 0);
    const css = document.createElement("style"); css.textContent = `
      #stk-btn{cursor:pointer}
      #stk-pop{position:fixed;z-index:9998;width:430px;max-width:95vw;height:460px;max-height:80vh;background:#0c0d0f;border:1px solid #232428;
        border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.65);display:none;flex-direction:column;color:#e9edf2;font:13px 'Space Grotesk',-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden}
      #stk-pop.open{display:flex}
      #stk-pop .top{padding:11px 13px 8px;border-bottom:1px solid #1c1d20;display:flex;flex-direction:column;gap:8px}
      #stk-pop h3{margin:0;font-size:13px;display:flex;align-items:center;gap:7px}
      #stk-pop h3 .dot{width:8px;height:8px;border-radius:50%;background:var(--amber);box-shadow:0 0 8px var(--amber)}
      #stk-pop h3 .cnt{margin-left:auto;font-size:10.5px;color:#8c93a0;font-weight:400}
      #stk-pop h3 .clr{background:#17181b;border:1px solid #2a2c31;color:#cfd4da;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer}
      #stk-search{width:100%;background:#17181b;border:1px solid #2a2c31;color:#e9edf2;border-radius:7px;padding:6px 9px;font:inherit;font-size:12.5px;outline:none}
      #stk-search:focus{border-color:var(--amber)}
      #stk-tabs{display:flex;gap:5px;overflow-x:auto;padding:7px 11px;border-bottom:1px solid #1c1d20;scrollbar-width:thin}
      #stk-tabs button{flex:0 0 auto;background:#17181b;border:1px solid #2a2c31;color:#9aa0ab;border-radius:999px;padding:4px 11px;font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap}
      #stk-tabs button.on{background:var(--amber);color:#180a02;border-color:transparent;font-weight:700}
      #stk-grid{flex:1;overflow:auto;padding:9px 11px 14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(42px,1fr));gap:4px;align-content:start}
      #stk-grid button{aspect-ratio:1;background:transparent;border:1px solid transparent;border-radius:9px;font-size:24px;line-height:1;cursor:grab;padding:0;
        display:flex;align-items:center;justify-content:center;transition:background .1s}
      #stk-grid button:hover{background:#1b1c20;border-color:#2a2c31;transform:scale(1.12)}
      #stk-grid button.img{font-size:0}
      #stk-grid button.img img{width:31px;height:31px;display:block;pointer-events:none}
      #stk-grid .cat{grid-column:1/-1;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#8c93a0;margin:8px 2px 1px}
      #stk-hint{padding:6px 13px;border-top:1px solid #1c1d20;font-size:10.5px;color:#8c93a0}
      #stk-pop .top{cursor:grab}
      #stk-pop.dragging .top{cursor:grabbing}
      #stk-pop h3 .mini{background:#17181b;border:1px solid #2a2c31;color:#cfd4da;border-radius:6px;padding:3px 9px;font-size:13px;cursor:pointer;line-height:1;font-weight:700}
      #stk-pop.min{height:auto!important}
      #stk-pop.min #stk-search,#stk-pop.min #stk-tabs,#stk-pop.min #stk-grid,#stk-pop.min #stk-hint{display:none}
      #stk-arrange{position:fixed;z-index:9997;left:14px;bottom:14px;display:none;align-items:center;gap:7px;
        background:#0c0d0f;border:1px solid var(--amber);border-radius:999px;padding:8px 15px;color:#e9edf2;
        font:13px 'Space Grotesk',-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.6);cursor:pointer;user-select:none}
      #stk-arrange.show{display:inline-flex}
      #stk-arrange.on{background:var(--amber);color:#180a02;font-weight:700;border-color:transparent}
      #stk-arrange .ic{font-size:15px;line-height:1}`;
    document.head.appendChild(css);

    const btn = document.createElement("a"); btn.id = "stk-btn"; btn.href = "#";
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 16 16" style="vertical-align:-2px;margin-right:5px"><path d="M9.5 1.5H3A1.5 1.5 0 0 0 1.5 3v10A1.5 1.5 0 0 0 3 14.5h5.5l6-6V3A1.5 1.5 0 0 0 13 1.5z" fill="var(--amber)"/><path d="M9 14.4V10a1 1 0 0 1 1-1h4.4z" fill="#b23c00"/><circle cx="5.3" cy="5.3" r="1.1" fill="#0c0d0f"/><circle cx="9.3" cy="5" r="1.1" fill="#0c0d0f"/></svg>Stickers`;
    (document.querySelector(".sitenav") || nav).appendChild(btn);

    const pop = document.createElement("div"); pop.id = "stk-pop";
    pop.innerHTML = `
      <div class="top">
        <h3><span class="dot"></span> Stickers <span class="cnt">${total}</span> <button class="mini" id="stk-min" title="Collapse so it stops covering the panel">–</button> <button class="clr" id="stk-clear">Clear all</button></h3>
        <input id="stk-search" type="search" placeholder="Search stickers… (cassette, 808, heart, cat, pizza)">
      </div>
      <div id="stk-tabs"></div>
      <div id="stk-grid"></div>
      <div id="stk-hint">Click a sticker to drop it on, or drag one onto the panel. Drag the stickers on the case to move them, corners to resize/rotate, × to remove. Drag this bar to move it out of the way, or tap – to collapse it. The <b>Move / delete</b> button (bottom-left) keeps stickers editable with this closed; close that and they lock so you can play.</div>`;
    document.body.appendChild(pop);

    // persistent floating toggle so stickers stay movable/deletable with the picker closed and out of the way
    const arrange = document.createElement("div"); arrange.id = "stk-arrange"; arrange.title = "Move, resize or delete stickers already on the case";
    document.body.appendChild(arrange);

    const tabs = pop.querySelector("#stk-tabs"), grid = pop.querySelector("#stk-grid"), search = pop.querySelector("#stk-search");
    const cats = Object.keys(LIB);
    let active = "All";
    const tabNames = ["All", ...Object.keys(IMG), ...cats];
    tabNames.forEach((name) => { const b = document.createElement("button"); b.textContent = name; b.classList.toggle("on", name === active); b.onclick = () => { active = name; search.value = ""; [...tabs.children].forEach((x) => x.classList.toggle("on", x === b)); renderGrid(); }; tabs.appendChild(b); });

    function tileChar(ch) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = ch; b.title = "Click or drag onto the case"; b.draggable = true;
      b.onclick = () => { window.FM1Overlay.addSticker(ch); flash(b); };
      b.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/fm1-sticker", ch); e.dataTransfer.effectAllowed = "copy"; });
      return b;
    }
    function tileImg(it) {
      const b = document.createElement("button"); b.type = "button"; b.className = "img"; b.title = it.n + " — click or drag onto the case"; b.draggable = true;
      const im = document.createElement("img"); im.src = it.url; im.alt = it.n; im.draggable = false; b.appendChild(im);
      b.onclick = () => { window.FM1Overlay.addImage(it.url, { size: 150 }); flash(b); };
      b.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/fm1-sticker-img", it.url); e.dataTransfer.effectAllowed = "copy"; });
      return b;
    }
    function flash(b) { b.style.background = "var(--amber)"; setTimeout(() => (b.style.background = ""), 160); }
    function addHead(c) { const h = document.createElement("div"); h.className = "cat"; h.textContent = c; grid.appendChild(h); }

    function renderGrid() {
      grid.innerHTML = "";
      const q = search.value.trim().toLowerCase();
      if (q) {
        const seen = new Set(), out = [];
        // image stickers by name / keywords / category
        for (const [cat, arr] of Object.entries(IMG))
          for (const it of arr)
            if (!seen.has(it) && (it.n + " " + (it.kw || "") + " " + cat).toLowerCase().includes(q)) { seen.add(it); out.push({ img: it }); }
        // emoji by per-sticker keywords and category names
        const byKw = Object.keys(KEYWORDS).filter((ch) => KEYWORDS[ch].includes(q));
        const fromCats = cats.filter((c) => c.toLowerCase().includes(q)).flatMap((c) => LIB[c]);
        for (const ch of [...byKw, ...fromCats]) if (!seen.has(ch)) { seen.add(ch); out.push({ ch }); }
        if (out.length) out.forEach((o) => grid.appendChild(o.img ? tileImg(o.img) : tileChar(o.ch)));
        else { const h = document.createElement("div"); h.className = "cat"; h.textContent = "No matches — try a tab, or words like cat, pizza, 808, cassette"; grid.appendChild(h); }
        return;
      }
      if (active === "All") {
        for (const c of Object.keys(IMG)) { addHead(c); IMG[c].forEach((it) => grid.appendChild(tileImg(it))); }
        for (const c of cats) { addHead(c); LIB[c].forEach((ch) => grid.appendChild(tileChar(ch))); }
      } else if (IMG[active]) IMG[active].forEach((it) => grid.appendChild(tileImg(it)));
      else LIB[active].forEach((ch) => grid.appendChild(tileChar(ch)));
    }
    search.oninput = renderGrid;
    renderGrid();

    pop.querySelector("#stk-clear").onclick = () => { if (window.FM1Overlay.count() && confirm("Remove all stickers and pictures from the case?")) window.FM1Overlay.clear(); };

    // drag from palette onto the panel
    const stage = FM().stage;
    if (stage) {
      stage.addEventListener("dragover", (e) => { const t = [...e.dataTransfer.types]; if (t.includes("text/fm1-sticker") || t.includes("text/fm1-sticker-img")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
      stage.addEventListener("drop", (e) => {
        const ch = e.dataTransfer.getData("text/fm1-sticker");
        const img = e.dataTransfer.getData("text/fm1-sticker-img");
        if (!ch && !img) return;
        e.preventDefault(); const r = stage.getBoundingClientRect();
        const pos = { x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 100 };
        if (img) window.FM1Overlay.addImage(img, { ...pos, size: 150 });
        else window.FM1Overlay.addSticker(ch, pos);
      });
    }

    // ----- the floating "Move / delete" toggle: keeps stickers editable while the picker is closed -----
    function updateArrange() {
      const n = window.FM1Overlay.count();
      const ed = window.FM1Overlay.editing();
      arrange.classList.toggle("show", n > 0 && !pop.classList.contains("open"));
      arrange.classList.toggle("on", ed);
      arrange.innerHTML = ed ? `<span class="ic">✓</span> Done` : `<span class="ic">✥</span> Move / delete`;
    }
    arrange.addEventListener("click", () => { window.FM1Overlay.setEditing(!window.FM1Overlay.editing(), "arrange"); updateArrange(); });
    // bind to the real overlay once it has booted (the pre-boot stub drops notifications)
    (function bindOverlay() {
      if (window.FM1Overlay && window.FM1Overlay._live) { window.FM1Overlay.onChange(updateArrange); updateArrange(); }
      else setTimeout(bindOverlay, 120);
    })();

    // ----- picker position: default under the button, but draggable + collapsible so it never traps a sticker -----
    let moved = false;
    const clampInView = () => {
      const r = pop.getBoundingClientRect();
      const l = Math.max(8, Math.min(parseFloat(pop.style.left) || r.left, window.innerWidth - r.width - 8));
      const t = Math.max(8, Math.min(parseFloat(pop.style.top) || r.top, window.innerHeight - 46));
      pop.style.left = l + "px"; pop.style.top = t + "px";
    };
    const place = () => {
      if (moved) { clampInView(); return; }
      const r = btn.getBoundingClientRect(); pop.style.top = (r.bottom + 6) + "px"; pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 442)) + "px";
    };
    // drag the header bar to shove the picker aside
    const topBar = pop.querySelector(".top"); let dragging = false, dsx = 0, dsy = 0;
    topBar.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || e.target.closest("input")) return;
      dragging = true; moved = true; pop.classList.add("dragging");
      const r = pop.getBoundingClientRect(); dsx = e.clientX - r.left; dsy = e.clientY - r.top;
      try { topBar.setPointerCapture(e.pointerId); } catch {} e.preventDefault();
    });
    topBar.addEventListener("pointermove", (e) => { if (!dragging) return; pop.style.left = (e.clientX - dsx) + "px"; pop.style.top = (e.clientY - dsy) + "px"; });
    topBar.addEventListener("pointerup", (e) => { if (!dragging) return; dragging = false; pop.classList.remove("dragging"); clampInView(); try { topBar.releasePointerCapture(e.pointerId); } catch {} });
    // collapse so the big grid stops covering the panel while you arrange
    pop.querySelector("#stk-min").addEventListener("click", (e) => {
      e.stopPropagation(); const min = pop.classList.toggle("min");
      e.currentTarget.textContent = min ? "+" : "–";
      e.currentTarget.title = min ? "Expand the sticker grid" : "Collapse so it stops covering the panel";
      clampInView();
    });

    const setOpen = (open) => {
      pop.classList.toggle("open", open);
      window.FM1Overlay && window.FM1Overlay.setEditing(open, "stickers");
      if (open) { place(); if (!pop.classList.contains("min")) search.focus(); }
      updateArrange();
    };
    btn.onclick = (e) => { e.preventDefault(); setOpen(!pop.classList.contains("open")); };
    window.addEventListener("resize", () => { if (pop.classList.contains("open")) place(); });
    document.addEventListener("click", (e) => {
      if (!pop.classList.contains("open")) return;
      if (e.target === btn || btn.contains(e.target) || pop.contains(e.target)) return;
      if (e.target === arrange || arrange.contains(e.target)) return;
      if (e.target.closest && e.target.closest(".fm1-ov")) return;   // don't close when you grab a sticker on the case
      setOpen(false);
    });
  });
})();
