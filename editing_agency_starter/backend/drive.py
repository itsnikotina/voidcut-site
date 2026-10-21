import os
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaFileUpload
from google.auth.transport.requests import AuthorizedSession
import io

SCOPES = ['https://www.googleapis.com/auth/drive']

def _get_token_path():
    # Look in the project root (editing_agency_starter/token.json)
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    target = os.path.join(root, 'token.json')
    if os.path.exists(target):
        return target
    # Fallback to local dir
    if os.path.exists('token.json'):
        return 'token.json'
    return target

def get_drive_service():
    token_path = _get_token_path()
    creds = Credentials.from_authorized_user_file(token_path, scopes=SCOPES)
    return build('drive', 'v3', credentials=creds)

def create_job_folder(job_name: str, root_folder_id: str) -> str:
    service = get_drive_service()
    file_metadata = {
        'name': job_name,
        'mimeType': 'application/vnd.google-apps.folder',
        'parents': [root_folder_id]
    }
    folder = service.files().create(body=file_metadata, fields='id').execute()
    return folder.get('id')

def list_files(folder_id: str):
    service = get_drive_service()
    query = f"'{folder_id}' in parents and trashed = false"
    results = service.files().list(q=query, fields="files(id, name, size, webContentLink)").execute()
    return results.get('files', [])

def create_upload_session(folder_id: str, filename: str, mime_type: str, file_size: int, origin: str) -> str:
    creds = Credentials.from_authorized_user_file(_get_token_path(), scopes=SCOPES)
    session = AuthorizedSession(creds)
    
    metadata = {
        "name": filename,
        "parents": [folder_id]
    }
    
    headers = {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mime_type,
        "X-Upload-Content-Length": str(file_size),
        "Origin": origin
    }
    
    DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable"
    
    response = session.post(DRIVE_UPLOAD_URL, headers=headers, json=metadata, timeout=30)
    
    if response.status_code != 200:
        raise Exception(f"Google Drive recusou a criação da sessão: {response.text}")
        
    location = response.headers.get("Location")
    if not location:
        raise Exception("Google Drive não retornou o header Location")
        
    return location

def upload_file(folder_id: str, file_name: str, file_path: str):
    service = get_drive_service()
    file_metadata = {
        'name': file_name,
        'parents': [folder_id]
    }
    media = MediaFileUpload(file_path, mimetype='application/octet-stream', chunksize=1024*1024*5, resumable=True)
    request = service.files().create(body=file_metadata, media_body=media, fields='id')
    
    response = None
    while response is None:
        status, response = request.next_chunk()
        
    return response.get('id')

def delete_file(file_id: str):
    service = get_drive_service()
    service.files().delete(fileId=file_id).execute()
    return True
