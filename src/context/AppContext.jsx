import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer } from 'react'
import { api } from '../api/client'

const AppContext = createContext(null)

function readCart() {
  try {
    const value = JSON.parse(localStorage.getItem('service-store-cart') || '[]')
    return Array.isArray(value) ? value : []
  } catch { return [] }
}
function readTheme() {
  try { return localStorage.getItem('service-store-theme') === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}

const initialState = {
  cart: readCart(), theme: readTheme(), user: null,
  authLoading: Boolean(localStorage.getItem('service-store-token')),
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_USER': return { ...state, user: action.user, authLoading: false }
    case 'AUTH_LOADING': return { ...state, authLoading: action.value }
    case 'SET_CART': return { ...state, cart: action.cart }
    case 'ADD_TO_CART': {
      const existing = state.cart.find((item) => item.service_id === action.service.service_id)
      if (existing) return { ...state, cart: state.cart.map((item) => item.service_id === action.service.service_id
        ? { ...item, quantity: Math.min(Number(item.stock_quantity || 100), item.quantity + 1) } : item) }
      return { ...state, cart: [...state.cart, { ...action.service, quantity: 1 }] }
    }
    case 'REMOVE_FROM_CART': return { ...state, cart: state.cart.filter((item) => item.service_id !== action.id) }
    case 'CHANGE_QUANTITY': return { ...state, cart: state.cart.map((item) => item.service_id === action.id
      ? { ...item, quantity: Math.min(Number(item.stock_quantity || 100), Math.max(1, item.quantity + action.delta)) } : item) }
    case 'CLEAR_CART': return { ...state, cart: [] }
    case 'TOGGLE_THEME': return { ...state, theme: state.theme === 'light' ? 'dark' : 'light' }
    default: return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // У гостя корзина живёт в браузере; у вошедшего пользователя — только в PostgreSQL.
  useEffect(() => {
    if (!state.user) localStorage.setItem('service-store-cart', JSON.stringify(state.cart))
  }, [state.cart, state.user])

  useLayoutEffect(() => {
    try { localStorage.setItem('service-store-theme', state.theme) } catch { /* тема остаётся в текущей вкладке */ }
    document.documentElement.dataset.theme = state.theme
    document.documentElement.style.colorScheme = state.theme
  }, [state.theme])

  const syncServerCart = useCallback(async (guestItems = []) => {
    try {
      if (guestItems.length) await api.post('/cart/merge', { items: guestItems.map((item) => ({ service_id: item.service_id, quantity: item.quantity })) })
      const cart = await api.get('/cart')
      dispatch({ type: 'SET_CART', cart })
      localStorage.removeItem('service-store-cart')
    } catch {
      dispatch({ type: 'SET_CART', cart: [] })
    }
  }, [])

  useEffect(() => {
    if (!localStorage.getItem('service-store-token')) return
    const guestCart = readCart()
    dispatch({ type: 'AUTH_LOADING', value: true })
    api.get('/auth/me')
      .then(async (user) => {
        dispatch({ type: 'SET_USER', user })
        await syncServerCart(guestCart)
      })
      .catch(() => {
        localStorage.removeItem('service-store-token')
        dispatch({ type: 'SET_USER', user: null })
      })
  }, [syncServerCart])

  const login = useCallback(async (token, user) => {
    localStorage.setItem('service-store-token', token)
    dispatch({ type: 'SET_USER', user })
    const guestCart = readCart()
    await syncServerCart(guestCart)
  }, [syncServerCart])

  const logout = useCallback(() => {
    localStorage.removeItem('service-store-token')
    localStorage.removeItem('service-store-cart')
    dispatch({ type: 'CLEAR_CART' })
    dispatch({ type: 'SET_USER', user: null })
  }, [])

  const addToCart = useCallback(async (service) => {
    if (state.user) {
      const result = await api.post('/cart/items', { service_id: service.service_id, quantity: 1 })
      dispatch({ type: 'SET_CART', cart: result.cart })
    } else dispatch({ type: 'ADD_TO_CART', service })
  }, [state.user])

  const removeFromCart = useCallback(async (id) => {
    if (state.user) dispatch({ type: 'SET_CART', cart: await api.delete(`/cart/items/${id}`) })
    else dispatch({ type: 'REMOVE_FROM_CART', id })
  }, [state.user])

  const changeQuantity = useCallback(async (id, delta) => {
    if (state.user) {
      const item = state.cart.find((entry) => entry.service_id === id)
      if (!item) return
      const quantity = Math.min(Number(item.stock_quantity), Math.max(1, item.quantity + delta))
      dispatch({ type: 'SET_CART', cart: await api.patch(`/cart/items/${id}`, { quantity }) })
    } else dispatch({ type: 'CHANGE_QUANTITY', id, delta })
  }, [state.user, state.cart])

  const clearCart = useCallback(async () => {
    if (state.user) await api.delete('/cart')
    dispatch({ type: 'CLEAR_CART' })
  }, [state.user])

  const value = useMemo(() => {
    const cartCount = state.cart.reduce((sum, item) => sum + Number(item.quantity), 0)
    const subtotal = state.cart.reduce((sum, item) => sum + Number(item.final_price) * Number(item.quantity), 0)
    return {
      ...state, cartCount, subtotal, cartTotal: subtotal,
      addToCart, removeFromCart, changeQuantity, clearCart,
      toggleTheme: () => dispatch({ type: 'TOGGLE_THEME' }), login, logout,
      refreshCart: () => state.user ? syncServerCart([]) : Promise.resolve(),
      setUser: (user) => dispatch({ type: 'SET_USER', user }),
    }
  }, [state, addToCart, removeFromCart, changeQuantity, clearCart, login, logout, syncServerCart])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp должен использоваться внутри AppProvider')
  return context
}
