from fastapi import FastAPI, Depends, HTTPException, status, Response 
from sqlalchemy.orm import Session 

from planner.database import engine, get_db
from planner.models import Base, Workoutdb
from planner.schemas import WorkoutCreate, WorkoutRead

app = FastAPI() 

@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)

@app.get("/api/workouts", response_model=list[WorkoutRead]) 
def list_workouts(db: Session = Depends(get_db)): 
    workouts = db.query(Workoutdb).all() 
    return workouts

@app.post("/api/workouts", response_model=WorkoutRead) 
def add_workouts(payload: WorkoutCreate, db: Session = Depends(get_db)): 
    workout = Workoutdb(**payload.model_dump()) 
    db.add(workout) 
    db.commit() 
    db.refresh(workout) 
    return workout 

@app.delete("/api/workouts/{workout_id}") 
def delete_workouts(workout_id: int, db: Session = Depends(get_db)) -> Response: 
    workout = db.get(Workoutdb, workout_id) 
    if not workout: 
        raise HTTPException(status_code=404, detail="Workout not found") 
    db.delete(workout)          
    db.commit() 
    return Response(status_code=status.HTTP_204_NO_CONTENT) 