import { useApp } from '../context/AppContext'
import { formatPrice } from '../api/client'

function categoryIcon(category = '') {
  if (category.toLowerCase().includes('маник')) return '💅'
  if (category.toLowerCase().includes('лиц')) return '🧖'
  if (category.toLowerCase().includes('массаж')) return '🌿'
  if (category.toLowerCase().includes('консультац')) return '✦'
  return '◇'
}

export default function ServiceCard({ service }) {
  const { addToCart, cart } = useApp()
  const quantity = cart.find((item) => item.service_id === service.service_id)?.quantity || 0
  const discounted = Number(service.discount_percent) > 0

  return (
    <article className="product-card service-card">
      <div className="product-art service-art">
        <span>{categoryIcon(service.category_name)}</span>
        <small>{service.category_name}</small>
        {discounted && <b className="discount-badge">−{service.discount_percent}%</b>}
      </div>
      <div className="product-info">
        <p className="eyebrow">{service.category_name}</p>
        <h3 className="product-name">{service.name}</h3>
        <p className="service-description">{service.description}</p>
        <div className="service-meta"><span>◷ {service.duration_minutes} минут</span><span>{quantity ? `В корзине: ${quantity}` : 'Услуга'}</span></div>
        <div className="product-bottom service-bottom">
          <div className="service-price">
            <strong>{formatPrice(service.final_price)}</strong>
            {discounted && <del>{formatPrice(service.price)}</del>}
          </div>
          <button className="primary-button small-button" onClick={() => addToCart(service)}>В корзину</button>
        </div>
      </div>
    </article>
  )
}
