import axios from 'axios'

const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()

export const apiClient = axios.create({
  baseURL: envBase && envBase.length > 0 ? envBase : 'http://localhost:8080/api/v1',
  timeout: 12000,
})

apiClient.interceptors.request.use((config) => {
  const userId = localStorage.getItem('tp-user-id')
  if (userId) {
    config.headers = config.headers || {}
    config.headers['X-User-ID'] = userId
  }
  return config
})

export type LoginResp = {
  token: string
  user_id: number
  user: {
    id: number
    name: string
    email: string
    role: string
  }
}

export type Project = {
  id: number
  name: string
  description: string
}

export type TestCase = {
  id: number
  project_id: number
  title: string
  level: string
  review_result: string
  exec_result: string
  module_path: string
  tags: string
  steps: string
  priority: string
  created_by: number
  created_by_name?: string
  updated_by: number
  updated_by_name?: string
  created_at?: string
  updated_at?: string
}

export type TestCaseListResp = {
  items: TestCase[]
  total: number
  page: number
  pageSize: number
}

export async function loginByEmail(email: string, password: string) {
  const { data } = await apiClient.post<LoginResp>('/auth/login', { email, password })
  return data
}

export async function listProjects() {
  const { data } = await apiClient.get('/projects')
  return (data.projects ?? []) as Project[]
}

export async function listTestCases(projectId: number, params: {
  page: number
  pageSize: number
  keyword?: string
  level?: string
  review_result?: string
  exec_result?: string
  sortBy?: 'id' | 'created_at' | 'updated_at'
  sortOrder?: 'asc' | 'desc'
}) {
  const { data } = await apiClient.get<TestCaseListResp>(`/projects/${projectId}/testcases`, { params })
  return data
}

export async function createTestCase(projectId: number, payload: {
  title: string
  level?: string
  review_result?: string
  exec_result?: string
  module_path?: string
  tags?: string
  steps?: string
  priority?: string
}) {
  const { data } = await apiClient.post<TestCase>(`/projects/${projectId}/testcases`, payload)
  return data
}

export async function updateTestCase(projectId: number, testcaseId: number, payload: {
  title?: string
  level?: string
  review_result?: string
  exec_result?: string
  module_path?: string
  tags?: string
  steps?: string
  priority?: string
}) {
  const { data } = await apiClient.put<TestCase>(`/projects/${projectId}/testcases/${testcaseId}`, payload)
  return data
}

export async function deleteTestCase(projectId: number, testcaseId: number) {
  const { data } = await apiClient.delete<{ message: string }>(`/projects/${projectId}/testcases/${testcaseId}`)
  return data
}

export type Role = {
  id: number
  name: string
  description?: string
}

export type User = {
  id: number
  name: string
  email: string
  phone?: string
  avatar?: string
  role: string
  active: boolean
  deleted_at?: string | null
}

export async function listUsers() {
  const { data } = await apiClient.get('/users')
  return (data.users ?? []) as User[]
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

export async function updateUser(userId: number, payload: {
  name?: string
  email?: string
  phone?: string
  avatar?: string
  active?: boolean
  role_ids?: number[]
  project_ids?: number[]
}) {
  const { data } = await apiClient.put<User>(`/users/${userId}`, payload)
  return data
}

export async function deleteUserById(userId: number) {
  const { data } = await apiClient.delete<{ message: string }>(`/users/${userId}`)
  return data
}

export async function listRoles() {
  const { data } = await apiClient.get('/roles')
  return (data.roles ?? []) as Role[]
}

export async function createRole(payload: { name: string; description?: string }) {
  const { data } = await apiClient.post<Role>('/roles', payload)
  return data
}

export async function updateRoleById(roleId: number, payload: { name?: string; description?: string }) {
  const { data } = await apiClient.put<Role>(`/roles/${roleId}`, payload)
  return data
}

export async function deleteRoleById(roleId: number) {
  const { data } = await apiClient.delete<{ message: string }>(`/roles/${roleId}`)
  return data
}

export async function updateMyProfile(payload: { name?: string; email?: string; phone?: string; avatar?: string }) {
  const { data } = await apiClient.put<User>('/users/me/profile', payload)
  return data
}
