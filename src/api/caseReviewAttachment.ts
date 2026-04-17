import { apiClient } from './client'

// ─── 类型定义 ───

export interface CaseReviewAttachment {
  id: number
  review_id: number
  review_item_id: number
  project_id: number
  testcase_id: number
  round_no: number
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  created_by: number
  created_at: string
  // 虚拟字段
  uploader_name?: string
  review_name?: string
}

// ─── API 函数 ───

/** 上传评审附件（挂在评审项上） */
export async function uploadReviewAttachment(
  projectId: number,
  reviewId: number,
  itemId: number,
  file: File,
) {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await apiClient.post<CaseReviewAttachment>(
    `/projects/${projectId}/case-reviews/${reviewId}/items/${itemId}/attachments`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}

/** 查询某个评审项的附件列表 */
export async function listReviewAttachmentsByItem(
  projectId: number,
  reviewId: number,
  itemId: number,
) {
  const { data } = await apiClient.get<CaseReviewAttachment[]>(
    `/projects/${projectId}/case-reviews/${reviewId}/items/${itemId}/attachments`,
  )
  return data || []
}

/** 查询某个用例维度的评审证据（只读镜像，跨评审聚合） */
export async function listReviewAttachmentsByTestCase(
  projectId: number,
  testcaseId: number,
) {
  const { data } = await apiClient.get<CaseReviewAttachment[]>(
    `/projects/${projectId}/testcases/${testcaseId}/review-attachments`,
  )
  return data || []
}

/** 删除评审附件 */
export async function deleteReviewAttachment(projectId: number, attachmentId: number) {
  const { data } = await apiClient.delete(
    `/projects/${projectId}/review-attachments/${attachmentId}`,
  )
  return data
}

/** 下载评审附件（返回 Blob，在调用方处理下载逻辑） */
export async function downloadReviewAttachment(projectId: number, attachmentId: number) {
  const resp = await apiClient.get(
    `/projects/${projectId}/review-attachments/${attachmentId}/download`,
    { responseType: 'blob' },
  )
  return resp.data as Blob
}
