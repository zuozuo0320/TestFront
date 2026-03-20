import { apiClient } from './client'
import type { User, Role } from './types'

// ── Users ──

export async function listUsers() {
  const { data } = await apiClient.get('/users')
  return (Array.isArray(data) ? data : data.users ?? []) as User[]
}

export async function createUser(payload: {
  name: string
  email: string
  phone?: string
  avatar?: string
  role?: string
  role_ids: number[]
  project_ids: number[]
}) {
  const { data } = await apiClient.post<User>('/users', payload)
  return data
}

export async function updateUser(
  userId: number,
  payload: {
    name?: string
    email?: string
    phone?: string
    avatar?: string
    active?: boolean
    role_ids?: number[]
    project_ids?: number[]
  },
) {
  const { data } = await apiClient.put<User>(`/users/${userId}`, payload)
  return data
}

export async function deleteUserById(userId: number) {
  const { data } = await apiClient.delete<{ message: string }>(`/users/${userId}`)
  return data
}

// ── Roles ──

export async function listRoles() {
  const { data } = await apiClient.get('/roles')
  return (Array.isArray(data) ? data : data.roles ?? []) as Role[]
}

export async function createRole(payload: { name: string; description?: string }) {
  const { data } = await apiClient.post<Role>('/roles', payload)
  return data
}

export async function updateRoleById(
  roleId: number,
  payload: { name?: string; description?: string },
) {
  const { data } = await apiClient.put<Role>(`/roles/${roleId}`, payload)
  return data
}

export async function deleteRoleById(roleId: number) {
  const { data } = await apiClient.delete<{ message: string }>(`/roles/${roleId}`)
  return data
}

// ── Profile ──

export async function getMyProfile() {
  const { data } = await apiClient.get<User>('/users/me/profile')
  return data
}

export async function updateMyProfile(payload: {
  name?: string
  phone?: string
  avatar?: string
}) {
  const { data } = await apiClient.put<User>('/users/me/profile', payload)
  return data
}

export async function uploadMyAvatar(file: File) {
  const form = new FormData()
  form.append('avatar', file)
  const { data } = await apiClient.post<{ avatar: string }>('/users/me/avatar', form)
  return data
}
