import { useState } from 'react'
import { money } from '../lib/format'
import { BagIcon, ChevronIcon } from './OrderIcons'

export type PendingOrder = {
  items: { name: string; qty: number; price: number }[]
  totalPrice: number
  summaryText: string
}

export function readPendingOrder(): PendingOrder | null {
  try {
    const raw = sessionStorage.getItem('pending_order_details')
    return raw ? (JSON.parse(raw) as PendingOrder) : null
  } catch {
    return null
  }
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

/**
 * Вместо «одного салата» на шагах 2–4 показывает весь заказ:
 * «Ваш заказ · 8 позиций · 22 800 ₸», по клику раскрывается список блюд.
 * Если заказа нет (запись на обычную услугу) — показывает одну услугу из fallback.
 */
export function OrderSummary({
  order,
  currency,
  fallback,
  defaultOpen = false,
}: {
  order: PendingOrder | null
  currency: string
  fallback?: { name: string; price: number }
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  if (!order || order.items.length === 0) {
    if (!fallback) return null
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0' }}>
        <b>{fallback.name}</b>
        <b style={{ whiteSpace: 'nowrap' }}>{money(fallback.price, currency)}</b>
      </div>
    )
  }

  const count = order.items.reduce((n, i) => n + i.qty, 0)

  return (
    <div style={{ padding: '12px 0' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'none',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          padding: 0,
          textAlign: 'left',
        }}
      >
        <BagIcon size={18} />
        <span style={{ flex: 1 }}>
          <b>Ваш заказ</b>
          <span className="muted small" style={{ marginLeft: 8 }}>
            {count} {plural(count, 'позиция', 'позиции', 'позиций')}
          </span>
        </span>
        <b style={{ whiteSpace: 'nowrap' }}>{money(order.totalPrice, currency)}</b>
        <ChevronIcon size={16} open={open} />
      </button>

      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          {order.items.map((i) => (
            <div
              key={i.name}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}
            >
              <span>
                {i.name} <span className="muted">× {i.qty}</span>
              </span>
              <span style={{ whiteSpace: 'nowrap' }}>{money(i.price, currency)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
