/**
 * 项目级通用配置 API。
 *
 * 这里承载跨模块共享的项目配置，例如用例评审自审开关、测试环境列表等。
 */
import { apiClient } from './client'

/** 项目级通用测试环境配置。 */
export interface TestEnvironment {
  id: string
  name: string
  base_url: string
  description: string
  is_default: boolean
}

/** 项目级 settings。 */
export interface ProjectSettings {
  allow_self_review: boolean
  test_environments: TestEnvironment[]
}

/** 读取项目级 settings。 */
export async function getProjectSettings(projectId: number): Promise<ProjectSettings> {
  const { data } = await apiClient.get<ProjectSettings>(`/projects/${projectId}/settings`)
  return normalizeProjectSettings(data)
}

/** 局部更新项目级 settings；undefined 表示不修改对应字段。 */
export async function updateProjectSettings(
  projectId: number,
  payload: { allow_self_review?: boolean; test_environments?: TestEnvironment[] },
): Promise<ProjectSettings> {
  const { data } = await apiClient.put<ProjectSettings>(`/projects/${projectId}/settings`, payload)
  return normalizeProjectSettings(data)
}

function normalizeProjectSettings(settings: ProjectSettings): ProjectSettings {
  return {
    allow_self_review: !!settings?.allow_self_review,
    test_environments: Array.isArray(settings?.test_environments)
      ? settings.test_environments.map((env) => ({ ...env, description: env.description || '' }))
      : [],
  }
}
