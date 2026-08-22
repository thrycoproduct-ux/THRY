# Resend CLI setup for THRY order confirmation emails.
# Run from project root in a normal PowerShell window (interactive TTY required for first login).
#
# Usage:
#   .\scripts\setup-resend.ps1
#   .\scripts\setup-resend.ps1 -ApiKey re_xxxx   # skip login prompt

param(
  [string]$ApiKey = "",
  [string]$FromEmail = "THRY <orders@thryco.com>"
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$Resend = Join-Path $env:USERPROFILE ".resend\bin\resend.exe"
if (-not (Test-Path $Resend)) {
  Write-Host "Installing Resend CLI..."
  irm https://resend.com/install.ps1 | iex
}

if ($ApiKey) {
  & $Resend login --key $ApiKey
} else {
  Write-Host "Opening Resend login (paste API key from https://resend.com/api-keys)..."
  & $Resend login
}

Write-Host ""
& $Resend whoami
Write-Host ""

Write-Host "Checking domains..."
& $Resend domains list 2>&1

$createKey = Read-Host "Create a new 'THRY Production' API key via CLI? (y/N)"
if ($createKey -eq "y" -or $createKey -eq "Y") {
  $json = & $Resend api-keys create --name "THRY Production" --json 2>&1 | Out-String
  Write-Host $json
  try {
    $parsed = $json | ConvertFrom-Json
    if ($parsed.token) { $ApiKey = $parsed.token }
  } catch {}
}

if (-not $ApiKey) {
  $ApiKey = Read-Host "Paste Resend API key (re_...)"
}

if (-not $ApiKey.StartsWith("re_")) {
  Write-Error "Invalid key — must start with re_"
}

# Merge into .env.local
$envFile = Join-Path (Get-Location) ".env.local"
$lines = @()
if (Test-Path $envFile) {
  $lines = Get-Content $envFile
}
$lines = $lines | Where-Object { $_ -notmatch '^\s*RESEND_API_KEY=' -and $_ -notmatch '^\s*RESEND_FROM_EMAIL=' }
$lines += "RESEND_API_KEY=$ApiKey"
$lines += "RESEND_FROM_EMAIL=$FromEmail"
Set-Content -Path $envFile -Value ($lines -join "`n") -Encoding utf8
Write-Host "Updated .env.local with RESEND_*"

Write-Host ""
Write-Host "Next: push to Vercel production env"
Write-Host "  vercel login"
Write-Host "  echo `$ApiKey | vercel env add RESEND_API_KEY production --force"
Write-Host "  echo '$FromEmail' | vercel env add RESEND_FROM_EMAIL production --force"
Write-Host "Or: `$env:VERCEL_TOKEN='...'; node scripts/push-env-to-vercel.mjs"
