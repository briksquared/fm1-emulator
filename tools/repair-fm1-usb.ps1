#Requires -RunAsAdministrator
param(
  [switch]$Quick
)
$ErrorActionPreference = "Continue"
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$log = Join-Path $env:TEMP "fm1-usb-repair.log"
function Log([string]$m) { "$(Get-Date -Format o) $m" | Tee-Object -FilePath $log -Append }

function Remove-StaleFm1Devices {
  $patterns = @(
    'VID_1209&PID_0001',
    'VID_1209&PID_0002',
    'VID_4C4A&PID_',
    'VID_4D4A&PID_'
  )
  $all = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue)
  $targets = @($all | Where-Object {
    $id = $_.InstanceId
    foreach ($p in $patterns) { if ($id -match $p) { return $true } }
    $false
  })
  foreach ($d in $targets) {
    Log "remove $($d.FriendlyName) $($d.Class) status=$($d.Status) $($d.InstanceId)"
    pnputil /remove-device $d.InstanceId 2>&1 | ForEach-Object { Log $_ }
  }
  Restart-Service AudioEndpointBuilder, Audiosrv -Force -ErrorAction SilentlyContinue
  pnputil /scan-devices 2>&1 | ForEach-Object { Log $_ }
}

Log "FM-1 USB repair start Quick=$Quick"

if ($Quick) {
  Remove-StaleFm1Devices
  Start-Sleep -Seconds 2
  pnputil /scan-devices 2>&1 | Out-Null
  Log "quick repair done"
  exit 0
}

$composite = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue |
  Where-Object { $_.InstanceId -match '^USB\\VID_1209&PID_0001\\' -and $_.Class -eq 'USB' })
$kids = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue |
  Where-Object { $_.InstanceId -match 'VID_1209&PID_0001&MI_' })

[void][System.Windows.Forms.MessageBox]::Show(
  "Step 1: UNPLUG the FM-1 USB cable NOW.`n`nClick OK only after it is unplugged.",
  "FM-1 USB fix",
  [System.Windows.Forms.MessageBoxButtons]::OK,
  [System.Windows.Forms.MessageBoxIcon]::Warning)

$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  $still = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match 'VID_1209&PID_0001' })
  if (-not $still.Count) { Log "unplug detected"; break }
  Start-Sleep -Milliseconds 400
}

foreach ($d in $kids) {
  if ($d.Status -ne "OK") {
    Log "remove child $($d.FriendlyName) $($d.InstanceId)"
    pnputil /remove-device $d.InstanceId 2>&1 | ForEach-Object { Log $_ }
  }
}
foreach ($d in $composite) {
  Log "remove composite $($d.InstanceId)"
  pnputil /remove-device $d.InstanceId 2>&1 | ForEach-Object { Log $_ }
}

Remove-StaleFm1Devices

[void][System.Windows.Forms.MessageBox]::Show(
  "Step 2: Plug the FM-1 into a DIFFERENT USB port (data cable, direct to laptop).`n`nClick OK after it is plugged in and powered on.",
  "FM-1 USB fix",
  [System.Windows.Forms.MessageBoxButtons]::OK,
  [System.Windows.Forms.MessageBoxIcon]::Information)

Start-Sleep -Seconds 4
pnputil /scan-devices 2>&1 | Out-Null
Start-Sleep -Seconds 3

$after = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match 'VID_1209&PID_0001' })
foreach ($b in $after) { Log "after: $($b.FriendlyName) $($b.Class) status=$($b.Status) $($b.InstanceId)" }
$midi = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue |
  Where-Object {
    $_.InstanceId -match 'VID_1209&PID_000[12]' -or
      ($_.FriendlyName -match 'FM-1|Mutable|PATCHWERK|Felucca' -and $_.Class -match 'Midi|SoftwareDevice|Media')
  })
if ($midi.Count) { Log "MIDI endpoints: $($midi.FriendlyName -join ', ')" } else { Log "MIDI endpoints: none yet" }

$error10 = @($after | Where-Object { $_.Status -eq 'Error' })
if ($error10.Count -and -not $midi.Count) {
  [void][System.Windows.Forms.MessageBox]::Show(
    "Windows still reports an error on FM-1 USB — MIDI may be missing.`n`nIf the screen shows USB RESCUE: connect USB, open this app's installer, keep audio off in recovery.`n`nOtherwise: hold OCT- and OCT+ together ~10s while the unit is on, install Mutable Dreams or Felucca from this app, then press Fix USB again if needed.`n`nMASIF is macOS-only for USB; replace it on Windows.",
    "FM-1 USB fix",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error)
}
Log "done"
exit 0
