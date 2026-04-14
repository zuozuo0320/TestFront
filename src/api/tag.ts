import { apiClient } from './client'

// ─── 类型定义 ───

export interface Tag {
  id: number
  project_id: number
  name: string
  color: string
  description: string
  case_count: number
  created_by: number
  created_by_name: string
  created_by_avatar: string
  created_at: string
  updated_at: string
}

export interface TagBrief {
  id: number
  name: string
  color: string
}

export interface TagListParams {
  keyword?: string
  page?: number
  pageSize?: number
}

// ─── API 函数 ───

/** 标签分页列表 */
export async function listTags(projectId: number, params?: TagListParams) {
  const { data } = await apiClient.get(`/projects/${projectId}/tags`, { params })
  return data
}

/** 标签候选列表（轻量，不分页） */
export async function listTagOptions(projectId: number, keyword?: string) {
  const { data } = await apiClient.get<TagBrief[]>(`/projects/${projectId}/tags/options`, {
    params: keyword ? { keyword } : undefined,
  })
  return data
}

/** 创建标签 */
export async function createTag(
  projectId: number,
  payload: { name: string; color: string; description?: string },
) {
  const { data } = await apiClient.post<Tag>(`/projects/${projectId}/tags`, payload)
  return data
}

/** 更新标签 */
export async function updateTag(
  projectId: number,
  tagId: number,
  payload: { name?: string; color?: string; description?: string },
) {
  const { data } = await apiClient.put(`/projects/${projectId}/tags/${tagId}`, payload)
  return data
}

/** 删除标签 */
export async function deleteTag(projectId: number, tagId: number) {
  const { data } = await apiClient.delete<{ unlinked_case_count: number }>(
    `/projects/${projectId}/tags/${tagId}`,
  )
  return data
}
