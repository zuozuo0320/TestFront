import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from '@/stores/project'
import { useAiCompositionWorkbench } from './useAiCompositionWorkbench'
import {
  AssertionAssetStatus,
  FlowAssetStatus,
  ScenarioCodeEditStatus,
  ScenarioCompositionStatus,
  ScenarioStepType,
  ValidationStatus,
  addScenarioStep,
  deleteScenarioComposition,
  fetchAssertionAssetList,
  fetchFlowAssetList,
  fetchScenarioAiSuggestions,
  fetchScenarioCompositionDetail,
  fetchScenarioCompositionReferences,
  fetchScenarioCompositionValidations,
  fetchScenarioCompositionVersions,
  fetchScenarioVersionDiff,
  generateScenarioCode,
  optimizeScenarioComposition,
  rollbackScenarioVersion,
  setScenarioCodeLock,
  updateScenarioGeneratedCode,
  validateScenarioComposition,
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
  const AssertionAssetStatus = {
    DRAFT: 'DRAFT',
    PUBLISHED: 'PUBLISHED',
    ARCHIVED: 'ARCHIVED',
  }
  const FlowAssetStatus = {
    DRAFT: 'DRAFT',
    PUBLISHED: 'PUBLISHED',
    ARCHIVED: 'ARCHIVED',
  }
  const ScenarioCompositionStatus = {
    DRAFT: 'DRAFT',
    GENERATED: 'GENERATED',
    VALIDATING: 'VALIDATING',
    PASSED: 'PASSED',
    FAILED: 'FAILED',
    PUBLISHED: 'PUBLISHED',
    ARCHIVED: 'ARCHIVED',
  }
  const ScenarioCodeEditStatus = {
    AUTO_GENERATED: 'AUTO_GENERATED',
    MANUAL_PATCHED: 'MANUAL_PATCHED',
    LOCKED: 'LOCKED',
  }
  const ScenarioStepType = {
    FLOW_CALL: 'FLOW_CALL',
    ASSERTION: 'ASSERTION',
    ATOMIC_ACTION: 'ATOMIC_ACTION',
    CODE_BLOCK: 'CODE_BLOCK',
    AI_GENERATED: 'AI_GENERATED',
  }
  const ValidationStatus = {
    NOT_VALIDATED: 'NOT_VALIDATED',
    VALIDATING: 'VALIDATING',
    PASSED: 'PASSED',
    FAILED: 'FAILED',
    ERROR: 'ERROR',
  }
  return {
    AssertionAssetStatus,
    FlowAssetStatus,
    ScenarioCodeEditStatus,
    ScenarioCompositionStatus,
    ScenarioStepType,
    ValidationStatus,
    addScenarioStep: vi.fn(),
    archiveScenarioComposition: vi.fn(),
    deleteScenarioComposition: vi.fn(),
    deleteScenarioStep: vi.fn(),
    fetchAssertionAssetList: vi.fn(),
    fetchFlowAssetList: vi.fn(),
    fetchScenarioAiSuggestions: vi.fn(),
    fetchScenarioCompositionDetail: vi.fn(),
    fetchScenarioCompositionReferences: vi.fn(),
    fetchScenarioCompositionValidations: vi.fn(),
    fetchScenarioCompositionVersions: vi.fn(),
    fetchScenarioVersionDiff: vi.fn(),
    generateScenarioCode: vi.fn(),
    optimizeScenarioComposition: vi.fn(),
    publishScenarioComposition: vi.fn(),
    reorderScenarioSteps: vi.fn(),
    rollbackScenarioVersion: vi.fn(),
    setScenarioCodeLock: vi.fn(),
    updateScenarioComposition: vi.fn(),
    updateScenarioGeneratedCode: vi.fn(),
    updateScenarioStep: vi.fn(),
    validateScenarioComposition: vi.fn(),
  }
})

