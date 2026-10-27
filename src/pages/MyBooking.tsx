import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { formatInTimeZone } from 'date-fns-tz';
import { ru } from 'date-fns/locale';
import type { Ctx } from '../lib/tenant';
import { cancelBooking, getBooking } from '../lib/api';
import { money, telHref } from '../lib/format';
import { saveToken } from '../lib/tokens';
import { Bell, Calendar, Check, Copy, Phone } from '../lib/icons';
import { parseCarField, type ServiceMode } from '../components/EventFields';
import { BagIcon, ChefIcon, PinIcon, TruckIcon, UsersIcon } from '../components/OrderIcons';

const STATUS: Record<string, string> = { booked: 'Заказ подтверждён', done: 'Заказ выполнен', cancelled: 'Заказ отменён' };
// «arrived» зависит от формата: повар приехал или заказ уже в пути
function statusLabel(status: string, mode: ServiceMode | null): string {
  if (status === 'arrived') return mode === 'chef' ? 'Повар на месте' : mode === 'delivery' ? 'Заказ в пути' : 'Заказ в работе';
  return STATUS[status] ?? status;
}

// Токен берётся из приватной ссылки (#t=...) либо из хранилища этого устройства. Фрагмент не уходит на сервер.
function readToken(slug: string): string | null {
  const m = /[#&]t=([0-9a-f]{20,})/.exec(window.location.hash);
  if (m) {
    saveToken(slug, m[1]!);
    history.replaceState(null, '', window.location.pathname);
    return m[1]!;
  }
  try { return localStorage.getItem(`booking:${slug}`); } catch { return null; }
}

// Экранирование текста для .ics (RFC 5545)
const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/[;,]/g, '\\$&').replace(/\r?\n/g, '\\n');

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 };

