from sqlalchemy import Column, Integer, String, Boolean, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from .database import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    firebase_uid = Column(String, unique=True, index=True)  # Link to Firebase Auth
    email = Column(String, unique=True)

    cameras = relationship("Camera", back_populates="owner")
    settings = relationship("UserSetting", back_populates="owner", uselist=False)

class Camera(Base):
    __tablename__ = "cameras"
    id = Column(String, primary_key=True)  # CAM001
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    weapon = Column(Boolean, default=False)
    scuffle = Column(Boolean, default=False)
    stampede = Column(Boolean, default=False)
    status = Column(String, default="active")

    owner = relationship("User", back_populates="cameras")
    detections = relationship("Detection", back_populates="camera")

class Detection(Base):
    __tablename__ = "detections"
    id = Column(String, primary_key=True)  # CAM001_1
    camera_id = Column(String, ForeignKey("cameras.id"))
    confidence = Column(Float)
    time = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="active")
    action = Column(String)  # photo/video URL

    camera = relationship("Camera", back_populates="detections")

class UserSetting(Base):
    __tablename__ = "user_settings"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    alert_emails = Column(String)  # comma-separated
    weapon_threshold = Column(Float, default=0.8)
    scuffle_threshold = Column(Float, default=0.7)
    stampede_threshold = Column(Float, default=0.75)

    owner = relationship("User", back_populates="settings")
