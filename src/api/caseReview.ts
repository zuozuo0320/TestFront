import { apiClient } from './client'

// ─── 类型定义 ───

export interface CaseReview {
  id: number
  project_id: number
  name: string
  module_id: number
  review_mode: string
  status: string
  description: string
  planned_start_at: string | null
  planned_end_at: string | null
  case_total_count: number
  pending_count: number
  approved_count: number
  rejected_count: number
  needs_update_count: number
  pass_rate: number
  created_by: number
  updated_by: number
  created_by_name?: string
  created_by_avatar?: string
  reviewer_ids?: number[]
  reviewer_names?: string[]
  created_at: string
  updated_at: string
}

export interface CaseReviewItem {
  id: number
  review_id: number
  project_id: number
  testcase_id: number
  testcase_version: string
  module_id: number
  title_snapshot: string
  review_status: string
  final_result: string
  current_round_no: number
  reviewed_at: string | null
  latest_comment: string
  sort_order: number
  created_by: number
  updated_by: number
  created_at: string
  updated_at: string
  reviewers?: CaseReviewItemReviewer[]
}

export interface CaseReviewItemReviewer {
  id: number
  review_id: number
  review_item_id: number
  reviewer_id: number
  reviewer_name?: string
  review_status: string
  latest_result: string
  latest_comment: string
  reviewed_at: string | null
}

export interface CaseReviewRecord {
  id: number
  review_id: number
  review_item_id: number
  testcase_id: number
  reviewer_id: number
  reviewer_name?: string
  round_no: number
  result: string
  comment: string
  aggregate_result_after_submit: string
  created_at: string
}

export interface SubmitReviewOutput {
  item_id: number
  review_status: string
  final_result: string
  current_round_no: number
  testcase_status: string
  testcase_review_result: string
  next_pending_item_id: number | null
}

export interface BatchReviewOutput {
  success_count: number
  fail_count: number
  fail_reasons?: string[]
}

// ─── 查询参数 ───

export interface ReviewListParams {
  page: number
  pageSize: number
  view?: 'all' | 'assigned' | 'created'
  keyword?: string
  status?: string
  review_mode?: string
  reviewer_id?: number
  module_id?: number
  created_by?: number
}

export interface ReviewItemListParams {
  page: number
  pageSize: number
  keyword?: string
  review_status?: string
  final_result?: string
  reviewer_id?: number
  module_id?: number
}

// ─── 请求体 ───

export interface CreateReviewPayload {
  name: string
  module_id?: number
  review_mode: string
  default_reviewer_ids: number[]
  planned_start_at?: string
  planned_end_at?: string
  description?: string
  testcase_ids?: number[]
  auto_submit?: boolean
}

export interface UpdateReviewPayload {
  name?: string
  module_id?: number
  review_mode?: string
  planned_start_at?: string
  planned_end_at?: string
  description?: string
}

export interface LinkItemEntry {
  testcase_id: number
  reviewer_ids?: number[]
}

// ─── API 函数 ───

/** 评审计划列表 */
export async function listReviews(projectId: number, params: ReviewListParams) {
  const { data } = await apiClient.get<{
    items: CaseReview[]
    total: number
    page: number
    pageSize: number
  }>(`/projects/${projectId}/case-reviews`, { params })
  return data
}

/** 创建评审计划 */
export async function createReview(projectId: number, payload: CreateReviewPayload) {
  const { data } = await apiClient.post<CaseReview>(`/projects/${projectId}/case-reviews`, payload)
  return data
}

/** 获取评审详情 */
export async function getReview(projectId: number, reviewId: number) {
  const { data } = await apiClient.get<CaseReview>(
    `/projects/${projectId}/case-reviews/${reviewId}`,
  )
  return data
}

/** 评审流程汇总（项目级全局数字，与分页无关） */
export interface ReviewSummary {
  total_plans: number
  not_started_plans: number
  in_progress_plans: number
  completed_plans: number
  closed_plans: number
  my_pending_items: number
}

