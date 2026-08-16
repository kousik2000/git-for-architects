from pydantic import BaseModel
from typing import Optional

class ErrorResponse(BaseModel):
    code: str
    message: str
    details: Optional[str] = None

class HealthResponse(BaseModel):
    status: str
    service: str
    libredwg: str
