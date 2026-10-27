import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { Ctx } from '../lib/tenant'
import { duration, money } from '../lib/format'
import { fetchCategories, fetchServices } from '../lib/api'
import { Arrow } from '../lib/icons'
import { BagIcon, ChevronIcon, CloseIcon, ImageIcon, MinusIcon, PlusIcon, TrashIcon } from '../components/OrderIcons'
import { CategoryIcon, cleanCategoryName } from '../components/CategoryIcon'

type Category = {
  id: string
  name: string
  parent_id?: string | null // если указан — это подкатегория
  image?: string
  active?: boolean
}

const OTHER_ID = '__other'
const PAGE_SIZE = 8 // сколько блюд показывать сразу, остальные по кнопке «Показать ещё»

// Единые хелперы: ключ блюда и цена считаются везде одинаково
const keyOf = (s: any): string => String(s.id ?? s.name)
const priceOf = (s: any): number =>
  s.price_cents != null ? s.price_cents / 100 : Number(s.price ?? 0)

export function ServiceList({ limit: preview }: { limit?: number } = {}) {
  const pageSize = preview ?? PAGE_SIZE
  const { b, openBooking } = useOutletContext<Ctx>()

  const [searchQuery, setSearchQuery] = useState('')
  const [rootId, setRootId] = useState('')
  const [subId, setSubId] = useState('') // '' = «Все» внутри категории
  // Корзина переживает перезагрузку страницы: хранится на этом устройстве
  const cartKey = `cart:${b.slug}`
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(cartKey) || '{}') as Record<string, unknown>
      return Object.fromEntries(
        Object.entries(raw).filter(([, v]) => Number.isInteger(v) && (v as number) > 0 && (v as number) < 100),
      ) as Record<string, number>
    } catch {
      return {}
    }
  })
  useEffect(() => {
    try {
      if (Object.keys(quantities).length) localStorage.setItem(cartKey, JSON.stringify(quantities))
      else localStorage.removeItem(cartKey)
    } catch {
      /* хранилище недоступно: корзина просто не сохранится */
    }
  }, [quantities, cartKey])
  const [dish, setDish] = useState<any | null>(null) // попап блюда
  const [dishQty, setDishQty] = useState(1)
  const [cartOpen, setCartOpen] = useState(false) // попап корзины
  const [limit, setLimit] = useState(pageSize)

  // Источник — таблицы БД (там id, category_id, фото, описания). Конфиг тенанта — запасной вариант.
  const svcQ = useQuery({ queryKey: ['services', b.slug], queryFn: () => fetchServices(b.slug) })
  const catQ = useQuery({ queryKey: ['categories', b.slug], queryFn: () => fetchCategories(b.slug) })
  const services: any[] = svcQ.data?.length ? svcQ.data : b.services || []
  const categoriesSrc: any[] | undefined = catQ.data?.length ? catQ.data : b.categories

  // ---------- Категории и подкатегории ----------
  const { roots, childrenOf, allCategories } = useMemo(() => {
    const raw: Category[] = ((categoriesSrc as Category[] | undefined) || []).filter(
      (c) => c.active !== false,
    )
    const hasReal = raw.length > 0
    const ids = new Set(raw.map((c) => c.id))

    // блюда без категории (или с несуществующей) уходят в «Другое»
    const orphan = services.some((s) => {
      const cid = s.category_id ?? s.category
      return !cid || !ids.has(String(cid))
    })

    let list: Category[] = hasReal ? raw : [{ id: 'default', name: 'Меню' }]
    if (hasReal && orphan) list = [...list, { id: OTHER_ID, name: 'Другое' }]

    const listIds = new Set(list.map((c) => c.id))
    const rootsList = list.filter((c) => !c.parent_id || !listIds.has(c.parent_id))
    const map: Record<string, Category[]> = {}
    list.forEach((c) => {
      if (c.parent_id && listIds.has(c.parent_id)) {
        ;(map[c.parent_id] ||= []).push(c)
      }
    })
    return { roots: rootsList, childrenOf: map, allCategories: list }
  }, [categoriesSrc, services])

  const activeRootId = rootId || roots[0]?.id || ''
  const subcategories = childrenOf[activeRootId] || []
  const activeSubId = subcategories.some((c) => c.id === subId) ? subId : ''
  // при смене категории, подкатегории или поиска список снова начинается с первых блюд
  useEffect(() => setLimit(pageSize), [activeRootId, activeSubId, searchQuery, pageSize])

  // id категории + всех её потомков
  const collectIds = (id: string): Set<string> => {
    const out = new Set<string>([id])
    ;(childrenOf[id] || []).forEach((c) => collectIds(c.id).forEach((x) => out.add(x)))
    return out
  }

  // К какой категории относится блюдо (с учётом «Другое»/«Меню по умолчанию»)
  const categoryOfService = (s: any): string => {
    const cid = s.category_id ?? s.category
    if (cid && allCategories.some((c) => c.id === String(cid))) return String(cid)
    return allCategories.some((c) => c.id === OTHER_ID) ? OTHER_ID : allCategories[0]?.id || ''
  }

  // ---------- Фильтрация ----------
  const filteredServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      // поиск идёт по всему каталогу
      return services.filter(
        (s) =>
          String(s.name).toLowerCase().includes(q) ||
          String(s.description ?? '').toLowerCase().includes(q),
      )
    }
    const scope = collectIds(activeSubId || activeRootId)
    return services.filter((s) => scope.has(categoryOfService(s)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, searchQuery, activeRootId, activeSubId, allCategories])

  // ---------- Количество ----------
  const setQty = (key: string, next: number) =>
    setQuantities((prev) => {
      const copy = { ...prev }
      if (next <= 0) delete copy[key]
      else copy[key] = next
      return copy
    })
  const changeQty = (key: string, delta: number) => setQty(key, (quantities[key] || 0) + delta)

  // ---------- Корзина ----------
  const cartItems = useMemo(
    () =>
      services
        .filter((s) => (quantities[keyOf(s)] || 0) > 0)
        .map((s) => ({
          key: keyOf(s),
          id: s.id as string | undefined,
          name: s.name as string,
          qty: quantities[keyOf(s)] as number,
          unit: priceOf(s),
          price: priceOf(s) * quantities[keyOf(s)]!,
        })),
    [services, quantities],
  )
  const totalItemsCount = cartItems.reduce((n, i) => n + i.qty, 0)
  const totalPrice = cartItems.reduce((n, i) => n + i.price, 0)

  // Сколько позиций выбрано внутри каждой корневой категории (бейдж на табе)
  const countByRoot = useMemo(() => {
    const out: Record<string, number> = {}
    roots.forEach((r) => {
      const scope = collectIds(r.id)
      out[r.id] = services.reduce(
        (n, s) => (scope.has(categoryOfService(s)) ? n + (quantities[keyOf(s)] || 0) : n),
        0,
      )
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roots, services, quantities, allCategories])

  // ---------- Попапы ----------
  const openDish = (s: any) => {
    setDish(s)
    setDishQty(quantities[keyOf(s)] || 1)
  }
  const closeAll = () => {
    setDish(null)
    setCartOpen(false)
  }
  const confirmDish = () => {
    if (dish) setQty(keyOf(dish), dishQty)
    setDish(null)
  }

  const popupOpen = !!dish || cartOpen
  useEffect(() => {
    if (!popupOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeAll()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [popupOpen])

  // ---------- Оформление ----------
  const handleCheckout = () => {
    if (cartItems.length === 0) return
    sessionStorage.setItem(
      'pending_order_details',
      JSON.stringify({
        items: cartItems.map(({ id, name, qty, price }) => ({ id, name, qty, price })),
        totalPrice,
        summaryText: cartItems.map((i) => `${i.name} (${i.qty} шт.)`).join(', '),
      }),
    )
    setCartOpen(false)
    openBooking(cartItems[0]!.name)
  }

  // ---------- Мелкие UI-куски ----------
  const stepBtn = (filled: boolean): React.CSSProperties => ({
    width: 32,
    height: 32,
    borderRadius: 8,
    background: filled ? 'var(--accent-purple)' : 'var(--surface, #1e1e24)',
    border: filled ? 'none' : '1px solid var(--line)',
    color: filled ? '#fff' : 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    cursor: 'pointer',
  })

  const chip = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    borderRadius: 10,
    background: active ? 'var(--accent-purple)' : 'var(--surface, #1e1e24)',
    color: active ? '#fff' : 'inherit',
    border: '1px solid var(--line)',
    cursor: 'pointer',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  })

  const overlay: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 200,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  }
  const sheet: React.CSSProperties = {
    width: '100%',
    maxWidth: 520,
    maxHeight: '88vh',
    overflowY: 'auto',
    background: 'var(--bg, #15151a)',
    border: '1px solid var(--line)',
    borderRadius: '20px 20px 0 0',
    padding: 20,
    paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
  }

  const anyPhoto = filteredServices.some((s) => s.image_url || s.image)
  const emptyText = searchQuery
    ? 'Ничего не найдено. Попробуйте другое название.'
    : 'В этой категории пока нет блюд.'

  return (
    <div className="space-y-6" style={{ paddingBottom: 'calc(var(--tabbar-h, 88px) + 100px)' }}>
      {/* 1. Поиск по всему каталогу */}
      <input
        type="search"
        placeholder="Поиск по блюдам и закускам..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={{
          width: '100%',
          padding: '12px 16px',
          borderRadius: 12,
          background: 'var(--surface, #1e1e24)',
          border: '1px solid var(--line)',
          color: 'inherit',
          outline: 'none',
        }}
      />

      {/* 2. Категории */}
      {!searchQuery && roots.length > 1 && (
        <div
          role="tablist"
          style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginTop: 12 }}
        >
          {roots.map((cat) => {
            const active = activeRootId === cat.id
            const n = countByRoot[cat.id] || 0
            return (
              <button
                key={cat.id}
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setRootId(cat.id)
                  setSubId('')
                }}
                style={chip(active)}
              >
                <CategoryIcon name={cat.name} size={16} />
                {cleanCategoryName(cat.name)}
                {n > 0 && (
                  <span
                    style={{
                      marginLeft: 8,
                      padding: '1px 7px',
                      borderRadius: 999,
                      fontSize: 12,
                      background: active ? 'rgba(255,255,255,0.25)' : 'var(--accent-purple)',
                      color: '#fff',
                    }}
                  >
                    {n}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* 3. Подкатегории выбранной категории */}
      {!searchQuery && subcategories.length > 0 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          <button onClick={() => setSubId('')} style={{ ...chip(activeSubId === ''), padding: '6px 12px', fontSize: 14 }}>
            Все
          </button>
          {subcategories.map((sub) => (
            <button
              key={sub.id}
              onClick={() => setSubId(sub.id)}
              style={{ ...chip(activeSubId === sub.id), padding: '6px 12px', fontSize: 14 }}
            >
              {cleanCategoryName(sub.name)}
            </button>
          ))}
        </div>
      )}

      {/* 4. Список блюд */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
        {filteredServices.length === 0 ? (
          <p className="muted" style={{ padding: 20, textAlign: 'center' }}>
            {emptyText}
          </p>
        ) : (
          <>
          {filteredServices.slice(0, limit).map((s) => {
            const key = keyOf(s)
            const qty = quantities[key] || 0
            return (
              <div
                key={key}
                className="svc"
                onClick={() => openDish(s)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--line)',
                  cursor: 'pointer',
                }}
              >
                {anyPhoto &&
                  (s.image_url || s.image ? (
                    <img
                      src={s.image_url || s.image}
                      alt=""
                      loading="lazy"
                      style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : (
                    <span
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 12,
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--surface, #1e1e24)',
                        border: '1px solid var(--line)',
                        opacity: 0.6,
                      }}
                    >
                      <ImageIcon size={20} />
                    </span>
                  ))}
                <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <b>{s.name}</b>
                  {(s.duration_minutes || s.description) && (
                    <>
                      <br />
                      <span className="muted small">
                        {s.description || duration(s.duration_minutes)}
                      </span>
                    </>
                  )}
                </span>
                <b style={{ whiteSpace: 'nowrap' }}>
                  {s.price_from ? 'от ' : ''}
                  {money(priceOf(s), b.currency)}
                </b>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {qty > 0 && (
                    <>
                      <button aria-label="Убрать одну порцию" onClick={() => changeQty(key, -1)} style={stepBtn(false)}><MinusIcon size={16} /></button>
                      <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 'bold' }}>{qty}</span>
                    </>
                  )}
                  <button aria-label="Добавить порцию" onClick={() => changeQty(key, 1)} style={stepBtn(qty > 0)}><PlusIcon size={16} /></button>
                </div>
              </div>
            )
          })}
          {!preview && filteredServices.length > limit && (
            <button
              onClick={() => setLimit((n) => n + pageSize)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '14px 16px',
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Показать ещё {Math.min(pageSize, filteredServices.length - limit)}
              <span className="muted small" style={{ fontWeight: 400 }}>
                · осталось {filteredServices.length - limit}
              </span>
              <ChevronIcon size={16} />
            </button>
          )}
          </>
        )}
      </div>

      {/* 5. Плашка заказа: открывает корзину */}
      {totalItemsCount > 0 && !popupOpen && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setCartOpen(true)}
          onKeyDown={(e) => e.key === 'Enter' && setCartOpen(true)}
          style={{
            position: 'fixed',
            bottom: 'calc(var(--tabbar-h, 88px) + 12px + env(safe-area-inset-bottom, 0px))',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '90%',
            maxWidth: 500,
            background: 'var(--accent-purple)',
            color: '#fff',
            padding: '14px 20px',
            borderRadius: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
            zIndex: 100,
            cursor: 'pointer',
          }}
        >
          <BagIcon size={22} />
          <div style={{ flex: 1, marginLeft: 12 }}>
            <div style={{ fontSize: 13, opacity: 0.9 }}>
              Позиций в заказе: <b>{totalItemsCount}</b>
            </div>
            <div style={{ fontWeight: 'bold', fontSize: 16 }}>Итого: {money(totalPrice, b.currency)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 'bold' }}>
            <span>Открыть заказ</span>
            <Arrow />
          </div>
        </div>
      )}

      {/* 6. Попап блюда */}
      {dish && (
        <div style={overlay} onClick={closeAll}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={dish.name}
            style={sheet}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label="Закрыть"
              onClick={closeAll}
              style={{ ...stepBtn(false), float: 'right', borderRadius: 999, marginLeft: 8 }}
            >
              <CloseIcon size={16} />
            </button>
            {(dish.image || dish.image_url) && (
              <img
                src={dish.image || dish.image_url}
                alt={dish.name}
                style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 14, marginBottom: 14 }}
              />
            )}
            <h3 style={{ margin: 0 }}>{dish.name}</h3>
            {dish.description && <p className="muted" style={{ marginTop: 8 }}>{dish.description}</p>}
            {dish.duration_minutes ? (
              <p className="muted small">{duration(dish.duration_minutes)}</p>
            ) : null}
            <p style={{ fontSize: 20, margin: '12px 0' }}>
              <b>
                {dish.price_from ? 'от ' : ''}
                {money(priceOf(dish), b.currency)}
              </b>
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, margin: '16px 0' }}>
              <button
                aria-label="Меньше"
                onClick={() => setDishQty((n) => Math.max(0, n - 1))}
                style={{ ...stepBtn(false), width: 44, height: 44, fontSize: 20 }}
              ><MinusIcon size={16} /></button>
              <b style={{ fontSize: 22, minWidth: 28, textAlign: 'center' }}>{dishQty}</b>
              <button
                aria-label="Больше"
                onClick={() => setDishQty((n) => n + 1)}
                style={{ ...stepBtn(true), width: 44, height: 44, fontSize: 20 }}
              ><PlusIcon size={16} /></button>
            </div>

            <button className="btn" style={{ width: '100%' }} onClick={confirmDish}>
              {dishQty === 0
                ? 'Убрать из заказа'
                : `${quantities[keyOf(dish)] ? 'Обновить' : 'Добавить'} · ${money(priceOf(dish) * dishQty, b.currency)}`}
            </button>
            <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={closeAll}>
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* 7. Попап корзины */}
      {cartOpen && (
        <div style={overlay} onClick={closeAll}>
          <div role="dialog" aria-modal="true" aria-label="Ваш заказ" style={sheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Ваш заказ</h3>
              {cartItems.length > 0 && (
                <button
                  className="link"
                  onClick={() => setQuantities({})}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <TrashIcon size={16} /> Очистить
                </button>
              )}
            </div>

            {cartItems.length === 0 ? (
              <p className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>
                Заказ пуст. Добавьте блюда из меню.
              </p>
            ) : (
              <div style={{ marginTop: 12 }}>
                {cartItems.map((i) => (
                  <div
                    key={i.key}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line)' }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>{i.name}</b>
                      <br />
                      <span className="muted small">{money(i.unit, b.currency)} за шт.</span>
                    </span>
                    <button aria-label="Меньше" onClick={() => changeQty(i.key, -1)} style={stepBtn(false)}><MinusIcon size={16} /></button>
                    <b style={{ minWidth: 18, textAlign: 'center' }}>{i.qty}</b>
                    <button aria-label="Больше" onClick={() => changeQty(i.key, 1)} style={stepBtn(true)}><PlusIcon size={16} /></button>
                    <b style={{ minWidth: 70, textAlign: 'right' }}>{money(i.price, b.currency)}</b>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', fontSize: 18 }}>
                  <b>Итого</b>
                  <b>{money(totalPrice, b.currency)}</b>
                </div>
                <button className="btn" style={{ width: '100%' }} onClick={handleCheckout}>
                  Оформить заказ
                </button>
              </div>
            )}
            <button className="btn ghost" style={{ width: '100%', marginTop: 8 }} onClick={closeAll}>
              {cartItems.length === 0 ? 'Вернуться в меню' : 'Продолжить выбор'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ServicesPage() {
  return (
    <section className="page">
      <h2>Меню и услуги</h2>
      <ServiceList />
    </section>
  )
}
