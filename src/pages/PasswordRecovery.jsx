import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'

export default function PasswordRecovery() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function sendCode(event) {
    event.preventDefault(); setError(''); setMessage('')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Введите корректный email.')
    setLoading(true)
    try {
      const result = await api.post('/auth/forgot-password', { email: email.trim() })
      setMessage(result.message + (result.dev_hint ? ` ${result.dev_hint}` : ''))
      setStep(2)
    } catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }

  async function resetPassword(event) {
    event.preventDefault(); setError(''); setMessage('')
    if (!/^\d{6}$/.test(code)) return setError('Введите шестизначный код из письма.')
    if (password.length < 8 || !/[A-Za-zА-Яа-я]/.test(password) || !/\d/.test(password)) return setError('Пароль должен содержать не менее 8 символов, букву и цифру.')
    setLoading(true)
    try {
      const result = await api.post('/auth/reset-password', { email: email.trim(), code, new_password: password })
      setMessage(result.message)
      setTimeout(() => navigate('/login', { replace: true }), 900)
    } catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }

  return <section className="auth-page"><div className="auth-card">
    <div className="auth-icon">↻</div><p className="eyebrow">ВОССТАНОВЛЕНИЕ ДОСТУПА</p><h1>Сброс пароля</h1>
    {step === 1 ? <form onSubmit={sendCode}>
      <p className="muted">Укажите email аккаунта. Мы отправим на него одноразовый код, действующий 10 минут.</p>
      <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength="254" autoComplete="email" required /></label>
      {error && <p className="form-error">{error}</p>}{message && <p className="success-message">{message}</p>}
      <button className="primary-button auth-submit" disabled={loading}>{loading ? 'Отправка…' : 'Отправить код'}</button>
    </form> : <form onSubmit={resetPassword}>
      <p className="muted">Введите шестизначный код, отправленный на {email}, и придумайте новый пароль.</p>
      {message && <p className="success-message">{message}</p>}
      <label>Код из письма<input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" maxLength="6" required /></label>
      <label>Новый пароль<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength="8" maxLength="72" autoComplete="new-password" required /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="primary-button auth-submit" disabled={loading}>{loading ? 'Сохранение…' : 'Сохранить новый пароль'}</button>
      <button type="button" className="text-button recovery-resend" onClick={() => { setStep(1); setCode(''); setError('') }}>Запросить новый код</button>
    </form>}
    <Link to="/login" className="back-link centered">Вернуться ко входу</Link>
  </div></section>
}
