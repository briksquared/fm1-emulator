# Troubleshooting

## A security warning appears on first launch
Expected — the builds aren't code-signed. See [Installation & first run](Installation.md) for the
one-time step on each OS.

## No sound
- Press **Start** first. Audio only begins after you interact with the app.
- Check your system's output device and volume.
- Try a different latency/buffer option in the app's audio setting.

## A MIDI keyboard isn't detected
- Connect the controller before opening the app, or reconnect it and reselect it in the app.
- Web MIDI works on Windows and Linux, and in the desktop app on all platforms.
- **iPhone and iPad have no Web MIDI** — external controllers won't work there, though on-screen
  playing does.

## A firmware won't boot
Some early or experimental firmwares don't boot — the same as on real hardware. That's the
firmware, not the emulator. Choose another from the list, or download a newer build of that
firmware from its source repository and load it.

## The window is blank or seems stuck
The app is offline-first and loads its firmware list on launch; give it a few seconds. Clicking
the icon again focuses the existing window instead of opening a second one. If it ever looks
stale, quit fully and reopen.

## Colors, stickers, or favorites didn't save
Settings are stored locally by the app. They won't persist if it's run from a read-only or
sandboxed location.

## "Couldn't check for updates"
**Check for App Updates…** asks GitHub for the latest release. It needs a connection, and GitHub
limits how often one network can ask; if it says so, try again later or open the
[releases page](https://github.com/briksquared/fm1-emulator/releases) directly. The app never
downloads or installs updates itself: install a new version over the old one.

## Something else
Open an [issue](https://github.com/briksquared/fm1-emulator/issues) with your OS and a short
description of what you saw. If a notice is showing, its **Copy diagnostics** button copies a
short report you can paste in: app or browser, the browser's user-agent string (OS and version),
CPU core count, the running firmware, its notices and recent audio stats. It leaves out your
names, file paths and firmware files; read it before you post.
