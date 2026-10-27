import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { errText } from '../lib/api'
import { type Business } from '../lib/tenant'
import { Bell } from '../lib/icons'

const BOT = import.meta.env.VITE_TELEGRAM_BOT as string | undefined

function Notify({ b }: { b: Business }): JSX.Element {
  const qc = useQueryClient()
  const [code, setCode] = useState<string | null>(null)
  const [showCode, setShowCode] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<number>()

  // Получаем список подключённых чатов
  const links = useQuery({
    queryKey: ['owner', 'telegram-links', b.slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('owner_telegram_links', { p_slug: b.slug })
      if (error) throw error
      return (data ?? []) as Array<{ id: string; created_at: string }>
    },
    refetchInterval: code ? 3000 : false, // Обновляем список при ожидании подключения
  })

  // Генерируем код подключения
  const genCode = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('owner_telegram_code', { p_slug: b.slug })
      if (error) throw error
      return data as string
    },
    onSuccess: (newCode) => {
      setCode(newCode)
      setShowCode(true)
    },
    onError: (err) => {
      if ((err as any)?.message?.includes('rate_limited')) {
        alert('Слишком много кодов. Подождите или используйте старые коды.')
      }
    },
  })

  // Отключаем Telegram-чат
  const unlink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('owner_telegram_unlink', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['owner', 'telegram-links', b.slug] })
    },
  })

  const copyCode = () => {
    if (!code) return
    navigator.clipboard.writeText(code)
    setCopied(true)
    clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    return () => clearTimeout(copyTimer.current)
  }, [])

  if (!BOT) {
    return (
      <div className="card col" style={{ gap: 16 }}>
        <h3>Telegram-уведомления</h3>
        <p className="muted small">Функция отключена на этом сервере (VITE_TELEGRAM_BOT не установлена).</p>
      </div>
    )
  }

  return (
    <div className="card col" style={{ gap: 16 }}>
      <h3>Telegram-уведомления</h3>
      <p className="muted small">
        Получайте мгновенные уведомления о новых заказах, отмене и переносе прямо в Telegram.
      </p>

      {/* Статус генерирования кода */}
      {showCode && code && (
        <div className="card" style={{ background: 'rgba(76, 175, 80, 0.1)', border: '1px solid rgba(76, 175, 80, 0.3)' }}>
          <p style={{ margin: '0 0 12px 0', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#4caf50' }} />
            Код готов
          </p>
          <p className="muted small" style={{ margin: 0 }}>
            Откройте Telegram и напишите боту команду:
          </p>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <code
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'var(--surface, #1e1e24)',
                borderRadius: 6,
                fontSize: '13px',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                border: '1px solid var(--line)',
              }}
            >
              /start {code}
            </code>
            <button
              className="btn ghost mini"
              onClick={copyCode}
              title="Скопировать"
              style={{ whiteSpace: 'nowrap' }}
            >
              {copied ? '✓' : '📋'}
            </button>
          </div>
          <button
            className="link"
            style={{ marginTop: 12, fontSize: '14px' }}
            onClick={() => {
              if (BOT) window.open(`https://t.me/${BOT}`, '_blank')
            }}
          >
            Открыть бот в Telegram →
          </button>
          <p className="muted small" style={{ margin: '12px 0 0 0' }}>
            Код действителен 15 минут. После успешного подключения он будет отображаться в списке ниже.
          </p>
        </div>
      )}

      {/* Список подключённых чатов */}
      {links.isSuccess && links.data && links.data.length > 0 && (
        <div className="card" style={{ background: 'rgba(33, 150, 243, 0.05)', border: '1px solid rgba(33, 150, 243, 0.2)' }}>
          <p style={{ margin: '0 0 12px 0', fontWeight: 500 }}>
            Подключённые чаты ({links.data.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {links.data.map((link) => (
              <div
                key={link.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: 'var(--surface, #1e1e24)',
                  borderRadius: 6,
                  border: '1px solid var(--line)',
                }}
              >
                <div>
                  <p style={{ margin: 0, fontSize: '13px' }}>
                    <code style={{ color: '#90caf9' }}>
                      {new Date(link.created_at).toLocaleDateString('ru-RU')}
                    </code>
                  </p>
                  <p className="muted small" style={{ margin: '2px 0 0 0' }}>
                    Получает уведомления
                  </p>
                </div>
                <button
                  className="btn ghost mini"
                  disabled={unlink.isPending}
                  onClick={() => {
                    if (confirm('Отключить этот чат от уведомлений?')) {
                      unlink.mutate(link.id)
                    }
                  }}
                  title="Отключить"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Кнопка подключения */}
      {!showCode && (
        <button
          className="btn"
          disabled={genCode.isPending || links.isPending}
          onClick={() => genCode.mutate()}
        >
          {genCode.isPending
            ? 'Генерируем код…'
            : links.data?.length
              ? 'Подключить ещё один чат'
              : 'Подключить Telegram'}
        </button>
      )}

      {showCode && (
        <button
          className="btn ghost"
          onClick={() => {
            setShowCode(false)
            setCode(null)
          }}
        >
          Скрыть код
        </button>
      )}

      {/* Справка */}
      <details style={{ marginTop: 8 }}>
        <summary
          style={{
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '14px',
            color: 'var(--text, inherit)',
          }}
        >
          Как это работает?
        </summary>
        <div className="muted small" style={{ marginTop: 12, lineHeight: 1.6 }}>
          <p>
            <strong>1. Подключение:</strong> Нажмите кнопку «Подключить Telegram» и скопируйте код.
            Откройте бота (ссылка выше) и напишите команду в формате <code>/start КОД</code>.
          </p>
          <p>
            <strong>2. Уведомления:</strong> После подключения вы будете получать сообщения о:
          </p>
          <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
            <li>🆕 Новых заказах с полной информацией</li>
            <li>❌ Отмене заказов клиентом</li>
          </ul>
          <p>
            <strong>3. Отключение:</strong> Напишите боту <code>/stop</code> или удалите из списка выше.
          </p>
        </div>
      </details>

      {genCode.isError && (
        <p className="err" style={{ fontSize: '13px' }}>
          {errText(genCode.error)}
        </p>
      )}
      {unlink.isError && (
        <p className="err" style={{ fontSize: '13px' }}>
          Ошибка отключения: {errText(unlink.error)}
        </p>
      )}
    </div>
  )
}

export default Notify
