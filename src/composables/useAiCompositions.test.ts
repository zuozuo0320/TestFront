import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from '@/stores/project'
import { useAiCompositions } from './useAiCompositions'
import {
  ScenarioCompositionStatus,
  ValidationStatus,
  addScenarioStep,
  createAiPlanFromTask,
  createScenarioComposition,
  deleteScenarioComposition,
  fetchScenarioCompositionList,
  fetchTaskList,
} from '@/api/aiScript'

const routerPush = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
  ElMessageBox: {
    confirm: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/api/aiScript', () => {
  const ScenarioCompositionStatus = {
    DRAFT: 'DRAFT',
    GENERATED: 'GENERATED',
    VALIDATING: 'VALIDATING',
    PASSED: 'PASSED',
    FAILED: 'FAILED',
    PUBLISHED: 'PUBLISHED',
    ARCHIVED: 'ARCHIVED',
  }
  const ValidationStatus = {
    NOT_VALIDATED: 'NOT_VALIDATED',
    VALIDATING: 'VALIDATING',
    PASSED: 'PASSED',
    FAILED: 'FAILED',
    ERROR: 'ERROR',
  }
  return {
    ScenarioCompositionStatus,
    ValidationStatus,
    addScenarioStep: vi.fn(),
    createAiPlanFromTask: vi.fn(),
    createScenarioComposition: vi.fn(),
    deleteScenarioComposition: vi.fn(),
    fetchScenarioCompositionList: vi.fn(),
    fetchTaskList: vi.fn(),
  }
})

const mockedFetchScenarioCompositionList = vi.mocked(fetchScenarioCompositionList)
const mockedCreateScenarioComposition = vi.mocked(createScenarioComposition)
const mockedAddScenarioStep = vi.mocked(addScenarioStep)
const mockedDeleteScenarioComposition = vi.mocked(deleteScenarioComposition)
const mockedFetchTaskList = vi.mocked(fetchTaskList)
const mockedCreateAiPlanFromTask = vi.mocked(createAiPlanFromTask)

function selectProject(projectId = 1) {
  const projectStore = useProjectStore()
  projectStore.selectedProjectId = projectId
  return projectStore
}

