@echo off
rem Agent Finder: first-time install on Windows. Needs Python 3.12 and Node.js 22, and internet.
cd /d "%~dp0..\apps\api"
echo Installing the API's Python packages...
py -3.12 -m venv .venv 2>nul || python -m venv .venv
if errorlevel 1 goto fail
.venv\Scripts\python -m pip install -r requirements.lock
if errorlevel 1 goto fail
.venv\Scripts\python -m pip install --no-deps -e .
if errorlevel 1 goto fail
cd /d "%~dp0..\apps\web"
echo Installing the web apps' packages...
call npm install --legacy-peer-deps
if errorlevel 1 goto fail
echo.
echo Done. Now double-click run-all.bat in this folder.
pause
exit /b 0
:fail
echo.
echo Something went wrong above. Check that Python 3.12 and Node.js 22 are installed
echo ("Add Python to PATH" ticked), that you are online, then run this again.
pause
exit /b 1
