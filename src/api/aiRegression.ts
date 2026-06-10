// ============================================================
// 阶段三（18.3）— 定时回归 / AI 修复建议 / 编排指标 API
// ============================================================

import { apiClient } from './client'
import type { StatusColor } from './aiScript'

type PlainObject = Record<string, unknown>

function isPlainObject(value: unknown): value is PlainObject {
  return value !== null && typeof value === 'object' && !(value instanceof Date)
}

/** snake_case 对象键转 camelCase（数组递归），用于映射后端 JSON 响应 */
function toCamel(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(toCamel)
  if (isPlainObject(obj)) {
    return Object.keys(obj).reduce((acc: PlainObject, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
      acc[camelKey] = toCamel(obj[key])
      return acc
    }, {})
  }
  return obj
}

/** camelCase 对象键转 snake_case，用于发送请求体 */
function toSnake(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(toSnake)
  if (isPlainObject(obj)) {
    return Object.keys(obj).reduce((acc: PlainObject, key) => {
      const snakeKey = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
      acc[snakeKey] = toSnake(obj[key])
      return acc
    }, {})
  }
  return obj
}

// ── 枚举 ──

/** 回归执行状态。 */
export const RegressionExecutionStatus = {
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  ERROR: 'ERROR',
  SKIPPED: 'SKIPPED',
} as const
export type RegressionExecutionStatus =
  (typeof RegressionExecutionStatus)[keyof typeof RegressionExecutionStatus]

export const RegressionExecutionStatusLabel: Record<RegressionExecutionStatus, string> = {
  [RegressionExecutionStatus.PASSED]: '通过',
  [RegressionExecutionStatus.FAILED]: '失败',
  [RegressionExecutionStatus.ERROR]: '异常',
  [RegressionExecutionStatus.SKIPPED]: '跳过',
}

export const RegressionExecutionStatusColor: Record<RegressionExecutionStatus, StatusColor> = {
  [RegressionExecutionStatus.PASSED]: 'success',
  [RegressionExecutionStatus.FAILED]: 'danger',
  [RegressionExecutionStatus.ERROR]: 'warning',
  [RegressionExecutionStatus.SKIPPED]: 'info',
}

/** 回归执行触发方式。 */
export const RegressionTriggerType = {
  SCHEDULED: 'SCHEDULED',
  MANUAL: 'MANUAL',
} as const
export type RegressionTriggerType =
  (typeof RegressionTriggerType)[keyof typeof RegressionTriggerType]

export const RegressionTriggerTypeLabel: Record<RegressionTriggerType, string> = {
  [RegressionTriggerType.SCHEDULED]: '定时',
  [RegressionTriggerType.MANUAL]: '手动',
}

/** AI 修复建议状态：建议只生成 Diff，必须人工确认后才能应用（14.3 约束）。 */
export const RepairSuggestionStatus = {
  PENDING: 'PENDING',
  ADOPTED: 'ADOPTED',
  REJECTED: 'REJECTED',
  FAILED: 'FAILED',
} as const
export type RepairSuggestionStatus =
  (typeof RepairSuggestionStatus)[keyof typeof RepairSuggestionStatus]

export const RepairSuggestionStatusLabel: Record<RepairSuggestionStatus, string> = {
  [RepairSuggestionStatus.PENDING]: '待确认',
  [RepairSuggestionStatus.ADOPTED]: '已采纳',
  [RepairSuggestionStatus.REJECTED]: '已拒绝',
  [RepairSuggestionStatus.FAILED]: '生成失败',
}

export const RepairSuggestionStatusColor: Record<RepairSuggestionStatus, StatusColor> = {
  [RepairSuggestionStatus.PENDING]: 'warning',
  [RepairSuggestionStatus.ADOPTED]: 'success',
  [RepairSuggestionStatus.REJECTED]: 'info',
  [RepairSuggestionStatus.FAILED]: 'danger',
}

// ── 类型定义 ──

