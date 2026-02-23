# Force redeploy serwera na Railway przez CLI (bez GitHub).
# Uruchom w PowerShell z katalogu głównego projektu:
#   .\scripts\deploy-railway.ps1
#
# Przy 403 Forbidden: w Railway Dashboard → Project → Settings → Tokens
# utwórz Project Token, potem:  $env:RAILWAY_TOKEN = "token"; .\scripts\deploy-railway.ps1
$root = Join-Path $PSScriptRoot ".."
Set-Location -LiteralPath $root
if (-not $env:RAILWAY_TOKEN) {
    Write-Host "Tip: Jesli dostaniesz 403 Forbidden, ustaw RAILWAY_TOKEN (Project Token z Railway Dashboard)." -ForegroundColor Yellow
}
npx railway up ./server --path-as-root
