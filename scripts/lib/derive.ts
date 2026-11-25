import type { CheckRun, HomeResponse, HomeStats, Offer, Provider, ProviderRow } from '#shared/types'
import { hasAffProvider } from '#shared/aff'
import { buildOffers } from '#shared/data/offers'
import { SEED_PROVIDERS } from '#shared/data/providers'
import type { OfficialResult, ScrapedPlan } from './scrape.ts'
import type { PersistedState } from './state.ts'

/**
 * 纯计算层：种子目录 + 检测状态 + 官方抓取结果 → 前端要用的各种视图。
 * 没有 IO，刷新脚本与（可能的）其他工具都能直接复用。
 */

/** 年付总价：月付×12 / 季付×4 / 半年付×2 / 年付=标价 */
const YEAR_DIV: Record<string, number> = { monthly: 12, quarterly: 4, semiannual: 2, yearly: 1 }
export const perYearOf = (price: number, cycle: string) =>
  Math.round(price * (YEAR_DIV[cycle] ?? 12) * 100) / 100

/** 种子目录 + 检测状态合并后的厂商列表 */
export function mergeProviders(state: PersistedState): Provider[] {
  return SEED_PROVIDERS.map(p => ({ ...p, ...(state.providerStatus[p.slug] ?? {}) }))
}

function offerFromOfficial(slug: string, p: ScrapedPlan, index: number): Offer {
  return {
    id: `of_${slug}_${index.toString().padStart(3, '0')}`,
    providerSlug: slug,
    title: p.name,
    cpu: p.cpu ?? 1,
    ram: p.ram ?? 1,
    disk: p.disk ?? 20,
    diskType: p.diskType ?? 'SSD',
    bandwidth: p.bandwidth ?? 1000,
    traffic: p.traffic ?? '—',
    regions: p.regions.length ? p.regions : ['EU'],
    price: p.price,
    cycle: p.cycle,
    perMonth: Math.round((p.price / { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 }[p.cycle]) * 100) / 100,
    perYear: perYearOf(p.price, p.cycle),
    hasAff: hasAffProvider(slug, p.url),
    os: 'linux',
    tags: ['官方实时'],
    url: p.url,
    source: 'official'
  }
}

/** 套餐：官方抓取成功的厂商整组替换种子，其余回退种子（source 标记数据口径） */
export function mergeOffers(official: OfficialResult[]): Offer[] {
  const bySlug: Record<string, ScrapedPlan[]> = {}
  for (const r of official) bySlug[r.slug] = r.plans

  const seed = buildOffers().map(o => ({
    ...o,
    source: 'seed' as const,
    perYear: perYearOf(o.price, o.cycle),
    hasAff: hasAffProvider(o.providerSlug, o.url)
  }))
  const withOfficial = seed.filter(o => !(bySlug[o.providerSlug]?.length))

  const extra: Offer[] = []
  for (const [slug, plans] of Object.entries(bySlug)) {
    plans.forEach((p, i) => extra.push(offerFromOfficial(slug, p, i)))
  }
  return [...withOfficial, ...extra]
}

/** 厂商聚合行：套餐数 + 最低月付/年付 + 是否有 aff */
export function buildProviderRows(providers: Provider[], offers: Offer[]): ProviderRow[] {
  return providers.map(p => {
    const mine = offers.filter(o => o.providerSlug === p.slug)
    const months = mine.map(o => o.perMonth)
    const years = mine.map(o => o.perYear)
    return {
      ...p,
      offerCount: mine.length,
      cheapestPerMonth: months.length ? Math.min(...months) : null,
      cheapestPerYear: years.length ? Math.min(...years) : null,
      hasAff: mine.length ? mine.some(o => o.hasAff) : hasAffProvider(p.slug, p.url)
    }
  })
}

/** 官方源抓取概况（页面上标注数据口径用） */
export function buildOfficialMeta(official: OfficialResult[], updatedAt: string) {
  return {
    updatedAt,
    slugs: official.map(r => r.slug),
    counts: Object.fromEntries(official.map(r => [r.slug, r.plans.length]))
  }
}

/** 首页聚合视图（generatedAt 由写文件那一步补上） */
export type HomeView = Omit<HomeResponse, 'generatedAt'>

/** 首页聚合视图：统计 + 最便宜榜 + 推荐位 + 厂商摘要 */
export function buildHome(
  offers: Offer[],
  rows: ProviderRow[],
  lastRun: CheckRun | null,
  official: HomeResponse['official']
): HomeView {
  const stats: HomeStats = {
    offerCount: offers.length,
    providerCount: rows.length,
    regionCount: new Set(offers.flatMap(o => o.regions)).size,
    updatedAt: lastRun?.finishedAt ?? new Date().toISOString(),
    upCount: rows.filter(r => r.availability === 'up').length,
    downCount: rows.filter(r => r.availability === 'down').length
  }

  const officialCount = offers.filter(o => o.source === 'official').length

  const recommendCmp = (a: Offer, b: Offer) =>
    Number(b.hasAff) - Number(a.hasAff) ||
    Number(b.cycle === 'yearly') - Number(a.cycle === 'yearly') ||
    a.perYear - b.perYear
  const cheapest: Offer[] = [...offers]
    .filter(o => o.cycle === 'yearly')
    .sort(recommendCmp)
    .slice(0, 8)
  const featured: Offer[] = offers.filter(o => o.featured).sort(recommendCmp)

  // 厂商摘要只给首页卡片需要的字段，避免首屏 payload 过大；有 aff 的排前
  const providers: HomeView['providers'] = rows
    .slice()
    .sort((a, b) => Number(b.hasAff) - Number(a.hasAff) || b.offerCount - a.offerCount)
    .map(r => ({
      slug: r.slug,
      name: r.name,
      tagline: r.tagline,
      availability: r.availability,
      offerCount: r.offerCount,
      cheapestPerMonth: r.cheapestPerMonth,
      cheapestPerYear: r.cheapestPerYear,
      hasAff: r.hasAff,
      regions: r.regions
    }))

  return { stats, cheapest, featured, providers, lastRun, official: { ...official, offerCount: officialCount } }
}
