import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { pool } from './db.js'
import { authenticateToken, requireAdmin } from './middleware.js'

const app = express()
const PORT = Number(process.env.PORT || 3001)

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

async function getUserDetails(userId) {
  const result = await pool.query(
    `SELECT u.user_id, u.full_name, u.email, r.role_name,
            c.coupon_type, c.code AS coupon_code, c.discount_percent AS coupon_discount_percent,
            c.is_active AS coupon_is_active
     FROM Users u
     JOIN Roles r ON r.role_id = u.role_id
     LEFT JOIN UserCoupons c ON c.user_id = u.user_id AND c.is_active = TRUE
     WHERE u.user_id = $1`,
    [userId],
  )

  if (!result.rows[0]) return null
  const row = result.rows[0]
  return {
    user_id: row.user_id,
    full_name: row.full_name,
    email: row.email,
    role_name: row.role_name,
    coupon: row.coupon_code ? {
      coupon_type: row.coupon_type,
      code: row.coupon_code,
      discount_percent: Number(row.coupon_discount_percent),
    } : null,
  }
}

const serviceSelect = `
  SELECT s.service_id, s.category_id, c.name AS category_name, s.name,
         s.description, s.duration_minutes, s.price, s.discount_percent,
         ROUND(s.price * (100 - s.discount_percent) / 100, 2) AS final_price
  FROM Services s
  JOIN Categories c ON c.category_id = s.category_id
  WHERE s.is_active = TRUE
`

app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1')
  res.json({ status: 'ok', api: 'Service Studio API', database: 'connected' })
}))

// Категории возвращаются из БД, поэтому добавленные администратором пункты
// автоматически появляются в боковой панели каталога.
app.get('/api/categories', asyncRoute(async (_req, res) => {
  const result = await pool.query(
    `SELECT c.category_id, c.name, COUNT(s.service_id)::int AS services_count
     FROM Categories c
     LEFT JOIN Services s ON s.category_id = c.category_id AND s.is_active = TRUE
     GROUP BY c.category_id, c.name
     ORDER BY c.name`,
  )
  res.json(result.rows)
}))

app.post('/api/categories', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
  const name = String(req.body.name || '').trim()
  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ error: 'Название категории должно содержать от 2 до 100 символов.' })
  }
  const result = await pool.query(
    'INSERT INTO Categories (name) VALUES ($1) RETURNING category_id, name',
    [name],
  )
  res.status(201).json(result.rows[0])
}))

app.get('/api/services', asyncRoute(async (req, res) => {
  const values = []
  let where = ''
  if (req.query.category_id) {
    const ids = String(req.query.category_id).split(',').map(Number).filter(Number.isInteger)
    if (ids.length) {
      values.push(ids)
      where = ` AND s.category_id = ANY($${values.length}::int[])`
    }
  }
  if (req.query.search) {
    values.push(`%${String(req.query.search).trim()}%`)
    where += ` AND (s.name ILIKE $${values.length} OR s.description ILIKE $${values.length})`
  }
  const result = await pool.query(`${serviceSelect}${where} ORDER BY s.service_id`, values)
  res.json(result.rows)
}))

app.post('/api/services', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
  const categoryId = Number(req.body.category_id)
  const name = String(req.body.name || '').trim()
  const description = String(req.body.description || '').trim()
  const duration = Number(req.body.duration_minutes)
  const price = Number(req.body.price)

  if (!Number.isInteger(categoryId) || !name || !description || !Number.isInteger(duration) || duration <= 0 || !Number.isFinite(price) || price < 0) {
    return res.status(400).json({ error: 'Проверьте категорию, название, описание, длительность и цену услуги.' })
  }
  const result = await pool.query(
    `INSERT INTO Services (category_id, name, description, duration_minutes, price)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING service_id, category_id, name, description, duration_minutes, price, discount_percent`,
    [categoryId, name, description, duration, price],
  )
  res.status(201).json(result.rows[0])
}))

app.patch('/api/services/:id/discount', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
  const serviceId = Number(req.params.id)
  const discount = Number(req.body.discount_percent)
  if (!Number.isInteger(serviceId) || !Number.isInteger(discount) || discount < 0 || discount > 90) {
    return res.status(400).json({ error: 'Размер скидки должен быть целым числом от 0 до 90.' })
  }
  const result = await pool.query(
    `UPDATE Services SET discount_percent = $1
     WHERE service_id = $2 AND is_active = TRUE
     RETURNING service_id, name, discount_percent`,
    [discount, serviceId],
  )
  if (!result.rows[0]) return res.status(404).json({ error: 'Услуга не найдена.' })
  res.json(result.rows[0])
}))

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '')
  if (!email || !password) {
    return res.status(400).json({ error: 'Заполните email и пароль.' })
  }

  const result = await pool.query(
    `SELECT u.user_id, u.password_hash, r.role_name
     FROM Users u JOIN Roles r ON r.role_id = u.role_id
     WHERE LOWER(u.email) = $1`,
    [email],
  )
  const row = result.rows[0]
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    return res.status(401).json({ error: 'Неверный email или пароль.' })
  }

  const token = jwt.sign(
    { user_id: row.user_id, role_name: row.role_name },
    process.env.JWT_SECRET || 'development_secret',
    { expiresIn: '12h' },
  )
  const user = await getUserDetails(row.user_id)
  res.json({ token, user })
}))

app.get('/api/auth/me', authenticateToken, asyncRoute(async (req, res) => {
  const user = await getUserDetails(req.user.user_id)
  if (!user) return res.status(404).json({ error: 'Пользователь не найден.' })
  res.json(user)
}))

