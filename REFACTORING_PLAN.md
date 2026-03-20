# Aisight Frontend — 重构方案

> 基于 `ARCHITECTURE.md` 工业级标准，将单体 SPA 重构为工业级模块化工程  
> **Phase 0-7 ✅ 已完成 · Phase 8-12 📋 待执行**

---

## 总览

### 第一轮：架构拆分（已完成）

| 阶段 | 主题 | 状态 | 核心产出 |
|------|------|------|---------|
| Phase 0 | 工程化基础设施 | ✅ 已完成 | ESLint + Prettier + Husky + commitlint + EditorConfig |
| Phase 1 | API 层拆分 | ✅ 已完成 | `api/` 目录 9 个模块 |
| Phase 2 | 状态管理重构 | ✅ 已完成 | `stores/` 4 个 Pinia Store |
| Phase 3 | 样式系统拆分 | ✅ 已完成 | `styles/` 4 个 CSS 模块 |
| Phase 4 | 组件提取 | ✅ 已完成 | `components/` 9 个通用组件 |
| Phase 5 | 页面拆分 + 路由 | ✅ 已完成 | `views/` 7 个页面 + Vue Router |
| Phase 6 | Composables 抽取 | ✅ 已完成 | `composables/` 4 个逻辑模块 |
| Phase 7 | 测试 + 验证 | ✅ 已完成 | Vitest 22/22 通过 + vue-tsc 零错误 |

### 第二轮：工业级强化（待执行）

| 阶段 | 主题 | 预估工时 | 风险 | 核心产出 |
|------|------|---------|------|---------| 
| Phase 8 | 代码质量强化 | 1.5 天 | 🟡 中 | JSDoc 补全 + `utils/` 抽取 + TestCasePage 拆分 + 全局错误边界 |
| Phase 9 | 样式工业化 | 1 天 | 🟢 低 | Scoped CSS 迁移 + Element Plus 按需导入 + Bundle 瘦身 |
| Phase 10 | 测试覆盖率提升 | 2 天 | 🟡 中 | Store 单测 + 组件集成测试 + 覆盖率 ≥ 80% |
| Phase 11 | 健壮性 + 可观测性 | 1 天 | 🟢 低 | 全局错误边界 + API 重试 + 日志分级 + 性能埋点 |
| Phase 12 | CI/CD + E2E | 1.5 天 | 🟡 中 | GitHub Actions 流水线 + Cypress E2E 核心流程 |
| **合计** | | **7 天** | | |

---

## Phase 0-7 执行回顾

<details>
<summary>点击展开已完成阶段详情</summary>

### Phase 0 — 工程化基础设施 ✅

| 产出文件 | 说明 |
|---------|------|
| `eslint.config.js` | ESLint Flat Config + Vue/TS 规则 |
| `.prettierrc` / `.prettierignore` | 无分号、单引号、100 字符行宽 |
| `.husky/pre-commit` | 运行 lint-staged |
| `.husky/commit-msg` | Conventional Commits 校验 |
| `commitlint.config.js` | `@commitlint/config-conventional` |
| `.editorconfig` | 统一编辑器配置 |

### Phase 1 — API 层拆分 ✅

```
src/api.ts (已删除) → src/api/
├── client.ts  ├── types.ts  ├── auth.ts
├── project.ts ├── testcase.ts ├── user.ts
├── module.ts  ├── attachment.ts └── xlsx.ts
```

### Phase 2 — 状态管理重构 ✅

4 个 Setup Store：`auth.ts` / `project.ts` / `testcase.ts` / `user.ts`

### Phase 3 — 样式系统拆分 ✅

```
src/style.css (已删除) → src/styles/
├── variables.css  ├── base.css  ├── layout.css  └── animations.css
```

### Phase 4 — 组件提取 ✅

9 个组件：`AppHeader` / `AppSidebar` / `StatusBadge` / `LevelBadge` / `EmptyState` / `RichTextEditor` / `FileUploader` / `HoloOrb` / `BreadcrumbBar`

### Phase 5 — 页面拆分 + Vue Router ✅

7 个页面 + 路由守卫 + 懒加载。App.vue 重写为 ~200 行壳组件。

### Phase 6 — Composables 抽取 ✅

4 个 Composable：`useTable` / `useCrud` / `useParticles` / `useLocalStorage`

### Phase 7 — 测试 + 验证 ✅

