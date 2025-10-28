from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routes import auth, cameras, detections, settings
from app.services.weapon_worker import weapon_manager
from app.database import get_db
from app.models import Camera
from sqlalchemy.orm import Session
from app.routes import auth, cameras, detections, settings


app = FastAPI(title="SecureSight Backend")

# Mount static files for videos
app.mount("/videos", StaticFiles(directory="uploads"), name="videos")

# Mount static files for detection images
app.mount("/static", StaticFiles(directory="app/static"), name="static")


# CORS configuration
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

# Include routers
app.include_router(auth.router)
app.include_router(cameras.router)
app.include_router(detections.router)
app.include_router(settings.router)

# ----------------------
# Startup event
# ----------------------
@app.on_event("startup")
async def startup_event():
    db: Session = next(get_db())

    try:
        # Load all cameras from DB
        db_cameras = db.query(Camera).all()
        # Filter cameras that have weapon detection enabled
        cameras_to_run = [
            cam for cam in db_cameras
            if cam.detections_enabled and "weapon" in cam.detections_enabled
        ]

        for cam in cameras_to_run:
            weapon_manager.start_worker(cam.id)  # <-- only camera_id now

        print(f"Weapon detection workers started for {len(cameras_to_run)} cameras.")
    except Exception as e:
        print(f"Error starting weapon detection workers: {e}")

# ----------------------
# Shutdown event
# ----------------------
@app.on_event("shutdown")
async def shutdown_event():
    weapon_manager.stop_all()
    print("All weapon detection workers stopped.")

@app.get("/")
def root():
    return {"message": "SecureSight Backend is running 🚀"}
