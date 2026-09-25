@echo off
echo ========================================================
echo   Starting ADSToken v2.0 - Backend API and Frontend dApp
echo ========================================================

start "ADSToken Backend API (Port 5000)" cmd /k "cd backend && npm run dev"
timeout /t 3 /nobreak >nul
start "ADSToken Staking dApp (Port 3000)" cmd /k "cd frontend && npm run dev"

echo.
echo Both servers are launching!
echo Backend Swagger API: http://localhost:5000/api/docs
echo Frontend Staking dApp: http://localhost:3000
echo.
pause
