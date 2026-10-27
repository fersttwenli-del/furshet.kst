import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { addMinutes } from 'date-fns'
import { ru } from 'date-fns/locale'
import { formatInTimeZone } from 'date-fns-tz'
import type { Business } from '../lib/tenant'
import { createBooking, fetchServices, fetchSlots } from '../lib/api'
import { duration, money, randomToken } from '../lib/format'
import { ArrowLeft, ArrowRight } from '../lib/icons'
import { Sheet } from './Sheet'
import { LEGAL_VERSION } from '../lib/legal'
import { supabase } from '../lib/supabase'
import { saveToken } from '../lib/tokens'
import { OrderSummary, readPendingOrder } from './OrderSummary'
import {
  EventFields,
  buildCarField,
  emptyEventForm,
  validateEvent,
  type EventErrors,
  type EventForm,
} from './EventFields'
import { ChefIcon, PinIcon, TruckIcon, UsersIcon } from './OrderIcons'

const TITLES = ['Услуга', 'Дата и время', 'Ваши данные', 'Подтверждение']
const ERR: Record<string, string> = {
  slot_taken: 'Это время только что заняли. Выберите другое.',
  invalid_slot: 'Это время недоступно для записи.',
  past_start: 'Это время уже прошло.',
  consent_required: 'Нужно согласие на обработку данных.',
  invalid_items: 'Некоторые блюда больше недоступны. Вернитесь в меню и обновите заказ.',
  min_order: 'Сумма заказа меньше минимальной. Добавьте блюда в меню.',
}
const SLOT_ERRORS = ['slot_taken', 'invalid_slot', 'past_start']

