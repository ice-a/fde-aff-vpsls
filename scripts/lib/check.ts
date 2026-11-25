import type { CheckRun, Provider } from '#shared/types'
import type { PersistedState, ProviderStatus } from './state.ts'

/**
 * 每日可用性检测（静态站版）：
 *  - 逐个 GET 服务商官网首页，2xx/3xx/401/403 均视为「在线」（403 只是拦爬虫）；
 *  - 单次超时 8s，失败重试 1 次；
 *  - 连续 3 轮全失败标 down，一旦成功立即回 up；
 *  - 全员探测失败 = 本机网络/环境问题，这种情况下不动状态，避免误标全站 DOWN。
 */

const TIMEOUT_MS = 8000
const RETRIES = 1
const FAIL_DOWN_AFTER = 3
const CONCURRENCY = 6

async function probe(url: string): Promise<boolean> {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'user-agent': 'VPSStatusBot/1.0 (+daily availability check)' }
      })
      if (res.ok || res.status === 401 || res.status === 403) return true
    } catch {
      /* 网络层失败/超时 → 走重试 */
    }
  }
  return false
}

export interface CheckResult {
  run: CheckRun
  providerStatus: Record<string, ProviderStatus>
  /** true = 全员探测失败，状态未更新 */
  networkFailure: boolean
}

export async function runCheck(
  providers: Provider[],
  prev: PersistedState
): Promise<CheckResult> {
  const startedAt = new Date()
  const queue = [...providers]
  const results = new Map<string, boolean>()

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const p = queue.shift()!
      results.set(p.slug, await probe(p.url))
    }
  })
  await Promise.all(workers)

  const okCount = [...results.values()].filter(Boolean).length
  const networkFailure = okCount === 0 && results.size > 0

  const providerStatus: Record<string, ProviderStatus> = { ...prev.providerStatus }
  let up = 0
  let down = 0
  const now = new Date().toISOString()

  if (!networkFailure) {
    for (const p of providers) {
      const ok = results.get(p.slug) ?? null
      const before = providerStatus[p.slug]
      let availability: Provider['availability']
      let failStreak: number

      if (ok === null) {
        availability = before?.availability ?? p.availability
        failStreak = before?.failStreak ?? p.failStreak
      } else if (ok) {
        availability = 'up'
        failStreak = 0
      } else {
        failStreak = (before?.failStreak ?? p.failStreak) + 1
        availability = failStreak >= FAIL_DOWN_AFTER ? 'down' : 'up'
      }

      providerStatus[p.slug] = { availability, lastCheckedAt: now, failStreak }
      if (availability === 'up') up++
      else if (availability === 'down') down++
    }
  } else {
    for (const p of providers) {
      const before = providerStatus[p.slug]
      const availability = before?.availability ?? p.availability
      if (availability === 'up') up++
      else if (availability === 'down') down++
    }
  }

  const finishedAt = new Date()
  const run: CheckRun = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    total: providers.length,
    up,
    down,
    unknown: providers.length - up - down,
    durationMs: finishedAt.getTime() - startedAt.getTime()
  }

  return { run, providerStatus, networkFailure }
}
