param(
  [string]$TaskName = '智云课堂PPT抓取',
  [string]$StartTime = '07:00',
  [int]$IntervalMinutes = 2,
  [int]$DurationHours = 15,
  [switch]$StartNow
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw '未找到 node，请先安装 Node.js 20+' }

New-Item -ItemType Directory -Force -Path (Join-Path $root 'logs') | Out-Null

# 每 $IntervalMinutes 分钟跑一次「抓一轮」，单次进程很短，被中断也不影响下一轮
$cmdPath = Join-Path $PSScriptRoot 'run.cmd'
$body = @(
  '@echo off',
  'cd /d "%~dp0.."',
  'set ZPT_TASK=1',
  "`"$node`" bin\zhiyun-ppt.mjs --once >> logs\task.log 2>&1"
) -join "`r`n"
Set-Content -Path $cmdPath -Value $body -Encoding Default

$startDate = (Get-Date).ToString('yyyy-MM-dd')
$xmlPath = Join-Path $env:TEMP 'zhiyun-ppt-task.xml'
$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>智云课堂 PPT 自动抓取（$StartTime 起每 $IntervalMinutes 分钟抓一轮，持续 $DurationHours 小时）</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>${startDate}T$($StartTime):00</StartBoundary>
      <Enabled>true</Enabled>
      <Repetition>
        <Interval>PT$($IntervalMinutes)M</Interval>
        <Duration>PT$($DurationHours)H</Duration>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
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
    <ExecutionTimeLimit>PT8M</ExecutionTimeLimit>
    <Priority>7</Priority>
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
Write-Host "已创建计划任务：$TaskName —— 每天 $StartTime 起每 $IntervalMinutes 分钟抓一轮，共 $DurationHours 小时；电池供电也运行"

if ($StartNow) {
  schtasks /Run /TN $TaskName | Out-Null
  Write-Host '已立即启动一轮'
} elseif ([Environment]::UserInteractive) {
  $answer = Read-Host '现在立即跑一轮？(y/N)'
  if ($answer -match '^[yY]') {
    schtasks /Run /TN $TaskName | Out-Null
    Write-Host '已启动'
  }
}
