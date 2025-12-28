from fastapi import APIRouter, Request, Path, HTTPException, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import httpx
import os
import json

from app.db.database import get_db
from app.db.models import FavoriteMovie
from app.core.config import settings

router = APIRouter(prefix="/user")
API_KEY = os.getenv("TMDB_API_KEY") or settings.TMDB_API_KEY
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

@router.get("/status")
async def status(request: Request):
    return {"logged_in": bool(request.session.get("session_id"))}

# --- Wyświetlanie Ulubionych (z lokalnej bazy) ---
@router.get("/favorites")
async def favorites_page(request: Request):
    # Prosta walidacja sesji
    if not request.session.get("session_id"):
        return RedirectResponse(url="/auth/login")
    return templates.TemplateResponse("favorites.html", {"request": request})

@router.get("/favorites.json")
async def favorites_json(request: Request, db: AsyncSession = Depends(get_db)):
    session_id = request.session.get("session_id")
    if not session_id:
        return JSONResponse({"favorites": []})

    # Pobieramy z lokalnej bazy SQLite
    result = await db.execute(
        select(FavoriteMovie).where(FavoriteMovie.user_session_id == session_id)
    )
    favorites = result.scalars().all()

    # Konwertujemy obiekty bazy na słownik
    out = []
    for f in favorites:
        out.append({
            "id": f.tmdb_id, # Frontend oczekuje ID TMDB
            "title": f.title,
            "poster_path": f.poster_path,
            "vote_average": f.vote_average,
            "release_date": f.release_date,
            "media_type": f.media_type
        })
    
    return JSONResponse({"favorites": out})


# --- Dodawanie/Usuwanie (Logika Hybrydowa) ---
@router.post("/favorite/{tmdb_id}")
async def toggle_favorite(
    request: Request, 
    tmdb_id: int = Path(...), 
    db: AsyncSession = Depends(get_db)
):
    session_id = request.session.get("session_id")
    if not session_id:
        raise HTTPException(status_code=401, detail="Not logged in")

    # 1. Sprawdź czy już jest w bazie
    result = await db.execute(
        select(FavoriteMovie).where(
            FavoriteMovie.user_session_id == session_id,
            FavoriteMovie.tmdb_id == tmdb_id
        )
    )
    existing_movie = result.scalar_one_or_none()

    if existing_movie:
        # USUWANIE
        await db.delete(existing_movie)
        await db.commit()
        return JSONResponse({"removed": True, "added": False})
    
    else:
        # DODAWANIE: Pobieramy rozszerzone dane
        
        # Próba zgadnięcia typu (najpierw movie, potem tv)
        # Idealnie frontend powinien to wysyłać, ale obsłużymy to backendowo
        media_type = "movie"
        
        # Zapytanie o Film + Credits + Keywords
        url = f"{settings.TMDB_BASE_URL}/movie/{tmdb_id}?api_key={API_KEY}&language=pl-PL&append_to_response=credits,keywords"
        
        async with httpx.AsyncClient() as client:
            resp = await client.get(url)
            
            # Jeśli nie znaleziono filmu, szukamy serialu
            if resp.status_code != 200:
                url = f"{settings.TMDB_BASE_URL}/tv/{tmdb_id}?api_key={API_KEY}&language=pl-PL&append_to_response=credits,keywords"
                resp = await client.get(url)
                media_type = "tv"
                if resp.status_code != 200:
                     raise HTTPException(status_code=404, detail="Media not found in TMDb")
            
            data = resp.json()
        
        # --- EKSTRAKCJA DANYCH ---
        
        # Podstawowe
        title = data.get("title") or data.get("name")
        date = data.get("release_date") or data.get("first_air_date")
        poster = data.get("poster_path")
        rating = data.get("vote_average", 0.0)
        vote_count = data.get("vote_count", 0)
        popularity = data.get("popularity", 0.0)
        original_language = data.get("original_language")

        # Czas trwania
        runtime = 0
        if media_type == "movie":
            runtime = data.get("runtime") or 0
        else:
            # Dla seriali bierzemy średni czas lub czas pierwszego odcinka
            runtimes = data.get("episode_run_time", [])
            runtime = runtimes[0] if runtimes else 0

        # Gatunki (Lista ID)
        genres = [g["id"] for g in data.get("genres", [])]

        # Słowa kluczowe (Keywords)
        # Struktura dla filmu: data['keywords']['keywords']
        # Struktura dla TV: data['keywords']['results']
        keywords_raw = data.get("keywords", {})
        kw_list = keywords_raw.get("keywords", []) if "keywords" in keywords_raw else keywords_raw.get("results", [])
        keywords = [k["id"] for k in kw_list]

        # Obsada (Cast) - bierzemy top 10 aktorów
        credits = data.get("credits", {})
        cast_raw = credits.get("cast", [])
        cast = [p["id"] for p in cast_raw[:10]]

        # Reżyserzy / Twórcy
        directors = []
        if media_type == "movie":
            crew = credits.get("crew", [])
            directors = [p["id"] for p in crew if p.get("job") == "Director"]
        else:
            created_by = data.get("created_by", [])
            directors = [p["id"] for p in created_by]
            
        # Kraje produkcji
        countries = [c["iso_3166_1"] for c in data.get("production_countries", [])]

        # ZAPIS DO BAZY
        new_fav = FavoriteMovie(
            user_session_id=session_id,
            tmdb_id=tmdb_id,
            media_type=media_type,
            title=title,
            poster_path=poster,
            release_date=date,
            vote_average=rating,
            
            # Nowe statystyki
            vote_count=vote_count,
            popularity=popularity,
            runtime=runtime,
            original_language=original_language,
            
            # JSONy
            genres_json=json.dumps(genres),
            keywords_json=json.dumps(keywords),
            cast_json=json.dumps(cast),
            directors_json=json.dumps(directors),
            production_countries_json=json.dumps(countries)
        )
        
        db.add(new_fav)
        await db.commit()
        
        return JSONResponse({"removed": False, "added": True})