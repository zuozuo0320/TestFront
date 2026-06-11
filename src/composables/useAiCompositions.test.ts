import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from '@/stores/project'
import { useAiCompositions } from './useAiCompositions'
import {
  FlowAssetStatus,
  PlannerMode,
  ScenarioCompositionStatus,
  ScenarioStepType,
  TaskStatus,
  ValidationStatus,
  addScenarioStep,
  createAiPlanFromTask,
  createScenarioComposition,
  deleteScenarioComposition,
  fetchFlowAssetList,
  fetchScenarioCompositionList,
  fetchTaskList,
  type AiFlowAsset,
  type AiScriptTask,
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

vi.mock('@/api/aiRegression', () => ({
  reportPlanAdoption: vi.fn().mockResolvedValue({}),
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
  const PlannerMode = {
    AUTO: 'auto',
    LLM: 'llm',
    HEURISTIC: 'heuristic',
  }
  const TaskStatus = {
    DRAFT: 'DRAFT',
    PENDING_EXECUTE: 'PENDING_EXECUTE',
    RUNNING: 'RUNNING',
    GENERATE_SUCCESS: 'GENERATE_SUCCESS',
    GENERATE_FAILED: 'GENERATE_FAILED',
    PENDING_CONFIRM: 'PENDING_CONFIRM',
    PENDING_REVALIDATE: 'PENDING_REVALIDATE',
    CONFIRMED: 'CONFIRMED',
    DISCARDED: 'DISCARDED',
    MANUAL_REVIEW: 'MANUAL_REVIEW',
  }
  const FlowAssetStatus = {
    DRAFT: 'DRAFT',
    PUBLISHED: 'PUBLISHED',
    ARCHIVED: 'ARCHIVED',
  }
  const ScenarioStepType = {
    FLOW_CALL: 'FLOW_CALL',
    ASSERTION: 'ASSERTION',
    ATOMIC_ACTION: 'ATOMIC_ACTION',
    CODE_BLOCK: 'CODE_BLOCK',
    AI_GENERATED: 'AI_GENERATED',
  }
  return {
    FlowAssetStatus,
    PlannerMode,
    ScenarioCompositionStatus,
    ScenarioStepType,
    TaskStatus,
    ValidationStatus,
    addScenarioStep: vi.fn(),
    createAiPlanFromTask: vi.fn(),
    createScenarioComposition: vi.fn(),
    deleteScenarioComposition: vi.fn(),
    fetchFlowAssetList: vi.fn(),
    fetchScenarioCompositionList: vi.fn(),
    fetchTaskList: vi.fn(),
  }
})

const mockedFetchFlowAssetList = vi.mocked(fetchFlowAssetList)
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

function buildFlowAsset(overrides: Partial<AiFlowAsset> = {}): AiFlowAsset {
  return {
    id: 12,
    projectId: 6,
    flowKey: 'login_system',
    flowName: '登录系统',
    status: FlowAssetStatus.PUBLISHED,
    tags: [],
    preconditions: [],
    postconditions: [],
    allowAiReuse: true,
    latestValidationStatus: ValidationStatus.PASSED,
    createdBy: 1,
    createdAt: '2026-06-09T10:00:00Z',
    updatedBy: 1,
    updatedAt: '2026-06-09T10:00:00Z',
    ...overrides,
  }
}

function buildScriptTask(overrides: Partial<AiScriptTask> = {}): AiScriptTask {
  return {
    id: 88,
    projectId: 6,
    projectName: '默认项目',
    projectKey: 'default',
    taskName: '资产扫描任务页面',
    generationMode: 'RECORDING_ENHANCED',
    caseIds: [],
    caseTags: [],
    caseCount: 0,
    scenarioDesc: '',
    startUrl: '',
    taskStatus: TaskStatus.CONFIRMED,
    frameworkType: 'PLAYWRIGHT',
    latestValidationStatus: ValidationStatus.PASSED,
    createdBy: 1,
    createdName: '管理员',
    createdAt: '2026-06-09T10:00:00Z',
    updatedAt: '2026-06-09T10:00:00Z',
    ...overrides,
  }
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

  it('融合录制任务创建编排时应支持普通录制脚本片段与固定场景片段一起编排', async () => {
    selectProject(6)
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_781_090_000_000)
    const expectedKey = `asset_scan_task_page_composition_${Date.now().toString(36)}`
    mockedFetchTaskList.mockResolvedValue({
      total: 3,
      list: [
        buildScriptTask({
          id: 88,
          taskName: 'asset scan task page',
        }),
        buildScriptTask({
          id: 91,
          taskName: '资产扫描任务页面',
        }),
        buildScriptTask({
          id: 89,
          taskName: '生成成功未确认任务',
          taskStatus: TaskStatus.GENERATE_SUCCESS,
        }),
        buildScriptTask({
          id: 90,
          taskName: '确认但验证失败任务',
          latestValidationStatus: ValidationStatus.FAILED,
        }),
      ],
    })
    mockedFetchFlowAssetList.mockResolvedValue({
      total: 4,
      list: [
        buildFlowAsset({
          id: 15,
          flowKey: 'asset_scan_create_task',
          flowName: '资产扫描任务-新建任务按钮',
        }),
        buildFlowAsset({
          id: 16,
          flowKey: 'asset_scan_fill_task_name',
          flowName: '资产扫描任务-填写任务名称',
        }),
        buildFlowAsset({
          id: 13,
          flowKey: 'blocked_flow',
          flowName: '关闭复用场景',
          allowAiReuse: false,
        }),
        buildFlowAsset({
          id: 14,
          flowKey: 'failed_flow',
          flowName: '验证失败场景',
          latestValidationStatus: ValidationStatus.FAILED,
        }),
      ],
    })
    mockedCreateAiPlanFromTask.mockResolvedValue({
      planId: 'fusion_plan_88',
      confidence: 0.86,
      summary: '基于已确认录制任务与 1 个固定场景融合生成 2 个编排步骤',
      warnings: [],
      plannerUsed: 'HEURISTIC',
      steps: [
        {
          type: ScenarioStepType.FLOW_CALL,
          stepName: '引用固定场景：资产扫描任务-新建任务按钮',
          flowId: 15,
          flowVersionId: 101,
          flowKey: 'asset_scan_create_task',
          confidence: 0.9,
          reason: '固定场景与来源录制步骤 1-2 高度重合，按固定场景脚本融合',
          inputs: {},
        },
        {
          type: ScenarioStepType.ATOMIC_ACTION,
          stepName: '保留录制步骤 3：INPUT',
          atomicAction: 'fill',
          confidence: 0.82,
          reason: '来源录制任务未被固定场景覆盖，保留为编排原子步骤',
          inputs: {
            selector: "page.getByRole('textbox', { name: '任务名称' })",
            value: '资产扫描回归',
          },
        },
      ],
    })
    mockedCreateScenarioComposition.mockResolvedValue({
      id: 31,
      projectId: 6,
      scenarioKey: expectedKey,
      scenarioName: 'asset scan task page编排',
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
      scenarioId: 31,
      stepNo: 1,
      stepType: ScenarioStepType.FLOW_CALL,
      stepName: '引用固定场景：登录系统',
      refFlowId: 12,
      paramMapping: {},
      outputMapping: {},
      manualReviewed: true,
      aiConfidence: 0,
      enabled: true,
      createdAt: '2026-06-09T10:00:00Z',
      updatedAt: '2026-06-09T10:00:00Z',
    })

    const compositions = useAiCompositions()
    await compositions.openCreateDialog()
    compositions.form.sourceTaskId = 88
    compositions.fillFromSourceTask()
    compositions.form.additionalTaskIds = [91]
    compositions.form.sourceFlowIds = [15, 16]
    compositions.fillFromAdditionalTasks()
    compositions.fillFromSourceFlows()
    compositions.moveOrderedSource('FLOW:15', -1)
    compositions.moveOrderedSource('FLOW:15', -1)

    await compositions.submitCreate()

    nowSpy.mockRestore()

    expect(mockedFetchFlowAssetList).toHaveBeenCalledWith({
      projectId: 6,
      status: FlowAssetStatus.PUBLISHED,
      validationStatus: ValidationStatus.PASSED,
      pageNo: 1,
      pageSize: 100,
    })
    expect(compositions.reusableTaskOptions.value.map((item) => item.id)).toEqual([88, 91])
    expect(compositions.additionalTaskOptions.value.map((item) => item.id)).toEqual([91])
    expect(compositions.selectedAdditionalTasks.value.map((item) => item.id)).toEqual([91])
    expect(compositions.reusableFlowOptions.value.map((item) => item.id)).toEqual([15, 16])
    expect(compositions.selectedSourceFlows.value.map((item) => item.id)).toEqual([15, 16])
    expect(compositions.remainingReusableFlowCount.value).toBe(0)
    expect(compositions.form.scenarioName).toBe('asset scan task page编排')
    expect(compositions.form.scenarioKey).toBe(expectedKey)
    expect(mockedCreateAiPlanFromTask).toHaveBeenCalledWith({
      projectId: 6,
      taskId: 88,
      preferredFlowIds: [15, 16],
      additionalTaskIds: [91],
      orderedSources: [
        { type: 'FLOW', id: 15 },
        { type: 'TASK', id: 88 },
        { type: 'TASK', id: 91 },
        { type: 'FLOW', id: 16 },
      ],
      maxSteps: 20,
      plannerMode: PlannerMode.HEURISTIC,
    })
    expect(mockedCreateScenarioComposition).toHaveBeenCalledWith({
      projectId: 6,
      scenarioKey: expectedKey,
      scenarioName: 'asset scan task page编排',
      description:
        '基于已确认录制任务「asset scan task page」按顺序融合：固定场景「资产扫描任务-新建任务按钮」 → 来源任务「asset scan task page」 → 录制脚本「资产扫描任务页面」 → 固定场景「资产扫描任务-填写任务名称」',
    })
    expect(mockedAddScenarioStep).toHaveBeenNthCalledWith(1, 31, {
      projectId: 6,
      stepType: ScenarioStepType.FLOW_CALL,
      stepName: '引用固定场景：资产扫描任务-新建任务按钮',
      refFlowId: 15,
      refFlowVersionId: 101,
      refAssertionId: undefined,
      atomicAction: undefined,
      paramMapping: {},
      outputMapping: {},
      aiConfidence: 0.9,
      manualReviewed: true,
      enabled: true,
    })
    expect(mockedAddScenarioStep).toHaveBeenNthCalledWith(2, 31, {
      projectId: 6,
      stepType: ScenarioStepType.ATOMIC_ACTION,
      stepName: '保留录制步骤 3：INPUT',
      refFlowId: undefined,
      refFlowVersionId: undefined,
      refAssertionId: undefined,
      atomicAction: 'fill',
      paramMapping: {
        selector: "page.getByRole('textbox', { name: '任务名称' })",
        value: '资产扫描回归',
      },
      outputMapping: {},
      aiConfidence: 0.82,
      manualReviewed: true,
      enabled: true,
    })
    expect(routerPush).toHaveBeenCalledWith('/ai-script/compositions/31')
  })

  it('空白编排创建时应自动生成 Key 且不写入固定场景步骤', async () => {
    selectProject(6)
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_781_090_000_000)
    const expectedKey = `scenario_composition_${Date.now().toString(36)}`
    mockedFetchFlowAssetList.mockResolvedValue({ total: 0, list: [] })
    mockedCreateScenarioComposition.mockResolvedValue({
      id: 33,
      projectId: 6,
      scenarioKey: expectedKey,
      scenarioName: '资产扫描完整回归',
      status: ScenarioCompositionStatus.DRAFT,
      latestValidationStatus: ValidationStatus.NOT_VALIDATED,
      revision: 1,
      createdBy: 1,
      createdAt: '2026-06-09T10:00:00Z',
      updatedBy: 1,
      updatedAt: '2026-06-09T10:00:00Z',
    })

    const compositions = useAiCompositions()
    await compositions.openCreateDialog()
    compositions.changeCreateMode('BLANK')
    compositions.form.scenarioName = '资产扫描完整回归'
    compositions.form.description = '从空白工作台手动编排资产扫描完整链路'

    await compositions.submitCreate()

    nowSpy.mockRestore()

    expect(mockedCreateScenarioComposition).toHaveBeenCalledWith({
      projectId: 6,
      scenarioKey: expectedKey,
      scenarioName: '资产扫描完整回归',
      description: '从空白工作台手动编排资产扫描完整链路',
    })
    expect(mockedAddScenarioStep).not.toHaveBeenCalled()
    expect(routerPush).toHaveBeenCalledWith('/ai-script/compositions/33')
  })

  it('AI 编排建议应只暴露验证通过的录制任务选项', async () => {
    selectProject(6)
    mockedFetchTaskList.mockResolvedValue({
      total: 3,
      list: [
        buildScriptTask({
          id: 88,
          taskName: '可复用任务',
        }),
        buildScriptTask({
          id: 89,
          taskName: '未确认任务',
          taskStatus: TaskStatus.GENERATE_SUCCESS,
        }),
        buildScriptTask({
          id: 90,
          taskName: '未验证任务',
          latestValidationStatus: ValidationStatus.FAILED,
        }),
      ],
    })
    mockedCreateAiPlanFromTask.mockResolvedValue({
      planId: 'plan_001',
      confidence: 0.9,
      summary: '推荐复用登录场景',
      steps: [],
      warnings: [],
      plannerUsed: 'LLM',
    })

    const compositions = useAiCompositions()
    await compositions.openAiPlanDialog()
    compositions.aiPlanForm.taskId = 88
    compositions.aiPlanForm.plannerMode = PlannerMode.LLM
    await compositions.submitAiPlan()

    expect(compositions.publishedTaskOptions.value.map((item) => item.id)).toEqual([88])
    expect(mockedCreateAiPlanFromTask).toHaveBeenCalledWith({
      projectId: 6,
      taskId: 88,
      maxSteps: 12,
      plannerMode: PlannerMode.LLM,
    })
    expect(compositions.aiPlanResultVisible.value).toBe(true)
    expect(compositions.aiPlanResult.value?.plannerUsed).toBe('LLM')
  })

  it('重新打开弹窗应重置规划模式并透传降级信息', async () => {
    selectProject(6)
    mockedFetchTaskList.mockResolvedValue({ total: 0, list: [] })
    mockedCreateAiPlanFromTask.mockResolvedValue({
      planId: 'plan_003',
      confidence: 0.8,
      summary: '【启发式降级】推荐复用登录场景',
      steps: [],
      warnings: [],
      plannerUsed: 'HEURISTIC',
      degradedReason: 'LLM Planner 激活模型未配置[160201]',
    })

    const compositions = useAiCompositions()
    await compositions.openAiPlanDialog()
    compositions.aiPlanForm.plannerMode = PlannerMode.LLM
    await compositions.openAiPlanDialog()

    expect(compositions.aiPlanForm.plannerMode).toBe(PlannerMode.AUTO)

    compositions.aiPlanForm.taskId = 88
    await compositions.submitAiPlan()

    expect(mockedCreateAiPlanFromTask).toHaveBeenCalledWith({
      projectId: 6,
      taskId: 88,
      maxSteps: 12,
      plannerMode: PlannerMode.AUTO,
    })
    expect(compositions.aiPlanResult.value?.plannerUsed).toBe('HEURISTIC')
    expect(compositions.aiPlanResult.value?.degradedReason).toContain('160201')
  })

  it('AI 编排计划确认后应生成编排草稿并写入步骤', async () => {
    selectProject(6)
    mockedFetchTaskList.mockResolvedValue({
      total: 1,
      list: [
        buildScriptTask({
          id: 88,
          taskName: '登录流程',
        }),
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
          stepName: '引用固定场景：登录系统',
          flowId: 12,
          flowVersionId: 30,
          flowKey: 'login_system',
          confidence: 0.86,
          reason: '录制步骤匹配登录固定场景',
          inputs: { username: '${env.ADMIN_USER}' },
        },
        {
          type: ScenarioStepType.ATOMIC_ACTION,
          stepName: '保留录制步骤 3：INPUT',
          atomicAction: 'fill',
          confidence: 0.84,
          reason: '来源录制任务未被固定场景覆盖',
          inputs: { selector: '#taskName', value: '资产扫描回归' },
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
      stepName: '引用固定场景：登录系统',
      refFlowId: 12,
      refFlowVersionId: 30,
      refAssertionId: undefined,
      atomicAction: undefined,
      paramMapping: { username: '${env.ADMIN_USER}' },
      outputMapping: {},
      aiConfidence: 0.86,
      manualReviewed: true,
      enabled: true,
    })
    expect(mockedAddScenarioStep).toHaveBeenCalledWith(32, {
      projectId: 6,
      stepType: ScenarioStepType.ATOMIC_ACTION,
      stepName: '保留录制步骤 3：INPUT',
      refFlowId: undefined,
      refFlowVersionId: undefined,
      refAssertionId: undefined,
      atomicAction: 'fill',
      paramMapping: { selector: '#taskName', value: '资产扫描回归' },
      outputMapping: {},
      aiConfidence: 0.84,
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
