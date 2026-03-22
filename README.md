# Aisight Frontend

> 工业级测试管理平台前端 · Vue 3 + TypeScript + Vite · 暗色主题

---

## 技术栈

| 分类 | 技术 | 用途 |
|------|------|------|
| 框架 | Vue 3 (Composition API) | 响应式 UI |
| 构建 | Vite 7 | 开发服务器 + HMR + 打包 |
| 语言 | TypeScript (strict) | 静态类型 |
| 状态管理 | Pinia | 领域状态存储 |
| UI 组件库 | Element Plus | 企业级组件 |
| HTTP | Axios | API 请求 + 拦截器 |
| 路由 | Vue Router 4 | SPA 路由 |
| 图标 | lucide-vue-next | 侧边栏 / 页面图标 |

---

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器 (localhost:5173)
npm run dev

# 生产打包
npm run build

# 类型检查
npx vue-tsc --noEmit
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_API_BASE_URL` | 后端 API 地址 | `http://localhost:8080/api/v1` |

---

## 项目结构

```
src/
├── main.ts                          # 入口
├── App.vue                          # 根壳（布局 + 导航 + 个人中心）
├── router/index.ts                  # 路由配置 + 守卫
├── api/                             # API 层（按领域拆分）
│   ├── client.ts                    # Axios 实例 + 拦截器
│   ├── types.ts                     # 共享类型 (User, Project, TestCase …)
│   ├── auth.ts                      # 登录
│   ├── project.ts                   # 项目 CRUD
│   ├── testcase.ts                  # 用例 CRUD + 批量操作
│   ├── user.ts                      # 用户/角色 CRUD + 个人资料
│   ├── module.ts                    # 模块目录树 CRUD
│   ├── attachment.ts                # 附件上传/下载
│   └── xlsx.ts                      # Excel 导入/导出
├── stores/                          # Pinia 状态管理
│   ├── auth.ts                      # 认证 + 用户信息
│   ├── project.ts                   # 项目列表
│   ├── testcase.ts                  # 用例列表
│   └── user.ts                      # 用户/角色管理
├── composables/                     # 可复用逻辑
│   ├── useTable.ts                  # 表格分页/排序
│   ├── useCrud.ts                   # CRUD 通用逻辑
│   ├── useParticles.ts              # 粒子动画
│   └── useLocalStorage.ts           # localStorage 封装
├── components/                      # 通用 UI 组件
│   ├── AppHeader.vue                # 顶部导航栏（品牌LOGO + 侧栏展开 + 通知 + 用户信息）
│   ├── AppSidebar.vue               # 侧边菜单（仪表盘/用例/执行/缺陷/分析 + 系统管理 + 折叠按钮）
│   ├── StatusBadge.vue              # 状态标签
│   ├── LevelBadge.vue               # 优先级标签
│   ├── EmptyState.vue               # 空态占位
│   ├── RichTextEditor.vue           # 富文本编辑器
│   ├── FileUploader.vue             # 文件上传组件
│   ├── HoloOrb.vue                  # 登录页全息球动画
│   └── BreadcrumbBar.vue            # 面包屑导航
├── views/                           # 页面
│   ├── LoginPage.vue                # 登录页
│   ├── WorkbenchPage.vue            # 仪表盘
│   ├── TestCasePage.vue             # 用例管理（项目切换器 + 目录树 + 表格 + 编辑抽屉）
│   ├── ComingSoonPage.vue           # 占位页
│   └── system/                      # 系统管理
│       ├── UserManagement.vue       # 用户管理
│       ├── RoleManagement.vue       # 角色管理
│       └── ProjectManagement.vue    # 项目管理
└── styles/                          # 样式系统
    ├── variables.css                # CSS 设计令牌
    ├── base.css                     # 全局基础样式
    ├── layout.css                   # 布局 + 组件样式
    └── animations.css               # 动画关键帧
```

---

## 页面路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/login` | LoginPage | 登录 |
| `/` | WorkbenchPage | 仪表盘 |
| `/testcases` | TestCasePage | 用例管理 |
| `/system/users` | UserManagement | 用户管理 |
| `/system/roles` | RoleManagement | 角色管理 |
| `/system/projects` | ProjectManagement | 项目管理 |

---

## 设计风格

- **暗色主题**：深色背景 (#0a0e17) + 高对比文本
- **品牌色**：紫色系 (#7c3aed / #a78bfa)
- **字体**：Inter（UI）+ JetBrains Mono（代码）+ Noto Sans SC（中文）
- **布局**：顶部导航 + 左侧菜单（可折叠）+ 内容区三栏布局
- **品牌LOGO**：科幻电子眼风格图标（`/images/logo.png`）
- **侧栏折叠**：完全隐藏式折叠，Header 显示展开按钮
- **项目切换**：位于用例管理页左侧面板顶部，带 Atom 图标
