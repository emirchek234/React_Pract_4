import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react'
import { api } from '../api/client'

const AppContext = createContext(null)

function readCart() {
  try {
    const value = JSON.parse(localStorage.getItem('service-store-cart') || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

const initialState = {
  cart: readCart(),
  theme: localStorage.getItem('service-store-theme') || 'light',
  user: null,
  authLoading: Boolean(localStorage.getItem('service-store-token')),
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.user, authLoading: false }
    case 'AUTH_LOADING':
      return { ...state, authLoading: action.value }
    case 'ADD_TO_CART': {
      const existing = state.cart.find((item) => item.service_id === action.service.service_id)
      if (existing) {
        return {
          ...state,
          cart: state.cart.map((item) => item.service_id === action.service.service_id
            ? { ...item, quantity: Math.min(20, item.quantity + 1) }
            : item),
        }
      }
      return { ...state, cart: [...state.cart, { ...action.service, quantity: 1 }] }
    }
    case 'REMOVE_FROM_CART':
      return { ...state, cart: state.cart.filter((item) => item.service_id !== action.id) }
    case 'CHANGE_QUANTITY':
      return {
        ...state,
        cart: state.cart.map((item) => item.service_id === action.id
          ? { ...item, quantity: Math.min(20, Math.max(1, item.quantity + action.delta)) }
          : item),
      }
    case 'CLEAR_CART':
      return { ...state, cart: [] }
    case 'TOGGLE_THEME':
      return { ...state, theme: state.theme === 'light' ? 'dark' : 'light' }
    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    localStorage.setItem('service-store-cart', JSON.stringify(state.cart))
  }, [state.cart])

  useEffect(() => {
    localStorage.setItem('service-store-theme', state.theme)
    document.documentElement.dataset.theme = state.theme
  }, [state.theme])

  useEffect(() => {
    if (!localStorage.getItem('service-store-token')) return
    dispatch({ type: 'AUTH_LOADING', value: true })
    api.get('/auth/me')
      .then((user) => dispatch({ type: 'SET_USER', user }))
      .catch(() => {
        localStorage.removeItem('service-store-token')
        dispatch({ type: 'SET_USER', user: null })
      })
  }, [])

  const setUser = useCallback((user) => dispatch({ type: 'SET_USER', user }), [])
  const login = useCallback((token, user) => {
    localStorage.setItem('service-store-token', token)
    dispatch({ type: 'SET_USER', user })
  }, [])
  const logout = useCallback(() => {
    localStorage.removeItem('service-store-token')
    dispatch({ type: 'SET_USER', user: null })
  }, [])

  const value = useMemo(() => {
    const cartCount = state.cart.reduce((sum, item) => sum + item.quantity, 0)
    const subtotal = state.cart.reduce((sum, item) => sum + Number(item.final_price) * item.quantity, 0)
    const couponPercent = state.user?.coupon?.discount_percent || 0
    const couponDiscount = subtotal * couponPercent / 100
    return {
      ...state,
      cartCount,
      subtotal,
      couponPercent,
      couponDiscount,
      cartTotal: Math.max(0, subtotal - couponDiscount),
      addToCart: (service) => dispatch({ type: 'ADD_TO_CART', service }),
      removeFromCart: (id) => dispatch({ type: 'REMOVE_FROM_CART', id }),
      changeQuantity: (id, delta) => dispatch({ type: 'CHANGE_QUANTITY', id, delta }),
      clearCart: () => dispatch({ type: 'CLEAR_CART' }),
      toggleTheme: () => dispatch({ type: 'TOGGLE_THEME' }),
      setUser,
      login,
      logout,
    }
  }, [state, setUser, login, logout])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp должен использоваться внутри AppProvider')
  return context
}
