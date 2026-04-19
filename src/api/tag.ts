/**
 * 标签管理 API 模块
 *
 * 封装标签相关的所有 HTTP 请求，包括分页列表、候选列表、
 * 创建、更新、删除等操作。所有函数返回解包后的业务数据。
 *
 * 对应后端路由：/api/v1/projects/:projectID/tags
 */
import { apiClient } from './client'

// ─── 类型定义 ───

/** 标签完整信息（列表接口返回） */
export interface Tag {
  id: number // 标签 ID
  project_id: number // 所属项目 ID
  name: string // 标签名称（2-50 字符）
  color: string // 标签颜色，#RRGGBB 格式
  description: string // 标签描述（可选）
  case_count: number // 关联的用例数量（后端子查询计算）
  created_by: number // 创建人用户 ID
  created_by_name: string // 创建人姓名（后端 JOIN 填充）
  created_by_avatar: string // 创建人头像路径（后端 JOIN 填充）
  created_at: string // 创建时间 ISO 字符串
  updated_at: string // 更新时间 ISO 字符串
}

/** 标签简要信息（用于选择器/筛选下拉，不含统计字段） */
export interface TagBrief {
  id: number // 标签 ID
  name: string // 标签名称
  color: string // 标签颜色
}

/** 标签列表查询参数 */
export interface TagListParams {
  keyword?: string // 名称模糊搜索关键词
  page?: number // 页码（默认 1）
  pageSize?: number // 每页条数（默认 20）
  sortBy?: string // 排序字段: case_count | name | created_at
}

/** 分页响应通用结构（由 Axios 拦截器解包后得到） */
export interface PageResult<T> {
  items: T[] // 当前页数据列表
  total: number // 符合条件的总记录数
  page: number // 当前页码
  pageSize: number // 每页条数
}

// ─── API 函数 ───

/**
 * 获取标签分页列表
 *
 * @param projectId - 项目 ID
 * @param params    - 查询参数（关键词、分页、排序）
 * @returns 分页结果，包含标签列表和总数
 */
export async function listTags(
  projectId: number,
  params?: TagListParams,
): Promise<PageResult<Tag>> {
  const { data } = await apiClient.get<PageResult<Tag>>(`/projects/${projectId}/tags`, { params })
  return data
}

/**
 * 获取标签候选列表（轻量版，不分页）
 * 用于标签选择器、筛选下拉等场景，只返回 id/name/color
 *
 * @param projectId - 项目 ID
 * @param keyword   - 可选的名称模糊搜索关键词
 * @returns 标签简要信息数组
 */
export async function listTagOptions(projectId: number, keyword?: string) {
  const { data } = await apiClient.get<TagBrief[]>(`/projects/${projectId}/tags/options`, {
    params: keyword ? { keyword } : undefined,
  })
  return data
}

/**
 * 创建标签
 *
 * @param projectId - 项目 ID
 * @param payload   - 标签信息（名称、颜色、描述）
 * @returns 创建成功的标签完整信息（含服务端生成的 ID 和时间戳）
 */
export async function createTag(
  projectId: number,
  payload: { name: string; color: string; description?: string },
) {
  const { data } = await apiClient.post<Tag>(`/projects/${projectId}/tags`, payload)
  return data
}

/**
 * 更新标签（部分更新，仅传需修改的字段）
 *
 * @param projectId - 项目 ID
 * @param tagId     - 标签 ID
 * @param payload   - 待更新字段（名称、颜色、描述，均可选）
 */
export async function updateTag(
  projectId: number,
  tagId: number,
  payload: { name?: string; color?: string; description?: string },
) {
  const { data } = await apiClient.put(`/projects/${projectId}/tags/${tagId}`, payload)
  return data
}

/**
 * 删除标签
 * 后端会在同一事务内解除所有用例关联，返回被解绑的用例数
 *
 * @param projectId - 项目 ID
 * @param tagId     - 标签 ID
 * @returns unlinked_case_count - 被解绑的用例数量
 */
export async function deleteTag(projectId: number, tagId: number) {
  const { data } = await apiClient.delete<{ unlinked_case_count: number }>(
    `/projects/${projectId}/tags/${tagId}`,
  )
  return data
}
