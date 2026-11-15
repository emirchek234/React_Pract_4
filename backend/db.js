import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  database: process.env.PG_DATABASE || 'service_store',
  port: Number(process.env.PG_PORT || 5432),
})

pool.on('error', (error) => {
  console.error('Неожиданная ошибка соединения с PostgreSQL:', error)
})
