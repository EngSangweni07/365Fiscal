from typing import Optional
from pydantic import BaseModel
from app.schemas.common import ORMBase


class LocationCreate(BaseModel):
    warehouse_id: int
    name: str
    code: str = ""
    is_primary: bool = False
    is_scrap: bool = False
    is_finished_goods: bool = False


class LocationUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    is_primary: Optional[bool] = None
    is_scrap: Optional[bool] = None
    is_finished_goods: Optional[bool] = None


class LocationRead(ORMBase):
    id: int
    warehouse_id: int
    name: str
    code: str
    is_primary: bool
    is_scrap: bool
    is_finished_goods: bool
