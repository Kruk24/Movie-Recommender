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
    mood: Optional[str] = None
    provider: Optional[str] = None
    weight_genres: int = 2

class RecRequest(BaseModel):
    mode: str 
    target_type: str 
    use_favorites: bool = True
    filters: Optional[RecFilters] = None

# --- MAPA NASTROJÓW ---
MOOD_MAP = {
    "laugh": [35, 16, 10751],
    "scary": [27, 9648, 53],
    "adrenaline": [28, 12, 10752],
    "cry": [18, 10749],
    "think": [99, 36, 878]
}

async def fetch_discover(client, endpoint: str, params: dict) -> List[dict]:
    results = []
    base_url = f"{settings.TMDB_BASE_URL}{endpoint}"
    # Zwiększamy liczbę stron do przeszukania, aby po ostrym filtrowaniu coś zostało
    for page in range(1, 6): 
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
    try:
        url = f"{settings.TMDB_BASE_URL}/{media_type}/{item_id}"
        params = {"api_key": API_KEY, "language": "pl-PL"}
        resp = await client.get(url, params=params)
        
        if resp.status_code == 200:
            data = resp.json()
            # Ujednolicenie pola runtime
            if "runtime" in data:
                item["runtime"] = data["runtime"]
            elif "episode_run_time" in data and data["episode_run_time"]:
                item["runtime"] = data["episode_run_time"][0]
            else:
                item["runtime"] = 0
        else:
            item["runtime"] = 0
    except:
        item["runtime"] = 0
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
    
    if filters.preference == "niche":
        score += (vote * 10)
        score -= (pop / 2)
    else:
        score += (vote * 3) + (min(pop, 200) / 10.0)

    if user_profile:
        # A. Gatunki
        if user_profile.get("top_genres"):
            item_genres = set(item.get("genre_ids", []))
            common = item_genres.intersection(user_profile["top_genres"])
            if common:
                score += 5.0 + (len(common) * 8.0)

        # B. Zgodność Ocen
        avg_user_vote = user_profile.get("avg_vote")
        if avg_user_vote and avg_user_vote > 0:
            diff = abs(vote - avg_user_vote)
            affinity_bonus = max(0, 10.0 - (diff * 2))
            score += affinity_bonus

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
    
    user_profile = {
        "top_genres": set(),
        "top_directors": set(),
        "avg_vote": 0.0
    }
    fav_ids = set()

    # KROK 1: Analiza Ulubionych
    if session_id and req.use_favorites:
        stmt = select(FavoriteMovie).where(FavoriteMovie.user_session_id == session_id)
        result = await db.execute(stmt)
        favorites = result.scalars().all()
        
        all_genres = []
        all_directors = []
        total_vote = 0
        vote_count = 0

        for f in favorites:
            fav_ids.add(f.tmdb_id)
            try:
                g = json.loads(f.genres_json)
                all_genres.extend(g)
            except: pass
            
            try:
                if hasattr(f, 'directors_json') and f.directors_json:
                    d = json.loads(f.directors_json)
                    all_directors.extend(d)
            except: pass

            if f.vote_average:
                total_vote += f.vote_average
                vote_count += 1

        if all_genres:
            user_profile["top_genres"] = {x[0] for x in Counter(all_genres).most_common(5)}
        if all_directors:
            user_profile["top_directors"] = {x[0] for x in Counter(all_directors).most_common(3)}
        if vote_count > 0:
            user_profile["avg_vote"] = total_vote / vote_count

    # KROK 2: Parametry API
    preference = "popular"
    mood_genres = []
    
    filters = req.filters or RecFilters() # Pobieramy filtry do zmiennej

    if req.mode == "advanced" and req.filters:
        preference = req.filters.preference
        if req.filters.mood and req.filters.mood in MOOD_MAP:
            mood_genres = MOOD_MAP[req.filters.mood]

    api_params = {
        "api_key": API_KEY, "language": "pl-PL", 
        "include_adult": "false"
    }

    if req.mode == "advanced" and req.filters and req.filters.provider:
        api_params["with_watch_providers"] = req.filters.provider
        api_params["watch_region"] = "PL"

    if preference == "niche":
        api_params["sort_by"] = "vote_average.desc"
        api_params["vote_count.gte"] = 15
        api_params["vote_count.lte"] = 500
        api_params["popularity.lte"] = 10
    else:
        api_params["sort_by"] = "popularity.desc"
        api_params["vote_count.gte"] = 100

    final_genres = []
    if req.mode == "quick" and user_profile["top_genres"]:
        final_genres.extend(list(user_profile["top_genres"]))
    elif req.mode == "advanced" and req.filters:
        if req.filters.genres: final_genres.extend(req.filters.genres)
        if mood_genres: final_genres.extend(mood_genres)
        
        if req.filters.year_min:
            api_params["primary_release_date.gte"] = f"{req.filters.year_min:04d}-01-01"
            api_params["first_air_date.gte"] = f"{req.filters.year_min:04d}-01-01"
        if req.filters.year_max:
            api_params["primary_release_date.lte"] = f"{req.filters.year_max:04d}-12-31"
            api_params["first_air_date.lte"] = f"{req.filters.year_max:04d}-12-31"
        if req.filters.vote_min: api_params["vote_average.gte"] = req.filters.vote_min
        if req.filters.country: api_params["with_origin_country"] = req.filters.country
        
        # Filtrujemy też po stronie API (Soft Filter - ogranicza pulę)
        if req.filters.runtime_min: api_params["with_runtime.gte"] = req.filters.runtime_min
        if req.filters.runtime_max: api_params["with_runtime.lte"] = req.filters.runtime_max

    if final_genres:
        unique_genres = list(set(final_genres))
        separator = "," if (req.filters and req.filters.genre_mode == "and" and not mood_genres) else "|"
        api_params["with_genres"] = separator.join(map(str, unique_genres))

    # KROK 3: Pobieranie Kandydatów
    candidates = []
    async with httpx.AsyncClient(timeout=15.0) as client:
        tasks = []
        if req.target_type in ["movie", "both"]:
            tasks.append(fetch_discover(client, "/discover/movie", api_params))
        if req.target_type in ["tv", "both"]:
            tasks.append(fetch_discover(client, "/discover/tv", api_params))
            
        if user_profile["top_directors"]:
            directors_str = "|".join(map(str, user_profile["top_directors"]))
            dir_params = api_params.copy()
            dir_params.pop("with_genres", None) 
            dir_params["with_crew"] = directors_str
            if req.target_type in ["movie", "both"]:
                tasks.append(fetch_discover(client, "/discover/movie", dir_params))
        
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

    # KROK 4: Punktacja i Pierwsze Filtrowanie (bez detali)
    scored_items = []
    seen_ids = set()

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
            
            item_genres = set(item.get("genre_ids", []))
            if mood_genres:
                if not set(mood_genres).intersection(item_genres): continue
            if filters.genres and filters.genre_mode == "and":
                if not set(filters.genres).issubset(item_genres): continue

        seen_ids.add(mid)
        score = calculate_score(item, user_profile, filters, req.mode)
        scored_items.append((score, item))

    scored_items.sort(key=lambda x: x[0], reverse=True)
    
    if not scored_items:
        return {"results": []}

    # Bierzemy większą pulę do sprawdzenia detali, bo Hard Filter może odrzucić wiele filmów
    top_candidates = scored_items[:30] # Zwiększamy pulę z 20 do 30
    
    final_results = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        # Pobieramy pełne detale (w tym dokładny runtime)
        tasks = [fetch_details_and_update(client, item[1]) for item in top_candidates]
        updated_items = await asyncio.gather(*tasks)
        
        for item in updated_items:
            # --- HARD FILTER CZASU TRWANIA ---
            # To jest kluczowa zmiana. Sprawdzamy dokładny czas po pobraniu detali.
            # Jeśli film nie mieści się w widełkach, nie dodajemy go do final_results.
            
            if req.mode == "advanced":
                r_val = item.get("runtime", 0)
                # Sprawdzamy tylko jeśli runtime > 0 (żeby nie wycinać filmów z brakiem danych, chyba że chcesz ostro)
                # Zakładamy, że jak 0 to przepuszczamy, albo odrzucamy - tu wersja "Soft na brak danych"
                if r_val > 0:
                    if filters.runtime_min and r_val < filters.runtime_min: continue
                    if filters.runtime_max and r_val > filters.runtime_max: continue
            
            # -------------------------------

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

    # Ponieważ mogliśmy odrzucić filmy, lista może być krótsza niż 20.
    # Jeśli chcesz zawsze 20, trzeba by pobierać więcej w pętli, ale to skomplikuje kod.
    # Obecna wersja zwraca to, co przeszło przez filtr (max 30).
    
    return {"results": final_results}