from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from .database import SessionLocal, engine, init_db, User, Job
from .drive import list_files, upload_file, delete_file
from pydantic import BaseModel
import os
import io
from dotenv import load_dotenv

load_dotenv()
init_db()

app = FastAPI(title="Voidcut Agency API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/users")
def get_users(role: str = None, db: Session = Depends(get_db)):
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    return query.all()

class JobCreate(BaseModel):
    title: str
    service: str
    description: str
    client_name: str
    discord_id: str

@app.post("/jobs")
def create_job(job_data: JobCreate, db: Session = Depends(get_db)):
    client = db.query(User).filter(User.discord_id == job_data.discord_id).first()
    if not client:
        client = User(discord_id=job_data.discord_id, name=job_data.client_name, role='client')
        db.add(client)
        db.commit()
        db.refresh(client)
        
    new_job = Job(
        title=job_data.title,
        client_id=client.id,
        service=job_data.service,
        description=job_data.description,
        status="New"
    )
    db.add(new_job)
    db.commit()
    return {"message": "Job created"}

class JobCreatePanel(BaseModel):
    title: str
    client_id: int
    editor_id: int
    service: str
    description: str
    client_price: float
    deadline: str = None
    editor_price: float = None

@app.post("/jobs/create_from_panel")
def create_job_from_panel(job_data: JobCreatePanel, db: Session = Depends(get_db)):
    client = db.query(User).filter(User.id == job_data.client_id).first()
    editor = db.query(User).filter(User.id == job_data.editor_id).first()
    
    if not client or not editor:
        raise HTTPException(status_code=404, detail="Client or Editor not found")

    import secrets
    token = secrets.token_urlsafe(16)

    new_job = Job(
        title=job_data.title,
        client_id=client.id,
        editor_id=editor.id,
        service=job_data.service,
        description=job_data.description,
        status="Editing",
        client_price=job_data.client_price,
        editor_price=job_data.editor_price or 0.0,
        deadline=job_data.deadline,
        access_token=token
    )
    db.add(new_job)
    db.commit()
    db.refresh(new_job)

    try:
        from .drive import create_job_folder
        DRIVE_ROOT_FOLDER_ID = os.getenv('DRIVE_ROOT_FOLDER_ID')
        if DRIVE_ROOT_FOLDER_ID:
            folder_id = create_job_folder(f"Job #{new_job.id} - {new_job.title}", DRIVE_ROOT_FOLDER_ID)
            new_job.drive_folder_id = folder_id
            db.commit()
    except Exception as e:
        print("[PANEL] Drive folder creation skipped or error:", e)

    return {"message": "Job created", "job_id": new_job.id}

@app.get("/jobs")
def get_jobs(db: Session = Depends(get_db)):
    jobs = db.query(Job).filter(Job.status != "Deleted").order_by(Job.id.desc()).all()
    results = []
    for j in jobs:
        results.append({
            "id": j.id,
            "title": j.title,
            "client_id": j.client_id,
            "editor_id": j.editor_id,
            "client_name": j.client.name if j.client else (f"Client #{j.client_id}" if j.client_id else "N/A"),
            "editor_name": j.editor.name if j.editor else (f"Editor #{j.editor_id}" if j.editor_id else "Unassigned"),
            "service": j.service,
            "description": j.description,
            "deadline": j.deadline,
            "status": j.status,
            "client_price": j.client_price or 0.0,
            "editor_price": j.editor_price or 0.0,
            "created_at": j.created_at.isoformat() if j.created_at else None,
            "channels_created": j.channels_created,
            "access_token": j.access_token,
            "drive_folder_id": j.drive_folder_id,
        })
    return results

class JobStatusUpdate(BaseModel):
    status: str

