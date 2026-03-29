# Aisight Frontend

> 测试管理平台前端 · Vue 3 + TypeScript + Vite · 暗色主题

## 技术栈

| 技术 | 用途 |
|------|------|
| Vue 3 + Composition API | 响应式 UI |
| Vite 7 | 构建 + HMR |
| TypeScript (strict) | 静态类型 |
| Pinia | 状态管理 |
| Element Plus | UI 组件库 |
| vue-codemirror | 脚本编辑器（TypeScript 高亮 + one-dark） |
| Axios | HTTP 请求 |

---

## 快速开始

```bash
npm install          # 安装依赖
npm run dev          # 启动开发服务器 (localhost:5173)
npm run build        # 生产打包
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_API_BASE_URL` | 后端 API 地址 | `http://localhost:8080/api/v1` |

---

## 项目结构

```
src/
├── api/                 # API 层（auth, project, testcase, aiScript, ...）
├── stores/              # Pinia 状态（auth, project, testcase, aiScript）
├── composables/         # 可复用逻辑（useTable, useCrud, ...）
├── components/          # 通用组件
│   ├── AppHeader.vue    #   顶部导航
│   ├── AppSidebar.vue   #   侧边菜单
│   ├── CodeEditor.vue   #   CodeMirror 编辑器
│   └── ...
├── views/               # 页面
│   ├── LoginPage.vue
│   ├── WorkbenchPage.vue
│   ├── TestCasePage.vue
│   ├── ai-script/       #   测试智编
│   │   ├── AiScriptTaskList.vue
│   │   └── AiScriptTaskDetail.vue
│   └── system/          #   系统管理
└── styles/              # CSS 设计令牌 + 布局 + 动画
```

---

## 页面路由

| 路径 | 说明 |
|------|------|
| `/login` | 登录 |
| `/` | 仪表盘 |
| `/testcases` | 用例管理 |
| `/ai-script` | 测试智编 — 任务列表 |
| `/ai-script/:taskId` | 测试智编 — 任务详情 |
| `/system/users` | 用户管理 |
| `/system/roles` | 角色管理 |
| `/system/projects` | 项目管理 |
