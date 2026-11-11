# FM-1 Emulator 1.1.2 — release notes (archive)

Published 2026-11-10. Tag `v1.1.2`.
https://github.com/briksquared/fm1-emulator/releases/tag/v1.1.2

## Ships

- Patch bay with generative modules, presets, and cable motion
- Desktop MIDI link to a real FM-1; Focus Mode; shorter Install confirm
- Themes (Midnight, Graphite, Cobalt, Emerald, Crimson, Vaporwave, Ice, Paper)
- Wave app icon; open-license catalog (257 packages)

## README gallery firmwares

| Image | Firmware on the LCD |
| --- | --- |
| `docs/hero.jpg` (under Download) | AURORA |
| `01-midnight` … `08-paper` | AURORA, JIANT FM, SIDOU, Melodee, Bigorna, Ravel, Cut-A-Dor, Bunker Evolved |
| Feature shots 09–12 | KARMA, MONO2K, Chipbox, BEETLE BLUE |

Capture: `tools/capture-screenshots.mjs` (real `#start` click; wait until running).
Image URLs in README use `?v=1.1.2` cache-bust for GitHub CDN / mobile.

## CI note

Release job runs `npm test` (`ci/verify.mjs`). Radar “kept” rows need
`classifyScan(..., { includeKept: true })`. README must mention the live package
count (`257` as of this tag).
