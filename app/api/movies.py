# app/api/movies.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
import httpx
import os
from app.core.config import settings

router = APIRouter(prefix="/movies")

API_KEY = os.getenv("TMDB_API_KEY") or settings.TMDB_API_KEY

@router.get("/top/{category}")
async def top_movies(category: str):
    allowed = {"popular", "top_rated", "now_playing", "upcoming"}
    if category not in allowed:
        raise HTTPException(status_code=400, detail="Invalid category")

    url = f"{settings.TMDB_BASE_URL}/movie/{category}"
    params = {"api_key": API_KEY, "language": "pl-PL", "page": 1}

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, params=params)

    if resp.status_code != 200:
        # zwracamy treść błędu TMDb do logów / klienta
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()
    results = data.get("results", [])
    top10 = results[:10]
    return JSONResponse({"top10": top10})
