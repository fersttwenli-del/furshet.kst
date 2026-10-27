import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessage, escapeHtml, isDeadChat, parseItems, type Data } from './format.ts';
const d: Data = { kind: 'booking_created', studio: 'Furshet', service: 'Салат Цезарь', startsAt: '2026-10-27T06:00:00Z', timezone: 'Asia/Almaty', customer: 'Айдар', phone: '+7 700 000 00 00', car: '', priceCents: 1460000, currency: '₸' };
const chef: Data = { ...d, mode: 'chef', guests: 6, address: 'Достык 5, кв. 12', items: [{ name: 'Салат Цезарь', qty: 2 }, { name: 'Стейк', qty: 1 }] };
test('время показывается в часовом поясе заведения', () => { assert.match(buildMessage(d), /27 октября.*11:00/); });
test('сумма и валюта', () => { assert.match(buildMessage(d), /14\s600 ₸/); });
test('имя клиента и адрес экранируются', () => {
  const m = buildMessage({ ...chef, customer: '<b>x</b> & <a href="e">', address: '<script>' });
  assert.ok(!m.includes('<script>') && !m.includes('<a href')); assert.match(m, /&lt;b&gt;x&lt;\/b&gt; &amp;/);
});
test('отмена клиентом имеет свой заголовок', () => { assert.match(buildMessage({ ...chef, kind: 'booking_cancelled' }), /Клиент отменил заказ/); });
test('повар на выезд: формат, персоны, место и состав', () => {
  const m = buildMessage(chef);
  assert.match(m, /Новый заказ/); assert.match(m, /Повар на выезд/); assert.match(m, /Персон: 6/);
  assert.match(m, /Место проведения: Достык 5/); assert.match(m, /• Салат Цезарь × 2/); assert.match(m, /• Стейк × 1/); assert.ok(!m.includes('Авто'));
});
test('доставка: адрес доставки и без персон', () => {
  const m = buildMessage({ ...chef, mode: 'delivery' });
  assert.match(m, /Доставка/); assert.match(m, /Адрес доставки:/); assert.ok(!m.includes('Персон'));
});
test('длинный заказ сокращается', () => {
  const items = Array.from({ length: 14 }, (_, i) => ({ name: `Блюдо ${i}`, qty: 1 }));
  const m = buildMessage({ ...chef, items });
  assert.match(m, /… и ещё 4/); assert.ok(!m.includes('Блюдо 13'));
});
test('очень длинные поля обрезаются, сообщение остаётся в лимите Telegram', () => {
  const m = buildMessage({ ...chef, address: 'а'.repeat(5000), allergies: 'б'.repeat(5000), customer: 'в'.repeat(5000) });
  assert.ok(m.length < 4000);
});
test('старая запись без структуры: услуга и детали', () => {
  const m = buildMessage({ ...d, car: 'Повар на выезд · 6 персон · Достык 5' });
  assert.match(m, /• Салат Цезарь × 1/); assert.match(m, /Детали: Повар на выезд/);
});
test('parseItems отбрасывает мусор', () => {
  assert.deepEqual(parseItems([{ name: 'Стейк', qty: 2 }, { name: 5 }, null, { name: 'Х', qty: 0 }]), [{ name: 'Стейк', qty: 2 }]);
  assert.deepEqual(parseItems(null), []);
});
test('escapeHtml', () => { assert.equal(escapeHtml('a<b>&'), 'a&lt;b&gt;&amp;'); });
test('мёртвые чаты', () => { assert.ok(isDeadChat(403, '')); assert.ok(isDeadChat(400, 'Bad Request: chat not found')); assert.ok(!isDeadChat(429, 'Too Many Requests')); assert.ok(!isDeadChat(500, '')); });
