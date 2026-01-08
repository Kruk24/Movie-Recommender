from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel
from typing import List, Optional
import httpx
import asyncio
import json
import random
import os
from collections import Counter

from app.db.database import get_db
from app.db.models import FavoriteMovie
from app.core.config import settings

router = APIRouter(prefix="/recommendations", tags=["recommendations"])
API_KEY = os.getenv("TMDB_API_KEY") or settings.TMDB_API_KEY

class RecFilters(BaseModel):
    genres: List[int] = []
    genre_mode: str = "or"
    year_min: Optional[int] = None
    year_max: Optional[int] = None
    vote_min: Optional[float] = None
    runtime_min: Optional[int] = None
    runtime_max: Optional[int] = None
    country: Optional[str] = None
    preference: str = "popular"
    weight_genres: int = 2

class RecRequest(BaseModel):
    mode: str 
    target_type: str 
    use_favorites: bool = True
    filters: Optional[RecFilters] = None

# --- HELPERY ---

async def fetch_discover(client, endpoint: str, params: dict) -> List[dict]:
    results = []
    base_url = f"{settings.TMDB_BASE_URL}{endpoint}"
    for page in range(1, 5):
        p = params.copy()
        p["page"] = page
        try:
            resp = await client.get(base_url, params=p)
            if resp.status_code == 200:
                results.extend(resp.json().get("results", []))
        except: pass
    return results

async def fetch_details_and_update(client, item):
    media_type = item.get("media_type", "movie")
    item_id = item.get("id")
    url = f"{settings.TMDB_BASE_URL}/{media_type}/{item_id}"
    params = {"api_key": API_KEY, "language": "pl-PL"}
    try:
        resp = await client.get(url, params=params)
        if resp.status_code == 200:
            data = resp.json()
            if "runtime" in data:
                item["runtime"] = data["runtime"]
            elif "episode_run_time" in data and data["episode_run_time"]:
                item["runtime"] = data["episode_run_time"][0]
            else: item["runtime"] = 0
    except: item["runtime"] = 0
    return item

def get_year_from_item(item):
    d = item.get("release_date") or item.get("first_air_date")
    if d and len(d) >= 4:
        try: return int(d[:4])
        except: return 0
    return 0

def calculate_score(item, user_profile, filters: RecFilters, mode: str):
    score = 0.0
    pop = item.get("popularity", 0)
    vote = item.get("vote_average", 0)
    
    # 1. Scoring podstawowy
    if filters.preference == "niche":
        score += (vote * 10)
        score -= (pop / 2) # Kara za popularność
    else:
        score += (vote * 3) + (min(pop, 200) / 10.0)

    # 2. Profil Użytkownika (ZNACZNIE ZWIĘKSZONA WAGA)
    if user_profile and user_profile.get("top_genres"):
        item_genres = set(item.get("genre_ids", []))
        common = item_genres.intersection(user_profile["top_genres"])
        if common:
            score += 5.0 # Bonus za samo trafienie w gust
            score += len(common) * 10.0 # +10 pkt za każdy pasujący gatunek (wcześniej 5)

    # 3. Bonusy Manualne (z formularza)
    if mode == "advanced" and filters and filters.genres:
        item_genres = set(item.get("genre_ids", []))
        common_manual = item_genres.intersection(set(filters.genres))
        score += len(common_manual) * 3

    score += random.uniform(0, 3.0)
    return score

