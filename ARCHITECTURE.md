# Aisight Frontend — 系统架构文档

> 版本 2.2 · 2026-03-23 · 工业级测试管理平台前端

---

## 1. 技术栈

| 分类 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 框架 | Vue 3 (Composition API) | 3.5.x | 响应式 UI 框架 |
| 构建 | Vite | 7.3.x | 开发服务器 + HMR + 生产打包 |
| 语言 | TypeScript (strict) | 5.9.x | 静态类型安全 |
| 状态管理 | Pinia | 3.0.x | 领域状态存储 |
| UI 组件库 | Element Plus | 2.13.x | 企业级 Vue 3 组件（按需导入） |
| HTTP 客户端 | Axios | 1.13.x | API 请求 + 拦截器 |
| 路由 | Vue Router | 4.x | SPA 路由管理 |
| 字体 | Inter + JetBrains Mono + Noto Sans SC | CDN | UI 文字 + 等宽代码 + 中文字体 |
| 图标 | lucide-vue-next | latest | 侧边栏 / 页面图标 |

---

## 2. 目录结构

```
src/
├── main.ts                          # 入口
├── App.vue                          # 根壳组件（≤ 50 行）
├── router/
│   └── index.ts                     # Vue Router 路由配置
├── stores/                          # Pinia 状态管理
│   ├── auth.ts                      # useAuthStore
│   ├── project.ts                   # useProjectStore
│   ├── testcase.ts                  # useTestCaseStore
│   └── user.ts                      # useUserStore
├── api/                             # API 层（按领域拆分）
│   ├── client.ts                    # Axios 实例 + 拦截器
│   ├── auth.ts                      # 登录/登出 API
│   ├── project.ts                   # 项目 CRUD
│   ├── testcase.ts                  # 用例 CRUD + 批量操作
│   ├── user.ts                      # 用户/角色 CRUD + 个人资料
│   ├── module.ts                    # 模块目录树 CRUD
│   ├── attachment.ts                # 附件上传/下载
│   ├── xlsx.ts                      # Excel 导入/导出
│   └── types.ts                     # 共享类型定义
├── composables/                     # 可复用逻辑（Composition API）
│   ├── useTable.ts                  # 表格通用逻辑（分页/排序/筛选）
│   ├── useCrud.ts                   # CRUD 通用逻辑
│   ├── useParticles.ts              # 粒子动画逻辑
│   └── useLocalStorage.ts           # localStorage 封装
├── views/                           # 页面级组件
│   ├── LoginPage.vue                # 登录页
│   ├── WorkbenchPage.vue            # 工作台仪表盘
│   ├── TestCasePage.vue             # 用例管理（项目切换器 + 目录树 + 表格 + 编辑抽屉）
│   ├── ComingSoonPage.vue           # 占位页
│   └── system/
│       ├── UserManagement.vue       # 用户管理
│       ├── RoleManagement.vue       # 角色管理
│       └── ProjectManagement.vue    # 项目管理
├── components/                      # 通用 UI 组件
│   ├── AppHeader.vue                # 顶部导航栏（品牌LOGO + 侧栏展开 + 通知 + 用户信息）
│   ├── AppSidebar.vue               # 侧边菜单栏（导航项 + 系统管理 + 折叠按钮，底部固定）
│   ├── StatusBadge.vue              # 状态标签
│   ├── LevelBadge.vue               # 优先级标签
│   ├── EmptyState.vue               # 空态占位
│   ├── RichTextEditor.vue           # 富文本编辑器
│   ├── FileUploader.vue             # 文件上传组件
│   ├── HoloOrb.vue                  # 登录页全息球动画
│   └── BreadcrumbBar.vue            # 面包屑导航
├── styles/                          # 样式系统
│   ├── variables.css                # CSS 设计令牌
│   ├── base.css                     # 全局基础样式
│   ├── layout.css                   # 布局样式
│   └── animations.css               # 动画关键帧
└── utils/                           # 纯工具函数（待创建）
    ├── format.ts                    # 日期/数字格式化
    └── validators.ts                # 表单验证规则
```

---

## 3. 架构分层

