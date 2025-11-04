# app/services/ws_manager.py

import asyncio
import json
from typing import Dict, Set
from starlette.websockets import WebSocket
from app.services.dashboard_ws import dashboard_ws_manager  # ✅ import for dashboard updates

class WebSocketManager:
    def __init__(self):
        # camera_id -> set of WebSocket connections
        self.connections: Dict[str, Set[WebSocket]] = {}
        self.loop: asyncio.AbstractEventLoop | None = None
        self.active_alerts: Dict[str, int] = {}  # 👈 track number of boxes per camera

    def set_event_loop(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop

    async def connect(self, camera_id: str, websocket: WebSocket):
        await websocket.accept()
        conns = self.connections.setdefault(camera_id, set())
        conns.add(websocket)
        print(f"[WSManager] Client connected for camera {camera_id}. Total: {len(conns)}")

    def disconnect(self, camera_id: str, websocket: WebSocket):
        conns = self.connections.get(camera_id)
        if conns and websocket in conns:
            conns.remove(websocket)
            print(f"[WSManager] Client disconnected from camera {camera_id}. Remaining: {len(conns)}")
            if not conns:
                del self.connections[camera_id]

    async def send_personal(self, websocket: WebSocket, message: dict):
        try:
            await websocket.send_text(json.dumps(message))
        except Exception:
            pass

    async def broadcast(self, camera_id: str, message: dict):
        """
        Broadcast message (dict) to all websockets connected to camera_id.
        Also updates dashboard with total active bounding boxes.
        """
        detections = message.get("detections", [])
        self.active_alerts[camera_id] = len(detections)

        # 🔁 Notify dashboard clients with current total alerts
        total_boxes = sum(self.active_alerts.values())
        try:
            await dashboard_ws_manager.broadcast({
                "type": "current_alerts_update",
                "current_alerts": total_boxes
            })
        except Exception as e:
            print(f"[WSManager] Dashboard broadcast error: {e}")

        conns = list(self.connections.get(camera_id, []))
        if not conns:
            return
        payload = json.dumps(message, default=str)
        to_remove = []
        for ws in conns:
            try:
                await ws.send_text(payload)
            except Exception:
                to_remove.append(ws)
        for ws in to_remove:
            self.disconnect(camera_id, ws)

# Singleton
ws_manager = WebSocketManager()
