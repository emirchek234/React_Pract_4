import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import ServiceCard from '../components/ServiceCard'

// Каталог получает категории и услуги через API и выполняет пользовательскую фильтрацию.
export default function Catalog() {
  const [services, setServices] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedCategories, setSelectedCategories] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadCatalog() {
    setLoading(true)
    setError('')
    try {
      const [categoryData, serviceData] = await Promise.all([
        api.get('/categories'),
        api.get('/services'),
      ])
      setCategories(categoryData)
      setServices(serviceData)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCatalog() }, [])

  const filtered = useMemo(() => services.filter((service) => {
    const byCategory = selectedCategories.length === 0 || selectedCategories.includes(service.category_name)
    const phrase = search.trim().toLocaleLowerCase('ru-RU')
    const bySearch = !phrase || `${service.name} ${service.description} ${service.category_name}`.toLocaleLowerCase('ru-RU').includes(phrase)
    return byCategory && bySearch
  }), [services, selectedCategories, search])

  function toggleCategory(name) {
    setSelectedCategories((current) => current.includes(name)
      ? current.filter((value) => value !== name)
      : [...current, name])
  }

  return (
    <section>
      <div className="hero">
        <div>
          <p className="eyebrow light-eyebrow">SERVICE STUDIO</p>
          <h1>Выбирай услугу.<br /><span>Остальное за нами.</span></h1>
          <p className="hero-description">Каталог услуг с длительностью, ценами и актуальными скидками.</p>
          <a href="#catalog" className="hero-button">Открыть каталог <span>↓</span></a>
        </div>
        <div className="hero-visual"><div className="hero-circle">✦</div><div className="hero-device">✧</div><div className="floating-tag">SERVICE CATALOG</div></div>
      </div>

      <div className="section-heading" id="catalog">
        <div><p className="eyebrow">ВЫБИРАЙ СВОЁ</p><h2>Каталог услуг</h2><p className="muted">Выберите подходящую услугу и добавьте её в корзину.</p></div>
        <div className="catalog-tools"><input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск услуги..." /></div>
      </div>

      {loading ? <div className="loading-state">Загрузка каталога услуг с API...</div> : error ? (
        <div className="request-error"><strong>Не удалось загрузить каталог</strong><p>{error}</p><button className="primary-button small-button" onClick={loadCatalog}>Повторить запрос</button></div>
      ) : (
        <div className="catalog-layout">
          <aside className="category-aside">
            <div className="aside-title"><h3>Категории</h3><button className="text-button" onClick={() => setSelectedCategories([])}>Сбросить</button></div>
            {categories.length ? categories.map((category) => (
              <label className="category-check" key={category.category_id}>
                <input type="checkbox" checked={selectedCategories.includes(category.name)} onChange={() => toggleCategory(category.name)} />
                <span>{category.name}</span><small>{category.services_count}</small>
              </label>
            )) : <p className="muted">Категорий пока нет.</p>}
          </aside>
          <div className="catalog-results">
            <div className="catalog-result-caption"><span>Найдено услуг: <strong>{filtered.length}</strong></span>{selectedCategories.length > 0 && <span>Выбрано категорий: {selectedCategories.length}</span>}</div>
            {filtered.length ? <div className="product-grid">{filtered.map((service) => <ServiceCard key={service.service_id} service={service} />)}</div> : (
              <div className="empty-state"><span>⌕</span><h3>Ничего не найдено</h3><p>Измените запрос или снимите часть фильтров.</p></div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
