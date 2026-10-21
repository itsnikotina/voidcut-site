#!/bin/bash

# Mata os processos filhos quando este script for fechado (Ctrl+C)
trap 'kill 0' SIGINT

echo "Iniciando o Servidor (Site + API)..."
source venv/bin/activate
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000 &

echo "Iniciando o Bot do Discord com Hot Reload..."
venv/bin/watchmedo auto-restart --directory=bot --pattern=bot.py --recursive -- venv/bin/python bot/bot.py &

echo "Iniciando o Tunnel..."
python3 start_tunnel.py

wait
