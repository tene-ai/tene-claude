import { save } from '../db/store'
export function handler(req) { return save(req.body) }
