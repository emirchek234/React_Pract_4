import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formatPrice } from '../api/client'
import { useApp } from '../context/AppContext'

// Личный кабинет редактирует профиль, меняет пароль и показывает историю заказов.
export default function Account() {
  const { user, setUser } = useApp()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState({ full_name: user.full_name || '', email: user.email || '', phone: user.phone || '', default_address: user.default_address || '' })
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [profileError, setProfileError] = useState('')
  const [passwordError, setPasswordError] = useState('')

  useEffect(() => {
    api.get('/orders/my').then(setOrders).catch((requestError) => setError(requestError.message)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setProfile({ full_name: user.full_name || '', email: user.email || '', phone: user.phone || '', default_address: user.default_address || '' })
  }, [user.full_name, user.email, user.phone, user.default_address])

  function updateProfile(field, value) { setProfile((current) => ({ ...current, [field]: value })); setProfileMessage('') }
  async function saveProfile(event) {
    event.preventDefault(); setProfileError(''); setProfileMessage('')
    if (profile.full_name.trim().length < 2) return setProfileError('Введите полное имя.')
    if (!/^\S+@\S+\.\S+$/.test(profile.email.trim())) return setProfileError('Введите корректный email.')
    if (profile.phone.replace(/\D/g, '').length < 10 || profile.phone.replace(/\D/g, '').length > 15) return setProfileError('Проверьте номер телефона: от 10 до 15 цифр.')
    if (profile.default_address.length > 250) return setProfileError('Адрес не должен превышать 250 символов.')
    setSavingProfile(true)
    try { const result = await api.put('/profile', profile); setUser(result); setProfileMessage('Личные данные сохранены.') }
    catch (requestError) { setProfileError(requestError.message) }
    finally { setSavingProfile(false) }
  }

  async function changePassword(event) {
    event.preventDefault(); setPasswordError(''); setPasswordMessage('')
    if (!passwords.current_password) return setPasswordError('Введите текущий пароль.')
    if (passwords.new_password.length < 8 || !/[A-Za-zА-Яа-я]/.test(passwords.new_password) || !/\d/.test(passwords.new_password)) return setPasswordError('Новый пароль должен содержать не менее 8 символов, букву и цифру.')
    setSavingPassword(true)
    try { const result = await api.post('/profile/change-password', passwords); setPasswordMessage(result.message); setPasswords({ current_password: '', new_password: '' }) }
    catch (requestError) { setPasswordError(requestError.message) }
    finally { setSavingPassword(false) }
  }

  return (
    <section className="page-section">
      <div className="dashboard-welcome"><p className="eyebrow light-eyebrow">ЛИЧНЫЙ КАБИНЕТ</p><h1>Здравствуйте, {user.full_name}!</h1><p>Управляйте личными данными и проверяйте историю заказов.</p></div>
      <div className="account-grid">
        <article className="stat-card"><span className="stat-icon">✉</span><span className="muted">Email</span><strong className="account-email">{user.email}</strong><span className="small-muted">Роль: {user.role_name === 'admin' ? 'Администратор' : 'Пользователь'}</span></article>
        <article className="stat-card coupon-card"><span className="stat-icon">%</span><span className="muted">Персональный купон</span>
          {user.coupon ? <><strong>{user.coupon.discount_percent}% скидка</strong><span className="coupon-code">{user.coupon.code}</span><span className="small-muted">Введите этот код в корзине при оформлении.</span></> : <><strong>Нет купона</strong><span className="small-muted">Администратор может назначить персональную скидку.</span></>}
        </article>
      </div>

      <div className="account-edit-grid">
        <section className="admin-card account-form-card"><h2>Личная информация</h2><p className="muted">Сохранённый адрес автоматически подставляется при оформлении заказа.</p>
          <form className="admin-form" onSubmit={saveProfile}>
            <label>ФИО<input value={profile.full_name} onChange={(event) => updateProfile('full_name', event.target.value)} minLength="2" maxLength="120" required /></label>
            <label>Email<input type="email" value={profile.email} onChange={(event) => updateProfile('email', event.target.value)} maxLength="254" required /></label>
            <label>Телефон<input type="tel" value={profile.phone} onChange={(event) => updateProfile('phone', event.target.value)} maxLength="20" required /></label>
            <label>Адрес по умолчанию<input value={profile.default_address} onChange={(event) => updateProfile('default_address', event.target.value)} maxLength="250" placeholder="Город, улица, дом, квартира" /></label>
            {profileError && <p className="form-error">{profileError}</p>}{profileMessage && <p className="success-message">{profileMessage}</p>}
            <button className="primary-button" disabled={savingProfile}>{savingProfile ? 'Сохранение…' : 'Сохранить изменения'}</button>
          </form>
        </section>
        <section className="admin-card account-form-card"><h2>Изменение пароля</h2><p className="muted">Подтвердите текущий пароль и задайте новый.</p>
          <form className="admin-form" onSubmit={changePassword}>
            <label>Текущий пароль<input type="password" value={passwords.current_password} onChange={(event) => setPasswords((current) => ({ ...current, current_password: event.target.value }))} autoComplete="current-password" required /></label>
            <label>Новый пароль<input type="password" value={passwords.new_password} onChange={(event) => setPasswords((current) => ({ ...current, new_password: event.target.value }))} minLength="8" maxLength="72" autoComplete="new-password" required /></label>
            <p className="small-muted">Не менее 8 символов, минимум одна буква и одна цифра.</p>
            {passwordError && <p className="form-error">{passwordError}</p>}{passwordMessage && <p className="success-message">{passwordMessage}</p>}
            <button className="primary-button" disabled={savingPassword}>{savingPassword ? 'Сохранение…' : 'Изменить пароль'}</button>
          </form>
        </section>
      </div>

      <div className="section-heading account-heading"><div><p className="eyebrow">ИСТОРИЯ</p><h2>Мои заказы</h2></div><Link to="/" className="primary-button small-button">Выбрать услуги</Link></div>
      {loading ? <div className="loading-state">Загрузка истории заказов…</div> : error ? <div className="request-error">{error}</div> : orders.length ? (
        <div className="appointment-list">
          {orders.map((order) => <article className="order-history-card" key={order.order_id}>
            <div className="order-history-heading"><div><strong>Заказ №{order.order_id}</strong><p className="muted">Создан: {new Date(order.created_at).toLocaleString('ru-RU')} · Доставка: {new Date(`${order.delivery_date}T00:00:00`).toLocaleDateString('ru-RU')}</p></div><span className={`status-pill status-${order.status}`}>{order.status_label}</span></div>
            <div className="order-history-items">{order.items.map((item, index) => <div className="order-history-item" key={`${order.order_id}-${index}`}>
              {item.image_url ? <img src={item.image_url} alt="" /> : <span className="mini-product-placeholder">✦</span>}
              <span>{item.service_name}</span><span>{item.quantity} шт.</span><strong>{formatPrice(item.total_price)}</strong>
            </div>)}</div>
            <p className="muted order-address">Адрес доставки: {order.delivery_address}</p>
            {order.coupon_code && <p className="coupon-applied">Купон {order.coupon_code} · скидка {order.coupon_discount_percent}% · −{formatPrice(order.discount_amount)}</p>}
            <div className="order-history-total"><span>Итого</span><strong>{formatPrice(order.total_price)}</strong></div>
          </article>)}
        </div>
      ) : <div className="empty-state compact-empty"><span>✧</span><h3>Заказов пока нет</h3><p>Добавьте услуги в корзину и оформите первый заказ.</p></div>}
    </section>
  )
}
