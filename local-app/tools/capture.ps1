# Optional packet capture of the monitor's camera traffic with the built-in Windows pktmon.
# Needs an elevated (Run as administrator) PowerShell. Captures UDP plus TCP 443 only, then converts
# the trace to .pcapng in local-app\.runtime. Press Enter to stop.
# Usage (admin): powershell -ExecutionPolicy Bypass -File tools\capture.ps1
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'Run this from PowerShell opened with "Run as administrator".'
  exit 1
}
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root '.runtime'
New-Item -ItemType Directory -Force $dir | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-ddTHH-mm-ss'
$etl = Join-Path $dir "capture-$stamp.etl"
$pcap = Join-Path $dir "capture-$stamp.pcapng"

pktmon stop 2>$null | Out-Null
pktmon filter remove | Out-Null
pktmon filter add camera-udp -t UDP | Out-Null
pktmon filter add cloud-tls -t TCP -p 443 | Out-Null
pktmon start --capture --pkt-size 0 --file-name $etl | Out-Null
Write-Host "Capturing UDP and TCP/443. Open the camera in the monitor now, then press Enter to stop."
[void][Console]::ReadLine()
pktmon stop | Out-Null
pktmon filter remove | Out-Null
pktmon etl2pcap $etl --out $pcap | Out-Null
Write-Host "Saved $pcap"
