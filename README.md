<div align="center">

# FM-1 Emulator

An offline desktop emulator for the **M-VAVE FM-1**. Run FM-1 firmware with no hardware:
choose a firmware, press **Start**, and play with your keyboard, mouse, or a MIDI controller.

[![Release](https://img.shields.io/github/v/release/briksquared/fm1-emulator?label=release)](https://github.com/briksquared/fm1-emulator/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/briksquared/fm1-emulator/total?label=downloads)](https://github.com/briksquared/fm1-emulator/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-informational)

</div>

---

## What's new in 1.1.2

Patch bay · generative modules · cable motion · desktop MIDI link · Focus Mode · colour themes.

## Download

Get the latest build for your system from the [**Releases**](https://github.com/briksquared/fm1-emulator/releases/latest) page.

| OS | File |
| --- | --- |
| **Windows** | `FM-1-Emulator-Setup-*.exe` (installer) or `*-portable.exe` (no install) |
| **macOS** | `*-arm64.dmg` (Apple Silicon) · `*-x64.dmg` (Intel) |
| **Linux** | `*.AppImage` or `*.deb` |

<p align="center">
  <img src="docs/hero.jpg" alt="FM-1 Emulator — AURORA" width="760">
</p>

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

## Features

- **Open-source firmwares bundled** — 257 packages, newest first, unique, fully offline
- **Search every firmware** — names, IDs, versions, authors, licenses, products, descriptions
- **Update radar** — finds newly published open-license packages; downloads only when you pick one
- **Load your own** — drag any `.fwsc` onto the window
- **Play** — computer keyboard, mouse, or USB MIDI
- **Patch bay** — generative modules with presets, grooves, and moving cables
- **Desktop MIDI** — Bluetooth or USB link to a paired FM-1
- **Focus Mode** — enlarge the LCD; session export/import for UI prefs
- **Themes** — Midnight, Graphite, Cobalt, Emerald, Crimson, Vaporwave, Ice, Paper
- **Customize** — panel colours, decals, stickers
- **Firmware recovery (Windows)** — backup, restore, reinstall

## Colours

<p align="center">
  <img src="docs/screenshots/01-midnight.png" alt="Midnight" width="48%">
  <img src="docs/screenshots/02-graphite.png" alt="Graphite" width="48%">
</p>
<p align="center">
  <img src="docs/screenshots/03-cobalt.png" alt="Cobalt" width="48%">
  <img src="docs/screenshots/04-emerald.png" alt="Emerald" width="48%">
</p>
<p align="center">
  <img src="docs/screenshots/05-crimson.png" alt="Crimson" width="48%">
  <img src="docs/screenshots/06-vaporwave.png" alt="Vaporwave" width="48%">
</p>
<p align="center">
  <img src="docs/screenshots/07-ice.png" alt="Ice" width="48%">
  <img src="docs/screenshots/08-paper.png" alt="Paper" width="48%">
</p>

<p align="center">
  <img src="docs/screenshots/09-cobalt-customize.png" alt="Customize" width="48%">
  <img src="docs/screenshots/10-emerald-browser.png" alt="Browser" width="48%">
</p>
<p align="center">
  <img src="docs/screenshots/11-ice-patch-bay.png" alt="Patch bay" width="48%">
  <img src="docs/screenshots/12-vaporwave-keys.png" alt="Keys" width="48%">
</p>

## Recovery & safety

The emulator runs firmware purely in software — it cannot harm your computer or your FM-1. The only
risk is flashing real hardware. The app tries to help you recover (backup, resume, roll back, Windows
flash recovery tool), but **a real flash can still brick a unit**, and **the author is not
responsible for any bricked or damaged FM-1** — you flash at your own risk. Details:
**[Hardware flashing & recovery](docs/Recovery.md)** · **[Disclaimer](DISCLAIMER.md)**.

## Help

- **[Installation & first run](docs/Installation.md)** — the unsigned-app warning on Windows, macOS, and Linux
- **[Troubleshooting](docs/Troubleshooting.md)** — no sound, MIDI not detected, a firmware won't boot, settings not saving
- **[Firmware](docs/Firmware.md)** — switching firmware and loading your own `.fwsc`
- **[Hardware flashing & recovery](docs/Recovery.md)** — for a real FM-1 unit

## Firmware & licensing

Only firmwares published under a clear redistributable open-source license, with available source
and a passing emulator boot audit, are bundled. Packages use GPL, MPL, or another compatible
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

Maintainers can refresh the open firmware set with `npm run sync:firmwares`; the command verifies
every SHA-256 hash and FM-1 product identity and removes superseded package files.
Run `npm run audit:firmwares -- --out <directory>` to boot every package in an isolated emulator,
check for CPU halts or blank LCDs, and write a machine-readable report plus LCD captures.

## Credits

A fork of [fm1-emu](https://github.com/joakimeriksson/fm1-emu) by Joakim Eriksson (MIT), which
provides the Rust→WebAssembly emulation engine. Firmware by the authors listed in
[THIRD-PARTY.md](THIRD-PARTY.md).

## License

[MIT](LICENSE). See [NOTICE.md](NOTICE.md) for the fork, bundled-firmware, and trademark notices.
Unofficial — not affiliated with, authorized by, or endorsed by M-VAVE. See [DISCLAIMER.md](DISCLAIMER.md).
