# SkillSprint One-Click Dev Starter
# This script automates the cleanup and startup of the environment.

Write-Host "--- 1. Cleaning up ports ---" -ForegroundColor Cyan
$port5000 = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue
if ($port5000) {
    Write-Host "Killing process on port 5000..." -ForegroundColor Yellow
    $port5000 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}

Write-Host "--- 2. Starting Execution Service (Docker) ---" -ForegroundColor Cyan
# Kill all existing project containers to break any background restart loops
docker compose down
# Start ONLY the sidecar
docker compose up -d execution-service

Write-Host "--- 3. Starting Backend Server ---" -ForegroundColor Cyan
Set-Location backend
node .\server.js
