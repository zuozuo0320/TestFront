import { apiClient } from './client'
import type { TestCase, TestCaseListResp } from './types'

export interface TestCaseListParams {
  page: number
  pageSize: number
  keyword?: string
  level?: string
  review_result?: string
  exec_result?: string
  tags?: string
  module_id?: number
  created_by?: number
  updated_by?: number
  created_after?: string
  created_before?: string
  updated_after?: string
  updated_before?: string
  sortBy?: 'id' | 'created_at' | 'updated_at'
  sortOrder?: 'asc' | 'desc'
  module_path?: string
}

export interface TestCasePayload {
  title: string
  level?: string
  exec_result?: string
  module_id?: number
  module_path?: string
  tags?: string
  precondition?: string
  steps?: string
  remark?: string
  priority?: string
}

export async function listTestCases(projectId: number, params: TestCaseListParams) {
  const { data } = await apiClient.get<TestCaseListResp>(`/projects/${projectId}/testcases`, {
    params,
  })
  return data
}

export async function createTestCase(projectId: number, payload: TestCasePayload) {
  const { data } = await apiClient.post<TestCase>(`/projects/${projectId}/testcases`, payload)
  return data
}

export async function updateTestCase(
  projectId: number,
  testcaseId: number,
  payload: Partial<TestCasePayload>,
) {
  const { data } = await apiClient.put<TestCase>(
    `/projects/${projectId}/testcases/${testcaseId}`,
    payload,
  )
  return data
}

export async function deleteTestCase(projectId: number, testcaseId: number) {
  const { data } = await apiClient.delete<{ message: string }>(
    `/projects/${projectId}/testcases/${testcaseId}`,
  )
  return data
}

// ========== Batch Operations ==========

export async function batchDeleteTestCases(projectId: number, ids: number[]) {
  const { data } = await apiClient.post(`/projects/${projectId}/testcases/batch-delete`, { ids })
  return data
}

export async function batchUpdateLevel(projectId: number, ids: number[], level: string) {
  const { data } = await apiClient.post(`/projects/${projectId}/testcases/batch-update-level`, {
    ids,
    level,
  })
  return data
}

export async function batchMoveTestCases(
  projectId: number,
  ids: number[],
  module_id: number,
  module_path: string,
) {
  const { data } = await apiClient.post(`/projects/${projectId}/testcases/batch-move`, {
    ids,
    module_id,
    module_path,
  })
  return data
}

// ========== Batch Tag ==========

export async function batchTagTestCases(projectId: number, ids: number[], tag_ids: number[]) {
  const { data } = await apiClient.post(`/projects/${projectId}/testcases/batch-tag`, {
    ids,
    tag_ids,
  })
  return data
}

// ========== Clone ==========

export async function cloneTestCase(projectId: number, testcaseId: number) {
  const { data } = await apiClient.post(`/projects/${projectId}/testcase/${testcaseId}/clone`)
  return data
}

// ========== History ==========

export async function listCaseHistory(
  projectId: number,
  testcaseId: number,
  page = 1,
  pageSize = 20,
) {
  const { data } = await apiClient.get(`/projects/${projectId}/testcases/${testcaseId}/history`, {
    params: { page, pageSize },
  })
  return data
}

// ========== Activities ==========

export interface CaseActivity {
  id: number
  actor_name: string
  action: string
  detail: string
  icon: string
  created_at: string
}

export async function listCaseActivities(
  projectId: number,
  testcaseId: number,
  limit = 10,
): Promise<CaseActivity[]> {
  const { data } = await apiClient.get(
    `/projects/${projectId}/testcases/${testcaseId}/activities`,
    {
      params: { limit },
    },
  )
  return data || []
}

// ========== Relations ==========

export async function listCaseRelations(projectId: number, testcaseId: number) {
  const { data } = await apiClient.get(`/projects/${projectId}/testcases/${testcaseId}/relations`)
  return data
}

export async function createCaseRelation(
  projectId: number,
  testcaseId: number,
  targetCaseId: number,
  relationType: 'precondition' | 'related',
) {
  const { data } = await apiClient.post(
    `/projects/${projectId}/testcases/${testcaseId}/relations`,
    {
      target_case_id: targetCaseId,
      relation_type: relationType,
    },
  )
  return data
}

export async function deleteCaseRelation(
  projectId: number,
  testcaseId: number,
  relationId: number,
) {
  const { data } = await apiClient.delete(
    `/projects/${projectId}/testcases/${testcaseId}/relations/${relationId}`,
  )
  return data
}

// ========== 生命周期状态流转 ==========

export async function discardTestCase(projectId: number, testcaseId: number) {
  const { data } = await apiClient.post(`/projects/${projectId}/testcase/${testcaseId}/discard`)
  return data
}

export async function recoverTestCase(projectId: number, testcaseId: number) {
  const { data } = await apiClient.post(`/projects/${projectId}/testcase/${testcaseId}/recover`)
  return data
}
