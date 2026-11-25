export interface RatesState {
  usdCny: number
  updatedAt: string
  source: string
  fallback: boolean
}

/**
 * 汇率（USD → CNY）：双源互备。
 *  - 主源 jsdelivr currency-api，备源 open.er-api.com；
 *  - 两个源都挂 → 沿用上一轮的值（宁可旧也别让页面空白）。
 */

const FALLBACK: RatesState = {
  usdCny: 6.68,
  updatedAt: '1970-01-01T00:00:00.000Z',
  source: 'fallback',
  fallback: true
}

async function fetchFrom(url: string, pick: (j: any) => number | undefined): Promise<number | undefined> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { accept: 'application/json' }
    })
    if (!res.ok) return undefined
    const v = pick(await res.json())
    return typeof v === 'number' && Number.isFinite(v) && v > 1 && v < 100 ? v : undefined
  } catch {
    return undefined
  }
}

/** 拉一次汇率；失败时回退到 prev（上一轮的值），再失败用常量兜底 */
export async function fetchRates(prev?: RatesState | null): Promise<RatesState> {
  const usdCny =
    (await fetchFrom(
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
      j => j?.usd?.cny
    )) ??
    (await fetchFrom('https://open.er-api.com/v6/latest/USD', j => j?.rates?.CNY))

  if (usdCny) {
    return { usdCny, updatedAt: new Date().toISOString(), source: 'live', fallback: false }
  }
  if (prev && prev.usdCny > 1) return prev
  return FALLBACK
}
