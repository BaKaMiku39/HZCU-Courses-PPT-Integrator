param(
  [string]$TaskName = '智云课堂PPT抓取',
  [string]$StartTime = '07:40'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw '未找到 node，请先安装 Node.js 20+' }

New-Item -ItemType Directory -Force -Path (Join-Path $root 'logs') | Out-Null

$cmdPath = Join-Path $PSScriptRoot 'run.cmd'
$body = @(
  '@echo off',
  'cd /d "%~dp0.."',
  "`"$node`" bin\zhiyun-ppt.mjs >> logs\task.log 2>&1"
) -join "`r`n"
Set-Content -Path $cmdPath -Value $body -Encoding Default

schtasks /Create /TN $TaskName /TR "`"$cmdPath`"" /SC DAILY /ST $StartTime /F | Out-Null
Write-Host "已创建计划任务：$TaskName，每天 $StartTime 启动"

$answer = Read-Host '现在立即启动一次？(y/N)'
if ($answer -match '^[yY]') {
  schtasks /Run /TN $TaskName | Out-Null
  Write-Host '已启动'
}
