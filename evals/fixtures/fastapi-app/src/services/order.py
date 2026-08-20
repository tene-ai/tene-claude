from src.db.repository import OrderRepository
from src.services.payment import charge

async def create_order(payload, user):
    order = await OrderRepository.create(payload, user["id"])
    result = await charge(order)
    if not result["ok"]:
        await OrderRepository.mark_failed(order["id"], result["reason"])
        raise PaymentError(result["reason"])
    return order

async def cancel_order(order_id):
    await OrderRepository.update_status(order_id, "cancelled")

def _validate(payload):
    return payload is not None
