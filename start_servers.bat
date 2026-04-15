@echo off
echo Starting DentaNet LMS ^& DEd AI Evaluation API
echo =================================================

echo [1/2] Starting Dentanet Node Server (Port 3001)...
start "DentaNet Node API" cmd /k "cd backend && npm start"

echo [2/2] Starting DEd Python API...
start "DEd Python API" cmd /k "cd DEd\backend && call win_venv\Scripts\activate.bat && uvicorn main:app --host 0.0.0.0 --port 8000"

echo Both servers are starting in separate windows!
echo If they immediately crash, check the red error text in those windows.
