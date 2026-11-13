#Requires -Version 5.1
<#
.SYNOPSIS
    停止毫米波研究工作台。

.DESCRIPTION
    默认停止开发服务器（5173）和生产服务器（4187）。
    使用 -Port 时只停止指定端口。
    只会结束本工作台目录启动的进程；端口被其他程序占用时会跳过并提示。

.PARAMETER Port
    只停止指定端口。

.EXAMPLE
    .\stop-workbench.ps1

.EXAMPLE
    .\stop-workbench.ps1 -Port 4187
#>
[CmdletBinding()]
param(
    [int]$Port = 0
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

$runtimeDir = Join-Path $root '.sites-runtime'
$ports = if ($Port -gt 0) {
    @($Port)
} else {
    $known = @(5173, 4187)
    if (Test-Path $runtimeDir) {
        Get-ChildItem $runtimeDir -Filter 'workbench-*.json' -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_.BaseName -match '^workbench-(\d+)$') { $known += [int]$Matches[1] }
        }
    }
    @($known | Sort-Object -Unique)
}
$killed = @()
$skipped = @()

function Get-PortOwners([int]$PortNumber) {
    @(Get-NetTCPConnection -LocalPort $PortNumber -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
}

function Test-WorkbenchProcess([int]$ProcessId) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
    if (-not $process) { return $false }
    $command = [string]$process.CommandLine
    return ($command -like "*$root*") -or ($command -match 'run-framework|vinext|wrangler|workerd')
}

foreach ($portNumber in $ports) {
    foreach ($owner in (Get-PortOwners $portNumber)) {
        if (Test-WorkbenchProcess $owner) {
            & taskkill.exe /PID $owner /T /F 2>$null | Out-Null
            $killed += "端口 $portNumber（PID $owner）"
        } else {
            $skipped += "端口 $portNumber（PID $owner，非本工作台）"
        }
    }

    # 结束启动脚本记录的包装进程，避免残留 npm / cmd 窗口。
    $pidFile = Join-Path $runtimeDir "workbench-$portNumber.json"
    if (Test-Path $pidFile) {
        try {
            $info = Get-Content $pidFile -Raw | ConvertFrom-Json
            $startedAt = $null
            try { $startedAt = [datetime]::Parse($info.startedAt) } catch {}
            foreach ($processId in @($info.wrapperPid, $info.serverPid)) {
                if (-not $processId) { continue }
                $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
                if (-not $process) { continue }
                $isRecent = $startedAt -and $process.CreationDate -ge $startedAt.AddMinutes(-2)
                if ($isRecent) {
                    & taskkill.exe /PID $processId /T /F 2>$null | Out-Null
                    $killed += "残留进程（PID $processId）"
                }
            }
        } catch {
            # 进程信息损坏时直接清理记录文件。
        }
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }
}

Start-Sleep -Milliseconds 700

$stillListening = @()
foreach ($portNumber in $ports) {
    if (Get-PortOwners $portNumber) { $stillListening += $portNumber }
}

if ($killed.Count -gt 0) {
    Write-Host '工作台已停止：' -ForegroundColor Green
    $killed | ForEach-Object { Write-Host "  $_" }
} else {
    Write-Host '工作台未在运行。' -ForegroundColor Yellow
}

if ($stillListening.Count -gt 0) {
    Write-Host ("以下端口仍在监听：{0}" -f ($stillListening -join ', ')) -ForegroundColor Red
}
if ($skipped.Count -gt 0) {
    Write-Host ('以下端口被其他程序占用，未处理：' + ($skipped -join '；')) -ForegroundColor Yellow
}
