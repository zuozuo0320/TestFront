// ============================================================
// 测试智编模块 — 类型定义 & Mock API
// ============================================================

// ── 枚举 ──

/** 任务状态 */
export enum TaskStatus {
  DRAFT = 'DRAFT',
  PENDING_EXECUTE = 'PENDING_EXECUTE',
  RUNNING = 'RUNNING',
  GENERATE_SUCCESS = 'GENERATE_SUCCESS',
  GENERATE_FAILED = 'GENERATE_FAILED',
  PENDING_CONFIRM = 'PENDING_CONFIRM',
  PENDING_REVALIDATE = 'PENDING_REVALIDATE',
  CONFIRMED = 'CONFIRMED',
  DISCARDED = 'DISCARDED',
}

/** 脚本状态 */
export enum ScriptStatus {
  DRAFT = 'DRAFT',
  PENDING_CONFIRM = 'PENDING_CONFIRM',
  PENDING_REVALIDATE = 'PENDING_REVALIDATE',
  CONFIRMED = 'CONFIRMED',
  DISCARDED = 'DISCARDED',
}

/** 验证状态 */
export enum ValidationStatus {
  NOT_VALIDATED = 'NOT_VALIDATED',
  VALIDATING = 'VALIDATING',
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  ERROR = 'ERROR',
}

/** 生成来源 */
export enum SourceType {
  AI_GENERATED = 'AI_GENERATED',
  HUMAN_EDITED = 'HUMAN_EDITED',
  MIXED = 'MIXED',
}

/** 轨迹动作类型 */
export enum TraceActionType {
  NAVIGATE = 'NAVIGATE',
  CLICK = 'CLICK',
  INPUT = 'INPUT',
  SELECT = 'SELECT',
  UPLOAD = 'UPLOAD',
  SCROLL = 'SCROLL',
  WAIT = 'WAIT',
  ASSERT_CANDIDATE = 'ASSERT_CANDIDATE',
  CUSTOM = 'CUSTOM',
}

// ── 中文映射 ──

export const TaskStatusLabel: Record<TaskStatus, string> = {
  [TaskStatus.DRAFT]: '待配置',
  [TaskStatus.PENDING_EXECUTE]: '待执行',
  [TaskStatus.RUNNING]: '执行中',
  [TaskStatus.GENERATE_SUCCESS]: '生成成功',
  [TaskStatus.GENERATE_FAILED]: '生成失败',
  [TaskStatus.PENDING_CONFIRM]: '待确认',
  [TaskStatus.PENDING_REVALIDATE]: '待重新验证',
  [TaskStatus.CONFIRMED]: '已确认',
  [TaskStatus.DISCARDED]: '已废弃',
}

export const ScriptStatusLabel: Record<ScriptStatus, string> = {
  [ScriptStatus.DRAFT]: '草稿',
  [ScriptStatus.PENDING_CONFIRM]: '待确认',
  [ScriptStatus.PENDING_REVALIDATE]: '待重验',
  [ScriptStatus.CONFIRMED]: '已确认',
  [ScriptStatus.DISCARDED]: '已废弃',
}

export const ValidationStatusLabel: Record<ValidationStatus, string> = {
  [ValidationStatus.NOT_VALIDATED]: '未验证',
  [ValidationStatus.VALIDATING]: '验证中',
  [ValidationStatus.PASSED]: '验证通过',
  [ValidationStatus.FAILED]: '验证失败',
  [ValidationStatus.ERROR]: '验证异常',
}

export const SourceTypeLabel: Record<SourceType, string> = {
  [SourceType.AI_GENERATED]: 'AI 生成',
  [SourceType.HUMAN_EDITED]: '人工编写',
  [SourceType.MIXED]: '混合',
}

export const TraceActionLabel: Record<TraceActionType, string> = {
  [TraceActionType.NAVIGATE]: '页面跳转',
  [TraceActionType.CLICK]: '点击',
  [TraceActionType.INPUT]: '输入',
  [TraceActionType.SELECT]: '选择',
  [TraceActionType.UPLOAD]: '上传',
  [TraceActionType.SCROLL]: '滚动',
  [TraceActionType.WAIT]: '等待',
  [TraceActionType.ASSERT_CANDIDATE]: '断言候选',
  [TraceActionType.CUSTOM]: '自定义',
}

// ── 状态颜色映射 ──

export type StatusColor = 'success' | 'warning' | 'danger' | 'info' | 'primary'

