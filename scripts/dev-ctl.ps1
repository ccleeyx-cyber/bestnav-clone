# 只启动/停止 bestnav-clone 自己的 dev server，绝不影响其它 node 进程。
# 用法：
#   pwsh -File scripts/dev-ctl.ps1 start   -Port 3199 -DataDir .verify-data
#   pwsh -File scripts/dev-ctl.ps1 stop    -Port 3199

param(
  [Parameter(Mandatory = $true)][ValidateSet("start", "stop")][string]$Action,
  [int]$Port = 3199,
  [string]$DataDir = "",
  [string]$Secret = "verify-secret"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Get-OwnedListeners {
  # 只认本项目目录下的 next dev 进程所监听的端口
  $owned = @()
  $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains("bestnav-clone") -and $_.CommandLine.Contains("next") }
  $pids = @($procs | ForEach-Object { $_.ProcessId })
  if ($pids.Count -eq 0) { return $owned }
  Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $pids -contains $_.OwningProcess } |
    ForEach-Object { $owned += [pscustomobject]@{ Port = $_.LocalPort; Pid = $_.OwningProcess } }
  return $owned
}

if ($Action -eq "stop") {
  $listeners = Get-OwnedListeners | Where-Object { $_.Port -eq $Port }
  if (-not $listeners) {
    Write-Output "no bestnav-clone listener on port $Port"
    exit 0
  }
  foreach ($l in $listeners) {
    Write-Output "stopping PID $($l.Pid) (port $($l.Port))"
    Stop-Process -Id $l.Pid -Force -ErrorAction SilentlyContinue
  }
  exit 0
}

# start
$env:BESTNAV_SECRET = $Secret
if ($DataDir) { $env:BESTNAV_DATA_DIR = (Join-Path $root $DataDir) }
$logOut = Join-Path $root "dev-$Port.log"
$logErr = Join-Path $root "dev-$Port.err.log"
$p = Start-Process -FilePath "pnpm.cmd" -ArgumentList "dev", "-p", "$Port" `
  -WorkingDirectory $root -RedirectStandardOutput $logOut -RedirectStandardError $logErr `
  -PassThru -WindowStyle Hidden
Write-Output "started pid=$($p.Id) port=$Port log=$logOut"

for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 1
  try {
    $r = Invoke-WebRequest "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 5 -SkipHttpErrorCheck
    if ($r.StatusCode -lt 500) { Write-Output "ready: HTTP $($r.StatusCode)"; exit 0 }
  } catch { }
}
Write-Output "timeout waiting for port $Port"
exit 1