22/22 测试通过 + vue-tsc 零错误 + vite build 成功

</details>

---

## Phase 8 — 代码质量强化（1.5 天）

**目标**：达到 `ARCHITECTURE.md` 第 19/20 章规定的组件设计原则和编码规范。

### 8.1 TestCasePage 拆分

**当前问题**：`TestCasePage.vue` 超过 600 行，违反 ARCHITECTURE.md 组件行数上限（script ≤ 200, template ≤ 100）。

| # | 任务 | 说明 |
|---|------|------|
| 8.1.1 | 提取 `ModuleTree.vue` | 左侧目录树面板（~120 行 script + ~50 行 template） |
| 8.1.2 | 提取 `CaseTable.vue` | 右侧数据表格 + 筛选工具栏（~150 行 script + ~80 行 template） |
| 8.1.3 | 提取 `CaseEditor.vue` | 用例编辑抽屉 + 步骤拖拽（~100 行 script + ~60 行 template） |
| 8.1.4 | 精简 `TestCasePage.vue` | 仅保留组合层，≤ 80 行 |

**拆分后结构**：
```
src/views/testcase/
├── TestCasePage.vue     # 主页面壳（≤ 80 行）
├── ModuleTree.vue       # 目录树组件
├── CaseTable.vue        # 用例表格组件
└── CaseEditor.vue       # 编辑器抽屉组件
```

### 8.2 Utils 工具层

**当前问题**：日期格式化、表单校验逻辑散落在各页面，无 `utils/` 目录。

| # | 任务 | 说明 |
|---|------|------|
| 8.2.1 | 创建 `utils/format.ts` | 提取 `formatTime()` + `formatFileSize()` + `formatDuration()` |
| 8.2.2 | 创建 `utils/validators.ts` | 提取 `isValidName()` / `isValidEmail()` / `isValidPhone()` + 统一错误消息 |
| 8.2.3 | 创建 `utils/avatar.ts` | 提取 `resolveAvatarUrl()` 被 AppHeader + UserManagement 共用 |
| 8.2.4 | 各页面替换内联逻辑 | 引用 utils 减少代码重复 |

### 8.3 JSDoc 补全

**当前问题**：API 函数、Store、Composable 均无 JSDoc 注释，不符合 ARCHITECTURE.md §20.9。

| # | 范围 | 标准 |
|---|------|------|
| 8.3.1 | `api/*.ts` 所有导出函数 | 描述 + `@param` + `@returns` + `@throws` |
| 8.3.2 | `stores/*.ts` 所有 Store | 描述 + state/getter/action 说明 |
| 8.3.3 | `composables/*.ts` | 描述 + `@param` + `@returns` + 使用示例 |
| 8.3.4 | `utils/*.ts` | 描述 + `@param` + `@returns` |
| 8.3.5 | **所有函数体增加逻辑注释** | 条件分支/循环/错误处理/数据转换/业务规则/正则/魔法数字必须有中文注释（参见 ARCHITECTURE.md §20.9.2） |

### 8.4 App.vue 精简至壳组件

**当前问题**：App.vue 仍有 ~200 行（含导航逻辑/Profile 对话框），目标 ≤ 50 行。

| # | 任务 | 说明 |
|---|------|------|
| 8.4.1 | 提取 `ProfileDialog.vue` | 个人资料对话框独立为组件 |
| 8.4.2 | 导航逻辑移入 Store | `topMenu`/`activeMenu` 路由同步逻辑移入 `useProjectStore` |
| 8.4.3 | App.vue 精简 | 仅保留 `<RouterView>` + 布局壳 + Store/Router 初始化 |

### 验证标准

- [ ] `TestCasePage.vue` 拆为 4 个文件，主文件 ≤ 80 行
- [ ] `utils/` 目录包含 3 个工具模块
- [ ] 所有导出函数有 JSDoc（ESLint jsdoc 插件检查）
- [ ] **所有函数体内关键逻辑有中文注释**（条件分支、错误处理、数据转换等）
- [ ] App.vue ≤ 50 行
- [ ] `vue-tsc --noEmit` 零错误
- [ ] 所有现有测试通过

---

## Phase 9 — 样式工业化（1 天）

**目标**：达到 `ARCHITECTURE.md` §9 性能策略和 §16 设计规范要求。

### 9.1 Scoped CSS 迁移

