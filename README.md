# 内战数据站 · GitHub Pages 只读镜像

原站为唯一可编辑数据源。只读站支持战况、比赛、个人榜、MMR、羁绊与名册浏览，未提供登录或写入接口。

## 同步

- GitHub Actions 每小时第 17 分钟从原站 `/api/public-snapshot` 获取完整快照，并发布到 Pages。
- 编辑、合并、修改 Base MMR 后，可打开仓库 Actions → **Sync and publish scrim mirror** → **Run workflow** 手动同步。
- GitHub 定时任务可能延迟；页面展示北京时间的真实快照时间，超过 3 小时会提示。
- 公开仓库长时间无活动时 GitHub 可能暂停定时工作流；届时在 Actions 重新启用。
- 同步失败或数据不完整时整个工作流失败，不部署空数据；线上保留最后成功版本。
- 单个快照包含比赛、名册、合并关系和 Base MMR，原站通过 D1 事务读取，避免跨版本混用。
- 原站的备注、管理员信息、修改日志、截图上传记录不导出。
- 原站 MMR 算法变化时应同步更新镜像展示代码和 `formulaVersion`；版本不兼容时自动停止发布。

## 首次启用

仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**，然后手动运行工作流。

GitHub Pages 的页面、数据、英雄图片都在本站，访客无需访问原站或登录 ChatGPT。网页请求通过 CSP 限定到同源。

## 文件

`site/` 是不内嵌历史比赛的静态页面；`scripts/sync-mirror.mjs` 与 `lib/mirror-snapshot.mjs` 负责快照同步和校验。不含原站后台和数据库。英雄图片由 GitHub 发布任务从 Valve CDN 下载并放到本站，任何缺失或损坏会中止发布。比赛快照和英雄图片保存在发布产物中，不写入 Git 历史。