@app.patch("/jobs/{job_id}/status")
def update_job_status(job_id: int, data: JobStatusUpdate, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.status = data.status
    db.commit()
    return {"message": "Status updated", "status": job.status}

@app.delete("/jobs/{job_id}")
def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job.status = "Deleted"
    db.commit()
    return {"message": "Job marked for deletion"}

# --- FILE MANAGEMENT ROUTES ---

@app.get("/api/files")
def api_list_files(job_id: int, token: str, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id, Job.access_token == token).first()
    if not job:
        raise HTTPException(status_code=403, detail="Invalid token or job ID")
    if not job.drive_folder_id:
        try:
            from .drive import create_job_folder
            root_folder = os.getenv('DRIVE_ROOT_FOLDER_ID')
            if root_folder:
                job.drive_folder_id = create_job_folder(f"Job #{job.id} - {job.title}", root_folder)
                db.commit()
        except Exception as e:
            print("[DRIVE] Folder auto-create failed:", e)
            return {"project_name": job.title, "files": []}
    
    try:
        files = list_files(job.drive_folder_id)
        return {"project_name": job.title, "files": files}
    except Exception as e:
        print("[DRIVE] Error listing files:", e)
        return {"project_name": job.title, "files": []}

from .drive import list_files, upload_file, delete_file, create_upload_session

class UploadSessionRequest(BaseModel):
    job_id: int
    token: str
    filename: str
    mime_type: str
    file_size: int

from fastapi import Request

@app.post("/api/upload/session")
def api_create_upload_session(data: UploadSessionRequest, request: Request, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == data.job_id, Job.access_token == data.token).first()
    if not job:
        raise HTTPException(status_code=403, detail="Invalid token or job ID")
    if not job.drive_folder_id:
        try:
            from .drive import create_job_folder
            root_folder = os.getenv('DRIVE_ROOT_FOLDER_ID')
            if root_folder:
                job.drive_folder_id = create_job_folder(f"Job #{job.id} - {job.title}", root_folder)
                db.commit()
        except Exception as e:
            print("[DRIVE] Folder auto-create failed:", e)
            raise HTTPException(status_code=400, detail=f"Erro ao conectar com Google Drive: {e}")
        
    if not job.drive_folder_id:
        raise HTTPException(status_code=400, detail="Drive folder not created for this job yet")
        
    try:
        existing_files = list_files(job.drive_folder_id)
        current_size = sum(int(f.get('size', 0)) for f in existing_files)
        
        LIMIT_BYTES = 100 * 1024 * 1024 * 1024 # 100 GB
        if current_size + data.file_size > LIMIT_BYTES:
            raise HTTPException(status_code=400, detail="Upload denied. This project has a storage limit of 100 GB.")
            
        origin = request.headers.get("origin") or "http://127.0.0.1:8000"
        upload_url = create_upload_session(
            folder_id=job.drive_folder_id,
            filename=data.filename,
            mime_type=data.mime_type or "application/octet-stream",
            file_size=data.file_size,
            origin=origin
        )
        return {"upload_url": upload_url}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/files/{file_id}")
def api_delete_file(file_id: str, job_id: int, token: str, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id, Job.access_token == token).first()
    if not job:
        raise HTTPException(status_code=403, detail="Invalid token or job ID")
        
    delete_file(file_id)
    return {"message": "File deleted"}

# --- PORTFOLIO AUTO-DETECTION ---
import json
import urllib.request
import re

PORTFOLIO_CACHE = {}

def get_youtube_video_id(url: str):
    m = re.search(r'(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})', url)
    return m.group(1) if m else None

def fetch_channel_avatar(channel_url: str):
    if not channel_url:
        return None
    cache_key = f"avatar:{channel_url}"
    if cache_key in PORTFOLIO_CACHE:
        return PORTFOLIO_CACHE[cache_key]
    try:
        req = urllib.request.Request(channel_url, headers={"User-Agent": "Mozilla/5.0"})
        html = urllib.request.urlopen(req, timeout=5).read().decode("utf-8", errors="ignore")
        match = re.search(r'https://yt3\.googleusercontent\.com/[a-zA-Z0-9_\-=]+', html)
        if match:
            avatar = match.group(0).split('=')[0] + "=s176-c-k-c0x00ffffff-no-rj"
            PORTFOLIO_CACHE[cache_key] = avatar
            return avatar
    except Exception as e:
        print(f"Error fetching channel avatar for {channel_url}: {e}")
    return None

def fetch_video_metadata(video_url: str):
    cache_key = f"video:{video_url}"
    if cache_key in PORTFOLIO_CACHE:
        return PORTFOLIO_CACHE[cache_key]
    try:
        req = urllib.request.Request(f"https://noembed.com/embed?url={video_url}", headers={"User-Agent": "Mozilla/5.0"})
        data = json.loads(urllib.request.urlopen(req, timeout=5).read().decode("utf-8"))
        res = {
            "title": data.get("title", ""),
            "author_name": data.get("author_name", "")
        }
        PORTFOLIO_CACHE[cache_key] = res
        return res
    except Exception as e:
        print(f"Error fetching video metadata for {video_url}: {e}")
        return {"title": "", "author_name": ""}

@app.get("/api/portfolio")
def api_get_portfolio():
    portfolio_file = os.path.join("frontend", "portfolio.json")
    if not os.path.exists(portfolio_file):
        return []
    
    try:
        with open(portfolio_file, "r", encoding="utf-8") as f:
            raw_clients = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Invalid portfolio.json: {e}")

    result = []
    for c in raw_clients:
        channel_url = c.get("channel") or c.get("channel_url", "")
        avatar = c.get("avatar_url") or fetch_channel_avatar(channel_url)
        client_name = c.get("name") or c.get("client")
        handle = c.get("handle", "")
        if not handle and channel_url and "@" in channel_url:
            handle = "@" + channel_url.split("@")[-1].split("/")[0]

        videos = []
        for v in c.get("videos", []):
            url = v.get("url", "")
            video_id = v.get("id") or get_youtube_video_id(url)
            tag = v.get("tag", "EDIT")
            meta = fetch_video_metadata(url)
            title = v.get("title") or meta.get("title") or "YouTube Video"
            if not client_name and meta.get("author_name"):
                client_name = meta.get("author_name")

            if video_id:
                videos.append({
                    "id": video_id,
                    "url": url,
                    "title": title,
                    "tag": tag
                })

        result.append({
            "client": client_name or "Creator",
            "name": client_name or "Creator",
            "handle": handle,
            "channel_url": channel_url,
            "avatar_url": avatar,
            "category": c.get("category", "Gaming / Content Creator"),
            "type": c.get("type") or c.get("work_type", "Style Reference"),
            "videos": videos
        })

    return result

# Mount frontend at the root. MUST be the last route.
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
