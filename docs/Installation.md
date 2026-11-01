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

The Linux builds are unsigned (normal for Linux — there's no Gatekeeper), so they just run. If one
**won't launch**, it's almost always one of the two system issues below, not the app.

- **Debian / Ubuntu (.deb)** — the smoother path; it installs to `/opt` and sidesteps the FUSE
  requirement:

  ```bash
  sudo apt install ./FM-1-Emulator-*.deb
  ```

- **AppImage:** make it executable, then run it:

  ```bash
  chmod +x FM-1-Emulator-*.AppImage
  ./FM-1-Emulator-*.AppImage
  ```

  AppImages need **FUSE 2**, which isn't installed by default on Ubuntu 22.04+ (it ships FUSE 3). If
  it won't start, install it — or skip FUSE with the extract-and-run flag:

  ```bash
  sudo apt install libfuse2          # Ubuntu 24.04: sudo apt install libfuse2t64
  ./FM-1-Emulator-*.AppImage --appimage-extract-and-run
  ```

- **"The SUID sandbox helper binary was found, but is not configured correctly" (Ubuntu 24.04+):**
  this is Ubuntu's AppArmor restricting unprivileged user namespaces, not an app bug. Launch with:

  ```bash
  ./FM-1-Emulator-*.AppImage --no-sandbox
  ```

  (`--no-sandbox` disables one Chromium security layer — fine for a local, offline tool.)