describe('useAiCompositions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    routerPush.mockReset()
    vi.clearAllMocks()
  })

  it('未选择项目时不请求编排列表', async () => {
    const compositions = useAiCompositions()

    await compositions.fetchCompositions()

    expect(mockedFetchScenarioCompositionList).not.toHaveBeenCalled()
    expect(compositions.compositions.value).toEqual([])
    expect(compositions.errorMessage.value).toBe('请先选择项目')
  })

  it('应按筛选条件加载场景编排列表', async () => {
    selectProject(8)
    mockedFetchScenarioCompositionList.mockResolvedValue({
      total: 1,
      list: [
        {
          id: 20,
          projectId: 8,
          scenarioKey: 'login_and_check',
          scenarioName: '登录并检查',
          status: ScenarioCompositionStatus.GENERATED,
          latestValidationStatus: ValidationStatus.PASSED,
          revision: 2,
          createdBy: 1,
          createdAt: '2026-06-09T10:00:00Z',
          updatedBy: 1,
          updatedAt: '2026-06-09T10:00:00Z',
        },
      ],
    })

    const compositions = useAiCompositions()
    compositions.filters.keyword = '登录'
    compositions.filters.status = ScenarioCompositionStatus.GENERATED
    compositions.filters.validationStatus = ValidationStatus.PASSED
    await compositions.fetchCompositions(3)

    expect(mockedFetchScenarioCompositionList).toHaveBeenCalledWith({
      projectId: 8,
      keyword: '登录',
      status: ScenarioCompositionStatus.GENERATED,
      validationStatus: ValidationStatus.PASSED,
      pageNo: 3,
      pageSize: 20,
    })
    expect(compositions.total.value).toBe(1)
    expect(compositions.compositions.value[0]?.scenarioKey).toBe('login_and_check')
  })

  it('创建编排时应规范化 Key 并进入工作台', async () => {
    selectProject(6)
    mockedCreateScenarioComposition.mockResolvedValue({
      id: 31,
      projectId: 6,
      scenarioKey: 'login_and_check',
      scenarioName: '登录并检查',
      status: ScenarioCompositionStatus.DRAFT,
      latestValidationStatus: ValidationStatus.NOT_VALIDATED,
      revision: 1,
      createdBy: 1,
      createdAt: '2026-06-09T10:00:00Z',
      updatedBy: 1,
      updatedAt: '2026-06-09T10:00:00Z',
    })

    const compositions = useAiCompositions()
    compositions.form.scenarioKey = 'Login And Check'
    compositions.form.scenarioName = '登录并检查'
    compositions.form.description = '组合登录固定场景和标题断言'

    await compositions.submitCreate()

    expect(mockedCreateScenarioComposition).toHaveBeenCalledWith({
      projectId: 6,
      scenarioKey: 'login_and_check',
      scenarioName: '登录并检查',
      description: '组合登录固定场景和标题断言',
    })
    expect(routerPush).toHaveBeenCalledWith('/ai-script/compositions/31')
  })

  it('AI 编排建议应只暴露验证通过的录制任务选项', async () => {
    selectProject(6)
    mockedFetchTaskList.mockResolvedValue({
      total: 2,
      list: [
        {
          id: 88,
          projectId: 6,
          projectName: '默认项目',
          projectKey: 'default',
          taskName: '可复用任务',
          generationMode: 'RECORDING_ENHANCED',
          caseIds: [],
          caseTags: [],
          caseCount: 0,
          scenarioDesc: '',
          startUrl: '',
          taskStatus: 'GENERATE_SUCCESS',
          frameworkType: 'PLAYWRIGHT',
          latestValidationStatus: ValidationStatus.PASSED,
          createdBy: 1,
          createdName: '管理员',
          createdAt: '2026-06-09T10:00:00Z',
          updatedAt: '2026-06-09T10:00:00Z',
        },
        {
          id: 89,
          projectId: 6,
          projectName: '默认项目',
          projectKey: 'default',
          taskName: '未验证任务',
          generationMode: 'RECORDING_ENHANCED',
          caseIds: [],
          caseTags: [],
          caseCount: 0,
          scenarioDesc: '',
          startUrl: '',
          taskStatus: 'GENERATE_SUCCESS',
          frameworkType: 'PLAYWRIGHT',
          latestValidationStatus: ValidationStatus.FAILED,
          createdBy: 1,
          createdName: '管理员',
          createdAt: '2026-06-09T10:00:00Z',
          updatedAt: '2026-06-09T10:00:00Z',
        },
      ],
    })
    mockedCreateAiPlanFromTask.mockResolvedValue({
      planId: 'plan_001',
      confidence: 0.9,
      summary: '推荐复用登录场景',
      steps: [],
      warnings: [],
    })

    const compositions = useAiCompositions()
    await compositions.openAiPlanDialog()
    compositions.aiPlanForm.taskId = 88
    await compositions.submitAiPlan()

    expect(compositions.publishedTaskOptions.value.map((item) => item.id)).toEqual([88])
    expect(mockedCreateAiPlanFromTask).toHaveBeenCalledWith({
      projectId: 6,
      taskId: 88,
      maxSteps: 12,
    })
    expect(compositions.aiPlanResultVisible.value).toBe(true)
  })

  it('AI 编排计划确认后应生成编排草稿并写入步骤', async () => {
    selectProject(6)
    mockedFetchTaskList.mockResolvedValue({
      total: 1,
      list: [
        {
          id: 88,
          projectId: 6,
          projectName: '默认项目',
          projectKey: 'default',
          taskName: '登录流程',
          generationMode: 'RECORDING_ENHANCED',
          caseIds: [],
          caseTags: [],
          caseCount: 0,
          scenarioDesc: '',
          startUrl: '',
          taskStatus: 'GENERATE_SUCCESS',
          frameworkType: 'PLAYWRIGHT',
          latestValidationStatus: ValidationStatus.PASSED,
          createdBy: 1,
          createdName: '管理员',
          createdAt: '2026-06-09T10:00:00Z',
          updatedAt: '2026-06-09T10:00:00Z',
        },
      ],
    })
    mockedCreateAiPlanFromTask.mockResolvedValue({
      planId: 'plan_002',
      confidence: 0.86,
      summary: '推荐 1 个固定场景',
      warnings: [],
      steps: [
        {
          type: 'FLOW_CALL',
          flowId: 12,
          flowVersionId: 30,
          flowKey: 'login_system',
          confidence: 0.86,
          reason: '录制步骤匹配登录固定场景',
          inputs: { username: '${env.ADMIN_USER}' },
        },
      ],
    })
    mockedCreateScenarioComposition.mockResolvedValue({
      id: 32,
      projectId: 6,
      scenarioKey: 'login_flow',
      scenarioName: '登录流程 编排',
      status: ScenarioCompositionStatus.DRAFT,
      latestValidationStatus: ValidationStatus.NOT_VALIDATED,
      revision: 1,
      createdBy: 1,
      createdAt: '2026-06-09T10:00:00Z',
      updatedBy: 1,
      updatedAt: '2026-06-09T10:00:00Z',
    })
    mockedAddScenarioStep.mockResolvedValue({
      id: 201,
      scenarioId: 32,
      stepNo: 1,
      stepType: 'FLOW_CALL',
      stepName: 'login_system',
      refFlowId: 12,
      refFlowVersionId: 30,
      paramMapping: { username: '${env.ADMIN_USER}' },
      outputMapping: {},
      manualReviewed: true,
      aiConfidence: 0.86,
      enabled: true,
      createdAt: '2026-06-09T10:00:00Z',
      updatedAt: '2026-06-09T10:00:00Z',
    })

    const compositions = useAiCompositions()
    await compositions.openAiPlanDialog()
    compositions.aiPlanForm.taskId = 88
    await compositions.submitAiPlan()
    await compositions.createCompositionFromPlan()

    expect(mockedCreateScenarioComposition).toHaveBeenCalledWith({
      projectId: 6,
      scenarioKey: 'ai_task_88_composition',
      scenarioName: '登录流程 编排',
      description: '由 AI 计划 plan_002 生成，推荐 1 个固定场景',
    })
    expect(mockedAddScenarioStep).toHaveBeenCalledWith(32, {
      projectId: 6,
      stepType: 'FLOW_CALL',
      stepName: 'login_system',
      refFlowId: 12,
      refFlowVersionId: 30,
      refAssertionId: undefined,
      paramMapping: { username: '${env.ADMIN_USER}' },
      outputMapping: {},
      aiConfidence: 0.86,
      manualReviewed: true,
      enabled: true,
    })
    expect(routerPush).toHaveBeenCalledWith('/ai-script/compositions/32')
  })

  it('删除草稿编排后应刷新当前列表', async () => {
    selectProject(6)
    mockedDeleteScenarioComposition.mockResolvedValue(undefined)
    mockedFetchScenarioCompositionList.mockResolvedValue({ list: [], total: 0 })

    const compositions = useAiCompositions()

    await compositions.deleteDraft({
      id: 20,
      projectId: 6,
      scenarioKey: 'login_and_check',
      scenarioName: '登录并检查',
      status: ScenarioCompositionStatus.DRAFT,
      latestValidationStatus: ValidationStatus.NOT_VALIDATED,
      revision: 1,
      createdBy: 1,
      createdAt: '2026-06-09T10:00:00Z',
      updatedBy: 1,
      updatedAt: '2026-06-09T10:00:00Z',
    })

    expect(mockedDeleteScenarioComposition).toHaveBeenCalledWith(20, 6)
    expect(mockedFetchScenarioCompositionList).toHaveBeenCalledWith({
      projectId: 6,
      keyword: undefined,
      status: '',
      validationStatus: '',
      pageNo: 1,
      pageSize: 20,
    })
  })
})
