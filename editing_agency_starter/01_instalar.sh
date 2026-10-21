#!/bin/bash
echo "Criando ambiente virtual..."
python3 -m venv venv
echo "Instalando dependencias..."
source venv/bin/activate
pip install -r requirements.txt
echo "Finalizado!"
read -p "Pressione Enter para continuar..."
