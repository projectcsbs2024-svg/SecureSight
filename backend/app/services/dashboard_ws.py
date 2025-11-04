# app/services/dashboard_ws.py
from fastapi import WebSocket
from typing import List

class DashboardWebSocketManager:
    def __init__(self):
        self.connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.append(websocket)
        print(f"[DashboardWS] Connected clients: {len(self.connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.connections:
            self.connections.remove(websocket)
            print(f"[DashboardWS] Disconnected. Remaining: {len(self.connections)}")

    async def broadcast(self, message: dict):
        """Send a message to all connected dashboard clients."""
        dead_connections = []
        for ws in self.connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead_connections.append(ws)
        for ws in dead_connections:
            self.disconnect(ws)

dashboard_ws_manager = DashboardWebSocketManager()
