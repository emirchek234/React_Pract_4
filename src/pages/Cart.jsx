import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { api, formatPrice } from '../api/client'

function localDateValue() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

// Корзина синхронизируется с сервером для авторизованного пользователя и оформляет заказ.
export default function Cart() {
  const { cart, removeFromCart, changeQuantity, clearCart, cartCount, subtotal, user, refreshCart, setUser } = useApp()
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(null)
  const [address, setAddress] = useState(user?.default_address || '')
  const [deliveryDate, setDeliveryDate] = useState(localDateValue())
  const [couponCode, setCouponCode] = useState(user?.coupon?.code || '')
  const [couponMessage, setCouponMessage] = useState('')
  const [couponPercent, setCouponPercent] = useState(0)
  const [couponLoading, setCouponLoading] = useState(false)
  const navigate = useNavigate()

  const discount = useMemo(() => subtotal * couponPercent / 100, [subtotal, couponPercent])
  const total = Math.max(0, subtotal - discount)

  useEffect(() => {
    setAddress(user?.default_address || '')
  }, [user?.user_id, user?.default_address])
  useEffect(() => {
    if (user?.coupon?.code && !couponCode) setCouponCode(user.coupon.code)
  }, [user?.coupon?.code, couponCode])

  async function removeItem(id) {
    setError('')
    try { await removeFromCart(id) } catch (requestError) { setError(requestError.message) }
  }
  async function changeItem(id, delta) {
    setError('')
    try { await changeQuantity(id, delta) } catch (requestError) { setError(requestError.message) }
  }
  async function emptyCart() {
    setError('')
    try { await clearCart() } catch (requestError) { setError(requestError.message) }
  }

  async function applyCoupon() {
    if (!couponCode.trim()) { setCouponPercent(0); setCouponMessage('Купон не применяется.'); return }
    setCouponLoading(true); setCouponMessage(''); setError('')
    try {
      const data = await api.post('/coupons/validate', { code: couponCode.trim() })
      setCouponPercent(Number(data.discount_percent))
      setCouponCode(data.code)
      setCouponMessage(`Купон ${data.code} применён: скидка ${data.discount_percent}%.`)
    } catch (requestError) { setCouponPercent(0); setCouponMessage(requestError.message) }
    finally { setCouponLoading(false) }
  }

  async function createOrder(event) {
    event.preventDefault()
    if (!user) { navigate('/login', { state: { from: '/cart' } }); return }
    if (address.trim().length < 5 || address.trim().length > 250) { setError('Адрес должен содержать от 5 до 250 символов.'); return }
    if (!deliveryDate || deliveryDate < localDateValue()) { setError('Дата доставки не может быть раньше сегодняшнего дня.'); return }
    setSending(true); setError(''); setSuccess(null)
    try {
      const result = await api.post('/orders', { delivery_address: address.trim(), delivery_date: deliveryDate, coupon_code: couponPercent ? couponCode : '' })
      setSuccess(result)
      await refreshCart()
      setUser({ ...user, default_address: address.trim() })
      setCouponPercent(0)
      setCouponCode('')
      setCouponMessage('')
    } catch (requestError) { setError(requestError.message) }
    finally { setSending(false) }
  }

  return (
    <section className="page-section">
      <div className="page-heading"><div><p className="eyebrow">ВАШ ВЫБОР</p><h1>Корзина</h1><p className="muted">Позиции в корзине: {cartCount}</p></div></div>
      {success && <div className="success-message order-success">
        <strong>Заказ №{success.order_id} оформлен.</strong>
        <p>Состав заказа сохранён на сервере:</p>
        {success.items.map((item, index) => <p key={`${item.service_name}-${index}`}>{item.service_name} · {item.quantity} шт. · {formatPrice(item.total_price)}</p>)}
        {success.coupon_code && <p>Применён купон {success.coupon_code}: −{success.coupon_discount_percent}% (−{formatPrice(success.discount_amount)}).</p>}
        <p>Итого: <strong>{formatPrice(success.total_price)}</strong></p>
        <Link to="/account">Перейти к истории заказов</Link>
      </div>}
      {error && <div className="request-error compact-error">{error}</div>}
      {!cart.length ? (
        <div className="empty-state cart-empty"><span>✧</span><h2>Корзина пока пуста</h2><p>Добавьте услуги из каталога, и они появятся здесь.</p><Link to="/" className="primary-button">Перейти в каталог</Link></div>
      ) : (
        <div className="cart-layout">
          <div className="cart-list">
            {cart.map((item) => (
              <article className="cart-item cart-item-with-image" key={item.service_id}>
                <div className="cart-product-icon">{item.image_url ? <img src={item.image_url} alt={item.name} /> : '✦'}</div>
                <div className="cart-item-info"><h3>{item.name}</h3><p className="muted">{item.category_name} · {item.duration_minutes} минут</p><p className="muted">{formatPrice(item.final_price)} за штуку · На складе: {item.stock_quantity}</p></div>
                <div className="quantity-control"><button onClick={() => changeItem(item.service_id, -1)} aria-label="Уменьшить количество" disabled={item.quantity <= 1}>−</button><span>{item.quantity}</span><button onClick={() => changeItem(item.service_id, 1)} aria-label="Увеличить количество" disabled={item.quantity >= Number(item.stock_quantity)}>+</button></div>
                <strong className="cart-line-total">{formatPrice(Number(item.final_price) * item.quantity)}</strong>
                <button className="remove-button" onClick={() => removeItem(item.service_id)}>Удалить</button>
              </article>
            ))}
            <button className="text-button clear-button" onClick={emptyCart}>Очистить корзину</button>
          </div>
          <aside className="summary-card">
            <p className="eyebrow">ВАШ ЗАКАЗ</p><h2>Итого</h2>
            <div className="summary-row"><span>Позиции ({cartCount} шт.)</span><span>{formatPrice(subtotal)}</span></div>
            {user && <div className="coupon-entry">
              <label htmlFor="coupon-code">Персональный купон</label>
              <div className="coupon-input-row"><input id="coupon-code" value={couponCode} onChange={(event) => { setCouponCode(event.target.value.toUpperCase()); setCouponPercent(0); setCouponMessage('') }} placeholder="Введите код" maxLength="40" /><button className="secondary-button" type="button" onClick={applyCoupon} disabled={couponLoading || !couponCode.trim()}>{couponLoading ? 'Проверка…' : 'Применить'}</button></div>
              {couponMessage && <p className={couponPercent ? 'coupon-applied' : 'form-error'}>{couponMessage}</p>}
            </div>}
            {couponPercent > 0 && <div className="summary-row coupon-row"><span>{couponCode} · −{couponPercent}%</span><span>−{formatPrice(discount)}</span></div>}
            <div className="summary-divider" />
            <div className="summary-total"><span>К оплате</span><strong>{formatPrice(total)}</strong></div>
            {!user ? <><p className="summary-note">Войдите в аккаунт, чтобы оформить заказ и сохранить корзину на сервере.</p><button className="primary-button checkout-button" onClick={() => navigate('/login', { state: { from: '/cart' } })}>Войти и оформить заказ</button></> : (
              <form className="checkout-form" onSubmit={createOrder}>
                <h3>Доставка</h3>
                <label>Адрес доставки<input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Город, улица, дом, квартира" minLength="5" maxLength="250" required /></label>
                <label>Дата доставки<input type="date" value={deliveryDate} min={localDateValue()} onChange={(event) => setDeliveryDate(event.target.value)} required /></label>
                <button className="primary-button checkout-button" type="submit" disabled={sending}>{sending ? 'Оформление заказа…' : 'Оформить заказ'}</button>
              </form>
            )}
            <p className="summary-note">Остатки уменьшаются после успешного оформления. Состав заказа, адрес, дата и купон сохраняются в базе данных.</p>
          </aside>
        </div>
      )}
    </section>
  )
}