@router.post("/generate")
async def generate_recommendations(
    req: RecRequest, 
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    session_id = request.session.get("session_id")
    user_profile = {"top_genres": set()}
    fav_ids = set()

    if session_id and req.use_favorites:
        stmt = select(FavoriteMovie).where(FavoriteMovie.user_session_id == session_id)
        result = await db.execute(stmt)
        favorites = result.scalars().all()
        all_genres = []
        for f in favorites:
            fav_ids.add(f.tmdb_id)
            try:
                g = json.loads(f.genres_json)
                all_genres.extend(g)
            except: pass
        user_profile["top_genres"] = {x[0] for x in Counter(all_genres).most_common(5)}

    preference = "popular"
    if req.mode == "advanced" and req.filters:
        preference = req.filters.preference

    api_params = {
        "api_key": API_KEY, "language": "pl-PL", 
        "include_adult": "false"
    }

    if preference == "niche":
        api_params["sort_by"] = "vote_average.desc"
        api_params["vote_count.gte"] = 20
        api_params["vote_count.lte"] = 700
        api_params["popularity.lte"] = 20
    else:
        api_params["sort_by"] = "popularity.desc"
        api_params["vote_count.gte"] = 100

    if req.mode == "quick" and user_profile["top_genres"]:
        api_params["with_genres"] = "|".join(map(str, user_profile["top_genres"]))

    elif req.mode == "advanced" and req.filters:
        f = req.filters
        if f.genres:
            separator = "," if f.genre_mode == "and" else "|"
            api_params["with_genres"] = separator.join(map(str, f.genres))
        
        if f.year_min:
            api_params["primary_release_date.gte"] = f"{f.year_min:04d}-01-01"
            api_params["first_air_date.gte"] = f"{f.year_min:04d}-01-01"
        if f.year_max:
            api_params["primary_release_date.lte"] = f"{f.year_max:04d}-12-31"
            api_params["first_air_date.lte"] = f"{f.year_max:04d}-12-31"
        
        if f.vote_min: api_params["vote_average.gte"] = f.vote_min
        if f.country: api_params["with_origin_country"] = f.country
        if f.runtime_min: api_params["with_runtime.gte"] = f.runtime_min
        if f.runtime_max: api_params["with_runtime.lte"] = f.runtime_max

    candidates = []
    async with httpx.AsyncClient(timeout=15.0) as client:
        tasks = []
        if req.target_type in ["movie", "both"]:
            tasks.append(fetch_discover(client, "/discover/movie", api_params))
        if req.target_type in ["tv", "both"]:
            tasks.append(fetch_discover(client, "/discover/tv", api_params))
        
        res_list = await asyncio.gather(*tasks)
        
        idx = 0
        if req.target_type in ["movie", "both"] and idx < len(res_list):
             for item in res_list[idx]: item["media_type"] = "movie"
             candidates.extend(res_list[idx])
             idx += 1
        if req.target_type in ["tv", "both"] and idx < len(res_list):
             for item in res_list[idx]: item["media_type"] = "tv"
             candidates.extend(res_list[idx])
             idx += 1

    scored_items = []
    seen_ids = set()
    filters = req.filters or RecFilters()

    for item in candidates:
        mid = item.get("id")
        if not mid or mid in fav_ids or mid in seen_ids: continue
        if not item.get("poster_path"): continue

        if preference == "niche":
            if item.get("popularity", 0) > 15: continue
            if item.get("vote_count", 0) > 800: continue

        if req.mode == "advanced":
            item_year = get_year_from_item(item)
            if filters.year_min and item_year < filters.year_min: continue
            if filters.year_max and item_year > filters.year_max: continue
            if filters.vote_min and item.get("vote_average", 0) < filters.vote_min: continue
            
            if filters.genres and filters.genre_mode == "and":
                item_genres = set(item.get("genre_ids", []))
                if not set(filters.genres).issubset(item_genres): continue

        seen_ids.add(mid)
        score = calculate_score(item, user_profile, filters, req.mode)
        scored_items.append((score, item))

    scored_items.sort(key=lambda x: x[0], reverse=True)
    
    if not scored_items:
        return {"results": []}

    top_3 = scored_items[:3]
    pool_size = 60
    tail_candidates = scored_items[3:3+pool_size] 
    random.shuffle(tail_candidates)
    random_17 = tail_candidates[:17] 
    
    final_list_raw = top_3 + random_17

    final_results = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        tasks = [fetch_details_and_update(client, item[1]) for item in final_list_raw]
        updated_items = await asyncio.gather(*tasks)
        
        for item in updated_items:
            title = item.get("title") or item.get("name")
            final_results.append({
                "id": item.get("id"), 
                "title": title, 
                "poster_path": item.get("poster_path"),
                "vote_average": item.get("vote_average"),
                "release_date": item.get("release_date") or item.get("first_air_date"),
                "media_type": item.get("media_type"),
                "runtime": item.get("runtime", 0)
            })

    return {"results": final_results}