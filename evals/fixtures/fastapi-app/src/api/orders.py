from fastapi import APIRouter, Depends
from src.services.order import create_order, cancel_order
from src.core.auth import require_user

router = APIRouter()

@router.post("/orders")
async def post_order(payload: dict, user=Depends(require_user)):
    return await create_order(payload, user)

@router.delete("/orders/{order_id}")
async def delete_order(order_id: str, user=Depends(require_user)):
    await cancel_order(order_id)
