# backend/app/db/models.py
from sqlalchemy import Column, Integer, String, Float, Boolean, Text
from .database import Base

class FavoriteMovie(Base):
    __tablename__ = "favorites"

    id = Column(Integer, primary_key=True, index=True)
    user_session_id = Column(String, index=True)
    
    tmdb_id = Column(Integer, index=True)
    media_type = Column(String, default="movie") # movie / tv
    
    title = Column(String)
    poster_path = Column(String, nullable=True)
    release_date = Column(String, nullable=True)
    vote_average = Column(Float, default=0.0)
    
    # --- NOWE POLA DO STATYSTYK I REKOMENDACJI ---
    vote_count = Column(Integer, default=0)       # Wiarygodność oceny
    popularity = Column(Float, default=0.0)       # Trend
    runtime = Column(Integer, default=0)          # Minuty (film) lub śr. odcinka (tv)
    original_language = Column(String, nullable=True) 
    runtime = Column(Integer, default=0)

    # Pola JSON (przechowywane jako String)
    genres_json = Column(String, default="[]")    # Gatunki
    keywords_json = Column(String, default="[]")  # Słowa kluczowe (np. "space", "zombie")
    cast_json = Column(String, default="[]")      # Top 5-10 aktorów (IDs)
    directors_json = Column(String, default="[]") # Reżyserzy lub Twórcy serialu (IDs)
    production_countries_json = Column(String, default="[]") # Kraje produkcji