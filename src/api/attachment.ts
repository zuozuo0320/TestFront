import { apiClient } from './client'
import type { CaseAttachment } from './types'

// Upload attachment
export async function uploadAttachment(projectId: number, testcaseId: number, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  // Axios 响应拦截器已自动解包 { code, message, data }，这里直接得到 CaseAttachment
  const { data } = await apiClient.post<CaseAttachment>(
    `/projects/${projectId}/testcases/${testcaseId}/attachments`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}

// List attachments for a test case
export async function listAttachments(projectId: number, testcaseId: number) {
  const { data } = await apiClient.get<CaseAttachment[]>(
    `/projects/${projectId}/testcases/${testcaseId}/attachments`,
  )
  return data
}

// Delete attachment
export async function deleteAttachment(projectId: number, attachmentId: number) {
  const { data } = await apiClient.delete(`/projects/${projectId}/attachments/${attachmentId}`)
  return data
}

// Get download URL
export function getAttachmentDownloadUrl(projectId: number, attachmentId: number) {
  return `/api/v1/projects/${projectId}/attachments/${attachmentId}/download`
}
