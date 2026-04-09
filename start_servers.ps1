# start_servers.ps1

Write-Host "Starting DentaNet LMS & DEd AI Evaluation API" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# 1. Start backend node server
Write-Host "`n[1/2] Starting Dentanet Node Server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; npm start" -WindowStyle Normal

# 2. Start DEd python API
Write-Host "`n[2/2] Starting DEd Python API..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd ..\DEd\DEd\backend; .\venv\Scripts\activate; uvicorn main:app --host 0.0.0.0 --port 8000" -WindowStyle Normal

Write-Host "`nBoth servers are starting in separate windows!" -ForegroundColor Green
Write-Host "You can now open 'frontend/index.html' locally, or run a live server on the frontend folder." -ForegroundColor Green
