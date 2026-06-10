@echo off
:: Seclettr CLI — Windows wrapper (CMD / PowerShell).
:: Requires Git for Windows (bash.exe) or WSL.
setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "SECLETTR_SH=%SCRIPT_DIR%seclettr"

:: 1. bash already on PATH (Git for Windows, WSL interop, Cygwin, MSYS2)
where bash >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  set "BASH_EXE=bash"
  goto :run
)

:: 2. Git for Windows default installation paths
for %%P in (
  "C:\Program Files\Git\bin\bash.exe"
  "C:\Program Files (x86)\Git\bin\bash.exe"
) do (
  if exist %%P (
    set "BASH_EXE=%%~P"
    goto :run
  )
)

:: 3. WSL bash
if exist "%SystemRoot%\System32\bash.exe" (
  set "BASH_EXE=%SystemRoot%\System32\bash.exe"
  goto :run
)

echo.
echo   ERR  bash not found.
echo   Install Git for Windows (https://git-scm.com) or enable WSL to use the Seclettr CLI.
echo.
exit /b 1

:run
"%BASH_EXE%" "%SECLETTR_SH%" %*
exit /b %ERRORLEVEL%
