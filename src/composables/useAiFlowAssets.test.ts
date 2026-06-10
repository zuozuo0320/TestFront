import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from '@/stores/project'
import { useAiFlowAssets } from './useAiFlowAssets'
import {
  compileCheckFlowAsset,
  deleteFlowAsset,
  fetchFlowAssetList,
  fetchTaskList,
  publishFlowFromTask,
  ValidationStatus,
  FlowAssetStatus,
  type AiScriptTask,
} from '@/api/aiScript'

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
  const ValidationStatus = {
    NOT_VALIDATED: 'NOT_VALIDATED',
    VALIDATING: 'VALIDATING',
    PASSED: 'PASSED',
    FAILED: 'FAILED',
    ERROR: 'ERROR',
  }
  const FlowAssetStatus = {
    DRAFT: 'DRAFT',
    PUBLISHED: 'PUBLISHED',
    ARCHIVED: 'ARCHIVED',
  }
  return {
    ValidationStatus,
    FlowAssetStatus,
    archiveFlowAsset: vi.fn(),
    compileCheckFlowAsset: vi.fn(),
    createFlowAsset: vi.fn(),
    deleteFlowAsset: vi.fn(),
    fetchFlowAssetDetail: vi.fn(),
    fetchFlowAssetList: vi.fn(),
    fetchFlowAssetReferences: vi.fn(),
    fetchFlowAssetVersions: vi.fn(),
    fetchTaskList: vi.fn(),
    publishFlowAsset: vi.fn(),
    publishFlowFromTask: vi.fn(),
    updateFlowAsset: vi.fn(),
  }
})

const mockedCompileCheckFlowAsset = vi.mocked(compileCheckFlowAsset)
const mockedDeleteFlowAsset = vi.mocked(deleteFlowAsset)
const mockedFetchFlowAssetList = vi.mocked(fetchFlowAssetList)
const mockedFetchTaskList = vi.mocked(fetchTaskList)
const mockedPublishFlowFromTask = vi.mocked(publishFlowFromTask)

function selectProject(projectId = 1) {
  const projectStore = useProjectStore()
  projectStore.selectedProjectId = projectId
  return projectStore
}

