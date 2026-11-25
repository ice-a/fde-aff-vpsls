import { defineNuxtConfig } from 'nuxt/config'
import { SEED_PROVIDERS } from './shared/data/providers'

/**
 * 站点根路径前缀。默认 '/' —— Pages 已绑自定义域名（vps.020417.xyz），产物挂在域名根目录。
 * 若改用仓库路径 Pages（https://<用户>.github.io/<仓库>/），把 NUXT_APP_BASE_URL 设成 '/<仓库名>/'。
 */
const baseURL = process.env.NUXT_APP_BASE_URL || '/'

/**
 * 静态站配置（GitHub Pages）：
 *   app.baseURL —— 站点根路径前缀（见上方 baseURL）
 *   nitro.preset —— static：构建产物是纯静态文件，扔到任意静态托管都能跑
 *   prerender    —— 预渲染所有页面 + 每个厂商的 /go/<slug> 出口跳转页
 *
 * 每日数据（检测结果 / 官方套餐 / 汇率）由 scripts/refresh-data.ts 写进
 * data/site/*.json，前端构建时直接 import，运行时不再有任何服务端依赖。
 */
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  ssr: true,

  css: [
    '@fontsource/chakra-petch/500.css',
    '@fontsource/chakra-petch/700.css',
    '@fontsource/ibm-plex-mono/400.css',
    '@fontsource/ibm-plex-mono/600.css',
    '~/assets/css/main.css'
  ],

  app: {
    baseURL,
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: 'VPS 报价单 · 全网 VPS 每日核价 · 人民币实时换算 · 机房测速选购',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content: '全网 VPS 套餐按年付总价统一排序，美元标价实时汇率折算人民币；机房连通性每日 04:00 自动检测，支持按你的网络位置测速推荐机房区域。'
        },
        { name: 'theme-color', content: '#0b0f14' }
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: `${baseURL}favicon.svg` }]
    }
  },

  nitro: {
    preset: 'static',
    prerender: {
      crawlLinks: true,
      routes: [
        '/',
        '/deals',
        '/guide',
        '/providers',
        // 出口跳转页：每个厂商一张静态跳转页（服务端 302 的静态替代）
        ...SEED_PROVIDERS.map(p => `/go/${p.slug}`)
      ],
      failOnError: true
    }
  },

  typescript: { strict: true }
})
