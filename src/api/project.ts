import { apiClient } from './client'
import type { Project } from './types'

export async function listProjects() {
  const { data } = await apiClient.get('/projects')
  return (Array.isArray(data) ? data : data.projects ?? []) as Project[]
}

export async function createProject(payload: { name: string; description?: string }) {
  const { data } = await apiClient.post<Project>('/projects', payload)
  return data
}
