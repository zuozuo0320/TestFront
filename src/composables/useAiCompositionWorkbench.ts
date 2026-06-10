/**
 * 场景编排工作台业务逻辑 Composable。
 *
 * 负责详情加载、资产库、步骤编排、代码生成、验证、发布、AI 建议和治理信息刷新。
 */
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useProjectStore } from '@/stores/project'
import {
  extractErrorMessage,
  extractFieldErrors,
  isElMessageBoxCancel,
  type FieldError,
} from '@/utils/error'
import {
  AssertionAssetStatus,
  FlowAssetStatus,
  ScenarioCodeEditStatus,
  ScenarioCompositionStatus,
  ScenarioStepType,
  addScenarioStep,
  archiveScenarioComposition,
  deleteScenarioStep,
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
  publishScenarioComposition,
  refreshScenarioFlowRefs,
  reorderScenarioSteps,
  rollbackScenarioVersion,
  setScenarioCodeLock,
  updateScenarioComposition,
  updateScenarioGeneratedCode,
  updateScenarioStep,
  validateScenarioComposition,
  type AiAssertionAsset,
  type AiAssetReference,
  type AiCompositionPlanResult,
  type AiCompositionPlanStep,
  type AiCompositionValidation,
  type AiFlowAsset,
  type AiScenarioComposition,
  type AiScenarioCompositionVersion,
  type AiScenarioVersionDiffResult,
  type AiScenarioStep,
  type SaveScenarioStepPayload,
  type ScenarioStepType as ScenarioStepTypeType,
} from '@/api/aiScript'

interface StepForm {
  stepName: string
  stepType: ScenarioStepTypeType
  refFlowId?: number
  refFlowVersionId?: number
  refAssertionId?: number
  atomicAction: string
  paramMappingText: string
  outputMappingText: string
  codeBlock: string
  manualReviewed: boolean
  aiConfidence: number
  enabled: boolean
}

interface ScenarioForm {
  scenarioName: string
  description: string
}

interface ValidationForm {
  environment: string
  variablesText: string
}

export interface StepIssue {
  level: 'error' | 'warning'
  message: string
}

const lowConfidenceThreshold = 0.8
const editableRoles = new Set(['admin', 'manager', 'tester', 'developer'])

