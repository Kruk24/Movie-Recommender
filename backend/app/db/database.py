# backend/app/db/database.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base

# Plik bazy danych utworzy się w folderze backend
DATABASE_URL = "sqlite+aiosqlite:///./app.db"

engine = create_async_engine(DATABASE_URL, echo=False)

# Fabryka sesji (połączeń)
AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

Base = declarative_base()

# Funkcja pomocnicza do wstrzykiwania sesji w endpointach
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session