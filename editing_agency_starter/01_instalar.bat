@echo off
echo Criando ambiente virtual...
python -m venv venv
echo Instalando dependencias...
call venv\Scripts\activate
pip install -r requirements.txt
echo Finalizado!
pause
