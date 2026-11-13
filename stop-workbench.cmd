@echo off
setlocal
set "SCRIPT=%~dp0stop-workbench.ps1"
where pwsh >nul 2>nul
if %errorlevel%==0 (
    pwsh -NoProfile -File "%SCRIPT%" %*
) else (
    powershell -NoProfile -File "%SCRIPT%" %*
)
set "EXITCODE=%errorlevel%"
if not "%EXITCODE%"=="0" pause
if "%~1"=="" pause
exit /b %EXITCODE%
