from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
import httpx
import os

router = APIRouter(prefix="/auth/tmdb", tags=["tmdb"])

API_KEY = "66b95deb3a09acabefbc864a233dd86c"  # w przyszłości wrzuć do .env
TMDB_BASE = "https://api.themoviedb.org/3"

# 1. Start – pobierz request_token i przekieruj do TMDb
@router.get("/login")
async def tmdb_login():
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{TMDB_BASE}/authentication/token/new?api_key={API_KEY}")
        token = resp.json()["request_token"]

    redirect_url = f"https://www.themoviedb.org/authenticate/{token}?redirect_to=http://127.0.0.1:8000/auth/tmdb/callback"
    return RedirectResponse(url=redirect_url)


# 2. Callback – TMDb odsyła tu po akceptacji logowania
@router.get("/callback")
async def tmdb_callback(request: Request, request_token: str):
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{TMDB_BASE}/authentication/session/new?api_key={API_KEY}", json={"request_token": request_token})
        session_id = resp.json()["session_id"]

        # pobierz account_id
        account_resp = await client.get(f"{TMDB_BASE}/account?api_key={API_KEY}&session_id={session_id}")
        account_id = account_resp.json()["id"]

    # zapisujemy do sesji FastAPI (Starlette)
    request.session["tmdb_session"] = session_id
    request.session["tmdb_account_id"] = account_id

    return RedirectResponse(url="/")  # wracamy na stronę główną
