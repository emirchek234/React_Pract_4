const API_BASE = '/api'

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('service-store-token')
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  } catch {
    throw new Error('Не удалось связаться с API. Проверьте, запущен ли сервер на порту 3001.')
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Ошибка запроса (${response.status}).`)
  return data
}

export const api = {
  get: (path) => apiRequest(path),
  post: (path, body) => apiRequest(path, { method: 'POST', body: JSON.stringify(body) }),
  delete: (path) => apiRequest(path, { method: 'DELETE' }),
  put: (path, body) => apiRequest(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => apiRequest(path, { method: 'PATCH', body: JSON.stringify(body) }),
  uploadImage: async (path, file) => {
    const token = localStorage.getItem('service-store-token')
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    let response
    try {
      const formData = new FormData()
      formData.append('image', file)
      response = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: formData })
    } catch {
      throw new Error('Не удалось связаться с API. Проверьте, запущен ли сервер на порту 3001.')
    }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `Ошибка загрузки (${response.status}).`)
    return data
  },
}

export function formatPrice(value) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)
}
