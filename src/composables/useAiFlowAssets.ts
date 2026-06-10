/**
 * 固定场景库业务逻辑 Composable。
 *
 * 封装固定场景列表、筛选、详情、发布弹窗和错误提示，
 * 页面层只负责布局编排，避免把远程数据流程散落到 Vue 模板中。
 */
import { computed, getCurrentInstance, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import { extractErrorMessage, isElMessageBoxCancel } from '@/utils/error'
import {
  FLOW_DSL_SUPPORTED_STEP_TYPES,
  FlowAssetStatus,
  ValidationStatus,
  archiveFlowAsset,
  compileCheckFlowAsset,
  createFlowAsset,
  deleteFlowAsset,
  fetchFlowAssetDetail,
  fetchFlowAssetList,
  fetchFlowAssetReferences,
  fetchFlowAssetVersions,
  fetchTaskList,
  publishFlowAsset,
  publishFlowFromTask,
  updateFlowAsset,
  type AiAssetReference,
  type AiFlowAsset,
  type AiFlowAssetVersion,
  type AiScriptTask,
  type FlowAssetStatus as FlowAssetStatusType,
  type FlowCompileCheckResult,
  type PublishFlowAssetPayload,
  type SaveFlowAssetPayload,
  type ValidationStatus as ValidationStatusType,
} from '@/api/aiScript'

interface ApiErrorLike {
  response?: {
    data?: {
      message?: string
    }
  }
}

interface FlowAssetFilters {
  keyword: string
  status: FlowAssetStatusType | ''
  validationStatus: ValidationStatusType | ''
}

interface PublishFlowForm {
  taskId?: number
  flowKey: string
  flowName: string
  description: string
  tagsText: string
  preconditionsText: string
  postconditionsText: string
  allowAiReuse: boolean
  changeSummary: string
}

/** 编辑器内 DSL 预检告警条目，stepNo 为 0 表示整体性问题。 */
export interface FlowDslIssue {
  stepNo: number
  stepType: string
  reason: string
}

interface ManualFlowForm {
  id?: number
  flowKey: string
  flowName: string
  description: string
  tagsText: string
  inputSchemaText: string
  outputSchemaText: string
  preconditionsText: string
  postconditionsText: string
  dslText: string
  codeSnapshot: string
  allowAiReuse: boolean
  changeSummary: string
}

function getErrorMessage(error: unknown, fallback: string) {
  const apiError = error as ApiErrorLike
  return apiError.response?.data?.message || extractErrorMessage(error, fallback)
}

function splitLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function splitTags(value: string) {
  return value
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeFlowKey(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase()
}

function parseJsonObject(value: string, fieldName: string): Record<string, unknown> {
  const trimmed = value.trim()
  if (!trimmed) return {}
  const parsed = JSON.parse(trimmed) as unknown
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${fieldName} 必须是 JSON 对象`)
  }
  return parsed as Record<string, unknown>
}

function stringifyObject(value: Record<string, unknown> | undefined) {
  return JSON.stringify(value || {}, null, 2)
}

function resolveStepType(step: Record<string, unknown>) {
  for (const key of ['type', 'step_type', 'action_type', 'actionType']) {
    const raw = step[key]
    if (typeof raw === 'string' && raw.trim()) return raw.trim().toUpperCase()
  }
  return ''
}

/** 客户端侧 DSL 预检：JSON 合法性 + 步骤类型是否在受支持清单内，与后端编译器口径一致。 */
export function validateFlowDslText(
  text: string,
  supportedStepTypes: readonly string[],
): FlowDslIssue[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (error: unknown) {
    return [{ stepNo: 0, stepType: '', reason: `DSL 不是合法 JSON：${(error as Error).message}` }]
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [{ stepNo: 0, stepType: '', reason: 'DSL 必须是 JSON 对象' }]
  }
  const root = parsed as Record<string, unknown>
  const rawSteps = Array.isArray(root.generation_steps) ? root.generation_steps : root.steps
  if (rawSteps === undefined || rawSteps === null) return []
  if (!Array.isArray(rawSteps)) {
    return [{ stepNo: 0, stepType: '', reason: 'steps / generation_steps 必须是数组' }]
  }
  const supported = new Set(supportedStepTypes.map((item) => item.toUpperCase()))
  const issues: FlowDslIssue[] = []
  rawSteps.forEach((step, index) => {
    const stepNo = index + 1
    if (step === null || typeof step !== 'object' || Array.isArray(step)) {
      issues.push({ stepNo, stepType: '', reason: '步骤必须是 JSON 对象' })
      return
    }
    const stepType = resolveStepType(step as Record<string, unknown>)
    if (!stepType) {
      issues.push({ stepNo, stepType: '', reason: '缺少动作类型（type 字段）' })
      return
    }
    if (!supported.has(stepType)) {
      issues.push({
        stepNo,
        stepType,
        reason: `不支持的步骤类型，发布将被拒绝。支持：${supportedStepTypes.join('、')}`,
      })
    }
  })
  return issues
}

/** 固定场景库列表与发布逻辑。 */
export function useAiFlowAssets() {
  const projectStore = useProjectStore()
  const projectId = computed(() => projectStore.selectedProjectId)

  const flows = ref<AiFlowAsset[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(20)
  const loading = ref(false)
  const detailLoading = ref(false)
  const errorMessage = ref('')
  const currentFlow = ref<AiFlowAsset | null>(null)
  const detailVisible = ref(false)
  const versions = ref<AiFlowAssetVersion[]>([])
  const references = ref<AiAssetReference[]>([])
  const governanceLoading = ref(false)
  const compileChecking = ref(false)
  const compileCheckResult = ref<FlowCompileCheckResult | null>(null)
  const dslIssues = ref<FlowDslIssue[]>([])
  const supportedStepTypes = ref<string[]>([...FLOW_DSL_SUPPORTED_STEP_TYPES])
  let dslPrecheckTimer: ReturnType<typeof setTimeout> | null = null

  const filters = reactive<FlowAssetFilters>({
    keyword: '',
    status: '',
    validationStatus: '',
  })

  const publishDialogVisible = ref(false)
  const publishSubmitting = ref(false)
  const sourceTasks = ref<AiScriptTask[]>([])
  const sourceTasksLoading = ref(false)
  const publishForm = reactive<PublishFlowForm>({
    taskId: undefined,
    flowKey: '',
    flowName: '',
    description: '',
    tagsText: '',
    preconditionsText: '脚本已在目标环境验证通过',
    postconditionsText: '流程执行完成且页面状态符合预期',
    allowAiReuse: true,
    changeSummary: '首次发布',
  })

  const manualDialogVisible = ref(false)
  const manualSubmitting = ref(false)
  const manualForm = reactive<ManualFlowForm>({
    flowKey: '',
    flowName: '',
    description: '',
    tagsText: '',
    inputSchemaText: '{}',
    outputSchemaText: '{}',
    preconditionsText: '浏览器已打开目标系统',
    postconditionsText: '流程执行完成且页面状态符合预期',
    dslText: '{}',
    codeSnapshot: '',
    allowAiReuse: true,
    changeSummary: '保存固定场景',
  })

  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
  const hasProject = computed(() => Boolean(projectId.value))
  const manualDialogTitle = computed(() => (manualForm.id ? '编辑固定场景' : '新建固定场景'))
  const publishableTasks = computed(() =>
    sourceTasks.value.filter((task) => task.latestValidationStatus === ValidationStatus.PASSED),
  )

  async function fetchFlows(targetPage = page.value) {
    if (!projectId.value) {
      flows.value = []
      total.value = 0
      errorMessage.value = '请先选择项目'
      return
    }
    loading.value = true
    errorMessage.value = ''
    try {
      const result = await fetchFlowAssetList({
        projectId: projectId.value,
        keyword: filters.keyword.trim() || undefined,
        status: filters.status,
        validationStatus: filters.validationStatus,
        pageNo: targetPage,
        pageSize: pageSize.value,
      })
      flows.value = result.list
      total.value = result.total
      page.value = targetPage
    } catch (error: unknown) {
      errorMessage.value = getErrorMessage(error, '加载固定场景失败')
      ElMessage.error(errorMessage.value)
    } finally {
      loading.value = false
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
      ElMessage.error(getErrorMessage(error, '加载录制任务失败'))
    } finally {
      sourceTasksLoading.value = false
    }
  }

  async function applyFilters() {
    page.value = 1
    await fetchFlows(1)
  }

  async function resetFilters() {
    filters.keyword = ''
    filters.status = ''
    filters.validationStatus = ''
    await applyFilters()
  }

  async function changePage(targetPage: number) {
    if (targetPage < 1 || targetPage > totalPages.value) return
    await fetchFlows(targetPage)
  }

  async function changePageSize(size: number) {
    pageSize.value = size
    page.value = 1
    await fetchFlows(1)
  }

  async function openDetail(flow: AiFlowAsset) {
    if (!projectId.value) return
    detailVisible.value = true
    currentFlow.value = flow
    detailLoading.value = true
    governanceLoading.value = true
    try {
      currentFlow.value = await fetchFlowAssetDetail(flow.id, projectId.value)
      const [versionList, referenceList] = await Promise.all([
        fetchFlowAssetVersions(flow.id, projectId.value),
        fetchFlowAssetReferences(flow.id, projectId.value),
      ])
      versions.value = versionList
      references.value = referenceList
    } catch (error: unknown) {
      ElMessage.error(getErrorMessage(error, '加载固定场景详情失败'))
    } finally {
      detailLoading.value = false
      governanceLoading.value = false
    }
  }

  function resetManualForm() {
    manualForm.id = undefined
    manualForm.flowKey = ''
    manualForm.flowName = ''
    manualForm.description = ''
    manualForm.tagsText = ''
    manualForm.inputSchemaText = '{}'
    manualForm.outputSchemaText = '{}'
    manualForm.preconditionsText = '浏览器已打开目标系统'
    manualForm.postconditionsText = '流程执行完成且页面状态符合预期'
    manualForm.dslText = '{}'
    manualForm.codeSnapshot = ''
    manualForm.allowAiReuse = true
    manualForm.changeSummary = '保存固定场景'
  }

  function openManualCreateDialog() {
    resetManualForm()
    dslIssues.value = []
    manualDialogVisible.value = true
  }

  function openManualEditDialog(flow: AiFlowAsset) {
    manualForm.id = flow.id
    manualForm.flowKey = flow.flowKey
    manualForm.flowName = flow.flowName
    manualForm.description = flow.description || ''
    manualForm.tagsText = (flow.tags || []).join(' ')
    manualForm.inputSchemaText = stringifyObject(flow.inputSchema)
    manualForm.outputSchemaText = stringifyObject(flow.outputSchema)
    manualForm.preconditionsText = (flow.preconditions || []).join('\n')
    manualForm.postconditionsText = (flow.postconditions || []).join('\n')
    manualForm.dslText = stringifyObject(flow.dsl)
    manualForm.codeSnapshot = flow.codeSnapshot || ''
    manualForm.allowAiReuse = flow.allowAiReuse
    manualForm.changeSummary = '更新固定场景'
    dslIssues.value = validateFlowDslText(manualForm.dslText, supportedStepTypes.value)
    manualDialogVisible.value = true
  }

  function buildManualPayload(): SaveFlowAssetPayload | null {
    if (!projectId.value) {
      ElMessage.warning('请先选择项目')
      return null
    }
    const preconditions = splitLines(manualForm.preconditionsText)
    const postconditions = splitLines(manualForm.postconditionsText)
    if (!manualForm.flowName.trim() || (!manualForm.id && !manualForm.flowKey.trim())) {
      ElMessage.warning('请填写场景名称和场景 Key')
      return null
    }
    if (preconditions.length === 0 || postconditions.length === 0) {
      ElMessage.warning('前置条件和后置条件至少各填写一条')
      return null
    }
    try {
      return {
        projectId: projectId.value,
        flowKey: manualForm.id ? undefined : normalizeFlowKey(manualForm.flowKey),
        flowName: manualForm.flowName.trim(),
        description: manualForm.description.trim() || undefined,
        tags: splitTags(manualForm.tagsText),
        inputSchema: parseJsonObject(manualForm.inputSchemaText, '入参 Schema'),
        outputSchema: parseJsonObject(manualForm.outputSchemaText, '出参 Schema'),
        preconditions,
        postconditions,
        dsl: parseJsonObject(manualForm.dslText, 'DSL'),
        codeSnapshot: manualForm.codeSnapshot.trim(),
        allowAiReuse: manualForm.allowAiReuse,
        changeSummary: manualForm.changeSummary.trim() || '保存固定场景',
      }
    } catch (error: unknown) {
      ElMessage.warning(extractErrorMessage(error, 'JSON 格式不正确'))
      return null
    }
  }

  async function submitManualSave() {
    const payload = buildManualPayload()
    if (!payload) return
    manualSubmitting.value = true
    try {
      if (manualForm.id) {
        await updateFlowAsset(manualForm.id, payload)
        ElMessage.success('固定场景已更新')
      } else {
        await createFlowAsset(payload)
        ElMessage.success('固定场景已创建')
      }
      manualDialogVisible.value = false
      await fetchFlows(manualForm.id ? page.value : 1)
    } catch (error: unknown) {
      ElMessage.error(getErrorMessage(error, '保存固定场景失败'))
    } finally {
      manualSubmitting.value = false
    }
  }

  async function runCompileCheck(flow: AiFlowAsset) {
    if (!projectId.value) return
    compileChecking.value = true
    try {
      const result = await compileCheckFlowAsset(flow.id, projectId.value)
      compileCheckResult.value = result
      if (result.supportedStepTypes?.length) {
        supportedStepTypes.value = result.supportedStepTypes
      }
      if (result.compileHealth === 'OK') {
        ElMessage.success(`「${flow.flowName}」自检通过，可以发布`)
      } else {
        const detail = (result.compileFailures || [])
          .map((item) => `步骤 ${item.stepNo}（${item.stepType || '未知类型'}）：${item.reason}`)
          .join('\n')
        ElMessage.warning({
          message: `「${flow.flowName}」自检未通过，发布将被拒绝：\n${detail}`,
          duration: 8000,
        })
      }
      return result
    } catch (error: unknown) {
      ElMessage.error(getErrorMessage(error, '发布前自检失败'))
      return null
    } finally {
      compileChecking.value = false
    }
  }

  async function publishManual(flow: AiFlowAsset) {
    if (!projectId.value) return
    try {
      await ElMessageBox.confirm(`确定发布固定场景「${flow.flowName}」？`, '发布固定场景', {
        type: 'warning',
        confirmButtonText: '发布',
        cancelButtonText: '取消',
      })
      await publishFlowAsset(flow.id, projectId.value, '发布固定场景')
      ElMessage.success('固定场景已发布')
      await fetchFlows(page.value)
    } catch (error: unknown) {
      if (!isElMessageBoxCancel(error)) {
        ElMessage.error(getErrorMessage(error, '发布固定场景失败'))
      }
    }
  }

  async function archiveManual(flow: AiFlowAsset) {
    if (!projectId.value) return
    try {
      await ElMessageBox.confirm(`确定归档固定场景「${flow.flowName}」？`, '归档固定场景', {
        type: 'warning',
        confirmButtonText: '归档',
        cancelButtonText: '取消',
      })
      await archiveFlowAsset(flow.id, projectId.value)
      ElMessage.success('固定场景已归档')
      await fetchFlows(page.value)
    } catch (error: unknown) {
      if (!isElMessageBoxCancel(error)) {
        ElMessage.error(getErrorMessage(error, '归档固定场景失败'))
      }
    }
  }

  async function deleteManual(flow: AiFlowAsset) {
    if (!projectId.value) return
    try {
      await ElMessageBox.confirm(`确定删除固定场景草稿「${flow.flowName}」？`, '删除固定场景草稿', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      })
      await deleteFlowAsset(flow.id, projectId.value)
      ElMessage.success('固定场景草稿已删除')
      await fetchFlows(page.value)
    } catch (error: unknown) {
      if (!isElMessageBoxCancel(error)) {
        ElMessage.error(getErrorMessage(error, '删除固定场景草稿失败'))
      }
    }
  }

  async function openPublishDialog(sourceTask?: AiScriptTask) {
    resetPublishForm()
    publishDialogVisible.value = true
    if (sourceTask) {
      sourceTasks.value = [sourceTask]
      publishForm.taskId = sourceTask.id
      fillFromSourceTask(sourceTask.id)
      return
    }
    await fetchSourceTasks()
  }

  function resetPublishForm() {
    publishForm.taskId = undefined
    publishForm.flowKey = ''
    publishForm.flowName = ''
    publishForm.description = ''
    publishForm.tagsText = ''
    publishForm.preconditionsText = '脚本已在目标环境验证通过'
    publishForm.postconditionsText = '流程执行完成且页面状态符合预期'
    publishForm.allowAiReuse = true
    publishForm.changeSummary = '首次发布'
  }

  function fillFromSourceTask(taskId?: number) {
    const task = sourceTasks.value.find((item) => item.id === taskId)
    if (!task) return
    publishForm.flowName = task.taskName
    publishForm.flowKey = normalizeFlowKey(task.taskName)
    publishForm.description = task.scenarioDesc || ''
  }

  async function submitPublish() {
    if (!projectId.value || !publishForm.taskId) {
      ElMessage.warning('请选择可发布的录制任务')
      return
    }
    const preconditions = splitLines(publishForm.preconditionsText)
    const postconditions = splitLines(publishForm.postconditionsText)
    if (!publishForm.flowKey.trim() || !publishForm.flowName.trim()) {
      ElMessage.warning('请填写场景标识和场景名称')
      return
    }
    if (preconditions.length === 0 || postconditions.length === 0) {
      ElMessage.warning('前置条件和后置条件至少各填写一条')
      return
    }

    publishSubmitting.value = true
    try {
      const payload: PublishFlowAssetPayload = {
        projectId: projectId.value,
        flowKey: normalizeFlowKey(publishForm.flowKey),
        flowName: publishForm.flowName.trim(),
        description: publishForm.description.trim() || undefined,
        tags: splitTags(publishForm.tagsText),
        inputSchema: {},
        outputSchema: {},
        preconditions,
        postconditions,
        allowAiReuse: publishForm.allowAiReuse,
        changeSummary: publishForm.changeSummary.trim() || '首次发布',
      }
      await publishFlowFromTask(publishForm.taskId, payload)
      ElMessage.success('固定场景已发布')
      publishDialogVisible.value = false
      await fetchFlows(1)
    } catch (error: unknown) {
      ElMessage.error(getErrorMessage(error, '发布固定场景失败'))
    } finally {
      publishSubmitting.value = false
    }
  }

  watch(
    () => manualForm.dslText,
    () => {
      if (!manualDialogVisible.value) return
      if (dslPrecheckTimer) clearTimeout(dslPrecheckTimer)
      dslPrecheckTimer = setTimeout(() => {
        dslIssues.value = validateFlowDslText(manualForm.dslText, supportedStepTypes.value)
      }, 400)
    },
  )

  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      if (dslPrecheckTimer) clearTimeout(dslPrecheckTimer)
    })
  }

  watch(projectId, () => {
    page.value = 1
    fetchFlows(1)
  })

  return {
    FlowAssetStatus,
    ValidationStatus,
    projectId,
    hasProject,
    flows,
    total,
    page,
    pageSize,
    totalPages,
    loading,
    detailLoading,
    governanceLoading,
    errorMessage,
    currentFlow,
    detailVisible,
    versions,
    references,
    filters,
    publishDialogVisible,
    publishSubmitting,
    manualDialogVisible,
    manualSubmitting,
    sourceTasks,
    sourceTasksLoading,
    publishableTasks,
    publishForm,
    manualForm,
    manualDialogTitle,
    fetchFlows,
    applyFilters,
    resetFilters,
    changePage,
    changePageSize,
    openDetail,
    openManualCreateDialog,
    openManualEditDialog,
    submitManualSave,
    compileChecking,
    compileCheckResult,
    dslIssues,
    supportedStepTypes,
    runCompileCheck,
    publishManual,
    archiveManual,
    deleteManual,
    openPublishDialog,
    fillFromSourceTask,
    submitPublish,
  }
}
