import axios from 'axios'

const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()

export const apiClient = axios.create({
  baseURL: envBase && envBase.length > 0 ? envBase : 'http://localhost:8080/api/v1',
  timeout: 10000,
})

apiClient.interceptors.request.use((config) => {
  const userId = localStorage.getItem('tp-user-id') || '2'
  config.headers = config.headers || {}
  config.headers['X-User-ID'] = userId
  return config
})
