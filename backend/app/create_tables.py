# create_tables.py
from app.database import engine, Base
from app.models import User, Camera, Detection, UserSetting

Base.metadata.create_all(bind=engine)
print("Tables created successfully.")