```
┌─────────────────────────────────────────────────────────────┐
│                        浏览器                                 │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐     │
│  │  Views (页面组件)                                     │     │
│  │  LoginPage / WorkbenchPage / TestCasePage / System   │     │
│  └──────────────────┬──────────────────────────────────┘     │
│                     │ 引用                                    │
│  ┌──────────────────▼──────────────────────────────────┐     │
│  │  Components (通用组件)                                │     │
│  │  AppHeader / AppSidebar / StatusBadge / EmptyState   │     │
│  └──────────────────┬──────────────────────────────────┘     │
│                     │ 调用                                    │
│  ┌────────┬─────────▼────────┬─────────────────────────┐     │
│  │ Stores │   Composables    │     Utils               │     │
│  │ Pinia  │  useTable/useCrud│  format/validators      │     │
│  └───┬────┴────────┬─────────┴─────────────────────────┘     │
│      │             │                                         │
│  ┌───▼─────────────▼───────────────────────────────────┐     │
│  │  API Layer (api/)                                    │     │
│  │  client.ts → Request Interceptor → Axios → Response  │     │
│  └──────────────────┬──────────────────────────────────┘     │
├─────────────────────┼───────────────────────────────────────┤
│                     ▼                                        │
│              Backend REST API                                │
│              /api/v1                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 核心模块

### 4.1 应用入口 (`main.ts`)

```typescript
createApp(App)
  .use(createPinia())                         // 状态管理
  .use(router)                                // 路由
  .use(ElementPlus, { locale: zhCn })         // UI 组件库（中文国际化）
  .mount('#app')
