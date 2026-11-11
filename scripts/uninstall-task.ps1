param([string]$TaskName = '智云课堂PPT抓取')

schtasks /End /TN $TaskName 2>$null | Out-Null
schtasks /Delete /TN $TaskName /F 2>$null | Out-Null

$root = Split-Path -Parent $PSScriptRoot
$runCmd = Join-Path $PSScriptRoot 'run.cmd'
if (Test-Path $runCmd) { Remove-Item $runCmd -Force }

Write-Host "已移除计划任务：$TaskName"
