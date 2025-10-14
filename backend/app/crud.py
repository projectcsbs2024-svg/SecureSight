from sqlalchemy.orm import Session
from . import models

from sqlalchemy.orm import Session
from . import models

def get_user_settings(db: Session, user_mail: str):
    return db.query(models.UserSettings).filter(models.UserSettings.user_mail == user_mail).first()

