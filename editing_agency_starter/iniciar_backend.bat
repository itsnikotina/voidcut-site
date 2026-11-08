@echo off
chcp 65001 >nul
title VOIDCUT - Backend & Discord Bot

:: Navega para a pasta editing_agency_starter
if exist "%~dp0editing_agency_starter\venv\Scripts\activate.bat" (
    cd /d "%~dp0editing_agency_starter"
) else if exist "%~dp0venv\Scripts\activate.bat" (
    cd /d "%~dp0"
) else (
    echo ========================================================
    echo  [ERRO] Ambiente virtual (venv) nao encontrado!
    echo  Execute o 01_instalar.bat antes de iniciar.
    echo ========================================================
    pause
    exit /b
)

echo ========================================================
echo         VOIDCUT - INICIANDO BACKEND E BOT DISCORD       
echo ========================================================
echo.

echo [1/2] Iniciando API FastAPI (Backend Local na porta 8000)...
start "VOIDCUT - Servidor API" cmd /k "chcp 65001 >nul && call venv\Scripts\activate.bat && uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000"

echo [2/2] Iniciando Bot do Discord...
start "VOIDCUT - Bot Discord" cmd /k "chcp 65001 >nul && call venv\Scripts\activate.bat && python -u bot/bot.py"

echo.
echo ========================================================
echo   Tudo pronto!
echo   - Backend rodando em: http://127.0.0.1:8000
echo   - Painel local:       http://127.0.0.1:8000/dashboard.html
echo   - Bot do Discord:     Ativo e conectado
echo ========================================================
echo.
pause
