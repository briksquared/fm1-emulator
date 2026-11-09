# Changelog

## 1.1.0 — 2026-11-09

- Expanded the public offline library from 115 to 259 unique, explicitly open-licensed FM-1 firmware packages.
- Refreshed all Firmware Hub packages to their current releases and ordered the library newest to oldest.
- Added AURORA 0.9.1 by twochannels, including its newer-UC25HQ80 flash compatibility update.
- Added an in-app open-source update radar that compares the bundled catalog with the live Firmware Hub and remembers new releases without downloading them until selected.
- Rebuilt firmware search as a visible all-catalog result list with accent-insensitive matching across names, IDs, versions, authors, licenses, products, and descriptions.
- Defaulted to software rendering on desktop to prevent the full-window black-screen failure after Start.
- Defaulted firmware execution to the stable interpreter; the JIT is now opt-in with `?jit=1`.
- Kept the animation loop alive after a transient detached WebAssembly view instead of freezing the panel.
- Added visible renderer recovery, desktop failure logs, truthful running-firmware identity, and package SHA-256/product checks.
- Added type-101 factory-resource loading so Melodee displays its own resources instead of falling back to another firmware's screen.
- Added a reproducible catalog verifier, exact source/hash manifest, third-party license texts, and release-CI validation.
