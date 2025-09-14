from fastapi import APIRouter, Request, Query
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
import httpx
import os

router = APIRouter(prefix="/auth")

load_dotenv()

API_KEY = os.getenv("TMDB_API_KEY")
SECRET_KEY = os.getenv("SECRET_KEY")
print(API_KEY)  # debug

@router.get("/login")
async def login(request: Request):
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.themoviedb.org/3/authentication/token/new?api_key={API_KEY}"
        )
        print("resp status", resp.status_code, resp.text)  # debug
        data = resp.json()
    request_token = data.get("request_token")
    if not request_token:
        return {"error": "Brak tokenu", "resp": data}
    request.session["request_token"] = request_token
    redirect_url = f"https://www.themoviedb.org/authenticate/{request_token}?redirect_to=http://127.0.0.1:8000/auth/callback"
    return RedirectResponse(redirect_url)

@router.get("/callback")
async def callback(request: Request, request_token: str = Query(...)):
    """
    TMDB przekierowuje tu po zalogowaniu usera.
    W URL jest ?request_token=XXXX
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://api.themoviedb.org/3/authentication/session/new?api_key={API_KEY}",
            json={"request_token": request_token}
        )
        data = resp.json()

    if not resp.is_success or "session_id" not in data:
        # coś poszło nie tak – możesz zalogować błąd
        return RedirectResponse(url="/auth/login", status_code=303)

    session_id = data["session_id"]
    # zapisz w sesji fastapi/starlette
    request.session["session_id"] = session_id

    return RedirectResponse(url="/", status_code=303)

@router.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/")
