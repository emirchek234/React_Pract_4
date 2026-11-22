import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import multer from 'multer'
import { sendMail } from './mailer.js'
import { pool } from './db.js'
import { authenticateToken, requireAdmin, JWT_SECRET } from './middleware.js'
import { cleanText, validateHumanText, validateEmail, validatePhone, validatePassword, parsePositiveInteger, containsProfanity } from './validation.js'

const app = express()
const PORT = Number(process.env.PORT || 3001)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadDir = path.join(__dirname, 'uploads')
fs.mkdirSync(uploadDir, { recursive: true })
const ORDER_STATUSES = ['new', 'confirmed', 'processing', 'completed', 'cancelled']
const STATUS_LABELS = { new: 'Новый', confirmed: 'Подтверждён', processing: 'В работе', completed: 'Выполнен', cancelled: 'Отменён' }
const allowedImageTypes = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }
const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDir),
    filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${allowedImageTypes[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => allowedImageTypes[file.mimetype]
    ? callback(null, true)
    : callback(new Error('Поддерживаются изображения JPG, PNG, WEBP и GIF.')),
})

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use('/uploads', express.static(uploadDir))
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const fail = (message, status = 400) => Object.assign(new Error(message), { status })
const isValidDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
  const [year, month, day] = String(value).split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

async function getUserDetails(userId) {
  const result = await pool.query(
    `SELECT u.user_id, u.full_name, u.email, u.phone, u.default_address, u.is_active,
            r.role_name, c.coupon_type, c.code AS coupon_code,
            c.discount_percent AS coupon_discount_percent
     FROM Users u
     JOIN Roles r ON r.role_id = u.role_id
     LEFT JOIN UserCoupons c ON c.user_id = u.user_id AND c.is_active = TRUE
     WHERE u.user_id = $1`, [userId],
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    user_id: row.user_id, full_name: row.full_name, email: row.email, phone: row.phone,
    default_address: row.default_address, is_active: row.is_active, role_name: row.role_name,
    coupon: row.coupon_code ? { coupon_type: row.coupon_type, code: row.coupon_code, discount_percent: Number(row.coupon_discount_percent) } : null,
  }
}

const serviceSelect = `
 SELECT s.service_id, s.name, s.description, s.duration_minutes, s.price,
        s.discount_percent, s.image_url, s.stock_quantity, s.is_active,
        c.name AS category_name, c.category_id,
        ROUND(s.price * (100 - s.discount_percent) / 100, 2) AS final_price,
        COALESCE(rv.review_count, 0)::int AS review_count,
        COALESCE(rv.average_rating, 0)::numeric(3,2) AS average_rating
 FROM Services s
 JOIN Categories c ON c.category_id = s.category_id
 LEFT JOIN (
   SELECT service_id, COUNT(*) AS review_count, AVG(rating) AS average_rating
   FROM Reviews GROUP BY service_id
 ) rv ON rv.service_id = s.service_id
 WHERE s.is_active = TRUE`

function validateServiceBody(body, allowEmptyCategory = true) {
  const name = cleanText(body.name)
  const description = String(body.description ?? '').trim()
  const nameError = validateHumanText(name, 'Название услуги', 2, 160)
  if (nameError) throw fail(nameError)
  if (description.length < 5 || description.length > 2000 || /[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(description)) {
    throw fail('Описание должно содержать от 5 до 2000 символов без HTML-тегов.')
  }
  if (containsProfanity(description)) throw fail('Описание содержит недопустимую лексику.')
  const duration = parsePositiveInteger(body.duration_minutes, 'Длительность', 1, 1440)
  if (duration.error) throw fail(duration.error)
  const price = Number(body.price)
  if (!Number.isFinite(price) || price < 500 || price > 1000000 || Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) throw fail('Цена услуги должна быть от 500 до 1 000 000 ₽. Допускается не более двух знаков после запятой.')
  const stock = parsePositiveInteger(body.stock_quantity, 'Остаток на складе', 0, 100000)
  if (stock.error) throw fail(stock.error)
  const discount = Number(body.discount_percent ?? 0)
  if (!Number.isInteger(discount) || discount < 0 || discount > 90) throw fail('Скидка должна быть целым числом от 0 до 90%.')
  let categoryId = null
  if (body.category_id !== '' && body.category_id !== null && body.category_id !== undefined) {
    categoryId = Number(body.category_id)
    if (!Number.isInteger(categoryId) || categoryId <= 0) throw fail('Выберите корректную категорию.')
  } else if (!allowEmptyCategory) throw fail('Выберите категорию.')
  return { name, description, duration: duration.value, price, stock: stock.value, discount, categoryId }
}

// Проверка работоспособности API и соединения с PostgreSQL.
app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1')
  res.json({ status: 'ok', api: 'Service Studio API', database: 'connected' })
}))

// Категории и связи с услугами возвращаются одним JOIN-запросом.
app.get('/api/categories', asyncRoute(async (_req, res) => {
  const result = await pool.query(
    `SELECT c.category_id, c.name, COUNT(s.service_id)::int AS services_count
     FROM Categories c LEFT JOIN Services s ON s.category_id = c.category_id AND s.is_active = TRUE
     GROUP BY c.category_id, c.name ORDER BY CASE WHEN c.name = 'Без категории' THEN 0 ELSE 1 END, c.name`,
  )
  res.json(result.rows)
}))

app.post('/api/categories', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
  const name = cleanText(req.body.name).replace(/\s+/g, ' ')
  const error = validateHumanText(name, 'Название категории', 2, 100)
  if (error) throw fail(error)
  const result = await pool.query('INSERT INTO Categories (name) VALUES ($1) RETURNING category_id, name', [name])
  res.status(201).json(result.rows[0])
}))

