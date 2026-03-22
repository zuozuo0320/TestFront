import { apiClient } from './client'
import type { Project, ProjectMember } from './types'

/** 获取项目列表 */
export async function listProjects() {
  const { data } = await apiClient.get('/projects')
  return (Array.isArray(data) ? data : data.projects ?? []) as Project[]
}

/** 创建项目 */
export async function createProject(payload: { name: string; description?: string }) {
  const { data } = await apiClient.post<Project>('/projects', payload)
  return data
}

/** 更新项目 */
export async function updateProject(
  projectId: number,
  payload: { name?: string; description?: string; status?: 'active' | 'archived' },
) {
  const { data } = await apiClient.put<Project>(`/projects/${projectId}`, payload)
  return data
}

/** 删除项目 */
export async function deleteProject(projectId: number) {
  const { data } = await apiClient.delete<{ message: string }>(`/projects/${projectId}`)
  return data
}

/** 归档项目 */
export async function archiveProject(projectId: number) {
  const { data } = await apiClient.put<Project>(`/projects/${projectId}`, { status: 'archived' })
  return data
}

/** 恢复项目 */
export async function unarchiveProject(projectId: number) {
  const { data } = await apiClient.put<Project>(`/projects/${projectId}`, { status: 'active' })
  return data
}

/** 获取项目成员列表 */
export async function listProjectMembers(projectId: number) {
  const { data } = await apiClient.get(`/projects/${projectId}/members`)
  return (Array.isArray(data) ? data : data.members ?? []) as ProjectMember[]
}

/** 添加项目成员 */
export async function addProjectMember(projectId: number, userId: number, role: string = 'member') {
  const { data } = await apiClient.post<ProjectMember>(`/projects/${projectId}/members`, {
    user_id: userId,
    role,
  })
  return data
}

/** 移除项目成员 */
export async function removeProjectMember(projectId: number, userId: number) {
  const { data } = await apiClient.delete(`/projects/${projectId}/members/${userId}`)
  return data
}
