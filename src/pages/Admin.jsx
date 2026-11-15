import { useEffect, useState } from 'react'
import { api, formatPrice } from '../api/client'

const emptyService = { category_id: '', name: '', description: '', duration_minutes: '30', price: '' }

export default function Admin() {
  const [categories, setCategories] = useState([])
  const [services, setServices] = useState([])
  const [users, setUsers] = useState([])
  const [categoryName, setCategoryName] = useState('')
  const [serviceForm, setServiceForm] = useState(emptyService)
  const [couponTypes, setCouponTypes] = useState({})
  const [discountDrafts, setDiscountDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [categoryData, serviceData, userData] = await Promise.all([
        api.get('/categories'), api.get('/services'), api.get('/admin/users'),
      ])
      setCategories(categoryData)
      setServices(serviceData)
      setUsers(userData)
      setServiceForm((current) => ({ ...current, category_id: current.category_id || String(categoryData[0]?.category_id || '') }))
      setDiscountDrafts(Object.fromEntries(serviceData.map((service) => [service.service_id, String(service.discount_percent)])))
      setCouponTypes((current) => {
        const next = { ...current }
        userData.forEach((user) => { if (!next[user.user_id]) next[user.user_id] = 'WELCOME' })
        return next
      })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  async function addCategory(event) {
    event.preventDefault()
    setError(''); setMessage(''); setSaving(true)
    try {
      await api.post('/categories', { name: categoryName })
      setCategoryName('')
      setMessage('Категория добавлена. Она автоматически появится в фильтре каталога.')
      await loadData()
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  async function addService(event) {
    event.preventDefault()
    setError(''); setMessage(''); setSaving(true)
    try {
      await api.post('/services', {
        ...serviceForm,
        category_id: Number(serviceForm.category_id),
        duration_minutes: Number(serviceForm.duration_minutes),
        price: Number(serviceForm.price),
      })
      setServiceForm((current) => ({ ...emptyService, category_id: current.category_id }))
      setMessage('Услуга добавлена в каталог.')
      await loadData()
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  async function saveDiscount(serviceId) {
    setError(''); setMessage(''); setSaving(true)
    try {
      const result = await api.patch(`/services/${serviceId}/discount`, { discount_percent: Number(discountDrafts[serviceId]) })
      setMessage(`Скидка для услуги «${result.name}» сохранена.`)
      await loadData()
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  async function assignCoupon(userId) {
    setError(''); setMessage(''); setSaving(true)
    try {
      const result = await api.put(`/admin/users/${userId}/coupon`, { coupon_type: couponTypes[userId] || 'WELCOME' })
      setMessage(`Пользователю назначен купон ${result.code} со скидкой ${result.discount_percent}%.`)
      await loadData()
    } catch (requestError) { setError(requestError.message) } finally { setSaving(false) }
  }

  if (loading) return <div className="loading-state">Загрузка панели администратора...</div>

  return (
    <section className="page-section">
      <div className="page-heading"><p className="eyebrow">УПРАВЛЕНИЕ ДАННЫМИ</p><h1>Панель администратора</h1><p className="muted">Управление категориями, услугами и персональными скидочными купонами.</p></div>
      {message && <div className="success-message">{message}</div>}
      {error && <div className="request-error compact-error">{error}</div>}

      <div className="admin-grid">
        <section className="admin-card">
          <div className="admin-card-heading"><span className="stat-icon">▦</span><div><h2>Категории</h2><p className="muted">Добавление категорий каталога</p></div></div>
          <form className="admin-form inline-admin-form" onSubmit={addCategory}>
            <label>Название категории<input required minLength="2" maxLength="100" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Например, Уход за волосами" /></label>
            <button className="primary-button" disabled={saving}>Добавить</button>
          </form>
          <div className="admin-tags">{categories.map((category) => <span key={category.category_id}>{category.name} <small>{category.services_count}</small></span>)}</div>
        </section>

        <section className="admin-card">
          <div className="admin-card-heading"><span className="stat-icon">＋</span><div><h2>Новая услуга</h2><p className="muted">Добавление услуги в каталог</p></div></div>
          <form className="admin-form" onSubmit={addService}>
            <label>Категория<select required value={serviceForm.category_id} onChange={(event) => setServiceForm({ ...serviceForm, category_id: event.target.value })}><option value="">Выберите категорию</option>{categories.map((category) => <option key={category.category_id} value={category.category_id}>{category.name}</option>)}</select></label>
            <label>Название<input required value={serviceForm.name} onChange={(event) => setServiceForm({ ...serviceForm, name: event.target.value })} /></label>
            <label>Описание<textarea required rows="3" value={serviceForm.description} onChange={(event) => setServiceForm({ ...serviceForm, description: event.target.value })} /></label>
            <div className="form-two-columns"><label>Длительность, мин<input required type="number" min="1" value={serviceForm.duration_minutes} onChange={(event) => setServiceForm({ ...serviceForm, duration_minutes: event.target.value })} /></label><label>Цена, ₽<input required type="number" min="0" step="1" value={serviceForm.price} onChange={(event) => setServiceForm({ ...serviceForm, price: event.target.value })} /></label></div>
            <button className="primary-button" disabled={saving || !categories.length}>Добавить услугу</button>
          </form>
        </section>
      </div>

      <section className="admin-card admin-wide-card">
        <div className="admin-card-heading"><span className="stat-icon">%</span><div><h2>Скидки на услуги</h2><p className="muted">Общая скидка для выбранной услуги. Значение 0 убирает скидку.</p></div></div>
        <div className="admin-service-list">
          {services.map((service) => <div className="admin-service-row" key={service.service_id}>
            <div><strong>{service.name}</strong><p className="muted">{service.category_name} · {formatPrice(service.price)}</p></div>
            <label className="discount-input">Скидка, %<input type="number" min="0" max="90" value={discountDrafts[service.service_id] ?? service.discount_percent} onChange={(event) => setDiscountDrafts({ ...discountDrafts, [service.service_id]: event.target.value })} /></label>
            <button className="secondary-button" disabled={saving} onClick={() => saveDiscount(service.service_id)}>Сохранить</button>
          </div>)}
        </div>
      </section>

      <section className="admin-card admin-wide-card">
        <div className="admin-card-heading"><span className="stat-icon">♙</span><div><h2>Персональные купоны</h2><p className="muted">Каждому пользователю назначается один персональный купон.</p></div></div>
        <div className="admin-user-list">
          {users.map((user) => <div className="admin-user-row" key={user.user_id}>
            <div><strong>{user.full_name}</strong><p className="muted">{user.email} · {user.role_name === 'admin' ? 'Администратор' : 'Пользователь'}</p>{user.coupon_code && <span className="existing-coupon">Текущий: {user.coupon_code} (−{user.coupon_discount_percent}%)</span>}</div>
            {user.role_name !== 'admin' ? <>
              <select value={couponTypes[user.user_id] || 'WELCOME'} onChange={(event) => setCouponTypes({ ...couponTypes, [user.user_id]: event.target.value })}>
                <option value="WELCOME">Приветственный — 5%</option><option value="LOYALTY">Постоянный клиент — 10%</option><option value="SPECIAL">Персональный — 15%</option>
              </select>
              <button className="secondary-button" disabled={saving} onClick={() => assignCoupon(user.user_id)}>Выдать купон</button>
            </> : <span className="small-muted">Купон не назначается администратору</span>}
          </div>)}
        </div>
      </section>
      <button className="text-button" onClick={loadData}>Обновить данные</button>
    </section>
  )
}
