/**
 * AI 模型配置 API
 * 管理 LLM 模型提供商、API Key 和模型版本
 */
import { apiClient } from './client'

/** AI 模型配置项 */
export interface AIModelConfig {
  id: number
  provider: string
  name: string
  model_id: string
  base_url: string
  api_key: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

/** 创建模型配置入参 */
export interface CreateAIModelInput {
  provider: string
  name: string
  model_id: string
  base_url: string
  api_key: string
}

/** 更新模型配置入参 */
export interface UpdateAIModelInput {
  provider?: string
  name?: string
  model_id?: string
  base_url?: string
  api_key?: string
}

/** 测试模型连接（编辑已有配置时可传 config_id，api_key 留空则用已存的） */
export async function testAIModelConnection(input: {
  api_key: string
  base_url: string
  model_id: string
  config_id?: number
}): Promise<{ status: string; message: string }> {
  const res = await apiClient.post('/ai-model-configs/test', input, { timeout: 30000 })
  return res.data
}

/** 查询所有模型配置 */
export async function listAIModelConfigs(): Promise<AIModelConfig[]> {
  const res = await apiClient.get('/ai-model-configs')
  return res.data
}

/** 查询当前启用的模型 */
export async function getActiveAIModel(): Promise<AIModelConfig> {
  const res = await apiClient.get('/ai-model-configs/active')
  return res.data
}

/** 创建模型配置 */
export async function createAIModelConfig(input: CreateAIModelInput): Promise<AIModelConfig> {
  const res = await apiClient.post('/ai-model-configs', input)
  return res.data
}

/** 更新模型配置 */
export async function updateAIModelConfig(
  id: number,
  input: UpdateAIModelInput,
): Promise<AIModelConfig> {
  const res = await apiClient.put(`/ai-model-configs/${id}`, input)
  return res.data
}

/** 删除模型配置 */
export async function deleteAIModelConfig(id: number): Promise<void> {
  await apiClient.delete(`/ai-model-configs/${id}`)
}

/** 启用指定模型 */
export async function activateAIModel(id: number): Promise<AIModelConfig> {
  const res = await apiClient.post(`/ai-model-configs/${id}/activate`)
  return res.data
}
