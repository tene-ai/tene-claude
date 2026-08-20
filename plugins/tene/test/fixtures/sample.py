from .payments import charge_card
import logging as log

# def fake_in_comment(): pass
"""
class FakeDoc: pass
"""
s = "def also_fake(): pass"

def process_payment(input):
    result = charge_card(input)
    if not result.ok:
        return record_failure(input, result)
    return result

class PaymentService:
    def charge(self, amount):
        return self.gateway.send(amount)

    def _private_helper(self):
        pass

handler = getattr(obj, name)