const mockedFetchScenarioCompositionDetail = vi.mocked(fetchScenarioCompositionDetail)
const mockedFetchFlowAssetList = vi.mocked(fetchFlowAssetList)
const mockedFetchAssertionAssetList = vi.mocked(fetchAssertionAssetList)
const mockedFetchScenarioCompositionVersions = vi.mocked(fetchScenarioCompositionVersions)
const mockedFetchScenarioCompositionValidations = vi.mocked(fetchScenarioCompositionValidations)
const mockedFetchScenarioCompositionReferences = vi.mocked(fetchScenarioCompositionReferences)
const mockedFetchScenarioVersionDiff = vi.mocked(fetchScenarioVersionDiff)
const mockedFetchScenarioAiSuggestions = vi.mocked(fetchScenarioAiSuggestions)
const mockedOptimizeScenarioComposition = vi.mocked(optimizeScenarioComposition)
const mockedAddScenarioStep = vi.mocked(addScenarioStep)
const mockedDeleteScenarioComposition = vi.mocked(deleteScenarioComposition)
const mockedGenerateScenarioCode = vi.mocked(generateScenarioCode)
const mockedRollbackScenarioVersion = vi.mocked(rollbackScenarioVersion)
const mockedSetScenarioCodeLock = vi.mocked(setScenarioCodeLock)
const mockedUpdateScenarioGeneratedCode = vi.mocked(updateScenarioGeneratedCode)
const mockedValidateScenarioComposition = vi.mocked(validateScenarioComposition)

function selectProject(projectId = 1) {
  const projectStore = useProjectStore()
  projectStore.selectedProjectId = projectId
  return projectStore
}

function mockWorkbenchQueries() {
  mockedFetchScenarioCompositionDetail.mockResolvedValue({
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
    steps: [
      {
        id: 101,
        scenarioId: 20,
        stepNo: 1,
        stepType: ScenarioStepType.FLOW_CALL,
        stepName: '登录系统',
        refFlowId: 12,
        refFlowVersionId: 30,
        paramMapping: { username: '${env.ADMIN_USER}' },
        outputMapping: {},
        manualReviewed: false,
        aiConfidence: 0,
        enabled: true,
        createdAt: '2026-06-09T10:00:00Z',
        updatedAt: '2026-06-09T10:00:00Z',
      },
    ],
  })
  mockedFetchFlowAssetList.mockResolvedValue({
    total: 1,
    list: [
      {
        id: 12,
        projectId: 6,
        flowKey: 'login_system',
        flowName: '登录系统',
        status: FlowAssetStatus.PUBLISHED,
        allowAiReuse: true,
        latestValidationStatus: ValidationStatus.PASSED,
        createdBy: 1,
        createdAt: '2026-06-09T10:00:00Z',
        updatedBy: 1,
        updatedAt: '2026-06-09T10:00:00Z',
      },
    ],
  })
  mockedFetchAssertionAssetList.mockResolvedValue({
    total: 1,
    list: [
      {
        id: 5,
        projectId: 6,
        assertionKey: 'title_visible',
        assertionName: '标题可见',
        assertionType: 'TEXT_CONTAINS',
        status: AssertionAssetStatus.PUBLISHED,
        allowAiReuse: true,
        latestValidationStatus: ValidationStatus.PASSED,
        createdBy: 1,
        createdAt: '2026-06-09T10:00:00Z',
        updatedBy: 1,
        updatedAt: '2026-06-09T10:00:00Z',
      },
    ],
  })
  mockedFetchScenarioCompositionVersions.mockResolvedValue([])
  mockedFetchScenarioCompositionValidations.mockResolvedValue([])
  mockedFetchScenarioCompositionReferences.mockResolvedValue([])
}

