# Runs the monitor in the background with a tray icon (Windows PowerShell 5.1).
# One instance per user: a second start only opens the page. The tray menu opens the monitor, toggles
# "Start with Windows" (a shortcut in the Startup folder), restarts the server or quits it.
param([switch]$NoBrowser, [int]$Port = 4287)
$ErrorActionPreference = 'Stop'
$app = Split-Path $PSScriptRoot -Parent
$url = "http://127.0.0.1:$Port/"
$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\EufyLocalMonitorTray', [ref]$created)
if (-not $created) { if (-not $NoBrowser) { Start-Process $url }; exit 0 }

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { [System.Windows.Forms.MessageBox]::Show('Install Node.js 24.5 or newer, then start the monitor again.', 'eufy Local Monitor') | Out-Null; exit 1 }
$runtime = Join-Path $app '.runtime'
New-Item -ItemType Directory -Force $runtime | Out-Null
$startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'eufy Local Monitor.lnk'

# Monochrome icon: a doorbell outline on a dark rounded square.
function New-TrayIcon {
  $bmp = New-Object System.Drawing.Bitmap 32, 32
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $bg = New-Object System.Drawing.Drawing2D.GraphicsPath
  $bg.AddArc(1, 1, 10, 10, 180, 90); $bg.AddArc(21, 1, 10, 10, 270, 90); $bg.AddArc(21, 21, 10, 10, 0, 90); $bg.AddArc(1, 21, 10, 10, 90, 90); $bg.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 24, 24, 24))), $bg)
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 2.4
  $body = New-Object System.Drawing.Drawing2D.GraphicsPath
  $body.AddArc(10, 5, 12, 12, 180, 180); $body.AddLine(22, 11, 22, 21); $body.AddArc(10, 15, 12, 12, 0, 180); $body.CloseFigure()
  $g.DrawPath($pen, $body)
  $g.FillEllipse([System.Drawing.Brushes]::White, 13.5, 16.5, 5, 5)
  $g.Dispose()
  [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
}

$script:proc = $null
$script:started = [DateTime]::MinValue
$script:restarts = 0
$script:quitting = $false

function Start-Monitor {
  Start-Process $node -ArgumentList 'build.mjs' -WorkingDirectory $app -WindowStyle Hidden -Wait -RedirectStandardOutput (Join-Path $runtime 'build.log') -RedirectStandardError (Join-Path $runtime 'build-errors.log')
  $psi = New-Object System.Diagnostics.ProcessStartInfo $node, ('"' + (Join-Path $app 'server\index.mjs') + '"')
  $psi.WorkingDirectory = $app
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.EnvironmentVariables['PORT'] = "$Port"
  $psi.EnvironmentVariables['MONITOR_PARENT_PID'] = "$PID"
  $script:proc = [System.Diagnostics.Process]::Start($psi)
  $script:started = Get-Date
}
function Stop-Monitor { if ($script:proc -and -not $script:proc.HasExited) { $script:proc.Kill(); $script:proc.WaitForExit(5000) | Out-Null } }
function Set-Startup([bool]$on) {
  if (-not $on) { Remove-Item $startup -ErrorAction SilentlyContinue; return }
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut($startup)
  $lnk.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $lnk.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -NoBrowser -Port ' + $Port
  $lnk.WorkingDirectory = $app
  $lnk.WindowStyle = 7
  $lnk.Description = 'eufy Local Monitor in the background'
  $lnk.Save()
}

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = New-TrayIcon
$tray.Text = 'eufy Local Monitor'
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$open = $menu.Items.Add('Open monitor')
$open.Font = New-Object System.Drawing.Font($open.Font, [System.Drawing.FontStyle]::Bold)
$atLogin = New-Object System.Windows.Forms.ToolStripMenuItem 'Start with Windows'
$atLogin.CheckOnClick = $true
$atLogin.Checked = Test-Path $startup
[void]$menu.Items.Add($atLogin)
[void]$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
$restart = $menu.Items.Add('Restart monitor')
$quit = $menu.Items.Add('Quit')
$tray.ContextMenuStrip = $menu

$open.add_Click({ Start-Process $url })
$tray.add_DoubleClick({ Start-Process $url })
$atLogin.add_CheckedChanged({ try { Set-Startup $atLogin.Checked } catch { $tray.ShowBalloonTip(5000, 'eufy Local Monitor', 'Could not change the Startup shortcut.', 'Warning') } })
$restart.add_Click({ $script:restarts = 0; Stop-Monitor; Start-Monitor })
$quit.add_Click({ $script:quitting = $true; Stop-Monitor; $tray.Visible = $false; [System.Windows.Forms.Application]::Exit() })

# Watchdog: restart a crashed server up to three times; an exit within seconds of starting usually
# means another monitor already holds the port.
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.add_Tick({
  if ($script:quitting -or -not $script:proc -or -not $script:proc.HasExited) { return }
  $quick = ((Get-Date) - $script:started).TotalSeconds -lt 15
  if ($quick -and $script:proc.ExitCode -ne 0) {
    $script:proc = $null
    $tray.ShowBalloonTip(8000, 'eufy Local Monitor', "Port $Port is in use. Close the other monitor window, then choose Restart monitor.", 'Warning')
  } elseif ($script:restarts -lt 3) {
    $script:restarts++
    Start-Monitor
  } else {
    $script:proc = $null
    $tray.ShowBalloonTip(8000, 'eufy Local Monitor', 'The monitor stopped. Choose Restart monitor to try again.', 'Warning')
  }
})

Start-Monitor
$tray.Visible = $true
$timer.Start()
if (-not $NoBrowser) { Start-Sleep -Seconds 2; Start-Process $url }
try { [System.Windows.Forms.Application]::Run() } finally { Stop-Monitor; $tray.Dispose(); $mutex.ReleaseMutex() }
