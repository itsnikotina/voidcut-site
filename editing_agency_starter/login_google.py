import os
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ['https://www.googleapis.com/auth/drive']

def main():
    print("=========================================")
    print("GERADOR DE TOKEN PARA O GOOGLE DRIVE")
    print("=========================================")
    
    if not os.path.exists('client_secret.json'):
        print("ERRO: Arquivo client_secret.json não encontrado!")
        print("Você precisa baixar esse arquivo no Google Cloud (em 'OAuth client ID').")
        input("Pressione Enter para sair...")
        return
        
    flow = InstalledAppFlow.from_client_secrets_file('client_secret.json', SCOPES)
    creds = flow.run_local_server(port=8080)
    
    # Save the credentials for the next run
    with open('token.json', 'w') as token:
        token.write(creds.to_json())
        
    print("\nSUCESSO! O arquivo 'token.json' foi criado.")
    print("Agora o sistema vai usar a sua conta pessoal de 5TB para fazer o upload!")
    input("Pressione Enter para sair...")

if __name__ == '__main__':
    main()
