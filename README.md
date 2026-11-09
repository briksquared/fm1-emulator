<div align="center">

# FM-1 Emulator

An offline desktop emulator for the **M-VAVE FM-1**. Run FM-1 firmware with no hardware:
choose a firmware, press **Start**, and play with your keyboard, mouse, or a MIDI controller.

[![Release](https://img.shields.io/github/v/release/briksquared/fm1-emulator?label=release)](https://github.com/briksquared/fm1-emulator/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/briksquared/fm1-emulator/total?label=downloads)](https://github.com/briksquared/fm1-emulator/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-informational)

<img src="docs/screenshot.jpg" alt="FM-1 Emulator running a firmware" width="760">

</div>

---

## Screenshots

| | |
| --- | --- |
| <img src="docs/screenshots/01-electro-orange.png" alt="Felucca running in the Electro Orange theme" width="400"> | <img src="docs/screenshots/02-miami-stickers.png" alt="Miami theme with stickers on the case" width="400"> |
| **Electro Orange** — Felucca running, with the firmware radar and Firmware uplink panels | **Miami** — stickers placed in the panel's open spots |
| <img src="docs/screenshots/03-white-blue-stickers.png" alt="FM-1 White / Blue colourway with stickers" width="400"> | <img src="docs/screenshots/04-gold-stickers-palette.png" alt="Gold on Black theme with the sticker palette open" width="400"> |
| **FM-1 White / Blue** — one of the real hardware colourways, with stickers | **Gold on Black** — the sticker palette open over the machine |
| <img src="docs/screenshots/05-emerald-firmware-browser.png" alt="The firmware browser with all 259 firmwares" width="400"> | <img src="docs/screenshots/06-navy-flash-recovery.png" alt="FM-1 Navy theme with the recovery options open" width="400"> |
| **Emerald** — browsing all 259 bundled firmwares | **FM-1 Navy** — Firmware uplink with the recovery options open |
| <img src="docs/screenshots/07-vaporwave-keys.png" alt="Vaporwave theme with the Keys module open" width="400"> | |
| **Vaporwave** — the Keys module (scales, chords, arpeggiator) | |

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

## Features

- **259 verified open-source firmwares bundled** — newest first, unique, and fully offline
- **Search every firmware** — match names, IDs, versions, authors, licenses, product identities, and descriptions
- **One-button update radar** — scans for newly published open-license FM-1 packages and downloads one only when you select it
- **Load your own** — drag any `.fwsc` onto the window
- **Play** with the computer keyboard, mouse, or a USB MIDI controller
- **Customize** panel colors and add image decals; decorate the case with stickers
- **Firmware recovery (Windows)** — back up, restore, and reinstall your FM-1; a flash is never a dead end

## Recovery & safety

The emulator runs firmware purely in software — it cannot harm your computer or your FM-1. The only
risk is flashing real hardware, and the app is built so you can always recover: back up the unit's
flash in one click, resume an interrupted install, or restore with the bundled M-Flasher (Windows).
See **[Hardware flashing & recovery](docs/Recovery.md)**.

## Help

- **[Installation & first run](docs/Installation.md)** — the unsigned-app warning on Windows, macOS, and Linux
- **[Troubleshooting](docs/Troubleshooting.md)** — no sound, MIDI not detected, a firmware won't boot, settings not saving
- **[Firmware](docs/Firmware.md)** — switching firmware and loading your own `.fwsc`
- **[Hardware flashing & recovery](docs/Recovery.md)** — for a real FM-1 unit

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

Maintainers can refresh the open Firmware Hub set with `npm run sync:firmwares`; the command verifies
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
