import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { api, formatPrice } from '../api/client'

export default function Cart() {
  const { cart, removeFromCart, changeQuantity, clearCart, cartTotal, cartCount, subtotal, couponPercent, user } = useApp()
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const navigate = useNavigate()

  async function createAppointments() {
    if (!user) {
      navigate('/login', { state: { from: '/cart' } })
      return
    }
    setSending(true)
    setError('')
    setSuccess('')
    try {
      const result = await api.post('/appointments', {
        items: cart.map((item) => ({ service_id: item.service_id, quantity: item.quantity })),
      })
      setSuccess(`${result.message} Количество созданных записей: ${result.appointments.length}.`)
      clearCart()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="page-section">
      <div className="page-heading"><div><p className="eyebrow">ВАШ ВЫБОР</p><h1>Корзина</h1><p className="muted">Услуг в корзине: {cartCount}</p></div></div>
      {success && <div className="success-message">{success} <Link to="/account">Посмотреть записи</Link></div>}
      {error && <div className="request-error compact-error">{error}</div>}
      {cart.length === 0 ? (
        <div className="empty-state cart-empty"><span>✧</span><h2>Корзина пока пуста</h2><p>Добавьте услуги из каталога, и они появятся здесь.</p><Link to="/" className="primary-button">Перейти в каталог</Link></div>
      ) : (
        <div className="cart-layout">
          <div className="cart-list">
            {cart.map((item) => (
              <article className="cart-item" key={item.service_id}>
                <div className="cart-product-icon">✦</div>
                <div className="cart-item-info"><h3>{item.name}</h3><p className="muted">{item.duration_minutes} минут · {formatPrice(item.final_price)} за услугу</p></div>
                <div className="quantity-control">
                  <button onClick={() => changeQuantity(item.service_id, -1)} aria-label="Уменьшить количество">−</button>
                  <span>{item.quantity}</span>
                  <button onClick={() => changeQuantity(item.service_id, 1)} aria-label="Увеличить количество">+</button>
                </div>
                <strong className="cart-line-total">{formatPrice(Number(item.final_price) * item.quantity)}</strong>
                <button className="remove-button" onClick={() => removeFromCart(item.service_id)}>Удалить</button>
              </article>
            ))}
            <button className="text-button clear-button" onClick={clearCart}>Очистить корзину</button>
          </div>
          <aside className="summary-card">
            <p className="eyebrow">ВАШ ЗАКАЗ</p><h2>Итого</h2>
            <div className="summary-row"><span>Услуги ({cartCount})</span><span>{formatPrice(subtotal)}</span></div>
            {couponPercent > 0 && <div className="summary-row coupon-row"><span>Персональный купон −{couponPercent}%</span><span>−{formatPrice(subtotal - cartTotal)}</span></div>}
            <div className="summary-divider" />
            <div className="summary-total"><span>К оплате</span><strong>{formatPrice(cartTotal)}</strong></div>
            {!user && <p className="summary-note">Для создания записи необходимо войти в аккаунт.</p>}
            <button className="primary-button checkout-button" onClick={createAppointments} disabled={sending}>{sending ? 'Отправка...' : 'Создать запись'}</button>
            <p className="summary-note">Записи и платежи сохраняются в базе данных. Статус платежа после создания — «ожидает».</p>
          </aside>
        </div>
      )}
    </section>
  )
}
