
const mapLatin = {
  a: 'а', b: 'б', c: 'с', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'ж',
  k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'к', r: 'р', s: 'с', t: 'т',
  u: 'у', v: 'в', w: 'в', x: 'кс', y: 'ы', z: 'з',
}
const leet = { '0': 'о', '1': 'и', '3': 'з', '4': 'ч', '5': 'с', '6': 'б', '7': 'т', '@': 'а', '$': 'с' }
const blockedWords = [
  'бляд', 'блят', 'сука', 'сук', 'хуй', 'хуе', 'хуё', 'пизд', 'ебат', 'ебал', 'ебан', 'ёбан',
  'мудак', 'гандон', 'шлюх', 'залуп', 'манда', 'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'motherfucker',
]

function normalizeForModeration(value) {
  let text = String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  text = [...text].map((character) => leet[character] || mapLatin[character] || character).join('')
  return text.replace(/[^а-яёa-z]/g, '')
}

export function containsProfanity(value) {
  const normalized = normalizeForModeration(value)
  if (!normalized) return false
  // Проверка без разделителей: «ф у к», транслитерация и замена похожих символов.
  return blockedWords.some((word) => {
    const normalizedWord = normalizeForModeration(word)
    return normalized.includes(normalizedWord)
  })
}

export function cleanText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

export function validateHumanText(value, label, min = 2, max = 120) {
  const text = cleanText(value)
  if (text.length < min || text.length > max) return `${label}: допустимо от ${min} до ${max} символов.`
  if (/[<>\u0000-\u001F]/.test(text)) return `${label}: удалите HTML-теги и управляющие символы.`
  if (containsProfanity(text)) return `${label}: текст содержит недопустимую лексику.`
  return null
}

export function validateEmail(value) {
  const email = cleanText(value).toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[A-Za-zА-Яа-я]{2,}$/.test(email)) return null
  return email
}

export function validatePhone(value) {
  const phone = cleanText(value)
  const digits = phone.replace(/\D/g, '')
  if (!/^\+?[0-9()\-\s]{10,20}$/.test(phone) || digits.length < 10 || digits.length > 15) return null
  return phone
}

export function validatePassword(value) {
  const password = String(value ?? '')
  if (password.length < 8 || password.length > 72) return 'Пароль должен содержать от 8 до 72 символов.'
  if (!/[A-Za-zА-Яа-я]/.test(password) || !/\d/.test(password)) return 'Добавьте в пароль хотя бы одну букву и одну цифру.'
  return null
}

export function parsePositiveInteger(value, label, min = 1, max = 100000) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) return { error: `${label}: введите целое число от ${min} до ${max}.` }
  return { value: number }
}