```

### 4.2 API 客户端层 (`api/`)

**设计模式**：领域拆分 + 集中式拦截器

| 能力 | 实现 |
|------|------|
| 基础配置 | `baseURL` 通过环境变量 `VITE_API_BASE_URL` 配置 |
| 认证注入 | Request 拦截器自动添加 `Authorization: Bearer <token>` |
| Token 刷新 | 401 拦截 → Refresh Token 轮转 → 重放原请求 |
| 响应解包 | Response 拦截器自动解析 `{code, data}` 结构 |
| 分页标准化 | 统一为 `{items, total, page, pageSize}` |
| 错误处理 | 全局拦截分类处理（见第 7 章） |

**接口清单**：

| 模块 | 接口 | 方法 |
|------|------|------|
| 认证 | `loginByEmail` | POST `/auth/login` |
| 项目 | `listProjects` / `createProject` | GET / POST `/projects` |
| 用例 | `listTestCases` / `createTestCase` / `updateTestCase` / `deleteTestCase` | CRUD `/projects/:id/testcases` |
| 用例批量 | `batchDeleteTestCases` / `batchUpdateLevel` / `batchMoveTestCases` / `cloneTestCase` | POST `/projects/:id/testcases/batch-*` |
| 用户 | `listUsers` / `createUser` / `updateUser` / `deleteUserById` | CRUD `/users` |
| 角色 | `listRoles` / `createRole` / `updateRoleById` / `deleteRoleById` | CRUD `/roles` |
| 个人 | `getMyProfile` / `updateMyProfile` / `uploadMyAvatar` | GET/PUT/POST `/users/me/*` |
| 模块 | `listModules` / `createModule` / `renameModule` / `moveModule` / `deleteModule` | CRUD `/projects/:id/modules` |
| 附件 | `uploadAttachment` / `listAttachments` / `deleteAttachment` | CRUD `/projects/:id/testcases/:id/attachments` |
| 导入导出 | `exportTestCases` / `importTestCases` | GET/POST `/projects/:id/testcases/export|import` |

### 4.3 状态管理 (`stores/`)

**设计原则**：按业务领域拆分 Store，每个 Store 管理一类资源的完整生命周期。

```typescript
// stores/auth.ts
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(null)
  const user = ref<User | null>(null)
  const isAuthenticated = computed(() => !!token.value)

  async function login(email: string, password: string) { /* ... */ }
  function logout() { /* ... */ }

  return { token, user, isAuthenticated, login, logout }
})
```

| Store | 职责 | 持久化 |
|-------|------|--------|
| `useAuthStore` | 认证状态、Token、用户信息 | localStorage |
| `useProjectStore` | 项目列表、当前项目 | localStorage（当前项目 ID） |
| `useTestCaseStore` | 用例列表、筛选条件、分页 | 无 |
| `useUserStore` | 用户/角色列表 | 无 |

### 4.4 Composables (`composables/`)

```typescript
// composables/useTable.ts — 表格通用逻辑
export function useTable<T>(fetchFn: (params: PageParams) => Promise<PageResult<T>>) {
  const rows = ref<T[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(20)
  const loading = ref(false)

  async function loadData() {
    loading.value = true
    try {
      const result = await fetchFn({ page: page.value, pageSize: pageSize.value })
      rows.value = result.items
      total.value = result.total
    } finally {
      loading.value = false
    }
  }

  return { rows, total, page, pageSize, loading, loadData }
}
```

### 4.5 设计系统 (`styles/`)

**架构**：CSS 变量驱动的模块化主题

| 文件 | 内容 |
|------|------|
| `variables.css` | 品牌色（#171717）、灰阶、圆角、阴影、过渡时长 |
| `base.css` | CSS Reset、全局排版、滚动条、Element Plus 覆盖 |
| `layout.css` | 页面网格、Header、Sidebar、Content 区域 |
| `animations.css` | fadeIn / slideIn / rainbow-border 关键帧 |

---

## 5. 数据流

```
用户操作 → Vue 事件处理 → Store Action / Composable
                              ↓
                         api/ 函数调用
                              ↓
                         Axios Request（拦截器注入 Token）
                              ↓
                         Backend REST API
                              ↓
                         Axios Response（拦截器解包）
                              ↓
                         Store State / ref 更新
                              ↓
                         模板自动重渲染（响应式）
```

**认证流程**：

```
登录 → loginByEmail()
     → Store 保存 token + user
     → localStorage 持久化
     → Router 跳转主页
     → 各 Store 初始化数据

登出 → Store 清除状态
     → localStorage 清理
     → Router 跳转登录页
```

---

## 6. 与后端通信

| 项目 | 规范 |
|------|------|
| 协议 | HTTP REST |
| 基础路径 | `/api/v1` |
| 认证 | Bearer Token (Header: `Authorization`) |
| 响应格式 | `{ code: number, message: string, data: T }` |
| 分页格式 | `{ code, message, data: T[], total, page, page_size }` |
| 超时 | 12 秒 |

---

## 7. 错误处理

### 7.1 错误分类与处理

| 错误类型 | 触发条件 | 处理方式 | 用户反馈 |
|---------|---------|---------|---------|
| 网络错误 | 无网络 / 超时 | 指数退避重试（最多 3 次） | Toast: "网络异常，请检查连接" |
| 401 未授权 | Token 过期 | 刷新 Token → 重放请求，失败则跳转登录 | Toast: "登录已过期" |
| 403 无权限 | 角色不足 | 阻止操作 | Toast: "暂无权限" |
| 404 未找到 | 资源已删除 | 刷新列表 | Toast: "资源不存在" |
| 422 参数错误 | 表单验证失败 | 高亮错误字段 | 表单内联提示 |
| 500 服务端错误 | 后端异常 | 记录日志 | Toast: "服务异常，请稍后重试" |
| Vue 运行时错误 | 组件渲染异常 | 错误边界捕获 | 降级 UI |

### 7.2 全局错误边界

```typescript
// main.ts
app.config.errorHandler = (err, instance, info) => {
  console.error(`[Vue Error] ${info}:`, err)
  // → 上报至 Sentry
}
```

---

## 8. 安全架构

### 8.1 认证与令牌管理

| 安全项 | 要求 |
|--------|------|
| Token 存储 | HttpOnly Cookie（推荐） |
| Token 刷新 | Refresh Token 轮转 + 静默续期 |
| Token 过期处理 | 401 拦截 → 自动刷新或跳转登录 |
| 登出清理 | 清空本地状态 + 通知后端失效 Token |

### 8.2 XSS 防护

| 层级 | 措施 |
|------|------|
| 框架层 | Vue 3 模板自动 HTML 转义 |
| 编码规范 | 禁止使用 `v-html` 渲染用户输入（ESLint `vue/no-v-html`） |
| CSP 头 | `Content-Security-Policy` 限制脚本来源 |
| 输入消毒 | 富文本使用 DOMPurify 过滤 |

**CSP 策略**：

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: blob:;
  connect-src 'self' https://api.testpilot.com;
```

### 8.3 敏感数据处理

| 数据 | 处理方式 |
|------|---------|
| 密码 | 仅登录时传输，不在前端存储或日志中出现 |
| JWT Token | HttpOnly Cookie 存储 |
| 用户信息 | 内存 Store 中，登出时清除 |
| API Key | 仅通过环境变量注入，不硬编码 |

---

## 9. 性能策略

### 9.1 Web Vitals 目标

| 指标 | 全称 | 目标值 |
|------|------|--------|
| FCP | First Contentful Paint | < 1.5s |
| LCP | Largest Contentful Paint | < 2.5s |
| FID | First Input Delay | < 100ms |
| CLS | Cumulative Layout Shift | < 0.1 |
| TTI | Time to Interactive | < 3.5s |

### 9.2 优化策略

| 策略 | 实现方式 |
|------|---------|
| 路由懒加载 | `() => import('./views/XxxPage.vue')` |
| 组件懒加载 | `defineAsyncComponent` 延迟加载非首屏组件 |
| Element Plus 按需导入 | `unplugin-vue-components` 自动按需 |
| 图片优化 | WebP 格式 + `loading="lazy"` |
| 资源预加载 | `<link rel="preload">` 关键字体 |
| API 缓存 | `staleWhileRevalidate` 策略 |
| Gzip/Brotli | Nginx 配置压缩 |

### 9.3 Bundle 体积预算

| 包 | 预算 |
|----|------|
| 入口 JS (initial) | < 200KB gzipped |
| 单页面 chunk | < 80KB gzipped |
| 总 CSS | < 50KB gzipped |
| 第三方依赖 | < 150KB gzipped |

---

## 10. 无障碍 (Accessibility)

**目标标准**：WCAG 2.1 AA 级合规

| 领域 | 规范 |
|------|------|
| 语义化 HTML | 使用 `<nav>`, `<main>`, `<aside>`, `<header>`, `<section>` |
| 键盘导航 | 所有交互元素可通过 Tab/Enter/Esc 操作 |
| ARIA 标签 | 自定义组件添加 `aria-label`, `role`, `aria-expanded` |
| 颜色对比度 | 文字与背景对比度 ≥ 4.5:1 (AA) |
| 焦点可见 | 所有可聚焦元素有明显的 focus 样式 |
| 屏幕阅读器 | 图标按钮提供文字替代，图片有 `alt` |
| 动画控制 | 支持 `prefers-reduced-motion` 媒体查询 |

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 11. 可观测性 (Observability)

### 11.1 监控体系

```
┌─────────────┐  错误/日志/指标  ┌──────────────┐  聚合分析  ┌───────────┐
│  Browser    │ ────────────→  │ 采集服务      │ ────────→ │ Dashboard │
│  Vue App    │                │ Sentry/自建   │           │ Grafana   │
└─────────────┘                └──────────────┘           └───────────┘
```

### 11.2 日志分级

| 级别 | 用途 | 生产环境 |
|------|------|---------|
| `ERROR` | 未捕获异常、API 500、渲染失败 | ✅ 上报 |
| `WARN` | API 4xx、降级处理、性能预警 | ✅ 上报 |
| `INFO` | 用户关键行为（登录/登出/CRUD） | ✅ 上报 |
| `DEBUG` | 状态变化、API 请求详情 | ❌ 仅开发 |

### 11.3 前端埋点事件

| 事件 | 触发时机 | 上报数据 |
|------|---------|---------|
| `page_view` | 路由切换 | 页面名、用户ID、时间戳 |
| `user_login` | 登录成功 | 用户ID、登录方式 |
| `api_error` | API 请求失败 | URL、状态码、耗时 |
| `api_slow` | API 耗时 > 3s | URL、耗时 |
| `js_error` | JS 运行时异常 | 错误栈、组件名 |
| `performance` | 页面加载完成 | FCP、LCP、TTI |

### 11.4 工具链

| 场景 | 方案 |
|------|------|
| 错误追踪 | Sentry |
| 性能监控 | Web Vitals + Grafana |
| 用户行为 | 自建埋点 + ClickHouse |

---

## 12. 测试策略

### 12.1 测试金字塔

```
          ┌─────────┐
          │  E2E    │  5-10 个关键流程
          │ Cypress │  登录→创建用例→执行→报告
         ┌┴─────────┴┐
         │  集成测试   │  20-30 个
         │ Vue Test   │  复杂交互、表单验证、状态管理
        ┌┴───────────┴┐
        │   单元测试    │  50-100 个
        │   Vitest     │  API拦截器、数据转换、计算属性
        └──────────────┘
```

### 12.2 覆盖率目标

| 层级 | 工具 | 目标覆盖率 |
|------|------|----------|
| 单元测试 | Vitest | ≥ 80% |
| 组件测试 | @vue/test-utils | ≥ 60% |
| E2E 测试 | Cypress | 核心流程 100% |
| 视觉回归 | Percy / Playwright | 关键页面 |

### 12.3 测试命名规范

```typescript
describe('apiClient 响应拦截器', () => {
  it('应自动解包 {code, data} 结构为 data', () => { ... })
  it('应识别分页响应并统一为 {items, total, page, pageSize}', () => { ... })
})
```

---

## 13. 国际化 (i18n)

**方案**：`vue-i18n`（Vue 官方）

```
src/locales/
├── zh-CN.json        # 中文（默认）
├── en-US.json        # 英文
└── index.ts          # i18n 实例
```

**Key 命名规范**：

```json
{
  "common.confirm": "确认",
  "login.title": "登录 Aisight",
  "testcase.create": "新建用例",
  "error.network": "网络异常，请检查连接"
}
```

---

## 14. 浏览器兼容性

| 浏览器 | 最低版本 | 支持级别 |
|--------|---------|---------|
| Chrome | 90+ | ✅ 完整支持 |
| Edge | 90+ | ✅ 完整支持 |
| Firefox | 88+ | ✅ 完整支持 |
| Safari | 15+ | ✅ 基础支持 |
| IE 11 | — | ❌ 不支持 |

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    target: ['es2020', 'chrome90', 'firefox88', 'safari15'],
  }
})
```

---

## 15. 依赖治理

### 15.1 升级策略

```
每周：检查 Patch 版本安全更新 (npm audit)
每月：评估 Minor 版本新特性
每季：评估 Major 版本升级 + 兼容性评估
升级后：全量测试 → Staging 验证 → 灰度发布
```

### 15.2 许可证合规

所有生产依赖必须为 MIT / Apache 2.0 / BSD 许可证。禁止引入 GPL/AGPL 依赖。

```bash
npx license-checker --failOn "GPL;AGPL"  # CI 自动检查
```

### 15.3 锁文件

`package-lock.json` 必须提交到 Git，确保团队成员和 CI 环境依赖版本一致。

---

## 16. 设计规范

### 品牌色

| 变量 | 色值 | 用途 |
|------|------|------|
| `--tp-primary` | `#171717` | 主色（按钮、激活态） |
| `--tp-primary-light` | `#404040` | 次级交互 |
| `--tp-primary-lighter` | `#F5F5F5` | Hover 背景 |
| `--tp-danger` | `#DC2626` | 危险/删除 |
| `--tp-success` | `#16A34A` | 成功/通过 |
| `--tp-warning` | `#D97706` | 警告/待定 |

