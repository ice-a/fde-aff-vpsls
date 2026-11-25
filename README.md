# VPS 报价单（vpsls 同款 · 纯静态站）

仿 [vpsls.com](https://vpsls.com/) 模式的 VPS 优惠聚合站：**Nuxt 4 纯静态站**（GitHub Pages 托管）、**服务商连通性每日 04:00 自动检测**、**全站推广链接统一出口替换**、UI 全新设计（机房报价单 / 工业仪表盘风）。

- **部署**：GitHub Pages —— 构建产物就是一堆 HTML/CSS/JS，没有服务端、没有数据库、没有容器。
- **每日数据**：GitHub Actions 每天 04:00（北京时间）跑一轮「检测 + 抓取 + 汇率」，把结果写回仓库并提交，提交自动触发 Pages 重建。

## 快速开始

```bash
# 本地开发（Node ≥ 22.18）
pnpm install
pnpm dev                          # http://localhost:3000

# 手动刷新一次每日数据（检测 + 抓取 + 汇率 → data/site/*.json）
pnpm run data:refresh

# 生成静态站（产物在 .output/public）
pnpm run generate

# 本地预览静态产物
npx serve .output/public
```

页面：`/` 首页（榜单+推荐+状态）、`/deals` 实时筛选器、`/guide` 测速选购方法、`/providers` 服务商目录。
各厂商联盟申请入口与步骤：[AFFILIATES.md](AFFILIATES.md)。

**展示与推荐口径（对外三原则）**：
- **年付主显**：价格列以「年付总价」为主（`/年`），月均与另一币种作辅助行；`perYear = 期价 × 年化倍数`（月付×12 / 季付×4 / 半年付×2 / 年付=标价），不走 `perMonth×12` 防舍入漂移。
- **年付优先**：首页最便宜榜只列年付套餐；筛选器默认排序 `recommend`。
- **有 aff 优先**：配了 [shared/aff.ts](shared/aff.ts) 返佣链接的服务商在推荐序里排前（**前台不展示「返佣」标记**，只影响位次），排序键 `hasAff desc → cycle==yearly desc → perYear asc`，价格在同级内仍然升序——返佣不改价格口径，只改推荐位次。
- **预算窗口年付化**：首页「按预算快选」与筛选器 `window` 参数为年付总价档位（180/360/600/1200/2400）；旧分享链接 `window=15/30/50/100/200`（月单价）自动 ×12 兼容。

**人民币实时换算**：价格以美元标价，每日管道按实时汇率（jsdelivr currency-api 主源 / open.er-api.com 备源）换算人民币；全站价格主显 ¥/$ 可在顶栏切换（localStorage 记忆）。

**测速选购（/guide）**：识别当前公网 IP 位置（ipwho.is → ipinfo.io）推荐机房区域并一键实测该区域；也可手动选点测 9 个区域的延迟（浏览器 no-cors 计时取多目标最小值 ≈ RTT），最快区域直达筛选器。

## 静态站是怎么跑起来的

```
scripts/refresh-data.ts          ← 每日管道（GitHub Actions 04:00 跑）
  ├─ check      连通性检测 18 家官网 → data/state.json
  ├─ scrape     6 家官方套餐页抓取解析
  ├─ rates      美元兑人民币汇率
  └─ derive     派生视图 → data/site/{home,offers,providers,rates,status}.json
                    ↓ 提交到 main
        .github/workflows/pages.yml  ← 构建并发布
                    ↓
              nuxt generate → .output/public → GitHub Pages
                    ↓
        前端构建时直接 import data/site/*.json（运行时零请求）
```

页面上的所有数字都来自这批 JSON：**检测状态、套餐价、汇率**都在构建那一刻固化进产物，所以站点打开后不依赖任何后端。

## 把 aff 换成你的（全站唯一入口）

**所有**对外链接只从 [shared/aff.ts](shared/aff.ts) 出去，站内统一走 `/go/:slug` 出口（每个厂商一张静态跳转页，构建期生成）：

```ts
// 方式一：全局兜底（最常用）
DEFAULT_REF: 'YOUR-ID'        // 裸链自动拼 ?ref=YOUR-ID
// 或
DEFAULT_MODE: 'NONE',
DEFAULT_AFF_URL: 'https://你的联盟链接/…'   // 直接整链替换

// 方式二：给某家厂商配专属链接
PROVIDER_AFF: {
  racknerd: 'https://…带你的ID…',
}
```

改完提交即可（构建时读 `shared/aff.ts`，跳转页与 `hasAff` 推荐位次都会跟着变）。

验证：构建后看 `.output/public/go/racknerd/index.html`，里面的 `meta http-equiv="refresh"` 目标就是最终跳转地址。

可选埋点：在 `shared/aff.ts` 填 `CLICK_BEACON: 'https://你的收集端点'`，跳转前会带 `p=<厂商>&src=<来源>&offer=<套餐id>` 上报一次。

## 每日自动检测

- 实现：[scripts/lib/check.ts](scripts/lib/check.ts)（探测逻辑）+ [scripts/refresh-data.ts](scripts/refresh-data.ts)（编排）。
- 规则：每天 **04:00** 逐个 GET 18 家服务商官网（并发 6、超时 8s、重试 1 次），2xx/3xx/401/403 视为在线；**连续 3 轮全失败标 DOWN**，恢复即回 UP。
- 状态落 `data/state.json`（随仓库提交，跨轮保留连续失败计数）；全员探测失败时判定为网络故障，**不更新状态**，避免把整站误标 DOWN。
- 想立刻跑一轮：Actions 里手动触发 `refresh-data`（workflow_dispatch）。

## 套餐数据：官方抓取 + 种子回退

- **官方源（每日自动刷新）**：搬瓦工 / ColoCrossing / Bytevirt / DediOne / WAP.AC / OVH —— 抓到的套餐行打「官方实时」徽标，`source=official`。
- **抓不动的厂商**（反爬 403 / 套餐名客户端渲染 / 无静态价）：回退内置种子价，`source=seed`，页面如实标注；给 [scripts/lib/scrape.ts](scripts/lib/scrape.ts) 的 `OFFICIAL_SOURCES` 加一条 source 配置即可纳入。
- 解析 0 条 = 判失败回种子，绝不半猜半填。

## 改数据

- 厂商目录：[shared/data/providers.ts](shared/data/providers.ts)（slug/name/tagline/regions/官网 URL）
- 套餐目录：[shared/data/offers.ts](shared/data/offers.ts)（元组一行一条；`perMonth` 自动 = 期价 ÷ 期数）
- 改完跑 `pnpm run data:refresh && pnpm run generate` 即可看到效果。

## 目录结构

```
app/            # 前端（SSR 预渲染成静态页）
  pages/        #   /  /deals  /guide  /providers  /go/[slug](出口跳转页)
  components/   #   OfferSheet / ProviderSheet / StatusChip
  assets/css/   #   设计系统（Chakra Petch + IBM Plex Mono，墨黑+薄荷绿）
shared/         # 前后端共享
  types.ts      #   类型 + 静态数据文件的结构定义
  aff.ts        #   推广链接唯一出口配置
  data/         #   厂商/套餐种子数据
scripts/        # 每日数据管道（Node ≥ 22.18 直接跑 .ts）
  refresh-data.ts
  lib/          #   check / scrape / rates / derive / state
data/           # 管道产物（随仓库提交）
  state.json    #   检测状态（连续失败计数、最近一轮汇总）
  site/*.json   #   派生视图：home / offers / providers / rates / status
```

## 部署

GitHub Pages，详见 [DEPLOY.md](DEPLOY.md)。要点：`pnpm run generate` 产物在 `.output/public`，Actions 自动上传发布；`app.baseURL` 默认 `'/'`（站点挂在自定义域名根路径），改用仓库路径 Pages 时设成 `'/<仓库名>/'`。
