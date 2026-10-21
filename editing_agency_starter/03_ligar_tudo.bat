@echo off
cd /d "%~dp0"

echo Iniciando o Servidor (Site + API)...
start "Servidor Site" cmd /k "venv\Scripts\activate.bat && uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000"

echo Iniciando o Bot do Discord com Hot Reload...
start "Bot Discord" cmd /k "venv\Scripts\watchmedo.exe auto-restart --directory=bot --pattern=bot.py --recursive -- venv\Scripts\python.exe bot/bot.py"

echo Iniciando o Túnel Cloudflare...
venv\Scripts\python.exe start_tunnel.py

pause