### 20.9 注释规范

#### 20.9.1 JSDoc（函数级）

所有导出函数**必须**有 JSDoc 注释：

```typescript
/**
 * 获取项目下的测试用例列表（分页）
 *
 * @param projectId - 项目 ID
 * @param params - 查询参数（page, pageSize, keyword）
 * @returns 分页结果 { items, total, page, pageSize }
 * @throws {AxiosError} 401 - Token 过期
 */
export async function listTestCases(projectId: number, params: QueryParams) { ... }
```

| 文件类型 | 注释要求 |
|---------|---------|
| API 函数 | **必须**：描述 + 参数 + 返回值 + 异常 |
| Composables | **必须**：描述 + 参数 + 返回值 + 示例 |
| Store | **必须**：描述 + state/getter/action |
| 工具函数 | **必须**：描述 + 参数 + 返回值 |
| Vue 组件 | **必须**：`<script>` 顶部注释说明用途、Props 含义、Emit 事件 |

#### 20.9.2 逻辑注释（行内级）⚠️ 强制要求

> **函数体内的关键逻辑分支、业务规则、数据转换必须有中文逻辑注释。**  
> 注释解释 **为什么（why）** 和 **业务意图（what for）**，而非代码字面含义。

**✅ 正确示例**：

```typescript
async function submitUser() {
  const name = userForm.name.trim()
  const email = userForm.email.trim().toLowerCase()

  // 校验：姓名2-40字符，仅允许中文/英文/数字/空格/特殊分隔符
  if (!isValidName(name)) {
    ElMessage.warning('姓名格式不正确')
    return
  }

  // 角色和项目为必选项，确保用户至少关联一个角色和一个项目
  if (userForm.roleIds.length === 0 || userForm.projectIds.length === 0) {
    ElMessage.warning('角色和项目至少选择一个')
    return
  }

  savingUser.value = true
  try {
    if (editingUserId.value) {
      // 编辑模式：更新用户基本信息 + 角色/项目关联
      await updateUser(editingUserId.value, { name, email, ... })
    } else {
      // 新建模式：取第一个选中角色作为默认角色名（后端要求 role 字段）
      const defaultRoleName = roles.value.find((r) => r.id === userForm.roleIds[0])?.name || 'tester'
      await createUser({ name, email, role: defaultRoleName, ... })
    }
    // 保存成功后关闭弹窗并刷新列表
    userDialogVisible.value = false
    await loadUsers()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '保存用户失败')
  } finally {
    savingUser.value = false
  }
}
```

