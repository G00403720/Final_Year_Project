from sqlalchemy import Column, Integer, String, Date
from sqlalchemy.orm import declarative_base

#Creates base class for table
Base = declarative_base()

#Workout database
class Workoutdb(Base):
    __tablename__ = "workouts"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    level = Column(String, nullable = False)
    reps_time = Column(String)
    equipment = Column(String, nullable=True)
