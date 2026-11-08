import os
from dotenv import load_dotenv

# Carrega o .env da raiz do projeto automaticamente
_dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
if os.path.exists(_dotenv_path):
    load_dotenv(_dotenv_path)
else:
    load_dotenv()

from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime

_root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_sqlite_path = os.path.join(_root_dir, "agency.db")
_sqlite_url = f"sqlite:///{_sqlite_path}"

def _create_app_engine():
    raw_url = os.getenv("DATABASE_URL", _sqlite_url)
    db_url = raw_url
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif db_url.startswith("postgresql://") and not db_url.startswith("postgresql+"):
        db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)

    if db_url.startswith("postgresql"):
        try:
            test_engine = create_engine(db_url, connect_args={"connect_timeout": 3})
            with test_engine.connect() as conn:
                pass
            print(f"[DATABASE] Conectado ao banco PostgreSQL remoto.")
            return test_engine
        except Exception as err:
            print(f"[DATABASE] AVISO: Nao foi possivel conectar ao PostgreSQL remoto.")
            print(f"[DATABASE] Motivo: {err}")
            print(f"[DATABASE] Utilizando banco local SQLite: {_sqlite_path}")
            return create_engine(_sqlite_url, connect_args={"check_same_thread": False})
    
    return create_engine(db_url, connect_args={"check_same_thread": False} if db_url.startswith("sqlite") else {})

engine = _create_app_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    discord_id = Column(String, unique=True, index=True)
    name = Column(String)
    role = Column(String) # "client" or "editor" or "admin"
    specialties = Column(String, nullable=True) # For editors
    status = Column(String, default="Available") # For editors

class Job(Base):
    __tablename__ = "jobs"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    client_id = Column(Integer, ForeignKey("users.id"))
    editor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    service = Column(String)
    description = Column(String)
    deadline = Column(String, nullable=True)
    status = Column(String, default="New")
    client_price = Column(Float, nullable=True)
    editor_price = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    channels_created = Column(Boolean, default=False)
    
    # New fields for white-label file management
    access_token = Column(String, nullable=True)
    drive_folder_id = Column(String, nullable=True)

    client = relationship("User", foreign_keys=[client_id])
    editor = relationship("User", foreign_keys=[editor_id])

def init_db():
    Base.metadata.create_all(bind=engine)
