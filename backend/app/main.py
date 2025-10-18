from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import auth, cameras, detections, settings
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="SecureSight Backend")

app.mount("/videos", StaticFiles(directory="uploads"), name="videos")

# CORS
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(cameras.router)
app.include_router(detections.router)
app.include_router(settings.router)

@app.get("/")
def root():
    return {"message": "SecureSight Backend is running 🚀"}
