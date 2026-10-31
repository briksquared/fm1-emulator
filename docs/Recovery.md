# Hardware flashing & recovery

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
