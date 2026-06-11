/**
 * 场景编排列表业务逻辑 Composable。
 *
 * 管理编排列表筛选、新建编排和从录制任务生成 AI 编排计划。
 */
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import { extractErrorMessage, isElMessageBoxCancel } from '@/utils/error'
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
  type AiCompositionPlanResult,
  type AiCompositionPlanStep,
  type AiFlowAsset,
  type AiScenarioComposition,
  type AiScriptTask,
  type ScenarioCompositionStatus as ScenarioCompositionStatusType,
  type ValidationStatus as ValidationStatusType,
} from '@/api/aiScript'
import { reportPlanAdoption } from '@/api/aiRegression'

interface CompositionFilters {
  keyword: string
  status: ScenarioCompositionStatusType | ''
  validationStatus: ValidationStatusType | ''
}

type CompositionCreateMode = 'FLOW_COMBINATION' | 'BLANK'
type CompositionSourceType = 'TASK' | 'FLOW'

interface OrderedCompositionSource {
  id: string
  type: CompositionSourceType
  refId: number
}

interface CompositionForm {
  createMode: CompositionCreateMode
  sourceTaskId?: number
  additionalTaskIds: number[]
  sourceFlowIds: number[]
  orderedSources: OrderedCompositionSource[]
  scenarioKey: string
  scenarioName: string
  description: string
}

interface AiPlanForm {
  taskId?: number
  maxSteps: number
  plannerMode: PlannerMode
}

function normalizeScenarioKey(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase()
}