**当前问题**：所有组件样式在全局 `layout.css`，违反 ARCHITECTURE.md 组件样式隔离原则。

| # | 任务 | 说明 |
|---|------|------|
| 9.1.1 | `AppHeader.vue` | 迁移 `.header-*` 样式 → `<style scoped>` |
| 9.1.2 | `AppSidebar.vue` | 迁移 `.sidebar-*` / `.nav-*` 样式 |
| 9.1.3 | `StatusBadge.vue` / `LevelBadge.vue` | 迁移 badge 样式 |
| 9.1.4 | `LoginPage.vue` | 迁移 `.login-*` 样式（从 `base.css`） |
| 9.1.5 | 各页面组件 | 迁移对应 `.module-card` / `.tree-*` / `.case-*` 等样式 |
| 9.1.6 | 精简全局 CSS | `layout.css` 仅保留真正全局的布局样式 |

### 9.2 Element Plus 按需导入

**当前问题**：`main.ts` 中 `app.use(ElementPlus)` 是全量导入，Bundle 体积大。

| # | 任务 | 说明 |
|---|------|------|
| 9.2.1 | 安装 `unplugin-vue-components` + `unplugin-auto-import` | 自动按需导入 |
| 9.2.2 | 配置 `vite.config.ts` | Element Plus resolver |
| 9.2.3 | 移除 `main.ts` 中全量导入 | 仅保留样式 + locale 配置 |
| 9.2.4 | 验证 Bundle 体积 | 目标: initial JS < 200KB gzipped |

### 9.3 CSS 变量规范治理

| # | 任务 | 说明 |
|---|------|------|
| 9.3.1 | 全局搜索硬编码色值 | 替换为 CSS 变量引用 |
| 9.3.2 | 补充缺失的 Design Token | 间距(spacing-xs/sm/md/lg)、字体大小级别 |
| 9.3.3 | 暗色主题预留 | `variables.css` 增加 `[data-theme="dark"]` 变量集 |

### 验证标准

- [ ] 每个 Vue 组件有 `<style scoped>`
- [ ] `layout.css` 减少 50%+ 行数
- [ ] `vite build` 后 initial chunk < 200KB gzipped
- [ ] 全局无硬编码色值（除 `variables.css`）

---

## Phase 10 — 测试覆盖率提升（2 天）

**目标**：达到 `ARCHITECTURE.md` §12 测试金字塔标准。

### 10.1 Store 单元测试

| # | 测试文件 | 覆盖内容 | 目标 Case 数 |
|---|---------|---------|-------------|
| 10.1.1 | `stores/auth.test.ts` | login/logout/token 持久化/头像解析 | 8-10 |
| 10.1.2 | `stores/project.test.ts` | 项目加载/切换/导航持久化 | 6-8 |
| 10.1.3 | `stores/user.test.ts` | 用户 CRUD/角色 CRUD | 8-10 |
| 10.1.4 | `stores/testcase.test.ts` | 扩充：CRUD/分页/筛选/模块树构建 | 15-20 |

### 10.2 API 层测试

| # | 测试文件 | 覆盖内容 | 目标 Case 数 |
|---|---------|---------|-------------|
| 10.2.1 | `api/client.test.ts` | 请求拦截器(token注入) + 响应拦截器(解包/分页) + 401 处理 | 8-10 |
| 10.2.2 | `api/auth.test.ts` | loginByEmail 成功/失败 | 3-4 |

### 10.3 组件集成测试

| # | 测试文件 | 覆盖内容 | 目标 Case 数 |
|---|---------|---------|-------------|
| 10.3.1 | `components/AppHeader.test.ts` | 项目切换/用户菜单/登出 | 5-6 |
| 10.3.2 | `components/AppSidebar.test.ts` | 菜单切换/激活态 | 4-5 |
| 10.3.3 | `components/EmptyState.test.ts` | 渲染/按钮事件 | 3 |

### 10.4 Composable 测试扩充

| # | 测试文件 | 新增覆盖 | 目标 Case 数 |
|---|---------|---------|-------------|
| 10.4.1 | `composables/useTable.test.ts` | 分页/排序/加载/错误 | 8-10 |
| 10.4.2 | `composables/useParticles.test.ts` | 初始化/销毁/canvas | 3-4 |

### 验证标准

