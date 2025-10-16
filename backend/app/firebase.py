# app/firebase.py
import firebase_admin
from firebase_admin import credentials, auth
from fastapi import Header, HTTPException

# ✅ Initialize Firebase only once
if not firebase_admin._apps:
    cred = credentials.Certificate("C:/Users/ASHRAF ALI/Downloads/sight-2094c-firebase-adminsdk-fbsvc-b27af64182.json")
    firebase_admin.initialize_app(cred)


def get_uid_from_token(authorization: str = Header(...)) -> str:
    """Extract and verify Firebase ID token, return UID."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = authorization.split("Bearer ")[-1]
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token["uid"]
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