export function MyBooking() {
  const { b, openBooking } = useOutletContext<Ctx>();
  const qc = useQueryClient(); const [sure, setSure] = useState(false); const [note, setNote] = useState<string | null>(null);
  const [token] = useState(() => readToken(b.slug));
  const q = useQuery({ queryKey: ['my', b.slug], queryFn: () => getBooking(token!), enabled: !!token });
  const cancel = useMutation({ mutationFn: () => cancelBooking(token!), onSuccess: () => { setSure(false); void qc.invalidateQueries({ queryKey: ['my', b.slug] }); } });
  if (!token || (q.isSuccess && !q.data)) return <section className="page"><h2>Мой заказ</h2><p className="muted">На этом устройстве заказов пока нет.</p><button className="btn" onClick={() => openBooking()}>Сделать заказ</button></section>;
  if (q.isPending) return <p className="page muted">Загрузка…</p>;
  if (q.isError) return <p className="page err">Не удалось загрузить заказ. <button className="link" onClick={() => q.refetch()}>Повторить</button></p>;

  const d = q.data!; const f = (s: string, p: string) => formatInTimeZone(new Date(s), b.timezone, p, { locale: ru });
  const info = parseCarField(d.car ?? '');
  const structured = info.mode !== null; // старые записи (с автомобилем) выводятся как раньше
  const total = d.price_cents / 100; // сумма заказа считается на сервере
  const hasEnd = new Date(d.ends_at).getTime() > new Date(d.starts_at).getTime();
  const cancelHours = b.cancel_hours ?? 24;
  const z = (s: string) => new Date(s).toISOString().replace(/[-:]|\.\d{3}/g, '');

  const download = (alarm: boolean) => {
    const title = structured ? (info.mode === 'chef' ? 'Повар на выезд' : 'Доставка') : d.service_name;
    const desc = info.items.length ? info.items.map((i) => `${i.name} × ${i.qty}`).join(', ') : d.service_name;
    const end = hasEnd ? d.ends_at : new Date(new Date(d.starts_at).getTime() + 3600e3).toISOString();
    const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//${b.slug}//ru\r\nBEGIN:VEVENT\r\nUID:${d.id}@${b.slug}\r\nDTSTAMP:${z(new Date().toISOString())}\r\nDTSTART:${z(d.starts_at)}\r\nDTEND:${z(end)}\r\nSUMMARY:${esc(`${b.name}: ${title}`)}\r\nDESCRIPTION:${esc(desc)}\r\nLOCATION:${esc(info.place || b.address)}\r\n${alarm ? 'BEGIN:VALARM\r\nTRIGGER:-P1D\r\nACTION:DISPLAY\r\nDESCRIPTION:Заказ завтра\r\nEND:VALARM\r\n' : ''}END:VEVENT\r\nEND:VCALENDAR\r\n`;
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'order.ics'; a.click(); URL.revokeObjectURL(url);
    setNote(alarm ? 'Скачан файл с напоминанием за сутки. Откройте его, чтобы добавить в календарь. Push-уведомления пока не подключены.' : 'Файл календаря скачан. Откройте его, чтобы добавить заказ.');
  };
  const copy = async () => {
    const link = `${window.location.origin}/s/${b.slug}/booking#t=${token}`;
    try { await navigator.clipboard.writeText(link); setNote('Приватная ссылка скопирована. Сохраните её для доступа с другого устройства.'); }
    catch { setNote(`Не удалось скопировать автоматически. Ссылка: ${link}`); }
  };

  return (<section className="page"><h2>Мой заказ</h2>
    <div className="card status"><span className="okc"><Check size={18} /></span><span className="muted small">{b.short_name}</span>
      <h3 style={{ margin: 0 }}>{statusLabel(d.status, info.mode)}</h3><b>{f(d.starts_at, "d MMMM 'в' HH:mm")}</b></div>

    {structured ? (<>
      <h2 style={{ fontSize: 22, marginTop: 20, ...row }}>
        {info.mode === 'chef' ? <ChefIcon size={24} /> : <TruckIcon size={24} />}
        {info.mode === 'chef' ? 'Повар на выезд' : 'Доставка'}
      </h2>
      {info.items.length > 0 && (
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ ...row, marginBottom: 6 }}><BagIcon size={18} /><b>Состав заказа</b></div>
          {info.items.map((i, n) => (
            <div key={`${i.name}-${n}`} className="kv"><span>{i.name}</span><b>× {i.qty}</b></div>
          ))}
        </div>)}
      <div className="kv"><span className="muted">Итого</span><b>{money(total, b.currency)}</b></div>
      {hasEnd && <div className="kv"><span className="muted">Завершение, ориентир</span><b>{f(d.ends_at, "d MMMM 'в' HH:mm")}</b></div>}
      {info.guests !== null && <p style={row}><UsersIcon size={18} /><b>{info.guests} персон</b></p>}
      {info.place && <p style={row}><PinIcon size={18} /><span><span className="muted small">{info.mode === 'delivery' ? 'Адрес доставки' : 'Место проведения'}</span><br /><b>{info.place}</b></span></p>}
    </>) : (<>
      <h2 style={{ fontSize: 22, marginTop: 20 }}>{d.service_name}</h2>
      <div className="kv"><span className="muted">Стоимость</span><b>{money(d.price_cents / 100, b.currency)}</b></div>
      {hasEnd && <div className="kv"><span className="muted">Завершение, ориентир</span><b>{f(d.ends_at, "d MMMM 'в' HH:mm")}</b></div>}
      {d.car && <p><b>{d.car}</b></p>}
    </>)}

    <a className="card contact" href={telHref(b.phone)}><span className="ico accent" style={{ width: 52, height: 52 }}><Phone /></span><span><b>Связаться с нами</b><br /><span className="muted small">{b.phone}</span></span></a>
    <div className="acts">
      <button className="act" onClick={() => void copy()}><span className="ico"><Copy size={16} /></span>Ссылка</button>
      <button className="act" disabled={d.status === 'cancelled'} onClick={() => download(false)}><span className="ico"><Calendar size={16} /></span>Календарь</button>
      <button className="act" disabled={d.status === 'cancelled'} onClick={() => download(true)}><span className="ico"><Bell size={16} /></span>Напомнить</button></div>
    {note && <p className="note" role="status">{note}</p>}
    {d.can_cancel && (sure ? <button className="btn danger" disabled={cancel.isPending} onClick={() => cancel.mutate()}>{cancel.isPending ? 'Отменяем…' : 'Да, отменить заказ'}</button>
      : <button className="btn ghost" onClick={() => setSure(true)}>Отменить заказ</button>)}
    {!d.can_cancel && d.status === 'booked' && <p className="muted small">Отмена доступна не позднее чем за {cancelHours} ч до начала. Позвоните нам: {b.phone}.</p>}
    {cancel.isError && <p className="err">Не удалось отменить. Повторите позже.</p>}</section>);
}
