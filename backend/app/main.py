from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
import os

# Importy bazy danych
from app.db.database import engine, Base
# --- NAPRAWA: Importujemy modele, żeby SQLAlchemy wiedziało co utworzyć ---
from app.db import models 

# Importy routerów
from app.api import auth, user, movies, home
from app.routes import tmdb_auth

from app.api import suggestions

# --- LIFESPAN ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Kod uruchamiany przy STARCIE aplikacji
    async with engine.begin() as conn:
        # Teraz Base.metadata "widzi" tabelę favorites dzięki importowi models
        await conn.run_sync(Base.metadata.create_all)
    
    yield  # Tutaj aplikacja działa
    
    # 2. Kod uruchamiany przy ZAMKNIĘCIU aplikacji
    await engine.dispose()

# Przekazujemy lifespan do FastAPI
app = FastAPI(title="Film Recommender", lifespan=lifespan)

app.add_middleware(SessionMiddleware, secret_key=os.getenv("SECRET_KEY"))

# Rejestracja Routerów
app.include_router(auth.router)
app.include_router(user.router)
app.include_router(movies.router)
app.include_router(home.router)
app.include_router(tmdb_auth.router)
app.include_router(suggestions.router)

# Pliki statyczne
app.mount("/static", StaticFiles(directory="../frontend/static"), name="static")

# Szablony HTML
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

@app.get("/details.html", response_class=HTMLResponse)
async def details(request: Request):
    return templates.TemplateResponse("details.html", {"request": request})

@app.get("/recommendations", response_class=HTMLResponse)
async def rec_page(request: Request):
    return templates.TemplateResponse("recommendations.html", {"request": request})