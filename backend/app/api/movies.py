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
BASE_URL = settings.TMDB_BASE_URL

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
    
    top10 = results[:14]
    return JSONResponse({"top10": top10})


@router.get("/trending")
async def get_trending(limit: int = 14): # Domyślnie 14
    async with httpx.AsyncClient() as client:
        # Pobieramy trendy tygodnia
        url = f"{BASE_URL}/trending/movie/week"
        params = {"api_key": API_KEY, "language": "pl-PL"}
        response = await client.get(url, params=params)
        
        if response.status_code != 200:
            return {"results": []}
            
        data = response.json()
        results = data.get("results", [])
        
        # Ograniczamy liczbę wyników zgodnie z życzeniem
        return {"results": results[:limit]}


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
async def get_details(media_type: str, tmdb_id: int):
    # Zabezpieczenie typu
    if media_type not in ["movie", "tv"]:
        media_type = "movie"

    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/{media_type}/{tmdb_id}"
        # Pobieramy dodatkowe dane w jednym strzale
        params = {"api_key": API_KEY, "language": "pl-PL", "append_to_response": "credits,watch/providers,keywords"}
        
        response = await client.get(url, params=params)
        if response.status_code != 200:
            raise HTTPException(status_code=404, detail="Movie not found")
        
        data = response.json()
        
        # Ekstrakcja danych - bezpieczna, z obsługą błędów
        directors = []
        if media_type == "movie":
            crew = data.get("credits", {}).get("crew", [])
            directors = [m for m in crew if m.get("job") == "Director"]
        else:
            directors = data.get("created_by", [])

        # Ekstrakcja providerów (bezpieczniejsza)
        providers = []
        try:
            # TMDB zwraca zagnieżdżoną strukturę dla providerów
            results = data.get("watch/providers", {}).get("results", {})
            pl_providers = results.get("PL", {})
            if pl_providers:
                # Interesuje nas zazwyczaj flatrate (abonament)
                providers = pl_providers.get("flatrate", [])
        except:
            providers = []

        return {
            "id": data.get("id"),
            "title": data.get("title") or data.get("name"),
            "overview": data.get("overview"),
            "poster_path": data.get("poster_path"),
            "backdrop_path": data.get("backdrop_path"),
            "release_date": data.get("release_date") or data.get("first_air_date"),
            "vote_average": data.get("vote_average"),
            "vote_count": data.get("vote_count"),
            "genres": data.get("genres", []),
            "runtime": data.get("runtime"),
            "episode_run_time": data.get("episode_run_time", []),
            "production_countries": data.get("production_countries", []),
            "media_type": media_type,
            "cast": data.get("credits", {}).get("cast", [])[:12],
            "directors": directors,
            "watch_providers": providers
        }