- [ ] 测试总数 ≥ 80
- [ ] `vitest --coverage` 行覆盖率 ≥ 80%（api + stores + composables + utils）
- [ ] 组件测试覆盖率 ≥ 60%

---

## Phase 11 — 健壮性 + 可观测性（1 天）

**目标**：达到 `ARCHITECTURE.md` §7 错误处理和 §11 可观测性标准。

### 11.1 全局错误边界

| # | 任务 | 说明 |
|---|------|------|
| 11.1.1 | `main.ts` 添加 `app.config.errorHandler` | 捕获 Vue 运行时异常，上报+降级 UI |
| 11.1.2 | 创建 `ErrorBoundary.vue` 组件 | 渲染异常时展示友好的降级 UI |
| 11.1.3 | `App.vue` 用 `<ErrorBoundary>` 包裹 `<RouterView>` | |

### 11.2 API 错误分级处理

| # | 任务 | 说明 |
|---|------|------|
| 11.2.1 | 完善 `client.ts` 响应拦截器 | 按 401/403/404/422/500 分类处理 |
| 11.2.2 | 网络异常重试 | 指数退避重试（最多 3 次），超时 toast 提示 |
| 11.2.3 | 创建 `utils/errorHandler.ts` | 统一 `handleApiError(e)` 函数 |

### 11.3 日志 + 埋点

| # | 任务 | 说明 |
|---|------|------|
| 11.3.1 | 创建 `utils/logger.ts` | 日志分级（ERROR/WARN/INFO/DEBUG），生产环境过滤 DEBUG |
| 11.3.2 | Router 路由守卫添加 `page_view` 埋点 | 记录页面名/用户ID/时间戳 |
| 11.3.3 | API 拦截器添加 `api_slow` 埋点 | 请求耗时 > 3s 时记录 |
| 11.3.4 | 性能采集 | `onMounted` 采集 FCP/LCP 上报 |

### 11.4 无障碍基础

| # | 任务 | 说明 |
|---|------|------|
| 11.4.1 | 语义化 HTML | `<nav>` / `<main>` / `<aside>` / `<header>` 替换通用 `<div>` |
| 11.4.2 | ARIA 标签 | 图标按钮添加 `aria-label`，展开/折叠添加 `aria-expanded` |
| 11.4.3 | 键盘导航 | 所有交互元素可 Tab 到达，Esc 关闭对话框 |
| 11.4.4 | `prefers-reduced-motion` | `animations.css` 添加动画禁用媒体查询 |

### 验证标准

- [ ] Vue 运行时错误被全局捕获，不崩溃
- [ ] API 401/403/404/500 各状态码有对应用户提示
- [ ] 网络断开时 3 次重试 + 友好提示
- [ ] 路由切换有 `page_view` 日志
- [ ] 所有图标按钮有 `aria-label`

---

## Phase 12 — CI/CD + E2E 测试（1.5 天）

**目标**：达到 `ARCHITECTURE.md` §12.1 测试金字塔 E2E 层和 §18 CI/CD 要求。

### 12.1 GitHub Actions CI

| # | 任务 | 说明 |
|---|------|------|
| 12.1.1 | 创建 `.github/workflows/ci.yml` | Push/PR 触发 |
| 12.1.2 | Job: Lint | `eslint .` + `prettier --check .` |
| 12.1.3 | Job: Type Check | `vue-tsc --noEmit` |
| 12.1.4 | Job: Unit Tests | `vitest run --coverage` |
| 12.1.5 | Job: Build | `vite build` + Bundle Size Check |
| 12.1.6 | Job: License Check | `npx license-checker --failOn "GPL;AGPL"` |

**CI 流水线**：

```yaml
name: CI
on: [push, pull_request]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm run test -- --coverage
      - run: npm run build
      - name: Bundle Size
        run: |
          gzip -9 -c dist/assets/*.js | wc -c  # < 200KB
```

### 12.2 Cypress E2E 测试

| # | 测试场景 | 覆盖流程 |
|---|---------|---------|
| 12.2.1 | 登录流程 | 输入凭证 → 登录成功 → 跳转工作台 |
| 12.2.2 | 登录失败 | 错误凭证 → 错误提示 |
| 12.2.3 | 用例 CRUD | 新建 → 编辑 → 搜索 → 删除 |
| 12.2.4 | 用户管理 | 新建用户 → 编辑 → 角色分配 |
| 12.2.5 | 导航 | 侧栏切换 → 各页面正确渲染 |
| 12.2.6 | Token 过期 | 模拟 401 → 自动跳转登录 |

