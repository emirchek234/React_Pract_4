import { Link, NavLink, Outlet } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function Layout() {
  const { theme, toggleTheme, cartCount, user, logout, authLoading } = useApp()
  const linkClass = ({ isActive }) => `nav-link${isActive ? ' active' : ''}`

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand"><span className="brand-mark">S</span> service<span>studio</span></Link>
          <nav className="nav-links">
            <NavLink to="/" end className={linkClass}>Услуги</NavLink>
            <NavLink to="/cart" className={linkClass}>Корзина <span className="cart-count">{cartCount}</span></NavLink>
            {user && <NavLink to="/account" className={linkClass}>Личный кабинет</NavLink>}
            {user?.role_name === 'admin' && <NavLink to="/admin" className={linkClass}>Администрирование</NavLink>}
          </nav>
          <div className="header-actions">
            <button className="icon-button theme-button" onClick={toggleTheme} aria-label="Сменить тему">
              {theme === 'light' ? '🌙' : '☀️'} <span>{theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}</span>
            </button>
            {authLoading ? <span className="header-status">Проверка...</span> : user ? (
              <button className="login-button" onClick={logout}>Выйти</button>
            ) : <Link className="login-button" to="/login">Войти</Link>}
          </div>
        </div>
      </header>
      <main className="main-content"><Outlet /></main>
      <footer className="footer">
        <span>© 2026 Service Studio</span>
        <span>React · Express API · PostgreSQL</span>
      </footer>
    </div>
  )
}
