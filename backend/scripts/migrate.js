import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from '../db.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

async function migrate() {
  for (const migration of ['003_extended_store.sql', '004_permanent_uncategorized.sql']) {
    const sql = await fs.readFile(path.join(dirname, `../../database/migrations/${migration}`), 'utf8')
    await pool.query(sql)
    console.log(`Миграция ${migration} успешно выполнена.`)
  }
}

migrate().catch((error) => {
  console.error('Не удалось выполнить миграцию:', error.message)
  process.exitCode = 1
}).finally(() => pool.end())