app.put('/api/categories/:id', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
  const categoryId = parsePositiveInteger(req.params.id, 'Категория')
  if (categoryId.error) throw fail(categoryId.error)
  const name = cleanText(req.body.name).replace(/\s+/g, ' ')
  const error = validateHumanText(name, 'Название категории', 2, 100)
  if (error) throw fail(error)
  const current = await pool.query('SELECT name FROM Categories WHERE category_id = $1', [categoryId.value])
  if (!current.rowCount) throw fail('Категория не найдена.', 404)
  if (current.rows[0].name === 'Без категории') throw fail('Системную категорию «Без категории» нельзя переименовать.')
  const result = await pool.query('UPDATE Categories SET name = $1 WHERE category_id = $2 RETURNING category_id, name', [name, categoryId.value])
  res.json(result.rows[0])
}))

// При удалении категории все её услуги автоматически перемещаются в «Без категории».
app.delete('/api/categories/:id', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
  const categoryId = parsePositiveInteger(req.params.id, 'Категория')
  if (categoryId.error) throw fail(categoryId.error)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const category = await client.query('SELECT category_id, name FROM Categories WHERE category_id = $1 FOR UPDATE', [categoryId.value])
    if (!category.rowCount) throw fail('Категория не найдена.', 404)
    if (category.rows[0].name === 'Без категории') throw fail('Системную категорию «Без категории» нельзя удалить.')
    const fallback = await client.query("SELECT category_id FROM Categories WHERE name = 'Без категории' LIMIT 1")
    if (!fallback.rowCount) throw fail('Не найдена системная категория «Без категории». Выполните миграцию базы данных.', 500)
    await client.query('UPDATE Services SET category_id = $1 WHERE category_id = $2', [fallback.rows[0].category_id, categoryId.value])
    await client.query('DELETE FROM Categories WHERE category_id = $1', [categoryId.value])
    await client.query('COMMIT')
    res.json({ message: 'Категория удалена. Её услуги перенесены в «Без категории».' })
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}))

app.get('/api/services', asyncRoute(async (req, res) => {
  const values = []
  let where = ''
  if (req.query.category) { values.push(String(req.query.category)); where += ` AND c.name = $${values.length}` }
  if (req.query.search) { values.push(`%${String(req.query.search).trim()}%`); where += ` AND (s.name ILIKE $${values.length} OR s.description ILIKE $${values.length})` }
  const result = await pool.query(`${serviceSelect}${where} ORDER BY s.service_id`, values)
  res.json(result.rows)
}))

app.post('/api/services', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
  const data = validateServiceBody(req.body)
  const category = data.categoryId
    ? await pool.query('SELECT category_id FROM Categories WHERE category_id = $1', [data.categoryId])
    : await pool.query("SELECT category_id FROM Categories WHERE name = 'Без категории' LIMIT 1")
  if (!category.rowCount) throw fail('Категория не найдена.')
  const result = await pool.query(
    `INSERT INTO Services (category_id, name, description, duration_minutes, price, discount_percent, stock_quantity)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING service_id`,
    [category.rows[0].category_id, data.name, data.description, data.duration, data.price, data.discount, data.stock],
  )
  const service = await pool.query(`${serviceSelect} AND s.service_id = $1`, [result.rows[0].service_id])
  res.status(201).json(service.rows[0])
}))

app.put('/api/services/:id', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
  const serviceId = parsePositiveInteger(req.params.id, 'Услуга')
  if (serviceId.error) throw fail(serviceId.error)
  const data = validateServiceBody(req.body)
  const category = data.categoryId
    ? await pool.query('SELECT category_id FROM Categories WHERE category_id = $1', [data.categoryId])
    : await pool.query("SELECT category_id FROM Categories WHERE name = 'Без категории' LIMIT 1")
  if (!category.rowCount) throw fail('Категория не найдена.')
  const result = await pool.query(
    `UPDATE Services SET category_id = $1, name = $2, description = $3, duration_minutes = $4,
       price = $5, discount_percent = $6, stock_quantity = $7
     WHERE service_id = $8 AND is_active = TRUE RETURNING service_id`,
    [category.rows[0].category_id, data.name, data.description, data.duration, data.price, data.discount, data.stock, serviceId.value],
  )
  if (!result.rowCount) throw fail('Услуга не найдена.', 404)
  const service = await pool.query(`${serviceSelect} AND s.service_id = $1`, [serviceId.value])
  res.json(service.rows[0])
}))

// Скрываем услугу, но сохраняем её снимки в прошлых заказах и отзывы.
app.delete('/api/services/:id', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
  const serviceId = parsePositiveInteger(req.params.id, 'Услуга')
  if (serviceId.error) throw fail(serviceId.error)
  const result = await pool.query('UPDATE Services SET is_active = FALSE WHERE service_id = $1 AND is_active = TRUE RETURNING name', [serviceId.value])
  if (!result.rowCount) throw fail('Услуга не найдена или уже удалена.', 404)
  await pool.query('DELETE FROM CartItems WHERE service_id = $1', [serviceId.value])
  res.json({ message: `Услуга «${result.rows[0].name}» удалена из каталога. История заказов сохранена.` })
}))

app.post('/api/services/:id/image', authenticateToken, requireAdmin, (req, res, next) => {
  imageUpload.single('image')(req, res, (error) => {
    if (error) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Размер изображения не должен превышать 5 МБ.' : error.message })
    next()
  })
}, asyncRoute(async (req, res) => {
  const serviceId = parsePositiveInteger(req.params.id, 'Услуга')
  if (serviceId.error) throw fail(serviceId.error)
  if (!req.file) throw fail('Выберите файл изображения.')
  const imageUrl = `/uploads/${req.file.filename}`
  const result = await pool.query('UPDATE Services SET image_url = $1 WHERE service_id = $2 RETURNING service_id, image_url', [imageUrl, serviceId.value])
  if (!result.rowCount) { fs.unlink(req.file.path, () => {}); throw fail('Услуга не найдена.', 404) }
  res.json(result.rows[0])
}))

