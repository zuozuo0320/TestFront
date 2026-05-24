/**
 * 需求文档 API 模块
 *
 * 对应后端路由：/api/v1/projects/:projectID/requirement-docs
 */
import { apiClient } from './client'

// ─── 类型定义 ───

/** 需求文档完整信息 */
export interface RequirementDoc {
  id: number
  project_id: number
  title: string
  source_type: string // upload / paste
  file_format: string
  file_path: string
  file_size: number
  raw_content: string | null
  word_count: number
  original_word_count: number
  truncated: boolean
  parse_status: string // not_parsed / parsing / parsed / parse_failed
  parse_error: string
  remark: string
  created_by: number
  created_at: string
  updated_at: string
}

/** 文档列表查询参数 */
export interface DocListParams {
  keyword?: string
  parse_status?: string
  source_type?: string
  page?: number
  page_size?: number
}

/** 分页结果 */
export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

// ─── API 函数 ───

/** 上传文件创建需求文档 */
export async function uploadRequirementDoc(
  projectId: number,
  file: File,
  title: string,
  remark?: string,
): Promise<RequirementDoc> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('title', title)
  if (remark) formData.append('remark', remark)

  const { data } = await apiClient.post<RequirementDoc>(
    `/projects/${projectId}/requirement-docs/upload`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 },
  )
  return data
}

/** 粘贴文本创建需求文档 */
export async function pasteRequirementDoc(
  projectId: number,
  payload: { title: string; raw_content: string; remark?: string },
): Promise<RequirementDoc> {
  const { data } = await apiClient.post<RequirementDoc>(
    `/projects/${projectId}/requirement-docs/paste`,
    payload,
  )
  return data
}

/** 获取需求文档分页列表 */
export async function listRequirementDocs(
  projectId: number,
  params?: DocListParams,
): Promise<PageResult<RequirementDoc>> {
  const { data } = await apiClient.get<PageResult<RequirementDoc>>(
    `/projects/${projectId}/requirement-docs`,
    { params },
  )
  return data
}

/** 获取需求文档详情 */
export async function getRequirementDoc(projectId: number, docId: number): Promise<RequirementDoc> {
  const { data } = await apiClient.get<RequirementDoc>(
    `/projects/${projectId}/requirement-docs/${docId}`,
  )
  return data
}

/** 删除需求文档 */
export async function deleteRequirementDoc(projectId: number, docId: number): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/requirement-docs/${docId}`)
}