### 验证标准

- [ ] CI 流水线全部 Pass
- [ ] E2E 6 个核心场景全部通过
- [ ] PR 合入需 CI 全绿

---

## 执行顺序与依赖关系

```
Phase 0-7 (已完成)
    ↓
Phase 8 (代码质量强化)     ← 核心先决
    ↓
Phase 9 (样式工业化)        ← 与 Phase 8 可并行
    ↓
Phase 10 (测试覆盖率)       ← 依赖 Phase 8 拆分结果
    ↓
Phase 11 (健壮性+可观测)    ← 可独立进行
    ↓
Phase 12 (CI/CD + E2E)     ← 最后一步，所有代码稳定后
```

> Phase 8 和 9 可并行。Phase 10 建议在 Phase 8 拆分完成后进行（新子组件需要新测试）。Phase 11 和 12 可独立进行。

---

## 当前 Gap 分析（对照 ARCHITECTURE.md）

| ARCHITECTURE.md 章节 | 要求 | 当前状态 | 覆盖阶段 |
|---------------------|------|---------|---------|
| §2 目录结构 | `utils/` 目录 | ❌ 不存在 | Phase 8 |
| §7 错误处理 | 全局错误边界 + 分类处理 | ❌ 仅基本 catch | Phase 11 |
| §8.1 Token 管理 | 401 自动刷新 | ⚠️ 仅清除跳转 | Phase 11 |
| §9.2 性能策略 | EP 按需导入 | ❌ 全量导入 | Phase 9 |
| §9.3 Bundle 预算 | < 200KB gzipped | ⚠️ 未测量 | Phase 9 |
| §10 无障碍 | WCAG 2.1 AA | ❌ 未实现 | Phase 11 |
| §11 可观测性 | 日志分级 + 埋点 | ❌ 仅 console | Phase 11 |
| §12 测试策略 | 单测 ≥ 80% | ⚠️ 仅 22 cases | Phase 10 |
| §12 E2E | Cypress 核心流程 | ❌ 未实现 | Phase 12 |
| §18 CI/CD | GitHub Actions | ❌ 未配置 | Phase 12 |
| §19 组件设计 | script ≤ 200 行 | ❌ TestCasePage 600+ | Phase 8 |
| §20.9 JSDoc | 所有导出函数 | ❌ 无注释 | Phase 8 |
| §19 Code Review | App.vue ≤ 50 行 | ⚠️ ~200 行 | Phase 8 |

---

## 最终项目结构（目标）

```
src/
├── main.ts                          # 入口（≤ 15 行）
├── App.vue                          # 壳组件（布局 + 导航 + 个人中心）
├── router/index.ts                  # 路由 + 守卫
├── stores/                          # 4 个 Pinia Store
├── api/                             # 9 个领域 API 模块
├── composables/                     # 4 个 Composable
├── utils/                           # 纯工具函数 [NEW]
│   ├── format.ts                    # 日期/数字格式化
│   ├── validators.ts                # 表单验证规则
│   ├── avatar.ts                    # 头像 URL 解析
│   ├── logger.ts                    # 日志分级 [NEW]
│   └── errorHandler.ts             # 统一错误处理 [NEW]
├── views/
│   ├── LoginPage.vue
│   ├── WorkbenchPage.vue
│   ├── ComingSoonPage.vue
│   ├── testcase/                    # 拆分后 [CHANGED]
│   │   ├── TestCasePage.vue         # ≤ 80 行
│   │   ├── ModuleTree.vue
│   │   ├── CaseTable.vue
│   │   └── CaseEditor.vue
│   └── system/
│       ├── UserManagement.vue
│       ├── RoleManagement.vue
│       └── ProjectManagement.vue
├── components/
│   ├── AppHeader.vue
│   ├── AppSidebar.vue
│   ├── StatusBadge.vue
│   ├── LevelBadge.vue
│   ├── EmptyState.vue
│   ├── ErrorBoundary.vue            # [NEW]
│   └── ProfileDialog.vue           # [NEW]
└── styles/
    ├── variables.css                # + 暗色主题变量
    ├── base.css                     # 精简后
    ├── layout.css                   # 精简后（-50%）
    └── animations.css               # + prefers-reduced-motion
```
