import { savePayment } from '../db/repo'
export function processPayment(input) { return savePayment(input) }
