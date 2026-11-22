import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { user, login, authLoading } = useApp()
  const navigate = useNavigate()
  const location = useLocation()

  if (authLoading) return <div className="loading-state">Проверка авторизации...</div>
  if (user) return <Navigate to={user.role_name === 'admin' ? '/admin' : '/account'} replace />

  async function handleSubmit(event) {
    event.preventDefault(); setError('')
    if (!email.trim() || !password) { setError('Заполните email и пароль.'); return }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Введите корректный адрес электронной почты.'); return }
    setLoading(true)
    try {
      const result = await api.post('/auth/login', { email: email.trim(), password })
      await login(result.token, result.user)
      const target = location.state?.from || (result.user.role_name === 'admin' ? '/admin' : '/account')
      navigate(target, { replace: true })
    } catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }

  return (
    <section className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-icon">✦</div><p className="eyebrow">SERVICE STUDIO</p><h1>Вход в аккаунт</h1><p className="muted">Введите данные для входа.</p>
        <label>Email<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" maxLength="254" required /></label>
        <label>Пароль<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Введите пароль" required /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button auth-submit" type="submit" disabled={loading}>{loading ? 'Проверка данных...' : 'Войти'}</button>
        <div className="auth-links"><Link to="/forgot-password">Забыли пароль?</Link><Link to="/register">Создать аккаунт</Link></div>
        <div className="demo-credentials"><strong>Демо-доступ</strong><span>Администратор: admin@demo.ru / Admin123!</span><span>Пользователь: client@demo.ru / Client123!</span></div>
        <Link to="/" className="back-link centered">Вернуться в каталог</Link>
      </form>
    </section>
  )
}
