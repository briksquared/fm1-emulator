# Hardware flashing & recovery

**A flash is never meant to be a dead end.** This page is the safety contract for writing
firmware to a real **M-VAVE FM-1**.

**You flash at your own risk.** Installing, updating, restoring, or recovering firmware on a real
unit can brick or damage it. The author of this project is **not responsible** for any bricked or
damaged FM-1, lost songs or patches, or other hardware/data loss. See [DISCLAIMER.md](../DISCLAIMER.md).

## What can and cannot harm what

| Action | Can brick the FM-1? | Can harm the PC? |
| --- | --- | --- |
| Running firmware in the **emulator** | No — pure software | No |
| **Install / Finish / Roll back** over USB-MIDI in this app | Yes, if power is lost mid-write or a bad package is forced past checks — mitigated below | No |
| **M-Flasher** (external) | Same class of risk as any low-level flasher; use a full backup first | Needs admin on Windows; allow-listed launch only |

## Built-in fail-safes (this app)

Before **any** byte is written:

1. **Package gate** — size, FM-1 product string only (SMK-37 and other models refused), UFW layout, firmware area at `0x4000`, image must not reach the chip-key sector at `0xFF000`, optional catalog SHA-256.
2. **Identity gate** — USB-MIDI handshake must answer as an FM-1; wrong product → nothing written. Detect never sends UPGRADE.
3. **Confirm gate** — in-place confirm with required checkboxes (charged / data cable / no flash backup / no rollback yet when applicable). Optional “Open M-Flasher to back up first”.
4. **Package vault** — the exact `.fwsc` bytes of the install (and last good install) are kept on this computer (IndexedDB) so **Finish interrupted install** and **Roll back** still work after a reload or offline.
5. **Journal** — phase (`checked → staging → loader → writing → rebooting → done`) survives crash/reload; stale (>24h) installs are still offered with a warning.
6. **No silent retry** — a lost write does not continue by itself; reconnecting alone writes nothing.
7. **badreq limit** — if the unit asks outside the image twice for the same package, **Finish** is blocked; use **Roll back** or M-Flasher.
8. **Post-write check** — after the loader finishes, the unit must reappear and report the package identity (`mismatch` / `noreturn` otherwise).
9. **Window close guard** — closing mid-write prompts; desktop app surfaces the same.

## The golden rule: back up first

Before you write anything to a real unit, **back up its whole flash** with **M-Flasher**
(Advanced recovery → Open M-Flasher). This app **cannot** read the FM-1’s flash or songs.
A full backup can always be restored even if an in-app Roll back is unavailable.

## Recovery toolkit

| Tool | What it does |
| --- | --- |
| **Finish interrupted install** | Serves the **same** package (from vault / catalog / re-chosen file) to a unit already in update mode |
| **Roll back** | Writes the **last firmware this app successfully installed on this computer** through the waiting loader — not a chip dump |
| **Check what is connected** | Look-only triage (MIDI identity + Windows USB list on desktop) |
| **Copy troubleshooting info** | Sanitized log (no paths, ports, or serials) |
| **M-Flasher** | Full flash backup / restore / verify / download mode (Windows; bundled with the desktop app) |
| **FM-1 Unbricker / Transporter** | Last resort when no USB device appears — external, wiring, own risk (linked in-app) |

## If something goes wrong

1. **Do not switch the FM-1 off** if an install stopped mid-write.
2. Reconnect a USB **data** cable → **Check connection**.
3. If it shows **update mode** → **Finish interrupted install** (same package) or **Roll back**.
4. If Finish fails with **bad request** twice → stop Finish; Roll back or M-Flasher restore.
5. If Windows shows a disk **WL82 UBOOT1.00** → download mode; this app cannot MIDI-flash it — use M-Flasher; never format that disk.
6. If nothing is detected after the in-app steps → stop cycling power; see Advanced recovery.

### Entering download mode (external tools)

- With m-bootloader: hold **REC** (SMK-37: **SEQ REC**) while switching on.
- Felucca / SLOOP / Snoop37: hold **OCT−** and **OCT+** ~10s while running / starting.

## M-Flasher notes (Windows)

M-Flasher (Julius Vitkauskas, MIT) needs administrator rights and a USB data cable. The desktop
app only launches the allow-listed bundled/vendor binary — the renderer never supplies a path or
command. On macOS/Linux use the in-app Web MIDI installer for normal updates; use M-Flasher on a
Windows PC for full flash backup/restore and ROM download mode.
