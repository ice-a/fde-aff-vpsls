import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadState, pruneState, saveState } from './lib/state.ts'
import { runCheck } from './lib/check.ts'
import { refetchOfficial } from './lib/scrape.ts'
import { fetchRates, type RatesState } from './lib/rates.ts'
import {
  buildHome,
  buildOfficialMeta,
  buildProviderRows,
  mergeOffers,
  mergeProviders
} from './lib/derive.ts'

/**
 * 每日数据管道（GitHub Actions 每天 04:00 跑一次）：
 *   1. 可用性检测（官网连通性，连续 3 轮失败标 DOWN）
 *   2. 官方套餐抓取（6 家厂商官网实时价，解析失败回退种子价）
 *   3. 汇率拉取（USD → CNY，双源互备）
 *   4. 派生视图 → 写入 data/site/*.json（构建时由前端直接 import，运行时零请求）
 *
 * 用法：node scripts/refresh-data.ts
 * 产物：data/site/{status,rates,providers,offers,home}.json + data/state.json
 */

const DATA_DIR = join(process.cwd(), 'data', 'site')

function writeJson(name: string, value: unknown): void {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(join(DATA_DIR, name), JSON.stringify(value, null, 2) + '\n', 'utf-8')
}

function readJson<T>(name: string): T | null {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, name), 'utf-8')) as T
  } catch {
    return null
  }
}

const log = (msg: string) => console.log(`[refresh] ${msg}`)

async function main() {
  const startedAt = Date.now()
  const state = loadState()
  const providers = mergeProviders(state)

  // 1. 可用性检测
  const check = await runCheck(providers, state)
  if (check.networkFailure) {
    log('⚠ 全部厂商探测失败（网络/环境问题），保留上一轮状态不变')
  } else {
    state.providerStatus = check.providerStatus
    state.lastRun = check.run
    log(`检测完成：up=${check.run.up} down=${check.run.down} total=${check.run.total} (${Math.round(check.run.durationMs / 1000)}s)`)
  }
  const bad = Object.entries(check.details).filter(([, r]) => !r.ok)
  if (bad.length) {
    log(`探测异常 ${bad.length} 家：${bad.map(([slug, r]) => `${slug}=${r.error ?? `HTTP${r.status}`}`).join(' ')}`)
  }
  const dropped = pruneState(state)
  if (dropped.length) log(`清理已下架厂商的状态记录：${dropped.join(',')}`)
  saveState(state)

  // 2. 官方套餐抓取
  const scrape = await refetchOfficial()
  log(`官方源抓取：成功 ${scrape.ok.join(',') || '-'} · 失败 ${scrape.fail.join(',') || '-'} · 套餐 ${scrape.totalPlans} 条 (${Math.round(scrape.durationMs / 1000)}s)`)

  // 3. 汇率
  const prevRates = readJson<RatesState>('rates.json')
  const rates = await fetchRates(prevRates)
  log(`汇率：1 USD = ${rates.usdCny} CNY (${rates.source}${rates.fallback ? ' · 回退值' : ''})`)

  // 4. 派生视图
  const providersFinal = mergeProviders(state)
  const offers = mergeOffers(scrape.results)
  const rows = buildProviderRows(providersFinal, offers)
  const officialMeta = buildOfficialMeta(scrape.results, new Date().toISOString())
  const home = buildHome(offers, rows, state.lastRun, officialMeta)

  const generatedAt = new Date().toISOString()
  writeJson('rates.json', rates)
  writeJson('status.json', { generatedAt, lastRun: state.lastRun })
  writeJson('providers.json', { generatedAt, providers: rows, lastRun: state.lastRun })
  writeJson('offers.json', { generatedAt, total: offers.length, offers })
  writeJson('home.json', { generatedAt, ...home })

  log(
    `已写入 data/site：${offers.length} 条套餐 / ${rows.length} 家厂商 / 官方实时 ${offers.filter(o => o.source === 'official').length} 条（耗时 ${Math.round((Date.now() - startedAt) / 1000)}s）`
  )
}

main().catch(err => {
  console.error('[refresh] 数据刷新失败:', err)
  process.exit(1)
})