/** 已发布编排的定时回归计划。 */
export interface RegressionPlan {
  id: number
  projectId: number
  compositionId: number
  name: string
  intervalMinutes: number
  enabled: boolean
  nextRunAt?: string | null
  lastRunAt?: string | null
  lastStatus?: string
  createdBy: number
  createdAt: string
  updatedBy: number
  updatedAt: string
  compositionName?: string
  compositionStatus?: string
}

/** 回归执行记录。 */
export interface RegressionExecution {
  id: number
  planId: number
  projectId: number
  compositionId: number
  validationId?: number | null
  triggerType: RegressionTriggerType
  status: RegressionExecutionStatus
  failureSummary?: string
  repairSuggestionId?: number | null
  startedAt?: string | null
  finishedAt?: string | null
  durationMs: number
  createdAt: string
  compositionName?: string
}

/** AI 修复建议（仅 Diff，需人工确认）。 */
export interface RepairSuggestion {
  id: number
  projectId: number
  compositionId: number
  executionId: number
  status: RepairSuggestionStatus
  summary?: string
  diffContent?: string
  patchedCode?: string
  model?: string
  modelConfigId?: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  errorMessage?: string
  confirmedBy?: number | null
  confirmedAt?: string | null
  createdAt: string
  compositionName?: string
}

/** AI 计划指标记录。 */
export interface PlanRecord {
  id: number
  projectId: number
  taskId: number
  planId: string
  plannerUsed?: string
  totalSteps: number
  flowCallSteps: number
  assertionSteps: number
  compositionId?: number | null
  adoptedSteps: number
  modifiedSteps: number
  manualConfirmSteps: number
  firstValidationStatus?: string
  createdBy: number
  createdAt: string
  updatedAt: string
}

/** 18.3 编排指标看板数据。 */
export interface OrchestrationMetrics {
  reuseHitRate: number | null
  reuseHitTarget: number
  adoptionRate: number | null
  adoptionTarget: number
  firstPassRate: number | null
  firstPassTarget: number
  avgManualConfirmSteps: number | null
  planCount: number
  totalSteps: number
  flowCallSteps: number
  adoptedPlanCount: number
  adoptedSteps: number
  modifiedSteps: number
  firstValidated: number
  firstPassed: number
  regressionTotal: number
  regressionPassed: number
  regressionFailed: number
  pendingSuggestions: number
  adoptedSuggestions: number
}

export interface SaveRegressionPlanPayload {
  projectId: number
  compositionId?: number
  name?: string
  intervalMinutes?: number
  enabled?: boolean
}

export interface RegressionExecutionQuery {
  projectId: number
  compositionId?: number
  status?: RegressionExecutionStatus | ''
  pageNo?: number
  pageSize?: number
}

export interface RepairSuggestionQuery {
  projectId: number
  compositionId?: number
  status?: RepairSuggestionStatus | ''
  pageNo?: number
  pageSize?: number
}

export interface PlanAdoptionPayload {
  projectId: number
  planId: string
  compositionId: number
  adoptedSteps: number
  modifiedSteps: number
  manualConfirmSteps: number
}

// ── 回归计划 ──

/** 创建定时回归计划。 */
export async function createRegressionPlan(
  payload: SaveRegressionPlanPayload,
): Promise<RegressionPlan> {
  const { data } = await apiClient.post('/ai-script/regression/plans', toSnake(payload))
  return toCamel(data) as RegressionPlan
}

/** 获取项目回归计划列表。 */
export async function fetchRegressionPlans(projectId: number): Promise<RegressionPlan[]> {
  const { data } = await apiClient.get('/ai-script/regression/plans', {
    params: { project_id: projectId },
  })
  return toCamel(data ?? []) as RegressionPlan[]
}