describe('useAiCompositionWorkbench', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    routerPush.mockReset()
    vi.clearAllMocks()
    mockWorkbenchQueries()
  })

  it('加载工作台时应同时加载详情、资产库和治理信息', async () => {
    selectProject(6)
    const workbench = useAiCompositionWorkbench(20)

    await workbench.loadWorkbench()

    expect(mockedFetchScenarioCompositionDetail).toHaveBeenCalledWith(20, 6)
    expect(mockedFetchFlowAssetList).toHaveBeenCalledWith({
      projectId: 6,
      status: FlowAssetStatus.PUBLISHED,
      pageNo: 1,
      pageSize: 100,
    })
    expect(workbench.composition.value?.scenarioKey).toBe('login_and_check')
    expect(workbench.flows.value).toHaveLength(1)
    expect(workbench.assertions.value).toHaveLength(1)
    expect(workbench.selectedStepId.value).toBe(101)
  })

  it('添加原子步骤时应解析 JSON 参数并刷新详情', async () => {
    selectProject(6)
    mockedAddScenarioStep.mockResolvedValue({
      id: 102,
      scenarioId: 20,
      stepNo: 2,
      stepType: ScenarioStepType.ATOMIC_ACTION,
      stepName: '打开页面',
      atomicAction: 'goto',
      paramMapping: { url: '${env.BASE_URL}' },
      outputMapping: {},
      manualReviewed: false,
      aiConfidence: 0,
      enabled: true,
      createdAt: '2026-06-09T10:00:00Z',
      updatedAt: '2026-06-09T10:00:00Z',
    })
    mockedFetchScenarioCompositionDetail.mockResolvedValueOnce({
      id: 20,
      projectId: 6,
      scenarioKey: 'login_and_check',
      scenarioName: '登录并检查',
      status: ScenarioCompositionStatus.DRAFT,
      latestValidationStatus: ValidationStatus.NOT_VALIDATED,
      revision: 2,
      createdBy: 1,
      createdAt: '2026-06-09T10:00:00Z',
      updatedBy: 1,
      updatedAt: '2026-06-09T10:00:00Z',
      steps: [
        {
          id: 101,
          scenarioId: 20,
          stepNo: 1,
          stepType: ScenarioStepType.FLOW_CALL,
          stepName: '登录系统',
          refFlowId: 12,
          refFlowVersionId: 30,
          paramMapping: { username: '${env.ADMIN_USER}' },
          outputMapping: {},
          manualReviewed: false,
          aiConfidence: 0,
          enabled: true,
          createdAt: '2026-06-09T10:00:00Z',
          updatedAt: '2026-06-09T10:00:00Z',
        },
        {
          id: 102,
          scenarioId: 20,
          stepNo: 2,
          stepType: ScenarioStepType.ATOMIC_ACTION,
          stepName: '打开页面',
          atomicAction: 'goto',
          paramMapping: { url: '${env.BASE_URL}' },
          outputMapping: {},
          manualReviewed: false,
          aiConfidence: 0,
          enabled: true,
          createdAt: '2026-06-09T10:00:00Z',
          updatedAt: '2026-06-09T10:00:00Z',
        },
      ],
    })
    const workbench = useAiCompositionWorkbench(20)
    workbench.openStepDialog(ScenarioStepType.ATOMIC_ACTION)

    await workbench.submitStep()

    expect(mockedAddScenarioStep).toHaveBeenCalledWith(20, {
      projectId: 6,
      stepType: ScenarioStepType.ATOMIC_ACTION,
      stepName: '打开页面',
      refFlowId: undefined,
      refFlowVersionId: undefined,
      refAssertionId: undefined,
      atomicAction: 'goto',
      paramMapping: { url: '${env.BASE_URL}' },
      outputMapping: {},
      codeBlock: undefined,
      manualReviewed: false,
      aiConfidence: 0,
      enabled: true,
    })
    expect(workbench.selectedStepId.value).toBe(102)
  })

  it('生成代码与验证应调用编排接口并切换底部面板', async () => {
    selectProject(6)
    mockedGenerateScenarioCode.mockResolvedValue({
      compositionId: 20,
      status: ScenarioCompositionStatus.GENERATED,
      files: [{ path: 'spec/login_and_check.spec.ts', operation: 'UPSERT' }],
      warnings: [],
      generatedCode: 'test("login", async () => {})',
    })
    mockedValidateScenarioComposition.mockResolvedValue({
      id: 200,
      compositionId: 20,
      projectId: 6,
      status: 'PASSED',
      durationMs: 100,
      createdBy: 1,
      createdAt: '2026-06-09T10:00:00Z',
    })
    const workbench = useAiCompositionWorkbench(20)

    await workbench.generateCode()
    await workbench.validateComposition()

    expect(mockedGenerateScenarioCode).toHaveBeenCalledWith(20, 6)
    expect(mockedValidateScenarioComposition).toHaveBeenCalledWith(20, {
      projectId: 6,
      environment: 'test',
      variables: {},
      idempotencyKey: expect.stringMatching(/^validate-20-/),
    })
    expect(workbench.activeBottomTab.value).toBe('validations')
  })

  it('人工编辑生成代码时应保存补丁并按选择锁定', async () => {
    selectProject(6)
    mockedFetchScenarioCompositionDetail.mockResolvedValueOnce({
      id: 20,
      projectId: 6,
      scenarioKey: 'login_and_check',
      scenarioName: '登录并检查',
      status: ScenarioCompositionStatus.GENERATED,
      latestValidationStatus: ValidationStatus.NOT_VALIDATED,
      generatedCode: 'test("login", async () => {})',
      codeEditStatus: ScenarioCodeEditStatus.AUTO_GENERATED,
      revision: 3,
      createdBy: 1,
      createdAt: '2026-06-09T10:00:00Z',
      updatedBy: 1,
      updatedAt: '2026-06-09T10:00:00Z',
      steps: [],
    })
    mockedUpdateScenarioGeneratedCode.mockResolvedValue({
      id: 20,
      projectId: 6,
      scenarioKey: 'login_and_check',
      scenarioName: '登录并检查',
      status: ScenarioCompositionStatus.GENERATED,
      latestValidationStatus: ValidationStatus.NOT_VALIDATED,
      generatedCode: 'test("login", async () => {})\n// manual patch',
      codeEditStatus: ScenarioCodeEditStatus.LOCKED,
      codeChangeSummary: '人工补丁',
      revision: 4,
      createdBy: 1,
      createdAt: '2026-06-09T10:00:00Z',
      updatedBy: 1,
      updatedAt: '2026-06-09T10:00:00Z',
      steps: [],
    })
    const workbench = useAiCompositionWorkbench(20)
    await workbench.loadWorkbench()

    workbench.enterCodeEditMode()
    workbench.codeDraft.value = 'test("login", async () => {})\n// manual patch'
    workbench.codeChangeSummary.value = '人工补丁'
    workbench.lockCodeAfterSave.value = true

    await workbench.saveManualCode()

    expect(mockedUpdateScenarioGeneratedCode).toHaveBeenCalledWith(20, {
      projectId: 6,
      generatedCode: 'test("login", async () => {})\n// manual patch',
      changeSummary: '人工补丁',
      locked: true,
      expectedRevision: 3,
    })
    expect(workbench.locked.value).toBe(true)
    expect(workbench.codeEditMode.value).toBe(false)
  })

  it('锁定状态下不应触发自动生成，解除锁定应调用治理接口', async () => {
    selectProject(6)
    mockedFetchScenarioCompositionDetail.mockResolvedValueOnce({
      id: 20,
      projectId: 6,
      scenarioKey: 'login_and_check',
      scenarioName: '登录并检查',
      status: ScenarioCompositionStatus.GENERATED,
      latestValidationStatus: ValidationStatus.NOT_VALIDATED,
      generatedCode: 'test("login", async () => {})',
      codeEditStatus: ScenarioCodeEditStatus.LOCKED,
      revision: 4,
      createdBy: 1,
      createdAt: '2026-06-09T10:00:00Z',
      updatedBy: 1,
      updatedAt: '2026-06-09T10:00:00Z',
      steps: [
        {
          id: 101,
          scenarioId: 20,
          stepNo: 1,
          stepType: ScenarioStepType.FLOW_CALL,
          stepName: '登录系统',
          refFlowId: 12,
          refFlowVersionId: 30,
          paramMapping: {},
          outputMapping: {},
          manualReviewed: false,
          aiConfidence: 0,
          enabled: true,
          createdAt: '2026-06-09T10:00:00Z',
          updatedAt: '2026-06-09T10:00:00Z',
        },
      ],
    })
    mockedSetScenarioCodeLock.mockResolvedValue({
      id: 20,
      projectId: 6,
      scenarioKey: 'login_and_check',
      scenarioName: '登录并检查',
      status: ScenarioCompositionStatus.GENERATED,
      latestValidationStatus: ValidationStatus.NOT_VALIDATED,
      generatedCode: 'test("login", async () => {})',
      codeEditStatus: ScenarioCodeEditStatus.MANUAL_PATCHED,
      revision: 5,
      createdBy: 1,
      createdAt: '2026-06-09T10:00:00Z',
      updatedBy: 1,
      updatedAt: '2026-06-09T10:00:00Z',
      steps: [],
    })
    const workbench = useAiCompositionWorkbench(20)
    await workbench.loadWorkbench()

    await workbench.generateCode()
    expect(mockedGenerateScenarioCode).not.toHaveBeenCalled()

    await workbench.toggleCodeLock(false)
    expect(mockedSetScenarioCodeLock).toHaveBeenCalledWith(20, {
      projectId: 6,
      locked: false,
      changeSummary: '解除生成代码锁定',
    })
    expect(workbench.locked.value).toBe(false)
  })

  it('AI 建议应支持低置信度确认和忽略', async () => {
    selectProject(6)
    mockedFetchScenarioAiSuggestions.mockResolvedValue({
      planId: 'plan_1',
      confidence: 0.74,
      summary: '推荐 1 个断言',
      warnings: [],
      steps: [
        {
          type: ScenarioStepType.ASSERTION,
          assertionId: 5,
          assertionKey: 'title_visible',
          confidence: 0.74,
          reason: '录制结果可能需要标题断言',
          inputs: { text: '首页' },
        },
      ],
    })
    mockedAddScenarioStep.mockResolvedValue({
      id: 103,
      scenarioId: 20,
      stepNo: 2,
      stepType: ScenarioStepType.ASSERTION,
      stepName: 'title_visible',
      refAssertionId: 5,
      paramMapping: { text: '首页' },
      outputMapping: {},
      manualReviewed: true,
      aiConfidence: 0.74,
      enabled: true,
      createdAt: '2026-06-09T10:00:00Z',
      updatedAt: '2026-06-09T10:00:00Z',
    })
    const workbench = useAiCompositionWorkbench(20)

    await workbench.loadAiSuggestions()

    expect(workbench.visibleAiPlanSteps.value).toHaveLength(1)
    const suggestion = workbench.visibleAiPlanSteps.value[0]
    expect(suggestion).toBeDefined()
    if (!suggestion) return
    expect(workbench.isLowConfidenceStep(suggestion)).toBe(true)

    await workbench.acceptAiStep(suggestion)

    expect(mockedAddScenarioStep).toHaveBeenCalledWith(20, {
      projectId: 6,
      stepType: ScenarioStepType.ASSERTION,
      stepName: 'title_visible',
      refFlowId: undefined,
      refFlowVersionId: undefined,
      refAssertionId: 5,
      paramMapping: { text: '首页' },
      outputMapping: {},
      aiConfidence: 0.74,
      manualReviewed: true,
      enabled: true,
    })

    workbench.ignoreAiStep(suggestion)
    expect(workbench.visibleAiPlanSteps.value).toHaveLength(0)
  })

  it('AI 优化应调用编排优化接口并切换到底部建议面板', async () => {
    selectProject(6)
    mockedOptimizeScenarioComposition.mockResolvedValue({
      planId: 'optimize_1',
      confidence: 0.82,
      summary: '推荐补充断言',
      warnings: [],
      steps: [
        {
          type: ScenarioStepType.ASSERTION,
          assertionId: 5,
          assertionKey: 'title_visible',
          confidence: 0.82,
          reason: '当前编排缺少结果校验',
          inputs: {},
        },
      ],
    })
    const workbench = useAiCompositionWorkbench(20)

    await workbench.loadAiOptimization()

    expect(mockedOptimizeScenarioComposition).toHaveBeenCalledWith(20, 6)
    expect(workbench.activeBottomTab.value).toBe('ai')
    expect(workbench.visibleAiPlanSteps.value).toHaveLength(1)
  })

  it('版本 Diff 和回滚应调用治理接口并刷新工作台', async () => {
    selectProject(6)
    const version1 = {
      id: 301,
      compositionId: 20,
      versionNo: 1,
      versionStatus: ScenarioCompositionStatus.PUBLISHED,
      generatedCode: 'test("v1", async () => {})',
      changeSummary: 'V1',
      createdBy: 1,
      createdAt: '2026-06-09T10:00:00Z',
    }
    const version2 = {
      id: 302,
      compositionId: 20,
      versionNo: 2,
      versionStatus: ScenarioCompositionStatus.PUBLISHED,
      generatedCode: 'test("v2", async () => {})',
      changeSummary: 'V2',
      createdBy: 1,
      createdAt: '2026-06-09T11:00:00Z',
    }
    mockedFetchScenarioCompositionVersions.mockResolvedValue([version2, version1])
    mockedFetchScenarioVersionDiff.mockResolvedValue({
      compositionId: 20,
      baseVersion: version1,
      targetVersion: version2,
      dslChanged: true,
      codeChanged: true,
      dslStats: {
        baseLineCount: 1,
        targetLineCount: 2,
        addedLines: 1,
        removedLines: 0,
        unchangedLines: 1,
        preview: [{ kind: 'added', text: '"steps": []' }],
        truncated: false,
      },
      codeStats: {
        baseLineCount: 1,
        targetLineCount: 1,
        addedLines: 1,
        removedLines: 1,
        unchangedLines: 0,
        preview: [{ kind: 'removed', text: 'test("v1", async () => {})' }],
        truncated: false,
      },
      summary: ['DSL 变更：新增 1 行，删除 0 行'],
    })
    mockedFetchScenarioCompositionDetail.mockResolvedValueOnce({
      id: 20,
      projectId: 6,
      scenarioKey: 'login_and_check',
      scenarioName: '登录并检查',
      status: ScenarioCompositionStatus.GENERATED,
      latestValidationStatus: ValidationStatus.NOT_VALIDATED,
      generatedCode: 'test("v2", async () => {})',
      codeEditStatus: ScenarioCodeEditStatus.LOCKED,
      revision: 4,
      createdBy: 1,
      createdAt: '2026-06-09T10:00:00Z',
      updatedBy: 1,
      updatedAt: '2026-06-09T11:00:00Z',
      steps: [],
    })
    mockedRollbackScenarioVersion.mockResolvedValue({
      id: 20,
      projectId: 6,
      scenarioKey: 'login_and_check',
      scenarioName: '登录并检查',
      status: ScenarioCompositionStatus.GENERATED,
      latestValidationStatus: ValidationStatus.NOT_VALIDATED,
      generatedCode: 'test("v1", async () => {})',
      codeEditStatus: ScenarioCodeEditStatus.AUTO_GENERATED,
      revision: 5,
      createdBy: 1,
      createdAt: '2026-06-09T10:00:00Z',
      updatedBy: 1,
      updatedAt: '2026-06-09T12:00:00Z',
      steps: [],
    })
    const workbench = useAiCompositionWorkbench(20)
    await workbench.loadWorkbench()

    await workbench.showVersionDiff(version2)

    expect(mockedFetchScenarioVersionDiff).toHaveBeenCalledWith(20, 6, 301, 302)
    expect(workbench.versionDiffVisible.value).toBe(true)
    expect(workbench.versionDiff.value?.summary).toEqual(['DSL 变更：新增 1 行，删除 0 行'])

    await workbench.rollbackVersion(version1)

    expect(mockedRollbackScenarioVersion).toHaveBeenCalledWith(20, {
      projectId: 6,
      versionId: 301,
      overrideLockedCode: true,
      changeSummary: '回滚到 V1',
    })
    expect(workbench.composition.value?.generatedCode).toBe('test("v1", async () => {})')
    expect(workbench.activeBottomTab.value).toBe('versions')
  })

  it('删除草稿编排后应返回列表页', async () => {
    selectProject(6)
    mockedDeleteScenarioComposition.mockResolvedValue(undefined)
    const workbench = useAiCompositionWorkbench(20)
    await workbench.loadWorkbench()

    await workbench.deleteComposition()

    expect(mockedDeleteScenarioComposition).toHaveBeenCalledWith(20, 6)
    expect(routerPush).toHaveBeenCalledWith('/ai-script/compositions')
  })
})
