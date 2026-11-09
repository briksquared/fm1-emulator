<div align="center">

# FM-1 Emulator

### Find, try, flash, and recover firmware for the M-VAVE FM-1.

[![Release](https://img.shields.io/github/v/release/briksquared/fm1-emulator?label=release)](https://github.com/briksquared/fm1-emulator/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/briksquared/fm1-emulator/total?label=downloads)](https://github.com/briksquared/fm1-emulator/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-informational)

<img src="docs/screenshots/01-miami.png" alt="FM-1 Emulator running a firmware" width="760">

</div>

---

The FM-1 has a huge community firmware scene, and this app is the easy way into it. It ships with
**259 open-source FM-1 firmwares**, lets you search them and spot new releases, and runs any of them
in a faithful emulator so you can **try a firmware before it goes anywhere near your unit**. When
you find one you like, flash it to your real FM-1 over USB from the same window, with backup and
recovery tools one click away.

## How it works

1. **Find.** Browse or search the bundled library, or let the firmware radar check for newly
   published open-source releases.
2. **Try.** Press **Start** and play the firmware in the emulator with your computer keyboard, the
   mouse, a MIDI controller, or your FM-1 itself.
3. **Flash.** Connect the FM-1 with a USB data cable, pick the firmware in the **Firmware uplink**
   panel, and press **Deploy selected firmware**.
4. **Recover.** If an install is interrupted, **Resume interrupted install** finishes it. On
   Windows, the bundled M-Flasher backs up, restores, and reinstalls the whole flash.

## Screenshots

| | |
| --- | --- |
| <img src="docs/screenshots/01-miami.png" alt="Felucca running in the Miami theme" width="400"> | <img src="docs/screenshots/02-cobalt-customize-interface.png" alt="Customize, Interface tab, recolouring the app" width="400"> |
| <img src="docs/screenshots/03-white-green-stickers.png" alt="FM-1 White / Green colourway with stickers" width="400"> | <img src="docs/screenshots/04-gold-customize-device-stickers.png" alt="Customize, Device tab, with stickers on a Gold on Black case" width="400"> |
| <img src="docs/screenshots/05-emerald-browser-search.png" alt="Firmware browser searching for drum firmwares" width="400"> | <img src="docs/screenshots/06-amethyst-radar-uplink.png" alt="Firmware radar, Firmware uplink and recovery options" width="400"> |
| <img src="docs/screenshots/07-crimson-banks.png" alt="DX7 patch banks" width="400"> | <img src="docs/screenshots/08-ice-cables-scope-rec.png" alt="MIDI player, Tape, Scope and the MIDI recorder" width="400"> |
| <img src="docs/screenshots/09-vaporwave-keys.png" alt="Keys with scales, chords and arpeggiator" width="400"> |  |

## Features

### Firmware library
- **259 open-source firmwares bundled**, newest first, every one boot-checked and SHA-256 verified,
  all available offline
- **Search** by name, author, version, license, product identity, or description (try "drum",
  "bass", "ambient"), plus **Samplers** and **Favorites** filters and a full **Browse all** view
- **Open-source firmware radar**: one button scans for newly published open-license FM-1 releases; nothing
  downloads until you pick one
- **Load your own**: open or drag in any `.fwsc` package, including M-VAVE's stock firmware

### Try before you flash
- The FM-1's chip, screen, keys, knobs, and audio emulated in software, running the same update
  packages you would install on the hardware
- Each firmware's card says how to drive it (*Plays MIDI*, *DX7 banks*, *Sampler*, *Clock-sync*)
- The emulator can't touch your FM-1 or your computer, so trying a firmware carries no risk

### Flash and recover
- **Firmware uplink**: scan for the connected FM-1, pick any bundled firmware or your own `.fwsc`,
  and deploy it over USB-MIDI (desktop app, or Chrome and Edge)
- The unit's product identity is checked before the write, and again after it restarts
- **Resume interrupted install** finishes a write that was cut off; the unit stays in update mode
  until it completes
- **Windows:** the bundled **M-Flasher** backs up, restores, and reinstalls the whole flash, and
  reaches a unit in download mode when nothing else can
- Step-by-step recovery guide in the app and in [docs/Recovery.md](docs/Recovery.md)

### Play
- Computer keyboard, mouse, or any USB MIDI controller; plug in your real FM-1 and the desktop app
  picks it as the MIDI input so its keys play the emulator
- **Keys** module with scales, chords, and an arpeggiator, a MIDI file player, and a scope
- **Rec** records what you play to a `.mid` file; the **Tape** deck records the FM-1's output to
  `.wav` and feeds samples into firmwares that take audio in
- **DX7 banks** for DX7-capable firmwares
- **Customize** the case with presets of the real FM-1 colourways and many more, your own pictures,
  and hundreds of **stickers**

## Download

Get the latest build for your system from the [**Releases**](https://github.com/briksquared/fm1-emulator/releases/latest) page.

| OS | File |
| --- | --- |
| **Windows** | `FM-1-Emulator-Setup-*.exe` (installer) or `*-portable.exe` (no install) |
| **macOS** | `*-arm64.dmg` (Apple Silicon) · `*-x64.dmg` (Intel) |
| **Linux** | `*.AppImage` or `*.deb` |

## First launch

The builds aren't code-signed, so your OS shows a **one-time warning** the first time. It's safe —
here's how to get past it:

- **macOS** — right-click (or Control-click) the app → **Open** → **Open**. (A double-click only shows
  a *Cancel* button; right-clicking gives you the **Open** button.) If it says **"damaged"**, run in
  Terminal: `xattr -dr com.apple.quarantine "/Applications/FM-1 Emulator.app"` then
  `codesign --force --deep --sign - "/Applications/FM-1 Emulator.app"`.
- **Windows** — if SmartScreen appears, click **More info → Run anyway**.
- **Linux** — the `.deb` is easiest. For the AppImage, if it won't start: `sudo apt install libfuse2`
  (Ubuntu 24.04: `libfuse2t64`), and on Ubuntu 24.04 run with `--no-sandbox` if you hit a sandbox error.

Full per-platform detail: **[Installation & first run](docs/Installation.md)**.

## Help

- **[Installation & first run](docs/Installation.md)** — the unsigned-app warning on Windows, macOS, and Linux
- **[Troubleshooting](docs/Troubleshooting.md)** — no sound, MIDI not detected, a firmware won't boot, settings not saving
- **[Firmware](docs/Firmware.md)** — switching firmware and loading your own `.fwsc`
- **[Hardware flashing & recovery](docs/Recovery.md)** — flashing a real FM-1 and getting back from a failed install

## Firmware & licensing

Only firmwares published under a clear redistributable open-source license, with available source
and a passing emulator boot audit, are bundled. The 259 packages use GPL, MPL, or another compatible
open license and are redistributed unchanged with credit — see [THIRD-PARTY.md](THIRD-PARTY.md) and
the exact hashes in [FIRMWARE-SOURCES.json](FIRMWARE-SOURCES.json). Packages with missing or
unverifiable licensing, restricted media, a wrong-device identity, or a failed boot check stay out.
The M-VAVE stock firmware is not bundled; load your own `.fwsc` to run it.

## Build from source

Requires [Node.js](https://nodejs.org) 18+.

```bash
git clone https://github.com/briksquared/fm1-emulator.git
cd fm1-emulator
npm install
npm start            # run it
npm run dist:win     # or dist:mac / dist:linux to package
```

Release builds for all three platforms are produced by GitHub Actions on each tag.

Maintainers can refresh the bundled open-source set with `npm run sync:firmwares`; the command
verifies every SHA-256 hash and FM-1 product identity and removes superseded package files.
Run `npm run audit:firmwares -- --out <directory>` to boot every package in an isolated emulator,
check for CPU halts or blank LCDs, and write a machine-readable report plus LCD captures.

## Credits

A fork of [fm1-emu](https://github.com/joakimeriksson/fm1-emu) by Joakim Eriksson (MIT), which
provides the Rust→WebAssembly emulation engine. Firmware by the authors listed in
[THIRD-PARTY.md](THIRD-PARTY.md).

## License

[MIT](LICENSE). See [NOTICE.md](NOTICE.md) for the fork, bundled-firmware, and trademark notices.
Unofficial — not affiliated with, authorized by, or endorsed by M-VAVE. See [DISCLAIMER.md](DISCLAIMER.md).
