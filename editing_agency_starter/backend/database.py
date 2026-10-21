import os
from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./agency.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)
elif DATABASE_URL.startswith("postgresql://") and not DATABASE_URL.startswith("postgresql+"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
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
