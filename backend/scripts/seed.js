import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { pool } from '../db.js'

async function seed() {
  const adminHash = await bcrypt.hash('Admin123!', 10)
  const clientHash = await bcrypt.hash('Client123!', 10)

  await pool.query(`INSERT INTO Roles (role_name) VALUES ('admin'), ('customer') ON CONFLICT (role_name) DO NOTHING`)

  const categories = ['Без категории', 'Маникюр и ногти', 'Уход за лицом', 'Массаж', 'Консультации']
  for (const name of categories) {
    await pool.query('INSERT INTO Categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name])
  }

  const adminRole = await pool.query("SELECT role_id FROM Roles WHERE role_name = 'admin'")
  const customerRole = await pool.query("SELECT role_id FROM Roles WHERE role_name = 'customer'")

  await pool.query(
    `INSERT INTO Users (role_id, full_name, email, password_hash, phone)
     VALUES ($1, 'Администратор', 'admin@demo.ru', $2, '+7 900 000-00-01')
     ON CONFLICT (email) DO UPDATE SET role_id = EXCLUDED.role_id, password_hash = EXCLUDED.password_hash, phone = EXCLUDED.phone`,
    [adminRole.rows[0].role_id, adminHash],
  )
  await pool.query(
    `INSERT INTO Users (role_id, full_name, email, password_hash, phone)
     VALUES ($1, 'Демо-пользователь', 'client@demo.ru', $2, '+7 900 000-00-02')
     ON CONFLICT (email) DO UPDATE SET role_id = EXCLUDED.role_id, password_hash = EXCLUDED.password_hash, phone = EXCLUDED.phone`,
    [customerRole.rows[0].role_id, clientHash],
  )

  const categoryRows = await pool.query('SELECT category_id, name FROM Categories')
  const categoryId = Object.fromEntries(categoryRows.rows.map((row) => [row.name, row.category_id]))
  const services = [
    [categoryId['Маникюр и ногти'], 'Классический маникюр', 'Обработка ногтей и кутикулы, придание формы и уход за руками.', 45, 1200, 0],
    [categoryId['Маникюр и ногти'], 'Маникюр с покрытием', 'Маникюр и однотонное покрытие с выравниванием ногтевой пластины.', 90, 2200, 15],
    [categoryId['Маникюр и ногти'], 'Укрепление ногтей', 'Укрепление натуральных ногтей и аккуратная форма.', 60, 1700, 0],
    [categoryId['Уход за лицом'], 'Уходовая процедура для лица', 'Комплексный уход с очищением, маской и увлажнением.', 60, 2600, 10],
    [categoryId['Уход за лицом'], 'Очищение лица', 'Деликатное очищение и завершающий уход по типу кожи.', 75, 2900, 0],
    [categoryId['Массаж'], 'Массаж спины', 'Сеанс расслабляющего массажа спины и плечевой зоны.', 40, 1800, 0],
    [categoryId['Массаж'], 'Расслабляющий массаж', 'Общий расслабляющий массаж для снятия напряжения.', 60, 3000, 20],
    [categoryId['Консультации'], 'Консультация специалиста', 'Индивидуальная консультация и подбор подходящей процедуры.', 30, 900, 0],
    [categoryId['Консультации'], 'Подбор домашнего ухода', 'Подбор средств и рекомендаций для домашнего ухода.', 35, 1100, 0],
    [categoryId['Уход за лицом'], 'Экспресс-уход', 'Короткая процедура очищения и увлажнения.', 30, 1500, 0],
  ]

  for (const service of services) {
    await pool.query(
      `INSERT INTO Services (category_id, name, description, duration_minutes, price, discount_percent)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (name) DO UPDATE SET
         category_id = EXCLUDED.category_id,
         description = EXCLUDED.description,
         duration_minutes = EXCLUDED.duration_minutes,
         price = EXCLUDED.price,
         discount_percent = EXCLUDED.discount_percent,
         is_active = TRUE`,
      service,
    )
  }

  const clientUser = await pool.query("SELECT user_id FROM Users WHERE email = 'client@demo.ru'")
  await pool.query(
    `INSERT INTO UserCoupons (user_id, coupon_type, code, discount_percent, is_active)
     VALUES ($1, 'WELCOME', 'WELCOME-5', 5, TRUE)
     ON CONFLICT (user_id) DO NOTHING`,
    [clientUser.rows[0].user_id],
  )

  console.log('Начальные данные добавлены.')
  console.log('Администратор: admin@demo.ru / Admin123!')
  console.log('Пользователь: client@demo.ru / Client123!')
  await pool.end()
}

seed().catch(async (error) => {
  console.error('Ошибка начального заполнения БД:', error)
  await pool.end()
  process.exit(1)
})
