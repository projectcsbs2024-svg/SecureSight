from fastapi import APIRouter, Header, Depends, HTTPException
from sqlalchemy.orm import Session
from ..firebase_config import verify_token
from ..database import get_db
from ..models import User

router = APIRouter(prefix="/auth", tags=["Auth"])

def get_current_user(authorization: str = Header(...), db: Session = Depends(get_db)):
    try:
        token = authorization.split(" ")[1]
        decoded = verify_token(token)
        firebase_uid = decoded["uid"]
        email = decoded.get("email")
    except:
        raise HTTPException(status_code=401, detail="Invalid token")

    # Check if user exists locally
    user = db.query(User).filter(User.firebase_uid == firebase_uid).first()
    if not user:
        # Auto-create user in local DB
        user = User(firebase_uid=firebase_uid, email=email)
        db.add(user)
        db.commit()
        db.refresh(user)

    return user

@router.get("/me")
def get_me(user: User = Depends(get_current_user)):
    return {"id": user.id, "firebase_uid": user.firebase_uid, "email": user.email}