/** 获取评审汇总：顶部卡片与徽标所需的项目级统计 */
export async function getReviewSummary(projectId: number) {
  const { data } = await apiClient.get<ReviewSummary>(`/projects/${projectId}/case-reviews/summary`)
  return data
}

/** 更新评审计划 */
export async function updateReview(
  projectId: number,
  reviewId: number,
  payload: UpdateReviewPayload,
) {
  const { data } = await apiClient.put(`/projects/${projectId}/case-reviews/${reviewId}`, payload)
  return data
}

/** 删除评审计划 */
export async function deleteReview(projectId: number, reviewId: number) {
  const { data } = await apiClient.delete(`/projects/${projectId}/case-reviews/${reviewId}`)
  return data
}

/** 关闭评审计划 */
export async function closeReview(projectId: number, reviewId: number) {
  const { data } = await apiClient.post(`/projects/${projectId}/case-reviews/${reviewId}/close`)
  return data
}

/** 复制评审计划 */
export async function copyReview(
  projectId: number,
  reviewId: number,
  payload: { name?: string; include_cases?: boolean; reset_reviewers?: boolean },
) {
  const { data } = await apiClient.post<CaseReview>(
    `/projects/${projectId}/case-reviews/${reviewId}/copy`,
    payload,
  )
  return data
}

/** 评审项列表 */
export async function listReviewItems(
  projectId: number,
  reviewId: number,
  params: ReviewItemListParams,
) {
  const { data } = await apiClient.get<{
    items: CaseReviewItem[]
    total: number
    page: number
    pageSize: number
  }>(`/projects/${projectId}/case-reviews/${reviewId}/items`, { params })
  return data
}

/** 关联用例 */
export async function linkItems(
  projectId: number,
  reviewId: number,
  items: LinkItemEntry[],
  autoSubmit = false,
) {
  const { data } = await apiClient.post(
    `/projects/${projectId}/case-reviews/${reviewId}/items/link`,
    { items, auto_submit: autoSubmit },
  )
  return data
}

/** 移除用例 */
export async function unlinkItems(projectId: number, reviewId: number, itemIds: number[]) {
  const { data } = await apiClient.post(
    `/projects/${projectId}/case-reviews/${reviewId}/items/unlink`,
    { item_ids: itemIds },
  )
  return data
}

/** 单条评审提交 */
export async function submitItemReview(
  projectId: number,
  reviewId: number,
  itemId: number,
  result: string,
  comment: string,
) {
  const { data } = await apiClient.post<SubmitReviewOutput>(
    `/projects/${projectId}/case-reviews/${reviewId}/items/${itemId}/review`,
    { result, comment },
  )
  return data
}

/** 批量评审 */
export async function batchReview(
  projectId: number,
  reviewId: number,
  itemIds: number[],
  result: string,
  comment: string,
) {
  const { data } = await apiClient.post<BatchReviewOutput>(
    `/projects/${projectId}/case-reviews/${reviewId}/items/batch-review`,
    { item_ids: itemIds, result, comment },
  )
  return data
}

/** 批量改评审人 */
export async function batchReassign(
  projectId: number,
  reviewId: number,
  itemIds: number[],
  reviewerIds: number[],
) {
  const { data } = await apiClient.post(
    `/projects/${projectId}/case-reviews/${reviewId}/items/batch-reassign`,
    { item_ids: itemIds, reviewer_ids: reviewerIds },
  )
  return data
}

/** 批量重新提审 */
export async function batchResubmit(projectId: number, reviewId: number, itemIds: number[]) {
  const { data } = await apiClient.post(
    `/projects/${projectId}/case-reviews/${reviewId}/items/batch-resubmit`,
    { item_ids: itemIds },
  )
  return data
}

/** 评审记录 */
export async function listItemRecords(
  projectId: number,
  reviewId: number,
  itemId: number,
  params: { page: number; pageSize: number; round_no?: number },
) {
  const { data } = await apiClient.get<{
    items: CaseReviewRecord[]
    total: number
    page: number
    pageSize: number
  }>(`/projects/${projectId}/case-reviews/${reviewId}/items/${itemId}/records`, { params })
  return data
}
