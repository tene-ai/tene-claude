import { prisma } from '../models/client'

export const OrderRepository = {
  async create(data: OrderData) { return prisma.order.create({ data }) },
  async markFailed(id: string, reason: string) {
    return prisma.order.update({ where: { id }, data: { status: 'failed', reason } })
  },
  async updateStatus(id: string, status: string) {
    return prisma.order.update({ where: { id }, data: { status } })
  },
}
