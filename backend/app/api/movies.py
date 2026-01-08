from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
import httpx
import os
from app.core.config import settings

router = APIRouter(prefix="/movies", tags=["movies"])

API_KEY = os.getenv("TMDB_API_KEY") or settings.TMDB_API_KEY
BASE_URL = settings.TMDB_BASE_URL

@router.get("/search")
async def search_movies(q: str, page: int = 1, limit: int = 20):
    if not q: return {"results": []}
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/search/multi"
        params = {"api_key": API_KEY, "query": q, "page": page, "language": "pl-PL", "include_adult": "false"}
        response = await client.get(url, params=params)
        if response.status_code != 200: return {"results": []}
        data = response.json()
        # Filtrujemy, żeby zostały tylko filmy i seriale
        results = [item for item in data.get("results", []) if item.get("media_type") in ["movie", "tv"]]
        return {"results": results[:limit]}

@router.get("/popular")
async def get_popular(page: int = 1):
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/movie/popular"
        params = {"api_key": API_KEY, "page": page, "language": "pl-PL"}
        response = await client.get(url, params=params)
        return response.json() if response.status_code == 200 else {"results": []}

@router.get("/top_rated")
async def get_top_rated(page: int = 1):
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/movie/top_rated"
        params = {"api_key": API_KEY, "page": page, "language": "pl-PL"}
        response = await client.get(url, params=params)
        return response.json() if response.status_code == 200 else {"results": []}

@router.get("/trending")
async def get_trending(limit: int = 14):
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/trending/movie/week"
        params = {"api_key": API_KEY, "language": "pl-PL"}
        response = await client.get(url, params=params)
        if response.status_code != 200: return {"results": []}
        data = response.json()
        return {"results": data.get("results", [])[:limit]}

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
        
        # Bezpieczna ekstrakcja reżysera/twórcy
        directors = []
        if media_type == "movie":
            crew = data.get("credits", {}).get("crew", [])
            directors = [m for m in crew if m.get("job") == "Director"]
        else:
            directors = data.get("created_by", [])

        # Bezpieczna ekstrakcja providerów (to często powodowało błędy)
        providers = []
        try:
            wp = data.get("watch/providers", {})
            if wp and "results" in wp:
                pl = wp["results"].get("PL", {})
                if pl and "flatrate" in pl:
                    providers = pl["flatrate"]
        except:
            providers = []

        # Obsługa czasu trwania (różna dla filmów i seriali)
        runtime = data.get("runtime")
        episode_run_time = data.get("episode_run_time", [])

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
            "runtime": runtime,
            "episode_run_time": episode_run_time,
            "production_countries": data.get("production_countries", []),
            "media_type": media_type,
            "cast": data.get("credits", {}).get("cast", [])[:12],
            "directors": directors,
            "watch_providers": providers
        }