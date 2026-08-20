import { db } from '../db/client'
import { processPayment } from '../services/payment'
export function handler(req) {
  return db.query('SELECT 1')
}
