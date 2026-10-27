import type { ReactElement, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 18, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

const Utensils = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
    <path d="M7 2v20" />
    <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
  </Svg>
)
const Leaf = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
  </Svg>
)
const Bowl = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 11h16a8 8 0 0 1-16 0Z" />
    <path d="M9 7c0-1 1-1 1-2M14 7c0-1 1-1 1-2" />
  </Svg>
)
const Flame = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </Svg>
)
const Soup = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z" />
    <path d="M7 21h10" />
    <path d="M6.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.74 1.62" />
    <path d="M11.25 3c.27.1.8.53.74 1.36-.05.83-.93 1.2-.98 2.02-.06.78.33 1.24.72 1.62" />
    <path d="M16.25 3c.27.1.8.53.75 1.36-.06.83-.93 1.2-1 2.02-.05.78.34 1.24.73 1.62" />
  </Svg>
)
const Fish = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z" />
    <path d="M18 12v.5" />
    <path d="M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33" />
  </Svg>
)
const Cake = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" />
    <path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1" />
    <path d="M2 21h20" />
    <path d="M7 8v3M12 8v3M17 8v3" />
    <path d="M7 4h.01M12 4h.01M17 4h.01" />
  </Svg>
)
const Cup = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 8 1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8" />
    <path d="M5 8h14" />
    <path d="M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0" />
    <path d="m12 8 1-6h2" />
  </Svg>
)

// Подбор иконки по названию категории. Если ничего не подошло — вилка и нож.
const RULES: [RegExp, (p: IconProps) => ReactElement][] = [
  [/салат|овощ|вегет|зелен/i, Leaf],
  [/закуск|холодн|тапас|сет/i, Bowl],
  [/горяч|мясо|гриль|стейк|шашлык|второ|бургер|пицц/i, Flame],
  [/суп|бульон|борщ/i, Soup],
  [/рыб|морепрод|суши|ролл/i, Fish],
  [/десерт|сладк|выпечк|торт|морожен/i, Cake],
  [/напит|сок|чай|кофе|коктейл|лимонад/i, Cup],
]

export function CategoryIcon({ name, size = 18 }: { name: string; size?: number }) {
  const hit = RULES.find(([re]) => re.test(name))
  const Icon = hit ? hit[1] : Utensils
  return <Icon size={size} />
}

// Убирает эмодзи из названия, которые владелец мог вписать в категорию: вместо них рисуется иконка
export function cleanCategoryName(name: string): string {
  const s = name.replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D]/gu, '').trim()
  return s || name
}
