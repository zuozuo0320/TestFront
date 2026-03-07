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

export async function loginByEmail(email: string, password: string) {
  const { data } = await apiClient.post<LoginResp>('/auth/login', { email, password })
  return data
}

export async function listProjects() {
  const { data } = await apiClient.get('/projects')
  return data.projects ?? []
}

export async function listTestCases(projectId: number) {
  const { data } = await apiClient.get(`/projects/${projectId}/testcases`)
  return data.testcases ?? []
}
