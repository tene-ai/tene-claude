import jwt from 'jsonwebtoken'
export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).end()
  req.user = jwt.verify(token, process.env.JWT_SECRET!)
  next()
}