export const TaskStatusColor: Record<TaskStatus, StatusColor> = {
  [TaskStatus.DRAFT]: 'info',
  [TaskStatus.PENDING_EXECUTE]: 'info',
  [TaskStatus.RUNNING]: 'primary',
  [TaskStatus.GENERATE_SUCCESS]: 'success',
  [TaskStatus.GENERATE_FAILED]: 'danger',
  [TaskStatus.PENDING_CONFIRM]: 'warning',
  [TaskStatus.PENDING_REVALIDATE]: 'warning',
  [TaskStatus.CONFIRMED]: 'success',
  [TaskStatus.DISCARDED]: 'info',
}

export const ScriptStatusColor: Record<ScriptStatus, StatusColor> = {
  [ScriptStatus.DRAFT]: 'info',
  [ScriptStatus.PENDING_CONFIRM]: 'warning',
  [ScriptStatus.PENDING_REVALIDATE]: 'warning',
  [ScriptStatus.CONFIRMED]: 'success',
  [ScriptStatus.DISCARDED]: 'info',
}

export const ValidationStatusColor: Record<ValidationStatus, StatusColor> = {
  [ValidationStatus.NOT_VALIDATED]: 'info',
  [ValidationStatus.VALIDATING]: 'primary',
  [ValidationStatus.PASSED]: 'success',
  [ValidationStatus.FAILED]: 'danger',
  [ValidationStatus.ERROR]: 'danger',
}

// ── 核心接口 ──

export interface AiScriptTask {
  id: number
  projectId: number
  projectName: string
  taskName: string
  caseIds: number[]
  caseTags: string[]
  caseCount: number
  scenarioDesc: string
  startUrl: string
  accountRef?: string
  envConfig?: Record<string, unknown>
  taskStatus: TaskStatus
  frameworkType: string
  currentVersionNo?: number
  validationStatus?: ValidationStatus
  createdBy: number
  createdName: string
  createdAt: string
  updatedAt: string
}

export interface AiScriptVersion {
  id: number
  taskId: number
  versionNo: number
  frameworkType: string
  scriptName?: string
  scriptStatus: ScriptStatus
  validationStatus: ValidationStatus
  sourceType: SourceType
  scriptContent: string
  commentText?: string
  basedOnVersionId?: number
  isCurrentFlag: boolean
  confirmedBy?: number
  confirmedAt?: string
  createdBy: number
  createdName: string
  createdAt: string
}

export interface AiScriptValidation {
  id: number
  scriptVersionId: number
  taskId: number
  triggerType: string
  validationStatus: ValidationStatus
  totalStepCount: number
  passedStepCount: number
  failedStepNo?: number
  failReason?: string
  assertionSummary: AssertionItem[]
  startedAt: string
  finishedAt?: string
  durationMs?: number
  triggeredBy: number
  triggeredName: string
  logs: ValidationLog[]
  screenshots: EvidenceScreenshot[]
}

export interface AssertionItem {
  name: string
  passed: boolean
  skipped?: boolean
}

export interface ValidationLog {
  level: 'INFO' | 'WARN' | 'ERROR'
  message: string
  timestamp?: string
}

export interface EvidenceScreenshot {
  id: number
  fileName: string
  url: string
  traceNo?: number
  caption?: string
  takenAt?: string
}

export interface AiScriptTrace {
  id: number
  taskId: number
  traceNo: number
  actionType: TraceActionType
  pageUrl?: string
  targetSummary?: string
  locatorUsed?: string
  inputValueMasked?: string
  actionResult?: string
  errorMessage?: string
  screenshotUrl?: string
  occurredAt: string
}

// ── Mock 数据 ──

const MOCK_SCRIPT_CONTENT = `import { test, expect } from '@playwright/test';

test('用户登录并进入仪表盘', async ({ page }) => {
  // 1. 导航到登录页面
  await page.goto('https://staging.testpilot.io/auth/login');

  // 2. 填写登录表单
  await page.fill('input[name="email"]', 'qa-bot@testpilot.ai');
  await page.fill('input[name="password"]', process.env.STAGING_PWD);

  // 3. 提交表单并验证
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/dashboard');
});`

