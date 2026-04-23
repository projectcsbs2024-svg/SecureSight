# app/main.py

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routes import auth, cameras, detections, settings
from app.services.weapon_worker import weapon_manager
from app.database import get_db, engine, Base, SessionLocal
from app.models import Camera
from sqlalchemy.orm import Session
from sqlalchemy import inspect, text
import asyncio
from app.services.ws_manager import ws_manager
from app.services.dashboard_ws import dashboard_ws_manager

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


def ensure_database_schema():
    Base.metadata.create_all(bind=engine)

    inspector = inspect(engine)
    if not inspector.has_table("cameras"):
        return

    camera_columns = {column["name"] for column in inspector.get_columns("cameras")}
    if "stampede_person_limit" not in camera_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE cameras ADD COLUMN stampede_person_limit INTEGER"))

# ----------------------
# WebSocket: Dashboard Updates
# ----------------------
@app.websocket("/dashboard/ws")
async def dashboard_ws(websocket: WebSocket):
    """
    Real-time dashboard updates for alert statistics.
    Frontend connects here to get instant updates.
    """
    await dashboard_ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep connection alive
    except Exception:
        pass
    finally:
        dashboard_ws_manager.disconnect(websocket)


# ----------------------
# Startup event
# ----------------------
@app.on_event("startup")
async def startup_event():
    # Set ws_manager event loop so worker threads can schedule broadcasts
    try:
        loop = asyncio.get_event_loop()
        ws_manager.set_event_loop(loop)
    except Exception as e:
        print(f"[Main] Could not set ws_manager loop: {e}")

    ensure_database_schema()
    db: Session = SessionLocal()
    try:
        # Load all cameras from DB
        db_cameras = db.query(Camera).all()
        cameras_to_run = [
            cam for cam in db_cameras
            if cam.detections_enabled
            and any(det in cam.detections_enabled for det in ["weapon", "scuffle", "stampede"])
        ]

        for cam in cameras_to_run:
            weapon_manager.start_worker(cam.id)

        print(f"Weapon detection workers started for {len(cameras_to_run)} cameras.")
    except Exception as e:
        print(f"Error starting weapon detection workers: {e}")
    finally:
        db.close()


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
