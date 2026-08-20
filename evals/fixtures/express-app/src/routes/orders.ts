import { Router } from 'express'
import { createOrder, cancelOrder } from '../services/order'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.post('/orders', requireAuth, async (req, res) => {
  const order = await createOrder(req.body, req.user)
  res.status(201).json(order)
})
router.delete('/orders/:id', requireAuth, async (req, res) => {
  await cancelOrder(req.params.id)
  res.status(204).end()
})
export default router