export function BookingFlow({
  b,
  initialService,
  onClose,
}: {
  b: Business
  initialService?: string
  onClose: () => void
}) {
  const svcQ = useQuery({ queryKey: ['services', b.slug], queryFn: () => fetchServices(b.slug) })
  const [step, setStep] = useState(1)
  const [serviceId, setServiceId] = useState<string | null>(null)
  const today = formatInTimeZone(new Date(), b.timezone, 'yyyy-MM-dd')
  const [day, setDay] = useState(today)
  const [slot, setSlot] = useState<string | null>(null)
  const [form, setForm] = useState<EventForm>(emptyEventForm)
  const [errs, setErrs] = useState<EventErrors>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [agree, setAgree] = useState(false)
  const key = useRef(crypto.randomUUID())
  const token = useRef(randomToken())
  const preset = useRef(false)

  // Корзина из меню. Берём её только если запись открыта именно из неё
  // (первое блюдо совпадает с initialService), иначе это устаревшие данные.
  const order = useMemo(() => {
    const o = readPendingOrder()
    return o && initialService && o.items[0]?.name === initialService ? o : null
  }, [initialService])

  useEffect(() => {
    if (preset.current || !initialService || !svcQ.data) return
    const s = svcQ.data.find((x) => x.id === initialService || x.name === initialService)
    if (s) {
      preset.current = true
      setServiceId(s.id)
      setStep(2)
    }
  }, [svcQ.data, initialService])
  const svc = svcQ.data?.find((s) => s.id === serviceId)
  const fallback = svc ? { name: svc.name, price: svc.price_cents / 100 } : undefined
  const orderTotal = order ? order.totalPrice : svc ? svc.price_cents / 100 : 0
  const belowMin = b.min_order > 0 && !!(order || svc) && orderTotal < b.min_order
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(new Date(`${today}T12:00:00Z`).getTime() + i * 864e5)
        return {
          iso: d.toISOString().slice(0, 10),
          wd: d.toLocaleDateString('ru-RU', { weekday: 'short', timeZone: 'UTC' }),
          n: d.getUTCDate(),
        }
      }),
    [today],
  )
  const slotsQ = useQuery({
    queryKey: ['slots', b.slug, serviceId, day],
    queryFn: () => fetchSlots(b.slug, serviceId!, day),
    enabled: !!serviceId && step === 2,
  })
  const fmt = (iso: string, f: string) =>
    formatInTimeZone(new Date(iso), b.timezone, f, { locale: ru })
  const mut = useMutation({
    mutationFn: () =>
      createBooking({
        slug: b.slug,
        service: serviceId!,
        start: slot!,
        name: form.name.trim(),
        phone: form.phone.trim(),
        // под «car» уходит всё: формат, персоны, место и состав заказа
        car: buildCarField(form, order),
        key: key.current,
        token: token.current,
        consent: LEGAL_VERSION,
        serviceType: (form.mode === 'chef' ? 'chef_onsite' : form.mode) as
          | 'chef_onsite'
          | 'delivery',
        address: form.place.trim(),
        guests: form.mode === 'chef' ? Number(form.guests) : null,
        // сервер сам берёт цены из базы: от клиента нужны только id блюд и количество
        items:
          order && order.items.every((i) => i.id)
            ? order.items.map((i) => ({ id: i.id!, qty: i.qty }))
            : null,
      }),
    onSuccess: () => {
      saveToken(b.slug, token.current) // если клиент уже вошёл, запись сразу привязывается к профилю
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) void supabase.rpc('claim_booking', { p_token: token.current })
      })
      try {
        sessionStorage.removeItem('pending_order_details')
        localStorage.removeItem(`cart:${b.slug}`)
      } catch {
        /* ignore */
      }
      setStep(5)
    },
    onError: (e: Error) => {
      const code = Object.keys(ERR).find((c) => e.message.includes(c))
      setMsg(code ? ERR[code]! : 'Не удалось записаться. Проверьте соединение и повторите.')
      if (code && SLOT_ERRORS.includes(code)) {
        setSlot(null)
        setStep(2)
        void slotsQ.refetch()
      }
    },
  })
  const next = () => {
    setMsg(null)
    if (step === 3) {
      const e = validateEvent(form)
      if (Object.keys(e).length > 0) {
        setErrs(e)
        return
      }
      setErrs({})
    }
    setStep(step + 1)
  }
  const canNext =
    !belowMin && (step === 1 ? !!serviceId : step === 2 ? !!slot : step === 3 ? agree : true)

  const modeLine = (
    <span className="muted row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {form.mode === 'chef' ? <ChefIcon size={16} /> : <TruckIcon size={16} />}
      {form.mode === 'chef' ? 'Повар на выезд' : 'Доставка'}
      {form.mode === 'chef' && form.guests && (
        <>
          <UsersIcon size={16} />
          {form.guests} персон
        </>
      )}
    </span>
  )

  if (step === 5 && slot)
    return (
      <Sheet title="Запись подтверждена" onClose={onClose}>
        <div className="card col">
          <OrderSummary order={order} currency={b.currency} defaultOpen fallback={fallback} />
          <span>{fmt(slot, "d MMMM 'в' HH:mm")}</span>
          {modeLine}
          <span className="muted row" style={{ gap: 8, alignItems: 'center' }}>
            <PinIcon size={16} />
            {form.place}
          </span>
        </div>
        <p className="muted small">Детали и отмена — в разделе «Моя запись» на этом устройстве.</p>
        <Link className="btn" to={`/s/${b.slug}/booking`} onClick={onClose}>
          Моя запись <ArrowRight />
        </Link>
      </Sheet>
    )

  return (
    <Sheet title={TITLES[step - 1]!} sub={`Шаг ${step} из 4`} onClose={onClose}>
      <div className="bars">
        {[1, 2, 3, 4].map((i) => (
          <i key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      {msg && (
        <p role="alert" className="err">
          {msg}
        </p>
      )}
      {belowMin && (
        <p role="alert" className="err">
          Минимальная сумма заказа — {money(b.min_order, b.currency)}, сейчас{' '}
          {money(orderTotal, b.currency)}.{' '}
          <Link className="link" to={`/s/${b.slug}/services`} onClick={onClose}>
            Вернуться в меню
          </Link>
        </p>
      )}
      {step > 1 && step < 4 && (svc || order) && (
        <OrderSummary order={order} currency={b.currency} fallback={fallback} />
      )}

      {step === 1 &&
        (svcQ.isPending ? (
          <p className="muted">Загрузка услуг…</p>
        ) : svcQ.isError ? (
          <p className="err">
            Не удалось загрузить услуги.{' '}
            <button className="link" onClick={() => svcQ.refetch()}>
              Повторить
            </button>
          </p>
        ) : svcQ.data.length === 0 ? (
          <p className="muted">Услуг пока нет.</p>
        ) : (
          svcQ.data.map((s) => (
            <button
              key={s.id}
              className={`card pick ${s.id === serviceId ? 'sel' : ''}`}
              onClick={() => setServiceId(s.id)}
            >
              <span>
                <b>{s.name}</b>
                <br />
                <span className="muted small">{duration(s.duration_minutes)}</span>
              </span>
              <b>{money(s.price_cents / 100, b.currency)}</b>
            </button>
          ))
        ))}

      {step === 2 && (
        <>
          <div className="days">
            {days.map((d) => (
              <button
                key={d.iso}
                className={`day ${d.iso === day ? 'sel' : ''}`}
                onClick={() => {
                  setDay(d.iso)
                  setSlot(null)
                }}
              >
                <span>{d.wd}</span>
                <b>{d.n}</b>
              </button>
            ))}
          </div>
          <label className="muted small" htmlFor="other-date">
            Другая дата
          </label>
          <input
            id="other-date"
            className="field"
            type="date"
            min={today}
            value={day}
            onChange={(e) => {
              if (e.target.value >= today) {
                setDay(e.target.value)
                setSlot(null)
              }
            }}
          />
          {slotsQ.isPending ? (
            <p className="muted">Загрузка времени…</p>
          ) : slotsQ.isError ? (
            <p className="err">
              Не удалось получить время.{' '}
              <button className="link" onClick={() => slotsQ.refetch()}>
                Повторить
              </button>
            </p>
          ) : slotsQ.data.length === 0 ? (
            <p className="muted">В этот день мы не принимаем заказы. Выберите другую дату.</p>
          ) : (
            <div className="chips">
              {slotsQ.data.map((s) => (
                <button
                  key={s.slot}
                  disabled={!s.free}
                  aria-pressed={slot === s.slot}
                  className={`chip ${slot === s.slot ? 'sel' : ''}`}
                  onClick={() => setSlot(s.slot)}
                >
                  {fmt(s.slot, 'HH:mm')}
                </button>
              ))}
            </div>
          )}
          <p className="muted small">Серые окна уже заняты. Выберите любое свободное время.</p>
          {slot && svc && svc.duration_minutes > 0 && (
            <p className="muted small">
              Ориентир окончания:{' '}
              {formatInTimeZone(
                addMinutes(new Date(slot), svc.duration_minutes),
                b.timezone,
                "d MMMM 'в' HH:mm",
                { locale: ru },
              )}
            </p>
          )}
        </>
      )}

      {step === 3 && <EventFields value={form} errors={errs} onChange={setForm} />}

      {step === 3 && (
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span className="small">
            Я принимаю{' '}
            <a href={`/s/${b.slug}/legal/terms`} target="_blank" rel="noreferrer">
              Условия использования
            </a>{' '}
            и даю{' '}
            <a href={`/s/${b.slug}/legal/consent`} target="_blank" rel="noreferrer">
              согласие на обработку персональных данных
            </a>
            . С{' '}
            <a href={`/s/${b.slug}/legal/privacy`} target="_blank" rel="noreferrer">
              Политикой конфиденциальности
            </a>{' '}
            ознакомлен(а).
          </span>
        </label>
      )}

      {step === 4 && slot && (
        <div className="card col">
          <OrderSummary order={order} currency={b.currency} defaultOpen fallback={fallback} />
          <span>{fmt(slot, "d MMMM 'в' HH:mm")}</span>
          {modeLine}
          <span className="muted row" style={{ gap: 8, alignItems: 'center' }}>
            <PinIcon size={16} />
            {form.place}
          </span>
          <span className="muted">
            {form.name}, {form.phone}
          </span>
        </div>
      )}

      <button
        className="btn"
        disabled={!canNext || mut.isPending}
        onClick={() => (step === 4 ? mut.mutate() : next())}
      >
        {step === 4 ? (mut.isPending ? 'Отправляем…' : 'Подтвердить заказ') : 'Продолжить'}{' '}
        <ArrowRight />
      </button>
      {step > 1 && (
        <button className="back" onClick={() => setStep(step - 1)}>
          <ArrowLeft /> Назад
        </button>
      )}
    </Sheet>
  )
}
