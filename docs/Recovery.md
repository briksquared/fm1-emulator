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

## Windows USB not found after changing firmware

The FM-1 firmware controls which USB interfaces the computer sees. USB audio and USB-MIDI are
separate interfaces: a firmware can still run on the synth while its USB audio driver fails and
Windows consequently exposes no MIDI port. The app cannot discover or flash a unit through a MIDI
port that Windows has not created.

This is a known risk with **MASIF** on Windows. Its author documents bidirectional USB audio as
tested on macOS; the current public app records that the Windows composite audio interface can fail
with Device Manager **Code 10**, leaving USB-MIDI unavailable too. This does not mean the FM-1 needs
Linux. Use MASIF's web installer on macOS if you need MASIF's USB audio features. On Windows, the
app excludes MASIF from the firmware picker and installer; choose Mutable Dreams, Felucca, or your
own stock `.fwsc` instead. MASIF remains available in the software emulator.

If the FM-1 already runs MASIF and Check reports no USB-MIDI:

1. Keep the unit powered. Try a known data-capable cable connected directly to the computer,
   without a hub; try another port. A charge-only cable cannot enumerate MIDI.
2. In the app's Windows installer panel, use **Fix USB** if it is offered. It requests
   administrator permission to rescan Windows Plug-and-Play devices and remove stale FM-1 device
   instances. Then reconnect the FM-1 and press **Check** again. Review the administrator prompt
   before accepting it.
3. If Windows still shows Code 10 or no MIDI port, use the app's **Advanced recovery** steps to
   restore a known working firmware such as Felucca or stock, then reconnect and Check again. Back
   up the flash first when possible. Do not format a disk named `WL82 UBOOT1.00`; that is the
   FM-1's ROM download mode.
4. If Check still cannot see a port, use the in-app **Copy troubleshooting info** action and
   consult the recovery guide. Stop repeating firmware writes when Windows has no MIDI endpoint:
   the installer has no path to the device in that state.

Other causes can look similar: a charge-only cable, an occupied MIDI port, a stale Windows device
instance, or the FM-1 being in ROM download mode instead of normal firmware. Use **Check what is
connected** to distinguish those states. Linux is not a general fix for this Windows driver
failure; it is a separate host operating system and does not change the firmware's USB descriptors.

MASIF source and its platform note: [thecemeterygates/masif-fm1](https://github.com/thecemeterygates/masif-fm1).

### Entering download mode (external tools)

- With m-bootloader: hold **REC** (SMK-37: **SEQ REC**) while switching on.
- Felucca / SLOOP / Snoop37: hold **OCT−** and **OCT+** ~10s while running / starting.

## Two production flash chips

FM-1 units ship with one of two 1 MiB SPI NOR parts (same capacity, different JEDEC id):

| Batch | JEDEC flash ID | Part (typical) | How to spot |
| --- | --- | --- | --- |
| Early production | `0x856014` | Puya P25Q80H | Most 2025 / early units |
| 2026 “logo on the front” | `0xB36014` | UC25HQ80 | Front logo; autumn 2026+ |

Chip key is still `0x980F` on both. Many older firmwares only recognise `0x856014`, so on a
`0xB36014` unit they may keep saves in RAM only (gone after power-off) and refuse or stall
updates — the hardware is fine; put a firmware that knows the newer chip (for example **AURORA
0.9.1+**) through download mode after a full backup. Recovery tools used with this project
(Unbricker / Transporter / rescue scripts) accept **both** IDs.

## M-Flasher notes (Windows)

M-Flasher (Julius Vitkauskas, MIT) needs administrator rights and a USB data cable. The desktop
app only launches the allow-listed bundled/vendor binary — the renderer never supplies a path or
command. On macOS/Linux use the in-app Web MIDI installer for normal updates; use M-Flasher on a
Windows PC for full flash backup/restore and ROM download mode.
