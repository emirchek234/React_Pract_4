import jwt from 'jsonwebtoken'
import { pool } from './db.js'

const JWT_SECRET = process.env.JWT_SECRET || 'development_secret_change_me'

export async function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Для выполнения действия необходимо войти в аккаунт.' })

  try {
    req.user = jwt.verify(token, JWT_SECRET)
  } catch {
    return res.status(401).json({ error: 'Срок действия авторизации истёк. Войдите ещё раз.' })
  }

  try {
    const account = await pool.query('SELECT is_active FROM Users WHERE user_id = $1', [req.user.user_id])
    if (!account.rowCount || !account.rows[0].is_active) {
      return res.status(403).json({ error: 'Аккаунт не найден или заблокирован. Обратитесь к администратору.' })
    }
    next()
  } catch (error) {
    console.error('Ошибка проверки авторизации:', error)
    res.status(500).json({ error: 'Не удалось проверить авторизацию. Попробуйте позже.' })
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role_name !== 'admin') return res.status(403).json({ error: 'Это действие доступно только администратору.' })
  next()
}

export { JWT_SECRET }
