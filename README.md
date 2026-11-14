# BestNav Clone

浏览器首页导航与 Docker 管理面板 —— 私有化部署自托管。

参考自 [BestNav](https://nav.bestu.top/)，本项目为其**功能对标的开源复刻版**：实现全部功能能力，不含任何商业授权码机制。

## 功能

| 模块 | 说明 |
|---|---|
| 智能书签 | 分组增删排序折叠、内外网双地址、全局模糊搜索、拼音搜索、可用性巡检 |
| 导航包 NavPack | 15 个精选包 / 500+ 站点，一键导入，支持自定义包源 |
| 四套模板 | 经典卡片、杂志流、控制台、桌面窗口 + Dock |
| 聚合搜索 | 12 大分类多源并发，自定义搜索源 |
| Docker 监控 | 容器列表、CPU/内存、端口映射、批量启停、滚动日志、Web 终端 |
| 主机资源 | CPU / 内存 / 磁盘 / 网络 / 运行时长 / 温度 |
| SSL 巡检 | 到期倒计时、健康度评分、历史快照 |
| 流量统计 | 分钟/小时/天三级分层，峰值、95 分位、软件排行 |
| 服务监控 | 在线状态、响应时间、WOL 唤醒、端口扫描 |
| 控制室 | 8 个高频开关，先预演再执行，全程留痕 |
| 多通道告警 | 企业微信 / 钉钉 / 飞书 / Telegram / Bark / Gotify / ntfy / Webhook |
| 访客统计 | PV/UV、趋势、24h 分布、终端与浏览器占比、热门页面 |
| 效率工具箱 | 8 大模块 50+ 引擎，开放 API 化 |
| API 中转站 | OpenAI 兼容入口、四层自动降级、逐条账本、Token 看板 |
| MCP 接入 | Claude / Cursor 直连面板查状态、启停容器 |
| 多用户 RBAC | owner / admin / member，按资源粒度公开或私有 |
| 审计日志 | 谁在何时改了什么，逐条可查 |
| 备份恢复 | 一键打包 zip、定时自动备份、WebDAV 异地备份 |
| 日历与农历 | 本地事件 + SSL 到期 + 备份记录自动汇入 |
| 备忘录 | 新建/编辑/置顶/文件夹/待办 |

## 快速开始

```bash
# 开发
pnpm install
pnpm db:seed     # 灌入示例书签/卡片/搜索源/导航包
pnpm dev         # http://localhost:3100

# 生产
pnpm build && pnpm start
```

首次访问会引导创建管理员（owner 角色）。

## Docker 部署

```bash
mkdir -p ~/bestnav && cd ~/bestnav
docker compose up -d
# 访问 http://<服务器IP>:10788
```

### 接入 Docker 容器管理

默认**不启用**容器管理（少跑一个代理，且默认不挂载 docker.sock）。需要时：

1. `docker-compose.yml` 里取消注释 `DOCKER_HOST=tcp://socket-proxy:2375`
2. 保留 `socket-proxy` 服务与 `depends_on`
3. `docker compose up -d`

`socket-proxy` 只放行容器列表/详情/stats/日志与启停重启；应用侧还会再做一层路径 ACL，不直接暴露 docker.sock。

## 环境变量

| 变量 | 说明 |
|---|---|
| `PORT` | 监听端口（容器内固定 3000，由 compose 映射） |
| `TZ` | 时区，影响定时任务与日志时间 |
| `BESTNAV_SECRET` | 会话与密钥加密主密钥，**生产必须改** |
| `BESTNAV_DATA_DIR` | 数据目录（默认 `./data`） |
| `DOCKER_HOST` | Docker API 地址，接入容器管理时用 |
| `PUBLIC_URL` | 对外访问地址，用于生成回调与分享链接 |

## 目录结构

```
src/
  lib/        数据层、认证、加密、定价、中转站、MCP、工具注册表
  app/        App Router 页面与 API
  components/ UI 组件（bookmarks / cards / ops / search / admin / templates / shell）
data/         运行时数据（SQLite + 备份），不入版本库
scripts/      seed 等运维脚本
```

## 数据存储

- 全部数据落在 `data/bestnav.db`（SQLite，WAL 模式）
- 备份为 zip，落 `data/backups/`
- 不经过任何第三方；不上传云端

## 许可

MIT。参考项目 BestNav 的免费版能力，Pro 闭源商业授权部分未包含在本仓库中。