// Удаление изображения услуги: запись в БД очищается, файл удаляется с диска.
app.delete('/api/services/:id/image', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
  const serviceId = parsePositiveInteger(req.params.id, 'Услуга')
  if (serviceId.error) throw fail(serviceId.error)
  const current = await pool.query('SELECT image_url FROM Services WHERE service_id = $1', [serviceId.value])
  if (!current.rowCount) throw fail('Услуга не найдена.', 404)
  const previousUrl = current.rows[0].image_url
  await pool.query('UPDATE Services SET image_url = NULL WHERE service_id = $1', [serviceId.value])
  if (previousUrl && previousUrl.startsWith('/uploads/')) {
    const filename = path.basename(previousUrl)
    fs.unlink(path.join(uploadDir, filename), () => {})
  }
  res.json({ message: 'Изображение удалено.' })
}))

// Регистрация нового пользователя: роль всегда customer, назначить admin через форму регистрации нельзя.
app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const fullName = cleanText(req.body.full_name)
  const nameError = validateHumanText(fullName, 'ФИО', 2, 120)
  if (nameError) throw fail(nameError)
  const email = validateEmail(req.body.email)
  if (!email) throw fail('Введите корректный email.')
  const passwordError = validatePassword(req.body.password)
  if (passwordError) throw fail(passwordError)
  const phone = validatePhone(req.body.phone)
  if (!phone) throw fail('Введите корректный телефон: от 10 до 15 цифр.')
  const role = await pool.query("SELECT role_id FROM Roles WHERE role_name = 'customer'")
  if (!role.rowCount) throw fail('Роль пользователя не настроена. Выполните миграцию.', 500)
  const passwordHash = await bcrypt.hash(req.body.password, 12)
  const created = await pool.query(
    `INSERT INTO Users (role_id, full_name, email, password_hash, phone)
     VALUES ($1, $2, $3, $4, $5) RETURNING user_id`,
    [role.rows[0].role_id, fullName, email, passwordHash, phone],
  )
  const user = await getUserDetails(created.rows[0].user_id)
  const token = jwt.sign({ user_id: user.user_id, role_name: user.role_name }, JWT_SECRET, { expiresIn: '12h' })
  res.status(201).json({ token, user, message: 'Аккаунт успешно создан.' })
}))

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = validateEmail(req.body.email)
  const password = String(req.body.password || '')
  if (!email || !password) throw fail('Введите корректный email и пароль.')
  const result = await pool.query(
    `SELECT u.user_id, u.password_hash, u.is_active, r.role_name
     FROM Users u JOIN Roles r ON r.role_id = u.role_id WHERE LOWER(u.email) = $1`, [email],
  )
  const row = result.rows[0]
  if (!row || !(await bcrypt.compare(password, row.password_hash))) throw fail('Неверный email или пароль.', 401)
  if (!row.is_active) throw fail('Аккаунт временно заблокирован. Обратитесь к администратору.', 403)
  const user = await getUserDetails(row.user_id)
  const token = jwt.sign({ user_id: user.user_id, role_name: user.role_name }, JWT_SECRET, { expiresIn: '12h' })
  res.json({ token, user })
}))

app.get('/api/auth/me', authenticateToken, asyncRoute(async (req, res) => {
  const user = await getUserDetails(req.user.user_id)
  if (!user) throw fail('Пользователь не найден.', 404)
  if (!user.is_active) throw fail('Аккаунт заблокирован.', 403)
  res.json(user)
}))

// Запрос кода сброса не раскрывает, существует ли указанный email.
app.post('/api/auth/forgot-password', asyncRoute(async (req, res) => {
  const email = validateEmail(req.body.email)
  if (!email) throw fail('Введите корректный email.')
  const found = await pool.query('SELECT user_id, email, full_name FROM Users WHERE LOWER(email) = $1 AND is_active = TRUE', [email])
  const response = { message: 'Если аккаунт с таким email существует, код восстановления отправлен. Проверьте почту и папку «Спам».' }
  if (!found.rowCount) return res.json(response)

  const user = found.rows[0]
  const recentRequest = await pool.query(
    `SELECT reset_id FROM PasswordResetCodes WHERE user_id = $1
     AND created_at > CURRENT_TIMESTAMP - INTERVAL '60 seconds' ORDER BY created_at DESC LIMIT 1`, [user.user_id],
  )
  if (recentRequest.rowCount) return res.json(response)
  const code = String(crypto.randomInt(100000, 1000000))
  const codeHash = crypto.createHash('sha256').update(code).digest('hex')
  await pool.query('UPDATE PasswordResetCodes SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND used_at IS NULL', [user.user_id])
  await pool.query(
    'INSERT INTO PasswordResetCodes (user_id, code_hash, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL \'10 minutes\')',
    [user.user_id, codeHash],
  )

  const smtpHost = process.env.SMTP_HOST
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  if (smtpHost && smtpUser && smtpPass && process.env.MAIL_FROM) {
    await sendMail({
      host: smtpHost, port: Number(process.env.SMTP_PORT || 587), secure: String(process.env.SMTP_SECURE || 'false') === 'true',
      user: smtpUser, pass: smtpPass, from: process.env.MAIL_FROM, to: user.email,
      subject: 'Код восстановления пароля — Service Studio',
      text: `Здравствуйте, ${user.full_name}!\n\nКод для сброса пароля: ${code}\nКод действует 10 минут. Если вы не запрашивали сброс, просто проигнорируйте письмо.`,
    })
  } else {
    if (process.env.NODE_ENV === 'production') throw fail('Отправка писем временно недоступна. Обратитесь к администратору.', 503)
    console.log(`[DEV ONLY] Код восстановления для ${user.email}: ${code}`)
    response.dev_hint = 'SMTP не настроен: для локальной проверки код напечатан в консоли backend.'
  }
  res.json(response)
}))

