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
  PLAYWRIGHT_RECORDED = 'PLAYWRIGHT_RECORDED',
  AI_ENHANCED_FROM_RECORDING = 'AI_ENHANCED_FROM_RECORDING',
  AI_GENERATED = 'AI_GENERATED',
  HUMAN_EDITED = 'HUMAN_EDITED',
  MIXED = 'MIXED',
}

/** 生成模式 */
export enum GenerationMode {
  RECORDING_ENHANCED = 'RECORDING_ENHANCED',
  AI_DIRECT = 'AI_DIRECT',
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
  [SourceType.PLAYWRIGHT_RECORDED]: 'Playwright 录制',
  [SourceType.AI_ENHANCED_FROM_RECORDING]: 'AI 增强',
  [SourceType.AI_GENERATED]: 'AI 生成',
  [SourceType.HUMAN_EDITED]: '人工编写',
  [SourceType.MIXED]: '混合',
}

export const GenerationModeLabel: Record<GenerationMode, string> = {
  [GenerationMode.RECORDING_ENHANCED]: '录制增强',
  [GenerationMode.AI_DIRECT]: 'AI 直生',
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

export interface ActionPermissions {
  canExecute: boolean
  canValidate: boolean
  canEdit: boolean
  canConfirm: boolean
  canExport: boolean
  canDiscard: boolean
  canDelete: boolean
}

export interface RecordingSession {
  id: number
  taskId: number
  recorderType: string
  recordingStatus: string
  rawScriptContent?: string
  stepModelJson?: Record<string, unknown>
  createdAt: string
  finishedAt?: string
}

export interface AiScriptTask {
  id: number
  projectId: number
  projectName: string
  taskName: string
  generationMode: GenerationMode
  caseIds: number[]
  caseTags: string[]
  caseCount: number
  scenarioDesc: string
  startUrl: string
  accountRef?: string
  envConfig?: Record<string, unknown>
  taskStatus: TaskStatus
  frameworkType: string
  latestRecordingId?: number
  currentVersionNo?: number
  validationStatus?: ValidationStatus
  permissions?: ActionPermissions
  errorMessage?: string
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
  sourceRecordingId?: number
  scriptContent: string
  stepModelJson?: Record<string, unknown>
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
  taskId: number
  scriptVersionId?: number
  validationId?: number
  evidenceType: string
  fileName: string
  fileUrl: string
  contentText?: string
  traceNo?: number
  caption?: string
  createdBy?: number
  createdAt?: string
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

// ── 真实 API 方法 ──

import { apiClient } from './client'

/**
 * snake_case 对象键转 camelCase（单层 + 数组递归）
 * 用于将后端 JSON 响应映射到前端 Interface
 */
function toCamel(obj: any): any {
  if (Array.isArray(obj)) return obj.map(toCamel)
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.keys(obj).reduce((acc: Record<string, any>, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
      acc[camelKey] = toCamel(obj[key])
      return acc
    }, {})
  }
  return obj
}

/**
 * camelCase 对象键转 snake_case（用于发送请求体）
 */
function toSnake(obj: any): any {
  if (Array.isArray(obj)) return obj.map(toSnake)
  if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.keys(obj).reduce((acc: Record<string, any>, key) => {
      const snakeKey = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
      acc[snakeKey] = toSnake(obj[key])
      return acc
    }, {})
  }
  return obj
}

/** 获取任务列表 */
export async function fetchTaskList(params?: {
  projectId?: number
  taskStatus?: TaskStatus
  keyword?: string
  pageNo?: number
  pageSize?: number
}): Promise<{ list: AiScriptTask[]; total: number }> {
  const query: Record<string, any> = {}
  if (params?.projectId) query.project_id = params.projectId
  if (params?.taskStatus) query.task_status = params.taskStatus
  if (params?.keyword) query.keyword = params.keyword
  if (params?.pageNo) query.page = params.pageNo
  if (params?.pageSize) query.pageSize = params.pageSize

  const { data } = await apiClient.get('/ai-script/tasks', { params: query })

  // apiClient 拦截器会把分页响应转为 { items, total, page, pageSize }
  const items = data?.items ?? data ?? []
  const total = data?.total ?? items.length

  return {
    list: toCamel(items) as AiScriptTask[],
    total,
  }
}

/** 获取任务详情 */
export async function fetchTaskDetail(taskId: number): Promise<AiScriptTask | undefined> {
  try {
    const { data } = await apiClient.get(`/ai-script/tasks/${taskId}`)
    return toCamel(data) as AiScriptTask
  } catch {
    return undefined
  }
}

/** 创建生成任务 */
export async function createTask(payload: {
  projectId: number
  taskName: string
  generationMode?: GenerationMode
  scenarioDesc: string
  startUrl: string
  accountRef?: string
  caseIds: number[]
  frameworkType?: string
}): Promise<AiScriptTask> {
  const { data } = await apiClient.post('/ai-script/tasks', toSnake(payload))
  return toCamel(data) as AiScriptTask
}

/** 触发执行生成 */
export async function executeTask(taskId: number): Promise<void> {
  await apiClient.post(`/ai-script/tasks/${taskId}/execute`)
}

/** 获取脚本版本列表 */
export async function fetchScriptVersions(taskId: number): Promise<AiScriptVersion[]> {
  const { data } = await apiClient.get(`/ai-script/tasks/${taskId}/versions`)
  return toCamel(Array.isArray(data) ? data : []) as AiScriptVersion[]
}

