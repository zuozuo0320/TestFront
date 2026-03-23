import { apiClient } from './client'
import type { User, Role } from './types'

// ── Users ──

/** 获取用户列表 */
export async function listUsers() {
  const { data } = await apiClient.get('/users')
  return (Array.isArray(data) ? data : data.users ?? []) as User[]
}

/** 创建用户（含初始密码） */
export async function createUser(payload: {
  name: string
  email: string
  phone?: string
  avatar?: string
  password: string
  role?: string
  role_ids: number[]
  project_ids: number[]
}) {
  const { data } = await apiClient.post<User>('/users', payload)
  return data
}

/** 更新用户 */
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

/** 删除用户 */
export async function deleteUserById(userId: number) {
  const { data } = await apiClient.delete<{ message: string }>(`/users/${userId}`)
  return data
}

/** 管理员重置用户密码 */
export async function resetUserPassword(userId: number, newPassword: string) {
  const { data } = await apiClient.put(`/users/${userId}/reset-password`, { new_password: newPassword })
  return data
}

// ── Roles ──

/** 获取角色列表 */
export async function listRoles() {
  const { data } = await apiClient.get('/roles')
  return (Array.isArray(data) ? data : data.roles ?? []) as Role[]
}

/** 创建角色 */
export async function createRole(payload: { name: string; display_name?: string; description?: string }) {
  const { data } = await apiClient.post<Role>('/roles', payload)
  return data
}

/** 更新角色 */
export async function updateRoleById(
  roleId: number,
  payload: { name?: string; display_name?: string; description?: string },
) {
  const { data } = await apiClient.put<Role>(`/roles/${roleId}`, payload)
  return data
}

/** 删除角色 */
export async function deleteRoleById(roleId: number) {
  const { data } = await apiClient.delete<{ message: string }>(`/roles/${roleId}`)
  return data
}

// ── Profile ──

/** 获取当前用户资料 */
export async function getMyProfile() {
  const { data } = await apiClient.get<User>('/users/me/profile')
  return data
}

/** 更新当前用户资料 */
export async function updateMyProfile(payload: {
  name?: string
  phone?: string
  avatar?: string
}) {
  const { data } = await apiClient.put<User>('/users/me/profile', payload)
  return data
}

/** 修改密码 */
export async function changeMyPassword(oldPassword: string, newPassword: string) {
  const { data } = await apiClient.put('/users/me/password', {
    old_password: oldPassword,
    new_password: newPassword,
  })
  return data
}

/** 上传头像 */
export async function uploadMyAvatar(file: File) {
  const form = new FormData()
  form.append('avatar', file)
  const { data } = await apiClient.post<{ avatar: string }>('/users/me/avatar', form)
  return data
}
