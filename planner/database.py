from sqlalchemy.orm import sessionmaker 
from sqlalchemy import create_engine

DATABASE_URL = "sqlite:///./workout.db"

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else{}

engine = create_engine(DATABASE_URL, echo = True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

def get_db(): 
    db = SessionLocal() 
    try: 
        yield db 
    finally: 
        db.close() 