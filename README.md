# TestFront — 测试管理平台前端

> Vue 3 + TypeScript + Vite · 暗色主题 · Element Plus

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue 3 + Composition API | 3.5 | 响应式 UI |
| Vite | 7.x | 构建 + HMR |
| TypeScript (strict) | 5.9 | 静态类型 |
| vue-router | 4.x | SPA 路由 |
| Pinia | 3.x | 状态管理 |
| Element Plus | 2.x | UI 组件库 |
| vue-codemirror / CodeMirror 6 | — | 脚本编辑器（TypeScript 高亮 + one-dark 主题） |
| Tiptap | 3.x | 富文本编辑器（用例步骤描述） |
| Lucide Icons | — | 矢量图标库 |
| Axios | 1.x | HTTP 请求 |

---

## 快速开始

```bash
npm install          # 安装依赖
npm run dev          # 启动开发服务器 (localhost:5173)
npm run build        # 类型检查 + 生产打包
npm run preview      # 预览生产构建
```

### 代码质量

```bash
npm run lint         # ESLint 检查（zero-warning 模式）
npm run lint:fix     # ESLint 自动修复
npm run format       # Prettier 格式化 src/
npm run type-check   # vue-tsc 类型检查（不输出文件）
npm run test         # Vitest 单次运行
npm run test:watch   # Vitest 监听模式
```

> 提交时 husky + lint-staged 会自动执行 ESLint + Prettier。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_API_BASE_URL` | 后端 API 地址 | `http://localhost:8080/api/v1` |

---

## 项目结构

```
src/
├── api/                    # API 层
│   ├── client.ts           #   Axios 实例 + 拦截器
│   ├── types.ts            #   公共类型定义
│   ├── auth.ts             #   认证
│   ├── user.ts             #   用户管理
│   ├── project.ts          #   项目管理
│   ├── projectMember.ts    #   项目成员
│   ├── module.ts           #   模块管理
│   ├── testcase.ts         #   测试用例
│   ├── aiScript.ts         #   测试智编
│   ├── attachment.ts       #   附件上传
│   └── xlsx.ts             #   Excel 导入导出
├── stores/                 # Pinia 状态
│   ├── auth.ts             #   认证状态
│   ├── user.ts             #   用户状态
│   ├── project.ts          #   项目状态
│   ├── testcase.ts         #   用例状态
│   └── aiScript.ts         #   智编任务状态
├── composables/            # 可复用逻辑
│   ├── useCrud.ts          #   通用增删改查
│   ├── useTable.ts         #   表格分页
│   ├── useTestCaseTree.ts  #   用例树操作
│   ├── useLocalStorage.ts  #   本地存储
│   └── useParticles.ts     #   粒子动画（登录页）
├── components/             # 通用组件
│   ├── AppHeader.vue       #   顶部导航
│   ├── AppSidebar.vue      #   侧边菜单
│   ├── BreadcrumbBar.vue   #   面包屑导航
│   ├── CodeEditor.vue      #   CodeMirror 编辑器
│   ├── RichTextEditor.vue  #   Tiptap 富文本编辑器
│   ├── FileUploader.vue    #   文件上传
│   ├── EmptyState.vue      #   空状态占位
│   ├── HoloOrb.vue         #   全息球动画（登录页）
│   ├── StatusBadge.vue     #   状态徽章
│   └── LevelBadge.vue      #   等级徽章
├── router/                 # 路由配置
│   └── index.ts            #   路由定义 + 权限守卫
├── views/                  # 页面
│   ├── LoginPage.vue       #   登录
│   ├── WorkbenchPage.vue   #   工作台仪表盘
│   ├── TestCasePage.vue    #   用例管理
│   ├── ForbiddenPage.vue   #   403 无权限
│   ├── ComingSoonPage.vue  #   敬请期待占位
│   ├── ai-script/          #   测试智编
│   │   ├── AiScriptTaskList.vue     # 任务列表
│   │   ├── AiScriptTaskDetail.vue   # 任务详情
│   │   └── AiScriptLibrary.vue      # 脚本库
│   └── system/             #   系统管理（需管理员权限）
│       ├── UserManagement.vue       # 用户管理
│       ├── RoleManagement.vue       # 角色管理
│       └── ProjectManagement.vue    # 项目管理
├── styles/                 # 样式
│   ├── variables.css       #   CSS 变量 / 设计令牌
│   ├── base.css            #   全局基础样式
│   ├── layout.css          #   布局样式
│   ├── animations.css      #   动画
│   ├── ai-script.css       #   智编模块样式
│   └── testcase-drawer.css #   用例抽屉样式
└── assets/                 # 静态资源
```

---

## 页面路由

| 路径 | 说明 | 权限 |
|------|------|------|
| `/login` | 登录 | 公开 |
| `/` | 工作台仪表盘 | 需登录 |
| `/testcases` | 用例管理 | 需登录 |
| `/ai-script` | 测试智编 — 任务列表 | 需登录 |
| `/ai-script/library` | 测试智编 — 脚本库 | 需登录 |
| `/ai-script/:taskId` | 测试智编 — 任务详情 | 需登录 |
| `/defects` | 缺陷管理（开发中） | 需登录 |
| `/analytics` | 分析报表（开发中） | 需登录 |
| `/system/users` | 用户管理 | 需管理员 |
| `/system/roles` | 角色管理 | 需管理员 |
| `/system/projects` | 项目管理 | 需管理员 |
| `/forbidden` | 无权限提示 | 需登录 |
