import { apiClient } from './client'
import type { LoginResp } from './types'

export async function loginByEmail(email: string, password: string) {
  const { data } = await apiClient.post<LoginResp>('/auth/login', { email, password })
  return data
}
