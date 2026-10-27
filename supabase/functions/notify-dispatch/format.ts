export type Kind = 'booking_created' | 'booking_cancelled';
export type Item = { name: string; qty: number };
export type Data = {
  kind: Kind; studio: string; service: string; startsAt: string; timezone: string; customer: string; phone: string; car: string;
  priceCents: number; currency: string;
  // Структурированный заказ (колонки bookings из миграции 0011). У старых записей их нет: тогда используются service и car.
  mode?: 'chef' | 'delivery' | null; guests?: number | null; address?: string | null; allergies?: string | null; items?: Item[];
};
export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Длину ограничиваем до экранирования, чтобы сообщение не превысило лимит Telegram и разметка не обрывалась на середине «&amp;».
const clip = (s: string | null | undefined, n: number) => escapeHtml(String(s ?? '').slice(0, n));
const MAX_ITEMS = 10;

// bookings.order_items приходит из jsonb: берём только корректные элементы.
export function parseItems(raw: unknown): Item[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    const o = x as { name?: unknown; qty?: unknown };
    return typeof o?.name === 'string' && typeof o.qty === 'number' && Number.isFinite(o.qty) && o.qty > 0 ? [{ name: o.name, qty: o.qty }] : [];
  });
}

// Все значения из базы экранируются: имя клиента не должно ломать разметку сообщения.
export function buildMessage(d: Data): string {
  const when = new Intl.DateTimeFormat('ru-RU', { timeZone: d.timezone, weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(d.startsAt));
  const title = d.kind === 'booking_created' ? '🆕 Новый заказ' : '❌ Клиент отменил заказ';
  const price = `${(d.priceCents / 100).toLocaleString('ru-RU')} ${d.currency}`;
  const mode = d.mode === 'chef' ? 'Повар на выезд' : d.mode === 'delivery' ? 'Доставка' : '';
  const items = d.items?.length ? d.items : d.service ? [{ name: d.service, qty: 1 }] : [];
  const list = items.slice(0, MAX_ITEMS).map((i) => `• ${clip(i.name, 80)} × ${i.qty}`);
  if (items.length > MAX_ITEMS) list.push(`… и ещё ${items.length - MAX_ITEMS}`);

  const lines = [`<b>${title}</b> · ${clip(d.studio, 60)}`];
  if (mode) lines.push(`<b>${mode}</b>`);
  lines.push(`Когда: ${when}`);
  if (list.length) lines.push('Заказ:', ...list);
  lines.push(`Сумма: ${escapeHtml(price)}`);
  if (d.mode === 'chef' && d.guests) lines.push(`Персон: ${d.guests}`);
  if (d.address) lines.push(`${d.mode === 'delivery' ? 'Адрес доставки' : 'Место проведения'}: ${clip(d.address, 200)}`);
  lines.push(`Клиент: ${clip(d.customer, 80)}, ${clip(d.phone, 30)}`);
  if (d.allergies) lines.push(`Комментарий: ${clip(d.allergies, 300)}`);
  // Строка car дублирует состав заказа; показываем её только у старых записей без структурированных данных.
  if (!d.items?.length && d.car) lines.push(`Детали: ${clip(d.car, 300)}`);
  return lines.join('\n');
}
// Ошибки Telegram, после которых повторять бессмысленно: бот заблокирован или чата нет.
export const isDeadChat = (code: number | undefined, desc: string) => code === 403 || (code === 400 && /chat not found|user is deactivated/i.test(desc));
