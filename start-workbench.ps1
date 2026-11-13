#Requires -Version 5.1
<#
.SYNOPSIS
    启动毫米波研究工作台。

.DESCRIPTION
    默认在后台启动开发服务器（http://127.0.0.1:5173）。
    使用 -Prod 时会先构建，再启动生产版本（http://127.0.0.1:4187）。
    日志和进程信息写入 .sites-runtime/。

.PARAMETER Prod
    构建并启动生产版本。

.PARAMETER NoBrowser
    启动后不自动打开浏览器。

.PARAMETER Port
    自定义端口。默认开发 5173，生产 4187。

.EXAMPLE
    .\start-workbench.ps1

.EXAMPLE
    .\start-workbench.ps1 -Prod

.EXAMPLE
    .\start-workbench.ps1 -NoBrowser -Port 4190
#>
[CmdletBinding()]
param(
    [switch]$Prod,
    [switch]$NoBrowser,
    [int]$Port = 0
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

$port = if ($Port -gt 0) { $Port } elseif ($Prod) { 4187 } else { 5173 }
$runtimeDir = Join-Path $root '.sites-runtime'
$logDir = Join-Path $env:LOCALAPPDATA 'lab-studio-workbench'
if (-not $env:LOCALAPPDATA) { $logDir = Join-Path ([IO.Path]::GetTempPath()) 'lab-studio-workbench' }
$pidFile = Join-Path $runtimeDir "workbench-$port.json"
$outLog = Join-Path $logDir "workbench-$port.out.log"
$errLog = Join-Path $logDir "workbench-$port.err.log"
New-Item -ItemType Directory -Force -Path $runtimeDir, $logDir | Out-Null

function Get-PortOwner([int]$PortNumber) {
    $connection = Get-NetTCPConnection -LocalPort $PortNumber -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($connection) { return [int]$connection.OwningProcess }
    return $null
}

function Test-WorkbenchProcess([int]$ProcessId) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
    if (-not $process) { return $false }
    $command = [string]$process.CommandLine
    return ($command -like "*$root*") -or ($command -match 'run-framework|vinext|wrangler|workerd')
}

$owner = Get-PortOwner $port
if ($owner) {
    if (Test-WorkbenchProcess $owner) {
        Write-Host "工作台已在运行：http://127.0.0.1:$port（PID $owner）" -ForegroundColor Green
        if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$port" }
        exit 0
    }
    Write-Host "端口 $port 已被其他程序占用（PID $owner）。" -ForegroundColor Red
    Write-Host '请先关闭该程序，或用 -Port 指定其他端口。'
    exit 1
}

$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) { $npm = (Get-Command npm -ErrorAction SilentlyContinue).Source }
if (-not $npm) {
    Write-Host '未找到 npm。请先安装 Node.js 22.13.0 或更高版本。' -ForegroundColor Red
    exit 1
}

if ($Prod) {
    Write-Host '正在构建生产版本…' -ForegroundColor Cyan
    & $npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host '构建失败，请查看上面的输出。' -ForegroundColor Red
        exit 1
    }
    $npmArgs = @('start', '--', '--port', "$port")
    $mode = 'production'
} else {
    $npmArgs = @('run', 'dev')
    $mode = 'development'
}

Write-Host "正在启动工作台（$mode，端口 $port）…" -ForegroundColor Cyan
$launcher = Start-Process -FilePath $npm -ArgumentList $npmArgs -WorkingDirectory $root `
    -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru

@{ wrapperPid = $launcher.Id; port = $port; mode = $mode; startedAt = (Get-Date).ToString('o') } |
    ConvertTo-Json | Set-Content -Path $pidFile -Encoding UTF8

$deadline = (Get-Date).AddSeconds(120)
$serverPid = $null
while ((Get-Date) -lt $deadline) {
    $serverPid = Get-PortOwner $port
    if ($serverPid) { break }
    if ($launcher.HasExited) { break }
    Start-Sleep -Milliseconds 800
}

if (-not $serverPid) {
    Write-Host '启动失败。最近日志：' -ForegroundColor Red
    if (Test-Path $outLog) { Get-Content $outLog -Tail 20 }
    if (Test-Path $errLog) { Get-Content $errLog -Tail 20 }
    if (-not $launcher.HasExited) { & taskkill.exe /PID $launcher.Id /T /F | Out-Null }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    exit 1
}

@{ wrapperPid = $launcher.Id; serverPid = $serverPid; port = $port; mode = $mode; startedAt = (Get-Date).ToString('o') } |
    ConvertTo-Json | Set-Content -Path $pidFile -Encoding UTF8

Write-Host "工作台已启动：http://127.0.0.1:$port" -ForegroundColor Green
Write-Host "日志：$outLog"
if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$port" }
