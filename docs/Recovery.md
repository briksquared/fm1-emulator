# Hardware flashing & recovery

**Flash any firmware to your FM-1 in a few clicks, and recover if anything goes wrong.**

**A flash is never a dead end.** This is the most important promise of the app, so it's worth
being clear about what is and isn't risky:

- **The emulator cannot harm anything.** Running firmware in the app is pure software emulation —
  it cannot brick your computer and it cannot touch your FM-1.
- **The only risk is flashing real hardware.** If you use the app to write firmware to an actual
  **M-VAVE FM-1** (or SMK-37), a bad write *could* leave the unit unresponsive — but the app is
  built so you can always recover it. That's what this page is for.

## The golden rule: back up first

Before you write anything to a real unit, **back up its whole flash** (one click — see below).
A backup can always be restored, so even a failed or interrupted flash is recoverable. If you do
only one thing, do this.

## The recovery toolkit

Everything here is reachable in the app under **Recovery options — you can always get back**:

| Tool | What it does | Where |
| --- | --- | --- |
| **⭳ Back up flash** | Saves a full image of the unit's flash you can restore anytime | In-app (Windows, via M-Flasher) |
| **Restore / reinstall** | Writes a backup or a known-good firmware back to the unit | In-app → M-Flasher |
| **↺ Resume interrupted install** | Finishes a write that got interrupted — the unit stays in update mode until it completes | In-app |
| **↶ Roll back** | Writes the firmware you had before (the last one this app installed) through the waiting update loader | In-app, after an interrupted install |
| **Device Lab** | Opens **M-Flasher** (bundled on Windows) for backup, restore, verified flashing, and installing m-bootloader | In-app (Windows) |
| **FM-1 Unbricker** | A separate community recovery tool for a unit that won't respond | Linked in the app's resources |

On **Windows**, M-Flasher is bundled — recovery works out of the box. On **macOS/Linux**, the
in-app Web MIDI installer handles flashing; for low-level recovery use M-Flasher on a Windows
machine (it's the standard tool for these units).

## Flashing safely, step by step

1. Connect the FM-1 with a **USB data cable** (not a charge-only cable).
2. **Back up the flash first.**
3. Select the firmware (or your own `.fwsc`) and start the flash.
4. **Keep it connected until it restarts** — don't unplug or power it off mid-write.

## What the in-app flasher checks

- **Before writing:** the package's size, its FM-1 product identity, and its SHA-256 against the
  firmware list. A package that fails any of these is never sent. The connected unit must answer
  as an FM-1 of the same product; a unit that is not, or that is already waiting in update mode,
  is refused with the next step to take.
- **While writing:** every block the FM-1 asks for is range-checked and carries a checksum the unit
  verifies. A send that fails while the cable is still in is retried with backoff; every wait has a
  time limit, so nothing hangs.
- **After writing:** the unit must restart and report the identity of the package that was written.
  The update protocol has no way to read flash back, so this identity check is the final
  verification; a full image comparison needs an M-Flasher backup.
- **Journal:** the app records each stage of an install (checked, staging, loader, writing,
  restarting, done). If the window closes, the app crashes or the cable comes out, the app says so
  the next time it opens and offers the right step: try again (nothing was written yet), **Resume**
  with the same package, or **Roll back** to the previous firmware. The desktop app asks before
  closing while an install is writing.
- **Backups:** USB-MIDI cannot read the flash, so the in-app flasher cannot make a backup itself.
  In the desktop app on Windows, the confirmation offers **Back up the flash first**, which opens
  M-Flasher for a full backup.

## If something goes wrong

Don't panic — this is the recoverable part.

1. Put the unit in **download mode** (see below) and reconnect with a USB **data** cable.
2. In the app, open **Recovery options** and either **Resume interrupted install**, or open
   **Device Lab / M-Flasher** and **restore your backup** (or write a known-good firmware).
3. If the unit still won't respond, use the **FM-1 Unbricker** linked in the app.

### Entering download mode
- With m-bootloader: hold **REC** (SMK-37: **SEQ REC**) while switching the unit on.
- Felucca / SLOOP / Snoop37: hold **OCT-** and **OCT+** for 5 seconds while it is running.

M-Flasher also has a **DOWNLOAD MODE** button that can put a responsive unit into update mode for you.

## M-Flasher notes (Windows)
M-Flasher (by Julius Vitkauskas, MIT) needs administrator rights and a USB **data** cable. It can
back up, restore, verify-flash, and install m-bootloader — the full recovery path in one tool.