/** 更新回归计划（间隔/名称/启停）。 */
export async function updateRegressionPlan(
  planId: number,
  payload: SaveRegressionPlanPayload,
): Promise<RegressionPlan> {
  const { data } = await apiClient.put(`/ai-script/regression/plans/${planId}`, toSnake(payload))
  return toCamel(data) as RegressionPlan
}

/** 删除回归计划。 */
export async function deleteRegressionPlan(planId: number, projectId: number): Promise<void> {
  await apiClient.delete(`/ai-script/regression/plans/${planId}`, {
    params: { project_id: projectId },
  })
}

/** 手动触发一次回归。 */
export async function triggerRegressionPlan(
  planId: number,
  projectId: number,
): Promise<RegressionExecution> {
  const { data } = await apiClient.post(`/ai-script/regression/plans/${planId}/trigger`, {
    project_id: projectId,
  })
  return toCamel(data) as RegressionExecution
}

/** 分页获取回归执行记录。 */
export async function fetchRegressionExecutions(
  params: RegressionExecutionQuery,
): Promise<{ list: RegressionExecution[]; total: number }> {
  const query: Record<string, number | string> = { project_id: params.projectId }
  if (params.compositionId) query.composition_id = params.compositionId
  if (params.status) query.status = params.status
  if (params.pageNo) query.page = params.pageNo
  if (params.pageSize) query.pageSize = params.pageSize

  const { data } = await apiClient.get('/ai-script/regression/executions', { params: query })
  const items = data?.items ?? data ?? []
  return {
    list: toCamel(items) as RegressionExecution[],
    total: data?.total ?? items.length,
  }
}

// ── AI 修复建议 ──

/** 分页获取修复建议列表。 */
export async function fetchRepairSuggestions(
  params: RepairSuggestionQuery,
): Promise<{ list: RepairSuggestion[]; total: number }> {
  const query: Record<string, number | string> = { project_id: params.projectId }
  if (params.compositionId) query.composition_id = params.compositionId
  if (params.status) query.status = params.status
  if (params.pageNo) query.page = params.pageNo
  if (params.pageSize) query.pageSize = params.pageSize

  const { data } = await apiClient.get('/ai-script/repair-suggestions', { params: query })
  const items = data?.items ?? data ?? []
  return {
    list: toCamel(items) as RepairSuggestion[],
    total: data?.total ?? items.length,
  }
}

/** 获取修复建议详情（含 Diff 与补丁全文）。 */
export async function fetchRepairSuggestionDetail(
  suggestionId: number,
  projectId: number,
): Promise<RepairSuggestion> {
  const { data } = await apiClient.get(`/ai-script/repair-suggestions/${suggestionId}`, {
    params: { project_id: projectId },
  })
  return toCamel(data) as RepairSuggestion
}

/** 人工确认应用修复建议（走手工补丁通道，14.3 约束）。 */
export async function applyRepairSuggestion(
  suggestionId: number,
  projectId: number,
): Promise<void> {
  await apiClient.post(`/ai-script/repair-suggestions/${suggestionId}/apply`, {
    project_id: projectId,
  })
}

/** 人工拒绝修复建议。 */
export async function rejectRepairSuggestion(
  suggestionId: number,
  projectId: number,
): Promise<void> {
  await apiClient.post(`/ai-script/repair-suggestions/${suggestionId}/reject`, {
    project_id: projectId,
  })
}

// ── 计划采纳上报与指标 ──

/** 「由计划生成编排」后上报采纳数据。 */
export async function reportPlanAdoption(payload: PlanAdoptionPayload): Promise<PlanRecord> {
  const { data } = await apiClient.post('/ai-script/plan-records/adoption', toSnake(payload))
  return toCamel(data) as PlanRecord
}

/** 获取 18.3 编排指标看板数据。 */
export async function fetchOrchestrationMetrics(
  projectId: number,
  days = 30,
): Promise<OrchestrationMetrics> {
  const { data } = await apiClient.get('/metrics/orchestration', {
    params: { project_id: projectId, days },
  })
  return toCamel(data) as OrchestrationMetrics
}