**❌ 错误示例（注释不足）**：

```typescript
async function submitUser() {
  const name = userForm.name.trim()
  if (!isValidName(name)) { ElMessage.warning('姓名格式不正确'); return }
  if (userForm.roleIds.length === 0) { ElMessage.warning('请选择角色'); return }
  savingUser.value = true
  try {
    if (editingUserId.value) {
      await updateUser(editingUserId.value, { name, ... })
    } else {
      const defaultRoleName = roles.value.find((r) => r.id === userForm.roleIds[0])?.name || 'tester'
      await createUser({ name, role: defaultRoleName, ... })
    }
    userDialogVisible.value = false
    await loadUsers()
  } catch (e: any) { ElMessage.error('保存失败') }
  finally { savingUser.value = false }
}
```

#### 20.9.3 必须添加注释的场景

| 场景 | 注释要求 | 示例 |
|------|---------|------|
| **条件分支** | 解释分支条件的业务含义 | `// 已登录用户访问登录页 → 重定向首页` |
| **循环/遍历** | 说明遍历目的 | `// 遍历模块路径构建目录树，按层级逐级创建节点` |
| **错误处理** | 说明为什么这样处理 | `// 401 非登录请求 → 清除过期 token 并刷新页面` |
| **数据转换** | 说明转换的业务原因 | `// 后端返回 snake_case 字段，前端统一为 camelCase` |
| **魔法数字/阈值** | 说明含义 | `// 头像限制 2MB，超出后端会拒绝` |
| **正则表达式** | 说明匹配规则 | `// 匹配11位手机号（1开头）` |
| **异步流程** | 说明执行顺序和依赖 | `// 先加载角色列表，用户表单中的角色下拉依赖此数据` |
| **状态重置** | 说明重置时机和原因 | `// 切换项目后重置分页到第一页，避免越界` |
| **计算属性** | 说明计算逻辑的业务意图 | `// 过滤已删除用户，admin 角色不可在创建时选择` |
| **Watch 监听** | 说明触发条件和响应动作 | `// 项目切换时自动刷新用例列表` |

