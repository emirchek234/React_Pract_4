import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Catalog from './pages/Catalog'
import Cart from './pages/Cart'
import Login from './pages/Login'
import Account from './pages/Account'
import Admin from './pages/Admin'
import NotFound from './pages/NotFound'
import { useApp } from './context/AppContext'

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, authLoading } = useApp()
  if (authLoading) return <div className="loading-state">Проверка авторизации...</div>
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role_name !== 'admin') return <Navigate to="/account" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Catalog />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/login" element={<Login />} />
        <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
