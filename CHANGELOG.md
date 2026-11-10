# Changelog

## 1.1.2 — 2026-11-10

- Patch bay with generative modules, presets, and cable motion.
- Desktop MIDI link to a real FM-1; Focus Mode; shorter Install confirm.
- Themes, wave app icon, open-license catalog cleanup.

## 1.1.1 — 2026-11-09

- Ported the private-app update set into the public tree while keeping the **open-license-only**
  catalog (259 packages). Closed / unlicensed firmwares stay private.
- Fixed Apple Silicon audio noise (issue #1): worker + stream queue (`engine.js` /
  `stream-worklet.js`). Fallback: `?engine=worklet`. Worker JIT on by default (`?jit=0` off).
- Neutral catalog naming (no “Firmware Hub” branding); open-license radar still filters licenses.
- Hide/show every bar and panel (`layout.js`); MIDI/Tape/Scope start folded.
- Compact install / recovery flow, Advanced recovery for M-Flasher only, USB check IPC,
  flash-core troubleshooting.
- Play-assist chain (transpose / chords / arp / scale), command palette, help, themes, scope,
  tuner, MIDI monitor, notes, and related tools.
- Desktop app update check against this public repo’s Releases; Mac ad-hoc codesign unchanged.

## 1.1.0 — 2026-11-09

- Expanded the public offline library from 115 to 259 unique, explicitly open-licensed FM-1 firmware packages.
- Refreshed all catalog packages to their current releases and ordered the library newest to oldest.
- Added AURORA 0.9.1 by twochannels, including its newer-UC25HQ80 flash compatibility update.
- Added an in-app firmware radar that compares the bundled catalog with the live firmware catalog and remembers new releases without downloading them until selected.
- Rebuilt firmware search as a visible all-catalog result list with accent-insensitive matching across names, IDs, versions, authors, licenses, products, and descriptions.
- Defaulted to software rendering on desktop to prevent the full-window black-screen failure after Start.
- Defaulted firmware execution to the stable interpreter; the JIT is now opt-in with `?jit=1`.
- Kept the animation loop alive after a transient detached WebAssembly view instead of freezing the panel.
- Added visible renderer recovery, desktop failure logs, truthful running-firmware identity, and package SHA-256/product checks.
- Added type-101 factory-resource loading so Melodee displays its own resources instead of falling back to another firmware's screen.
- Added a reproducible catalog verifier, exact source/hash manifest, third-party license texts, and release-CI validation.
