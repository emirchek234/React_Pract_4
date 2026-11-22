import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formatPrice } from '../api/client'

const emptyService = { category_id: '', name: '', description: '', duration_minutes: '30', price: '500', discount_percent: '0', stock_quantity: '10' }
const statusOptions = [
  { value: 'new', label: 'Новый' }, { value: 'confirmed', label: 'Подтверждён' },
  { value: 'processing', label: 'В работе' }, { value: 'completed', label: 'Выполнен' }, { value: 'cancelled', label: 'Отменён' },
]

// Админ-панель разделена на модальные окна управления категориями, услугами, заказами и пользователями.
export default function Admin() {
  const [categories, setCategories] = useState([])
  const [services, setServices] = useState([])
  const [users, setUsers] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modal, setModal] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [categoryName, setCategoryName] = useState('')
  const [editingCategory, setEditingCategory] = useState(null)

  const [serviceForm, setServiceForm] = useState(emptyService)
  const [editingService, setEditingService] = useState(null)
  const [serviceImage, setServiceImage] = useState(null)
  const [removeCurrentImage, setRemoveCurrentImage] = useState(false)

  const [editingUser, setEditingUser] = useState(null)
  const [userForm, setUserForm] = useState(null)
  const [newUserForm, setNewUserForm] = useState({ full_name: '', email: '', password: '', phone: '', default_address: '' })
  const [couponTypes, setCouponTypes] = useState({})

  async function loadData(showLoader = true) {
    if (showLoader) setLoading(true)
    setError('')
    try {
      const [categoryData, serviceData, userData, orderData] = await Promise.all([
        api.get('/categories'), api.get('/services'), api.get('/admin/users'), api.get('/admin/orders'),
      ])
      setCategories(categoryData); setServices(serviceData); setUsers(userData); setOrders(orderData)
    } catch (requestError) { setError(requestError.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { loadData() }, [])

  function open(name) { setModal(name); setSearch(''); setError(''); setMessage('') }
  function close() { setModal(''); setSearch(''); setEditingCategory(null); setEditingService(null); setEditingUser(null); setUserForm(null); setServiceImage(null); setRemoveCurrentImage(false) }
  function searchText(value) { return String(value || '').toLocaleLowerCase('ru-RU').includes(search.trim().toLocaleLowerCase('ru-RU')) }

  const filteredCategories = useMemo(() => categories.filter((item) => searchText(`${item.name} ${item.services_count}`)), [categories, search])
  const filteredServices = useMemo(() => services.filter((item) => searchText(`${item.name} ${item.description} ${item.category_name}`)), [services, search])
  const filteredOrders = useMemo(() => orders.filter((item) => searchText(`${item.order_id} ${item.customer_name} ${item.customer_email} ${item.delivery_address} ${item.items.map((x) => x.service_name).join(' ')}`)), [orders, search])
  const filteredUsers = useMemo(() => users.filter((item) => searchText(`${item.full_name} ${item.email} ${item.phone}`)), [users, search])

  async function createCategory(event) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('')
    try { await api.post('/categories', { name: categoryName.trim() }); setCategoryName(''); setMessage('Категория добавлена.'); await loadData(false) }
    catch (requestError) { setError(requestError.message) }
    finally { setSaving(false) }
  }
  async function saveCategory(event) {
    event.preventDefault(); if (!editingCategory) return
    setSaving(true); setError('')
    try { await api.put(`/categories/${editingCategory.category_id}`, { name: editingCategory.name }); setEditingCategory(null); setMessage('Название категории обновлено.'); await loadData(false) }
    catch (requestError) { setError(requestError.message) }
    finally { setSaving(false) }
  }
  async function deleteCategory(category) {
    if (!window.confirm(`Удалить категорию «${category.name}»? Все её услуги перейдут в «Без категории».`)) return
    setSaving(true); setError('')
    try { const result = await api.delete(`/categories/${category.category_id}`); setMessage(result.message); await loadData(false) }
    catch (requestError) { setError(requestError.message) }
    finally { setSaving(false) }
  }

  function updateService(field, value) { setServiceForm((current) => ({ ...current, [field]: value })) }
  function beginServiceEdit(service) {
    const category = categories.find((item) => item.name === service.category_name)
    setEditingService(service.service_id)
    setServiceForm({ category_id: category ? String(category.category_id) : '', name: service.name, description: service.description, duration_minutes: String(service.duration_minutes), price: String(service.price), discount_percent: String(service.discount_percent), stock_quantity: String(service.stock_quantity) })
    setServiceImage(null)
    setRemoveCurrentImage(false)
  }
  function cancelServiceEdit() { setEditingService(null); setServiceForm(emptyService); setServiceImage(null); setRemoveCurrentImage(false) }
  async function saveService(event) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('')
    try {
      const payload = { ...serviceForm, category_id: serviceForm.category_id || null, duration_minutes: Number(serviceForm.duration_minutes), price: Number(serviceForm.price), discount_percent: Number(serviceForm.discount_percent), stock_quantity: Number(serviceForm.stock_quantity) }
      let result
      if (editingService) result = await api.put(`/services/${editingService}`, payload)
      else result = await api.post('/services', payload)
      const targetServiceId = result.service_id || editingService
      if (removeCurrentImage && editingService) await api.delete(`/services/${targetServiceId}/image`)
      if (serviceImage) await api.uploadImage(`/services/${targetServiceId}/image`, serviceImage)
      setMessage(editingService ? 'Услуга обновлена.' : 'Услуга добавлена в каталог.')
      cancelServiceEdit(); await loadData(false)
    } catch (requestError) { setError(requestError.message) }
    finally { setSaving(false) }
  }
  async function deleteService(service) {
    if (!window.confirm(`Удалить услугу «${service.name}» из каталога? История заказов сохранится.`)) return
    setSaving(true); setError('')
    try { const result = await api.delete(`/services/${service.service_id}`); setMessage(result.message); await loadData(false) }
    catch (requestError) { setError(requestError.message) }
    finally { setSaving(false) }
  }

  async function updateOrderStatus(orderId, status) {
    setSaving(true); setError('')
    try { await api.patch(`/admin/orders/${orderId}/status`, { status }); setOrders((current) => current.map((order) => order.order_id === orderId ? { ...order, status, status_label: statusOptions.find((option) => option.value === status)?.label } : order)); setMessage(`Статус заказа №${orderId} изменён.`) }
    catch (requestError) { setError(requestError.message) }
    finally { setSaving(false) }
  }

  async function deleteOrder(order) {
    if (!window.confirm(`Удалить заказ №${order.order_id}? Для неотменённого заказа остатки вернутся на склад.`)) return
    setSaving(true); setError('')
    try { const result = await api.delete(`/admin/orders/${order.order_id}`); setOrders((current) => current.filter((item) => item.order_id !== order.order_id)); setMessage(result.message) }
    catch (requestError) { setError(requestError.message) }
    finally { setSaving(false) }
  }

  function beginUserEdit(user) {
    setEditingUser(user.user_id)
    setUserForm({ full_name: user.full_name, email: user.email, phone: user.phone || '', default_address: user.default_address || '', is_active: Boolean(user.is_active) })
  }
  async function saveUser(event) {
    event.preventDefault(); if (!editingUser || !userForm) return
    setSaving(true); setError('')
    try { await api.put(`/admin/users/${editingUser}`, userForm); setMessage('Данные пользователя обновлены.'); setEditingUser(null); setUserForm(null); await loadData(false) }
    catch (requestError) { setError(requestError.message) }
    finally { setSaving(false) }
  }
  async function assignCoupon(userId) {
    setSaving(true); setError('')
    try { const result = await api.put(`/admin/users/${userId}/coupon`, { coupon_type: couponTypes[userId] || 'WELCOME' }); setMessage(`Назначен купон ${result.code} со скидкой ${result.discount_percent}%.`); await loadData(false) }
    catch (requestError) { setError(requestError.message) }
    finally { setSaving(false) }
  }

  async function revokeCoupon(user) {
    if (!window.confirm(`Отозвать активный купон пользователя ${user.full_name}?`)) return
    setSaving(true); setError('')
    try { const result = await api.delete(`/admin/users/${user.user_id}/coupon`); setMessage(result.message); await loadData(false) }
    catch (requestError) { setError(requestError.message) }
    finally { setSaving(false) }
  }

  async function createUser(event) {
    event.preventDefault(); setSaving(true); setError(''); setMessage('')
    try { await api.post('/admin/users', newUserForm); setNewUserForm({ full_name: '', email: '', password: '', phone: '', default_address: '' }); setMessage('Пользователь создан.'); await loadData(false) }
    catch (requestError) { setError(requestError.message) }
    finally { setSaving(false) }
  }
  async function deactivateUser(user) {
    if (!window.confirm(`Заблокировать пользователя ${user.full_name}? Его история заказов останется в системе.`)) return
    setSaving(true); setError('')
    try { const result = await api.delete(`/admin/users/${user.user_id}`); setMessage(result.message); await loadData(false) }
    catch (requestError) { setError(requestError.message) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="loading-state">Загрузка панели администратора…</div>

  const modalTitle = { categories: 'Управление категориями', services: 'Управление услугами и остатками', orders: 'Заказы и их статусы', users: 'Пользователи и купоны' }[modal]
  return <section className="page-section">
    <div className="page-heading"><p className="eyebrow">УПРАВЛЕНИЕ ДАННЫМИ</p><h1>Панель администратора</h1><p className="muted">Каждый раздел открывается в отдельном окне с поиском. Здесь можно управлять каталогом, заказами и пользователями.</p></div>
    {error && <div className="request-error compact-error">{error}</div>}{message && <div className="success-message">{message}</div>}
    <div className="admin-dashboard-grid">
      <button className="admin-dashboard-tile" onClick={() => open('categories')}><span>▦</span><strong>Категории</strong><small>{categories.length} категорий</small><em>Добавить · изменить · удалить</em></button>
      <button className="admin-dashboard-tile" onClick={() => open('services')}><span>✦</span><strong>Услуги</strong><small>{services.length} услуг в каталоге</small><em>Цены · изображения · остатки</em></button>
      <button className="admin-dashboard-tile" onClick={() => open('orders')}><span>▤</span><strong>Заказы</strong><small>{orders.length} заказов</small><em>Состав заказа · адрес · статус</em></button>
      <button className="admin-dashboard-tile" onClick={() => open('users')}><span>♙</span><strong>Пользователи</strong><small>{users.length} аккаунтов</small><em>Данные · блокировка · купоны</em></button>
      <Link className="admin-dashboard-tile" to="/admin/reviews"><span>★</span><strong>Отзывы</strong><small>Модерация публикаций</small><em>Отдельная страница поиска и удаления</em></Link>
    </div>
    <button className="text-button" onClick={() => loadData()}>Обновить данные панели</button>

    {modal && <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">
        <div className="admin-modal-header"><div><p className="eyebrow">АДМИНИСТРИРОВАНИЕ</p><h2 id="admin-modal-title">{modalTitle}</h2></div><button className="modal-close" onClick={close} aria-label="Закрыть окно">×</button></div>
        <div className="modal-toolbar"><input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск в этом разделе…" /><button className="secondary-button" onClick={() => loadData(false)}>Обновить</button></div>
        {error && <p className="form-error">{error}</p>}{message && <p className="success-message">{message}</p>}

        {modal === 'categories' && <>
          <form className="modal-create-row" onSubmit={createCategory}><input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Название новой категории" minLength="2" maxLength="100" required /><button className="primary-button" disabled={saving}>Добавить</button></form>
          <div className="admin-record-list">{filteredCategories.map((category) => <article className="admin-record" key={category.category_id}>
            {editingCategory?.category_id === category.category_id ? <form className="modal-edit-row" onSubmit={saveCategory}><input value={editingCategory.name} onChange={(event) => setEditingCategory({ ...editingCategory, name: event.target.value })} minLength="2" maxLength="100" required /><button className="secondary-button" disabled={saving}>Сохранить</button><button type="button" className="text-button" onClick={() => setEditingCategory(null)}>Отмена</button></form> : <><div className="admin-record-main"><strong>{category.name}</strong><p>{category.services_count} услуг</p></div>{category.name !== 'Без категории' && <div className="admin-record-actions"><button className="secondary-button" onClick={() => setEditingCategory({ category_id: category.category_id, name: category.name })}>Изменить</button><button className="danger-button" disabled={saving} onClick={() => deleteCategory(category)}>Удалить</button></div>}</>}
          </article>)}{!filteredCategories.length && <p className="muted">Категории не найдены.</p>}</div>
        </>}

        {modal === 'services' && <>
          <form className="admin-form service-admin-form" onSubmit={saveService}>
            <h3>{editingService ? 'Редактирование услуги' : 'Добавить новую услугу'}</h3>
            <div className="form-two-columns"><label>Категория<select value={serviceForm.category_id} onChange={(event) => updateService('category_id', event.target.value)}><option value="">Без категории</option>{categories.filter((category) => category.name !== 'Без категории').map((category) => <option value={category.category_id} key={category.category_id}>{category.name}</option>)}</select></label><label>Название<input value={serviceForm.name} onChange={(event) => updateService('name', event.target.value)} minLength="2" maxLength="160" required /></label></div>
            <label>Описание<textarea value={serviceForm.description} onChange={(event) => updateService('description', event.target.value)} minLength="5" maxLength="2000" rows="3" required /></label>
            <div className="form-three-columns"><label>Длительность, мин<input type="number" min="1" max="1440" value={serviceForm.duration_minutes} onChange={(event) => updateService('duration_minutes', event.target.value)} required /></label><label>Цена, ₽<input type="number" min="500" max="1000000" step="0.01" value={serviceForm.price} onChange={(event) => updateService('price', event.target.value)} required /></label><label>Остаток на складе<input type="number" min="0" max="100000" value={serviceForm.stock_quantity} onChange={(event) => updateService('stock_quantity', event.target.value)} required /></label></div>
            {editingService && services.find((item) => item.service_id === editingService)?.image_url && !removeCurrentImage && <div className="service-image-editor"><img src={services.find((item) => item.service_id === editingService).image_url} alt="Текущее изображение услуги" /><button type="button" className="danger-button" onClick={() => setRemoveCurrentImage(true)}>Удалить текущее фото</button></div>}
            {removeCurrentImage && <p className="muted">Текущее изображение будет удалено после сохранения.</p>}
            <div className="form-two-columns"><label>Скидка, %<input type="number" min="0" max="90" value={serviceForm.discount_percent} onChange={(event) => updateService('discount_percent', event.target.value)} required /></label><label>Изображение (до 5 МБ)<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setServiceImage(event.target.files?.[0] || null)} /></label></div>{serviceImage && <div className="service-image-editor"><span className="new-image-label">Выбрано новое изображение: {serviceImage.name}</span><span>Новое изображение будет установлено после сохранения.</span></div>}
            <div className="modal-form-actions"><button className="primary-button" disabled={saving}>{saving ? 'Сохранение…' : editingService ? 'Сохранить услугу' : 'Добавить услугу'}</button>{editingService && <button type="button" className="secondary-button" onClick={cancelServiceEdit}>Отмена редактирования</button>}</div>
          </form>
          <div className="admin-record-list">{filteredServices.map((service) => <article className="admin-record" key={service.service_id}>
            <div className="admin-record-main service-record-main">{service.image_url ? <img src={service.image_url} alt="" /> : <span className="mini-product-placeholder">✦</span>}<div><strong>{service.name}</strong><p>{service.category_name} · {formatPrice(service.price)} · {service.duration_minutes} мин.</p><p>На складе: <b>{service.stock_quantity}</b> · Скидка: {service.discount_percent}%</p></div></div>
            <div className="admin-record-actions"><button className="secondary-button" onClick={() => beginServiceEdit(service)}>Изменить</button><button className="danger-button" disabled={saving} onClick={() => deleteService(service)}>Удалить</button></div>
          </article>)}{!filteredServices.length && <p className="muted">Услуги не найдены.</p>}</div>
        </>}

        {modal === 'orders' && <div className="admin-record-list">{filteredOrders.map((order) => <article className="admin-record order-admin-record" key={order.order_id}>
          <div className="admin-record-main"><div className="order-history-heading"><strong>Заказ №{order.order_id}</strong><span>{formatPrice(order.total_price)}</span></div><p>{order.customer_name} · {order.customer_email}</p><p>Доставка: {new Date(`${order.delivery_date}T00:00:00`).toLocaleDateString('ru-RU')} · {order.delivery_address}</p>
            <div className="order-history-items">{order.items.map((item, index) => <div className="order-history-item" key={`${order.order_id}-${index}`}>{item.image_url ? <img src={item.image_url} alt="" /> : <span className="mini-product-placeholder">✦</span>}<span>{item.service_name}</span><span>{item.quantity} шт.</span><strong>{formatPrice(item.total_price)}</strong></div>)}</div>
            {order.coupon_code && <p className="coupon-applied">Купон: {order.coupon_code} · скидка {order.coupon_discount_percent}% · −{formatPrice(order.discount_amount)}</p>}
          </div><div className="order-admin-actions"><label className="order-status-select">Статус<select value={order.status} disabled={saving} onChange={(event) => updateOrderStatus(order.order_id, event.target.value)}>{statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label><button className="danger-button" disabled={saving} onClick={() => deleteOrder(order)}>Удалить заказ</button></div>
        </article>)}{!filteredOrders.length && <p className="muted">Заказы не найдены.</p>}</div>}

        {modal === 'users' && <>
          <form className="admin-form service-admin-form" onSubmit={createUser}>
            <h3>Добавить пользователя</h3>
            <div className="form-two-columns"><label>ФИО<input value={newUserForm.full_name} onChange={(event) => setNewUserForm({ ...newUserForm, full_name: event.target.value })} minLength="2" maxLength="120" required /></label><label>Email<input type="email" value={newUserForm.email} onChange={(event) => setNewUserForm({ ...newUserForm, email: event.target.value })} maxLength="254" required /></label></div>
            <div className="form-two-columns"><label>Временный пароль<input type="password" value={newUserForm.password} onChange={(event) => setNewUserForm({ ...newUserForm, password: event.target.value })} minLength="8" maxLength="72" required /></label><label>Телефон<input value={newUserForm.phone} onChange={(event) => setNewUserForm({ ...newUserForm, phone: event.target.value })} maxLength="20" required /></label></div>
            <label>Адрес по умолчанию<input value={newUserForm.default_address} onChange={(event) => setNewUserForm({ ...newUserForm, default_address: event.target.value })} maxLength="250" /></label>
            <button className="primary-button" disabled={saving}>Создать пользователя</button>
          </form>
          <div className="admin-record-list">{filteredUsers.map((user) => <article className="admin-record user-admin-record" key={user.user_id}>
          <div className="admin-record-main"><strong>{user.full_name}</strong><p>{user.email} · {user.phone || 'Телефон не указан'}</p><p>{user.role_name === 'admin' ? 'Администратор' : 'Пользователь'} · {user.is_active ? 'Активен' : 'Заблокирован'}</p>{user.default_address && <p>Адрес: {user.default_address}</p>}{user.coupon_code && <div className="user-coupon-row"><p className="coupon-applied">Купон: {user.coupon_code} (−{user.coupon_discount_percent}%)</p><button className="text-button" disabled={saving} onClick={() => revokeCoupon(user)}>Отозвать купон</button></div>}
            {editingUser === user.user_id && userForm && <form className="admin-form user-edit-form" onSubmit={saveUser}>
              <label>ФИО<input value={userForm.full_name} onChange={(event) => setUserForm({ ...userForm, full_name: event.target.value })} minLength="2" maxLength="120" required /></label>
              <label>Email<input type="email" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} maxLength="254" required /></label>
              <label>Телефон<input value={userForm.phone} onChange={(event) => setUserForm({ ...userForm, phone: event.target.value })} maxLength="20" required /></label>
              <label>Адрес<input value={userForm.default_address} onChange={(event) => setUserForm({ ...userForm, default_address: event.target.value })} maxLength="250" /></label>
              <label className="checkbox-line"><input type="checkbox" checked={userForm.is_active} onChange={(event) => setUserForm({ ...userForm, is_active: event.target.checked })} /> Аккаунт активен</label>
              <div className="modal-form-actions"><button className="primary-button" disabled={saving}>Сохранить</button><button type="button" className="text-button" onClick={() => { setEditingUser(null); setUserForm(null) }}>Отмена</button></div>
            </form>}
          </div><div className="admin-record-actions"><button className="secondary-button" onClick={() => beginUserEdit(user)}>Изменить</button>{user.role_name !== 'admin' && <><div className="coupon-assignment"><select value={couponTypes[user.user_id] || 'WELCOME'} onChange={(event) => setCouponTypes({ ...couponTypes, [user.user_id]: event.target.value })}><option value="WELCOME">Купон 5%</option><option value="LOYALTY">Купон 10%</option><option value="SPECIAL">Купон 15%</option></select><button className="secondary-button" disabled={saving} onClick={() => assignCoupon(user.user_id)}>Выдать</button></div>{user.is_active && <button className="danger-button" disabled={saving} onClick={() => deactivateUser(user)}>Заблокировать</button>}</>}</div>
        </article>)}{!filteredUsers.length && <p className="muted">Пользователи не найдены.</p>}</div>
        </>}
      </section>
    </div>}
  </section>
}
