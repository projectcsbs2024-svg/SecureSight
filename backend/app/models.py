from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    firebase_uid = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # relationships
    settings = relationship("UserSetting", back_populates="user", uselist=False)
    cameras = relationship("Camera", back_populates="user")
    detections = relationship("Detection", back_populates="user")


class UserSetting(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    alert_emails = Column(String, nullable=True)  # comma-separated string
    email_alerts_enabled = Column(Boolean, default=True, nullable=False)
    weapon_threshold = Column(Float, default=0.8)
    scuffle_threshold = Column(Float, default=0.45)
    stampede_threshold = Column(Float, default=0.75)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="settings")


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location = Column(String, nullable=True)
    stream_url = Column(String, nullable=True)
    status = Column(String, default="online")  # e.g., 'online', 'offline'
    detections_enabled = Column(JSON, default=["weapon", "scuffle", "stampede"])
    stampede_person_limit = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    user_id = Column(Integer, ForeignKey("users.id"))

    user = relationship("User", back_populates="cameras")
    detections = relationship("Detection", back_populates="camera")


class Detection(Base):
    """
    Single table to store all detection types:
    - weapon: stores weapon type in `subtype`
    - scuffle: stores scuffle type in `subtype`
    - stampede: stores number of people in `people_count`
    """
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, index=True)
    camera_id = Column(Integer, ForeignKey("cameras.id"))
    user_id = Column(Integer, ForeignKey("users.id"))

    type = Column(String, nullable=False)          # 'weapon', 'scuffle', 'stampede'
    subtype = Column(String, nullable=True)        # weapon type or scuffle type
    confidence = Column(Float, nullable=True)      # 0-1 for weapon/scuffle; can be null for stampede
    people_count = Column(Integer, nullable=True)  # only for stampede
    image_url = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="active")      # 'active' or 'resolved'

    camera = relationship("Camera", back_populates="detections")
    user = relationship("User", back_populates="detections")
