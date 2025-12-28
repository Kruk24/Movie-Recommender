from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from app.api import auth, user, movies, home
from starlette.middleware.sessions import SessionMiddleware
from app.routes import tmdb_auth
import os

app = FastAPI(title="Film Recommender")

app.add_middleware(SessionMiddleware, secret_key=os.getenv("SECRET_KEY"))

# Routery API
app.include_router(auth.router)
app.include_router(user.router)
app.include_router(movies.router)
app.include_router(home.router)
app.include_router(tmdb_auth.router)

# Statyczne pliki (CSS, JS, obrazy)
app.mount("/static", StaticFiles(directory="../frontend/static"), name="static")

# Szablony HTML
BASE_DIR = os.path.dirname(os.path.abspath(__file__))  # backend/app
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

@app.get("/details.html", response_class=HTMLResponse)
async def details(request: Request):
    # Renderuje plik details.html z folderu templates
    return templates.TemplateResponse("details.html", {"request": request})