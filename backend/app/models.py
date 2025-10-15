from sqlalchemy import Column, String, JSON, DECIMAL
from app.database import Base

class User(Base):
    __tablename__ = "users"

    user_mail = Column(String(100), index=True)
    user_name = Column(String(50), unique=True)
    uid = Column(String(80), primary_key=True, unique=True)

class UserSettings(Base):
    __tablename__ = "user_settings"

    uid = Column(String(255), primary_key=True, index=True, nullable=False)
    alert_email = Column(JSON, nullable=True)
    weapon_threshold = Column(DECIMAL(3, 2), nullable=True, default=0.65)
    scuffle_threshold = Column(DECIMAL(3, 2), nullable=True, default=0.65)
    stamped_threshold = Column(DECIMAL(3, 2), nullable=True, default=0.65)
