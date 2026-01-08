from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
import httpx
import os
import random # <--- KONIECZNE DLA SZCZĘŚLIWEGO TRAFU
from app.core.config import settings

router = APIRouter(prefix="/movies", tags=["movies"])

API_KEY = os.getenv("TMDB_API_KEY") or settings.TMDB_API_KEY
BASE_URL = settings.TMDB_BASE_URL

# --- HELPERY ---
async def fetch_fixed_amount(client, url, params, limit=24):
    results = []
    params["page"] = 1
    resp1 = await client.get(url, params=params)
    if resp1.status_code == 200:
        results.extend(resp1.json().get("results", []))
    
    params["page"] = 2
    resp2 = await client.get(url, params=params)
    if resp2.status_code == 200:
        results.extend(resp2.json().get("results", []))
    
    valid_results = [m for m in results if m.get("poster_path")]
    return valid_results[:limit]

# --- ENDPOINTY ---

@router.get("/search")
async def search_movies(q: str, page: int = 1, limit: int = 24):
    if not q: return {"results": []}
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/search/multi"
        params = {"api_key": API_KEY, "query": q, "page": page, "language": "pl-PL", "include_adult": "false"}
        response = await client.get(url, params=params)
        if response.status_code != 200: return {"results": []}
        data = response.json()
        results = [item for item in data.get("results", []) if item.get("media_type") in ["movie", "tv"]]
        return {"results": results[:limit]}

@router.get("/popular")
async def get_popular():
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/movie/popular"
        params = {"api_key": API_KEY, "language": "pl-PL"}
        results = await fetch_fixed_amount(client, url, params, limit=24)
        return {"results": results}

@router.get("/trending")
async def get_trending():
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/trending/movie/week"
        params = {"api_key": API_KEY, "language": "pl-PL"}
        results = await fetch_fixed_amount(client, url, params, limit=24)
        return {"results": results}

@router.get("/top_rated")
async def get_top_rated():
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/movie/top_rated"
        params = {"api_key": API_KEY, "language": "pl-PL"}
        params["vote_count.gte"] = 300 
        results = await fetch_fixed_amount(client, url, params, limit=24)
        return {"results": results}

@router.get("/revenue")
async def get_revenue():
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/discover/movie"
        params = {
            "api_key": API_KEY, 
            "language": "pl-PL",
            "sort_by": "revenue.desc",
            "vote_count.gte": 100,
            "include_adult": "false"
        }
        results = await fetch_fixed_amount(client, url, params, limit=24)
        return {"results": results}

# --- SZCZĘŚLIWY TRAF ---
@router.get("/lucky")
async def get_lucky():
    async with httpx.AsyncClient() as client:
        random_page = random.randint(1, 20)
        url = f"{BASE_URL}/movie/top_rated"
        params = {"api_key": API_KEY, "language": "pl-PL", "page": random_page}
        try:
            resp = await client.get(url, params=params)
            if resp.status_code == 200:
                results = resp.json().get("results", [])
                if results:
                    winner = random.choice(results)
                    return {"id": winner["id"], "type": "movie"}
        except: pass
    return {"id": 238, "type": "movie"}

@router.get("/details/{media_type}/{tmdb_id}")
async def get_details(media_type: str, tmdb_id: int):
    if media_type not in ["movie", "tv"]: media_type = "movie"
    async with httpx.AsyncClient() as client:
        url = f"{BASE_URL}/{media_type}/{tmdb_id}"
        params = {"api_key": API_KEY, "language": "pl-PL", "append_to_response": "credits,watch/providers,keywords"}
        response = await client.get(url, params=params)
        if response.status_code != 200: raise HTTPException(status_code=404, detail="Not found")
        data = response.json()
        
        directors = []
        if media_type == "movie":
            directors = [m for m in data.get("credits", {}).get("crew", []) if m.get("job") == "Director"]
        else:
            directors = data.get("created_by", [])

        providers = []
        try: providers = data.get("watch/providers", {}).get("results", {}).get("PL", {}).get("flatrate", [])
        except: pass

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