app.post('/api/auth/reset-password', asyncRoute(async (req, res) => {
  const email = validateEmail(req.body.email)
  const code = String(req.body.code || '').trim()
  const newPassword = String(req.body.new_password || '')
  if (!email || !/^\d{6}$/.test(code)) throw fail('Проверьте email и шестизначный код из письма.')
  const passwordError = validatePassword(newPassword)
  if (passwordError) throw fail(passwordError)
  const found = await pool.query(
    `SELECT pr.reset_id, pr.user_id, pr.code_hash FROM PasswordResetCodes pr
     JOIN Users u ON u.user_id = pr.user_id
     WHERE LOWER(u.email) = $1 AND pr.used_at IS NULL AND pr.attempts < 5 AND pr.expires_at > CURRENT_TIMESTAMP
     ORDER BY pr.created_at DESC LIMIT 1`, [email],
  )
  if (!found.rowCount) throw fail('Код не найден или срок его действия истёк. Запросите новый код.', 400)
  const codeHash = crypto.createHash('sha256').update(code).digest('hex')
  if (!crypto.timingSafeEqual(Buffer.from(codeHash), Buffer.from(found.rows[0].code_hash))) {
    await pool.query(`UPDATE PasswordResetCodes SET attempts = attempts + 1,
      used_at = CASE WHEN attempts >= 4 THEN CURRENT_TIMESTAMP ELSE used_at END WHERE reset_id = $1`, [found.rows[0].reset_id])
    throw fail('Неверный код восстановления. После пяти попыток запросите новый код.', 400)
  }
  const passwordHash = await bcrypt.hash(newPassword, 12)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('UPDATE Users SET password_hash = $1 WHERE user_id = $2', [passwordHash, found.rows[0].user_id])
    await client.query('UPDATE PasswordResetCodes SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND used_at IS NULL', [found.rows[0].user_id])
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  res.json({ message: 'Пароль изменён. Теперь войдите с новым паролем.' })
}))

// Профиль редактируется через API; email и телефон проверяются так же строго, как при регистрации.
app.put('/api/profile', authenticateToken, asyncRoute(async (req, res) => {
  const fullName = cleanText(req.body.full_name)
  const nameError = validateHumanText(fullName, 'ФИО', 2, 120)
  if (nameError) throw fail(nameError)
  const email = validateEmail(req.body.email)
  if (!email) throw fail('Введите корректный email.')
  const phone = validatePhone(req.body.phone)
  if (!phone) throw fail('Введите корректный телефон: от 10 до 15 цифр.')
  const address = cleanText(req.body.default_address)
  if (address.length > 250 || /[<>\u0000-\u001F]/.test(address) || (address && containsProfanity(address))) throw fail('Адрес должен содержать не более 250 символов и не содержать недопустимый текст.')
  const result = await pool.query(
    'UPDATE Users SET full_name = $1, email = $2, phone = $3, default_address = $4 WHERE user_id = $5 RETURNING user_id',
    [fullName, email, phone, address, req.user.user_id],
  )
  if (!result.rowCount) throw fail('Пользователь не найден.', 404)
  res.json(await getUserDetails(req.user.user_id))
}))

app.post('/api/profile/change-password', authenticateToken, asyncRoute(async (req, res) => {
  const currentPassword = String(req.body.current_password || '')
  const newPassword = String(req.body.new_password || '')
  const validation = validatePassword(newPassword)
  if (!currentPassword) throw fail('Введите текущий пароль.')
  if (validation) throw fail(validation)
  if (currentPassword === newPassword) throw fail('Новый пароль должен отличаться от текущего.')
  const result = await pool.query('SELECT password_hash FROM Users WHERE user_id = $1', [req.user.user_id])
  if (!result.rowCount || !(await bcrypt.compare(currentPassword, result.rows[0].password_hash))) throw fail('Текущий пароль указан неверно.', 401)
  const hash = await bcrypt.hash(newPassword, 12)
  await pool.query('UPDATE Users SET password_hash = $1 WHERE user_id = $2', [hash, req.user.user_id])
  res.json({ message: 'Пароль успешно изменён.' })
}))

