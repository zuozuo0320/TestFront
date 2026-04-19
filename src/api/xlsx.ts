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

// Export test case report - download as xlsx (with filter params)
export async function exportReport(
  projectId: number,
  params: Record<string, string | number | undefined>,
): Promise<void> {
  const query = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') query.append(k, String(v))
  }
  const qs = query.toString()
  const url = `/projects/${projectId}/testcases/export-report${qs ? '?' + qs : ''}`
  const response = await apiClient.get(url, { responseType: 'blob', timeout: 60000 })

  // 从 Content-Disposition 解析文件名
  const disposition = response.headers['content-disposition'] || ''
  let fileName = `用例报表_${projectId}_${Date.now()}.xlsx`
  const match = disposition.match(/filename\*=UTF-8''(.+)/i)
  if (match) {
    fileName = decodeURIComponent(match[1])
  }

  const blob = new Blob([response.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(a.href)
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
