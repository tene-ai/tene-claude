import { OrderRepository } from '../repositories/order'
import { chargePayment } from './payment'
import { logger } from '../utils/logger'

export async function createOrder(input: OrderInput, user: User): Promise<Order> {
  const order = await OrderRepository.create({ ...input, userId: user.id })
  const charge = await chargePayment(order)
  if (!charge.ok) {
    await OrderRepository.markFailed(order.id, charge.reason)
    logger.warn('charge failed', { orderId: order.id })
    throw new PaymentError(charge.reason)
  }
  return order
}

export async function cancelOrder(id: string): Promise<void> {
  await OrderRepository.updateStatus(id, 'cancelled')
}
