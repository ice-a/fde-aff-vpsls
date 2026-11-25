<script setup lang="ts">
import { AFF_CONFIG, buildAffUrl } from '#shared/aff'
import { SEED_PROVIDERS } from '#shared/data/providers'

/**
 * 统一出口跳转（静态版）：
 * 服务端 302 换成构建期生成的静态页 —— 每个厂商一个 /go/<slug>，
 * 页面里带 meta refresh（无 JS 也能跳）+ 跳转前上报一次点击埋点。
 * 目标 URL 由 shared/aff.ts 决定：配了专属 aff 用专属，否则裸链。
 */

const route = useRoute()
const slug = computed(() => String(route.params.slug ?? ''))
const provider = computed(() => SEED_PROVIDERS.find(p => p.slug === slug.value))
const target = computed(() => (provider.value ? buildAffUrl(provider.value.slug, provider.value.url) : null))

useHead(() => ({
  title: provider.value ? `前往 ${provider.value.name}` : '跳转中',
  meta: [
    { name: 'robots', content: 'noindex, nofollow' },
    ...(target.value ? [{ 'http-equiv': 'refresh', content: `0;url=${target.value}` }] : [])
  ],
  link: target.value ? [{ rel: 'canonical', href: target.value }] : []
}))

onMounted(() => {
  // 埋点上报（可选端点，配置在 shared/aff.ts 的 CLICK_BEACON）
  const beacon = AFF_CONFIG.CLICK_BEACON
  if (beacon) {
    const q = new URLSearchParams(window.location.search)
    const params = new URLSearchParams({ p: slug.value, src: q.get('src') ?? 'direct' })
    const offer = q.get('offer')
    if (offer) params.set('offer', offer)
    fetch(`${beacon}${beacon.includes('?') ? '&' : '?'}${params.toString()}`, { keepalive: true }).catch(() => {})
  }
  if (target.value) window.location.replace(target.value)
})
</script>

<template>
  <div style="padding: 80px 0; text-align: center">
    <p class="mono" style="font-size: 13px">
      正在前往 {{ provider?.name ?? slug }}…
    </p>
    <p style="margin-top: 16px">
      <a v-if="target" :href="target" class="btn btn-primary" rel="sponsored noopener">点此跳转</a>
      <span v-else class="faint">未知服务商</span>
    </p>
  </div>
</template>
