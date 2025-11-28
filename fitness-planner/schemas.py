from pydantic import BaseModel

class WorkoutCreate(BaseModel):
    name: str
    level: str
    reps_time: str
    equipment: str

class WorkoutRead(BaseModel):
    id: int
    name: str
    level: str
    reps_time: str
    equipment: str