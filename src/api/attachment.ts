import { apiClient } from './client'
import type { CaseAttachment } from './types'

// Upload attachment
export async function uploadAttachment(
  projectId: number,
  testcaseId: number,
  file: File,
) {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await apiClient.post<{ data: CaseAttachment }>(
    `/projects/${projectId}/testcases/${testcaseId}/attachments`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return data
}

// List attachments for a test case
export async function listAttachments(projectId: number, testcaseId: number) {
  const { data } = await apiClient.get<{ data: CaseAttachment[] }>(
    `/projects/${projectId}/testcases/${testcaseId}/attachments`,
  )
  return data
}

// Delete attachment
export async function deleteAttachment(projectId: number, attachmentId: number) {
  const { data } = await apiClient.delete(
    `/projects/${projectId}/attachments/${attachmentId}`,
  )
  return data
}

// Get download URL
export function getAttachmentDownloadUrl(projectId: number, attachmentId: number) {
  return `/api/v1/projects/${projectId}/attachments/${attachmentId}/download`
}
