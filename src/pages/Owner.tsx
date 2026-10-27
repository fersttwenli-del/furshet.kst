import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import { z } from 'zod'
import { addDays, format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { supabase } from '../lib/supabase'
import { errText, fetchCategories, fetchServices, fetchSlots, owner, type MenuCategory, type OwnerBooking, type Svc } from '../lib/api'
import { duration, money, telHref } from '../lib/format'
import { assetUrl, type Business, type Ctx } from '../lib/tenant'
import { prepareImage, removeByUrl, uploadImage } from '../lib/media'
import { Sheet } from '../components/Sheet'
import { AssistantSheet } from '../components/AssistantSheet'
import './owner-login.css'
import './owner-media.css'
import { Notify } from '../components/Notify'
import { AI_ENABLED } from '../lib/features'
import { Bell } from '../lib/icons'
import {
  BagIcon, ChefIcon, ChevronIcon, ClockIcon, EditIcon, EyeIcon, EyeOffIcon, ImageIcon, MinusIcon,
  PinIcon, PlusIcon, SearchIcon, TrashIcon, TruckIcon, UserIcon, UsersIcon,
} from '../components/OrderIcons'
import {
  EventFields, buildCarField, emptyEventForm, parseCarField, validateEvent,
  type EventErrors, type EventForm, type ServiceMode,
} from '../components/EventFields'
import type { PendingOrder } from '../components/OrderSummary'
import { CategoryIcon, cleanCategoryName } from '../components/CategoryIcon'

const TABS = ['Заказы', 'Меню', 'Заведение', 'Фото', 'Уведомления', 'Документы', 'Помощник'] as const

export function Owner() {
  const { b } = useOutletContext<Ctx>()
  const qc = useQueryClient()
  const sess = useQuery({
    queryKey: ['owner', 'session'],
    queryFn: async () => (await supabase.auth.getSession()).data.session,
  })
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      void qc.invalidateQueries({ queryKey: ['owner'] })
    })
    return () => data.subscription.unsubscribe()
  }, [qc])
  const logout = async () => {
    await supabase.auth.signOut()
    qc.removeQueries({ queryKey: ['owner'] })
  } // приватный кэш очищается при выходе
  if (sess.isPending) return <p className="pad muted">Загрузка…</p>
  if (!sess.data) return <Login />
  return <Cabinet b={b} onLogout={logout} />
}

const LockIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <rect x="5" y="11" width="14" height="10" rx="2.5" fill="currentColor" />
    <circle cx="12" cy="15.5" r="1.4" fill="#141518" />
    <path d="M12 16v2" stroke="#141518" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setErr('Неверная почта или пароль.')
  }
  return (
    <div className="page">
      <div className="login-wrap">
        <div className="login-ico">
          <LockIcon />
        </div>
        <h1>Кабинет</h1>
        <p className="muted">Войдите, чтобы управлять заказами и меню</p>
        <label className="muted small" htmlFor="em">
          Почта
        </label>
        <input
          id="em"
          className="field"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="muted small" htmlFor="pw">
          Пароль
        </label>
        <input
          id="pw"
          className="field"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && email && password) void submit()
          }}
        />
        {err && (
          <p role="alert" className="err">
            {err}
          </p>
        )}
        <button
          className="btn"
          disabled={busy || !email || !password}
          onClick={() => void submit()}
        >
          {busy ? 'Входим…' : 'Войти'}
        </button>
      </div>
    </div>
  )
}

function Cabinet({ b, onLogout }: { b: Business; onLogout: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Заказы')
  const [ai, setAi] = useState(false)
  const me = useQuery({ queryKey: ['owner', 'me', b.slug], queryFn: () => owner.me(b.slug) })
  if (me.isPending) return <p className="pad muted">Проверяем доступ…</p>
  if (me.isError)
    return (
      <p className="pad err">
        Не удалось проверить доступ.{' '}
        <button className="link" onClick={() => me.refetch()}>
          Повторить
        </button>
      </p>
    )
  if (!me.data)
    return (
      <section className="pad">
        <h2>Нет доступа</h2>
        <p className="muted">Эта учётная запись не привязана к заведению.</p>
        <button className="btn ghost" onClick={onLogout}>
          Выйти
        </button>
      </section>
    )
  return (
    <section className="pad">
      <div className="row between">
        <h2>Кабинет</h2>
        <button className="link" onClick={onLogout}>
          Выйти
        </button>
      </div>
      <div className="tabs2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            disabled={t === 'Помощник' && !AI_ENABLED}
            onClick={() => (t === 'Помощник' ? setAi(true) : setTab(t))}
          >
            {t === 'Помощник' && !AI_ENABLED ? 'Помощник · скоро' : t}
          </button>
        ))}
      </div>
      {tab === 'Заказы' && <Orders b={b} />}
      {tab === 'Меню' && <Menu b={b} />}
      {tab === 'Заведение' && <Settings b={b} />}
      {tab === 'Фото' && <Media b={b} />}
      {tab === 'Уведомления' && <Notify b={b} />}
      {tab === 'Документы' && <Docs b={b} />}
      {ai && <AssistantSheet slug={b.slug} scope="owner" onClose={() => setAi(false)} />}
    </section>
  )
}

const today = (b: Business) => formatInTimeZone(new Date(), b.timezone, 'yyyy-MM-dd')
const fmtT = (b: Business, s: string, p: string) =>
  formatInTimeZone(new Date(s), b.timezone, p, { locale: ru })

const iconBtn: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--surface, #1e1e24)',
  border: '1px solid var(--line)',
  color: 'inherit',
  cursor: 'pointer',
  flexShrink: 0,
  padding: 0,
}
const flexRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

// ---------- Данные заказа ----------
// Формат, персоны, место, сумма и состав лежат в поле car (см. buildCarField)
// total берётся из price_cents: сумму заказа считает сервер (create_booking)
function orderOf(x: OwnerBooking) {
  const info = parseCarField(x.car ?? '')
  return { info, total: x.price_cents / 100, structured: info.mode !== null }
}
const modeName = (m: ServiceMode | null) =>
  m === 'chef' ? 'Повар на выезд' : m === 'delivery' ? 'Доставка' : 'Заказ'
function ModeIcon({ mode, size = 18 }: { mode: ServiceMode | null; size?: number }) {
  return mode === 'chef' ? (
    <ChefIcon size={size} />
  ) : mode === 'delivery' ? (
    <TruckIcon size={size} />
  ) : (
    <BagIcon size={size} />
  )
}
function statusText(status: string, mode: ServiceMode | null): string {
  if (status === 'booked') return 'Новый'
  if (status === 'arrived')
    return mode === 'chef' ? 'Повар на месте' : mode === 'delivery' ? 'В доставке' : 'В работе'
  if (status === 'done') return 'Выполнен'
  if (status === 'cancelled') return 'Отменён'
  return status
}
function itemsLine(items: { name: string; qty: number }[]): string {
  if (items.length === 0) return ''
  const head = items
    .slice(0, 2)
    .map((i) => `${i.name} × ${i.qty}`)
    .join(', ')
  return items.length > 2 ? `${head} и ещё ${items.length - 2}` : head
}