export const MOCK_TASKS: AiScriptTask[] = [
  {
    id: 29402,
    projectId: 1001,
    projectName: 'Project Alpha',
    taskName: '登录流程回归测试',
    caseIds: [2001, 2002, 2003],
    caseTags: ['AUTH_001', '+2'],
    caseCount: 3,
    scenarioDesc: '使用测试账号完成登录流程并验证仪表盘加载',
    startUrl: 'https://staging.testpilot.io/auth/login',
    taskStatus: TaskStatus.RUNNING,
    frameworkType: 'Playwright',
    currentVersionNo: 3,
    validationStatus: ValidationStatus.VALIDATING,
    createdBy: 3001,
    createdName: 'Alex Chen',
    createdAt: '2025-10-24 14:20',
    updatedAt: '2025-10-24 14:20',
  },
  {
    id: 29388,
    projectId: 1002,
    projectName: '电商 Web 平台',
    taskName: '结账端到端测试',
    caseIds: [2010],
    caseTags: ['SHOP_42'],
    caseCount: 1,
    scenarioDesc: '从购物车到支付完成的完整结账流程',
    startUrl: 'https://shop.example.com/cart',
    taskStatus: TaskStatus.GENERATE_SUCCESS,
    frameworkType: 'Playwright',
    currentVersionNo: 1,
    validationStatus: ValidationStatus.PASSED,
    createdBy: 0,
    createdName: 'System AI',
    createdAt: '2025-10-24 12:05',
    updatedAt: '2025-10-24 12:05',
  },
  {
    id: 29350,
    projectId: 1003,
    projectName: 'Mobile Core',
    taskName: '设置页面同步测试',
    caseIds: [2020],
    caseTags: ['UI_SYNC_09'],
    caseCount: 1,
    scenarioDesc: '移动端设置页面的数据同步验证',
    startUrl: 'https://m.example.com/settings',
    taskStatus: TaskStatus.GENERATE_FAILED,
    frameworkType: 'Playwright',
    createdBy: 3002,
    createdName: 'Sarah Zhang',
    createdAt: '2025-10-23 18:45',
    updatedAt: '2025-10-23 18:45',
  },
  {
    id: 29312,
    projectId: 1001,
    projectName: 'Project Alpha',
    taskName: '用户资料更新接口测试',
    caseIds: [2030],
    caseTags: ['USER_API'],
    caseCount: 1,
    scenarioDesc: '调用用户资料更新接口并验证页面数据刷新',
    startUrl: 'https://staging.testpilot.io/profile',
    taskStatus: TaskStatus.PENDING_CONFIRM,
    frameworkType: 'Playwright',
    currentVersionNo: 2,
    validationStatus: ValidationStatus.PASSED,
    createdBy: 0,
    createdName: 'System AI',
    createdAt: '2025-10-23 11:20',
    updatedAt: '2025-10-23 11:20',
  },
  {
    id: 29280,
    projectId: 1001,
    projectName: 'Project Alpha',
    taskName: '鉴权流程 V2',
    caseIds: [2040],
    caseTags: ['AUTH_V2'],
    caseCount: 1,
    scenarioDesc: '使用有效凭证登录并验证跳转',
    startUrl: 'https://staging.testpilot.io/auth/login',
    accountRef: 'test_user_a',
    taskStatus: TaskStatus.CONFIRMED,
    frameworkType: 'Playwright',
    currentVersionNo: 5,
    validationStatus: ValidationStatus.PASSED,
    createdBy: 3001,
    createdName: 'Alex Chen',
    createdAt: '2025-10-22 09:30',
    updatedAt: '2025-10-24 16:00',
  },
]

export const MOCK_SCRIPTS: AiScriptVersion[] = [
  {
    id: 5001,
    taskId: 29280,
    versionNo: 5,
    frameworkType: 'Playwright',
    scriptName: 'auth_main_flow_v2',
    scriptStatus: ScriptStatus.CONFIRMED,
    validationStatus: ValidationStatus.PASSED,
    sourceType: SourceType.AI_GENERATED,
    scriptContent: MOCK_SCRIPT_CONTENT,
    isCurrentFlag: true,
    confirmedBy: 3001,
    confirmedAt: '2025-10-24 16:00',
    createdBy: 0,
    createdName: 'System AI',
    createdAt: '2025-11-24 14:20',
  },
  {
    id: 5002,
    taskId: 29280,
    versionNo: 4,
    frameworkType: 'Playwright',
    scriptName: 'recovery_logic_test',
    scriptStatus: ScriptStatus.PENDING_REVALIDATE,
    validationStatus: ValidationStatus.NOT_VALIDATED,
    sourceType: SourceType.HUMAN_EDITED,
    scriptContent: MOCK_SCRIPT_CONTENT,
    isCurrentFlag: false,
    createdBy: 3002,
    createdName: 'Sarah Zhang',
    createdAt: '2025-11-22 09:15',
  },
  {
    id: 5003,
    taskId: 29280,
    versionNo: 3,
    frameworkType: 'Playwright',
    scriptName: 'edge_case_handler',
    scriptStatus: ScriptStatus.DRAFT,
    validationStatus: ValidationStatus.NOT_VALIDATED,
    sourceType: SourceType.AI_GENERATED,
    scriptContent: MOCK_SCRIPT_CONTENT,
    isCurrentFlag: false,
    createdBy: 0,
    createdName: 'System AI',
    createdAt: '2025-11-20 11:30',
  },
]

