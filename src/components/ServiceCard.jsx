import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { formatPrice } from '../api/client'

function categoryIcon(category = '') {
  const value = category.toLowerCase()
  if (value.includes('маник')) return '💅'
  if (value.includes('лиц')) return '🧖'
  if (value.includes('массаж')) return '🌿'
  if (value.includes('консультац')) return '✦'
  return '◇'
}

export default function ServiceCard({ service }) {
  const { addToCart, cart } = useApp()
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const quantity = cart.find((item) => item.service_id === service.service_id)?.quantity || 0
  const discounted = Number(service.discount_percent) > 0
  const unavailable = Number(service.stock_quantity) < 1

  async function handleAdd() {
    setError('')
    setAdding(true)
    try { await addToCart(service) } catch (requestError) { setError(requestError.message) }
    finally { setAdding(false) }
  }

  return (
    <article className="product-card service-card">
      <div className="product-art service-art">
        {service.image_url ? <img className="service-image" src={service.image_url} alt={service.name} loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} /> : <span>{categoryIcon(service.category_name)}</span>}
        <small>{service.category_name}</small>
        {discounted && <b className="discount-badge">−{service.discount_percent}%</b>}
      </div>
      <div className="product-info">
        <p className="eyebrow">{service.category_name}</p>
        <h3 className="product-name">{service.name}</h3>
        <p className="service-description">{service.description}</p>
        <div className="service-meta"><span>◷ {service.duration_minutes} минут</span><span className={unavailable ? 'stock-empty' : 'stock-label'}>{unavailable ? 'Нет в наличии' : `Свободных окон: ${service.stock_quantity}`}</span></div>
        <div className="service-rating"><span>{Number(service.average_rating) ? `★ ${Number(service.average_rating).toFixed(1)}` : 'Пока без оценок'}</span><Link to={`/reviews?service=${service.service_id}`}>Отзывы ({service.review_count || 0})</Link></div>
        {error && <p className="form-error">{error}</p>}
        <div className="product-bottom service-bottom">
          <div className="service-price"><strong>{formatPrice(service.final_price)}</strong>{discounted && <del>{formatPrice(service.price)}</del>}</div>
          <button className="primary-button small-button" disabled={adding || unavailable || quantity >= Number(service.stock_quantity)} onClick={handleAdd}>
            {adding ? 'Добавление…' : quantity ? `В корзине: ${quantity}` : unavailable ? 'Нет в наличии' : 'В корзину'}
          </button>
        </div>
      </div>
    </article>
  )
}
