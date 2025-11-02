# app/services/ws_manager.py
import asyncio
import json
from typing import Dict, Set
from starlette.websockets import WebSocket

class WebSocketManager:
    def __init__(self):
        # camera_id -> set of WebSocket connections
        self.connections: Dict[str, Set[WebSocket]] = {}
        self.loop: asyncio.AbstractEventLoop | None = None

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
        """
        conns = list(self.connections.get(camera_id, []))
        if not conns:
            return
        payload = json.dumps(message, default=str)
        to_remove = []
        for ws in conns:
            try:
                await ws.send_text(payload)
            except Exception:
                # mark for removal
                to_remove.append(ws)
        for ws in to_remove:
            self.disconnect(camera_id, ws)

# Singleton
ws_manager = WebSocketManager()
