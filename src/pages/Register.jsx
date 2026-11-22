import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useApp } from '../context/AppContext'

export default function Register() {
  const { login } = useApp()
  const navigate = useNavigate()
  const [form, setForm] = useState({ full_name: '', email: '', password: '', phone: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function update(field, value) { setForm((current) => ({ ...current, [field]: value })) }
  async function submit(event) {
    event.preventDefault(); setError('')
    if (form.full_name.trim().length < 2) return setError('Введите полное имя.')
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('Введите корректный email.')
    if (form.password.length < 8 || !/[A-Za-zА-Яа-я]/.test(form.password) || !/\d/.test(form.password)) return setError('Пароль должен содержать не менее 8 символов, букву и цифру.')
    const digits = form.phone.replace(/\D/g, '')
    if (digits.length < 10 || digits.length > 15) return setError('Проверьте номер телефона: от 10 до 15 цифр.')
    setLoading(true)
    try {
      const result = await api.post('/auth/register', form)
      await login(result.token, result.user)
      navigate('/account', { replace: true })
    } catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }

  return <section className="auth-page"><form className="auth-card" onSubmit={submit}>
    <div className="auth-icon">＋</div><p className="eyebrow">SERVICE STUDIO</p><h1>Регистрация</h1><p className="muted">Создайте аккаунт покупателя. Роль администратора назначается отдельно.</p>
    <label>Полное имя<input value={form.full_name} onChange={(event) => update('full_name', event.target.value)} minLength="2" maxLength="120" autoComplete="name" required /></label>
    <label>Email<input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} maxLength="254" autoComplete="email" required /></label>
    <label>Пароль<input type="password" value={form.password} onChange={(event) => update('password', event.target.value)} minLength="8" maxLength="72" autoComplete="new-password" required /><small className="small-muted">Не менее 8 символов, минимум одна буква и одна цифра.</small></label>
    <label>Телефон<input type="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="+7 999 123-45-67" maxLength="20" autoComplete="tel" required /></label>
    {error && <p className="form-error">{error}</p>}
    <button className="primary-button auth-submit" type="submit" disabled={loading}>{loading ? 'Создание аккаунта…' : 'Зарегистрироваться'}</button>
    <p className="auth-footnote">Уже зарегистрированы? <Link to="/login">Войти</Link></p>
  </form></section>
}
