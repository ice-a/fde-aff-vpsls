import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { Provider } from '#shared/types'
import type { PersistedState, ProviderStatus } from './state.ts'

/**
 * 每日可用性检测（静态站版）：
 *  - 逐个 GET 服务商官网首页，2xx/3xx/401/403 均视为「在线」（403 只是拦爬虫）；
 *  - 单次超时 8s，失败重试 1 次；
 *  - 连续 3 轮全失败标 down，一旦成功立即回 up；
 *  - 全员探测失败 = 本机网络/环境问题，这种情况下不动状态，避免误标全站 DOWN。
 *
 * 为什么不用 fetch：Node 内置 fetch（undici）默认用 ALPN 协商 h2，
 * 遇到只会 http/1.1、且 h2 实现有问题的服务器时会「协商成功然后一直挂到超时」，
 * 连真实状态码都拿不到（实测 cloudserver.com 就是这样：curl --http1.1 秒回 410，
 * 而 fetch / curl --http2 全部挂死）。这里只用 node:https / node:http（http/1.1），
 * 手动跟随跳转，拿到真实状态码再判定。
 */

const TIMEOUT_MS = 8000
const RETRIES = 1
const FAIL_DOWN_AFTER = 3
const CONCURRENCY = 6
const MAX_REDIRECTS = 3
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export interface ProbeResult {
  ok: boolean
  status: number | null
  error: string | null
}

/** 发起一次 http/1.1 请求，只看状态码，不读 body */
function requestOnce(url: string, redirectsLeft: number): Promise<ProbeResult> {
  return new Promise(resolve => {
    const mod = url.startsWith('http://') ? httpRequest : httpsRequest
    let settled = false
    const done = (r: ProbeResult) => {
      if (!settled) {
        settled = true
        resolve(r)
      }
    }

    const req = mod(
      url,
      {
        method: 'GET',
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
        timeout: TIMEOUT_MS
      },
      res => {
        const status = res.statusCode ?? 0
        res.destroy() // 不关心正文，直接断开
        const location = res.headers.location
        if (status >= 300 && status < 400 && location && redirectsLeft > 0) {
          try {
            requestOnce(new URL(location, url).toString(), redirectsLeft - 1).then(done)
          } catch {
            done({ ok: false, status, error: 'bad-redirect' })
          }
          return
        }
        const ok = (status >= 200 && status < 400) || status === 401 || status === 403
        done({ ok, status, error: ok ? null : `HTTP ${status}` })
      }
    )

    req.on('timeout', () => {
      req.destroy()
      done({ ok: false, status: null, error: 'timeout' })
    })
    req.on('error', err => done({ ok: false, status: null, error: err.code || err.message }))
    req.end()
  })
}

async function probe(url: string): Promise<ProbeResult> {
  let last: ProbeResult = { ok: false, status: null, error: 'not-attempted' }
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    last = await requestOnce(url, MAX_REDIRECTS)
    if (last.ok) return last
  }
  return last
}

export interface CheckResult {
  run: CheckRun
  providerStatus: Record<string, ProviderStatus>
  /** true = 全员探测失败，状态未更新 */
  networkFailure: boolean
  /** 每家厂商的探测明细（状态码/错误），用于日志排查 */
  details: Record<string, ProbeResult>
}

export async function runCheck(
  providers: Provider[],
  prev: PersistedState
): Promise<CheckResult> {
  const startedAt = new Date()
  const queue = [...providers]
  const results = new Map<string, ProbeResult>()

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const p = queue.shift()!
      results.set(p.slug, await probe(p.url))
    }
  })
  await Promise.all(workers)

  const okCount = [...results.values()].filter(r => r.ok).length
  const networkFailure = okCount === 0 && results.size > 0

  const providerStatus: Record<string, ProviderStatus> = { ...prev.providerStatus }
  let up = 0
  let down = 0
  const now = new Date().toISOString()

  if (!networkFailure) {
    for (const p of providers) {
      const res = results.get(p.slug)
      const before = providerStatus[p.slug]
      let availability: Provider['availability']
      let failStreak: number

      if (!res) {
        availability = before?.availability ?? p.availability
        failStreak = before?.failStreak ?? p.failStreak
      } else if (res.ok) {
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

  const details: Record<string, ProbeResult> = {}
  for (const [slug, res] of results) details[slug] = res

  return { run, providerStatus, networkFailure, details }
}