// Все JOIN-ы для корзины выполняются на сервере; клиенту не нужно восстанавливать связи по отдельным запросам.
app.get('/api/cart', authenticateToken, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT ci.quantity, s.service_id, s.name, s.description, s.duration_minutes, s.price,
            s.discount_percent, s.image_url, s.stock_quantity, c.name AS category_name,
            ROUND(s.price * (100 - s.discount_percent) / 100, 2) AS final_price
     FROM CartItems ci JOIN Services s ON s.service_id = ci.service_id
     JOIN Categories c ON c.category_id = s.category_id
     WHERE ci.user_id = $1 AND s.is_active = TRUE ORDER BY ci.cart_item_id`, [req.user.user_id],
  )
  res.json(result.rows)
}))

app.post('/api/cart/items', authenticateToken, asyncRoute(async (req, res) => {
  const serviceId = parsePositiveInteger(req.body.service_id, 'Услуга')
  const quantity = parsePositiveInteger(req.body.quantity ?? 1, 'Количество', 1, 100)
  if (serviceId.error) throw fail(serviceId.error)
  if (quantity.error) throw fail(quantity.error)
  const service = await pool.query('SELECT stock_quantity FROM Services WHERE service_id = $1 AND is_active = TRUE', [serviceId.value])
  if (!service.rowCount) throw fail('Услуга больше недоступна.', 404)
  const existing = await pool.query('SELECT quantity FROM CartItems WHERE user_id = $1 AND service_id = $2', [req.user.user_id, serviceId.value])
  const target = Math.min(Number(service.rows[0].stock_quantity), (existing.rows[0]?.quantity || 0) + quantity.value)
  if (target < 1) throw fail('Услуги нет в наличии.', 409)
  await pool.query(
    `INSERT INTO CartItems (user_id, service_id, quantity) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, service_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = CURRENT_TIMESTAMP`,
    [req.user.user_id, serviceId.value, target],
  )
  res.status(201).json({ message: 'Корзина обновлена.', cart: await getCart(req.user.user_id) })
}))

async function getCart(userId, executor = pool) {
  const result = await executor.query(
    `SELECT ci.quantity, s.service_id, s.name, s.description, s.duration_minutes, s.price,
            s.discount_percent, s.image_url, s.stock_quantity, c.name AS category_name,
            ROUND(s.price * (100 - s.discount_percent) / 100, 2) AS final_price
     FROM CartItems ci JOIN Services s ON s.service_id = ci.service_id
     JOIN Categories c ON c.category_id = s.category_id
     WHERE ci.user_id = $1 AND s.is_active = TRUE ORDER BY ci.cart_item_id`, [userId],
  )
  return result.rows
}

app.patch('/api/cart/items/:serviceId', authenticateToken, asyncRoute(async (req, res) => {
  const serviceId = parsePositiveInteger(req.params.serviceId, 'Услуга')
  const quantity = parsePositiveInteger(req.body.quantity, 'Количество', 1, 100)
  if (serviceId.error) throw fail(serviceId.error)
  if (quantity.error) throw fail(quantity.error)
  const result = await pool.query(
    `UPDATE CartItems ci SET quantity = $1, updated_at = CURRENT_TIMESTAMP
     FROM Services s WHERE ci.service_id = s.service_id AND ci.service_id = $2
       AND ci.user_id = $3 AND s.is_active = TRUE AND $1 <= s.stock_quantity RETURNING ci.cart_item_id`,
    [quantity.value, serviceId.value, req.user.user_id],
  )
  if (!result.rowCount) throw fail('Количество превышает остаток на складе или позиция больше недоступна.', 409)
  res.json(await getCart(req.user.user_id))
}))

app.delete('/api/cart/items/:serviceId', authenticateToken, asyncRoute(async (req, res) => {
  const serviceId = parsePositiveInteger(req.params.serviceId, 'Услуга')
  if (serviceId.error) throw fail(serviceId.error)
  await pool.query('DELETE FROM CartItems WHERE user_id = $1 AND service_id = $2', [req.user.user_id, serviceId.value])
  res.json(await getCart(req.user.user_id))
}))

app.delete('/api/cart', authenticateToken, asyncRoute(async (req, res) => {
  await pool.query('DELETE FROM CartItems WHERE user_id = $1', [req.user.user_id])
  res.json({ message: 'Корзина очищена.' })
}))

app.post('/api/cart/merge', authenticateToken, asyncRoute(async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : []
  for (const item of items.slice(0, 50)) {
    const serviceId = Number(item.service_id)
    const quantity = Number(item.quantity)
    if (!Number.isInteger(serviceId) || !Number.isInteger(quantity) || quantity < 1) continue
    await pool.query(
      `INSERT INTO CartItems (user_id, service_id, quantity)
       SELECT $1, s.service_id, LEAST($3, s.stock_quantity) FROM Services s
       WHERE s.service_id = $2 AND s.is_active = TRUE AND s.stock_quantity > 0
       ON CONFLICT (user_id, service_id) DO UPDATE SET
       quantity = LEAST(CartItems.quantity + EXCLUDED.quantity,
         (SELECT stock_quantity FROM Services WHERE service_id = EXCLUDED.service_id)),
       updated_at = CURRENT_TIMESTAMP`, [req.user.user_id, serviceId, Math.min(quantity, 100)],
    )
  }
  res.json(await getCart(req.user.user_id))
}))

app.post('/api/coupons/validate', authenticateToken, asyncRoute(async (req, res) => {
  const code = cleanText(req.body.code || '').toUpperCase()
  if (!/^[A-Z0-9-]{3,40}$/.test(code)) throw fail('Введите корректный код купона.')
  const result = await pool.query(
    'SELECT code, discount_percent FROM UserCoupons WHERE user_id = $1 AND UPPER(code) = $2 AND is_active = TRUE',
    [req.user.user_id, code],
  )
  if (!result.rowCount) throw fail('Купон не найден, не активен или принадлежит другому пользователю.', 404)
  res.json(result.rows[0])
}))

// Checkout создает один заказ со всеми позициями, сохраняет снимки и уменьшает складские остатки в транзакции.
app.post('/api/orders', authenticateToken, asyncRoute(async (req, res) => {
  const address = cleanText(req.body.delivery_address)
  const deliveryDate = String(req.body.delivery_date || '')
  if (address.length < 5 || address.length > 250 || /[<>\u0000-\u001F]/.test(address) || containsProfanity(address)) throw fail('Введите корректный адрес доставки (от 5 до 250 символов).')
  if (!isValidDate(deliveryDate)) throw fail('Укажите корректную дату доставки.')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const dateCheck = await client.query('SELECT $1::date >= CURRENT_DATE AS valid', [deliveryDate])
    if (!dateCheck.rows[0].valid) throw fail('Дата доставки не может быть раньше сегодняшнего дня.')
    const cartResult = await client.query(
      `SELECT ci.quantity, s.service_id, s.name, s.image_url, s.duration_minutes,
              s.price, s.discount_percent, s.stock_quantity
       FROM CartItems ci JOIN Services s ON s.service_id = ci.service_id
       WHERE ci.user_id = $1 AND s.is_active = TRUE FOR UPDATE OF s`, [req.user.user_id],
    )
    if (!cartResult.rowCount) throw fail('Корзина пуста. Добавьте услуги перед оформлением заказа.')
    if (cartResult.rowCount > 50) throw fail('В заказе может быть не более 50 разных позиций.')
    const couponCode = cleanText(req.body.coupon_code || '').toUpperCase()
    let couponPercent = 0
    let appliedCode = null
    if (couponCode) {
      const coupon = await client.query(
        'SELECT code, discount_percent FROM UserCoupons WHERE user_id = $1 AND UPPER(code) = $2 AND is_active = TRUE',
        [req.user.user_id, couponCode],
      )
      if (!coupon.rowCount) throw fail('Купон не найден, не активен или принадлежит другому пользователю.')
      couponPercent = Number(coupon.rows[0].discount_percent)
      appliedCode = coupon.rows[0].code
    }
    let subtotal = 0
    const items = []
    for (const row of cartResult.rows) {
      const quantity = Number(row.quantity)
      if (quantity > Number(row.stock_quantity)) throw fail(`Недостаточно товара «${row.name}» на складе. Доступно: ${row.stock_quantity}.`, 409)
      const unitBeforeCoupon = Number((Number(row.price) * (1 - Number(row.discount_percent) / 100)).toFixed(2))
      const unitPrice = Number((unitBeforeCoupon * (1 - couponPercent / 100)).toFixed(2))
      const totalPrice = Number((unitPrice * quantity).toFixed(2))
      subtotal += Number((unitBeforeCoupon * quantity).toFixed(2))
      items.push({ ...row, unitPrice, totalPrice, quantity })
    }
    subtotal = Number(subtotal.toFixed(2))
    const discountAmount = Number((subtotal * couponPercent / 100).toFixed(2))
    const totalPrice = Number((subtotal - discountAmount).toFixed(2))
    const orderResult = await client.query(
      `INSERT INTO Orders (user_id, delivery_address, delivery_date, status, coupon_code,
        coupon_discount_percent, subtotal, discount_amount, total_price)
       VALUES ($1, $2, $3, 'new', $4, $5, $6, $7, $8) RETURNING order_id`,
      [req.user.user_id, address, deliveryDate, appliedCode, couponPercent, subtotal, discountAmount, totalPrice],
    )
    const orderId = orderResult.rows[0].order_id
    for (const item of items) {
      await client.query(
        `INSERT INTO OrderItems (order_id, service_id, service_name, image_url, duration_minutes,
          quantity, base_price, service_discount_percent, unit_price, total_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [orderId, item.service_id, item.name, item.image_url, item.duration_minutes, item.quantity,
          item.price, item.discount_percent, item.unitPrice, item.totalPrice],
      )
      await client.query('UPDATE Services SET stock_quantity = stock_quantity - $1 WHERE service_id = $2', [item.quantity, item.service_id])
    }
    await client.query('DELETE FROM CartItems WHERE user_id = $1', [req.user.user_id])
    await client.query('UPDATE Users SET default_address = $1 WHERE user_id = $2', [address, req.user.user_id])
    await client.query('COMMIT')
    res.status(201).json({ message: 'Заказ успешно оформлен.', order_id: orderId, subtotal, discount_amount: discountAmount,
      coupon_code: appliedCode, coupon_discount_percent: couponPercent, total_price: totalPrice, items: items.map((item) => ({
        service_name: item.name, quantity: item.quantity, unit_price: item.unitPrice, total_price: item.totalPrice,
      })) })
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}))

