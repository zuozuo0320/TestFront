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
  steps: string
  priority: string
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

export async function listTestCases(projectId: number, params: { page: number; pageSize: number; keyword?: string }) {
  const { data } = await apiClient.get<TestCaseListResp>(`/projects/${projectId}/testcases`, { params })
  return data
}

export async function createTestCase(projectId: number, payload: { title: string; steps: string; priority: string }) {
  const { data } = await apiClient.post<TestCase>(`/projects/${projectId}/testcases`, payload)
  return data
}

export async function updateTestCase(projectId: number, testcaseId: number, payload: { title?: string; steps?: string; priority?: string }) {
  const { data } = await apiClient.put<TestCase>(`/projects/${projectId}/testcases/${testcaseId}`, payload)
  return data
}

export async function deleteTestCase(projectId: number, testcaseId: number) {
  const { data } = await apiClient.delete<{ message: string }>(`/projects/${projectId}/testcases/${testcaseId}`)
  return data
}
