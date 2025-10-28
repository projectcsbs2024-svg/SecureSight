# create_tables.py
from app.database import engine, Base
from app.models import User, Camera, Detection, UserSetting

Base.metadata.drop_all(bind=engine)
print("Tables deleted successfully.")

Base.metadata.create_all(bind=engine)
print("Tables created successfully.")



