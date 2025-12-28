from fastapi import APIRouter, Request, Path, HTTPException
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, JSONResponse
import httpx
import os

router = APIRouter(prefix="/user")
API_KEY = os.getenv("TMDB_API_KEY") or "TWÓJ_API_KEY"

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend/app
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

@router.get("/status")
async def status(request: Request):
    """Zwraca status zalogowania."""
    return {"logged_in": bool(request.session.get("session_id"))}

@router.get("/favorites")
async def favorites_page(request: Request):
    session_id = request.session.get("session_id")
    if not session_id:
        return RedirectResponse(url="/auth/login")

    async with httpx.AsyncClient() as client:
        acc = await client.get(f"https://api.themoviedb.org/3/account?api_key={API_KEY}&session_id={session_id}")
        account = acc.json()
        account_id = account.get("id")
        fav = await client.get(f"https://api.themoviedb.org/3/account/{account_id}/favorite/movies?api_key={API_KEY}&session_id={session_id}&language=pl-PL")
        results = fav.json().get("results", [])

    favorites = [
        {
            "id": m["id"],
            "title": m.get("title") or m.get("name"),
            "poster": f"https://image.tmdb.org/t/p/w200{m['poster_path']}" if m.get("poster_path") else "https://via.placeholder.com/150",
            "rating": m.get("vote_average")
        }
        for m in results
    ]

    return templates.TemplateResponse("favorites.html", {"request": request, "favorites": favorites})

@router.get("/favorites.json")
async def favorites_json(request: Request):
    # zwraca JSON listy favorite ids/obiektów (dla JS)
    session_id = request.session.get("session_id")
    if not session_id:
        return JSONResponse({"favorites": []})
    async with httpx.AsyncClient() as client:
        acc = await client.get(f"https://api.themoviedb.org/3/account?api_key={API_KEY}&session_id={session_id}")
        account_id = acc.json().get("id")
        fav = await client.get(f"https://api.themoviedb.org/3/account/{account_id}/favorite/movies?api_key={API_KEY}&session_id={session_id}&language=pl-PL")
        results = fav.json().get("results", [])

    favorites = [
        {"id": m["id"], "title": m.get("title") or m.get("name"), "poster_path": m.get("poster_path"), "vote_average": m.get("vote_average")}
        for m in results
    ]
    return JSONResponse({"favorites": favorites})


@router.post("/favorite/{movie_id}")
async def toggle_favorite(request: Request, movie_id: int = Path(...)):
    session_id = request.session.get("session_id")
    if not session_id:
        raise HTTPException(status_code=401, detail="Not logged in")

    async with httpx.AsyncClient() as client:
        acc = await client.get(f"https://api.themoviedb.org/3/account?api_key={API_KEY}&session_id={session_id}")
        account_id = acc.json().get("id")

        fav = await client.get(f"https://api.themoviedb.org/3/account/{account_id}/favorite/movies?api_key={API_KEY}&session_id={session_id}")
        current = [m["id"] for m in fav.json().get("results", [])]
        is_fav = movie_id in current

        payload = {"media_type": "movie", "media_id": movie_id, "favorite": not is_fav}
        resp = await client.post(
            f"https://api.themoviedb.org/3/account/{account_id}/favorite?api_key={API_KEY}&session_id={session_id}",
            json=payload
        )

    # TMDb zwraca success — ale i tak zwracamy prosty status
    return JSONResponse({"removed": is_fav, "added": not is_fav})