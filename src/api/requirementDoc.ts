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
  source_type: string // upload_file / paste_text / gitlab_issue
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
  source_url?: string
  sync_status?: string
}

/** GitLab 集成配置（Token 只返回脱敏状态） */
export interface GitLabConfig {
  enabled: boolean
  base_url: string
  project_path: string
  token_configured: boolean
  token_mask: string
}

/** 保存 GitLab 集成配置入参 */
export interface SaveGitLabConfigInput {
  base_url: string
  project_path: string
  token?: string
  enabled?: boolean
}

/** 导入 GitLab Issue 入参 */
export interface ImportGitLabIssueInput {
  issue_url: string
  include_comments: boolean
  analyze_images: boolean
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

/** 获取项目 GitLab 集成配置 */
export async function getGitLabConfig(projectId: number): Promise<GitLabConfig> {
  const { data } = await apiClient.get<GitLabConfig>(`/projects/${projectId}/integrations/gitlab`)
  return normalizeGitLabConfig(data)
}

/** 保存项目 GitLab 集成配置 */
export async function saveGitLabConfig(
  projectId: number,
  payload: SaveGitLabConfigInput,
): Promise<GitLabConfig> {
  const { data } = await apiClient.put<GitLabConfig>(
    `/projects/${projectId}/integrations/gitlab`,
    payload,
  )
  return normalizeGitLabConfig(data)
}

/** 测试项目 GitLab 集成配置 */
export async function testGitLabConfig(projectId: number): Promise<void> {
  await apiClient.post(`/projects/${projectId}/integrations/gitlab/test`)
}

/** 从 GitLab Issue 导入需求文档 */
export async function importGitLabIssue(
  projectId: number,
  payload: ImportGitLabIssueInput,
): Promise<RequirementDoc> {
  const { data } = await apiClient.post<RequirementDoc>(
    `/projects/${projectId}/requirement-docs/gitlab-issues/import`,
    payload,
    { timeout: 120000 },
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

function normalizeGitLabConfig(config: GitLabConfig | null | undefined): GitLabConfig {
  return {
    enabled: !!config?.enabled,
    base_url: config?.base_url || '',
    project_path: config?.project_path || '',
    token_configured: !!config?.token_configured,
    token_mask: config?.token_mask || '',
  }
}
