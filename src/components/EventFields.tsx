import type { CSSProperties, ReactNode } from 'react'
import { ChefIcon, PhoneIcon, PinIcon, TruckIcon, UserIcon, UsersIcon } from './OrderIcons'
import type { PendingOrder } from './OrderSummary'

export type ServiceMode = 'chef' | 'delivery'

export type EventForm = {
  name: string
  phone: string
  guests: string
  place: string
  mode: ServiceMode | ''
}

export const emptyEventForm: EventForm = { name: '', phone: '', guests: '', place: '', mode: '' }

export type EventErrors = Partial<Record<keyof EventForm, string>>

export function validateEvent(v: EventForm): EventErrors {
  const e: EventErrors = {}
  if (v.name.trim().length < 2) e.name = 'Укажите имя'
  if (!/^\+?[0-9\s()-]{10,18}$/.test(v.phone.trim())) e.phone = 'Проверьте номер телефона'
  if (!v.mode) e.mode = 'Выберите формат'
  // количество персон нужно только для повара на выезд
  if (v.mode === 'chef' && !(Number(v.guests) >= 1)) e.guests = 'Укажите число персон'
  if (v.place.trim().length < 3) {
    e.place = v.mode === 'delivery' ? 'Укажите адрес доставки' : 'Укажите место проведения'
  }
  return e
}

/**
 * В бэкенде нет полей под повара/персоны/место, поэтому всё собирается в одну строку
 * и уходит туда, где раньше лежал «Автомобиль» (поле car). MyBooking выводит её как есть.
 */
export function buildCarField(v: EventForm, order: PendingOrder | null): string {
  const parts = [
    v.mode === 'chef' ? 'Повар на выезд' : 'Доставка',
    v.mode === 'chef' && v.guests ? `${v.guests} персон` : '',
    v.place.trim().replace(/ · /g, ', '),
    // сумма идёт до состава, чтобы не потеряться при обрезке строки
    order ? `Итого: ${order.totalPrice}` : '',
    order?.summaryText ? `Заказ: ${order.summaryText}` : '',
  ]
  return parts.filter(Boolean).join(' · ').slice(0, 500)
}

export type ParsedCar = {
  mode: ServiceMode | null
  guests: number | null
  place: string
  total: number | null
  items: { name: string; qty: number }[]
}

/** Обратная операция для buildCarField: разбирает строку car на части. У старых записей mode будет null. */
export function parseCarField(car: string): ParsedCar {
  const out: ParsedCar = { mode: null, guests: null, place: '', total: null, items: [] }
  const rest: string[] = []
  for (const p of car.split(' · ').map((x) => x.trim()).filter(Boolean)) {
    if (p === 'Повар на выезд') out.mode = 'chef'
    else if (p === 'Доставка') out.mode = 'delivery'
    else if (/^\d+ персон$/.test(p)) out.guests = Number(p.split(' ')[0])
    else if (p.startsWith('Итого: ')) {
      const n = Number(p.slice(7))
      out.total = Number.isFinite(n) ? n : null
    } else if (p.startsWith('Заказ: ')) {
      for (const m of p.slice(7).matchAll(/(.+?) \((\d+) шт\.\)(?:, |$)/g)) {
        out.items.push({ name: m[1]!, qty: Number(m[2]) })
      }
    } else rest.push(p)
  }
  out.place = rest.join(', ')
  return out
}

const inputStyle = (hasError: boolean): CSSProperties => ({
  width: '100%',
  padding: '14px 16px 14px 44px',
  borderRadius: 14,
  background: 'var(--surface, #1e1e24)',
  border: `1px solid ${hasError ? '#e5484d' : 'var(--line)'}`,
  color: 'inherit',
  outline: 'none',
  fontSize: 16,
})

function Field({
  label,
  icon,
  error,
  children,
}: {
  label: string
  icon: ReactNode
  error?: string
  children: ReactNode
}) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span className="muted small" style={{ display: 'block', marginBottom: 6 }}>
        {label}
      </span>
      <span style={{ position: 'relative', display: 'block' }}>
        <span
          style={{
            position: 'absolute',
            left: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            opacity: 0.6,
            display: 'flex',
          }}
        >
          {icon}
        </span>
        {children}
      </span>
      {error && (
        <span role="alert" className="err small" style={{ display: 'block', marginTop: 4 }}>
          {error}
        </span>
      )}
    </label>
  )
}

export function EventFields({
  value,
  errors = {},
  onChange,
}: {
  value: EventForm
  errors?: EventErrors
  onChange: (next: EventForm) => void
}) {
  const set = <K extends keyof EventForm>(k: K, v: EventForm[K]) => onChange({ ...value, [k]: v })

  const modes: { id: ServiceMode; label: string; hint: string; icon: ReactNode }[] = [
    { id: 'chef', label: 'Повар на выезд', hint: 'Приготовим у вас', icon: <ChefIcon size={22} /> },
    { id: 'delivery', label: 'Доставка', hint: 'Привезём готовое', icon: <TruckIcon size={22} /> },
  ]

  return (
    <div>
      <span className="muted small" style={{ display: 'block', marginBottom: 6 }}>
        Формат
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 6 }}>
        {modes.map((m) => {
          const active = value.mode === m.id
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={active}
              onClick={() => set('mode', m.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 4,
                padding: '12px 14px',
                borderRadius: 14,
                textAlign: 'left',
                cursor: 'pointer',
                color: active ? 'var(--on-accent, #141518)' : 'inherit',
                background: active ? 'var(--accent, #ff8a1f)' : 'var(--surface, #1e1e24)',
                border: `1px solid ${active ? 'transparent' : errors.mode ? '#e5484d' : 'var(--line)'}`,
              }}
            >
              {m.icon}
              <b>{m.label}</b>
              <span style={{ fontSize: 12, opacity: 0.8 }}>{m.hint}</span>
            </button>
          )
        })}
      </div>
      {errors.mode && (
        <span role="alert" className="err small" style={{ display: 'block', marginBottom: 8 }}>
          {errors.mode}
        </span>
      )}

      <div style={{ height: 8 }} />

      <Field label="Имя" icon={<UserIcon size={18} />} error={errors.name}>
        <input
          style={inputStyle(!!errors.name)}
          autoComplete="name"
          value={value.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </Field>

      <Field label="Телефон" icon={<PhoneIcon size={18} />} error={errors.phone}>
        <input
          style={inputStyle(!!errors.phone)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+7"
          value={value.phone}
          onChange={(e) => set('phone', e.target.value)}
        />
      </Field>

      {value.mode === 'chef' && (
        <Field label="Количество персон" icon={<UsersIcon size={18} />} error={errors.guests}>
          <input
            style={inputStyle(!!errors.guests)}
            type="number"
            inputMode="numeric"
            min={1}
            value={value.guests}
            onChange={(e) => set('guests', e.target.value)}
          />
        </Field>
      )}

      <Field
        label={value.mode === 'delivery' ? 'Адрес доставки' : 'Место проведения'}
        icon={<PinIcon size={18} />}
        error={errors.place}
      >
        <input
          style={inputStyle(!!errors.place)}
          autoComplete="street-address"
          placeholder={value.mode === 'delivery' ? 'Улица, дом, квартира' : 'Адрес или название места'}
          value={value.place}
          onChange={(e) => set('place', e.target.value)}
        />
      </Field>
    </div>
  )
}
