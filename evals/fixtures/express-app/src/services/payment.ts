import Stripe from 'stripe'
import { config } from '../config/env'

const stripe = new Stripe(config.stripeKey)

export async function chargePayment(order: Order): Promise<ChargeResult> {
  try {
    const intent = await stripe.paymentIntents.create({ amount: order.total })
    return { ok: true, intentId: intent.id }
  } catch (e) {
    return { ok: false, reason: e.code }
  }
}
