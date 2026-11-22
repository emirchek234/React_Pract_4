import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Catalog from './pages/Catalog'
import Cart from './pages/Cart'
import Login from './pages/Login'
import Register from './pages/Register'
import PasswordRecovery from './pages/PasswordRecovery'
import Account from './pages/Account'
import Admin from './pages/Admin'
import AdminReviews from './pages/AdminReviews'
import Reviews from './pages/Reviews'
import NotFound from './pages/NotFound'
import { useApp } from './context/AppContext'

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, authLoading } = useApp()
  if (authLoading) return <div className="loading-state">Проверка авторизации...</div>
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role_name !== 'admin') return <Navigate to="/account" replace />
  return children
}

// Главный компонент приложения: связывает страницы с маршрутами и ограничивает доступ к закрытым разделам.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Catalog />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<PasswordRecovery />} />
        <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
        <Route path="/admin/reviews" element={<ProtectedRoute adminOnly><AdminReviews /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
