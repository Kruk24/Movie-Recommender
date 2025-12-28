from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
import httpx
import asyncio
import os
from app.core.config import settings
from typing import List, Optional
from pydantic import BaseModel

router = APIRouter(prefix="/movies")

API_KEY = os.getenv("TMDB_API_KEY") or settings.TMDB_API_KEY

# --- HELPERY ---
def filter_results(items: List[dict]) -> List[dict]:
    """Filtruje wyniki: usuwa te bez ocen (vote_count > 0)."""
    # Zabezpieczenie (i.get(...) or 0) na wypadek gdyby API zwróciło None
    return [i for i in items if (i.get("vote_count") or 0) > 0]

# --- ENDPOINTY ---

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
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()
    # Filtrujemy wyniki bez głosów
    results = filter_results(data.get("results", []))
    
    top10 = results[:10]
    return JSONResponse({"top10": top10})


@router.get("/search")
async def search_movies(q: str, limit: int = 10):
    """
    Search movies and TV by query and return top results sorted by popularity.
    """
    if not q or not q.strip():
        return JSONResponse({"results": []})

    limit = min(max(1, int(limit)), 20)

    params = {"api_key": API_KEY, "language": "pl-PL", "query": q, "page": 1, "include_adult": False}

    async with httpx.AsyncClient(timeout=10.0) as client:
        tasks = [
            client.get(f"{settings.TMDB_BASE_URL}/search/movie", params=params),
            client.get(f"{settings.TMDB_BASE_URL}/search/tv", params=params)
        ]
        responses = await asyncio.gather(*tasks)

    items = []

    def _parse(resp, media_type):
        if resp.status_code != 200:
            return []
        data = resp.json()
        out = []
        for item in data.get("results", []):
            title = item.get("title") or item.get("name")
            if not title: continue # Pomijamy wyniki bez tytułu

            out.append({
                "id": item.get("id"),
                "title": title,
                "release_date": item.get("release_date") or item.get("first_air_date"),
                "media_type": media_type,
                "poster_path": item.get("poster_path"),
                # Używamy 'or 0' dla bezpieczeństwa przed nullami z API
                "vote_average": item.get("vote_average") or 0.0,
                "vote_count": item.get("vote_count") or 0,
                "popularity": item.get("popularity") or 0.0
            })
        return out

    items.extend(_parse(responses[0], "movie"))
    items.extend(_parse(responses[1], "tv"))

    # POPRAWKA: Filtrujemy zmienną 'items', a nie 'results' (która tu nie istniała)
    items = filter_results(items)

    # dedupe by (media_type, id)
    seen = set()
    unique = []
    for it in items:
        key = (it.get("media_type"), it.get("id"))
        if key in seen:
            continue
        seen.add(key)
        unique.append(it)

    # sort by popularity descending and return up to `limit`
    unique.sort(key=lambda x: x.get("popularity", 0), reverse=True)

    return JSONResponse({"results": unique[:limit]})


@router.get("/details/{media_type}/{tmdb_id}")
async def get_movie_details(media_type: str, tmdb_id: int):
    if media_type not in ["movie", "tv"]:
        media_type = "movie"

    url = f"{settings.TMDB_BASE_URL}/{media_type}/{tmdb_id}"
    params = {
        "api_key": API_KEY,
        "language": "pl-PL",
        "append_to_response": "credits,watch/providers"
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, params=params)

    if resp.status_code != 200:
        return JSONResponse({"error": "Not found"}, status_code=404)

    data = resp.json()

    # Parsowanie Reżysera
    directors = []
    if media_type == "movie":
        crew = data.get("credits", {}).get("crew", [])
        directors = [p["name"] for p in crew if p.get("job") == "Director"]
    else:
        created_by = data.get("created_by", [])
        directors = [p["name"] for p in created_by]

    # Parsowanie Obsady
    cast = []
    for actor in data.get("credits", {}).get("cast", [])[:6]:
        cast.append({
            "name": actor.get("name"),
            "character": actor.get("character"),
            "profile_path": actor.get("profile_path")
        })

    # Parsowanie Streamingu
    providers_data = data.get("watch/providers", {}).get("results", {}).get("PL", {})
    streaming = []
    for prov in providers_data.get("flatrate", []):
        streaming.append({
            "name": prov.get("provider_name"),
            "logo_path": prov.get("logo_path")
        })

    title = data.get("title") or data.get("name")
    release_date = data.get("release_date") or data.get("first_air_date")

    return {
        "id": data.get("id"),
        "title": title,
        "overview": data.get("overview"),
        "release_date": release_date,
        "poster_path": data.get("poster_path"),
        # Zabezpieczenie: jeśli null to 0.0
        "vote_average": data.get("vote_average") or 0.0,
        "genres": [g["name"] for g in data.get("genres", [])],
        "production_countries": [c["name"] for c in data.get("production_countries", [])],
        "directors": directors,
        "cast": cast,
        "watch_providers": streaming,
        "media_type": media_type
    }