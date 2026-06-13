# Obsidian Language Learner

Language Learner 是一个面向语言学习的 Obsidian 插件，提供阅读模式、划词查词、生词记录、复习文本库、数据面板和统计视图。

## Development

```bash
pnpm install
pnpm dev
```

常用检查命令：

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
pnpm check
```

生产构建：

```bash
pnpm build
```

构建会生成 Obsidian 插件需要的根目录产物：

- `main.js`
- `styles.css`
- `manifest.json`

## Platform Notes

`manifest.json` 保持 `isDesktopOnly: false`，因此插件代码需要兼容桌面端和移动端。涉及 Electron 或 Node.js 的能力必须做平台守卫或动态加载。

当前内置 HTTP 服务只在桌面端可启动，默认监听 `127.0.0.1`，用于和本机浏览器扩展交互。移动端不会加载 Node HTTP 服务。

## Local Server Security

内置服务采用本地优先模型：

- 只监听 `127.0.0.1`
- 只允许无 `Origin`、`localhost`、`127.0.0.1` 和 `chrome-extension://` 来源
- 按路由限制 HTTP method
- 限制请求体大小
- 对无效 JSON、未知路由、错误 method 返回明确状态码

这轮没有强制 API Key，以保持现有浏览器扩展兼容性。

## Data

本地数据存储在 IndexedDB，schema 仍为 v1。设置页提供导入、导出和销毁本地数据库的入口。

文本数据库功能可将生词和复习内容同步到指定 Markdown 文件，用于补全和 spaced repetition 工作流。
