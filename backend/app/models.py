# models.py
from sqlalchemy import Column, String, Float
from sqlalchemy.orm import declarative_base

Base = declarative_base()

class UserSettings(Base):
    __tablename__ = "user_settings"
    user_mail = Column(String, primary_key=True, index=True)
    alert_email = Column(String)  # store as comma-separated string or JSON
    weapon_threshold = Column(Float)
    scuffle_threshold = Column(Float)
    stamped_threshold = Column(Float)


