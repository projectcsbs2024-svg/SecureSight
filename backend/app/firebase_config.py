import firebase_admin
from firebase_admin import credentials, auth

import os
cred_path = os.getenv("FIREBASE_CREDENTIALS", "./app/serviceAccountKey.json")
cred = credentials.Certificate(cred_path)
firebase_admin.initialize_app(cred)

def verify_token(token: str):
    """
    Verify Firebase JWT token.
    Returns decoded token with 'uid' if valid.
    """
    decoded_token = auth.verify_id_token(token)
    return decoded_token