### 字体

| 场景 | 字体 | 大小 |
|------|------|------|
| 正文 | Inter | 13-14px |
| 标题 | Inter Bold | 15-28px |
| 代码/ID | JetBrains Mono | 12px |

### 间距与圆角

| 令牌 | 值 |
|------|-----|
| `--tp-radius-sm` | 6px |
| `--tp-radius-md` | 8px |
| `--tp-radius-lg` | 12px |
| `--tp-transition` | 0.2s ease |

---

## 17. 构建与部署

### 开发

```bash
npm install          # 安装依赖
npm run dev          # Vite 开发服务器 (HMR, localhost:5173)
```

### 生产构建

```bash
npm run build        # TypeScript 类型检查 + Vite 打包
npm run preview      # 预览生产构建
```

### 环境管理

| 环境 | API 地址 | 部署触发 |
|------|---------|---------|
| `development` | `localhost:8080` | `npm run dev` |
| `staging` | `staging-api.testpilot.com` | PR 合入 develop |
| `production` | `api.testpilot.com` | Tag 发布或审批 |

```
.env                    # 共用默认值
.env.development        # 本地覆盖
.env.staging            # 预发布覆盖
.env.production         # 生产覆盖
```

---

## 18. CI/CD 流水线

```
代码推送 (Push/PR)
    ↓
┌─────────────────────────────────────────┐
│              CI Pipeline                 │
├──────────┬──────────┬──────────┬────────┤
│ Lint     │ Type     │ Unit     │ Build  │
│ ESLint   │ Check    │ Tests    │ Vite   │
│ Prettier │ vue-tsc  │ Vitest   │ Bundle │
├──────────┴──────────┴──────────┴────────┤
│            E2E Tests (Cypress)           │
├──────────────────────────────────────────┤
│       Bundle Size + License Check        │
└──────────────────────────────────────────┘
    ↓ (All Pass)
┌──────────────────────────────────────────┐
│              CD Pipeline                  │
│ Staging Deploy → Smoke Test → Approval    │
│ Production Deploy → Health Check → CDN    │
└──────────────────────────────────────────┘
```

