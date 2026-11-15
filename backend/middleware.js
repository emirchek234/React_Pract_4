import jwt from 'jsonwebtoken'

export function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Для выполнения действия необходимо войти в аккаунт.' })
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ error: 'Срок действия авторизации истёк. Войдите ещё раз.' })
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role_name !== 'admin') {
    return res.status(403).json({ error: 'Это действие доступно только администратору.' })
  }
  next()
}