/** 获取当前脚本版本 */
export async function fetchCurrentScript(taskId: number): Promise<AiScriptVersion | undefined> {
  try {
    const { data } = await apiClient.get(`/ai-script/tasks/${taskId}/current-script`)
    return toCamel(data) as AiScriptVersion
  } catch {
    return undefined
  }
}

/** 编辑脚本（生成新版本） */
export async function editScript(
  taskId: number,
  payload: { scriptContent: string; commentText?: string },
): Promise<AiScriptVersion> {
  const { data } = await apiClient.post(`/ai-script/tasks/${taskId}/edit-script`, toSnake(payload))
  return toCamel(data) as AiScriptVersion
}

/** 触发回放验证 */
export async function triggerValidation(
  taskId: number,
  scriptVersionId: number,
): Promise<AiScriptValidation> {
  const { data } = await apiClient.post(`/ai-script/tasks/${taskId}/validate`, {
    script_version_id: scriptVersionId,
  })
  return toCamel(data) as AiScriptValidation
}

/** 获取操作轨迹 */
export async function fetchTraces(taskId: number): Promise<AiScriptTrace[]> {
  const { data } = await apiClient.get(`/ai-script/tasks/${taskId}/traces`)
  return toCamel(Array.isArray(data) ? data : []) as AiScriptTrace[]
}

/** 获取最近验证结果 */
export async function fetchLatestValidation(
  scriptVersionId: number,
): Promise<AiScriptValidation | undefined> {
  try {
    const { data } = await apiClient.get('/ai-script/validations/latest', {
      params: { script_version_id: scriptVersionId },
    })
    return toCamel(data) as AiScriptValidation
  } catch {
    return undefined
  }
}

/** 获取证据列表 */
export async function fetchEvidences(taskId: number): Promise<EvidenceScreenshot[]> {
  const { data } = await apiClient.get(`/ai-script/tasks/${taskId}/evidences`)
  return toCamel(Array.isArray(data) ? data : []) as EvidenceScreenshot[]
}

// ── 新增 API 方法（阶段三） ──

/** 确认脚本 */
export async function confirmScript(scriptId: number): Promise<void> {
  await apiClient.post(`/ai-script/scripts/${scriptId}/confirm`)
}

/** 废弃脚本版本 */
export async function discardScript(scriptId: number, reason: string): Promise<void> {
  await apiClient.post(`/ai-script/scripts/${scriptId}/discard`, { reason })
}

/** 废弃任务 */
export async function discardTask(taskId: number, reason: string): Promise<void> {
  await apiClient.post(`/ai-script/tasks/${taskId}/discard`, { reason })
}

/** 删除已废弃任务 */
export async function deleteTask(taskId: number): Promise<void> {
  await apiClient.delete(`/ai-script/tasks/${taskId}`)
}

/** 克隆任务 */
export async function cloneTask(taskId: number, taskName: string): Promise<AiScriptTask> {
  const { data } = await apiClient.post(`/ai-script/tasks/${taskId}/clone`, { task_name: taskName })
  return toCamel(data) as AiScriptTask
}

/** 开始录制 */
export async function startRecording(taskId: number): Promise<RecordingSession> {
  const { data } = await apiClient.post(`/ai-script/tasks/${taskId}/recording/start`)
  return toCamel(data) as RecordingSession
}

/** 结束录制 */
export async function finishRecording(
  taskId: number,
  payload: { recordingId: number; rawScriptContent: string; triggerAiRefactor?: boolean },
): Promise<void> {
  await apiClient.post(`/ai-script/tasks/${taskId}/recording/finish`, toSnake(payload))
}

/** 获取最近录制结果 */
export async function fetchLatestRecording(taskId: number): Promise<RecordingSession | undefined> {
  try {
    const { data } = await apiClient.get(`/ai-script/tasks/${taskId}/recordings/latest`)
    return toCamel(data) as RecordingSession
  } catch {
    return undefined
  }
}

/** 导出脚本 */
export async function exportScript(scriptId: number): Promise<Blob> {
  const { data } = await apiClient.get(`/ai-script/scripts/${scriptId}/export`, {
    responseType: 'blob',
  })
  return data
}

/** 获取验证历史 */
export async function fetchValidationHistory(scriptId: number): Promise<AiScriptValidation[]> {
  const { data } = await apiClient.get(`/ai-script/scripts/${scriptId}/validations`)
  return toCamel(Array.isArray(data) ? data : []) as AiScriptValidation[]
}

/** 更新任务关联用例 */
export async function updateTaskCases(taskId: number, caseIds: number[]): Promise<void> {
  await apiClient.post(`/ai-script/tasks/${taskId}/cases/update`, { case_ids: caseIds })
}

// ── Executor Codegen API（直连 Executor 服务） ──

const EXECUTOR_BASE = import.meta.env.VITE_EXECUTOR_URL || 'http://127.0.0.1:8100'

export interface CodegenSession {
  session_id: string
  status: string
}

export interface CodegenPollResult {
  status: 'starting' | 'recording' | 'completed' | 'error' | 'not_found'
  script_content: string
  error: string
}

/** 启动 Playwright Codegen 录制浏览器 */
export async function launchCodegen(taskId: number, startUrl: string): Promise<CodegenSession> {
  const resp = await fetch(`${EXECUTOR_BASE}/recording/codegen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId, start_url: startUrl }),
  })
  return resp.json()
}

/** 轮询 Codegen 录制状态 */
export async function pollCodegenStatus(sessionId: string): Promise<CodegenPollResult> {
  const resp = await fetch(`${EXECUTOR_BASE}/recording/codegen/${sessionId}`)
  return resp.json()
}