---

## 19. 组件设计原则

| 原则 | 说明 | 检查标准 |
|------|------|---------|
| **单一职责 (SRP)** | 一个组件只做一件事 | 组件名能用一句话描述 |
| **行数上限** | `<script>` ≤ 200 行，`<template>` ≤ 100 行 | 超过则拆分 |
| **Props Down** | 父 → 子单向数据流 | 禁止子组件直接修改父状态 |
| **Events Up** | 子 → 父通过 emit 事件 | 禁止 `$parent` 直接访问 |
| **类型安全 Props** | 所有 Props 必须有 TS 接口 | `defineProps<XxxProps>()` |
| **三态完整** | 每个异步 UI 处理 loading/error/empty | 无裸 API 调用 |

### Code Review 清单

| # | 检查项 |
|---|--------|
| 1 | 组件是否超过 300 行？ |
| 2 | 是否有重复的模板/逻辑可以抽取？ |
| 3 | 所有 Props 是否有 TypeScript 类型定义？ |
| 4 | API 调用是否有错误处理？ |
| 5 | 是否有硬编码的魔法数字/字符串？ |
| 6 | 命名是否符合规范？ |
| 7 | 是否添加了必要的注释说明 why？ |
| 8 | 新增样式是否使用了 CSS 变量？ |
| 9 | 是否有内存泄漏风险（事件监听/定时器未清理）？ |
| 10 | 是否考虑了 loading/error/empty 三态？ |

---

## 20. 编码规范

### 20.1 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件文件 | PascalCase | `UserManagement.vue` |
| Composable | camelCase + `use` 前缀 | `useTable.ts` |
| Store | 领域名 | `stores/auth.ts` → `useAuthStore` |
| API 函数 | camelCase + 动词 | `listUsers()`, `createTestCase()` |
| CSS 类 | kebab-case (BEM) | `.tree-node-row`, `.status-badge--success` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 接口/类型 | PascalCase | `TestCase`, `LoginResp` |
| Props | camelCase | `modelValue`, `isLoading` |
| Emit | kebab-case | `update:model-value` |

### 20.2 ESLint 配置

```javascript
// eslint.config.js (Flat Config)
import pluginVue from 'eslint-plugin-vue'
import vueTsConfig from '@vue/eslint-config-typescript'

export default [
  ...pluginVue.configs['flat/recommended'],
  ...vueTsConfig(),
  {
    rules: {
      'no-console':          ['error', { allow: ['warn', 'error'] }],
      'no-debugger':         'error',
      'no-var':              'error',
      'prefer-const':        'error',
      'eqeqeq':             ['error', 'always'],
      '@typescript-eslint/no-explicit-any':    'warn',
      '@typescript-eslint/no-unused-vars':     ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'vue/multi-word-component-names':    'error',
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      'vue/block-order':     ['error', { order: ['script', 'template', 'style'] }],
      'vue/no-v-html':       'warn',
    }
  }
]
```

