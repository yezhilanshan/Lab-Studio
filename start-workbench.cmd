@echo off
setlocal
set "SCRIPT=%~dp0start-workbench.ps1"
where pwsh >nul 2>nul
if %errorlevel%==0 (
    pwsh -NoProfile -File "%SCRIPT%" %*
) else (
    powershell -NoProfile -File "%SCRIPT%" %*
)
set "EXITCODE=%errorlevel%"
if not "%EXITCODE%"=="0" pause
exit /b %EXITCODE%
