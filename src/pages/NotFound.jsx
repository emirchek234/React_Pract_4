import { Link } from 'react-router-dom'

export default function NotFound() {
  return <div className="empty-state not-found"><span>404</span><h2>Страница не найдена</h2><p>Такой страницы нет в приложении.</p><Link to="/" className="primary-button">Вернуться в каталог</Link></div>
}
