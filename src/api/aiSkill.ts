/**
 * AI Skill 模板管理 API 模块
 *
 * 对应后端路由：/api/v1/projects/:projectID/ai-skills
 */
import { apiClient } from './client'

// ─── 类型定义 ───

/** AI Skill 完整信息 */
export interface AISkill {
  id: number
  project_id: number // 0 = 系统级
  skill_key: string
  name: string
  scope: string // functional / api / compat / security / custom
  description: string
  prompt_template: string
  output_schema: string
  is_active: boolean
  is_system: boolean
  lock_version: number
  created_by: number
  created_at: string
  updated_at: string
}

/** 创建 Skill 请求 */
export interface CreateSkillPayload {
  skill_key: string
  name: string
  scope: string
  description?: string
  prompt_template: string
  output_schema?: string
}

/** 编辑 Skill 请求 */
export interface UpdateSkillPayload {
  name?: string
  scope?: string
  description?: string
  prompt_template?: string
  output_schema?: string
  lock_version: number
}

// ─── API 函数 ───

/** 获取项目可用 Skill 列表（系统 + 项目级） */
export async function listAISkills(projectId: number): Promise<AISkill[]> {
  const { data } = await apiClient.get<AISkill[]>(`/projects/${projectId}/ai-skills`)
  return data
}

/** 获取 Skill 详情 */
export async function getAISkill(projectId: number, skillId: number): Promise<AISkill> {
  const { data } = await apiClient.get<AISkill>(`/projects/${projectId}/ai-skills/${skillId}`)
  return data
}

/** 创建项目级 Skill */
export async function createAISkill(
  projectId: number,
  payload: CreateSkillPayload,
): Promise<AISkill> {
  const { data } = await apiClient.post<AISkill>(`/projects/${projectId}/ai-skills`, payload)
  return data
}

/** 编辑 Skill (CAS) */
export async function updateAISkill(
  projectId: number,
  skillId: number,
  payload: UpdateSkillPayload,
): Promise<AISkill> {
  const { data } = await apiClient.put<AISkill>(
    `/projects/${projectId}/ai-skills/${skillId}`,
    payload,
  )
  return data
}

/** 删除 Skill */
export async function deleteAISkill(projectId: number, skillId: number): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/ai-skills/${skillId}`)
}

/** 启用/禁用 Skill */
export async function toggleAISkill(
  projectId: number,
  skillId: number,
  isActive: boolean,
): Promise<void> {
  await apiClient.post(`/projects/${projectId}/ai-skills/${skillId}/toggle`, {
    is_active: isActive,
  })
}
