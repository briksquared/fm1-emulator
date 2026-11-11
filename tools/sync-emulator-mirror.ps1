# Mirror shared emulator features: public fm1-emulator -> private FM1-FIRMWARE.
# Intentionally does NOT copy firmwares.json / classify.json / boot-health (license & catalog differ).
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/sync-emulator-mirror.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/sync-emulator-mirror.ps1 -Verify

param([switch]$Verify)

$ErrorActionPreference = "Stop"
# Script lives in fm1-emulator/tools → repo root is parent of tools
$pubRoot = Split-Path $PSScriptRoot -Parent
$privRoot = "C:\Users\briks\Desktop\GitHub\audio\firmwares\FM1-FIRMWARE\FM1-firmwares"
$pubEmu = Join-Path $pubRoot "site\emulator"
$privEmu = Join-Path $privRoot "emulator"

if (-not (Test-Path $pubEmu)) { throw "public emulator missing: $pubEmu" }
if (-not (Test-Path $privEmu)) { throw "private emulator missing: $privEmu" }

# Shared feature/UI modules — keep these identical across public & private.
$emuFiles = @(
  "app-icon.png", "assist.js", "arp.js", "audition.js", "banks.js", "banks.json", "catalog-source.js", "catalog-updates.js",
  "chords.js", "customize.js", "deck.js", "engine.js", "extras.js", "favorites.js",
  "flash-core.js", "flash-vault.js", "fm1ota.js", "fm1pkg.js", "focus-lcd.js", "play-bar.js", "fxcc.js", "fwinfo.js", "fwsc.js",
  "gallery.js", "help.js", "howto.js", "host-panel.js", "index.html", "install.js", "issues.js", "jit.js", "keys.js",
  "jit-policy.js", "session-play.js", "layout.js", "loader.js", "main.js", "middrop.js", "midi-bridge.js", "midimon.js", "midiplayer.js",
  "notes.js", "og.png", "overlay.js", "package-resources.js", "palette.js", "panic.js", "perf-judge.js",
  "persistence.js", "radar.js", "rack-gens.js", "recorder.js", "samples.json", "scale.js", "scope.js", "session-io.js", "shortcuts.js",
  "snapshot.js", "stickers.js", "stream-worklet.js", "style.css", "tape.js", "toolgroup.js",
  "transport.js", "transpose.js", "tuner.js", "turbo.js", "ui-theme.js", "wavrec.js",
  "wavtap.js", "worklet.js", "worker-logo.svg", "worker-logo.png",
  "worker-icon.png", "worker-icon-48.png", "worker-icon.ico"
)

# Catalog / license trees — never mirrored.
$catalogSkip = [System.Collections.Generic.HashSet[string]]::new([string[]]@(
  "firmwares.json", "classify.json", "boot-health.json", "classify.txt",
  "README.md", "new-firmware-finds.md", "firmware-updates-2026-10-31.md",
  "firmware-updates-applied-2026-10-31.md", ".gitignore", "fm1-emu-report.pdf",
  "fm1_web.wasm"
))

# Desktop / window / installer icons (public root + build → private app + installed copy).
$iconPairs = @(
  @{ src = "icon.ico"; dst = "app\icon.ico" },
  @{ src = "icon.png"; dst = "app\icon.png" },
  @{ src = "build\icon.png"; dst = "app\build\icon.png" }
)
$installedApp = "C:\Users\briks\FM-1 Emulator"
$shortcutPaths = @(
  "$env:USERPROFILE\Desktop\Apps\Shortcuts\FM-1 Emulator.lnk",
  "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\FM-1 Emulator.lnk",
  "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\FM-1 Emulator.lnk",
  "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\FM-1 Emulator (2).lnk"
)

$copied = @()
$missing = @()
$mismatched = @()