/** 场景编排列表逻辑。 */
export function useAiCompositions() {
  const router = useRouter()
  const projectStore = useProjectStore()
  const projectId = computed(() => projectStore.selectedProjectId)

  const compositions = ref<AiScenarioComposition[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(20)
  const loading = ref(false)
  const submitting = ref(false)
  const aiPlanning = ref(false)
  const creatingFromPlan = ref(false)
  const sourceTasksLoading = ref(false)
  const sourceFlowsLoading = ref(false)
  const errorMessage = ref('')
  const createDialogVisible = ref(false)
  const aiPlanDialogVisible = ref(false)
  const aiPlanResultVisible = ref(false)
  const sourceTasks = ref<AiScriptTask[]>([])
  const sourceFlows = ref<AiFlowAsset[]>([])
  const aiPlanResult = ref<AiCompositionPlanResult | null>(null)
  const confirmedAiPlanStepKeys = ref<Set<string>>(new Set())

  const filters = reactive<CompositionFilters>({
    keyword: '',
    status: '',
    validationStatus: '',
  })

  const form = reactive<CompositionForm>({
    createMode: 'FLOW_COMBINATION',
    sourceTaskId: undefined,
    additionalTaskIds: [],
    sourceFlowIds: [],
    orderedSources: [],
    scenarioKey: '',
    scenarioName: '',
    description: '',
  })

  const aiPlanForm = reactive<AiPlanForm>({
    taskId: undefined,
    maxSteps: 12,
    plannerMode: PlannerMode.AUTO,
  })

  const hasProject = computed(() => Boolean(projectId.value))
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
  const reusableTaskOptions = computed(() =>
    sourceTasks.value.filter(
      (task) =>
        task.projectId === projectId.value &&
        task.taskStatus === TaskStatus.CONFIRMED &&
        task.latestValidationStatus === ValidationStatus.PASSED,
    ),
  )
  const publishedTaskOptions = reusableTaskOptions
  const selectedSourceTask = computed(() =>
    reusableTaskOptions.value.find((task) => task.id === form.sourceTaskId),
  )
  const additionalTaskOptions = computed(() =>
    reusableTaskOptions.value.filter((task) => task.id !== form.sourceTaskId),
  )
  const selectedAdditionalTasks = computed(() =>
    form.additionalTaskIds
      .map((taskId) => additionalTaskOptions.value.find((task) => task.id === taskId))
      .filter((task): task is AiScriptTask => Boolean(task)),
  )
  const remainingAdditionalTaskCount = computed(() =>
    Math.max(0, additionalTaskOptions.value.length - selectedAdditionalTasks.value.length),
  )
  const reusableFlowOptions = computed(() =>
    sourceFlows.value.filter(
      (flow) =>
        flow.projectId === projectId.value &&
        flow.status === FlowAssetStatus.PUBLISHED &&
        flow.allowAiReuse &&
        flow.latestValidationStatus === ValidationStatus.PASSED,
    ),
  )
  const selectedSourceFlows = computed(() =>
    form.sourceFlowIds
      .map((flowId) => reusableFlowOptions.value.find((flow) => flow.id === flowId))
      .filter((flow): flow is AiFlowAsset => Boolean(flow)),
  )
  const remainingReusableFlowCount = computed(() =>
    Math.max(0, reusableFlowOptions.value.length - selectedSourceFlows.value.length),
  )
  const orderedCompositionSources = computed(() =>
    form.orderedSources
      .map((source) => {
        if (source.type === 'TASK') {
          const task = reusableTaskOptions.value.find((item) => item.id === source.refId)
          return task
            ? {
                ...source,
                title: task.taskName,
                subtitle: `TASK-${task.id}`,
                label: task.id === form.sourceTaskId ? '来源任务' : '录制脚本',
                canRemove: task.id !== form.sourceTaskId,
              }
            : null
        }
        const flow = selectedSourceFlows.value.find((item) => item.id === source.refId)
        return flow
          ? {
              ...source,
              title: flow.flowName,
              subtitle: flow.flowKey,
              label: '固定场景',
              canRemove: true,
            }
          : null
      })
      .filter(
        (
          source,
        ): source is OrderedCompositionSource & {
          title: string
          subtitle: string
          label: string
          canRemove: boolean
        } => Boolean(source),
      ),
  )
  const canCreateFromAiPlan = computed(() => {
    const plan = aiPlanResult.value
    if (!plan || plan.confidence < 0.75 || plan.steps.length === 0) return false
    return plan.steps.every(
      (step) =>
        !isLowConfidencePlanStep(step) || confirmedAiPlanStepKeys.value.has(buildPlanStepKey(step)),
    )
  })

  function resetForm() {
    form.createMode = 'FLOW_COMBINATION'
    form.sourceTaskId = undefined
    form.additionalTaskIds = []
    form.sourceFlowIds = []
    form.orderedSources = []
    form.scenarioKey = ''
    form.scenarioName = ''
    form.description = ''
  }

  async function fetchCompositions(targetPage = page.value) {
    if (!projectId.value) {
      compositions.value = []
      total.value = 0
      errorMessage.value = '请先选择项目'
      return
    }
    loading.value = true
    errorMessage.value = ''
    try {
      const result = await fetchScenarioCompositionList({
        projectId: projectId.value,
        keyword: filters.keyword.trim() || undefined,
        status: filters.status,
        validationStatus: filters.validationStatus,
        pageNo: targetPage,
        pageSize: pageSize.value,
      })
      compositions.value = result.list
      total.value = result.total
      page.value = targetPage
    } catch (error: unknown) {
      errorMessage.value = extractErrorMessage(error, '加载场景编排失败')
      ElMessage.error(errorMessage.value)
    } finally {
      loading.value = false
    }
  }

  async function applyFilters() {
    page.value = 1
    await fetchCompositions(1)
  }

  async function resetFilters() {
    filters.keyword = ''
    filters.status = ''
    filters.validationStatus = ''
    await applyFilters()
  }

  async function changePage(targetPage: number) {
    if (targetPage < 1 || targetPage > totalPages.value) return
    await fetchCompositions(targetPage)
  }

  async function changePageSize(size: number) {
    pageSize.value = size
    page.value = 1
    await fetchCompositions(1)
  }

  async function openCreateDialog() {
    resetForm()
    createDialogVisible.value = true
    await Promise.all([fetchSourceTasks(), fetchSourceFlows()])
  }

  function scenarioKeySuffix() {
    return Date.now().toString(36)
  }

  function buildCompositionKey(seed: string) {
    const baseKey = normalizeScenarioKey(seed)
    const normalizedBase = baseKey
      ? baseKey.endsWith('_composition')
        ? baseKey
        : `${baseKey}_composition`
      : 'scenario_composition'
    return `${normalizedBase}_${scenarioKeySuffix()}`
  }

  function fillFromSourceFlows() {
    syncOrderedSources()
    fillFromFusionSource()
  }

  function removeSourceFlow(flowId: number) {
    form.sourceFlowIds = form.sourceFlowIds.filter((id) => id !== flowId)
    fillFromSourceFlows()
  }

  function fillFromAdditionalTasks() {
    syncOrderedSources()
    fillFromFusionSource()
  }

  function removeAdditionalTask(taskId: number) {
    form.additionalTaskIds = form.additionalTaskIds.filter((id) => id !== taskId)
    fillFromAdditionalTasks()
  }

  function fillFromSourceTask() {
    form.additionalTaskIds = form.additionalTaskIds.filter((taskId) => taskId !== form.sourceTaskId)
    syncOrderedSources()
    fillFromFusionSource()
  }

  function orderedSourceId(type: CompositionSourceType, refId: number) {
    return `${type}:${refId}`
  }

  function syncOrderedSources() {
    const validIds = new Set<string>()
    if (form.sourceTaskId) {
      validIds.add(orderedSourceId('TASK', form.sourceTaskId))
    }
    for (const taskId of form.additionalTaskIds) {
      validIds.add(orderedSourceId('TASK', taskId))
    }
    for (const flowId of form.sourceFlowIds) {
      validIds.add(orderedSourceId('FLOW', flowId))
    }
    form.orderedSources = form.orderedSources.filter((source) => validIds.has(source.id))
    const existingIds = new Set(form.orderedSources.map((source) => source.id))
    if (form.sourceTaskId) {
      const id = orderedSourceId('TASK', form.sourceTaskId)
      if (!existingIds.has(id)) {
        form.orderedSources.unshift({ id, type: 'TASK', refId: form.sourceTaskId })
        existingIds.add(id)
      }
    }
    for (const taskId of form.additionalTaskIds) {
      const id = orderedSourceId('TASK', taskId)
      if (!existingIds.has(id)) {
        form.orderedSources.push({ id, type: 'TASK', refId: taskId })
        existingIds.add(id)
      }
    }
    for (const flowId of form.sourceFlowIds) {
      const id = orderedSourceId('FLOW', flowId)
      if (!existingIds.has(id)) {
        form.orderedSources.push({ id, type: 'FLOW', refId: flowId })
        existingIds.add(id)
      }
    }
  }

  function moveOrderedSource(sourceId: string, direction: -1 | 1) {
    const index = form.orderedSources.findIndex((source) => source.id === sourceId)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= form.orderedSources.length) return
    const [source] = form.orderedSources.splice(index, 1)
    if (!source) return
    form.orderedSources.splice(targetIndex, 0, source)
    fillFromFusionSource()
  }

  function removeOrderedSource(sourceId: string) {
    const source = form.orderedSources.find((item) => item.id === sourceId)
    if (!source) return
    if (source.type === 'TASK' && source.refId === form.sourceTaskId) {
      ElMessage.warning('来源任务是编排基准，需更换来源任务后再调整')
      return
    }
    if (source.type === 'TASK') {
      form.additionalTaskIds = form.additionalTaskIds.filter((id) => id !== source.refId)
    } else {
      form.sourceFlowIds = form.sourceFlowIds.filter((id) => id !== source.refId)
    }
    form.orderedSources = form.orderedSources.filter((item) => item.id !== sourceId)
    fillFromFusionSource()
  }

  function fillFromFusionSource() {
    if (form.createMode !== 'FLOW_COMBINATION') return
    const task = reusableTaskOptions.value.find((item) => item.id === form.sourceTaskId)
    if (!task) {
      form.scenarioKey = ''
      form.scenarioName = ''
      form.description = ''
      return
    }
    form.scenarioName = `${task.taskName}编排`
    form.scenarioKey = buildCompositionKey(task.taskName)
    const orderedNames = orderedCompositionSources.value
      .map((source) => `${source.label}「${source.title}」`)
      .join(' → ')
    form.description = orderedNames
      ? `基于已确认录制任务「${task.taskName}」按顺序融合：${orderedNames}`
      : `基于已确认录制任务「${task.taskName}」生成场景编排草稿`
  }

  function changeCreateMode(mode: CompositionCreateMode | string | number | boolean) {
    form.createMode = mode === 'BLANK' ? 'BLANK' : 'FLOW_COMBINATION'
    form.sourceTaskId = undefined
    form.additionalTaskIds = []
    form.sourceFlowIds = []
    form.orderedSources = []
    form.scenarioKey = ''
    form.scenarioName = ''
    form.description = ''
  }

  function fillBlankScenarioKey() {
    if (form.createMode !== 'BLANK') return
    if (!form.scenarioName.trim()) {
      form.scenarioKey = ''
      return
    }
    form.scenarioKey = buildCompositionKey(form.scenarioName)
  }

  async function submitCreate() {
    if (!projectId.value) {
      ElMessage.warning('请先选择项目')
      return
    }
    const sourceFlowsToAdd = selectedSourceFlows.value
    const additionalTasksToAdd = selectedAdditionalTasks.value
    syncOrderedSources()
    let planToApply: AiCompositionPlanResult | null = null
    if (form.createMode === 'FLOW_COMBINATION') {
      if (!form.sourceTaskId) {
        ElMessage.warning('请选择已确认且验证通过的来源录制任务')
        return
      }
      fillFromSourceTask()
      if (!form.scenarioName.trim()) {
        ElMessage.warning('请选择已确认且验证通过的来源录制任务')
        return
      }
      try {
        planToApply = await createAiPlanFromTask({
          projectId: projectId.value,
          taskId: form.sourceTaskId,
          preferredFlowIds: sourceFlowsToAdd.map((flow) => flow.id),
          additionalTaskIds: additionalTasksToAdd.map((taskItem) => taskItem.id),
          orderedSources: form.orderedSources.map((source) => ({
            type: source.type,
            id: source.refId,
          })),
          maxSteps: 20,
          plannerMode: PlannerMode.HEURISTIC,
        })
        if (planToApply.steps.length === 0) {
          ElMessage.warning('未生成可用融合步骤，请确认来源任务和固定场景是否存在重合操作')
          return
        }
      } catch (error: unknown) {
        ElMessage.error(extractErrorMessage(error, '融合来源录制任务失败'))
        return
      }
    } else {
      fillBlankScenarioKey()
    }
    const scenarioKey = normalizeScenarioKey(form.scenarioKey)
    if (!scenarioKey || !form.scenarioName.trim()) {
      ElMessage.warning('请填写场景名称')
      return
    }
    submitting.value = true
    try {
      const created = await createScenarioComposition({
        projectId: projectId.value,
        scenarioKey,
        scenarioName: form.scenarioName.trim(),
        description: form.description.trim() || undefined,
      })
      if (planToApply) {
        for (const step of planToApply.steps) {
          await addScenarioStep(created.id, {
            projectId: projectId.value,
            stepType: step.type,
            stepName: step.stepName || step.flowKey || step.assertionKey || step.type,
            refFlowId: step.flowId,
            refFlowVersionId: step.flowVersionId,
            refAssertionId: step.assertionId,
            atomicAction: step.atomicAction,
            paramMapping: step.inputs || {},
            outputMapping: {},
            aiConfidence: step.confidence,
            manualReviewed: true,
            enabled: true,
          })
        }
      } else {
        for (const sourceFlow of sourceFlowsToAdd) {
          await addScenarioStep(created.id, {
            projectId: projectId.value,
            stepType: ScenarioStepType.FLOW_CALL,
            stepName: `引用固定场景：${sourceFlow.flowName}`,
            refFlowId: sourceFlow.id,
            paramMapping: {},
            outputMapping: {},
            manualReviewed: true,
            enabled: true,
          })
        }
      }
      ElMessage.success('场景编排已创建')
      createDialogVisible.value = false
      await router.push(`/ai-script/compositions/${created.id}`)
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, '创建场景编排失败'))
    } finally {
      submitting.value = false
    }
  }

  async function fetchSourceFlows() {
    sourceFlows.value = []
    if (!projectId.value) return
    sourceFlowsLoading.value = true
    try {
      const result = await fetchFlowAssetList({
        projectId: projectId.value,
        status: FlowAssetStatus.PUBLISHED,
        validationStatus: ValidationStatus.PASSED,
        pageNo: 1,
        pageSize: 100,
      })
      sourceFlows.value = result.list
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, '加载固定场景失败'))
    } finally {
      sourceFlowsLoading.value = false
    }
  }

  async function fetchSourceTasks() {
    if (!projectId.value) return
    sourceTasksLoading.value = true
    try {
      const result = await fetchTaskList({
        projectId: projectId.value,
        pageNo: 1,
        pageSize: 100,
      })
      sourceTasks.value = result.list
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, '加载录制任务失败'))
    } finally {
      sourceTasksLoading.value = false
    }
  }

  async function openAiPlanDialog() {
    aiPlanForm.taskId = undefined
    aiPlanForm.maxSteps = 12
    aiPlanForm.plannerMode = PlannerMode.AUTO
    aiPlanResult.value = null
    confirmedAiPlanStepKeys.value = new Set()
    aiPlanDialogVisible.value = true
    aiPlanResultVisible.value = false
    await fetchSourceTasks()
  }

  async function submitAiPlan() {
    if (!projectId.value || !aiPlanForm.taskId) {
      ElMessage.warning('请选择录制任务')
      return
    }
    aiPlanning.value = true
    try {
      aiPlanResult.value = await createAiPlanFromTask({
        projectId: projectId.value,
        taskId: aiPlanForm.taskId,
        maxSteps: aiPlanForm.maxSteps,
        plannerMode: aiPlanForm.plannerMode,
      })
      confirmedAiPlanStepKeys.value = new Set()
      aiPlanResultVisible.value = true
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, '生成 AI 编排建议失败'))
    } finally {
      aiPlanning.value = false
    }
  }

  function confirmAiPlanStep(step: AiCompositionPlanStep) {
    confirmedAiPlanStepKeys.value = new Set([
      ...confirmedAiPlanStepKeys.value,
      buildPlanStepKey(step),
    ])
    ElMessage.success('已确认低置信度步骤')
  }

  function isLowConfidencePlanStep(step: AiCompositionPlanStep) {
    return step.confidence > 0 && step.confidence < 0.8
  }

  function isAiPlanStepConfirmed(step: AiCompositionPlanStep) {
    return confirmedAiPlanStepKeys.value.has(buildPlanStepKey(step))
  }

  async function createCompositionFromPlan() {
    if (!projectId.value || !aiPlanForm.taskId || !aiPlanResult.value) {
      ElMessage.warning('请先生成 AI 编排计划')
      return
    }
    if (!canCreateFromAiPlan.value) {
      ElMessage.warning('AI 计划置信度不足或存在未确认步骤')
      return
    }
    const sourceTask = sourceTasks.value.find((task) => task.id === aiPlanForm.taskId)
    const scenarioName = sourceTask ? `${sourceTask.taskName} 编排` : `AI 编排 ${aiPlanForm.taskId}`
    const normalizedKey = normalizeScenarioKey(sourceTask?.taskName || '')
    const scenarioKey = normalizedKey || `ai_task_${aiPlanForm.taskId}_composition`
    creatingFromPlan.value = true
    try {
      const created = await createScenarioComposition({
        projectId: projectId.value,
        scenarioKey,
        scenarioName,
        description: `由 AI 计划 ${aiPlanResult.value.planId} 生成，${aiPlanResult.value.summary}`,
      })
      for (const step of aiPlanResult.value.steps) {
        await addScenarioStep(created.id, {
          projectId: projectId.value,
          stepType: step.type,
          stepName:
            step.stepName || step.flowKey || step.assertionKey || step.atomicAction || step.type,
          refFlowId: step.flowId,
          refFlowVersionId: step.flowVersionId,
          refAssertionId: step.assertionId,
          atomicAction: step.atomicAction,
          paramMapping: step.inputs || {},
          outputMapping: {},
          aiConfidence: step.confidence,
          manualReviewed: true,
          enabled: true,
        })
      }
      try {
        await reportPlanAdoption({
          projectId: projectId.value,
          planId: aiPlanResult.value.planId,
          compositionId: created.id,
          adoptedSteps: aiPlanResult.value.steps.length,
          modifiedSteps: 0,
          manualConfirmSteps: confirmedAiPlanStepKeys.value.size,
        })
      } catch {
        // 采纳上报为指标统计用途，失败不阻断草稿生成主流程
      }
      ElMessage.success('AI 编排草稿已生成')
      aiPlanDialogVisible.value = false
      await router.push(`/ai-script/compositions/${created.id}`)
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, '生成编排草稿失败'))
    } finally {
      creatingFromPlan.value = false
    }
  }

  async function goWorkbench(row: AiScenarioComposition) {
    await router.push(`/ai-script/compositions/${row.id}`)
  }

  async function deleteDraft(row: AiScenarioComposition) {
    if (!projectId.value) return
    try {
      await ElMessageBox.confirm(`确定删除场景编排草稿「${row.scenarioName}」？`, '删除编排草稿', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      })
      await deleteScenarioComposition(row.id, projectId.value)
      ElMessage.success('场景编排草稿已删除')
      await fetchCompositions(page.value)
    } catch (error: unknown) {
      if (!isElMessageBoxCancel(error)) {
        ElMessage.error(extractErrorMessage(error, '删除场景编排草稿失败'))
      }
    }
  }

  watch(projectId, () => {
    page.value = 1
    fetchCompositions(1)
  })

  return {
    ScenarioCompositionStatus,
    ValidationStatus,
    compositions,
    total,
    page,
    pageSize,
    loading,
    submitting,
    aiPlanning,
    creatingFromPlan,
    sourceTasksLoading,
    sourceFlowsLoading,
    errorMessage,
    createDialogVisible,
    aiPlanDialogVisible,
    aiPlanResultVisible,
    sourceTasks,
    sourceFlows,
    reusableTaskOptions,
    publishedTaskOptions,
    selectedSourceTask,
    additionalTaskOptions,
    selectedAdditionalTasks,
    remainingAdditionalTaskCount,
    reusableFlowOptions,
    selectedSourceFlows,
    remainingReusableFlowCount,
    orderedCompositionSources,
    aiPlanResult,
    confirmedAiPlanStepKeys,
    filters,
    form,
    aiPlanForm,
    hasProject,
    totalPages,
    canCreateFromAiPlan,
    fetchCompositions,
    applyFilters,
    resetFilters,
    changePage,
    changePageSize,
    openCreateDialog,
    changeCreateMode,
    fillFromSourceTask,
    fillFromAdditionalTasks,
    removeAdditionalTask,
    fillFromSourceFlows,
    removeSourceFlow,
    moveOrderedSource,
    removeOrderedSource,
    fillBlankScenarioKey,
    submitCreate,
    openAiPlanDialog,
    submitAiPlan,
    confirmAiPlanStep,
    isLowConfidencePlanStep,
    isAiPlanStepConfirmed,
    createCompositionFromPlan,
    goWorkbench,
    deleteDraft,
  }
}

function buildPlanStepKey(step: AiCompositionPlanStep) {
  return [
    step.type,
    step.flowId || 0,
    step.flowVersionId || 0,
    step.assertionId || 0,
    step.atomicAction || '',
    step.stepName || '',
    step.reason,
  ].join(':')
}
