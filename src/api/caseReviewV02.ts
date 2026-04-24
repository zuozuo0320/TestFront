/**
 * 用例评审 v0.2 增量 API：规则引擎、Action Items（缺陷）、项目 settings
 *
 * 为什么独立成文件：
 *  - 与 v0.1 的 `caseReview.ts` 解耦，后续下线 v0.1 时便于整体移除
 *  - 类型与接口在同一文件内就近定义，前端使用方只需导入一处
 */

import type { AxiosRequestConfig } from 'axios'

import { apiClient } from './client'

/** 轻量请求选项：仅透出 signal */
interface RequestOptions {
  signal?: AxiosRequestConfig['signal']
}

// ─── 枚举常量（与后端 `internal/model/models.go` 常量对齐） ───

/** AI 门禁状态 */
export const AI_GATE_STATUS = {
  NotStarted: 'not_started',
  Running: 'running',
  Passed: 'passed',
  Failed: 'failed',
  Timeout: 'timeout',
  Bypassed: 'bypassed',
} as const
export type AIGateStatus = (typeof AI_GATE_STATUS)[keyof typeof AI_GATE_STATUS]

/** 评审角色 */
export const REVIEW_ROLE = {
  Primary: 'primary',
  Shadow: 'shadow',
} as const
export type ReviewRole = (typeof REVIEW_ROLE)[keyof typeof REVIEW_ROLE]

/** 严重度 */
export const REVIEW_SEVERITY = {
  Critical: 'critical',
  Major: 'major',
  Minor: 'minor',
} as const
export type ReviewSeverity = (typeof REVIEW_SEVERITY)[keyof typeof REVIEW_SEVERITY]

/** 缺陷状态 */
export const DEFECT_STATUS = {
  Open: 'open',
  Resolved: 'resolved',
  Disputed: 'disputed',
} as const
export type DefectStatus = (typeof DEFECT_STATUS)[keyof typeof DEFECT_STATUS]

/** 缺陷来源 */
export const DEFECT_SOURCE = {
  PrimaryReview: 'primary_review',
  AIGate: 'ai_gate',
} as const
export type DefectSource = (typeof DEFECT_SOURCE)[keyof typeof DEFECT_SOURCE]

// ─── 对象类型 ───

/** 规则引擎单条命中 */
export interface RuleFinding {
  id: string
  rule: string
  message: string
  severity: ReviewSeverity
  field: string
  value?: string
}

/** 规则引擎运行报告 */
export interface RuleRunReport {
  item_id: number
  ai_gate_status: AIGateStatus
  passed: boolean
  findings: RuleFinding[]
  critical_count: number
  major_count: number
  minor_count: number
  defect_ids: number[]
  run_at: string
}

/** 计划级 AI 评审报告里的单条评审项摘要 */
export interface PlanItemSummary {
  item_id: number
  testcase_id: number
  title_snapshot: string
  ai_gate_status: AIGateStatus
  passed: boolean
  critical_count: number
  major_count: number
  minor_count: number
  defect_count: number
  error?: string
}

/** 计划级 AI 评审聚合报告 */
export interface PlanRunReport {
  review_id: number
  total_count: number
  passed_count: number
  failed_count: number
  error_count: number
  items: PlanItemSummary[]
  run_at: string
}

/** 评审缺陷 / Action Item */
export interface CaseReviewDefect {
  id: number
  review_id: number
  review_item_id: number
  project_id: number
  record_id: number
  source: DefectSource
  title: string
  severity: ReviewSeverity
  status: DefectStatus
  dispute_reason?: string
  resolve_note?: string
  created_by: number
  created_at: string
  resolved_by?: number
  resolved_by_name?: string
  resolved_at?: string | null
  updated_at: string
}

/** 项目级 settings */
export interface ProjectSettings {
  allow_self_review: boolean
}

// ─── Action Items ───

export interface ListDefectsParams {
  page?: number
  pageSize?: number
  source?: DefectSource
  status?: DefectStatus
  severity?: ReviewSeverity
}

/** 规则引擎 rerun：对单个评审项重跑 Layer 1 规则 */
export async function rerunAIGate(
  projectId: number,
  reviewId: number,
  itemId: number,
): Promise<RuleRunReport> {
  const { data } = await apiClient.post<RuleRunReport>(
    `/projects/${projectId}/case-reviews/${reviewId}/items/${itemId}/ai-gate/rerun`,
  )
  return data
}

/** 计划级 AI 评审：对整个评审计划一键批量执行规则引擎，返回聚合报告 */
export async function runPlanAIGate(projectId: number, reviewId: number): Promise<PlanRunReport> {
  const { data } = await apiClient.post<PlanRunReport>(
    `/projects/${projectId}/case-reviews/${reviewId}/ai-gate/run-all`,
  )
  return data
}

/** 计划级 Action Items 分页列表 */
export async function listReviewDefects(
  projectId: number,
  reviewId: number,
  params: ListDefectsParams = {},
  options: RequestOptions = {},
) {
  const { data } = await apiClient.get<{
    items: CaseReviewDefect[]
    total: number
    page: number
    pageSize: number
  }>(`/projects/${projectId}/case-reviews/${reviewId}/defects`, {
    params,
    signal: options.signal,
  })
  return data
}

/** 单评审项下的 Action Items */
export async function listItemDefects(
  projectId: number,
  reviewId: number,
  itemId: number,
  options: RequestOptions = {},
) {
  const { data } = await apiClient.get<{ items: CaseReviewDefect[] }>(
    `/projects/${projectId}/case-reviews/${reviewId}/items/${itemId}/defects`,
    { signal: options.signal },
  )
  return data
}

/** 查询单条 Action Item */
export async function getDefect(projectId: number, defectId: number) {
  const { data } = await apiClient.get<CaseReviewDefect>(
    `/projects/${projectId}/case-review-defects/${defectId}`,
  )
  return data
}

/** Author 标记为已解决 */
export async function resolveDefect(projectId: number, defectId: number, note = '') {
  const { data } = await apiClient.post<{ status: DefectStatus }>(
    `/projects/${projectId}/case-review-defects/${defectId}/resolve`,
    { note },
  )
  return data
}

/** Author 对 Action Item 提异议 */
export async function disputeDefect(projectId: number, defectId: number, reason: string) {
  const { data } = await apiClient.post<{ status: DefectStatus }>(
    `/projects/${projectId}/case-review-defects/${defectId}/dispute`,
    { reason },
  )
  return data
}

/** Moderator 重开 Action Item */
export async function reopenDefect(projectId: number, defectId: number) {
  const { data } = await apiClient.post<{ status: DefectStatus }>(
    `/projects/${projectId}/case-review-defects/${defectId}/reopen`,
  )
  return data
}

// ─── 项目 Settings ───

/** 读取项目级 settings（默认 allow_self_review=false） */
export async function getProjectSettings(projectId: number) {
  const { data } = await apiClient.get<ProjectSettings>(`/projects/${projectId}/settings`)
  return data
}

/** 局部更新项目级 settings；字段使用指针语义（undefined 不修改） */
export async function updateProjectSettings(
  projectId: number,
  payload: { allow_self_review?: boolean },
) {
  const { data } = await apiClient.put<ProjectSettings>(`/projects/${projectId}/settings`, payload)
  return data
}
