param(
  [string]$TaskName = '智云课堂PPT抓取',
  [string]$StartTime = '07:40',
  [switch]$StartNow
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw '未找到 node，请先安装 Node.js 20+' }

New-Item -ItemType Directory -Force -Path (Join-Path $root 'logs') | Out-Null

# 计划任务调用这个 .cmd，它把输出写进 logs\task.log
$cmdPath = Join-Path $PSScriptRoot 'run.cmd'
$body = @(
  '@echo off',
  'cd /d "%~dp0.."',
  'set ZPT_TASK=1',
  "`"$node`" bin\zhiyun-ppt.mjs >> logs\task.log 2>&1"
) -join "`r`n"
Set-Content -Path $cmdPath -Value $body -Encoding Default

# 用 XML 注册，才能带上「失败重启 / 开机补跑 / 不限运行时长」
$startDate = (Get-Date).ToString('yyyy-MM-dd')
$xmlPath = Join-Path $env:TEMP "zhiyun-ppt-task.xml"
$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>智云课堂 PPT 自动抓取（每日 $StartTime 启动，endHour 退出）</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>${startDate}T$($StartTime):00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>cmd.exe</Command>
      <Arguments>/c "$cmdPath"</Arguments>
      <WorkingDirectory>$root</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

[System.IO.File]::WriteAllText($xmlPath, $xml, [System.Text.Encoding]::Unicode)
schtasks /Create /TN $TaskName /XML $xmlPath /F | Out-Null
Remove-Item $xmlPath -Force -ErrorAction SilentlyContinue
Write-Host "已创建计划任务：$TaskName（每天 $StartTime 启动；电池供电也运行，失败自动重试 3 次）"

if ($StartNow) {
  schtasks /Run /TN $TaskName | Out-Null
  Write-Host '已立即启动'
} elseif ([Environment]::UserInteractive) {
  $answer = Read-Host '现在立即启动一次？(y/N)'
  if ($answer -match '^[yY]') {
    schtasks /Run /TN $TaskName | Out-Null
    Write-Host '已启动'
  }
}
