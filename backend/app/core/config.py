import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "Movie Recommender"
    TMDB_API_KEY: str = os.getenv("TMDB_API_KEY")
    TMDB_BASE_URL: str = "https://api.themoviedb.org/3"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "super-secret-key-change-it")
    
    # Dodajemy nagłówki, żeby TMDB nas nie blokowało
    TMDB_HEADERS: dict = {
        "User-Agent": "MovieRecommenderApp/1.0 (render-deployment)",
        "Accept": "application/json"
    }
settings = Settings()
