import subprocess
import re
import sys

print("========================================================")
print("Iniciando o túnel do Cloudflare e capturando o link...")
print("========================================================")

# Detecta o sistema operacional para usar o binário correto
executable = 'cloudflared.exe' if sys.platform == 'win32' else 'cloudflared'

process = subprocess.Popen(
    [executable, 'tunnel', '--url', 'http://127.0.0.1:8000'],
    stderr=subprocess.PIPE,
    stdout=subprocess.PIPE,
    text=True,
    bufsize=1
)

url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")

# Read stderr line by line
for line in process.stderr:
    print(line, end='', flush=True)
    match = url_pattern.search(line)
    if match:
        url = match.group(0)
        with open('site_url.txt', 'w') as f:
            f.write(url)
        print("\n\n========================================================")
        print(f"LINK CAPTURADO COM SUCESSO: {url}")
        print("O robô já sabe esse link! Pode usar o sistema.")
        print("========================================================\n\n")

process.wait()
