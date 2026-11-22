import { useEffect, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'

// Страница отзывов показывает публикации и позволяет вошедшим пользователям оставить отзыв.
export default function Reviews() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedService = searchParams.get('service') || ''
  const navigate = useNavigate()
  const { user } = useApp()
  const [services, setServices] = useState([])
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rating, setRating] = useState('5')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function loadReviews(serviceId = selectedService) {
    setLoading(true); setError('')
    try { setReviews(await api.get(`/reviews${serviceId ? `?service_id=${encodeURIComponent(serviceId)}` : ''}`)) }
    catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    api.get('/services').then((data) => setServices(data)).catch((requestError) => setError(requestError.message))
  }, [])
  useEffect(() => { loadReviews(selectedService) }, [selectedService])

  async function submit(event) {
    event.preventDefault(); setError(''); setMessage('')
    if (!user) { navigate('/login', { state: { from: `/reviews${selectedService ? `?service=${selectedService}` : ''}` } }); return }
    if (!selectedService) return setError('Сначала выберите услугу, для которой хотите оставить отзыв.')
    if (comment.trim().length < 3 || comment.trim().length > 1000) return setError('Комментарий должен содержать от 3 до 1000 символов.')
    setSaving(true)
    try {
      await api.post(`/services/${selectedService}/reviews`, { rating: Number(rating), comment: comment.trim() })
      setComment(''); setRating('5'); setMessage('Спасибо! Ваш отзыв опубликован.'); await loadReviews(selectedService)
    } catch (requestError) { setError(requestError.message) }
    finally { setSaving(false) }
  }

  return <section className="page-section">
    <div className="page-heading"><p className="eyebrow">МНЕНИЯ КЛИЕНТОВ</p><h1>Отзывы об услугах</h1><p className="muted">Читайте оценки и делитесь впечатлением о выбранной услуге.</p></div>
    <div className="reviews-toolbar"><label>Выберите услугу<select value={selectedService} onChange={(event) => setSearchParams(event.target.value ? { service: event.target.value } : {})}><option value="">Все услуги</option>{services.map((service) => <option value={service.service_id} key={service.service_id}>{service.name}</option>)}</select></label><Link to="/" className="secondary-button">Вернуться в каталог</Link></div>
    {selectedService && user && <form className="admin-card review-form" onSubmit={submit}>
      <h2>Оставить отзыв</h2><div className="form-two-columns"><label>Оценка<select value={rating} onChange={(event) => setRating(event.target.value)}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} из 5</option>)}</select></label><label>Ваше имя<input value={user.full_name} disabled readOnly /></label></div>
      <label>Комментарий<textarea value={comment} onChange={(event) => setComment(event.target.value)} rows="4" minLength="3" maxLength="1000" placeholder="Расскажите о впечатлениях от услуги…" required /></label>
      {error && <p className="form-error">{error}</p>}{message && <p className="success-message">{message}</p>}
      <button className="primary-button" disabled={saving}>{saving ? 'Отправка…' : 'Опубликовать отзыв'}</button>
    </form>}
    {selectedService && !user && <div className="request-error">Чтобы оставить отзыв, <Link to="/login">войдите в аккаунт</Link>.</div>}
    {error && !selectedService && <div className="request-error">{error}</div>}
    {loading ? <div className="loading-state">Загрузка отзывов…</div> : reviews.length ? <div className="review-list">{reviews.map((review) => <article className="review-card" key={review.review_id}>
      <div className="review-card-heading"><div><strong>{review.author_name}</strong><p className="small-muted">{review.service_name}</p></div><span className="review-stars">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span></div>
      <p>{review.comment}</p><time>{new Date(review.created_at).toLocaleDateString('ru-RU')}</time>
    </article>)}</div> : <div className="empty-state compact-empty"><span>✧</span><h3>Отзывов пока нет</h3><p>Станьте первым, кто поделится впечатлением.</p></div>}
  </section>
}