async function loadOrders(whereSql = '', values = []) {
  const result = await pool.query(
    `SELECT o.order_id, o.delivery_address, o.delivery_date, o.status, o.coupon_code,
            o.coupon_discount_percent, o.subtotal, o.discount_amount, o.total_price, o.created_at,
            u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
            COALESCE(json_agg(json_build_object('service_name', oi.service_name, 'image_url', oi.image_url,
              'duration_minutes', oi.duration_minutes, 'quantity', oi.quantity, 'unit_price', oi.unit_price,
              'total_price', oi.total_price)) FILTER (WHERE oi.order_item_id IS NOT NULL), '[]'::json) AS items
     FROM Orders o JOIN Users u ON u.user_id = o.user_id
     LEFT JOIN OrderItems oi ON oi.order_id = o.order_id ${whereSql}
     GROUP BY o.order_id, u.full_name, u.email, u.phone ORDER BY o.created_at DESC, o.order_id DESC`, values,
  )
  return result.rows.map((order) => ({ ...order, status_label: STATUS_LABELS[order.status] || order.status }))
}

app.get('/api/orders/my', authenticateToken, asyncRoute(async (req, res) => {
  res.json(await loadOrders('WHERE o.user_id = $1', [req.user.user_id]))
}))
app.get('/api/admin/orders', authenticateToken, requireAdmin, asyncRoute(async (_req, res) => {
  res.json(await loadOrders())
}))
app.patch('/api/admin/orders/:id/status', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
  const orderId = parsePositiveInteger(req.params.id, 'Заказ')
  if (orderId.error) throw fail(orderId.error)
  const status = String(req.body.status || '')
  if (!ORDER_STATUSES.includes(status)) throw fail('Выберите допустимый статус заказа.')
  const client = await pool.connect()
  let result
  try {
    await client.query('BEGIN')
    const current = await client.query('SELECT status FROM Orders WHERE order_id = $1 FOR UPDATE', [orderId.value])
    if (!current.rowCount) throw fail('Заказ не найден.', 404)
    const previousStatus = current.rows[0].status
    if (previousStatus !== 'cancelled' && status === 'cancelled') {
      await client.query(
        `UPDATE Services s SET stock_quantity = s.stock_quantity + oi.quantity
         FROM OrderItems oi WHERE oi.order_id = $1 AND oi.service_id = s.service_id`, [orderId.value],
      )
    } else if (previousStatus === 'cancelled' && status !== 'cancelled') {
      const items = await client.query('SELECT service_id, quantity, service_name FROM OrderItems WHERE order_id = $1 AND service_id IS NOT NULL', [orderId.value])
      for (const item of items.rows) {
        const stock = await client.query('SELECT stock_quantity FROM Services WHERE service_id = $1 FOR UPDATE', [item.service_id])
        if (!stock.rowCount || Number(stock.rows[0].stock_quantity) < Number(item.quantity)) {
          throw fail(`Нельзя вернуть заказ в работу: недостаточно остатка услуги «${item.service_name}».`, 409)
        }
        await client.query('UPDATE Services SET stock_quantity = stock_quantity - $1 WHERE service_id = $2', [item.quantity, item.service_id])
      }
    }
    result = await client.query('UPDATE Orders SET status = $1 WHERE order_id = $2 RETURNING order_id, status', [status, orderId.value])
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  res.json({ ...result.rows[0], status_label: STATUS_LABELS[status] })
}))