export const MOCK_TRACES: AiScriptTrace[] = [
  {
    id: 1,
    taskId: 29280,
    traceNo: 1,
    actionType: TraceActionType.NAVIGATE,
    pageUrl: 'https://staging.testpilot.io/auth/login',
    targetSummary: '打开登录页面并等待 DOM 加载完成',
    actionResult: 'success',
    occurredAt: '00:02.12',
  },
  {
    id: 2,
    taskId: 29280,
    traceNo: 2,
    actionType: TraceActionType.INPUT,
    pageUrl: 'https://staging.testpilot.io/auth/login',
    targetSummary: '在 #email 字段中输入凭证',
    locatorUsed: 'input[name="email"]',
    inputValueMasked: 'qa-bot@testpilot.ai',
    actionResult: 'success',
    occurredAt: '00:04.45',
  },
  {
    id: 3,
    taskId: 29280,
    traceNo: 3,
    actionType: TraceActionType.CLICK,
    pageUrl: 'https://staging.testpilot.io/auth/login',
    targetSummary: '点击 .btn-primary 提交按钮',
    locatorUsed: 'button[type="submit"]',
    actionResult: 'success',
    occurredAt: '00:05.10',
  },
  {
    id: 4,
    taskId: 29280,
    traceNo: 4,
    actionType: TraceActionType.ASSERT_CANDIDATE,
    pageUrl: 'https://staging.testpilot.io/dashboard',
    targetSummary: '验证 URL 包含 /dashboard',
    actionResult: 'success',
    occurredAt: '00:06.80',
  },
]

export const MOCK_VALIDATION: AiScriptValidation = {
  id: 8001,
  scriptVersionId: 5001,
  taskId: 29280,
  triggerType: 'MANUAL',
  validationStatus: ValidationStatus.FAILED,
  totalStepCount: 15,
  passedStepCount: 14,
  failedStepNo: 15,
  failReason: 'Timed out waiting for element: .user-avatar',
  assertionSummary: [
    { name: 'URL_VALIDATION', passed: true },
    { name: 'LOGIN_FIELD_PRESENT', passed: true },
    { name: 'DASHBOARD_LOAD', passed: false },
    { name: 'USER_PROFILE_SYNC', passed: false, skipped: true },
  ],
  startedAt: '2025-10-24 15:30',
  finishedAt: '2025-10-24 15:31',
  durationMs: 8440,
  triggeredBy: 3001,
  triggeredName: 'Alex Chen',
  logs: [
    { level: 'INFO', message: '[INFO] 浏览器上下文已初始化' },
    { level: 'INFO', message: '[LOG] 正在导航到目标 URL...' },
    { level: 'INFO', message: '[LOG] 等待选择器: input[name="email"]' },
    { level: 'INFO', message: '[LOG] 输入文本: qa-bot@testpilot.ai' },
    { level: 'INFO', message: '[LOG] 断言: URL 应包含 /dashboard' },
    { level: 'ERROR', message: '[FAIL] 等待元素超时: .user-avatar' },
  ],
  screenshots: [
    {
      id: 7001,
      fileName: 'final-state.png',
      url: '',
      caption: '最终状态截图',
      takenAt: '00:08.44',
    },
  ],
}

// ── Mock API 方法（首期使用，后续替换为真实接口） ──

/** 模拟延迟 */
function delay(ms = 300): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 获取任务列表 */
export async function fetchTaskList(_params?: {
  projectId?: number
  taskStatus?: TaskStatus
  keyword?: string
  pageNo?: number
  pageSize?: number
}): Promise<{ list: AiScriptTask[]; total: number }> {
  await delay()
  return { list: MOCK_TASKS, total: MOCK_TASKS.length }
}

/** 获取任务详情 */
export async function fetchTaskDetail(taskId: number): Promise<AiScriptTask | undefined> {
  await delay()
  return MOCK_TASKS.find((t) => t.id === taskId)
}

/** 获取脚本版本列表 */
export async function fetchScriptVersions(
  _taskId: number,
): Promise<AiScriptVersion[]> {
  await delay()
  return MOCK_SCRIPTS
}

/** 获取当前脚本版本 */
export async function fetchCurrentScript(
  _taskId: number,
): Promise<AiScriptVersion | undefined> {
  await delay()
  return MOCK_SCRIPTS.find((s) => s.isCurrentFlag)
}

/** 获取操作轨迹 */
export async function fetchTraces(_taskId: number): Promise<AiScriptTrace[]> {
  await delay()
  return MOCK_TRACES
}

/** 获取最近验证结果 */
export async function fetchLatestValidation(
  _scriptId: number,
): Promise<AiScriptValidation> {
  await delay()
  return MOCK_VALIDATION
}
