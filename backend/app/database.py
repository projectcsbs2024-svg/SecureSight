from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# -------------------- DATABASE URL --------------------
# You can override with an environment variable for flexibility
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./securesight.db")

# -------------------- ENGINE --------------------
# SQLite requires connect_args={"check_same_thread": False}
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

# -------------------- SESSION --------------------
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# -------------------- BASE MODEL --------------------
Base = declarative_base()

# -------------------- DEPENDENCY --------------------
# Use in FastAPI routes with Depends(get_db)
def get_db():
    """
    Creates a new database session for a request and closes it after.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
