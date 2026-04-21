import { apiClient } from './client'

export interface AuditLog {
  id: number
  actor_id: number
  action: string
  target_type: string
  target_id: number
  before_data?: string
  after_data?: string
  created_at: string
}

/** 获取最近审计日志（仅管理员可访问，后端默认返回最近 100 条） */
export async function listAuditLogs() {
  const { data } = await apiClient.get<{ logs: AuditLog[] }>('/audit-logs')
  return data.logs || []
}