### 20.3 Prettier 配置

```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100,
  "endOfLine": "lf",
  "vueIndentScriptAndStyle": true
}
```

### 20.4 TypeScript 严格模式

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### 20.5 Vue SFC 规范

| 规则 | 说明 |
|------|------|
| 块顺序 | `<script>` → `<template>` → `<style>` |
| script setup | 必须使用 `<script setup lang="ts">` |
| Props 类型 | `defineProps<{ title: string }>()` |
| Emit 类型 | `defineEmits<{ (e: 'update', v: string): void }>()` |
| ref 命名 | `const count = ref(0)`（不加 Ref 后缀） |
| computed | 纯计算，无副作用 |
| Scoped CSS | 页面组件使用 `<style scoped>` |

### 20.6 Git 提交规范 (Conventional Commits)

```
<type>(<scope>): <subject>
```

| Type | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(testcase): 添加批量删除` |
| `fix` | Bug 修复 | `fix(login): 修复 Token 过期处理` |
| `refactor` | 重构 | `refactor(api): 按领域拆分` |
| `style` | 样式 | `style(table): 调整字体大小` |
| `perf` | 性能 | `perf(bundle): 按需导入 Element Plus` |
| `test` | 测试 | `test(api): 添加拦截器单测` |
| `docs` | 文档 | `docs: 更新架构文档` |
| `chore` | 工具链 | `chore: 升级 Vite` |

### 20.7 Git 分支策略

```
main (生产)  ─────●──────────●──────────●────→
                  ↑          ↑          ↑
develop    ──●──●──●──●──●──●──●──●──●──→
             ↑     ↑        ↑
feature/  ───┘     │        │
fix/      ─────────┘        │
hotfix/   ──────────────────┘
```

| 分支 | 合入目标 | 保护规则 |
|------|---------|---------|
| `main` | — | 🔒 禁止直推，仅 PR |
| `develop` | `main` | 🔒 需 Code Review |
| `feature/*` | `develop` | PR + CI 通过 |
| `fix/*` | `develop` | PR + CI 通过 |
| `hotfix/*` | `main` + `develop` | PR + 审批 |

### 20.8 Pre-commit Hooks

```json
// package.json
{
  "lint-staged": {
    "*.{ts,vue}": ["eslint --fix", "prettier --write"],
    "*.css": ["prettier --write"]
  }
}
```

```bash
# .husky/pre-commit
npx lint-staged

# .husky/commit-msg
npx --no -- commitlint --edit $1
```

### 20.9 JSDoc 规范

```typescript
/**
 * 获取项目下的测试用例列表（分页）
 *
 * @param projectId - 项目 ID
 * @param params - 查询参数（page, pageSize, keyword）
 * @returns 分页结果 { items, total, page, pageSize }
 * @throws {AxiosError} 401 - Token 过期
 */
export async function listTestCases(projectId: number, params: QueryParams) { ... }
```

| 文件类型 | 注释要求 |
|---------|---------|
| API 函数 | 必须：描述 + 参数 + 返回值 + 异常 |
| Composables | 必须：描述 + 参数 + 返回值 + 示例 |
| Store | 必须：描述 + state/getter/action |
| 工具函数 | 必须：描述 + 参数 + 返回值 |
| Vue 组件 | 推荐：顶部注释说明用途 |
| 行内逻辑 | 推荐：解释 why，不解释 what |

### 20.10 EditorConfig

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
max_line_length = 100

[*.md]
trim_trailing_whitespace = false
```

### 20.11 工具链安装

```bash
npm install -D \
  eslint eslint-plugin-vue @vue/eslint-config-typescript \
  prettier @vue/eslint-config-prettier \
  husky lint-staged \
  @commitlint/cli @commitlint/config-conventional

npx husky init
echo "npx lint-staged" > .husky/pre-commit
echo "npx --no -- commitlint --edit \$1" > .husky/commit-msg
```
