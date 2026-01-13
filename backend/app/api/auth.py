from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import RedirectResponse
import httpx
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

@router.get("/login")
async def login_via_tmdb(request: Request):
    """
    Krok 1: Generowanie tokena i przekierowanie do TMDB.
    """
    # Używamy klienta z nagłówkami (User-Agent), żeby uniknąć błędu 403
    async with httpx.AsyncClient(headers=settings.TMDB_HEADERS) as client:
        try:
            resp = await client.get(
                f"{settings.TMDB_BASE_URL}/authentication/token/new", 
                params={"api_key": settings.TMDB_API_KEY}
            )
            data = resp.json()
            if not data.get("success"):
                # Logujemy błąd, jeśli token nie został wygenerowany
                print(f"TMDB Token Error: {data}")
                raise HTTPException(status_code=500, detail="TMDB token error")
            
            request_token = data["request_token"]
            
            # 2. Budujemy URL powrotny (callback)
            redirect_uri = str(request.url_for("auth_callback"))
            
            # --- FIX DLA RENDERA (wymuszenie HTTPS) ---
            # Render stoi za proxy, więc aplikacja może widzieć 'http', a wymagane jest 'https'
            # Jeśli adres zawiera domenę onrender.com i zaczyna się od http, zmieniamy na https
            if "onrender.com" in redirect_uri and redirect_uri.startswith("http://"):
                redirect_uri = redirect_uri.replace("http://", "https://", 1)
            
            # 3. Przekierowujemy użytkownika na stronę logowania TMDB
            # Parametr redirect_to mówi TMDB, gdzie wrócić po kliknięciu "Allow"
            auth_url = f"https://www.themoviedb.org/authenticate/{request_token}?redirect_to={redirect_uri}"
            return RedirectResponse(auth_url)
            
        except Exception as e:
            print(f"Login Exception: {e}")
            raise HTTPException(status_code=500, detail=str(e))

@router.get("/callback")
async def auth_callback(request: Request, request_token: str, approved: bool = False):
    """
    Krok 2: Powrót z TMDB, wymiana tokena na sesję.
    """
    if not approved:
        # Użytkownik kliknął "Deny" lub anulował
        return RedirectResponse("/")

    async with httpx.AsyncClient(headers=settings.TMDB_HEADERS) as client:
        # Wymiana request_token na session_id
        resp = await client.post(
            f"{settings.TMDB_BASE_URL}/authentication/session/new",
            params={"api_key": settings.TMDB_API_KEY},
            json={"request_token": request_token}
        )
        
        data = resp.json()
        if data.get("success"):
            session_id = data["session_id"]
            
            # Zapisujemy session_id w ciasteczku sesyjnym
            request.session["session_id"] = session_id
            return RedirectResponse("/")
        else:
            print(f"Session Error: {data}")
        
    return RedirectResponse("/?error=auth_failed")

@router.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/")