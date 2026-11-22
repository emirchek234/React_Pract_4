import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

export default function AdminReviews() {
  const [reviews, setReviews] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [deleting, setDeleting] = useState(null)

  async function load() {
    setLoading(true); setError('')
    try { setReviews(await api.get('/admin/reviews')) }
    catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => reviews.filter((item) => `${item.author_name} ${item.author_email} ${item.service_name} ${item.comment}`.toLowerCase().includes(search.toLowerCase().trim())), [reviews, search])

  async function removeReview(review) {
    if (!window.confirm(`Удалить отзыв пользователя ${review.author_name} на услугу «${review.service_name}»?`)) return
    setDeleting(review.review_id); setError(''); setMessage('')
    try { await api.delete(`/admin/reviews/${review.review_id}`); setReviews((current) => current.filter((item) => item.review_id !== review.review_id)); setMessage('Отзыв удалён.') }
    catch (requestError) { setError(requestError.message) }
    finally { setDeleting(null) }
  }

  return <section className="page-section">
    <div className="page-heading"><p className="eyebrow">МОДЕРАЦИЯ</p><h1>Управление отзывами</h1><p className="muted">Проверяйте публикации и удаляйте отзывы, нарушающие правила.</p><Link className="back-link" to="/admin">← Вернуться в панель администратора</Link></div>
    <div className="admin-card"><div className="modal-toolbar"><input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по отзыву, автору или услуге…" /><button className="secondary-button" onClick={load}>Обновить</button></div>
      {message && <p className="success-message">{message}</p>}{error && <p className="form-error">{error}</p>}
      {loading ? <div className="loading-state">Загрузка отзывов…</div> : filtered.length ? <div className="admin-record-list">{filtered.map((review) => <article className="admin-record review-admin-record" key={review.review_id}>
        <div className="admin-record-main"><strong>{review.service_name}</strong><p>{review.author_name} · {review.author_email}</p><span className="review-stars">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span><p className="review-quote">{review.comment}</p><small>{new Date(review.created_at).toLocaleString('ru-RU')}</small></div>
        <button className="danger-button" disabled={deleting === review.review_id} onClick={() => removeReview(review)}>{deleting === review.review_id ? 'Удаление…' : 'Удалить отзыв'}</button>
      </article>)}</div> : <div className="empty-state compact-empty"><h3>Ничего не найдено</h3><p>Измените поисковый запрос.</p></div>}
    </div>
  </section>
}
