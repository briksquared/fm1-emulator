# Installation & first run

Download the build for your system from the
[Releases](https://github.com/briksquared/fm1-emulator/releases/latest) page.

The builds are **not code-signed**, so each OS shows a one-time warning the first time you open
the app. This is normal for independent software — nothing is wrong with the download.

## Windows

- **Installer:** `FM-1-Emulator-Setup-x.y.z.exe` — double-click and follow the prompts.
- **Portable:** `FM-1-Emulator-x.y.z-portable.exe` — runs without installing.
- If you see **"Windows protected your PC"**, click **More info → Run anyway**.

## macOS

- Open the `.dmg` and drag **FM-1 Emulator** to Applications. Use the `arm64` build on Apple
  Silicon (M1/M2/M3), the `x64` build on Intel.
- First launch: **right-click (or Control-click) the app → Open → Open**. Double-clicking shows
  "unidentified developer" with no Open button; right-clicking gives you one.
- If macOS says the app is **"damaged" or "can't be opened"**, clear the quarantine flag in Terminal:

  ```bash
  xattr -dr com.apple.quarantine "/Applications/FM-1 Emulator.app"
  ```

  On **Apple Silicon**, if it still won't open after that, re-sign it locally (arm64 requires a
  signature — this applies an ad-hoc one):

  ```bash
  codesign --force --deep --sign - "/Applications/FM-1 Emulator.app"
  ```

## Linux

- **AppImage:** make it executable, then run it:

  ```bash
  chmod +x FM-1-Emulator-*.AppImage
  ./FM-1-Emulator-*.AppImage
  ```

  It needs FUSE. If it won't start, run with `--appimage-extract-and-run`.
- **Debian / Ubuntu (.deb):** `sudo apt install ./FM-1-Emulator-*.deb`