type Filter = 'all' | 'booked' | 'arrived' | 'done' | 'cancelled'
const FILTERS: [Filter, string][] = [
  ['all', 'Все'],
  ['booked', 'Новые'],
  ['arrived', 'В работе'],
  ['done', 'Выполненные'],
  ['cancelled', 'Отменённые'],
]

function Orders({ b }: { b: Business }) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<'day' | 'week'>('day')
  const [day, setDay] = useState(today(b))
  const [filter, setFilter] = useState<Filter>('all')
  const [sel, setSel] = useState<OwnerBooking | null>(null)
  const [add, setAdd] = useState(false)
  const [block, setBlock] = useState(false)
  const to = mode === 'day' ? day : format(addDays(new Date(`${day}T12:00:00`), 6), 'yyyy-MM-dd')
  const list = useQuery({
    queryKey: ['owner', 'bookings', b.slug, day, to],
    queryFn: () => owner.bookings(b.slug, day, to),
  })
  const stats = useQuery({
    queryKey: ['owner', 'stats', b.slug, day, to],
    queryFn: () => owner.stats(b.slug, day, to),
  })
  const refresh = () => void qc.invalidateQueries({ queryKey: ['owner'] })

  const rows = list.data ?? []
  const live = rows.filter((x) => x.status !== 'cancelled')
  // Сумма считается по составу заказа, а не по цене первого блюда из базы
  const expected = live.reduce((n, x) => n + orderOf(x).total, 0)
  const visible = filter === 'all' ? rows : rows.filter((x) => x.status === filter)
  const count = (f: Filter) => (f === 'all' ? rows.length : rows.filter((x) => x.status === f).length)

  return (
    <>
      <div className="row wrap">
        <button
          className={`chip mini ${mode === 'day' ? 'sel' : ''}`}
          onClick={() => setMode('day')}
        >
          День
        </button>
        <button
          className={`chip mini ${mode === 'week' ? 'sel' : ''}`}
          onClick={() => setMode('week')}
        >
          Неделя
        </button>
        <button className="chip mini" onClick={() => setDay(today(b))}>
          Сегодня
        </button>
        <input
          aria-label="Дата"
          className="field"
          style={{ flex: 1, minWidth: 140 }}
          type="date"
          value={day}
          onChange={(e) => e.target.value && setDay(e.target.value)}
        />
      </div>

      {list.data && (
        <div className="stats">
          <div className="card">
            <span className="muted small">Заказов</span>
            <b>{live.length}</b>
          </div>
          <div className="card">
            <span className="muted small">Выполнено</span>
            <b>{rows.filter((x) => x.status === 'done').length}</b>
          </div>
          <div className="card">
            <span className="muted small">Сумма заказов</span>
            <b>{money(expected, b.currency)}</b>
          </div>
          <div className="card">
            <span className="muted small">Получено</span>
            <b>{stats.data ? money(Number(stats.data.received_cents) / 100, b.currency) : '—'}</b>
          </div>
        </div>
      )}
      {stats.isError && <p className="err small">Данные об оплатах недоступны.</p>}

      <div className="row wrap" style={{ margin: '12px 0' }}>
        <button className="btn mini" onClick={() => setAdd(true)} style={flexRow}>
          <PlusIcon size={16} /> Новый заказ
        </button>
        <button className="btn ghost mini" onClick={() => setBlock(true)} style={flexRow}>
          <ClockIcon size={16} /> Закрыть время
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
        {FILTERS.map(([k, l]) => (
          <button
            key={k}
            className={`chip mini ${filter === k ? 'sel' : ''}`}
            style={{ flexShrink: 0 }}
            onClick={() => setFilter(k)}
          >
            {l} {list.data ? count(k) : ''}
          </button>
        ))}
      </div>

      {list.isPending ? (
        <p className="muted">Загрузка…</p>
      ) : list.isError ? (
        <p className="err">
          Не удалось загрузить заказы.{' '}
          <button className="link" onClick={() => list.refetch()}>
            Повторить
          </button>
        </p>
      ) : visible.length === 0 ? (
        <p className="muted">
          {rows.length === 0 ? 'Заказов на этот период нет.' : 'В этом статусе заказов нет.'}
        </p>
      ) : (
        visible.map((x) => {
          const { info, total, structured } = orderOf(x)
          return (
            <button
              key={x.id}
              className="card bk"
              onClick={() => setSel(x)}
              style={{ opacity: x.status === 'cancelled' ? 0.55 : 1 }}
            >
              <span className="row between">
                <b>{fmtT(b, x.starts_at, 'd MMM, HH:mm')}</b>
                <span className="pill">{statusText(x.status, info.mode)}</span>
              </span>
              {structured ? (
                <>
                  <span style={flexRow}>
                    <ModeIcon mode={info.mode} />
                    <b>{modeName(info.mode)}</b>
                    {info.guests !== null && (
                      <span className="muted small" style={flexRow}>
                        <UsersIcon size={14} /> {info.guests}
                      </span>
                    )}
                  </span>
                  {info.items.length > 0 && <span>{itemsLine(info.items)}</span>}
                  {info.place && (
                    <span className="muted small" style={flexRow}>
                      <PinIcon size={14} /> {info.place}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span>{x.service_name}</span>
                  {x.car && <span className="muted small">{x.car}</span>}
                </>
              )}
              <span className="muted small">
                {x.customer_name} · {x.customer_phone}
              </span>
              <span className="muted small">
                {money(total, b.currency)} · оплачено {money(x.paid_cents / 100, b.currency)}
              </span>
            </button>
          )
        })
      )}
      {sel && <OrderActions b={b} bk={sel} onClose={() => setSel(null)} onDone={refresh} />}
      {add && <NewOrder b={b} onClose={() => setAdd(false)} onDone={refresh} />}
      {block && <BlockTime b={b} onClose={() => setBlock(false)} onDone={refresh} />}
    </>
  )
}

function useAct(onDone: () => void, close?: () => void) {
  const [msg, setMsg] = useState<string | null>(null)
  const m = useMutation({
    mutationFn: (f: () => Promise<unknown>) => f(),
    onSuccess: () => {
      setMsg(null)
      onDone()
      close?.()
    },
    onError: (e) => setMsg(errText(e)),
  })
  return { run: (f: () => Promise<unknown>) => m.mutate(f), busy: m.isPending, msg }
}
const Err = ({ m }: { m: string | null }) =>
  m ? (
    <p role="alert" className="err">
      {m}
    </p>
  ) : null

function SlotPicker({
  b,
  service,
  onPick,
  picked,
}: {
  b: Business
  service: string | null
  onPick: (s: string) => void
  picked: string | null
}) {
  const [day, setDay] = useState(today(b))
  const q = useQuery({
    queryKey: ['slots', b.slug, service, day],
    queryFn: () => fetchSlots(b.slug, service!, day),
    enabled: !!service,
  })
  return (
    <>
      <input
        aria-label="Дата"
        className="field"
        type="date"
        value={day}
        onChange={(e) => e.target.value && setDay(e.target.value)}
      />
      {!service ? (
        <p className="muted small">Сначала выберите блюда.</p>
      ) : q.isPending ? (
        <p className="muted">Загрузка…</p>
      ) : q.isError ? (
        <p className="err">Не удалось получить время.</p>
      ) : q.data.length === 0 ? (
        <p className="muted">В этот день заказы не принимаются.</p>
      ) : (
        <div className="chips">
          {q.data.map((s) => (
            <button
              key={s.slot}
              disabled={!s.free}
              className={`chip ${picked === s.slot ? 'sel' : ''}`}
              onClick={() => onPick(s.slot)}
            >
              {fmtT(b, s.slot, 'HH:mm')}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function OrderActions({
  b,
  bk,
  onClose,
  onDone,
}: {
  b: Business
  bk: OwnerBooking
  onClose: () => void
  onDone: () => void
}) {
  const a = useAct(onDone, onClose)
  const [amount, setAmount] = useState('')
  const [move, setMove] = useState(false)
  const [slot, setSlot] = useState<string | null>(null)
  const svc = useQuery({
    queryKey: ['owner', 'svc', b.slug],
    queryFn: () => fetchServices(b.slug, true),
  })
  const sid = svc.data?.find((s) => s.name === bk.service_name)?.id ?? null
  const { info, total, structured } = orderOf(bk)
  const cents = Math.round(Number(amount.replace(',', '.')) * 100)
  const okAmt = Number.isFinite(cents) && cents > 0
  const remain = Math.round(total * 100) - bk.paid_cents
  const arrivedLabel =
    info.mode === 'chef'
      ? 'Повар на месте'
      : info.mode === 'delivery'
        ? 'Передан в доставку'
        : 'Взят в работу'
  return (
    <Sheet
      title={structured ? modeName(info.mode) : bk.service_name}
      sub={`${fmtT(b, bk.starts_at, 'd MMMM, HH:mm')} · ${statusText(bk.status, info.mode)}`}
      onClose={onClose}
    >
      <Err m={a.msg} />

      <div className="card col">
        {structured && info.items.length > 0 ? (
          info.items.map((i, n) => (
            <div className="kv" key={`${i.name}-${n}`}>
              <span>{i.name}</span>
              <b>× {i.qty}</b>
            </div>
          ))
        ) : (
          <div className="kv">
            <span>{bk.service_name}</span>
          </div>
        )}
        <div className="kv">
          <span className="muted">Итого</span>
          <b>{money(total, b.currency)}</b>
        </div>
        <div className="kv">
          <span className="muted">Оплачено</span>
          <b>{money(bk.paid_cents / 100, b.currency)}</b>
        </div>
      </div>

      {structured ? (
        <>
          {info.guests !== null && (
            <p style={flexRow}>
              <UsersIcon size={18} /> <b>{info.guests} персон</b>
            </p>
          )}
          {info.place && (
            <p style={flexRow}>
              <PinIcon size={18} />
              <span>
                <span className="muted small">
                  {info.mode === 'delivery' ? 'Адрес доставки' : 'Место проведения'}
                </span>
                <br />
                <b>{info.place}</b>
              </span>
            </p>
          )}
        </>
      ) : (
        bk.car && <p className="muted">{bk.car}</p>
      )}
      <p style={flexRow}>
        <UserIcon size={18} />
        <span>
          <b>{bk.customer_name}</b>
          <br />
          <a href={telHref(bk.customer_phone)}>{bk.customer_phone}</a>
        </span>
      </p>
      {bk.resource_name && (
        <p className="muted small">Исполнитель: {bk.resource_name}</p>
      )}

      <div className="row wrap">
        {bk.status === 'booked' && (
          <button
            className="btn mini"
            disabled={a.busy}
            onClick={() => a.run(() => owner.setStatus(bk.id, 'arrived'))}
          >
            {arrivedLabel}
          </button>
        )}
        {(bk.status === 'booked' || bk.status === 'arrived') && (
          <button
            className="btn mini"
            disabled={a.busy}
            onClick={() => a.run(() => owner.setStatus(bk.id, 'done'))}
          >
            Заказ выполнен
          </button>
        )}
      </div>

      {bk.status !== 'cancelled' && remain > 0 && (
        <button
          className="btn ghost"
          disabled={a.busy}
          onClick={() => a.run(() => owner.payment(bk.id, remain, 'payment'))}
        >
          Принять остаток · {money(remain / 100, b.currency)}
        </button>
      )}
      <label className="muted small" htmlFor="amt">
        Другая сумма оплаты или возврата, {b.currency}
      </label>
      <input
        id="amt"
        className="field"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <div className="row wrap">
        <button
          className="btn ghost mini"
          disabled={a.busy || !okAmt}
          onClick={() => a.run(() => owner.payment(bk.id, cents, 'payment'))}
        >
          Внести оплату
        </button>
        <button
          className="btn ghost mini"
          disabled={a.busy || !okAmt}
          onClick={() => a.run(() => owner.payment(bk.id, cents, 'refund'))}
        >
          Вернуть
        </button>
      </div>

      {bk.status === 'booked' && (
        <>
          <button className="btn ghost" onClick={() => setMove(!move)}>
            Перенести
          </button>
          {move && (
            <>
              <SlotPicker b={b} service={sid} picked={slot} onPick={setSlot} />
              <button
                className="btn"
                disabled={!slot || a.busy}
                onClick={() => a.run(() => owner.reschedule(bk.id, slot!))}
              >
                Перенести на выбранное время
              </button>
            </>
          )}
          <button
            className="btn danger"
            disabled={a.busy}
            onClick={() => {
              if (window.confirm('Отменить заказ?')) a.run(() => owner.cancel(bk.id))
            }}
          >
            Отменить заказ
          </button>
        </>
      )}
      <button
        className="btn ghost"
        disabled={a.busy}
        onClick={() => {
          if (
            window.confirm(
              'Удалить имя, телефон и адрес клиента из этого заказа? Действие необратимо.',
            )
          )
            a.run(() => owner.erase(bk.id))
        }}
      >
        Удалить данные клиента
      </button>
    </Sheet>
  )
}

function NewOrder({
  b,
  onClose,
  onDone,
}: {
  b: Business
  onClose: () => void
  onDone: () => void
}) {
  const a = useAct(onDone, onClose)
  const svc = useQuery({
    queryKey: ['owner', 'svc', b.slug],
    queryFn: () => fetchServices(b.slug, true),
  })
  const [qty, setQty] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [slot, setSlot] = useState<string | null>(null)
  const [form, setForm] = useState<EventForm>(emptyEventForm)
  const [errs, setErrs] = useState<EventErrors>({})

  const dishes = (svc.data ?? []).filter((s) => s.active !== false)
  const q = search.trim().toLowerCase()
  const shown = q ? dishes.filter((s) => s.name.toLowerCase().includes(q)) : dishes
  const picked = dishes.filter((s) => (qty[s.id] || 0) > 0)
  const first = picked[0]
  const order: PendingOrder | null = picked.length
    ? {
        items: picked.map((s) => ({
          name: s.name,
          qty: qty[s.id]!,
          price: (s.price_cents / 100) * qty[s.id]!,
        })),
        totalPrice: picked.reduce((n, s) => n + (s.price_cents / 100) * qty[s.id]!, 0),
        summaryText: picked.map((s) => `${s.name} (${qty[s.id]} шт.)`).join(', '),
      }
    : null
  const change = (id: string, d: number) =>
    setQty((p) => {
      const n = Math.max(0, (p[id] || 0) + d)
      const c = { ...p }
      if (n === 0) delete c[id]
      else c[id] = n
      return c
    })
  const submit = () => {
    const e = validateEvent(form)
    setErrs(e)
    if (Object.keys(e).length > 0 || !first || !slot) return
    a.run(() =>
      owner.create(b.slug, {
        service: first.id,
        start: slot,
        name: form.name.trim(),
        phone: form.phone.trim(),
        car: buildCarField(form, order),
        serviceType: form.mode as 'chef' | 'delivery',
        address: form.place.trim(),
        guests: form.mode === 'chef' ? Number(form.guests) : null,
        items: picked.map((s) => ({ id: s.id, qty: qty[s.id]! })),
      }),
    )
  }

  return (
    <Sheet title="Новый заказ" sub="Заказ по телефону или лично" onClose={onClose}>
      <Err m={a.msg} />
      <b>1. Блюда</b>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.6, display: 'flex' }}>
          <SearchIcon size={16} />
        </span>
        <input
          className="field"
          style={{ paddingLeft: 36 }}
          placeholder="Найти блюдо"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div
        style={{
          maxHeight: 260,
          overflowY: 'auto',
          border: '1px solid var(--line)',
          borderRadius: 14,
        }}
      >
        {svc.isPending ? (
          <p className="muted" style={{ padding: 12 }}>Загрузка…</p>
        ) : shown.length === 0 ? (
          <p className="muted" style={{ padding: 12 }}>Ничего не найдено.</p>
        ) : (
          shown.map((s) => {
            const n = qty[s.id] || 0
            return (
              <div
                key={s.id}
                style={{ ...flexRow, padding: '10px 12px', borderBottom: '1px solid var(--line)' }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{s.name}</b>
                  <br />
                  <span className="muted small">{money(s.price_cents / 100, b.currency)}</span>
                </span>
                {n > 0 && (
                  <>
                    <button aria-label="Меньше" style={iconBtn} onClick={() => change(s.id, -1)}>
                      <MinusIcon size={16} />
                    </button>
                    <b style={{ minWidth: 18, textAlign: 'center' }}>{n}</b>
                  </>
                )}
                <button
                  aria-label="Больше"
                  style={{
                    ...iconBtn,
                    background: n > 0 ? 'var(--accent, #ff8a1f)' : iconBtn.background,
                    color: n > 0 ? 'var(--on-accent, #141518)' : 'inherit',
                    border: n > 0 ? 'none' : iconBtn.border,
                  }}
                  onClick={() => change(s.id, 1)}
                >
                  <PlusIcon size={16} />
                </button>
              </div>
            )
          })
        )}
      </div>
      {order && (
        <p className="muted small">
          Выбрано: {order.items.reduce((n, i) => n + i.qty, 0)} шт. на{' '}
          <b>{money(order.totalPrice, b.currency)}</b>
        </p>
      )}

      <b>2. Дата и время</b>
      <SlotPicker b={b} service={first?.id ?? null} picked={slot} onPick={setSlot} />

      <b>3. Клиент и место</b>
      <EventFields value={form} errors={errs} onChange={setForm} />

      <button
        className="btn"
        disabled={!first || !slot || a.busy}
        onClick={submit}
      >
        {a.busy ? 'Создаём…' : 'Создать заказ'}
      </button>
    </Sheet>
  )
}

function BlockTime({
  b,
  onClose,
  onDone,
}: {
  b: Business
  onClose: () => void
  onDone: () => void
}) {
  const a = useAct(onDone, onClose)
  const res = useQuery({
    queryKey: ['owner', 'res', b.slug],
    queryFn: () => owner.resources(b.slug),
  })
  const [r, setR] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const ok = r && from && to && fromZonedTime(to, b.timezone) > fromZonedTime(from, b.timezone)
  return (
    <Sheet
      title="Закрыть время"
      sub="В это время клиенты не смогут оформить заказ. Время по часовому поясу заведения."
      onClose={onClose}
    >
      <Err m={a.msg} />
      <select aria-label="Исполнитель" className="field" value={r} onChange={(e) => setR(e.target.value)}>
        <option value="">Повар или бригада…</option>
        {res.data?.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
      <label className="muted small" htmlFor="bf">
        С
      </label>
      <input
        id="bf"
        className="field"
        type="datetime-local"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
      />
      <label className="muted small" htmlFor="bt">
        До
      </label>
      <input
        id="bt"
        className="field"
        type="datetime-local"
        value={to}
        onChange={(e) => setTo(e.target.value)}
      />
      <button
        className="btn"
        disabled={!ok || a.busy}
        onClick={() =>
          a.run(() =>
            owner.block(
              b.slug,
              r,
              fromZonedTime(from, b.timezone).toISOString(),
              fromZonedTime(to, b.timezone).toISOString(),
            ),
          )
        }
      >
        Закрыть время
      </button>
    </Sheet>
  )
}

// ---------- Меню: категории и блюда ----------
const IMG_ACCEPT = 'image/jpeg,image/png,image/webp'

type CatData = {
  id: string | null
  name: string
  description: string
  image_url: string | null
  active: boolean
  sort_order: number
}
type DishData = {
  id: string | null
  name: string
  price_cents: number
  duration_minutes: number
  active?: boolean
  category_id?: string | null
  description?: string
  image_url?: string | null
}

function useImageUpload(b: Business) {
  const [busy, setBusy] = useState(false)
  const upload = async (file: File | undefined): Promise<string | null> => {
    if (!file) return null
    setBusy(true)
    try {
      const { data, error } = await supabase.from('tenants').select('id').eq('slug', b.slug).single()
      if (error || !data) throw error ?? new Error('Не удалось определить заведение')
      const blob = await prepareImage(file, 1400, 'image/jpeg')
      return await uploadImage(data.id, blob, 'jpg')
    } catch (e) {
      window.alert((e as Error).message || 'Не удалось загрузить фото')
      return null
    } finally {
      setBusy(false)
    }
  }
  return { busy, upload }
}

function ImageField({
  b,
  label,
  url,
  onChange,
  onBusy,
}: {
  b: Business
  label: string
  url: string
  onChange: (u: string) => void
  onBusy: (v: boolean) => void
}) {
  const { busy, upload } = useImageUpload(b)
  useEffect(() => onBusy(busy), [busy, onBusy])
  return (
    <div className="col">
      <span className="muted small">{label}</span>
      {url && (
        <img
          src={url}
          alt=""
          style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 14 }}
        />
      )}
      <div className="row wrap">
        <label className="btn ghost mini filebtn" style={flexRow}>
          <ImageIcon size={16} /> {busy ? 'Загружаем…' : url ? 'Заменить фото' : 'Загрузить фото'}
          <input
            type="file"
            accept={IMG_ACCEPT}
            hidden
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              void upload(f).then((u) => u && onChange(u))
            }}
          />
        </label>
        {url && (
          <button type="button" className="btn ghost mini" style={flexRow} onClick={() => onChange('')}>
            <TrashIcon size={16} /> Убрать
          </button>
        )}
      </div>
    </div>
  )
}

function CategorySheet({
  b,
  cat,
  onClose,
  onSaved,
}: {
  b: Business
  cat: CatData
  onClose: () => void
  onSaved: () => void
}) {
  const a = useAct(onSaved, onClose)
  const [name, setName] = useState(cat.name)
  const [description, setDescription] = useState(cat.description)
  const [imageUrl, setImageUrl] = useState(cat.image_url ?? '')
  const [active, setActive] = useState(cat.active)
  const [sortOrder, setSortOrder] = useState(String(cat.sort_order ?? 0))
  const [uploading, setUploading] = useState(false)
  const order = Number(sortOrder)
  const ok = name.trim().length > 0 && Number.isInteger(order)
  return (
    <Sheet title={cat.id ? 'Категория' : 'Новая категория'} sub={cat.id ? cat.name : undefined} onClose={onClose}>
      <Err m={a.msg} />
      <label className="muted small" htmlFor="cn">
        Название
      </label>
      <input
        id="cn"
        className="field"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Например, Салаты"
      />
      <label className="muted small" htmlFor="cd">
        Описание (необязательно)
      </label>
      <textarea
        id="cd"
        className="field"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <ImageField b={b} label="Фото категории" url={imageUrl} onChange={setImageUrl} onBusy={setUploading} />
      <label className="muted small" htmlFor="co">
        Место в меню (меньше — выше)
      </label>
      <input
        id="co"
        className="field"
        type="number"
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value)}
      />
      <label className="row">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Показывать клиентам
      </label>
      <button
        className="btn"
        disabled={!ok || a.busy || uploading}
        onClick={() =>
          a.run(() =>
            owner.upsertCategory(b.slug, {
              id: cat.id,
              name: name.trim(),
              description,
              imageUrl: imageUrl || null,
              active,
              sortOrder: order,
            }),
          )
        }
      >
        {a.busy ? 'Сохраняем…' : 'Сохранить категорию'}
      </button>
    </Sheet>
  )
}

function DishSheet({
  b,
  dish,
  cats,
  onClose,
  onSaved,
}: {
  b: Business
  dish: DishData
  cats: MenuCategory[]
  onClose: () => void
  onSaved: () => void
}) {
  const a = useAct(onSaved, onClose)
  const [name, setName] = useState(dish.name)
  const [price, setPrice] = useState(dish.id ? String(dish.price_cents / 100) : '')
  const [min, setMin] = useState(String(dish.duration_minutes))
  const [active, setActive] = useState(dish.active ?? true)
  const [categoryId, setCategoryId] = useState(dish.category_id ?? '')
  const [description, setDescription] = useState(dish.description ?? '')
  const [imageUrl, setImageUrl] = useState(dish.image_url ?? '')
  const [uploading, setUploading] = useState(false)
  const minutes = Number(min)
  const cents = Math.round(Number(price.replace(',', '.')) * 100)
  const ok =
    !!name.trim() && price.trim() !== '' && Number.isFinite(cents) && cents >= 0 && Number.isInteger(minutes) && minutes > 0
  return (
    <Sheet title={dish.id ? 'Блюдо' : 'Новое блюдо'} sub={dish.id ? dish.name : undefined} onClose={onClose}>
      <Err m={a.msg} />
      <label className="muted small" htmlFor="dn">
        Название
      </label>
      <input id="dn" className="field" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="muted small" htmlFor="dc">
        Категория
      </label>
      <select id="dc" className="field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">Без категории</option>
        {cats.map((c) => (
          <option key={c.id} value={c.id}>
            {cleanCategoryName(c.name)}
            {!c.active ? ' (скрыта)' : ''}
          </option>
        ))}
      </select>
      <div className="row">
        <div style={{ flex: 1 }}>
          <label className="muted small" htmlFor="dp">
            Цена, {b.currency}
          </label>
          <input
            id="dp"
            className="field"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className="muted small" htmlFor="dm">
            Готовка, мин {ok ? `(${duration(minutes)})` : ''}
          </label>
          <input
            id="dm"
            className="field"
            inputMode="numeric"
            value={min}
            onChange={(e) => setMin(e.target.value)}
          />
        </div>
      </div>
      <label className="muted small" htmlFor="dd">
        Описание: состав, подача
      </label>
      <textarea
        id="dd"
        className="field"
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <ImageField b={b} label="Фото блюда" url={imageUrl} onChange={setImageUrl} onBusy={setUploading} />
      <label className="row">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Показывать клиентам
      </label>
      <button
        className="btn"
        disabled={!ok || a.busy || uploading}
        onClick={() =>
          a.run(() =>
            owner.upsertService(b.slug, {
              id: dish.id,
              categoryId: categoryId || null,
              name: name.trim(),
              cents,
              minutes,
              active,
              description,
              imageUrl: imageUrl || null,
            }),
          )
        }
      >
        {a.busy ? 'Сохраняем…' : 'Сохранить блюдо'}
      </button>
      <p className="muted small">Изменение цены не затрагивает уже созданные заказы.</p>
    </Sheet>
  )
}

function Menu({ b }: { b: Business }) {
  const qc = useQueryClient()
  const dishesQ = useQuery({
    queryKey: ['owner', 'dishes', b.slug],
    queryFn: () => fetchServices(b.slug, true),
  })
  const catsQ = useQuery({
    queryKey: ['owner', 'categories', b.slug],
    queryFn: () => fetchCategories(b.slug, true),
  })
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [dish, setDish] = useState<DishData | null>(null)
  const [cat, setCat] = useState<CatData | null>(null)
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['owner'] })
    void qc.invalidateQueries({ queryKey: ['services', b.slug] })
    void qc.invalidateQueries({ queryKey: ['categories', b.slug] })
  }
  const quick = useAct(refresh)

  const cats = catsQ.data ?? []
  const dishes = dishesQ.data ?? []
  const q = search.trim().toLowerCase()
  const match = (s: Svc) => !q || s.name.toLowerCase().includes(q)
  const known = new Set(cats.map((c) => c.id))
  const groups = [
    ...cats.map((c) => {
      const all = dishes.filter((s) => s.category_id === c.id)
      return { key: c.id, cat: c as MenuCategory | null, all, items: all.filter(match) }
    }),
    (() => {
      const all = dishes.filter((s) => !s.category_id || !known.has(s.category_id))
      return { key: '__none', cat: null as MenuCategory | null, all, items: all.filter(match) }
    })(),
  ].filter((g) => (g.cat ? !q || g.items.length > 0 : g.all.length > 0 && (!q || g.items.length > 0)))

  const toggleActive = (s: Svc) =>
    quick.run(() =>
      owner.upsertService(b.slug, {
        id: s.id,
        categoryId: s.category_id,
        name: s.name,
        cents: s.price_cents,
        minutes: s.duration_minutes,
        active: !(s.active ?? true),
        description: s.description,
        imageUrl: s.image_url,
      }),
    )
  const newDish = (categoryId: string | null) =>
    setDish({ id: null, name: '', price_cents: 0, duration_minutes: 60, category_id: categoryId, description: '', image_url: null })

  return (
    <div className="col">
      <div className="row between wrap">
        <p className="muted small" style={{ margin: 0 }}>
          {dishes.length} блюд · {cats.length} категорий
        </p>
        <div className="row wrap">
          <button className="btn mini" style={flexRow} onClick={() => newDish(cats.find((c) => c.active)?.id ?? null)}>
            <PlusIcon size={16} /> Блюдо
          </button>
          <button
            className="btn ghost mini"
            style={flexRow}
            onClick={() =>
              setCat({ id: null, name: '', description: '', image_url: null, active: true, sort_order: cats.length + 1 })
            }
          >
            <PlusIcon size={16} /> Категория
          </button>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.6, display: 'flex' }}>
          <SearchIcon size={16} />
        </span>
        <input
          className="field"
          style={{ paddingLeft: 36 }}
          placeholder="Найти блюдо"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <Err m={quick.msg} />

      {catsQ.isPending || dishesQ.isPending ? (
        <p className="muted">Загрузка меню…</p>
      ) : catsQ.isError ? (
        <p className="err">Не удалось загрузить категории. Примените миграцию 0010_menu_management.sql.</p>
      ) : dishesQ.isError ? (
        <p className="err">Не удалось загрузить блюда.</p>
      ) : groups.length === 0 ? (
        <div className="card col">
          <b>{q ? 'Ничего не найдено' : 'Меню пока пустое'}</b>
          {!q && (
            <p className="muted small" style={{ margin: 0 }}>
              Начните с категории, например «Салаты» или «Горячее», а затем добавьте в неё блюда.
            </p>
          )}
        </div>
      ) : (
        groups.map((g) => {
          const isOpen = !!q || !!open[g.key]
          const hidden = g.cat && !g.cat.active
          return (
            <div className="card" key={g.key} style={{ padding: 0, overflow: 'hidden', opacity: hidden ? 0.7 : 1 }}>
              <div style={{ ...flexRow, padding: '12px 14px' }}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen((p) => ({ ...p, [g.key]: !p[g.key] }))}
                  style={{
                    ...flexRow,
                    flex: 1,
                    minWidth: 0,
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                    textAlign: 'left',
                  }}
                >
                  <ChevronIcon size={18} open={isOpen} />
                  {g.cat && <CategoryIcon name={g.cat.name} size={18} />}
                  <b>{g.cat ? cleanCategoryName(g.cat.name) : 'Без категории'}</b>
                  <span className="muted small">{g.all.length}</span>
                  {hidden && <span className="pill">скрыта</span>}
                </button>
                {g.cat && (
                  <button
                    aria-label={`Изменить категорию ${g.cat.name}`}
                    style={iconBtn}
                    onClick={() =>
                      setCat({
                        id: g.cat!.id,
                        name: g.cat!.name,
                        description: g.cat!.description,
                        image_url: g.cat!.image_url,
                        active: g.cat!.active,
                        sort_order: g.cat!.sort_order,
                      })
                    }
                  >
                    <EditIcon size={16} />
                  </button>
                )}
              </div>
              {isOpen && (
                <div style={{ borderTop: '1px solid var(--line)' }}>
                  {g.items.length === 0 && (
                    <p className="muted small" style={{ padding: '12px 14px', margin: 0 }}>
                      В этой категории пока нет блюд.
                    </p>
                  )}
                  {g.items.map((s) => {
                    const off = s.active === false
                    return (
                      <div
                        key={s.id}
                        style={{ ...flexRow, padding: '10px 14px', borderBottom: '1px solid var(--line)', opacity: off ? 0.55 : 1 }}
                      >
                        {s.image_url ? (
                          <img
                            src={s.image_url}
                            alt=""
                            loading="lazy"
                            style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
                          />
                        ) : (
                          <span style={{ ...iconBtn, width: 48, height: 48, opacity: 0.6, cursor: 'default' }}>
                            <ImageIcon size={18} />
                          </span>
                        )}
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <b>{s.name}</b>
                          <br />
                          <span className="muted small">
                            {money(s.price_cents / 100, b.currency)} · {duration(s.duration_minutes)}
                            {off ? ' · скрыто' : ''}
                          </span>
                        </span>
                        <button
                          aria-label={off ? 'Показать клиентам' : 'Скрыть от клиентов'}
                          title={off ? 'Показать клиентам' : 'Скрыть от клиентов'}
                          style={iconBtn}
                          disabled={quick.busy}
                          onClick={() => toggleActive(s)}
                        >
                          {off ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                        </button>
                        <button aria-label={`Изменить ${s.name}`} style={iconBtn} onClick={() => setDish(s)}>
                          <EditIcon size={16} />
                        </button>
                      </div>
                    )
                  })}
                  {!q && (
                    <button
                      className="link"
                      style={{ ...flexRow, padding: '12px 14px' }}
                      onClick={() => newDish(g.cat ? g.cat.id : null)}
                    >
                      <PlusIcon size={16} /> Добавить блюдо
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
      <p className="muted small">
        Скрытые категории и блюда не показываются клиентам, но остаются в базе. Удалить позицию
        можно только скрыв её.
      </p>
      {dish && <DishSheet b={b} dish={dish} cats={cats} onClose={() => setDish(null)} onSaved={refresh} />}
      {cat && <CategorySheet b={b} cat={cat} onClose={() => setCat(null)} onSaved={refresh} />}
    </div>
  )
}

const DAYS: [string, string][] = [
  ['mon', 'Пн'],
  ['tue', 'Вт'],
  ['wed', 'Ср'],
  ['thu', 'Чт'],
  ['fri', 'Пт'],
  ['sat', 'Сб'],
  ['sun', 'Вс'],
]
const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
function OrderRules({ b }: { b: Business }) {
  const qc = useQueryClient()
  const [value, setValue] = useState(b.min_order ? String(b.min_order) : '')
  const [ok, setOk] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const amount = value.trim() === '' ? 0 : Number(value.replace(/\s/g, '').replace(',', '.'))
  const valid = Number.isFinite(amount) && amount >= 0 && amount <= 10_000_000
  const m = useMutation({
    mutationFn: () => owner.setMinOrder(b.slug, Math.round(amount * 100)),
    onSuccess: () => {
      setOk(true)
      setMsg(null)
      void qc.invalidateQueries({ queryKey: ['business', b.slug] })
    },
    onError: (e) => {
      setOk(false)
      setMsg(errText(e))
    },
  })
  return (
    <div className="card col" style={{ marginBottom: 16 }}>
      <b>Правила заказа</b>
      <label className="muted small" htmlFor="mo">
        Минимальная сумма заказа {valid && amount > 0 ? `· ${money(amount, b.currency)}` : ''}
      </label>
      <input
        id="mo"
        className="field"
        inputMode="decimal"
        placeholder="Без ограничения"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setOk(false)
        }}
      />
      <p className="muted small" style={{ margin: 0 }}>
        Клиенты не смогут оформить заказ на меньшую сумму. Пусто или 0 — без ограничения. Заказы,
        которые вы вносите сами, не ограничиваются.
      </p>
      <Err m={msg} />
      {!valid && <p className="err small">Введите сумму числом, например 10000.</p>}
      {ok && (
        <p className="muted small" role="status">
          Сохранено.
        </p>
      )}
      <button className="btn mini" disabled={!valid || m.isPending} onClick={() => m.mutate()}>
        {m.isPending ? 'Сохраняем…' : 'Сохранить'}
      </button>
    </div>
  )
}

function Settings({ b }: { b: Business }) {
  const qc = useQueryClient()
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [f, setF] = useState({
    phone: b.phone,
    address: b.address,
    route_url: b.route_url ?? '',
    description: b.description,
    cards: b.cards,
    hours: b.hours,
  })
  const m = useMutation({
    mutationFn: () =>
      owner.updateConfig(b.slug, { ...f, phone: f.phone.trim(), address: f.address.trim() }),
    onSuccess: () => {
      setMsg(null)
      setOk(true)
      void qc.invalidateQueries({ queryKey: ['business', b.slug] })
    },
    onError: (e) => {
      setOk(false)
      setMsg(errText(e))
    },
  })
  const save = () => {
    for (const [, h] of Object.entries(f.hours))
      if (h && (!Time.safeParse(h[0]).success || !Time.safeParse(h[1]).success || h[0] >= h[1])) {
        setOk(false)
        setMsg('Проверьте часы работы: начало раньше конца, формат ЧЧ:ММ.')
        return
      }
    if (f.route_url && !/^https:\/\//.test(f.route_url)) {
      setOk(false)
      setMsg('Ссылка 2ГИС должна начинаться с https://')
      return
    }
    if (!/^\+?[0-9\s()-]{7,20}$/.test(f.phone.trim())) {
      setOk(false)
      setMsg('Проверьте номер телефона, например +7 700 000 00 00.')
      return
    }
    if (!f.address.trim()) {
      setOk(false)
      setMsg('Укажите адрес.')
      return
    }
    m.mutate()
  }
  const card = (k: 'booking' | 'ai' | 'install', label: string): ReactNode => (
    <div className="card col">
      <b>{label}</b>
      <input
        aria-label={`${label}: заголовок`}
        className="field"
        value={f.cards[k].title}
        onChange={(e) =>
          setF({ ...f, cards: { ...f.cards, [k]: { ...f.cards[k], title: e.target.value } } })
        }
      />
      <textarea
        aria-label={`${label}: текст`}
        className="field"
        rows={2}
        value={f.cards[k].text}
        onChange={(e) =>
          setF({ ...f, cards: { ...f.cards, [k]: { ...f.cards[k], text: e.target.value } } })
        }
      />
    </div>
  )
  return (
    <>
      <Err m={msg} />
      {ok && (
        <p className="muted" role="status">
          Сохранено.
        </p>
      )}
      <OrderRules b={b} />
      <label className="muted small" htmlFor="ph">
        Телефон
      </label>
      <input
        id="ph"
        className="field"
        value={f.phone}
        onChange={(e) => setF({ ...f, phone: e.target.value })}
      />
      <label className="muted small" htmlFor="ad">
        Адрес
      </label>
      <input
        id="ad"
        className="field"
        value={f.address}
        onChange={(e) => setF({ ...f, address: e.target.value })}
      />
      <label className="muted small" htmlFor="ru">
        Ссылка 2ГИС для кнопки «Маршрут»
      </label>
      <input
        id="ru"
        className="field"
        placeholder="https://go.2gis.com/…"
        value={f.route_url}
        onChange={(e) => setF({ ...f, route_url: e.target.value })}
      />
      <p className="muted small">
        Найдите заведение в 2ГИС, нажмите «Поделиться» и вставьте ссылку сюда. Без неё кнопка откроет
        поиск 2ГИС по адресу.
      </p>
      <label className="muted small" htmlFor="ds">
        Описание
      </label>
      <textarea
        id="ds"
        className="field"
        rows={3}
        value={f.description}
        onChange={(e) => setF({ ...f, description: e.target.value })}
      />
      <h3>Часы работы</h3>
      {DAYS.map(([k, l]) => {
        const h = f.hours[k] ?? null
        const set = (v: [string, string] | null) => setF({ ...f, hours: { ...f.hours, [k]: v } })
        return (
          <div className="row wrap" key={k}>
            <b style={{ width: 28 }}>{l}</b>
            <label className="row small">
              <input
                type="checkbox"
                checked={!h}
                onChange={(e) => set(e.target.checked ? null : ['09:00', '17:00'])}
              />
              выходной
            </label>
            {h && (
              <>
                <input
                  aria-label={`${l} с`}
                  className="field"
                  style={{ width: 100 }}
                  value={h[0]}
                  onChange={(e) => set([e.target.value, h[1]])}
                />
                <input
                  aria-label={`${l} до`}
                  className="field"
                  style={{ width: 100 }}
                  value={h[1]}
                  onChange={(e) => set([h[0], e.target.value])}
                />
              </>
            )}
          </div>
        )
      })}
      <h3>Карточки на главной</h3>
      {card('booking', 'Заказ')}
      {card('ai', 'ИИ')}
      {card('install', 'Установка')}
      <button className="btn" disabled={m.isPending} onClick={save}>
        {m.isPending ? 'Сохраняем…' : 'Сохранить'}
      </button>
      <p className="muted small">
        Логотип, главное фото и фотографии галереи меняются на вкладке «Фото».
      </p>
    </>
  )
}

type Work = { image: string; caption: string }
const ACCEPT = 'image/jpeg,image/png,image/webp'
function Media({ b }: { b: Business }) {
  const qc = useQueryClient()
  const tid = useQuery({
    queryKey: ['owner', 'tid', b.slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', b.slug)
        .single()
      if (error) throw error
      return data.id as string
    },
  })
  const [logo, setLogo] = useState(b.images.logo)
  const [hero, setHero] = useState(b.images.hero)
  const [works, setWorks] = useState<Work[]>(b.gallery)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [newCap, setNewCap] = useState('')
  const trash = useRef<string[]>([])
  const upload = async (
    file: File | undefined,
    kind: 'logo' | 'hero' | 'work',
    done: (url: string) => void,
  ) => {
    if (!file) return
    if (!tid.data) {
      setMsg('Данные заведения ещё загружаются. Повторите через секунду.')
      return
    }
    setBusy(kind)
    setMsg(null)
    setSaved(false)
    try {
      const isLogo = kind === 'logo'
      const blob = await prepareImage(
        file,
        isLogo ? 512 : 1600,
        isLogo ? 'image/png' : 'image/jpeg',
      )
      done(await uploadImage(tid.data, blob, isLogo ? 'png' : 'jpg'))
    } catch (e) {
      setMsg(`Не удалось загрузить фото: ${e instanceof Error ? e.message : 'ошибка'}`)
    } finally {
      setBusy(null)
    }
  }
  const save = useMutation({
    mutationFn: () => owner.updateConfig(b.slug, { images: { logo, hero }, gallery: works }),
    onSuccess: () => {
      setSaved(true)
      setMsg(null)
      const old = trash.current
      trash.current = []
      old.forEach((u) => void removeByUrl(u))
      void qc.invalidateQueries({ queryKey: ['business', b.slug] })
    },
    onError: (e) => {
      setSaved(false)
      setMsg(errText(e))
    },
  })
  const onFile = (fn: (f: File | undefined) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    fn(f)
  }
  return (
    <>
      <Err m={msg} />
      {saved && (
        <p className="muted" role="status">
          Сохранено. Фото на сайте обновились.
        </p>
      )}
      <div className="card col">
        <b>Логотип</b>
        <div className="row">
          <img className="thumb sq" src={assetUrl(b.slug, logo)} alt="" />
          <label className="btn ghost mini filebtn">
            {busy === 'logo' ? 'Загружаем…' : 'Заменить'}
            <input
              type="file"
              accept={ACCEPT}
              hidden
              disabled={!!busy}
              onChange={onFile(
                (f) =>
                  void upload(f, 'logo', (u) => {
                    trash.current.push(logo)
                    setLogo(u)
                  }),
              )}
            />
          </label>
        </div>
        <p className="muted small">
          Квадратное изображение, лучше PNG. Размер подгонится автоматически.
        </p>
      </div>
      <div className="card col">
        <b>Главное фото</b>
        <img className="thumb wide" src={assetUrl(b.slug, hero)} alt="" />
        <label className="btn ghost mini filebtn">
          {busy === 'hero' ? 'Загружаем…' : 'Заменить'}
          <input
            type="file"
            accept={ACCEPT}
            hidden
            disabled={!!busy}
            onChange={onFile(
              (f) =>
                void upload(f, 'hero', (u) => {
                  trash.current.push(hero)
                  setHero(u)
                }),
            )}
          />
        </label>
      </div>
      <h3>Галерея</h3>
      {works.length === 0 && <p className="muted">Пока нет ни одного фото.</p>}
      {works.map((w, i) => (
        <div className="card col" key={w.image + i}>
          <img className="thumb wide" src={assetUrl(b.slug, w.image)} alt="" />
          <input
            className="field"
            aria-label="Подпись под фото"
            maxLength={80}
            value={w.caption}
            onChange={(e) =>
              setWorks((p) => p.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))
            }
          />
          <div className="row wrap">
            <label className="btn ghost mini filebtn">
              {busy === 'work' ? 'Загружаем…' : 'Заменить фото'}
              <input
                type="file"
                accept={ACCEPT}
                hidden
                disabled={!!busy}
                onChange={onFile(
                  (f) =>
                    void upload(f, 'work', (u) => {
                      trash.current.push(w.image)
                      setWorks((p) => p.map((x, j) => (j === i ? { ...x, image: u } : x)))
                    }),
                )}
              />
            </label>
            <button
              className="btn ghost mini"
              onClick={() => {
                trash.current.push(w.image)
                setWorks((p) => p.filter((_, j) => j !== i))
              }}
            >
              Удалить
            </button>
          </div>
        </div>
      ))}
      {works.length < 12 && (
        <div className="card col">
          <b>Новое фото</b>
          <input
            className="field"
            placeholder="Подпись"
            maxLength={80}
            value={newCap}
            onChange={(e) => setNewCap(e.target.value)}
          />
          <label className="btn ghost mini filebtn">
            {busy === 'work' ? 'Загружаем…' : 'Выбрать фото и добавить'}
            <input
              type="file"
              accept={ACCEPT}
              hidden
              disabled={!!busy}
              onChange={onFile(
                (f) =>
                  void upload(f, 'work', (u) => {
                    setWorks((p) => [...p, { image: u, caption: newCap.trim() || 'Фото' }])
                    setNewCap('')
                  }),
              )}
            />
          </label>
        </div>
      )}
      <button className="btn" disabled={save.isPending || !!busy} onClick={() => save.mutate()}>
        {save.isPending ? 'Сохраняем…' : 'Сохранить'}
      </button>
      <p className="muted small">До нажатия «Сохранить» клиенты изменений не видят.</p>
    </>
  )
}

const LegalForm = z.object({
  name: z.string().trim().min(2).max(200),
  bin: z
    .string()
    .trim()
    .regex(/^\d{12}$/),
  address: z.string().trim().min(5).max(200),
  email: z.string().trim().email().max(200),
  retention: z.string().trim().min(3).max(200),
})
function Docs({ b }: { b: Business }) {
  const qc = useQueryClient()
  const l = b.legal ?? {}
  const [f, setF] = useState({
    name: l.name ?? '',
    bin: l.bin ?? '',
    address: l.address ?? b.address,
    email: l.email ?? '',
    retention: l.retention ?? 'до достижения целей обработки',
  })
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const m = useMutation({
    mutationFn: () => owner.updateLegal(b.slug, f),
    onSuccess: () => {
      setMsg(null)
      setOk(true)
      void qc.invalidateQueries({ queryKey: ['business', b.slug] })
    },
    onError: (e) => {
      setOk(false)
      setMsg(errText(e))
    },
  })
  const save = () => {
    if (!LegalForm.safeParse(f).success) {
      setOk(false)
      setMsg(
        'Проверьте поля: БИН/ИИН это 12 цифр, почта должна быть действительным адресом, остальные поля не должны быть пустыми.',
      )
      return
    }
    m.mutate()
  }
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value })
  return (
    <>
      <Err m={msg} />
      {ok && (
        <p className="muted" role="status">
          Сохранено. Документы на сайте обновлены.
        </p>
      )}
      <p className="muted small">
        Эти данные подставляются в политику конфиденциальности, согласие и условия использования.
        Они нужны по закону о персональных данных: без них на сайте видно предупреждение.
      </p>
      <label className="muted small" htmlFor="ln">
        Наименование (ТОО, ИП) или ФИО
      </label>
      <input id="ln" className="field" value={f.name} onChange={set('name')} />
      <label className="muted small" htmlFor="lb">
        БИН / ИИН (12 цифр)
      </label>
      <input
        id="lb"
        className="field"
        inputMode="numeric"
        maxLength={12}
        value={f.bin}
        onChange={set('bin')}
      />
      <label className="muted small" htmlFor="la">
        Юридический адрес
      </label>
      <input id="la" className="field" value={f.address} onChange={set('address')} />
      <label className="muted small" htmlFor="le">
        Почта для обращений по персональным данным
      </label>
      <input id="le" className="field" type="email" value={f.email} onChange={set('email')} />
      <label className="muted small" htmlFor="lr">
        Срок обработки данных
      </label>
      <input id="lr" className="field" value={f.retention} onChange={set('retention')} />
      <button className="btn" disabled={m.isPending} onClick={save}>
        {m.isPending ? 'Сохраняем…' : 'Сохранить'}
      </button>
      <div className="card col" style={{ marginTop: 16 }}>
        <b>Документы на сайте</b>
        {(
          [
            ['privacy', 'Политика конфиденциальности'],
            ['terms', 'Условия использования'],
            ['consent', 'Согласие на обработку данных'],
            ['storage', 'Локальное хранилище'],
          ] as const
        ).map(([k, t]) => (
          <a key={k} href={`/s/${b.slug}/legal/${k}`} target="_blank" rel="noreferrer">
            {t}
          </a>
        ))}
      </div>
      <p className="muted small">
        Место хранения данных и поставщиков инфраструктуры указывает платформа, эти поля здесь не
        меняются.
      </p>
    </>
  )
}