// Удаление заказа доступно только администратору. Если заказ не был отменён, остатки возвращаются на склад.
app.delete('/api/admin/orders/:id', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
  const orderId = parsePositiveInteger(req.params.id, 'Заказ')
  if (orderId.error) throw fail(orderId.error)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const order = await client.query('SELECT status FROM Orders WHERE order_id = $1 FOR UPDATE', [orderId.value])
    if (!order.rowCount) throw fail('Заказ не найден.', 404)
    if (order.rows[0].status !== 'cancelled') {
      await client.query(
        `UPDATE Services s SET stock_quantity = s.stock_quantity + oi.quantity
         FROM OrderItems oi WHERE oi.order_id = $1 AND oi.service_id = s.service_id`, [orderId.value],
      )
    }
    await client.query('DELETE FROM Orders WHERE order_id = $1', [orderId.value])
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  res.json({ message: `Заказ №${orderId.value} удалён. Складские остатки обновлены.` })
}))

// Отзывы показываются с именами пользователей через JOIN; пользователь может оставить один отзыв на услугу.
app.get('/api/reviews', asyncRoute(async (req, res) => {
  const values = []
  let filter = ''
  if (req.query.service_id) {
    const serviceId = parsePositiveInteger(req.query.service_id, 'Услуга')
    if (serviceId.error) throw fail(serviceId.error)
    values.push(serviceId.value)
    filter = `WHERE r.service_id = $${values.length}`
  }
  const result = await pool.query(
    `SELECT r.review_id, r.rating, r.comment, r.created_at, u.full_name AS author_name,
            s.service_id, s.name AS service_name
     FROM Reviews r JOIN Users u ON u.user_id = r.user_id
     JOIN Services s ON s.service_id = r.service_id ${filter}
     ORDER BY r.created_at DESC, r.review_id DESC`, values,
  )
  res.json(result.rows)
}))
app.post('/api/services/:id/reviews', authenticateToken, asyncRoute(async (req, res) => {
  const serviceId = parsePositiveInteger(req.params.id, 'Услуга')
  const rating = parsePositiveInteger(req.body.rating, 'Оценка', 1, 5)
  if (serviceId.error) throw fail(serviceId.error)
  if (rating.error) throw fail('Оценка должна быть от 1 до 5.')
  const comment = String(req.body.comment ?? '').trim()
  if (comment.length < 3 || comment.length > 1000 || /[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(comment)) throw fail('Комментарий должен содержать от 3 до 1000 символов без HTML-тегов.')
  if (containsProfanity(comment)) throw fail('Комментарий содержит недопустимую лексику. Измените текст отзыва.')
  const service = await pool.query('SELECT service_id FROM Services WHERE service_id = $1 AND is_active = TRUE', [serviceId.value])
  if (!service.rowCount) throw fail('Услуга не найдена.', 404)
  const result = await pool.query(
    `INSERT INTO Reviews (user_id, service_id, rating, comment) VALUES ($1,$2,$3,$4)
     RETURNING review_id`, [req.user.user_id, serviceId.value, rating.value, comment],
  )
  const review = await pool.query(
    `SELECT r.review_id, r.rating, r.comment, r.created_at, u.full_name AS author_name,
            s.service_id, s.name AS service_name FROM Reviews r JOIN Users u ON u.user_id = r.user_id
     JOIN Services s ON s.service_id = r.service_id WHERE r.review_id = $1`, [result.rows[0].review_id],
  )
  res.status(201).json(review.rows[0])
}))
app.get('/api/admin/reviews', authenticateToken, requireAdmin, asyncRoute(async (_req, res) => {
  const result = await pool.query(
    `SELECT r.review_id, r.rating, r.comment, r.created_at, u.full_name AS author_name,
            u.email AS author_email, s.name AS service_name
     FROM Reviews r JOIN Users u ON u.user_id = r.user_id
     JOIN Services s ON s.service_id = r.service_id ORDER BY r.created_at DESC`,
  )
  res.json(result.rows)
}))
app.delete('/api/admin/reviews/:id', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
  const reviewId = parsePositiveInteger(req.params.id, 'Отзыв')
  if (reviewId.error) throw fail(reviewId.error)
  const result = await pool.query('DELETE FROM Reviews WHERE review_id = $1 RETURNING review_id', [reviewId.value])
  if (!result.rowCount) throw fail('Отзыв не найден.', 404)
  res.json({ message: 'Отзыв удалён.' })
}))

app.post('/api/admin/users', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
  const fullName = cleanText(req.body.full_name)
  const nameError = validateHumanText(fullName, 'ФИО', 2, 120)
  if (nameError) throw fail(nameError)
  const email = validateEmail(req.body.email)
  if (!email) throw fail('Введите корректный email.')
  const passwordError = validatePassword(req.body.password)
  if (passwordError) throw fail(passwordError)
  const phone = validatePhone(req.body.phone)
  if (!phone) throw fail('Введите корректный телефон: от 10 до 15 цифр.')
  const address = cleanText(req.body.default_address || '')
  if (address.length > 250 || /[<>\u0000-\u001F]/.test(address) || (address && containsProfanity(address))) throw fail('Проверьте адрес пользователя.')
  const role = await pool.query("SELECT role_id FROM Roles WHERE role_name = 'customer'")
  const passwordHash = await bcrypt.hash(req.body.password, 12)
  const created = await pool.query(
    `INSERT INTO Users (role_id, full_name, email, password_hash, phone, default_address)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING user_id`,
    [role.rows[0].role_id, fullName, email, passwordHash, phone, address],
  )
  res.status(201).json(await getUserDetails(created.rows[0].user_id))
}))

