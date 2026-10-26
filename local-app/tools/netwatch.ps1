# Watches the network endpoints of the running monitor (no admin rights needed).
# Logs every TCP connection and UDP port the Node process opens or closes, with time stamps, plus the
# DNS cache names that point at its remote addresses. It sends nothing on the network itself.
# Usage: powershell -ExecutionPolicy Bypass -File tools\netwatch.ps1 [-Port 4287] [-Seconds 600]
param([int]$Port = 4287, [int]$Seconds = 600, [int]$IntervalMs = 500)

$listen = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listen) { Write-Host "Nothing is listening on port $Port. Start the monitor first."; exit 1 }
$procId = $listen.OwningProcess
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root '.runtime'
New-Item -ItemType Directory -Force $dir | Out-Null
$file = Join-Path $dir ("netwatch-{0}.log" -f (Get-Date -Format 'yyyy-MM-ddTHH-mm-ss'))
# Keep LAN addresses (they show the local path); mask public ones so a shared log carries no internet IP.
function Test-PrivateIp($ip) {
  $p = $ip -split '\.'
  if ($p.Count -ne 4) { return $true } # IPv6/link-local: leave as-is
  $a = [int]$p[0]; $b = [int]$p[1]
  return ($a -eq 10 -or $a -eq 127 -or ($a -eq 169 -and $b -eq 254) -or ($a -eq 192 -and $b -eq 168) -or ($a -eq 172 -and $b -ge 16 -and $b -le 31) -or ($a -eq 100 -and $b -ge 64 -and $b -le 127))
}
function Hide-PublicIp($ip) { if (Test-PrivateIp $ip) { $ip } else { '<ip>' } }
function Write-Event($kind, $text) {
  $line = '{0} {1,-6} {2}' -f (Get-Date -Format 'HH:mm:ss.fff'), $kind, $text
  Add-Content -Path $file -Value $line
  Write-Host $line
}
Write-Event 'start' "watching PID $procId (port $Port) for $Seconds s"

$known = @{}
$names = @{}
$deadline = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $deadline) {
  if (-not (Get-Process -Id $procId -ErrorAction SilentlyContinue)) { Write-Event 'stop' 'monitor process ended'; break }
  $now = @{}
  $remoteIps = @{}
  foreach ($c in Get-NetTCPConnection -OwningProcess $procId -ErrorAction SilentlyContinue) {
    if ($c.State -eq 'Listen' -or $c.RemoteAddress -in @('127.0.0.1', '::1')) { continue }
    $remoteIps[$c.RemoteAddress] = $true
    $now["tcp $($c.LocalPort) -> $(Hide-PublicIp $c.RemoteAddress):$($c.RemotePort)"] = $c.State
  }
  foreach ($u in Get-NetUDPEndpoint -OwningProcess $procId -ErrorAction SilentlyContinue) {
    $now["udp $($u.LocalAddress):$($u.LocalPort)"] = 'bound'
  }
  foreach ($k in $now.Keys) {
    if (-not $known.ContainsKey($k)) { Write-Event 'open' "$k [$($now[$k])]" }
    elseif ($known[$k] -ne $now[$k]) { Write-Event 'state' "$k [$($known[$k]) -> $($now[$k])]" }
  }
  foreach ($k in @($known.Keys)) { if (-not $now.ContainsKey($k)) { Write-Event 'close' $k } }
  $known = $now
  # Map remote addresses to names already in the Windows DNS cache (local lookup only). The hostname is the
  # useful part and is kept; a public IP in the mapping is masked like everywhere else.
  $remotes = @($remoteIps.Keys)
  if ($remotes) {
    foreach ($entry in Get-DnsClientCache -ErrorAction SilentlyContinue | Where-Object { $_.Data -in $remotes }) {
      $key = "$($entry.Entry)=$($entry.Data)"
      if (-not $names.ContainsKey($key)) { $names[$key] = 1; Write-Event 'dns' "$(Hide-PublicIp $entry.Data) is $($entry.Entry)" }
    }
  }
  Start-Sleep -Milliseconds $IntervalMs
}
Write-Event 'done' "log: $file"