describe('useAiFlowAssets', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('未选择项目时不请求固定场景列表', async () => {
    const flowAssets = useAiFlowAssets()

    await flowAssets.fetchFlows()

    expect(mockedFetchFlowAssetList).not.toHaveBeenCalled()
    expect(flowAssets.flows.value).toEqual([])
    expect(flowAssets.errorMessage.value).toBe('请先选择项目')
  })

  it('应按当前项目和筛选条件加载固定场景列表', async () => {
    selectProject(8)
    mockedFetchFlowAssetList.mockResolvedValue({
      total: 1,
      list: [
        {
          id: 12,
          projectId: 8,
          flowKey: 'login_system',
          flowName: '登录系统',
          status: FlowAssetStatus.PUBLISHED,
          allowAiReuse: true,
          latestValidationStatus: ValidationStatus.PASSED,
          createdBy: 3,
          createdAt: '2026-06-09T10:00:00Z',
          updatedBy: 3,
          updatedAt: '2026-06-09T10:00:00Z',
        },
      ],
    })

    const flowAssets = useAiFlowAssets()
    flowAssets.filters.keyword = '登录'
    await flowAssets.fetchFlows(1)

    expect(mockedFetchFlowAssetList).toHaveBeenCalledWith({
      projectId: 8,
      keyword: '登录',
      status: '',
      validationStatus: '',
      pageNo: 1,
      pageSize: 20,
    })
    expect(flowAssets.total.value).toBe(1)
    expect(flowAssets.flows.value[0]?.flowKey).toBe('login_system')
  })

  it('发布固定场景时应整理 Key、标签和条件', async () => {
    selectProject(6)
    mockedFetchTaskList.mockResolvedValue({ list: [], total: 0 })
    mockedPublishFlowFromTask.mockResolvedValue({
      flowId: 20,
      flowVersionId: 30,
      status: FlowAssetStatus.PUBLISHED,
    })
    mockedFetchFlowAssetList.mockResolvedValue({ list: [], total: 0 })

    const flowAssets = useAiFlowAssets()
    flowAssets.publishForm.taskId = 88
    flowAssets.publishForm.flowKey = 'Login System'
    flowAssets.publishForm.flowName = '登录系统'
    flowAssets.publishForm.tagsText = '登录, 基础流程'
    flowAssets.publishForm.preconditionsText = '打开登录页\n准备账号'
    flowAssets.publishForm.postconditionsText = '进入首页'

    await flowAssets.submitPublish()

    expect(mockedPublishFlowFromTask).toHaveBeenCalledWith(88, {
      projectId: 6,
      flowKey: 'login_system',
      flowName: '登录系统',
      description: undefined,
      tags: ['登录', '基础流程'],
      inputSchema: {},
      outputSchema: {},
      preconditions: ['打开登录页', '准备账号'],
      postconditions: ['进入首页'],
      allowAiReuse: true,
      changeSummary: '首次发布',
    })
    expect(mockedFetchFlowAssetList).toHaveBeenCalled()
  })

  it('从任务详情打开发布弹窗时应直接带入当前任务', async () => {
    const flowAssets = useAiFlowAssets()
    const task: AiScriptTask = {
      id: 88,
      projectId: 6,
      projectName: '默认项目',
      projectKey: 'default',
      taskName: 'Login System',
      generationMode: 'RECORDING_ENHANCED' as AiScriptTask['generationMode'],
      caseIds: [],
      caseTags: [],
      caseCount: 0,
      scenarioDesc: '登录后进入首页',
      startUrl: 'http://localhost:5173/login',
      taskStatus: 'GENERATE_SUCCESS' as AiScriptTask['taskStatus'],
      frameworkType: 'PLAYWRIGHT',
      latestValidationStatus: ValidationStatus.PASSED,
      createdBy: 1,
      createdName: '管理员',
      createdAt: '2026-06-09T10:00:00Z',
      updatedAt: '2026-06-09T10:00:00Z',
    }

    await flowAssets.openPublishDialog(task)

    expect(mockedFetchTaskList).not.toHaveBeenCalled()
    expect(flowAssets.publishDialogVisible.value).toBe(true)
    expect(flowAssets.publishForm.taskId).toBe(88)
    expect(flowAssets.publishForm.flowName).toBe('Login System')
    expect(flowAssets.publishForm.flowKey).toBe('login_system')
    expect(flowAssets.publishForm.description).toBe('登录后进入首页')
  })

  it.each([
    {
      name: '自检通过时应提示成功',
      result: {
        flowId: 12,
        compileHealth: 'OK' as const,
        supportedStepTypes: ['NAVIGATE', 'CLICK'],
        compileFailures: [],
      },
      expectHealth: 'OK',
    },
    {
      name: '自检失败时应返回失败明细',
      result: {
        flowId: 12,
        compileHealth: 'PARTIAL' as const,
        supportedStepTypes: ['NAVIGATE', 'CLICK'],
        compileFailures: [{ stepNo: 2, stepType: 'HOVER', reason: '动作类型 HOVER 暂不支持' }],
      },
      expectHealth: 'PARTIAL',
    },
  ])('$name', async ({ result, expectHealth }) => {
    selectProject(6)
    mockedCompileCheckFlowAsset.mockResolvedValue(result)

    const flowAssets = useAiFlowAssets()
    const returned = await flowAssets.runCompileCheck({
      id: 12,
      projectId: 6,
      flowKey: 'login_system',
      flowName: '登录系统',
      status: FlowAssetStatus.DRAFT,
      allowAiReuse: true,
      latestValidationStatus: ValidationStatus.NOT_VALIDATED,
      createdBy: 1,
      createdAt: '2026-06-09T10:00:00Z',
      updatedBy: 1,
      updatedAt: '2026-06-09T10:00:00Z',
    })

    expect(mockedCompileCheckFlowAsset).toHaveBeenCalledWith(12, 6)
    expect(returned?.compileHealth).toBe(expectHealth)
    expect(flowAssets.compileCheckResult.value?.compileHealth).toBe(expectHealth)
    expect(flowAssets.compileChecking.value).toBe(false)
  })

  it('自检接口报错时应返回 null 并提示错误', async () => {
    selectProject(6)
    mockedCompileCheckFlowAsset.mockRejectedValue(new Error('网络异常'))

    const flowAssets = useAiFlowAssets()
    const returned = await flowAssets.runCompileCheck({
      id: 12,
      projectId: 6,
      flowKey: 'login_system',
      flowName: '登录系统',
      status: FlowAssetStatus.DRAFT,
      allowAiReuse: true,
      latestValidationStatus: ValidationStatus.NOT_VALIDATED,
      createdBy: 1,
      createdAt: '2026-06-09T10:00:00Z',
      updatedBy: 1,
      updatedAt: '2026-06-09T10:00:00Z',
    })

    expect(returned).toBeNull()
    expect(flowAssets.compileChecking.value).toBe(false)
  })

  it('删除草稿固定场景后应刷新当前列表', async () => {
    selectProject(6)
    mockedDeleteFlowAsset.mockResolvedValue(undefined)
    mockedFetchFlowAssetList.mockResolvedValue({ list: [], total: 0 })

    const flowAssets = useAiFlowAssets()

    await flowAssets.deleteManual({
      id: 12,
      projectId: 6,
      flowKey: 'login_system',
      flowName: '登录系统',
      status: FlowAssetStatus.DRAFT,
      allowAiReuse: true,
      latestValidationStatus: ValidationStatus.NOT_VALIDATED,
      createdBy: 1,
      createdAt: '2026-06-09T10:00:00Z',
      updatedBy: 1,
      updatedAt: '2026-06-09T10:00:00Z',
    })

    expect(mockedDeleteFlowAsset).toHaveBeenCalledWith(12, 6)
    expect(mockedFetchFlowAssetList).toHaveBeenCalledWith({
      projectId: 6,
      keyword: undefined,
      status: '',
      validationStatus: '',
      pageNo: 1,
      pageSize: 20,
    })
  })
})
