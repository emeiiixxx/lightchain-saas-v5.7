# Lightchain SaaS v5.7 Demo

独立交互演示，包含融合画布、视频工作台与设计生产工作台，支持中英日和深浅主题。

本版本包含智能裁图、自定义裁剪预设、电商指定尺寸输出、提示词库分类标签与管理，以及 Flow 输入焦点和参考图展示优化。

设计生产工作台的 AI 助手仅提供静态演示，不连接真实生成服务。

## 本地运行

```sh
npm ci
npm run dev -- --port 5177
```

- 融合画布：`http://127.0.0.1:5177/#/canvas`
- 视频工作台：`http://127.0.0.1:5177/#/video-workspace`
- 设计生产工作台：`http://127.0.0.1:5177/#/design-workspace`

## 构建与部署

```sh
npm run build
node scripts/build-pages.mjs
```

GitHub Pages 从 `main` 自动部署至 `/lightchain-saas-v5.7/`。裁剪在浏览器本地处理，其他生成类交互使用演示素材。
