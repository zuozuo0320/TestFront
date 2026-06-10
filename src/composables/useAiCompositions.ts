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
  PlannerMode,
  ScenarioCompositionStatus,
  ValidationStatus,
  addScenarioStep,
  createAiPlanFromTask,
  createScenarioComposition,
  deleteScenarioComposition,
  fetchScenarioCompositionList,
  fetchTaskList,
  type AiCompositionPlanResult,
  type AiCompositionPlanStep,
  type AiScenarioComposition,
  type AiScriptTask,
  type ScenarioCompositionStatus as ScenarioCompositionStatusType,
  type ValidationStatus as ValidationStatusType,
} from '@/api/aiScript'

interface CompositionFilters {
  keyword: string
  status: ScenarioCompositionStatusType | ''
  validationStatus: ValidationStatusType | ''
}

interface CompositionForm {
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
  const errorMessage = ref('')
  const createDialogVisible = ref(false)
  const aiPlanDialogVisible = ref(false)
  const aiPlanResultVisible = ref(false)
  const sourceTasks = ref<AiScriptTask[]>([])
  const aiPlanResult = ref<AiCompositionPlanResult | null>(null)
  const confirmedAiPlanStepKeys = ref<Set<string>>(new Set())

  const filters = reactive<CompositionFilters>({
    keyword: '',
    status: '',
    validationStatus: '',
  })

  const form = reactive<CompositionForm>({
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
  const publishedTaskOptions = computed(() =>
    sourceTasks.value.filter((task) => task.latestValidationStatus === ValidationStatus.PASSED),
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

  function openCreateDialog() {
    resetForm()
    createDialogVisible.value = true
  }

  function fillScenarioKey() {
    if (!form.scenarioKey.trim() && form.scenarioName.trim()) {
      form.scenarioKey = normalizeScenarioKey(form.scenarioName)
    }
  }

  async function submitCreate() {
    if (!projectId.value) {
      ElMessage.warning('请先选择项目')
      return
    }
    const scenarioKey = normalizeScenarioKey(form.scenarioKey)
    if (!scenarioKey || !form.scenarioName.trim()) {
      ElMessage.warning('请填写场景 Key 和场景名称')
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
      ElMessage.success('场景编排已创建')
      createDialogVisible.value = false
      await router.push(`/ai-script/compositions/${created.id}`)
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, '创建场景编排失败'))
    } finally {
      submitting.value = false
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
          stepName: step.flowKey || step.assertionKey || step.type,
          refFlowId: step.flowId,
          refFlowVersionId: step.flowVersionId,
          refAssertionId: step.assertionId,
          paramMapping: step.inputs || {},
          outputMapping: {},
          aiConfidence: step.confidence,
          manualReviewed: true,
          enabled: true,
        })
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
    errorMessage,
    createDialogVisible,
    aiPlanDialogVisible,
    aiPlanResultVisible,
    sourceTasks,
    publishedTaskOptions,
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
    fillScenarioKey,
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
    step.reason,
  ].join(':')
}
