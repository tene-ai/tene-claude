import stripe
from src.core.config import settings

async def charge(order):
    try:
        intent = stripe.PaymentIntent.create(amount=order["total"])
        return {"ok": True, "intent_id": intent.id}
    except Exception as e:
        return {"ok": False, "reason": str(e)}
