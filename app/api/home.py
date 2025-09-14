from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
import os

router = APIRouter()
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend/app
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

@router.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("home.html", {"request": request})

@router.get("/home", response_class=HTMLResponse)
def home(request: Request):
    user = request.session.get("user")
    if not user:
        return RedirectResponse(url="/auth/login", status_code=303)
    return templates.TemplateResponse("home.html", {"request": request, "user": user})
"""
@router.get("/user/favorites", response_class=HTMLResponse)
def favorites_page(request: Request):
    # Tutaj możesz później podawać dynamiczne dane z bazy
    favorites = [
        {"title": "Inception", "poster": "https://via.placeholder.com/150", "rating": 8.8},
        {"title": "Interstellar", "poster": "https://via.placeholder.com/150", "rating": 8.6},
    ]
    return templates.TemplateResponse("favorites.html", {"request": request, "favorites": favorites})
"""