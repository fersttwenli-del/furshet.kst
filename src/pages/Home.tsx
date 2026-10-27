import { Link, useOutletContext } from 'react-router-dom'
import { assetUrl, type Ctx } from '../lib/tenant'
import { money, plural, telHref } from '../lib/format'
import {
  Arrow,
  ArrowRight,
  Clock,
  Download,
  Phone,
  Pin,
  Sparkle,
  Tag,
  Grid,
} from '../lib/icons'
import { Reveal } from '../components/Reveal'
import { BagIcon, ChefIcon } from '../components/OrderIcons'
import { ServiceList } from './ServiceList'
import { useServices } from '../lib/useServices'
import { AI_ENABLED } from '../lib/features'
import '../lib/install' // ловит событие установки с самого запуска

export function Home() {
  const { b, openBooking, openAI } = useOutletContext<Ctx>()
  const services = useServices(b)
  const img = (p: string) => `url(${assetUrl(b.slug, p)})`
  const ranges = [
    ...new Set(
      Object.values(b.hours)
        .filter(Boolean)
        .map((h) => `${h![0]}–${h![1]}`),
    ),
  ]

  const routeHref =
    b.route_url && /^https:\/\//.test(b.route_url)
      ? b.route_url
      : `https://2gis.kz/search/${encodeURIComponent(b.address)}`
  const minPrice = services.length ? Math.min(...services.map((x) => x.price)) : 0

  return (
    <div className="page">
      <div className="hero" style={{ backgroundImage: img(b.images.hero) }}>
        <Link className="glass-btn" to={`/s/${b.slug}/services`}>
          <b>Заказать меню</b>
          <Arrow />
        </Link>
      </div>

      <div className="namerow">
        <div>
          <h1>{b.name}</h1>
          <p className="muted">{b.description}</p>
        </div>
        <Link className="round" aria-label="Заказать" to={`/s/${b.slug}/services`}>
          <Arrow />
        </Link>
      </div>

      {/* Верхняя статистика */}
      <div className="tiles3">
        <div className="card tile">
          <div className="row">
            <Grid />
            <b className="big">{services.length}</b>
          </div>
          <span className="muted small">
            {plural(services.length, ['блюдо', 'блюда', 'блюд']).split(' ')[1]} в меню
          </span>
        </div>
        <div className="card tile">
          <div className="row">
            {b.min_order > 0 ? <BagIcon size={20} /> : <ChefIcon size={20} />}
            <b className="big">{b.min_order > 0 ? money(b.min_order, b.currency) : '2 формата'}</b>
          </div>
          <span className="muted small">
            {b.min_order > 0 ? 'минимальный заказ' : 'выезд повара и доставка'}
          </span>
        </div>
        <div className="card tile">
          <div className="row">
            <Tag />
            <b className="big">от {money(minPrice, b.currency)}</b>
          </div>
          <span className="muted small">цена позиции</span>
        </div>
      </div>

      <div className="cols">
        <Reveal className="col-side">
          <h2>Оформление заказа</h2>

          {/* Карточка заказа */}
          <div className="card promo">
            <span style={{ display: 'inline-flex', marginBottom: 10, color: 'var(--accent)' }}>
              <Grid />
            </span>
            <h3>{b.cards.booking.title}</h3>
            <p className="muted">{b.cards.booking.text}</p>
            <Link className="btn" to={`/s/${b.slug}/services`}>
              Собрать заказ <Arrow />
            </Link>
          </div>

          {/* AI Помощник */}
          <div className="card col">
            <div className="row">
              <span className="ico accent">
                <Sparkle />
              </span>
              <div>
                <b>{b.cards.ai.title}</b>
                <p className="muted small">{b.cards.ai.text}</p>
              </div>
            </div>
            <button className="btn ghost" disabled={!AI_ENABLED} onClick={openAI}>
              {AI_ENABLED ? (
                <>
                  Подобрать меню <Arrow size={16} />
                </>
              ) : (
                'Скоро будет доступно'
              )}
            </button>
          </div>

          {/* Адрес и контакты */}
          <div className="card col">
            <div className="row">
              <Pin />
              <b>{b.address}</b>
            </div>
            <div className="row">
              <Clock />
              <div>
                {ranges.length === 1 ? <b>{ranges[0]}</b> : <b>по графику</b>}
                <p className="muted small">часы приема заказов</p>
              </div>
            </div>
            <div className="row">
              <a className="btn ghost inline" href={routeHref} target="_blank" rel="noreferrer">
                Локация <Arrow size={16} />
              </a>
              <a className="icon-btn big-btn" href={telHref(b.phone)} aria-label="Позвонить">
                <Phone />
              </a>
            </div>
          </div>
        </Reveal>

        {/* Основной блок с меню и галереей */}
        <Reveal className="col-main">
          <div className="row between">
            <h2>Меню</h2>
            <Link className="muted" to={`/s/${b.slug}/services`}>
              Все меню <ArrowRight size={16} />
            </Link>
          </div>
          <ServiceList limit={4} />

          {b.gallery.length > 0 && (
            <>
              <h2 style={{ marginTop: 24 }}>Фото блюд и подача</h2>
              <div className="gallery">
                {b.gallery.map((g) => (
                  <figure key={g.image}>
                    <div className="shot" style={{ backgroundImage: img(g.image) }} />
                    <figcaption>{g.caption}</figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
        </Reveal>
      </div>

      {/* Блок установки PWA */}
      <Reveal className="install-block">
        <div className="card install">
          <div className="row">
            <img src={assetUrl(b.slug, b.images.logo)} alt="" width={48} height={48} />
            <div>
              <b>{b.short_name}</b>
              <p className="muted small">Мобильное приложение</p>
            </div>
          </div>
          <h2 className="xl">{b.cards.install.title}</h2>
          <p className="muted">{b.cards.install.text}</p>
          <Link className="btn" to={`/s/${b.slug}/install`}>
            <Download /> Установить на телефон <ArrowRight />
          </Link>
          <p className="muted small">Бесплатно и быстро через браузер.</p>
        </div>
      </Reveal>

      <footer className="row between muted" style={{ padding: '16px 0' }}>
        <span>
          {b.short_name} · <Link to={`/s/${b.slug}/owner`}>Кабинет повара</Link>
        </span>
        <a href={telHref(b.phone)}>
          Связаться <Arrow size={14} />
        </a>
      </footer>
    </div>
  )
}
