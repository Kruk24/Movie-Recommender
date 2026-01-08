from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import json
from collections import Counter

from app.db.database import get_db
# POPRAWKA: Usunięto 'UserSession' z importu, bo nie używamy modelu sesji w bazie
from app.db.models import FavoriteMovie 

router = APIRouter(prefix="/user", tags=["user"])

# Mapa ID gatunków TMDB na nazwy polskie
GENRE_MAP = {
    28: "Akcja", 12: "Przygodowy", 16: "Animacja", 35: "Komedia", 80: "Kryminał",
    99: "Dokument", 18: "Dramat", 10751: "Familijny", 14: "Fantasy", 36: "Historyczny",
    27: "Horror", 10402: "Muzyczny", 9648: "Tajemnica", 10749: "Romans", 878: "Sci-Fi",
    10770: "Film TV", 53: "Thriller", 10752: "Wojenny", 37: "Western"
}

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
            "media_type": f.media_type
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
        # Pobieranie danych filmu w tle dla statystyk
        from app.core.config import settings
        import httpx
        
        API_KEY = settings.TMDB_API_KEY
        BASE_URL = settings.TMDB_BASE_URL
        
        genre_ids = []
        title = "Nieznany"
        poster = ""
        date = ""
        vote = 0.0
        m_type = "movie"

        async with httpx.AsyncClient() as client:
            # Najpierw sprawdzamy film
            resp = await client.get(f"{BASE_URL}/movie/{tmdb_id}?api_key={API_KEY}")
            if resp.status_code != 200:
                # Jak nie film, to serial
                resp = await client.get(f"{BASE_URL}/tv/{tmdb_id}?api_key={API_KEY}")
                m_type = "tv"
            
            if resp.status_code == 200:
                data = resp.json()
                title = data.get("title") or data.get("name")
                poster = data.get("poster_path")
                date = data.get("release_date") or data.get("first_air_date")
                vote = data.get("vote_average")
                genres_data = data.get("genres", [])
                genre_ids = [g["id"] for g in genres_data]

        new_fav = FavoriteMovie(
            user_session_id=session_id,
            tmdb_id=tmdb_id,
            media_type=m_type,
            title=title,
            poster_path=poster,
            release_date=date,
            vote_average=vote,
            genres_json=json.dumps(genre_ids)
        )
        db.add(new_fav)
        await db.commit()
        return {"removed": False, "added": True}

@router.get("/stats")
async def get_user_stats(request: Request, db: AsyncSession = Depends(get_db)):
    session_id = request.session.get("session_id")
    if not session_id:
        return {"count": 0, "top_genre": "Brak danych", "avg_rating": 0}

    stmt = select(FavoriteMovie).where(FavoriteMovie.user_session_id == session_id)
    result = await db.execute(stmt)
    movies = result.scalars().all()

    if not movies:
        return {"count": 0, "top_genre": "Brak danych", "avg_rating": 0}

    all_genres = []
    total_rating = 0
    valid_ratings = 0

    for m in movies:
        if m.vote_average:
            total_rating += m.vote_average
            valid_ratings += 1
            
        try:
            if m.genres_json:
                g_list = json.loads(m.genres_json)
                for g_id in g_list:
                    if g_id in GENRE_MAP:
                        all_genres.append(GENRE_MAP[g_id])
        except: pass

    top_genre = "Mieszany"
    if all_genres:
        most_common = Counter(all_genres).most_common(1)
        if most_common:
            top_genre = most_common[0][0]

    avg_rating = 0
    if valid_ratings > 0:
        avg_rating = round(total_rating / valid_ratings, 1)

    return {
        "count": len(movies),
        "top_genre": top_genre,
        "avg_rating": avg_rating
    }