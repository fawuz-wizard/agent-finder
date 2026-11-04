@echo off
rem Agent Finder: start the API and the three apps on Windows, each in its own window.
rem Close those windows to stop. The data lives in apps\api\meeting-demo.db (delete it to start fresh).
set ROOT=%~dp0..
start "Agent Finder API (8000)" cmd /k "cd /d "%ROOT%\apps\api" && set APP_ENV=development&& set SEED_ON_START=true&& set OPERATOR_ADAPTER=fake&& set DATABASE_URL=sqlite+aiosqlite:///./meeting-demo.db&& set CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5181&& .venv\Scripts\python -m uvicorn app.main:app --port 8000"
timeout /t 5 /nobreak >nul
start "Customer app (5173)" cmd /k "cd /d "%ROOT%\apps\web" && set VITE_API_MODE=live&& set VITE_API_BASE_URL=http://localhost:8000&& npx vite --port 5173 --strictPort"
start "Agent and aggregator app (5174)" cmd /k "cd /d "%ROOT%\apps\web" && set VITE_API_MODE=live&& set VITE_API_BASE_URL=http://localhost:8000&& set VITE_APP_SURFACE=agent&& npx vite --port 5174 --strictPort"
start "Orange national console (5181)" cmd /k "cd /d "%ROOT%\apps\web" && set VITE_API_MODE=live&& set VITE_API_BASE_URL=http://localhost:8000&& set VITE_APP_SURFACE=national&& npx vite --port 5181 --strictPort"
timeout /t 8 /nobreak >nul
start "" http://localhost:5181
echo.
echo Customer app:               http://localhost:5173
echo Agent and aggregator app:   http://localhost:5174   (kissy / 1234, agents 024... / 1234)
echo Orange national console:    http://localhost:5181   (orange / 123456) - Global Report at the top
echo.
echo Close the four windows to stop.
pause
