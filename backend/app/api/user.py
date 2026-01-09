from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import json
import os
from collections import Counter
import httpx 

from app.db.database import get_db
from app.db.models import FavoriteMovie
from app.core.templates import templates
from app.core.config import settings

router = APIRouter(prefix="/user", tags=["user"])

API_KEY = os.getenv("TMDB_API_KEY") or settings.TMDB_API_KEY
BASE_URL = settings.TMDB_BASE_URL

GENRE_MAP = {
    28: "Akcja", 12: "Przygodowy", 16: "Animacja", 35: "Komedia", 80: "Kryminał",
    99: "Dokument", 18: "Dramat", 10751: "Familijny", 14: "Fantasy", 36: "Historyczny",
    27: "Horror", 10402: "Muzyczny", 9648: "Tajemnica", 10749: "Romans", 878: "Sci-Fi",
    10770: "Film TV", 53: "Thriller", 10752: "Wojenny", 37: "Western"
}

@router.get("/favorites")
async def favorites_page(request: Request):
    return templates.TemplateResponse("favorites.html", {"request": request})

@router.get("/favorites.json")
async def get_favorites_json(request: Request, db: AsyncSession = Depends(get_db)):
    session_id = request.session.get("session_id")
    if not session_id:
        return {"favorites": []} 
        
    stmt = select(FavoriteMovie).where(FavoriteMovie.user_session_id == session_id)
    result = await db.execute(stmt)
    favorites = result.scalars().all()
    
    out = []
    for f in favorites:
        out.append({
            "id": f.tmdb_id,
            "title": f.title,
            "poster_path": f.poster_path,
            "vote_average": f.vote_average,
            "release_date": f.release_date,
            "media_type": f.media_type,
            "runtime": f.runtime
        })
    return {"favorites": out}

@router.post("/favorite/{tmdb_id}")
async def toggle_favorite(
    tmdb_id: int, 
    request: Request, 
    db: AsyncSession = Depends(get_db)
):
    session_id = request.session.get("session_id")
    if not session_id:
        raise HTTPException(status_code=401, detail="Not logged in")

    stmt = select(FavoriteMovie).where(
        FavoriteMovie.user_session_id == session_id,
        FavoriteMovie.tmdb_id == tmdb_id
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        await db.delete(existing)
        await db.commit()
        return {"removed": True}
    else:
        title = "Nieznany"
        poster = ""
        date = ""
        vote = 0.0
        m_type = "movie"
        runtime = 0
        genre_ids = []
        director_ids = [] # Lista ID reżyserów

        try:
            async with httpx.AsyncClient() as client:
                # Dodajemy append_to_response, żeby pobrać ekipę (credits) w jednym strzale
                params = {
                    "api_key": API_KEY, 
                    "language": "pl-PL",
                    "append_to_response": "credits"
                }
                
                resp = await client.get(f"{BASE_URL}/movie/{tmdb_id}", params=params)
                
                if resp.status_code != 200:
                    m_type = "tv"
                    resp = await client.get(f"{BASE_URL}/tv/{tmdb_id}", params=params)
                
                if resp.status_code == 200:
                    data = resp.json()
                    
                    title = data.get("title") or data.get("name") or "Bez tytułu"
                    poster = data.get("poster_path")
                    date = data.get("release_date") or data.get("first_air_date")
                    vote = data.get("vote_average") or 0.0
                    
                    genres_data = data.get("genres", [])
                    genre_ids = [g["id"] for g in genres_data]
                    
                    if "runtime" in data:
                        runtime = data["runtime"] or 0
                    elif "episode_run_time" in data and data["episode_run_time"]:
                        runtime = data["episode_run_time"][0]

                    # Ekstrakcja Reżyserów / Twórców
                    if m_type == "movie":
                        crew = data.get("credits", {}).get("crew", [])
                        director_ids = [m['id'] for m in crew if m.get("job") == "Director"]
                    else:
                        # W serialach są "created_by"
                        created_by = data.get("created_by", [])
                        director_ids = [p['id'] for p in created_by]

                else:
                    print(f"BŁĄD TMDB API: Status {resp.status_code} dla ID {tmdb_id}")

        except Exception as e:
            print(f"WYJĄTEK W TOGGLE_FAVORITE: {e}")

        new_fav = FavoriteMovie(
            user_session_id=session_id,
            tmdb_id=tmdb_id,
            media_type=m_type,
            title=title,
            poster_path=poster,
            release_date=date,
            vote_average=vote,
            runtime=runtime,
            genres_json=json.dumps(genre_ids),
            directors_json=json.dumps(director_ids) # Zapisujemy reżyserów
        )
        db.add(new_fav)
        await db.commit()
        return {"removed": False, "added": True}

@router.get("/stats")
async def get_user_stats(request: Request, db: AsyncSession = Depends(get_db)):
    session_id = request.session.get("session_id")
    if not session_id:
        return {"count": 0, "top_genre": "Brak danych", "avg_rating": 0, "avg_runtime": "0 min"}

    stmt = select(FavoriteMovie).where(FavoriteMovie.user_session_id == session_id)
    result = await db.execute(stmt)
    movies = result.scalars().all()

    count = len(movies)
    if count == 0:
        return {"count": 0, "top_genre": "Brak danych", "avg_rating": 0, "avg_runtime": "0 min"}

    all_genres = []
    total_rating = 0
    total_runtime = 0
    valid_ratings = 0
    valid_runtimes = 0

    for m in movies:
        if m.vote_average:
            total_rating += m.vote_average
            valid_ratings += 1
        
        if m.runtime and m.runtime > 0:
            total_runtime += m.runtime
            valid_runtimes += 1
            
        try:
            if m.genres_json:
                g_list = json.loads(m.genres_json)
                for g_id in g_list:
                    if g_id in GENRE_MAP:
                        all_genres.append(GENRE_MAP[g_id])
        except: pass

    top_genre_str = "Mieszany"
    if all_genres:
        most_common = Counter(all_genres).most_common(1)
        if most_common:
            g_name = most_common[0][0]
            g_count = most_common[0][1]
            percent = int((g_count / len(all_genres)) * 100)
            top_genre_str = f"{g_name} ({percent}%)"

    avg_rating = 0
    if valid_ratings > 0:
        avg_rating = round(total_rating / valid_ratings, 1)

    avg_runtime_str = "0 min"
    if valid_runtimes > 0:
        avg_min = int(total_runtime / valid_runtimes)
        h = avg_min // 60
        m = avg_min % 60
        if h > 0:
            avg_runtime_str = f"{h}h {m}min"
        else:
            avg_runtime_str = f"{m} min"

    return {
        "count": count,
        "top_genre": top_genre_str,
        "avg_rating": avg_rating,
        "avg_runtime": avg_runtime_str
    }