app.get('/api/admin/users', authenticateToken, requireAdmin, asyncRoute(async (_req, res) => {
  const result = await pool.query(
    `SELECT u.user_id, u.full_name, u.email, u.phone, u.default_address, u.is_active, u.created_at,
            r.role_name, c.code AS coupon_code, c.discount_percent AS coupon_discount_percent
     FROM Users u JOIN Roles r ON r.role_id = u.role_id
     LEFT JOIN UserCoupons c ON c.user_id = u.user_id AND c.is_active = TRUE
     ORDER BY u.created_at DESC`,
  )
  res.json(result.rows)
}))
app.put('/api/admin/users/:id', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
  const userId = parsePositiveInteger(req.params.id, 'Пользователь')
  if (userId.error) throw fail(userId.error)
  const fullName = cleanText(req.body.full_name)
  const nameError = validateHumanText(fullName, 'ФИО', 2, 120)
  if (nameError) throw fail(nameError)
  const email = validateEmail(req.body.email)
  if (!email) throw fail('Введите корректный email.')
  const phone = validatePhone(req.body.phone)
  if (!phone) throw fail('Введите корректный телефон: от 10 до 15 цифр.')
  const address = cleanText(req.body.default_address)
  if (address.length > 250 || /[<>\u0000-\u001F]/.test(address) || (address && containsProfanity(address))) throw fail('Проверьте адрес: максимум 250 символов.')
  const isActive = req.body.is_active === true || req.body.is_active === 'true'
  const exists = await pool.query('SELECT r.role_name FROM Users u JOIN Roles r ON r.role_id = u.role_id WHERE u.user_id = $1', [userId.value])
  if (!exists.rowCount) throw fail('Пользователь не найден.', 404)
  if (exists.rows[0].role_name === 'admin' && !isActive) throw fail('Нельзя заблокировать учётную запись администратора.')
  await pool.query('UPDATE Users SET full_name=$1,email=$2,phone=$3,default_address=$4,is_active=$5 WHERE user_id=$6',
    [fullName, email, phone, address, isActive, userId.value])
  res.json(await getUserDetails(userId.value))
}))

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
  const userId = parsePositiveInteger(req.params.id, 'Пользователь')
  if (userId.error) throw fail(userId.error)
  if (userId.value === Number(req.user.user_id)) throw fail('Нельзя заблокировать собственную учётную запись.')
  const target = await pool.query('SELECT r.role_name FROM Users u JOIN Roles r ON r.role_id = u.role_id WHERE u.user_id = $1', [userId.value])
  if (!target.rowCount) throw fail('Пользователь не найден.', 404)
  if (target.rows[0].role_name === 'admin') throw fail('Нельзя удалить или заблокировать администратора.')
  await pool.query('UPDATE Users SET is_active = FALSE WHERE user_id = $1', [userId.value])
  await pool.query('DELETE FROM CartItems WHERE user_id = $1', [userId.value])
  res.json({ message: 'Доступ пользователя заблокирован. История его заказов сохранена.' })
}))

const couponTypes = { WELCOME: 5, LOYALTY: 10, SPECIAL: 15 }
app.put('/api/admin/users/:id/coupon', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
  const userId = parsePositiveInteger(req.params.id, 'Пользователь')
  if (userId.error) throw fail(userId.error)
  const couponType = String(req.body.coupon_type || '').toUpperCase()
  if (!couponTypes[couponType]) throw fail('Выберите доступный тип купона.')
  const code = `${couponType}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  const result = await pool.query(
    `INSERT INTO UserCoupons (user_id, coupon_type, code, discount_percent, assigned_by, is_active)
     VALUES ($1,$2,$3,$4,$5,TRUE) ON CONFLICT (user_id) DO UPDATE SET
       coupon_type=EXCLUDED.coupon_type, code=EXCLUDED.code, discount_percent=EXCLUDED.discount_percent,
       assigned_by=EXCLUDED.assigned_by, is_active=TRUE, created_at=CURRENT_TIMESTAMP
     RETURNING code, discount_percent`, [userId.value, couponType, code, couponTypes[couponType], req.user.user_id],
  )
  res.json(result.rows[0])
}))

app.delete('/api/admin/users/:id/coupon', authenticateToken, requireAdmin, asyncRoute(async (req, res) => {
  const userId = parsePositiveInteger(req.params.id, 'Пользователь')
  if (userId.error) throw fail(userId.error)
  const result = await pool.query('UPDATE UserCoupons SET is_active = FALSE WHERE user_id = $1 RETURNING code', [userId.value])
  if (!result.rowCount) throw fail('У пользователя нет активного купона.', 404)
  res.json({ message: `Купон ${result.rows[0].code} отозван.` })
}))

app.use((req, res) => res.status(404).json({ error: 'Запрошенный адрес API не найден.' }))
app.use((error, _req, res, _next) => {
  console.error(error)
  if (error.code === '23505') {
    const field = String(error.constraint || '')
    return res.status(409).json({ error: field.includes('categories') ? 'Категория с таким названием уже существует. Регистр не учитывается.' : field.includes('email') ? 'Пользователь с таким email уже зарегистрирован.' : field.includes('reviews') ? 'Вы уже оставили отзыв на эту услугу.' : 'Запись с таким значением уже существует.' })
  }
  if (error.code === '23503') return res.status(400).json({ error: 'Нельзя выполнить действие: связанная запись не найдена.' })
  res.status(error.status || 500).json({ error: error.status ? error.message : 'Внутренняя ошибка сервера. Проверьте подключение к базе данных.' })
})

app.listen(PORT, () => {
  console.log(`Service Studio API запущен: http://localhost:${PORT}`)
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'development_secret_change_me') console.warn('Внимание: для реального развёртывания задайте собственный JWT_SECRET в backend/.env')
})
