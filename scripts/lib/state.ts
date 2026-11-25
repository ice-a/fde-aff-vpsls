import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { CheckRun, Provider } from '#shared/types'

/**
 * 每日管道的持久化状态（随仓库提交，跨次运行保留）。
 *
 * 静态站没有服务端可写，检测结果（连续失败次数 / 最近一轮汇总）只能落在仓库里，
 * 由 GitHub Actions 每天跑一次 scripts/refresh-data.ts 时读写。
 */

export interface ProviderStatus {
  availability: Provider['availability']
  lastCheckedAt: string | null
  failStreak: number
}

export interface PersistedState {
  providerStatus: Record<string, ProviderStatus>
  lastRun: CheckRun | null
}

const EMPTY: PersistedState = { providerStatus: {}, lastRun: null }

export const STATE_FILE = join(process.cwd(), 'data', 'state.json')

export function loadState(): PersistedState {
  try {
    const raw = readFileSync(STATE_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    return {
      providerStatus: parsed?.providerStatus ?? {},
      lastRun: parsed?.lastRun ?? null
    }
  } catch {
    return structuredClone(EMPTY)
  }
}

export function saveState(state: PersistedState): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf-8')
}
