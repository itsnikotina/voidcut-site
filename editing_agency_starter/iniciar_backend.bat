@echo off
title VOIDCUT - Backend & Discord Bot
cd /d "%~dp0"

echo ========================================================
echo         VOIDCUT - INICIANDO BACKEND E BOT DISCORD       
echo ========================================================
echo.

if not exist "venv\Scripts\activate.bat" (
    echo [ERRO] Ambiente virtual venv nao encontrado!
    echo Execute 01_instalar.bat primeiro se ainda nao instalou.
    pause
    exit /b
)

echo [1/2] Iniciando API FastAPI (Backend Local na porta 8000)...
start "VOIDCUT - Servidor API" cmd /k "venv\Scripts\activate.bat && uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000"

echo [2/2] Iniciando Bot do Discord...
start "VOIDCUT - Bot Discord" cmd /k "venv\Scripts\activate.bat && python bot/bot.py"

echo.
echo ========================================================
echo   Tudo pronto!
echo   - Backend rodando em: http://127.0.0.1:8000
echo   - Painel local:       http://127.0.0.1:8000/dashboard.html
echo   - Bot do Discord:     Ativo e conectado
echo ========================================================
echo.
pause
