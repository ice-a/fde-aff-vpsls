/**
 * 数据类型定义（服务端与前端共用）
 * 套餐数字规格统一用半年付单价折算（billing=monthly 时 = 月价；quarterly/semiannual/yearly 时 = 期价/期数），
 * 这样 $12/年 才能和 $5/月 在同一把尺子上比较。
 */

export type BillingCycle = 'monthly' | 'quarterly' | 'semiannual' | 'yearly'
export type OsFamily = 'linux' | 'windows'
export type Availability = 'up' | 'down' | 'unknown'
export type BillingTerm = '月付' | '季付' | '半年付' | '年付'

export interface Provider {
  slug: string
  name: string
  tagline: string
  regions: string[]
  /**
   * 每日可用性检测结果：up=官网可达 / down=连续失败 / unknown=尚未检测
   * 由 scripts/lib/check.ts 每天写入 data/state.json，构建时与种子目录合并
   */
  availability: Availability
  lastCheckedAt: string | null
  /** 连续失败次数，>=3 会被标记为 down 并在前端打「疑似下线」标 */
  failStreak: number
  note?: string
}

export interface Offer {
  id: string
  providerSlug: string
  title: string
  cpu: number
  ram: number // GB
  disk: number // GB
  diskType: 'NVMe' | 'SSD' | 'HDD'
  bandwidth: number // Mbps
  traffic: string // '不限量' | '4TB/月'
  regions: string[]
  /** 标价（展示用） */
  price: number
  /** 标价对应的计费周期 */
  cycle: BillingCycle
  /** 折算后的月单价（排序 / 筛选 / 展示的核心数字） */
  perMonth: number
  /** 年付总价（主显口径）：月付×12 / 季付×4 / 半年付×2 / 年付=标价 */
  perYear: number
  /** 该厂商配了 aff（返佣）链接 → 推荐序优先 */
  hasAff: boolean
  origPerMonth?: number // 划线原价
  os: OsFamily
  tags: string[]
  url: string // 厂商原始链接（aff 替换前）
  featured?: boolean
  /** official=从厂商官方页面抓取；seed=内置示意数据（该厂商官网有反爬/渲染限制） */
  source?: 'official' | 'seed'
}

export interface CheckRun {
  startedAt: string
  finishedAt: string
  total: number
  up: number
  down: number
  unknown: number
  durationMs: number
}

export interface HomeStats {
  offerCount: number
  providerCount: number
  regionCount: number
  updatedAt: string
  upCount: number
  downCount: number
}

export interface ProviderRow extends Provider {
  offerCount: number
  cheapestPerMonth: number | null
  cheapestPerYear: number | null
  hasAff: boolean
}

/* ---------- 静态数据文件（data/site/*.json）的结构 ---------- */

/** 首页聚合 */
export interface HomeResponse {
  generatedAt: string
  stats: HomeStats
  cheapest: Offer[]
  featured: Offer[]
  providers: Array<
    Pick<
      ProviderRow,
      | 'slug'
      | 'name'
      | 'tagline'
      | 'availability'
      | 'offerCount'
      | 'cheapestPerMonth'
      | 'cheapestPerYear'
      | 'hasAff'
      | 'regions'
    >
  >
  lastRun: CheckRun | null
  official: { updatedAt: string; slugs: string[]; counts: Record<string, number>; offerCount: number }
}

/** 套餐全量（筛选器在浏览器里实时筛） */
export interface OffersResponse {
  generatedAt: string
  total: number
  offers: Offer[]
}

/** 服务商目录 */
export interface ProvidersResponse {
  generatedAt: string
  providers: ProviderRow[]
  lastRun: CheckRun | null
}

/** 汇率 */
export interface RatesResponse {
  usdCny: number
  updatedAt: string
  source: string
  fallback: boolean
}

/** 站点状态（最近一轮检测） */
export interface StatusResponse {
  generatedAt: string
  lastRun: CheckRun | null
}
