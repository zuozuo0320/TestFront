/**

 * 需求智生-生成任务 & 产物 API 模块

 *

 * 对应后端路由：/api/v1/projects/:projectID/requirement-gen

 */

import { apiClient } from './client'

// ─── 类型定义 ───

/** 生成任务完整信息 */

export interface GenTask {
  id: number

  project_id: number

  requirement_doc_id: number

  skill_id: number

  ai_model_config_id: number

  ai_model_snapshot: string

  task_name: string

  status: string // pending / running / success / failed / partially_closed / fully_closed

  target_module_id: number

  default_level: string

  max_cases: number

  extra_prompt: string

  generated_count: number

  adopted_count: number

  discarded_count: number

  prompt_tokens: number

  completion_tokens: number

  duration_ms: number

  fail_reason: string

  executor_node_id: string

  request_id: string

  last_heartbeat_at: string | null

  created_by: number

  created_at: string

  updated_at: string
}

/** 生成产物 */

export interface GenResult {
  id: number

  task_id: number

  seq_no: number

  title: string

  level: string

  precondition: string

  steps: string // JSON 字符串

  postcondition: string

  remark: string

  tags_suggested: string

  ai_confidence: number

  raw_json: string

  adopted: boolean

  adopted_by: number

  adopted_case_id: number

  discarded: boolean

  discarded_by: number

  lock_version: number

  created_at: string

  updated_at: string
}

/** 任务列表查询参数 */

export interface GenTaskListParams {
  status?: string

  requirement_doc_id?: number

  page?: number

  page_size?: number
}

/** 分页结果 */

export interface PageResult<T> {
  items: T[]

  total: number

  page: number

  pageSize: number
}

/** 创建任务请求 */

export interface CreateGenTaskPayload {
  requirement_doc_id: number

  skill_id: number

  task_name: string

  target_module_id?: number

  default_level?: string

  max_cases?: number

  extra_prompt?: string
}

// ─── API 函数 ───

/** 创建生成任务 */

export async function createGenTask(
  projectId: number,

  payload: CreateGenTaskPayload,
): Promise<GenTask> {
  const { data } = await apiClient.post<GenTask>(
    `/projects/${projectId}/requirement-gen/tasks`,

    payload,
  )

  return data
}

/** 获取生成任务列表 */

export async function listGenTasks(
  projectId: number,

  params?: GenTaskListParams,
): Promise<PageResult<GenTask>> {
  const { data } = await apiClient.get<PageResult<GenTask>>(
    `/projects/${projectId}/requirement-gen/tasks`,

    { params },
  )

  return data
}

/** 获取生成任务详情 */

export async function getGenTask(projectId: number, taskId: number): Promise<GenTask> {
  const { data } = await apiClient.get<GenTask>(
    `/projects/${projectId}/requirement-gen/tasks/${taskId}`,
  )

  return data
}

/** 删除生成任务 */
export async function deleteGenTask(projectId: number, taskId: number): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/requirement-gen/tasks/${taskId}`)
}

/** 获取任务产物列表 */

export async function listGenResults(projectId: number, taskId: number): Promise<GenResult[]> {
  const { data } = await apiClient.get<GenResult[]>(
    `/projects/${projectId}/requirement-gen/tasks/${taskId}/results`,
  )

  return data
}

/** 采纳产物 */

export async function adoptResult(projectId: number, resultId: number): Promise<void> {
  await apiClient.post(`/projects/${projectId}/requirement-gen/results/${resultId}/adopt`)
}

/** 丢弃产物 */

export async function discardResult(projectId: number, resultId: number): Promise<void> {
  await apiClient.post(`/projects/${projectId}/requirement-gen/results/${resultId}/discard`)
}

/** 关闭任务 */

export async function closeGenTask(projectId: number, taskId: number): Promise<void> {
  await apiClient.post(`/projects/${projectId}/requirement-gen/tasks/${taskId}/close`)
}

// ─── 智能生成 ───

/** 智能生成请求 */

export interface SmartGeneratePayload {
  requirement_doc_id: number

  task_name_prefix?: string

  target_module_id?: number

  default_level?: string

  max_cases_per_skill?: number

  extra_prompt?: string
}

/** Skill 推荐项 */

export interface SkillRecommendation {
  skill_id: number

  skill_key: string

  reason: string
}

/** 智能生成响应 */

export interface SmartGenerateResult {
  recommended_skills: SkillRecommendation[]

  created_tasks: GenTask[]
}

/** 智能生成：AI 分析需求 → 自动匹配 Skill → 批量创建任务 */

export async function smartGenerate(
  projectId: number,

  payload: SmartGeneratePayload,
): Promise<SmartGenerateResult> {
  const { data } = await apiClient.post<SmartGenerateResult>(
    `/projects/${projectId}/requirement-gen/smart-generate`,

    payload,
  )

  return data
}
