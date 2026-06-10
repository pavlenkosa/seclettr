#!/usr/bin/env pwsh
# Seclettr CLI — PowerShell wrapper (Windows / macOS / Linux).
# Usage: pwsh scripts/seclettr.ps1 <command> [args]
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CliArgs)

$ErrorActionPreference = 'Stop'
$script:ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:SeclettrSh = Join-Path $script:ScriptDir 'seclettr'

function Find-Bash {
  # 1. bash on PATH
  $b = Get-Command bash -ErrorAction SilentlyContinue
  if ($b) { return $b.Source }

  # 2. Git for Windows
  foreach ($candidate in @(
    'C:\Program Files\Git\bin\bash.exe',
    'C:\Program Files (x86)\Git\bin\bash.exe'
  )) {
    if (Test-Path $candidate) { return $candidate }
  }

  # 3. WSL
  $wsl = "$env:SystemRoot\System32\bash.exe"
  if (Test-Path $wsl) { return $wsl }

  return $null
}

$bash = Find-Bash
if (-not $bash) {
  Write-Host ''
  Write-Host '  ERR  bash not found.' -ForegroundColor Red
  Write-Host '  Install Git for Windows (https://git-scm.com) or enable WSL.' -ForegroundColor Red
  Write-Host ''
  exit 1
}

& $bash $script:SeclettrSh @CliArgs
exit $LASTEXITCODE
