import { apiClient } from './client'
import type { ModuleTreeNode, Module } from './types'

// Get module tree with case counts
export async function getModuleTree(projectId: number) {
  const { data } = await apiClient.get<{ data: ModuleTreeNode[] }>(
    `/projects/${projectId}/modules`,
  )
  return data
}

// Create a module
export async function createModule(projectId: number, parentId: number, name: string) {
  const { data } = await apiClient.post<{ data: Module }>(
    `/projects/${projectId}/modules`,
    { parent_id: parentId, name },
  )
  return data
}

// Rename a module
export async function renameModule(projectId: number, moduleId: number, name: string) {
  const { data } = await apiClient.put<{ data: Module }>(
    `/projects/${projectId}/modules/${moduleId}`,
    { name },
  )
  return data
}

// Move a module (change parent and/or sort order)
export async function moveModule(
  projectId: number,
  moduleId: number,
  parentId: number,
  sortOrder: number,
) {
  const { data } = await apiClient.put(
    `/projects/${projectId}/modules/${moduleId}/move`,
    { parent_id: parentId, sort_order: sortOrder },
  )
  return data
}

// Delete a module (leaf only)
export async function deleteModule(projectId: number, moduleId: number) {
  const { data } = await apiClient.delete(
    `/projects/${projectId}/modules/${moduleId}`,
  )
  return data
}
