<script setup lang="ts">
import type { ProvidersResponse } from '#shared/types'
import providersData from '~~/data/site/providers.json'

useSeoMeta({
  title: '服务商目录与状态 · VPS 报价单',
  description: '全部 VPS 服务商一览：套餐数、最低月付、官网连通性每日 04:00 自动检测。'
})

const providersRes = providersData as unknown as ProvidersResponse

const providers = computed(() => providersRes.providers ?? [])
const lastRun = computed(() => providersRes.lastRun ?? null)
</script>

<template>
  <div>
    <section class="hero" style="padding: 56px 0 36px">
      <div class="wrap">
        <div class="eyebrow">PROVIDER DIRECTORY · 服务商目录</div>
        <h1 style="font-size: clamp(30px, 4.5vw, 46px)">{{ providers.length }} 家厂商，一张状态表看完</h1>
        <p class="hero-sub">
          官网连通性每天 04:00 自动探测：2xx/3xx 即在线，连续 3 轮失败标「不可达」，恢复自动回绿。
          <span v-if="lastRun" class="mono">
            <br />最近一轮：{{ new Date(lastRun.finishedAt).toLocaleString('zh-CN') }}（{{ Math.round(lastRun.durationMs / 1000) }}s）
          </span>
        </p>

        <div class="prov-head" style="margin-top: 28px">
          <span class="mono muted" style="font-size: 12px">
            检测与官方套餐抓取由 GitHub Actions 每天 04:00（北京时间）自动执行，跑完即重建本站；
            需要立刻刷新可在仓库的 Actions 里手动触发一次 refresh-data。
          </span>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        <div class="section-head">
          <span class="index">DIR</span>
          <h2>全部服务商</h2>
          <span class="desc">SORTED BY CHEAPEST $/MO ↑</span>
        </div>
        <ProviderSheet :providers="providers" />
      </div>
    </section>
  </div>
</template>
