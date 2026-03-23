import { apiClient } from './client'
import type { ProjectMember } from './types'

/** 获取项目成员列表 */
export async function listMembers(projectId: number) {
  const { data } = await apiClient.get(`/projects/${projectId}/members`)
  return (Array.isArray(data) ? data : data.members ?? []) as ProjectMember[]
}

/** 添加项目成员 */
export async function addMember(projectId: number, userId: number, role: string = 'member') {
  const { data } = await apiClient.post<ProjectMember>(`/projects/${projectId}/members`, {
    user_id: userId,
    role,
  })
  return data
}

/** 移除项目成员 */
export async function removeMember(projectId: number, userId: number) {
  const { data } = await apiClient.delete(`/projects/${projectId}/members/${userId}`)
  return data
}
