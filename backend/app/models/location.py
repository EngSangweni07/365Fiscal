from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.common import TimestampMixin


class Location(Base, TimestampMixin):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(primary_key=True)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    code: Mapped[str] = mapped_column(String(50), default="")
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    is_scrap: Mapped[bool] = mapped_column(Boolean, default=False)
    is_finished_goods: Mapped[bool] = mapped_column(Boolean, default=False)

    warehouse = relationship("Warehouse", back_populates="locations")
