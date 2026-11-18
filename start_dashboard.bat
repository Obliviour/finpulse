@echo off
title FinPulse - Personal Finance, Net Worth & Planning Dashboard
echo Starting FinPulse Local Server on http://localhost:5000 ...
start "" http://localhost:5000
if exist "%~dp0.venv\Scripts\python.exe" (
    "%~dp0.venv\Scripts\python.exe" "%~dp0app.py"
) else (
    where python >nul 2>nul
    if %errorlevel%==0 (
        python "%~dp0app.py"
    ) else (
        py -3 "%~dp0app.py"
    )
)
pause
