import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formatPrice } from '../api/client'
import { useApp } from '../context/AppContext'

export default function Account() {
  const { user } = useApp()
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/appointments/my')
      .then(setAppointments)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <section className="page-section">
      <div className="dashboard-welcome"><p className="eyebrow light-eyebrow">ЛИЧНЫЙ КАБИНЕТ</p><h1>Здравствуйте, {user.full_name}!</h1><p>Здесь отображаются персональный купон и созданные вами записи.</p></div>
      <div className="account-grid">
        <article className="stat-card"><span className="stat-icon">✉</span><span className="muted">Email</span><strong className="account-email">{user.email}</strong><span className="small-muted">Роль: {user.role_name === 'admin' ? 'Администратор' : 'Пользователь'}</span></article>
        <article className="stat-card coupon-card"><span className="stat-icon">%</span><span className="muted">Персональный купон</span>
          {user.coupon ? <><strong>{user.coupon.discount_percent}% скидка</strong><span className="coupon-code">{user.coupon.code}</span><span className="small-muted">Тип: {user.coupon.coupon_type}</span></> : <><strong>Нет купона</strong><span className="small-muted">Администратор может назначить персональную скидку.</span></>}
        </article>
      </div>
      <div className="section-heading account-heading"><div><p className="eyebrow">ИСТОРИЯ</p><h2>Мои записи</h2></div><Link to="/" className="primary-button small-button">Выбрать услугу</Link></div>
      {loading ? <div className="loading-state">Загрузка записей...</div> : error ? <div className="request-error">{error}</div> : appointments.length ? (
        <div className="appointment-list">
          {appointments.map((item) => <article className="appointment-row" key={item.appointment_id}>
            <div><strong>{item.service_name}</strong><p className="muted">{new Date(item.created_at).toLocaleString('ru-RU')} · {item.quantity} шт. · {item.duration_minutes} минут</p></div>
            <div className="appointment-right"><strong>{formatPrice(item.total_price)}</strong><span className="status-pill">{item.payment_status === 'pending' ? 'Ожидает оплаты' : item.payment_status}</span></div>
          </article>)}
        </div>
      ) : <div className="empty-state compact-empty"><span>✧</span><h3>Записей пока нет</h3><p>Добавьте услуги в корзину и создайте первую запись.</p></div>}
    </section>
  )
}
