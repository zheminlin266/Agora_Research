# Agora Research

Agora Research 是一个面向实时互动行业的中英双语研究站点，内容覆盖行业需求、行业供给、声网竞争力以及公开数据。线上文章由 `articles/` 提供，研究草稿和资料保留在 `Research_Report/`、`Resources/`，后两者不会自动进入站点搜索。

研究与维护：[Zhemin Lin（Zhemin）](https://www.zhemin.ltd/)。个人网站收录基本面研究、文章与其他项目。

Research and maintenance by [Zhemin Lin (Zhemin)](https://www.zhemin.ltd/). Visit the personal website for fundamental research, articles, and other projects.

## 运行时路由

项目使用 Next.js App Router，并启用 trailing slash。当前应用包含 14 条页面路由：

| 路由 | 内容 |
| --- | --- |
| `/` | 首页与研究入口 |
| `/Demand/RTC_industry_demand/` | RTC 行业需求 |
| `/Demand/US_Livestream_Commerce_Growth/` | 美国直播电商增长 |
| `/Demand/AI_Voice_Infrastructure/` | AI 语音基础设施需求 |
| `/Demand/Dev_npm_downloads/` | npm / PyPI 下载量看板 |
| `/Supply/RTC_supply/` | RTC 行业供给 |
| `/Supply/AI_RTC_moats/` | AI 对 RTC 业务护城河的影响 |
| `/Supply/OpenAI_LiveKit_Relationship/` | OpenAI 与 LiveKit 关系 |
| `/Agora/Customer_Scenarios_Competitive_Analysis/` | 声网客户场景与竞争分析 |
| `/Agora/Whatnot_Agora_Partnership/` | Whatnot 与声网直播合作 |
| `/Agora/Equity_Ownership_Share_Repurchase_Analysis/` | 股权结构与回购 |
| `/Agora/Employee_Headcount_Changes/` | 员工人数变化 |
| `/Agora/Shanghai_Headquarters_Construction_Analysis/` | 上海总部建设分析 |
| `/Resources/Agora_Key_Metrics/` | 声网季度核心指标 |

Resources 导航中的 RTC Learning Materials 是指向 GitHub `Resources/` 目录的外部链接，不是应用页面。

## 内容与代码结构

```text
app/                              # App Router 页面、全局布局与 CSS
articles/                         # 线上文章的中英文 Markdown
components/                       # 站点导航、文章渲染、看板和偏好设置
lib/content-manifest.ts           # 路由、标题、文件和搜索可见性的唯一清单
components/manifest-article-page.tsx # 按 manifest 从 articles/读取文章
lib/site-search.ts                # 由 manifest 驱动的搜索索引
public/data/dev-npm-downloads/    # 6 组 CSV 与对应 metadata
scripts/                          # 6 个数据更新入口与 validate:data
tests/                            # Python、数据契约和 manifest 检查
Research_Report/                  # 研究工作资料，不自动发布
Resources/                        # 资料文件与外部资源
docs/                             # 架构、数据管线和恢复手册
```

新增或移动线上文章时，先修改 `lib/content-manifest.ts`，再确认中英文文件存在；不要分别在路由、导航和搜索中维护重复映射。

## 本地开发与验证

验证环境使用 Node.js 24、npm 11 和 Python 3.12；推荐 Node.js ≥20.9、Python ≥3.10。仓库未提交密钥、`.env` 或 Vercel 本地配置。

```powershell
npm ci
npm run dev
```

默认打开 `http://localhost:3000/`。提交前运行：

```powershell
npm run typecheck
npm test
npm run validate:data
npm run build
npm run build -- --webpack
```

`npm test` 包含 Python 单元测试、下载数据解析检查和 content manifest 检查。`validate:data` 不访问网络，只校验已提交的 CSV/metadata 契约。

## 数据更新

统一入口默认增量更新全部数据集：

```powershell
# 默认增量更新全部六组数据
npm run update:data

# 需要从源数据完整重建时使用
npm run rebuild:data

# 只更新一组数据时重复 --dataset 或选择一个
python scripts/update_dashboard_data.py --dataset agoraNpm
```

npm 数据来自 npm 官方 Downloads API；PyPI 数据来自 PyPI 项目元数据和 ClickPy/ClickHouse。脚本会在内存中完成校验，再以临时文件和原子替换更新 CSV/metadata。网络失败、空结果、schema 变化或数据回退都不得覆盖现有产物。详见 [docs/data-pipeline.md](docs/data-pipeline.md)。

## Git、备份与部署

所有变更从最新 `origin/main` 创建功能分支，通过 PR 合并；不要在 `main` 上直接提交、推送或 force-push。预览应使用 PR 对应的 Vercel Preview，合并后再核验 Production deployment 的 commit SHA。

重构或数据更新前，先在仓库外保存工作树快照、Git bundle、staged/unstaged patch、未跟踪资料清单和 submodule 状态。恢复和回滚步骤见 [docs/recovery.md](docs/recovery.md)。

`.playwright-mcp/` 和根目录 `next-preview-*.log` 是本地运行工件，已加入忽略；`.obsidian/` 可能包含共享研究配置，当前不自动忽略或删除，须先确认归属。

更多运行时关系见 [docs/architecture.md](docs/architecture.md)。
