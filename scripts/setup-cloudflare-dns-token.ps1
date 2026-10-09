# Saves Cloudflare DNS token locally and applies all thryco.com email DNS fixes.
# Run in PowerShell from the project folder:
#   cd e:\THRY\HiyoRi-Ecommerce-Nextjs-Supabase
#   .\scripts\setup-cloudflare-dns-token.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$tokenFile = Join-Path $root ".cloudflare-dns.token"

Write-Host ""
Write-Host "Paste your Cloudflare API token (Zone DNS Edit on thryco.com)." -ForegroundColor Cyan
Write-Host "Saved to .cloudflare-dns.token (gitignored)." -ForegroundColor DarkGray
Write-Host ""
$token = Read-Host "Cloudflare API token"

if ([string]::IsNullOrWhiteSpace($token)) {
  Write-Host "No token entered." -ForegroundColor Red
  exit 1
}

Set-Content -Path $tokenFile -Value $token.Trim() -NoNewline -Encoding utf8
Write-Host "Token saved." -ForegroundColor Green

Push-Location $root
try {
  Write-Host "Applying DNS fixes..." -ForegroundColor Cyan
  node scripts/cf-fix-email-full.mjs
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
    node scripts/cf-fix-thryco-email-dns.mjs
  }

  Write-Host "Verifying Resend domain..." -ForegroundColor Cyan
  $resend = Join-Path $env:USERPROFILE ".resend\bin\resend.exe"
  if (Test-Path $resend) {
    & $resend domains verify ef23a9b0-9145-4f59-84fc-0c3a795a06b6
    Start-Sleep -Seconds 5
    & $resend domains get ef23a9b0-9145-4f59-84fc-0c3a795a06b6
  }

  Write-Host ""
  Write-Host "Done. Tell Cursor the script finished." -ForegroundColor Green
}
finally {
  Pop-Location
}
