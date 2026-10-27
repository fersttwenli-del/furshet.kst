import { z } from 'zod'
import { supabase } from './supabase'
const Card = z.object({ title: z.string(), text: z.string() })
export const Business = z.object({
  slug: z.string(),
  name: z.string(),
  short_name: z.string(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  timezone: z.string(),
  currency: z.string(),
  route_url: z.string().optional(),
  client_profile: z.boolean().optional(),
  cancel_hours: z.number().optional(),
  legal: z
    .object({
      name: z.string(),
      bin: z.string(),
      address: z.string(),
      email: z.string(),
      storage: z.string(),
      processors: z.string(),
      retention: z.string(),
    })
    .partial()
    .optional(),
  phone: z.string(),
  address: z.string(),
  description: z.string(),
  demo: z.boolean().optional(),
  images: z.object({ logo: z.string(), hero: z.string() }),
  gallery: z.array(z.object({ image: z.string(), caption: z.string() })).default([]),
  cards: z
    .object({ booking: Card, ai: Card, install: Card })
    .default({
      booking: { title: 'Соберите заказ', text: 'Выберите блюда, дату и формат: повар на выезд или доставка.' },
      ai: { title: 'Помощник по меню', text: 'Подберёт блюда под количество гостей и повод.' },
      install: { title: 'Приложение на телефоне', text: 'Добавьте на главный экран и заказывайте в пару касаний.' },
    }),
  resources: z.array(z.string()).default([]),
  hours: z.record(z.string(), z.tuple([z.string(), z.string()]).nullable()).default({}),
  categories: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        active: z.boolean().optional(),
        image: z.string().optional(),
        // id родительской категории: если указан, это подкатегория
        parent_id: z.string().nullable().optional(),
      }),
    )
    .optional(),
  services: z.array(
    z.object({
      // id нужен для стабильного ключа блюда; без него ключом служит name
      id: z.string().optional(),
      name: z.string(),
      price: z.number(),
      duration_minutes: z.number(),
      price_from: z.boolean().optional(),
      // id категории или подкатегории, в которой лежит блюдо
      category: z.string().optional(),
      category_id: z.string().optional(),
      description: z.string().optional(),
      image: z.string().optional(),
    }),
  ),
})
export type Business = z.infer<typeof Business>
// Runtime-источник — БД (владелец правит настройки в кабинете). Статический JSON — запасной вариант, если БД недоступна.
export async function loadBusiness(slug: string): Promise<Business> {
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('config')
      .eq('slug', slug)
      .maybeSingle()
    if (!error && data) return Business.parse(data.config)
  } catch (err) {
    console.error('Zod parse error:', err) // Поможет увидеть ошибку в консоли F12
  }
  const r = await fetch(`/tenants/${slug}.json`)
  if (!r.ok) throw new Error('Студия не найдена')
  return Business.parse(await r.json())
}
export type Ctx = { b: Business; openBooking: (service?: string) => void; openAI: () => void }
export const assetUrl = (slug: string, p: string) =>
  /^https?:/.test(p) ? p : `/tenants/${slug}/${p}`
