# 部署到 GitHub Pages

站点是**纯静态站**：构建产物只有 HTML/CSS/JS，没有服务端进程、没有数据库、没有容器。GitHub Actions 负责构建发布，每天再跑一次数据管道。

## 一、一次性设置

1. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
2. `app.baseURL` 默认 `'/'`（站点挂在域名根路径）。当前 Pages 绑的是自定义域名 `https://vps.020417.xyz/`，产物直接在根目录，**不要**加仓库路径前缀。
   - 若以后改用仓库路径 Pages（`https://<用户>.github.io/<仓库>/`），把 `nuxt.config.ts` 的 `baseURL` 改成 `'/<仓库名>/'`（或给构建环境加 `NUXT_APP_BASE_URL=/<仓库名>/`）。
3. 推 `main` 即触发首次发布（工作流 `deploy-pages`）。

之后：**每次 push 到 main 都会重新构建并发布**。

## 二、两条工作流

| 工作流 | 触发 | 干什么 |
| --- | --- | --- |
| `deploy-pages` | push 到 main / 手动 | `pnpm install` → `pnpm run generate` → 上传 `.output/public` → 发布 |
| `refresh-data` | 每天 04:00（北京时间，cron `0 20 * * *` UTC）/ 手动 | 跑检测 + 抓取 + 汇率 → 写 `data/` → 提交到 main → 触发上面的发布 |

`refresh-data` 需要仓库的 **Settings → Actions → General → Workflow permissions** 设为 *Read and write permissions*（否则推送数据提交会失败）。

## 三、本地跑一遍

```bash
pnpm install
pnpm run data:refresh      # 可选：先刷一轮数据（约 30s，需要外网）
pnpm run generate          # 产物在 .output/public
npx serve .output/public   # 本地预览静态产物
```

本地预览与线上结构一致（都挂在根路径），直接访问 `/index.html`、`/deals/index.html` 即可。若要用仓库路径构建一份做对比：`NUXT_APP_BASE_URL=/<仓库名>/ pnpm run generate`。

## 四、每日数据是怎么更新的

```
data/state.json          检测状态（连续失败计数、最近一轮汇总）
data/site/home.json      首页聚合：统计 / 最便宜榜 / 推荐位 / 厂商摘要
data/site/offers.json    套餐全量（筛选器在浏览器里实时筛）
data/site/providers.json 服务商目录 + 最近检测汇总
data/site/rates.json     汇率
data/site/status.json    站点状态
```

这些文件**随仓库提交**，所以：

- 本地 clone 下来直接构建就有数据（快照即上一次刷新结果）；
- 每日工作流刷新后提交 → Pages 自动重建 → 线上数据当天生效；
- 想立刻更新：在 Actions 里手动触发 `refresh-data`。

## 五、验收清单

```bash
# 产物结构
ls .output/public/index.html .output/public/deals/index.html .output/public/404.html
ls .output/public/go/racknerd/index.html      # 每个厂商一张跳转页

# 跳转页里的最终目标（含 aff）
grep -o 'http-equiv="refresh"[^>]*' .output/public/go/racknerd/index.html

# 页面里确实带了数据（而不是空壳）
grep -c 'class="sheet"' .output/public/index.html

# base 路径正确
grep -o 'baseURL:"[^"]*"' .output/public/index.html
```

## 六、故障排查

| 现象 | 原因 / 处理 |
| --- | --- |
| 打开 404 | Pages 的 Source 没选 GitHub Actions；或 `baseURL` 与实际路径不符 |
| 页面能开但样式/脚本全丢 | `baseURL` 与部署路径不一致，资源链接 404；用 `NUXT_APP_BASE_URL` 覆盖 |
| 数据停在旧时间 | `refresh-data` 工作流失败（看 Actions 日志，多半是外网抓取被墙/超时）；手动触发一次即可 |
| 提交数据失败 | Workflow permissions 是只读；改成 *Read and write permissions* |
| 某厂商一直标 DOWN | 官网真的打不开（403 会被当作在线）；连续 3 轮失败才标 DOWN |
| 抓取官网套餐失败 | 反爬/客户端渲染，页面会回退种子价并标 `source=seed`；解析规则在 `scripts/lib/scrape.ts` |

## 七、为什么是静态站

| | 旧版（SSR + SQLite + Docker） | 现在（GitHub Pages 静态） |
| --- | --- | --- |
| 运行成本 | 要一台服务器（或容器平台） | 0，GitHub Pages 免费托管 |
| 数据新鲜度 | 进程内定时器每天跑 | Actions 每天跑，跑完自动重建 |
| 状态持久化 | SQLite 文件 + 持久卷 | 仓库里的 JSON（随提交留档） |
| 出口跳转 | 服务端 302 | 构建期生成的静态跳转页 |
| 访问统计 | 服务端埋点 + /stats 看板 | **没有**（静态站没有服务端可记账） |

代价是明确的：**访问统计页没了**，手动「立即检测/刷新套餐」按钮也没了（改成在 Actions 里手动触发）。换来的好处是零运维、零成本、零故障面。