app.get('/api/admin/users', authenticateToken, requireAdmin, asyncRoute(async (_req, res) => {
  const result = await pool.query(
    `SELECT u.user_id, u.full_name, u.email, r.role_name,
            c.coupon_type, c.code AS coupon_code,
            c.discount_percent AS coupon_discount_percent
     FROM Users u JOIN Roles r ON r.role_id = u.role_id
     LEFT JOIN UserCoupons c ON c.user_id = u.user_id AND c.is_active = TRUE
     ORDER BY u.user_id`,
  )
  res.json(result.rows)
}))

const couponTypes = {
  WELCOME: { label: 'Приветственный', discount: 5 },
  LOYALTY: { label: 'Постоянный клиент', discount: 10 },
  SPECIAL: { label: 'Персональный', discount: 15 },
}

app.put('/api/admin/users/:id/coupon', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
  const userId = Number(req.params.id)
  const couponType = String(req.body.coupon_type || '').toUpperCase()
  const config = couponTypes[couponType]
  if (!Number.isInteger(userId) || !config) {
    return res.status(400).json({ error: 'Выберите пользователя и один из доступных видов купона.' })
  }
  const userResult = await pool.query('SELECT user_id FROM Users WHERE user_id = $1', [userId])
  if (!userResult.rows[0]) return res.status(404).json({ error: 'Пользователь не найден.' })

  const code = `${couponType}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  const result = await pool.query(
    `INSERT INTO UserCoupons (user_id, coupon_type, code, discount_percent, assigned_by, is_active)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     ON CONFLICT (user_id) DO UPDATE SET
       coupon_type = EXCLUDED.coupon_type,
       code = EXCLUDED.code,
       discount_percent = EXCLUDED.discount_percent,
       assigned_by = EXCLUDED.assigned_by,
       is_active = TRUE,
       created_at = CURRENT_TIMESTAMP
     RETURNING coupon_id, user_id, coupon_type, code, discount_percent`,
    [userId, couponType, code, config.discount, req.user.user_id],
  )
  res.json(result.rows[0])
}))

app.get('/api/appointments/my', authenticateToken, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT a.appointment_id, a.quantity, a.unit_price, a.total_price, a.status, a.created_at,
            s.name AS service_name, s.duration_minutes,
            p.status AS payment_status, p.amount AS payment_amount
     FROM Appointments a
     JOIN Services s ON s.service_id = a.service_id
     LEFT JOIN Payments p ON p.appointment_id = a.appointment_id
     WHERE a.user_id = $1
     ORDER BY a.created_at DESC, a.appointment_id DESC`,
    [req.user.user_id],
  )
  res.json(result.rows)
}))

app.post('/api/appointments', authenticateToken, asyncRoute(async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : []
  if (!items.length) return res.status(400).json({ error: 'Корзина пуста.' })
  if (items.length > 50) return res.status(400).json({ error: 'Слишком много позиций в одной записи.' })

  const couponResult = await pool.query(
    'SELECT discount_percent FROM UserCoupons WHERE user_id = $1 AND is_active = TRUE',
    [req.user.user_id],
  )
  const couponDiscount = couponResult.rows[0] ? Number(couponResult.rows[0].discount_percent) : 0
  const client = await pool.connect()
  const created = []

  try {
    await client.query('BEGIN')
    for (const item of items) {
      const serviceId = Number(item.service_id)
      const quantity = Number(item.quantity)
      if (!Number.isInteger(serviceId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        throw Object.assign(new Error('Некорректные данные корзины.'), { status: 400 })
      }
      const serviceResult = await client.query(
        `SELECT service_id, price, discount_percent FROM Services
         WHERE service_id = $1 AND is_active = TRUE FOR SHARE`,
        [serviceId],
      )
      const service = serviceResult.rows[0]
      if (!service) throw Object.assign(new Error('Одна из выбранных услуг больше недоступна.'), { status: 404 })

      const basePrice = Number(service.price)
      const serviceDiscount = Number(service.discount_percent)
      const discountedPrice = basePrice * (1 - serviceDiscount / 100)
      const unitPrice = Number((discountedPrice * (1 - couponDiscount / 100)).toFixed(2))
      const totalPrice = Number((unitPrice * quantity).toFixed(2))

      const appointmentResult = await client.query(
        `INSERT INTO Appointments
           (user_id, service_id, quantity, base_price, service_discount_percent,
            coupon_discount_percent, unit_price, total_price, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
         RETURNING appointment_id, service_id, quantity, unit_price, total_price, status`,
        [req.user.user_id, serviceId, quantity, basePrice, serviceDiscount, couponDiscount, unitPrice, totalPrice],
      )
      const appointment = appointmentResult.rows[0]
      const paymentResult = await client.query(
        `INSERT INTO Payments (appointment_id, amount, payment_method, status)
         VALUES ($1, $2, 'Не выбран', 'pending')
         RETURNING payment_id, amount, status`,
        [appointment.appointment_id, totalPrice],
      )
      created.push({ ...appointment, payment: paymentResult.rows[0] })
    }
    await client.query('COMMIT')
    res.status(201).json({ message: 'Записи созданы. Оплата имеет статус «ожидает».', appointments: created })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}))

app.use((req, res) => {
  res.status(404).json({ error: 'Запрошенный адрес API не найден.' })
})

app.use((error, _req, res, _next) => {
  console.error(error)
  if (error.code === '23505') {
    return res.status(409).json({ error: 'Запись с таким значением уже существует.' })
  }
  if (error.code === '23503') {
    return res.status(400).json({ error: 'Нельзя выполнить действие: связанная запись не найдена.' })
  }
  res.status(error.status || 500).json({
    error: error.status ? error.message : 'Внутренняя ошибка сервера. Проверьте подключение к базе данных.',
  })
})

app.listen(PORT, () => {
  console.log(`Service Studio API запущен: http://localhost:${PORT}`)
})