foreach ($name in $emuFiles) {
  $src = Join-Path $pubEmu $name
  $dst = Join-Path $privEmu $name
  if (-not (Test-Path $src)) { $missing += $name; continue }
  if ($Verify) {
    if (-not (Test-Path $dst)) { $mismatched += "$name (missing in private)"; continue }
    $hs = (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash
    $hd = (Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash
    if ($hs -ne $hd) { $mismatched += $name }
  } else {
    Copy-Item -LiteralPath $src -Destination $dst -Force
    $copied += $name
  }
}

# Flash tests + simulated unit (paths differ: public ci/ vs private app/)
$testPairs = @(
  @{ src = "ci\test-flash.mjs"; dst = "app\test-flash.mjs"; rewrite = $true },
  @{ src = "ci\fake-fm1.mjs"; dst = "app\fake-fm1.mjs"; rewrite = $true },
  @{ src = "ci\test-radar.mjs"; dst = "app\test-radar.mjs"; rewrite = $true },
  @{ src = "ci\test-midi-bridge.mjs"; dst = "app\test-midi-bridge.mjs"; rewrite = $true }
)
foreach ($p in $testPairs) {
  $src = Join-Path $pubRoot $p.src
  $dst = Join-Path $privRoot $p.dst
  if (-not (Test-Path $src)) { $missing += $p.src; continue }
  $dir = Split-Path $dst -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $text = Get-Content -LiteralPath $src -Raw
  # Public ci/ imports ../site/emulator; private app/ imports ../emulator
  $text = $text -replace 'resolve\(root, "site/emulator"\)', 'resolve(root, "emulator")'
  $text = $text -replace '\.\./site/emulator/', '../emulator/'
  $text = $text -replace 'resolve\(root, "site/fw"', 'resolve(root, "fw"'
  if ($Verify) {
    if (-not (Test-Path $dst)) { $mismatched += "$($p.dst) (missing)"; continue }
    $privText = Get-Content -LiteralPath $dst -Raw
    if ($privText -ne $text) { $mismatched += $p.dst }
  } else {
    Set-Content -LiteralPath $dst -Value $text -NoNewline
    $copied += $p.dst
  }
}

# Recovery docs
$docsDir = Join-Path $privRoot "docs"
$pubRecovery = Join-Path $pubRoot "docs\Recovery.md"
$privRecovery = Join-Path $docsDir "Recovery.md"
if (-not (Test-Path $pubRecovery)) { $missing += "docs/Recovery.md" }
elseif ($Verify) {
  if (-not (Test-Path $privRecovery)) { $mismatched += "docs/Recovery.md (missing)" }
  elseif ((Get-FileHash $pubRecovery).Hash -ne (Get-FileHash $privRecovery).Hash) { $mismatched += "docs/Recovery.md" }
} else {
  if (-not (Test-Path $docsDir)) { New-Item -ItemType Directory -Path $docsDir | Out-Null }
  Copy-Item -LiteralPath $pubRecovery -Destination $privRecovery -Force
  $copied += "docs/Recovery.md"
}

# App / installer icons → private source tree
$iconsTouched = @()
foreach ($pair in $iconPairs) {
  $src = Join-Path $pubRoot $pair.src
  $dst = Join-Path $privRoot $pair.dst
  if (-not (Test-Path $src)) { $missing += $pair.src; continue }
  if ($Verify) {
    if (-not (Test-Path $dst)) { $mismatched += "$($pair.dst) (missing)"; continue }
    if ((Get-FileHash -LiteralPath $src).Hash -ne (Get-FileHash -LiteralPath $dst).Hash) { $mismatched += $pair.dst }
  } else {
    $dir = Split-Path $dst -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    Copy-Item -LiteralPath $src -Destination $dst -Force
    $copied += $pair.dst
    $iconsTouched += $pair.dst
  }
}

# Installed private desktop app icons + every related shortcut (skip when verifying only)
$shortcutReport = @()
if (-not $Verify -and (Test-Path $installedApp)) {
  $instIco = Join-Path $installedApp "icon.ico"
  $instPng = Join-Path $installedApp "icon.png"
  $pubIco = Join-Path $pubRoot "icon.ico"
  $pubPng = Join-Path $pubRoot "icon.png"
  if (Test-Path $pubIco) { Copy-Item -LiteralPath $pubIco -Destination $instIco -Force; $iconsTouched += "installed/icon.ico" }
  if (Test-Path $pubPng) { Copy-Item -LiteralPath $pubPng -Destination $instPng -Force; $iconsTouched += "installed/icon.png" }
  $stageEmu = Join-Path $installedApp "resources\site\emulator"
  if (Test-Path $stageEmu) {
    # Keep the installed private app's chrome in lockstep with private emulator sources.
    # Copy the full shared UI module set (not a short subset) so imports like radar.js ↔
    # catalog-updates.js cannot drift and blank the window. Still skip firmwares.json / classify.
    $stageUi = @($emuFiles) + @("fm1_web.wasm")
    $stageN = 0
    foreach ($name in $stageUi) {
      $srcUi = Join-Path $privEmu $name
      if (-not (Test-Path $srcUi)) { $srcUi = Join-Path $pubEmu $name }
      if (Test-Path $srcUi) {
        Copy-Item -LiteralPath $srcUi -Destination (Join-Path $stageEmu $name) -Force
        $stageN++
      }
    }
    $iconsTouched += "installed/resources/site/emulator ($stageN files)"
  }

  # Always keep every installed copy of the app icon in lockstep (root + resources).
  if (Test-Path $pubIco) {
    $resIco = Join-Path $installedApp "resources\icon.ico"
    Copy-Item -LiteralPath $pubIco -Destination $resIco -Force
    $iconsTouched += "installed/resources/icon.ico"
  }

  $exe = Join-Path $installedApp "FM-1 Emulator.exe"
  $icoLoc = "$instIco,0"
  # Discover every pinned FM-1 taskbar shortcut (name can gain " (2)", " (3)", …).
  $taskbarDir = Join-Path $env:APPDATA "Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"
  $allShortcuts = [System.Collections.Generic.List[string]]::new()
  foreach ($p in $shortcutPaths) { if (-not $allShortcuts.Contains($p)) { [void]$allShortcuts.Add($p) } }
  if (Test-Path -LiteralPath $taskbarDir) {
    Get-ChildItem -LiteralPath $taskbarDir -Filter "FM-1 Emulator*.lnk" -ErrorAction SilentlyContinue | ForEach-Object {
      if (-not $allShortcuts.Contains($_.FullName)) { [void]$allShortcuts.Add($_.FullName) }
    }
  }
  $shell = New-Object -ComObject WScript.Shell
  foreach ($lnkPath in $allShortcuts) {
    if (-not (Test-Path -LiteralPath $lnkPath)) { $shortcutReport += "MISSING $lnkPath"; continue }
    $lnk = $shell.CreateShortcut($lnkPath)
    $lnk.TargetPath = $exe
    $lnk.WorkingDirectory = $installedApp
    # Clear then set so Explorer drops a stale cached glyph for the pin.
    $lnk.IconLocation = "%SystemRoot%\System32\shell32.dll,0"
    $lnk.Save()
    $lnk = $shell.CreateShortcut($lnkPath)
    $lnk.TargetPath = $exe
    $lnk.WorkingDirectory = $installedApp
    $lnk.IconLocation = $icoLoc
    if (-not $lnk.Description) { $lnk.Description = "FM-1 Emulator — private build" }
    $lnk.Save()
    # Bump LastWriteTime so the shell notices the pin changed.
    (Get-Item -LiteralPath $lnkPath).LastWriteTime = Get-Date
    $shortcutReport += "UPDATED $lnkPath -> icon.ico,0"
  }

  # Flush Windows icon cache for the shortcuts / exe
  try {
    Add-Type -Namespace Native -Name Shell32 -MemberDefinition @'
[DllImport("shell32.dll")] public static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
'@ -ErrorAction SilentlyContinue
    [Native.Shell32]::SHChangeNotify(0x08000000, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero) # SHCNE_ASSOCCHANGED
    [Native.Shell32]::SHChangeNotify(0x00002000, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero) # SHCNE_UPDATEITEM
  } catch {
    Write-Output "WARN: SHChangeNotify failed ($($_.Exception.Message))"
  }
}

# Warn about public emulator files that are neither mirrored nor intentionally skipped.
$unlisted = @()
Get-ChildItem -LiteralPath $pubEmu -File | ForEach-Object {
  $n = $_.Name
  if ($emuFiles -contains $n) { return }
  if ($catalogSkip.Contains($n)) { return }
  if ($n -match '^_') { return }
  $unlisted += $n
}

if ($Verify) {
  Write-Output "VERIFY shared emulator mirror"
  if ($mismatched.Count) {
    Write-Output "DRIFT ($($mismatched.Count)): $($mismatched -join ', ')"
    exit 1
  }
  Write-Output "OK: $($emuFiles.Count) feature files + tests + Recovery.md + app icons match"
} else {
  Write-Output "MIRRORED $($copied.Count) paths public -> private"
  if ($iconsTouched.Count) { Write-Output "ICONS: $($iconsTouched -join ', ')" }
  foreach ($line in $shortcutReport) { Write-Output "SHORTCUT: $line" }
}
Write-Output "SKIPPED catalog: firmwares.json, classify.json, boot-health.json (intentional)"
if ($unlisted.Count) {
  Write-Output "UNLISTED public files (add to sync allowlist or catalogSkip): $($unlisted -join ', ')"
}
Write-Output "NOTE: private desktop refreshes site-stage on npm start (prep_bundle.mjs)"
if ($missing.Count) { Write-Output "MISSING_SRC: $($missing -join ', ')"; exit 1 }
