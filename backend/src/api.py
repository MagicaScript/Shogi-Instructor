"""
Lishogi Data Bridge Backend

A FastAPI server that receives chunked game data from Lishogi client
and provides API to retrieve current game state.
"""

import json
import os
import base64
import time
from typing import Any, Dict, Optional

from fastapi import FastAPI, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


class Config(BaseModel):
    listen: str = "0.0.0.0:3080"


def load_config() -> Config:
    """Load configuration from config.json file."""
    if not os.path.exists("config.json"):
        raise RuntimeError("config.json not found")
    with open("config.json", "r") as f:
        return Config(**json.load(f))


app = FastAPI(title="Lishogi Data Bridge")
config = Config()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1x1 transparent GIF for image response
PIXEL = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00"
    b"\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,"
    b"\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
)

INBOX: Dict[str, Dict[str, Any]] = {}
TTL_SECONDS = 20

# Stores the latest complete game state
current_state: Optional[Dict[str, Any]] = None
current_state_ts: float = 0


def b64url_decode_to_bytes(s: str) -> bytes:
    """Decode URL-safe base64 string to bytes."""
    s = s.replace("-", "+").replace("_", "/")
    s += "=" * (-len(s) % 4)
    return base64.b64decode(s)


def cleanup():
    """Remove expired incomplete chunks from inbox."""
    now = time.time()
    dead = [k for k, v in INBOX.items() if now - v["ts"] > TTL_SECONDS]
    for k in dead:
        INBOX.pop(k, None)


@app.get("/api/chunk")
def recv_chunk(
    id: str = Query(...),
    h: str = Query(...),
    i: int = Query(..., ge=0),
    n: int = Query(..., ge=1),
    d: str = Query(...),
):
    """
    Receive a single chunk of base64-encoded game data.

    Chunks are reassembled when all parts arrive.
    Returns a 1x1 GIF to satisfy image request.
    """
    global current_state, current_state_ts

    cleanup()

    slot = INBOX.get(id)
    if slot is None:
        slot = {"n": n, "parts": {}, "ts": time.time(), "h": h}
        INBOX[id] = slot

    if slot["n"] != n or slot["h"] != h:
        INBOX.pop(id, None)
        return Response(content=PIXEL, media_type="image/gif")

    slot["ts"] = time.time()
    slot["parts"][i] = d

    if len(slot["parts"]) == n:
        b64 = "".join(slot["parts"][idx] for idx in range(n))
        INBOX.pop(id, None)

        try:
            payload_bytes = b64url_decode_to_bytes(b64)
            obj = json.loads(payload_bytes.decode("utf-8"))

            current_state = obj
            current_state_ts = time.time()

        except Exception as e:
            print("DECODE ERROR:", e)

    return Response(content=PIXEL, media_type="image/gif")


@app.get("/api/state")
def get_current_state():
    """
    Get the current game state.

    Returns:
        - state: The latest game data (gameId, steps, clock, player)
        - timestamp: Unix timestamp when state was last updated
        - age_ms: Milliseconds since last update
    """
    if current_state is None:
        return {
            "state": None,
            "timestamp": None,
            "age_ms": None,
            "message": "No game data received yet",
        }

    return {
        "state": current_state,
        "timestamp": current_state_ts,
        "age_ms": int((time.time() - current_state_ts) * 1000),
    }


@app.get("/api/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok", "has_state": current_state is not None}
