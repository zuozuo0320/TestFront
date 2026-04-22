import axios from 'axios'

const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()

// 默认走相对路径 '/api/v1'：dev 下由 Vite proxy 转发到 127.0.0.1:8080，
// 部署下由网关/反向代理统一处理。局域网访问时前端同源（http://<ip>:5173）
// 自动拼 /api/v1 命中 proxy，无需切换 baseURL。
export const apiClient = axios.create({
  baseURL: envBase && envBase.length > 0 ? envBase : '/api/v1',
  timeout: 12000,
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('tp-token')
  if (token) {
    config.headers = config.headers || {}
    config.headers['Authorization'] = `Bearer ${token}`
  }
  const userId = localStorage.getItem('tp-user-id')
  if (userId) {
    config.headers = config.headers || {}
    config.headers['X-User-ID'] = userId
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => {
    // Auto-unwrap the backend's {code, message, data} wrapper
    const body = response.data
    if (body && typeof body === 'object' && 'code' in body && 'data' in body) {
      // Handle paginated responses: {code, message, data: [...], total, page, page_size}
      if ('total' in body && 'page' in body) {
        response.data = {
          items: body.data,
          total: body.total,
          page: body.page,
          pageSize: body.page_size,
        }
      } else {
        response.data = body.data
      }
    }
    return response
  },
  (error) => {
    // 401 → token 过期或无效，清除凭证并跳转登录
    if (error.response?.status === 401) {
      const isLoginRequest = error.config?.url?.includes('/auth/login')
      if (!isLoginRequest) {
        localStorage.removeItem('tp-token')
        localStorage.removeItem('tp-user-id')
        window.location.reload()
      }
    }
    return Promise.reject(error)
  },
)
