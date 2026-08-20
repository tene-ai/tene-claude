from sqlalchemy import select
from src.db.session import async_session

class OrderRepository:
    @staticmethod
    async def create(data, user_id):
        async with async_session() as s:
            return await s.execute(select(Order))

    @staticmethod
    async def mark_failed(order_id, reason):
        async with async_session() as s:
            await s.execute(update(Order).values(status="failed", reason=reason))

    @staticmethod
    async def update_status(order_id, status):
        pass