function parseJsonObject(value: string, fieldName: string): Record<string, unknown> {
  const trimmed = value.trim()
  if (!trimmed) return {}
  const parsed = JSON.parse(trimmed) as unknown
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${fieldName} 必须是 JSON 对象`)
  }
  return parsed as Record<string, unknown>
}

function stringifyJson(value: Record<string, unknown> | undefined) {
  return JSON.stringify(value || {}, null, 2)
}

function isBlankParam(value: unknown) {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  return false
}

function hasParam(params: Record<string, unknown> | undefined, ...keys: string[]) {
  if (!params) return false
  return keys.some((key) => !isBlankParam(params[key]))
}

function matchFieldError(errors: FieldError[], fields: string[]) {
  const normalizedFields = new Set(fields)
  const found = errors.find((item) => normalizedFields.has(item.field))
  return found?.message || ''
}

function createDefaultStepForm(): StepForm {
  return {
    stepName: '',
    stepType: ScenarioStepType.FLOW_CALL,
    refFlowId: undefined,
    refFlowVersionId: undefined,
    refAssertionId: undefined,
    atomicAction: 'goto',
    paramMappingText: '{}',
    outputMappingText: '{}',
    codeBlock: '',
    manualReviewed: false,
    aiConfidence: 0,
    enabled: true,
  }
}

function defaultStepName(type: ScenarioStepTypeType, label?: string) {
  if (label) return label
  switch (type) {
    case ScenarioStepType.FLOW_CALL:
      return '调用固定场景'
    case ScenarioStepType.ASSERTION:
      return '执行断言'
    case ScenarioStepType.ATOMIC_ACTION:
      return '原子操作'
    case ScenarioStepType.CODE_BLOCK:
      return '自定义代码'
    case ScenarioStepType.AI_GENERATED:
      return 'AI 推荐步骤'
    default:
      return '编排步骤'
  }
}

function normalizeScenarioSnapshot(name: string, description: string) {
  return `${name.trim()}\n${description.trim()}`
}

/** 场景编排详情工作台逻辑。 */
export function useAiCompositionWorkbench(compositionId: number) {
  const router = useRouter()
  const authStore = useAuthStore()
  const projectStore = useProjectStore()
  const projectId = computed(() => projectStore.selectedProjectId)

  const composition = ref<AiScenarioComposition | null>(null)
  const flows = ref<AiFlowAsset[]>([])
  const assertions = ref<AiAssertionAsset[]>([])
  const versions = ref<AiScenarioCompositionVersion[]>([])
  const validations = ref<AiCompositionValidation[]>([])
  const references = ref<AiAssetReference[]>([])
  const versionDiff = ref<AiScenarioVersionDiffResult | null>(null)
  const aiPlan = ref<AiCompositionPlanResult | null>(null)
  const ignoredAiStepKeys = ref<Set<string>>(new Set())
  const selectedStepId = ref<number | null>(null)
  const activeAssetTab = ref<'flows' | 'assertions' | 'atomic'>('flows')
  const activeBottomTab = ref<
    'dsl' | 'code' | 'logs' | 'validations' | 'ai' | 'references' | 'versions'
  >('dsl')
  const loading = ref(false)
  const assetLoading = ref(false)
  const saving = ref(false)
  const generating = ref(false)
  const validating = ref(false)
  const publishing = ref(false)
  const aiPlanning = ref(false)
  const versionDiffLoading = ref(false)
  const refreshingFlowRefs = ref(false)
  const errorMessage = ref('')
  const stepDialogVisible = ref(false)
  const versionDiffVisible = ref(false)
  const isEditingStep = ref(false)
  const codeEditMode = ref(false)
  const codeDraft = ref('')
  const codeChangeSummary = ref('')
  const lockCodeAfterSave = ref(true)
  const scenarioSnapshot = ref('')
  const scenarioFieldErrors = ref<FieldError[]>([])
  const stepFieldErrors = ref<FieldError[]>([])
  const validationFieldErrors = ref<FieldError[]>([])

  const scenarioForm = reactive<ScenarioForm>({
    scenarioName: '',
    description: '',
  })

  const validationForm = reactive<ValidationForm>({
    environment: 'test',
    variablesText: '{}',
  })

  const validationFormErrors = reactive({
    variablesText: '',
  })

  const stepForm = reactive<StepForm>(createDefaultStepForm())

  const steps = computed(() => composition.value?.steps || [])
  const selectedStep = computed(
    () => steps.value.find((item) => item.id === selectedStepId.value) || steps.value[0] || null,
  )
  const dslText = computed(() => JSON.stringify(composition.value?.dsl || {}, null, 2))
  const generatedCode = computed(() => composition.value?.generatedCode || '')
  const latestValidation = computed(() => validations.value[0] || null)
  const latestValidationLogs = computed(() => latestValidation.value?.logs || [])
  const visibleAiPlanSteps = computed(
    () =>
      aiPlan.value?.steps.filter((step) => !ignoredAiStepKeys.value.has(buildAiStepKey(step))) ||
      [],
  )
  const userRole = computed(() => authStore.user?.role || '')
  const permissionDenied = computed(
    () => Boolean(userRole.value) && !editableRoles.has(userRole.value),
  )
  const locked = computed(() => composition.value?.codeEditStatus === ScenarioCodeEditStatus.LOCKED)
  const dirty = computed(
    () =>
      normalizeScenarioSnapshot(scenarioForm.scenarioName, scenarioForm.description) !==
      scenarioSnapshot.value,
  )
  const codeDirty = computed(() => codeEditMode.value && codeDraft.value !== generatedCode.value)
  const canGenerate = computed(
    () => steps.value.length > 0 && !generating.value && !locked.value && !permissionDenied.value,
  )
  const canValidate = computed(() => Boolean(generatedCode.value.trim()) && !validating.value)
  const canPublish = computed(
    () =>
      composition.value?.latestValidationStatus === 'PASSED' &&
      !publishing.value &&
      !permissionDenied.value,
  )
  const outdatedFlowRefs = computed(() => composition.value?.outdatedFlowRefs || [])
  const outdatedFlowIds = computed(
    () => new Set(outdatedFlowRefs.value.map((item) => item.targetId)),
  )
  const stepIssueMap = computed(() => {
    const result = new Map<number, StepIssue[]>()
    for (const step of steps.value) {
      result.set(step.id, getStepIssues(step))
    }
    return result
  })
  const selectedStepIssues = computed(() =>
    selectedStep.value ? stepIssueMap.value.get(selectedStep.value.id) || [] : [],
  )
  const hasBlockingStepIssues = computed(() =>
    [...stepIssueMap.value.values()].some((issues) =>
      issues.some((item) => item.level === 'error'),
    ),
  )
  const canDeleteComposition = computed(
    () =>
      composition.value?.status === ScenarioCompositionStatus.DRAFT &&
      !saving.value &&
      !permissionDenied.value,
  )
  const canSaveScenario = computed(() => dirty.value && !saving.value && !permissionDenied.value)
  const canToggleCodeLock = computed(
    () => Boolean(generatedCode.value.trim()) && !saving.value && !permissionDenied.value,
  )

  function applyCompositionDetail(detail: AiScenarioComposition, resetSelectedStep: boolean) {
    composition.value = detail
    scenarioForm.scenarioName = detail.scenarioName
    scenarioForm.description = detail.description || ''
    scenarioSnapshot.value = normalizeScenarioSnapshot(
      detail.scenarioName,
      detail.description || '',
    )
    if (!codeEditMode.value) {
      codeDraft.value = detail.generatedCode || ''
      codeChangeSummary.value = detail.codeChangeSummary || ''
      lockCodeAfterSave.value = detail.codeEditStatus === ScenarioCodeEditStatus.LOCKED
    }
    if (resetSelectedStep) {
      selectedStepId.value = detail.steps?.[0]?.id ?? null
      return
    }
    if (selectedStepId.value && !detail.steps?.some((item) => item.id === selectedStepId.value)) {
      selectedStepId.value = detail.steps?.[0]?.id ?? null
    }
  }

  async function loadWorkbench() {
    if (!projectId.value) {
      errorMessage.value = '请先选择项目'
      return
    }
    loading.value = true
    errorMessage.value = ''
    try {
      const detail = await fetchScenarioCompositionDetail(compositionId, projectId.value)
      applyCompositionDetail(detail, true)
      await Promise.all([loadAssets(), refreshGovernance()])
    } catch (error: unknown) {
      errorMessage.value = extractErrorMessage(error, '加载场景编排失败')
      ElMessage.error(errorMessage.value)
    } finally {
      loading.value = false
    }
  }

  async function loadAssets() {
    if (!projectId.value) return
    assetLoading.value = true
    try {
      const [flowResult, assertionResult] = await Promise.all([
        fetchFlowAssetList({
          projectId: projectId.value,
          status: FlowAssetStatus.PUBLISHED,
          pageNo: 1,
          pageSize: 100,
        }),
        fetchAssertionAssetList({
          projectId: projectId.value,
          status: AssertionAssetStatus.PUBLISHED,
          pageNo: 1,
          pageSize: 100,
        }),
      ])
      flows.value = flowResult.list
      assertions.value = assertionResult.list
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, '加载资产库失败'))
    } finally {
      assetLoading.value = false
    }
  }

  async function refreshGovernance() {
    if (!projectId.value) return
    const [versionList, validationList, referenceList] = await Promise.all([
      fetchScenarioCompositionVersions(compositionId, projectId.value),
      fetchScenarioCompositionValidations(compositionId, projectId.value),
      fetchScenarioCompositionReferences(compositionId, projectId.value),
    ])
    versions.value = versionList
    validations.value = validationList
    references.value = referenceList
  }

  async function reloadDetailOnly() {
    if (!projectId.value) return
    const detail = await fetchScenarioCompositionDetail(compositionId, projectId.value)
    applyCompositionDetail(detail, false)
  }

  async function saveScenario() {
    if (!projectId.value || !composition.value) return
    if (permissionDenied.value) {
      ElMessage.warning('当前账号无编辑权限')
      return
    }
    if (!scenarioForm.scenarioName.trim()) {
      ElMessage.warning('请填写场景名称')
      return
    }
    saving.value = true
    scenarioFieldErrors.value = []
    try {
      const updated = await updateScenarioComposition(compositionId, {
        projectId: projectId.value,
        scenarioName: scenarioForm.scenarioName.trim(),
        description: scenarioForm.description.trim() || undefined,
        expectedRevision: composition.value.revision,
      })
      applyCompositionDetail(updated, false)
      ElMessage.success('场景信息已保存')
    } catch (error: unknown) {
      scenarioFieldErrors.value = extractFieldErrors(error)
      ElMessage.error(extractErrorMessage(error, '保存场景失败'))
    } finally {
      saving.value = false
    }
  }

  function openStepDialog(type: ScenarioStepTypeType, asset?: AiFlowAsset | AiAssertionAsset) {
    if (permissionDenied.value) {
      ElMessage.warning('当前账号无编辑权限')
      return
    }
    Object.assign(stepForm, createDefaultStepForm())
    stepForm.stepType = type
    isEditingStep.value = false
    if (type === ScenarioStepType.FLOW_CALL && asset) {
      const flow = asset as AiFlowAsset
      stepForm.refFlowId = flow.id
      stepForm.stepName = defaultStepName(type, flow.flowName)
    }
    if (type === ScenarioStepType.ASSERTION && asset) {
      const assertion = asset as AiAssertionAsset
      stepForm.refAssertionId = assertion.id
      stepForm.stepName = defaultStepName(type, assertion.assertionName)
    }
    if (type === ScenarioStepType.ATOMIC_ACTION) {
      stepForm.stepName = '打开页面'
      stepForm.paramMappingText = '{\n  "url": "${env.BASE_URL}"\n}'
    }
    if (type === ScenarioStepType.CODE_BLOCK) {
      stepForm.stepName = '自定义代码'
      stepForm.codeBlock = 'await page.waitForLoadState("networkidle")'
    }
    stepDialogVisible.value = true
  }

  function openEditStepDialog(step: AiScenarioStep) {
    if (permissionDenied.value) {
      ElMessage.warning('当前账号无编辑权限')
      return
    }
    stepForm.stepName = step.stepName
    stepForm.stepType = step.stepType
    stepForm.refFlowId = step.refFlowId
    stepForm.refFlowVersionId = step.refFlowVersionId
    stepForm.refAssertionId = step.refAssertionId
    stepForm.atomicAction = step.atomicAction || 'goto'
    stepForm.paramMappingText = stringifyJson(step.paramMapping)
    stepForm.outputMappingText = stringifyJson(step.outputMapping)
    stepForm.codeBlock = step.codeBlock || ''
    stepForm.manualReviewed = step.manualReviewed
    stepForm.aiConfidence = step.aiConfidence
    stepForm.enabled = step.enabled
    selectedStepId.value = step.id
    isEditingStep.value = true
    stepDialogVisible.value = true
  }

  function buildStepPayload(): SaveScenarioStepPayload | null {
    if (!projectId.value) {
      ElMessage.warning('请先选择项目')
      return null
    }
    stepFieldErrors.value = []
    let paramMapping: Record<string, unknown>
    let outputMapping: Record<string, unknown>
    try {
      paramMapping = parseJsonObject(stepForm.paramMappingText, '参数映射')
    } catch (error: unknown) {
      stepFieldErrors.value = [{ field: 'param_mapping', message: extractErrorMessage(error) }]
      ElMessage.warning(extractErrorMessage(error, '参数映射 JSON 格式不正确'))
      return null
    }
    try {
      outputMapping = parseJsonObject(stepForm.outputMappingText, '输出映射')
    } catch (error: unknown) {
      stepFieldErrors.value = [{ field: 'output_mapping', message: extractErrorMessage(error) }]
      ElMessage.warning(extractErrorMessage(error, '输出映射 JSON 格式不正确'))
      return null
    }
    return {
      projectId: projectId.value,
      stepType: stepForm.stepType,
      stepName: stepForm.stepName.trim() || defaultStepName(stepForm.stepType),
      refFlowId: stepForm.refFlowId,
      refFlowVersionId: stepForm.refFlowVersionId,
      refAssertionId: stepForm.refAssertionId,
      atomicAction:
        stepForm.stepType === ScenarioStepType.ATOMIC_ACTION ? stepForm.atomicAction : undefined,
      paramMapping,
      outputMapping,
      codeBlock: stepForm.stepType === ScenarioStepType.CODE_BLOCK ? stepForm.codeBlock : undefined,
      manualReviewed: stepForm.manualReviewed,
      aiConfidence: stepForm.aiConfidence,
      enabled: stepForm.enabled,
    }
  }

  async function submitStep() {
    if (permissionDenied.value) {
      ElMessage.warning('当前账号无编辑权限')
      return
    }
    const payload = buildStepPayload()
    if (!payload) return
    saving.value = true
    try {
      if (isEditingStep.value && selectedStepId.value) {
        await updateScenarioStep(compositionId, selectedStepId.value, payload)
        ElMessage.success('步骤已更新')
      } else {
        const created = await addScenarioStep(compositionId, payload)
        selectedStepId.value = created.id
        ElMessage.success('步骤已添加')
      }
      stepDialogVisible.value = false
      await reloadDetailOnly()
      await refreshGovernance()
    } catch (error: unknown) {
      stepFieldErrors.value = extractFieldErrors(error)
      ElMessage.error(extractErrorMessage(error, '保存步骤失败'))
    } finally {
      saving.value = false
    }
  }

  async function removeStep(step: AiScenarioStep) {
    if (!projectId.value) return
    if (permissionDenied.value) {
      ElMessage.warning('当前账号无编辑权限')
      return
    }
    try {
      await ElMessageBox.confirm(`确定删除步骤「${step.stepName}」？`, '删除步骤', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      })
      await deleteScenarioStep(compositionId, step.id, projectId.value)
      selectedStepId.value = null
      await reloadDetailOnly()
      await refreshGovernance()
      ElMessage.success('步骤已删除')
    } catch (error: unknown) {
      if (!isElMessageBoxCancel(error)) {
        ElMessage.error(extractErrorMessage(error, '删除步骤失败'))
      }
    }
  }

  async function moveStep(step: AiScenarioStep, direction: -1 | 1) {
    if (!projectId.value) return
    if (permissionDenied.value) {
      ElMessage.warning('当前账号无编辑权限')
      return
    }
    const current = steps.value.findIndex((item) => item.id === step.id)
    const target = current + direction
    if (current < 0 || target < 0 || target >= steps.value.length) return
    const nextSteps = [...steps.value]
    const [removed] = nextSteps.splice(current, 1)
    if (!removed) return
    nextSteps.splice(target, 0, removed)
    try {
      await reorderScenarioSteps(
        compositionId,
        projectId.value,
        nextSteps.map((item) => item.id),
      )
      await reloadDetailOnly()
      ElMessage.success('步骤顺序已更新')
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, '调整步骤顺序失败'))
    }
  }

  async function reorderStepsByIds(stepIds: number[]) {
    if (!projectId.value) return
    if (permissionDenied.value) {
      ElMessage.warning('当前账号无编辑权限')
      return
    }
    try {
      await reorderScenarioSteps(compositionId, projectId.value, stepIds)
      await reloadDetailOnly()
      ElMessage.success('步骤顺序已更新')
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, '调整步骤顺序失败'))
    }
  }

  async function generateCode() {
    if (!projectId.value) return
    if (permissionDenied.value) {
      ElMessage.warning('当前账号无编辑权限')
      return
    }
    if (locked.value) {
      ElMessage.warning('生成代码已锁定，请先解除锁定')
      return
    }
    generating.value = true
    try {
      const result = await generateScenarioCode(compositionId, projectId.value)
      await reloadDetailOnly()
      activeBottomTab.value = 'code'
      if (result.warnings.length > 0) {
        ElMessage.warning(result.warnings.join('；'))
      } else {
        ElMessage.success('代码已生成')
      }
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, '生成代码失败'))
    } finally {
      generating.value = false
    }
  }

  function enterCodeEditMode() {
    if (permissionDenied.value) {
      ElMessage.warning('当前账号无编辑权限')
      return
    }
    codeDraft.value = generatedCode.value
    codeChangeSummary.value = composition.value?.codeChangeSummary || '人工编辑生成代码'
    lockCodeAfterSave.value =
      locked.value ||
      (composition.value?.codeEditStatus ?? ScenarioCodeEditStatus.AUTO_GENERATED) !==
        ScenarioCodeEditStatus.AUTO_GENERATED
    codeEditMode.value = true
    activeBottomTab.value = 'code'
  }

  function cancelCodeEditMode() {
    codeDraft.value = generatedCode.value
    codeChangeSummary.value = composition.value?.codeChangeSummary || ''
    lockCodeAfterSave.value = locked.value
    codeEditMode.value = false
  }

  async function saveManualCode() {
    if (!projectId.value || !composition.value) return
    if (permissionDenied.value) {
      ElMessage.warning('当前账号无编辑权限')
      return
    }
    if (!codeDraft.value.trim()) {
      ElMessage.warning('生成代码不能为空')
      return
    }
    saving.value = true
    try {
      const updated = await updateScenarioGeneratedCode(compositionId, {
        projectId: projectId.value,
        generatedCode: codeDraft.value,
        changeSummary: codeChangeSummary.value.trim() || '人工编辑生成代码',
        locked: lockCodeAfterSave.value,
        expectedRevision: composition.value.revision,
      })
      codeEditMode.value = false
      applyCompositionDetail(updated, false)
      await refreshGovernance()
      ElMessage.success(lockCodeAfterSave.value ? '人工代码已保存并锁定' : '人工代码已保存')
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, '保存人工代码失败'))
    } finally {
      saving.value = false
    }
  }

  async function toggleCodeLock(nextLocked: boolean) {
    if (!projectId.value) return
    if (permissionDenied.value) {
      ElMessage.warning('当前账号无编辑权限')
      return
    }
    saving.value = true
    try {
      const updated = await setScenarioCodeLock(compositionId, {
        projectId: projectId.value,
        locked: nextLocked,
        changeSummary: nextLocked ? '锁定人工修改代码' : '解除生成代码锁定',
      })
      applyCompositionDetail(updated, false)
      ElMessage.success(nextLocked ? '生成代码已锁定' : '生成代码已解除锁定')
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, nextLocked ? '锁定代码失败' : '解除锁定失败'))
    } finally {
      saving.value = false
    }
  }

  async function validateComposition() {
    if (!projectId.value) return
    validationFormErrors.variablesText = ''
    validationFieldErrors.value = []
    let variables: Record<string, unknown>
    try {
      variables = parseJsonObject(validationForm.variablesText, '验证变量')
    } catch (error: unknown) {
      validationFormErrors.variablesText = extractErrorMessage(error, '验证变量必须是 JSON 对象')
      ElMessage.warning(validationFormErrors.variablesText)
      return
    }
    validating.value = true
    try {
      await validateScenarioComposition(compositionId, {
        projectId: projectId.value,
        environment: validationForm.environment.trim() || 'test',
        variables,
        idempotencyKey: `validate-${compositionId}-${Date.now()}`,
      })
      await reloadDetailOnly()
      await refreshGovernance()
      activeBottomTab.value = 'validations'
      ElMessage.success('验证已完成')
    } catch (error: unknown) {
      validationFieldErrors.value = extractFieldErrors(error)
      ElMessage.error(extractErrorMessage(error, '验证失败'))
    } finally {
      validating.value = false
    }
  }

  async function publishComposition() {
    if (!projectId.value) return
    if (permissionDenied.value) {
      ElMessage.warning('当前账号无发布权限')
      return
    }
    publishing.value = true
    try {
      await publishScenarioComposition(compositionId, projectId.value, '发布场景编排')
      await reloadDetailOnly()
      await refreshGovernance()
      ElMessage.success('场景编排已发布')
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, '发布场景编排失败'))
    } finally {
      publishing.value = false
    }
  }

  function findPreviousVersion(version: AiScenarioCompositionVersion) {
    const ordered = [...versions.value].sort((left, right) => left.versionNo - right.versionNo)
    const currentIndex = ordered.findIndex((item) => item.id === version.id)
    if (currentIndex <= 0) return null
    return ordered[currentIndex - 1] || null
  }

  async function showVersionDiff(version: AiScenarioCompositionVersion) {
    if (!projectId.value) return
    const baseVersion = findPreviousVersion(version)
    if (!baseVersion) {
      ElMessage.warning('该版本暂无可对比的上一版本')
      return
    }
    versionDiffLoading.value = true
    try {
      versionDiff.value = await fetchScenarioVersionDiff(
        compositionId,
        projectId.value,
        baseVersion.id,
        version.id,
      )
      versionDiffVisible.value = true
      activeBottomTab.value = 'versions'
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, '加载版本 Diff 失败'))
    } finally {
      versionDiffLoading.value = false
    }
  }

  async function rollbackVersion(version: AiScenarioCompositionVersion) {
    if (!projectId.value) return
    if (permissionDenied.value) {
      ElMessage.warning('当前账号无回滚权限')
      return
    }
    const message = locked.value
      ? `当前生成代码已锁定，回滚到 V${version.versionNo} 会覆盖锁定代码，确定继续？`
      : `确定回滚到 V${version.versionNo}？回滚后需要重新验证。`
    try {
      await ElMessageBox.confirm(message, '回滚编排版本', {
        type: 'warning',
        confirmButtonText: '回滚',
        cancelButtonText: '取消',
      })
      saving.value = true
      const updated = await rollbackScenarioVersion(compositionId, {
        projectId: projectId.value,
        versionId: version.id,
        overrideLockedCode: locked.value,
        changeSummary: `回滚到 V${version.versionNo}`,
      })
      applyCompositionDetail(updated, false)
      await refreshGovernance()
      activeBottomTab.value = 'versions'
      ElMessage.success('编排版本已回滚，请重新验证')
    } catch (error: unknown) {
      if (!isElMessageBoxCancel(error)) {
        ElMessage.error(extractErrorMessage(error, '回滚版本失败'))
      }
    } finally {
      saving.value = false
    }
  }

  async function archiveComposition() {
    if (!projectId.value || !composition.value) return
    if (permissionDenied.value) {
      ElMessage.warning('当前账号无归档权限')
      return
    }
    try {
      await ElMessageBox.confirm(`确定归档「${composition.value.scenarioName}」？`, '归档编排', {
        type: 'warning',
        confirmButtonText: '归档',
        cancelButtonText: '取消',
      })
      await archiveScenarioComposition(compositionId, projectId.value)
      ElMessage.success('场景编排已归档')
      await router.push('/ai-script/compositions')
    } catch (error: unknown) {
      if (!isElMessageBoxCancel(error)) {
        ElMessage.error(extractErrorMessage(error, '归档失败'))
      }
    }
  }

  async function deleteComposition() {
    if (!projectId.value || !composition.value) return
    if (permissionDenied.value) {
      ElMessage.warning('当前账号无删除权限')
      return
    }
    try {
      await ElMessageBox.confirm(
        `确定删除草稿「${composition.value.scenarioName}」？`,
        '删除编排草稿',
        {
          type: 'warning',
          confirmButtonText: '删除',
          cancelButtonText: '取消',
        },
      )
      await deleteScenarioComposition(compositionId, projectId.value)
      ElMessage.success('场景编排草稿已删除')
      await router.push('/ai-script/compositions')
    } catch (error: unknown) {
      if (!isElMessageBoxCancel(error)) {
        ElMessage.error(extractErrorMessage(error, '删除编排草稿失败'))
      }
    }
  }

  async function loadAiSuggestions() {
    if (!projectId.value) return
    aiPlanning.value = true
    try {
      aiPlan.value = await fetchScenarioAiSuggestions(compositionId, projectId.value)
      ignoredAiStepKeys.value = new Set()
      activeBottomTab.value = 'ai'
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, '获取 AI 建议失败'))
    } finally {
      aiPlanning.value = false
    }
  }

  async function loadAiOptimization() {
    if (!projectId.value) return
    aiPlanning.value = true
    try {
      aiPlan.value = await optimizeScenarioComposition(compositionId, projectId.value)
      ignoredAiStepKeys.value = new Set()
      activeBottomTab.value = 'ai'
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, '获取 AI 优化建议失败'))
    } finally {
      aiPlanning.value = false
    }
  }

  async function acceptAiStep(step: AiCompositionPlanStep) {
    if (!projectId.value) return
    if (permissionDenied.value) {
      ElMessage.warning('当前账号无编辑权限')
      return
    }
    const payload: SaveScenarioStepPayload = {
      projectId: projectId.value,
      stepType: step.type,
      stepName: step.flowKey || step.assertionKey || defaultStepName(step.type),
      refFlowId: step.flowId,
      refFlowVersionId: step.flowVersionId,
      refAssertionId: step.assertionId,
      paramMapping: step.inputs || {},
      outputMapping: {},
      aiConfidence: step.confidence,
      manualReviewed: true,
      enabled: true,
    }
    try {
      const created = await addScenarioStep(compositionId, payload)
      selectedStepId.value = created.id
      await reloadDetailOnly()
      await refreshGovernance()
      ElMessage.success('AI 建议已采纳')
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, '采纳 AI 建议失败'))
    }
  }

  function ignoreAiStep(step: AiCompositionPlanStep) {
    ignoredAiStepKeys.value = new Set([...ignoredAiStepKeys.value, buildAiStepKey(step)])
    ElMessage.success('AI 建议已忽略')
  }

  function isLowConfidenceStep(step: AiCompositionPlanStep) {
    return step.confidence > 0 && step.confidence < lowConfidenceThreshold
  }

  function selectStep(step: AiScenarioStep) {
    selectedStepId.value = step.id
  }

  function isStepRefOutdated(step: AiScenarioStep) {
    return (
      step.stepType === ScenarioStepType.FLOW_CALL &&
      Boolean(step.refFlowId) &&
      outdatedFlowIds.value.has(step.refFlowId as number)
    )
  }

  async function refreshFlowRefs(flowIds?: number[]) {
    if (!projectId.value) return
    if (permissionDenied.value) {
      ElMessage.warning('当前账号无编辑权限')
      return
    }
    refreshingFlowRefs.value = true
    try {
      const updated = await refreshScenarioFlowRefs(compositionId, projectId.value, flowIds)
      applyCompositionDetail(updated, false)
      await refreshGovernance()
      ElMessage.success('引用版本已升级到最新发布版本，请重新生成代码并验证')
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, '升级引用版本失败'))
    } finally {
      refreshingFlowRefs.value = false
    }
  }

  function getStepIssues(step: AiScenarioStep): StepIssue[] {
    const issues: StepIssue[] = []
    if (!step.enabled) {
      issues.push({ level: 'warning', message: '步骤已禁用，生成时不会执行' })
      return issues
    }
    if (
      step.aiConfidence > 0 &&
      step.aiConfidence < lowConfidenceThreshold &&
      !step.manualReviewed
    ) {
      issues.push({ level: 'error', message: '低置信度 AI 步骤需要人工确认' })
    }
    if (isStepRefOutdated(step)) {
      issues.push({ level: 'warning', message: '引用的固定场景已发布新版本，可升级引用版本' })
    }
    switch (step.stepType) {
      case ScenarioStepType.FLOW_CALL:
        if (!step.refFlowId) issues.push({ level: 'error', message: '缺少固定场景引用' })
        if (!step.refFlowVersionId) issues.push({ level: 'error', message: '缺少固定场景版本锁定' })
        break
      case ScenarioStepType.ASSERTION:
        if (!step.refAssertionId) issues.push({ level: 'error', message: '缺少断言资产引用' })
        break
      case ScenarioStepType.ATOMIC_ACTION: {
        const action = (step.atomicAction || '').toLowerCase()
        if (!action) issues.push({ level: 'error', message: '缺少原子操作类型' })
        if (['goto', 'navigate'].includes(action) && !hasParam(step.paramMapping, 'url')) {
          issues.push({ level: 'error', message: '页面跳转缺少 url 参数' })
        }
        if (action === 'click' && !hasParam(step.paramMapping, 'selector', 'locator')) {
          issues.push({ level: 'error', message: '点击操作缺少 selector 或 locator 参数' })
        }
        if (['fill', 'input'].includes(action)) {
          if (!hasParam(step.paramMapping, 'selector', 'locator')) {
            issues.push({ level: 'error', message: '输入操作缺少 selector 或 locator 参数' })
          }
          if (!hasParam(step.paramMapping, 'value', 'text', 'input_value')) {
            issues.push({ level: 'error', message: '输入操作缺少 value/text 参数' })
          }
        }
        break
      }
      case ScenarioStepType.CODE_BLOCK:
        if (!step.codeBlock?.trim())
          issues.push({ level: 'error', message: '自定义代码块不能为空' })
        if (!step.manualReviewed)
          issues.push({ level: 'error', message: '自定义代码块需要人工审核' })
        break
      case ScenarioStepType.AI_GENERATED:
        issues.push({ level: 'error', message: 'AI 临时步骤需采纳或转为确定步骤' })
        break
      default:
        break
    }
    return issues
  }

  function scenarioFieldError(...fields: string[]) {
    return matchFieldError(scenarioFieldErrors.value, fields)
  }

  function stepFieldError(...fields: string[]) {
    return matchFieldError(stepFieldErrors.value, fields)
  }

  function validationFieldError(...fields: string[]) {
    return matchFieldError(validationFieldErrors.value, fields)
  }

  return {
    ScenarioStepType,
    composition,
    flows,
    assertions,
    versions,
    validations,
    references,
    versionDiff,
    aiPlan,
    visibleAiPlanSteps,
    ignoredAiStepKeys,
    selectedStepId,
    selectedStep,
    activeAssetTab,
    activeBottomTab,
    loading,
    assetLoading,
    saving,
    generating,
    validating,
    publishing,
    aiPlanning,
    versionDiffLoading,
    errorMessage,
    stepDialogVisible,
    versionDiffVisible,
    isEditingStep,
    codeEditMode,
    codeDraft,
    codeChangeSummary,
    lockCodeAfterSave,
    scenarioForm,
    stepForm,
    steps,
    dslText,
    generatedCode,
    latestValidation,
    latestValidationLogs,
    dirty,
    codeDirty,
    locked,
    permissionDenied,
    canGenerate,
    canValidate,
    canPublish,
    canDeleteComposition,
    canSaveScenario,
    canToggleCodeLock,
    hasBlockingStepIssues,
    stepIssueMap,
    selectedStepIssues,
    validationForm,
    validationFormErrors,
    scenarioFieldErrors,
    stepFieldErrors,
    validationFieldErrors,
    loadWorkbench,
    loadAssets,
    refreshGovernance,
    saveScenario,
    openStepDialog,
    openEditStepDialog,
    submitStep,
    removeStep,
    moveStep,
    reorderStepsByIds,
    generateCode,
    enterCodeEditMode,
    cancelCodeEditMode,
    saveManualCode,
    toggleCodeLock,
    validateComposition,
    publishComposition,
    showVersionDiff,
    rollbackVersion,
    archiveComposition,
    deleteComposition,
    loadAiOptimization,
    loadAiSuggestions,
    acceptAiStep,
    ignoreAiStep,
    isLowConfidenceStep,
    outdatedFlowRefs,
    refreshingFlowRefs,
    isStepRefOutdated,
    refreshFlowRefs,
    getStepIssues,
    scenarioFieldError,
    stepFieldError,
    validationFieldError,
    selectStep,
  }
}

function buildAiStepKey(step: AiCompositionPlanStep) {
  return [
    step.type,
    step.flowId || 0,
    step.flowVersionId || 0,
    step.assertionId || 0,
    step.reason,
  ].join(':')
}
