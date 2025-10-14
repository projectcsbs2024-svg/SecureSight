from fastapi import FastAPI
from .routes import auth, cameras, detections, settings

app = FastAPI(title="SecureSight Backend")

# Register routes
app.include_router(auth.router)
app.include_router(cameras.router)
app.include_router(detections.router)
app.include_router(settings.router)

@app.get("/")
def root():
    return {"message": "SecureSight Backend is running 🚀"}
