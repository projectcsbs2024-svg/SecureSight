import asyncio
import json
from typing import Dict, Set

from starlette.websockets import WebSocket

from app.services.dashboard_ws import dashboard_ws_manager


class WebSocketManager:
    def __init__(self):
        self.connections: Dict[str, Set[WebSocket]] = {}
        self.loop: asyncio.AbstractEventLoop | None = None
        self.active_alerts: Dict[str, int] = {}
        self.last_event_at: Dict[str, float] = {}

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
        detections = message.get("detections", [])
        self.active_alerts[camera_id] = len(detections)
        self.last_event_at[camera_id] = asyncio.get_running_loop().time()

        try:
            await dashboard_ws_manager.broadcast(
                {
                    "type": "current_alerts_update",
                    "current_alerts": self.get_total_active_alerts(),
                }
            )
        except Exception as exc:
            print(f"[WSManager] Dashboard broadcast error: {exc}")

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

    def get_total_active_alerts(self, max_age_seconds: float = 1.5) -> int:
        now = asyncio.get_event_loop().time()
        for camera_id, timestamp in list(self.last_event_at.items()):
            if now - timestamp > max_age_seconds:
                self.active_alerts[camera_id] = 0
        return sum(self.active_alerts.values())


ws_manager = WebSocketManager()
