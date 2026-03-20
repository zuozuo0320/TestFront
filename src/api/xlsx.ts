import { apiClient } from './client'

// Get export download URL (for direct browser navigation)
export function getExportUrl(projectId: number): string {
  return `/api/v1/projects/${projectId}/testcases/export`
}

// Export test cases - download as xlsx
export async function exportTestCases(projectId: number): Promise<void> {
  const response = await apiClient.get(`/projects/${projectId}/testcases/export`, {
    responseType: 'blob',
  })
  const blob = new Blob([response.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `testcases_${projectId}_${Date.now()}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Import test cases from xlsx
export async function importTestCases(projectId: number, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await apiClient.post(`/projects/${projectId}/testcases/import`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}
