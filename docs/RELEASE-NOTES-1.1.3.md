# FM-1 Emulator 1.1.3

## Highlights

- **Fullscreen** and **Focus** live in the deck header beside **Flash** (no extra bar above the canvas).
- **Focus** zooms the firmware **LCD screen well** to fit the viewport — not the whole front panel. Open from the header or command palette; close with **✕** or **Escape** only.
- Release CI attaches **Windows, macOS, and Linux** builds in one step.

## Tests before publish

```bash
npm test
npm run test:midi
```

Tag push runs verify, self-test search/boot, and three-platform builds (see `.github/workflows/release.yml`).

## Still 1.1.2 underneath

Patch bay, themes, desktop MIDI, radar, recovery — unchanged from 1.1.2 unless noted in CHANGELOG.md.
