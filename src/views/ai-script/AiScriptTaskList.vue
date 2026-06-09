<script setup lang="ts">
import { onMounted, onUnmounted, ref, reactive, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAiScriptStore } from '../../stores/aiScript'
import { useProjectStore } from '../../stores/project'
import {
  TaskStatusLabel,
  TaskStatusColor,
  ValidationStatusLabel,
  ValidationStatusColor,
  GenerationMode,
  GenerationModeLabel,
  refreshAuthStatus,
  manualLoginStart,
  manualLoginComplete,
  invalidateAuth,
  renameTask,
  type AiScriptTask,
  type AiScriptTaskListQuery,
  type AuthStateInfo,
} from '../../api/aiScript'
import { TaskStatus } from '../../api/aiScript'
import { listProjects } from '../../api/project'
import { getProjectSettings, type TestEnvironment } from '../../api/projectSettings'
import { listTestCases } from '../../api/testcase'
import type { Project, TestCase } from '../../api/types'

const router = useRouter()
const store = useAiScriptStore()
const projectStore = useProjectStore()

const projects = ref<Project[]>([])
const currentPage = ref(1)
const pageSize = ref(10)

// ── 筛选状态 ──
const filterProjectId = ref<number | undefined>(undefined)
const filterStatus = ref<TaskStatus | ''>('')
const filterKeyword = ref('')

// ── Toast 提示 ──
const toastMsg = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(msg: string) {
  toastMsg.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMsg.value = ''
  }, 3000)
}

const totalPages = computed(() => Math.max(1, Math.ceil(store.taskTotal / pageSize.value)))
const displayPages = computed(() => {
  const pages: number[] = []
  const total = totalPages.value
  const cur = currentPage.value
  for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) {
    pages.push(i)
  }
  return pages
})

/** 构建任务列表查询参数，确保状态字段始终符合接口约束。 */
function buildQueryParams(page = currentPage.value): AiScriptTaskListQuery {
  return {
    projectId: filterProjectId.value,
    taskStatus: filterStatus.value || undefined,
    keyword: filterKeyword.value.trim() || undefined,
    pageNo: page,
    pageSize: pageSize.value,
  }
}

/** 当前页面可见任务 ID。 */
const currentPageTaskIds = computed(() => store.taskList.map((task) => task.id))

/** 当前页是否已经全部勾选。 */
const currentPageAllSelected = computed(() => {
  if (currentPageTaskIds.value.length === 0) return false
  return currentPageTaskIds.value.every((taskId) => store.isTaskSelected(taskId))
})

/** 当前页是否处于部分勾选状态。 */
const currentPagePartiallySelected = computed(() => {
  if (currentPageTaskIds.value.length === 0) return false
  return (
    currentPageTaskIds.value.some((taskId) => store.isTaskSelected(taskId)) &&
    !currentPageAllSelected.value
  )
})

async function loadPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
  await store.loadTaskList(buildQueryParams(page))
}

async function applyFilter() {
  store.clearTaskSelection()
  currentPage.value = 1
  await store.loadTaskList(buildQueryParams(1))
}

function resetFilter() {
  store.clearTaskSelection()
  filterProjectId.value = undefined
  filterStatus.value = ''
  filterKeyword.value = ''
  applyFilter()
}

function clearFilterKeyword() {
  filterKeyword.value = ''
  applyFilter()
}

onMounted(async () => {
  store.loadTaskList(buildQueryParams(1))
  projects.value = await listProjects()
})

onUnmounted(() => {
  stopTokenKeepAlive()
})

// ── 统计卡片聚合 ──
const statsSuccessRate = computed(() => {
  const list = store.taskList
  if (list.length === 0) return 0
  const success = list.filter(
    (t) =>
      t.taskStatus === TaskStatus.CONFIRMED ||
      t.taskStatus === TaskStatus.GENERATE_SUCCESS ||
      t.taskStatus === TaskStatus.PENDING_CONFIRM,
  ).length
  return Math.round((success / list.length) * 100)
})
const statsRunningCount = computed(
  () => store.taskList.filter((t) => t.taskStatus === TaskStatus.RUNNING).length,
)

function goDetail(task: AiScriptTask) {
  router.push(`/ai-script/${task.id}`)
}

// 获取状态对应的语义颜色
function getStatusColor(status: TaskStatus | string) {
  return TaskStatusColor[status as TaskStatus] || 'info'
}

function isRunning(status: TaskStatus) {
  return status === TaskStatus.RUNNING
}

function formatTime(raw?: string): string {
  if (!raw) return '-'
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  const Y = d.getFullYear()
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const D = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${Y}-${M}-${D} ${h}:${m}`
}

// ── 新建任务 Dialog ──
const showCreateDialog = ref(false)
const createForm = reactive({
  projectId: 0,
  taskName: '',
  generationMode: GenerationMode.RECORDING_ENHANCED as GenerationMode,
  scenarioDesc: '',
  startUrl: '',
  accountRef: '',
  caseIds: '',
  frameworkType: 'Playwright',
})
const generationModeOptions: Array<{ value: GenerationMode; label: string; desc: string }> = [
  {
    value: GenerationMode.RECORDING_ENHANCED,
    label: GenerationModeLabel[GenerationMode.RECORDING_ENHANCED],
    desc: '先录制真实路径，再由 AI 重构为稳定脚本',
  },
  {
    value: GenerationMode.AI_DIRECT,
    label: GenerationModeLabel[GenerationMode.AI_DIRECT],
    desc: '由 AI 自动探索目标页面并生成测试脚本',
  },
]

// ── 用例搜索选择 ──
const caseCandidates = ref<TestCase[]>([])
const selectedCaseIds = ref<number[]>([])
const caseSearchKeyword = ref('')
const showCaseDropdown = ref(false)
const caseLoading = ref(false)
const caseLoadError = ref('')
let caseSearchTimer: ReturnType<typeof setTimeout> | null = null
const environmentOptions = ref<TestEnvironment[]>([])
const selectedEnvironmentId = ref('')
const environmentLoading = ref(false)
const selectedEnvironment = computed(() =>
  environmentOptions.value.find((env) => env.id === selectedEnvironmentId.value),
)

/**
 * 为新建任务弹窗选择默认项目。
 * 优先沿用左侧导航当前选中的项目，避免弹窗默认切到其它空项目导致误以为“没有可关联用例”。
 */
function resolveDefaultCreateProjectId(): number {
  const selectedProjectId = projectStore.selectedProjectId
  if (typeof selectedProjectId === 'number') {
    return selectedProjectId
  }
  return 0
}

/**
 * 重置关联用例选择器状态。
 * 打开弹窗或当前项目变化时，需要清掉旧项目残留的已选项、搜索词和错误提示。
 */
function resetCasePickerState() {
  caseCandidates.value = []
  selectedCaseIds.value = []
  caseSearchKeyword.value = ''
  createForm.caseIds = ''
  caseLoadError.value = ''
}
function getDefaultEnvironment(envs: TestEnvironment[]) {
  return envs.find((env) => env.is_default) ?? envs[0]
}
async function loadProjectEnvironments(projectId: number) {
  environmentLoading.value = true
  try {
    const settings = await getProjectSettings(projectId)
    environmentOptions.value = settings.test_environments
    const defaultEnv = getDefaultEnvironment(environmentOptions.value)
    selectedEnvironmentId.value = defaultEnv?.id ?? ''
    createForm.startUrl = defaultEnv?.base_url ?? ''
    return !!defaultEnv
  } catch {
    environmentOptions.value = []
    selectedEnvironmentId.value = ''
    createForm.startUrl = ''
    showToast('测试环境配置加载失败，请稍后重试')
    return false
  } finally {
    environmentLoading.value = false
  }
}

// 点击弹窗空白处时收起内部下拉，避免模板内写多语句表达式导致构建失败。
function closeCreateDropdowns() {
  showCaseDropdown.value = false
}

/**
 * 打开新建任务弹窗并预加载关联用例。
 * 新建任务固定归属左侧当前项目，避免在弹窗内重复选择造成误操作。
 */
async function openCreateDialog() {
  createForm.projectId = resolveDefaultCreateProjectId()
  if (!createForm.projectId) {
    showToast('请先在左侧选择当前项目')
    return
  }

  createForm.taskName = ''
  createForm.scenarioDesc = ''
  createForm.accountRef = ''
  createForm.caseIds = ''
  createForm.frameworkType = 'Playwright'
  createForm.generationMode = GenerationMode.RECORDING_ENHANCED
  resetCasePickerState()
  showCaseDropdown.value = false
  const hasEnvironment = await loadProjectEnvironments(createForm.projectId)
  if (!hasEnvironment) {
    showToast('请先在项目管理中配置当前项目的测试环境')
    return
  }

  showCreateDialog.value = true

  await loadCases(createForm.projectId)
}

/**
 * 加载当前项目下可供关联的测试用例候选列表。
 * 这里不会按评审结果或用例状态做额外过滤，理论上只要是该项目下的用例都应能被搜到。
 */
async function loadCases(projectId: number, keyword = '') {
  if (!projectId) {
    caseCandidates.value = []
    caseLoadError.value = '请先在左侧选择当前项目'
    return
  }

  caseLoading.value = true
  caseLoadError.value = ''
  try {
    const resp = await listTestCases(projectId, { page: 1, pageSize: 20, keyword })
    caseCandidates.value = resp?.items || []
    if (caseCandidates.value.length === 0) {
      caseLoadError.value = keyword.trim() ? '未找到匹配的测试用例' : '当前项目下暂无可关联用例'
    }
  } catch {
    caseCandidates.value = []
    caseLoadError.value = '加载关联用例失败，请稍后重试'
  } finally {
    caseLoading.value = false
  }
}

function handleCaseSearch(ev: Event) {
  const val = (ev.target as HTMLInputElement).value
  caseSearchKeyword.value = val
  if (caseSearchTimer) clearTimeout(caseSearchTimer)
  caseSearchTimer = setTimeout(() => {
    if (createForm.projectId) loadCases(createForm.projectId, val)
  }, 300)
}

function toggleCase(caseItem: TestCase) {
  const idx = selectedCaseIds.value.indexOf(caseItem.id)
  if (idx >= 0) {
    selectedCaseIds.value.splice(idx, 1)
  } else {
    selectedCaseIds.value.push(caseItem.id)
  }
  createForm.caseIds = selectedCaseIds.value.join(',')
}

function removeSelectedCase(caseId: number) {
  const idx = selectedCaseIds.value.indexOf(caseId)
  if (idx >= 0) {
    selectedCaseIds.value.splice(idx, 1)
    createForm.caseIds = selectedCaseIds.value.join(',')
  }
}

function isCaseSelected(id: number) {
  return selectedCaseIds.value.includes(id)
}

watch(
  () => createForm.projectId,
  async (projectId, previousProjectId) => {
    if (!showCreateDialog.value || projectId === previousProjectId) return
    resetCasePickerState()
    if (projectId) {
      await loadCases(projectId)
    }
  },
)

async function submitCreateTask() {
  createForm.projectId = resolveDefaultCreateProjectId()
  if (!createForm.projectId) {
    showToast('请先在左侧选择当前项目')
    return
  }
  if (!createForm.taskName.trim()) {
    showToast('请输入任务名称')
    return
  }
  if (!createForm.scenarioDesc.trim()) {
    showToast('请输入场景描述')
    return
  }
  if (!selectedEnvironmentId.value) {
    showToast('当前项目未配置测试环境')
    return
  }
  if (!createForm.startUrl.trim()) {
    showToast('测试环境访问地址不能为空')
    return
  }
  // 解析用例 ID：支持逗号分隔
  const caseIds = createForm.caseIds
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0)
  if (caseIds.length === 0) {
    showToast('请至少关联一条测试用例')
    return
  }

  try {
    const task = await store.createTask({
      projectId: createForm.projectId,
      taskName: createForm.taskName.trim(),
      generationMode: createForm.generationMode,
      scenarioDesc: createForm.scenarioDesc.trim(),
      startUrl: createForm.startUrl.trim(),
      accountRef: createForm.accountRef.trim() || undefined,
      caseIds,
      frameworkType: createForm.frameworkType || 'Playwright',
    })
    showCreateDialog.value = false
    // 创建成功后跳向详情
    router.push(`/ai-script/${task.id}`)
  } catch (e) {
    console.error('创建任务失败:', e)
  }
}

// ── 重命名任务 ──
const showRenameDialog = ref(false)
const renameTaskId = ref(0)
const renameNewName = ref('')
const renameScenarioDesc = ref('')
const renameLoading = ref(false)

function openRenameDialog(task: AiScriptTask) {
  renameTaskId.value = task.id
  renameNewName.value = task.taskName
  renameScenarioDesc.value = task.scenarioDesc
  showRenameDialog.value = true
}

async function confirmRename() {
  const name = renameNewName.value.trim()
  const scenarioDesc = renameScenarioDesc.value.trim()
  if (!name) {
    showToast('任务名称不能为空')
    return
  }
  if (!scenarioDesc) {
    showToast('场景描述不能为空')
    return
  }
  renameLoading.value = true
  try {
    await renameTask(renameTaskId.value, name, scenarioDesc)
    showRenameDialog.value = false
    store.loadTaskList(buildQueryParams(currentPage.value))
    showToast('任务信息已更新')
  } catch (e) {
    console.error('更新任务失败:', e)
    showToast('更新任务失败')
  } finally {
    renameLoading.value = false
  }
}

// ── 废弃任务 ──
const showDiscardDialog = ref(false)
const discardTaskId = ref(0)
const discardTaskName = ref('')
const discardReason = ref('')

function openDiscardDialog(task: AiScriptTask) {
  discardTaskId.value = task.id
  discardTaskName.value = task.taskName
  discardReason.value = ''
  showDiscardDialog.value = true
}

async function confirmDiscard() {
  if (!discardReason.value.trim()) {
    showToast('请输入废弃原因')
    return
  }
  try {
    await store.discardTask(discardTaskId.value, discardReason.value.trim())
    store.clearTaskSelection()
    showDiscardDialog.value = false
    showToast('任务已废弃')
  } catch (e) {
    console.error('废弃任务失败:', e)
    showToast('废弃失败，请重试')
  }
}

// ── 删除已废弃任务 ──
const showDeleteDialog = ref(false)
const deleteTaskId = ref(0)
const deleteTaskName = ref('')

function openDeleteDialog(task: AiScriptTask) {
  deleteTaskId.value = task.id
  deleteTaskName.value = task.taskName
  showDeleteDialog.value = true
}

async function confirmDelete() {
  try {
    await store.deleteDiscardedTask(deleteTaskId.value)
    store.clearTaskSelection()
    showDeleteDialog.value = false
    showToast('任务已彻底删除')
  } catch (e) {
    console.error('删除任务失败:', e)
    showToast('删除失败，请重试')
  }
}

// ── 批量操作 ──
const showBatchDiscardDialog = ref(false)
const batchDiscardReason = ref('')
const showBatchDeleteDialog = ref(false)

/** 汇总批量执行结果，用于 Toast 提示。 */
function buildBatchResultMessage(
  actionName: string,
  result: {
    matched: number
    success: number
    skipped: number
    failed: number
  },
): string {
  return `${actionName}完成：命中 ${result.matched} 条，成功 ${result.success} 条，跳过 ${result.skipped} 条，失败 ${result.failed} 条`
}

/** 切换单条任务勾选状态。 */
function toggleTaskChecked(taskId: number) {
  store.toggleTaskSelection(taskId)
}

/** 切换当前页全选状态。 */
function toggleCurrentPageSelection(checked: boolean) {
  store.setCurrentPageTaskSelection(currentPageTaskIds.value, checked)
}

/** 处理当前页表头复选框变更。 */
function handleCurrentPageCheckboxChange(event: Event) {
  toggleCurrentPageSelection((event.target as HTMLInputElement).checked)
}

/** 打开批量废弃确认弹窗。 */
function openBatchDiscardDialog() {
  if (store.selectedTaskCount <= 0) {
    showToast('请先选择要废弃的任务')
    return
  }
  batchDiscardReason.value = ''
  showBatchDiscardDialog.value = true
}

/** 确认执行批量废弃。 */
async function confirmBatchDiscard() {
  if (!batchDiscardReason.value.trim()) {
    showToast('请输入批量废弃原因')
    return
  }
  try {
    const result = await store.batchDiscardSelectedTasks(batchDiscardReason.value.trim())
    showBatchDiscardDialog.value = false
    showToast(buildBatchResultMessage('批量废弃', result))
  } catch (e) {
    console.error('批量废弃任务失败:', e)
    showToast('批量废弃失败，请重试')
  }
}

/** 打开批量删除确认弹窗。 */
function openBatchDeleteDialog() {
  if (store.selectedTaskCount <= 0) {
    showToast('请先选择要删除的任务')
    return
  }
  showBatchDeleteDialog.value = true
}

/** 确认执行批量删除。 */
async function confirmBatchDelete() {
  try {
    const result = await store.batchDeleteSelectedTasks()
    showBatchDeleteDialog.value = false
    showToast(buildBatchResultMessage('批量删除', result))
  } catch (e) {
    console.error('批量删除任务失败:', e)
    showToast('批量删除失败，请重试')
  }
}

// ── Token 管理 Dialog ──
const showTokenDialog = ref(false)
const tokenTargetUrl = ref('')
const tokenAuthState = ref<AuthStateInfo | null>(null)
const tokenLoading = ref(false)
const tokenKeepAliveLoading = ref(false)
const tokenLastCheckedAt = ref('')
const tokenLastError = ref('')
const tokenSuccessMessage = ref('')
const manualLoginActive = ref(false) // 浏览器已打开，等待用户登录
const manualLoginLoading = ref(false)
let tokenKeepAliveTimer: ReturnType<typeof setInterval> | null = null
const TOKEN_KEEP_ALIVE_INTERVAL_MS = 15 * 60 * 1000

const tokenStatusText = computed(() => {
  if (!tokenAuthState.value) return '未检测'
  if (!tokenAuthState.value.exists) return '无认证文件'
  if (tokenAuthState.value.valid) return '有效'
  return '已过期'
})

const tokenStatusClass = computed(() => {
  if (!tokenAuthState.value || !tokenAuthState.value.exists) return 'missing'
  return tokenAuthState.value.valid ? 'valid' : 'expired'
})

const tokenKeepAliveLabel = computed(() => {
  if (tokenKeepAliveLoading.value) return '保活中...'
  return '保活刷新'
})

const tokenWarningText = computed(() => {
  if (!tokenAuthState.value) return ''
  if (!tokenAuthState.value.exists) return '暂无认证状态，请先手动登录并保存。'
  if (!tokenAuthState.value.valid) return '认证状态已过期，请重新手动登录。'
  if (tokenLastError.value) return ''
  if (tokenAuthState.value.remaining_hours !== null && tokenAuthState.value.remaining_hours <= 4) {
    return `认证状态剩余约 ${tokenAuthState.value.remaining_hours} 小时，建议执行一次保活刷新。`
  }
  return ''
})

function formatCheckedTime(timestamp?: number): string {
  const date = timestamp ? new Date(timestamp * 1000) : new Date()
  if (isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function setTokenSuccess(message: string) {
  tokenLastError.value = ''
  tokenSuccessMessage.value = message
}

function setTokenError(message: string) {
  tokenSuccessMessage.value = ''
  tokenLastError.value = message
}

function stopTokenKeepAlive() {
  if (tokenKeepAliveTimer) {
    clearInterval(tokenKeepAliveTimer)
    tokenKeepAliveTimer = null
  }
}

function closeTokenDialog() {
  showTokenDialog.value = false
  tokenSuccessMessage.value = ''
}

function startTokenKeepAlive() {
  stopTokenKeepAlive()
  if (!tokenTargetUrl.value.trim() || !tokenAuthState.value?.valid) return
  tokenKeepAliveTimer = setInterval(() => {
    handleTokenKeepAlive(true)
  }, TOKEN_KEEP_ALIVE_INTERVAL_MS)
}

async function openTokenDialog() {
  tokenAuthState.value = null
  tokenSuccessMessage.value = ''
  manualLoginActive.value = false
  showTokenDialog.value = true

  // 如果还没加载过环境配置，先加载当前项目的环境
  if (!selectedEnvironment.value && projectStore.selectedProjectId) {
    await loadProjectEnvironments(projectStore.selectedProjectId)
  }

  // 同步当前环境的测试地址
  tokenTargetUrl.value = selectedEnvironment.value?.base_url || ''

  // 自动检测
  if (tokenTargetUrl.value) {
    await loadTokenStatus(true)
    startTokenKeepAlive()
  }
}

async function loadTokenStatus(silent = false) {
  const url = tokenTargetUrl.value.trim()
  if (!url) {
    setTokenError('请输入目标站点地址')
    return
  }
  tokenLoading.value = true
  tokenLastError.value = ''
  tokenSuccessMessage.value = ''
  try {
    const result = await refreshAuthStatus(url)
    tokenAuthState.value = result.auth_state
    tokenLastCheckedAt.value = formatCheckedTime(result.checked_at)
    if (result.success) {
      startTokenKeepAlive()
      if (!silent) setTokenSuccess('认证状态已刷新')
    } else {
      stopTokenKeepAlive()
      setTokenError(result.error || '认证状态不可用，请重新手动登录')
    }
  } catch (e) {
    console.warn('查询认证状态失败:', e)
    tokenAuthState.value = null
    setTokenError('查询失败，请确认 Executor 服务正常')
  } finally {
    tokenLoading.value = false
  }
}

async function handleTokenKeepAlive(silent = false) {
  const url = tokenTargetUrl.value.trim()
  if (!url) {
    if (!silent) setTokenError('请输入目标站点地址')
    return
  }
  if (tokenKeepAliveLoading.value) return
  tokenKeepAliveLoading.value = true
  tokenLastError.value = ''
  tokenSuccessMessage.value = ''
  try {
    const result = await refreshAuthStatus(url)
    tokenAuthState.value = result.auth_state
    tokenLastCheckedAt.value = formatCheckedTime(result.checked_at)
    if (result.success) {
      if (!silent) startTokenKeepAlive()
      if (!silent) setTokenSuccess('认证状态已保活刷新')
    } else {
      stopTokenKeepAlive()
      if (!silent) setTokenError(result.error || '认证状态不可用，请重新手动登录')
    }
  } catch (e) {
    console.warn('认证状态保活失败:', e)
    if (!silent) setTokenError('保活失败，请确认 Executor 服务正常')
  } finally {
    tokenKeepAliveLoading.value = false
  }
}

async function handleManualLogin() {
  const url = tokenTargetUrl.value.trim()
  if (!url) {
    setTokenError('请输入目标站点地址')
    return
  }
  manualLoginLoading.value = true
  tokenLastError.value = ''
  tokenSuccessMessage.value = ''
  try {
    const result = await manualLoginStart(url)
    if (result.success) {
      manualLoginActive.value = true
      setTokenSuccess('浏览器已打开，请在浏览器中完成登录')
    } else {
      setTokenError(result.error || '打开浏览器失败')
    }
  } catch (e) {
    console.error('打开浏览器失败:', e)
    setTokenError('打开浏览器失败，请确认 Executor 服务正常')
  } finally {
    manualLoginLoading.value = false
  }
}

async function handleManualLoginComplete() {
  const url = tokenTargetUrl.value.trim()
  if (!url) return
  manualLoginLoading.value = true
  try {
    const result = await manualLoginComplete(url)
    if (result.success) {
      if (result.auth_state) {
        tokenAuthState.value = result.auth_state
      }
      setTokenSuccess('认证状态已保存')
      tokenLastCheckedAt.value = formatCheckedTime()
      manualLoginActive.value = false
      startTokenKeepAlive()
    } else {
      if (result.auth_state) {
        tokenAuthState.value = result.auth_state
      }
      stopTokenKeepAlive()
      setTokenError(result.error || '保存后在线校验失败，请确认已完成登录')
    }
  } catch (e) {
    console.error('保存认证状态失败:', e)
    setTokenError('保存认证状态失败，请确认 Executor 服务正常')
  } finally {
    manualLoginLoading.value = false
  }
}

async function handleTokenInvalidate() {
  const url = tokenTargetUrl.value.trim()
  if (!url) {
    setTokenError('请输入目标站点地址')
    return
  }
  try {
    await invalidateAuth(url)
    stopTokenKeepAlive()
    tokenSuccessMessage.value = ''
    await loadTokenStatus(true)
    setTokenSuccess('认证状态已清除')
  } catch (e) {
    console.error('清除认证状态失败:', e)
    setTokenError('清除认证状态失败')
  }
}
</script>

<template>
  <div class="ai-page ai-task-list-page">
    <!-- 筛选栏 -->
    <div class="ai-filter-bar">
      <div class="ai-filter-bar-search">
        <span class="material-symbols-outlined ai-filter-bar-icon">search</span>
        <input
          v-model="filterKeyword"
          class="ai-filter-bar-input"
          placeholder="搜索任务名称或关键词..."
          @keyup.enter="applyFilter"
        />
        <button v-if="filterKeyword" class="ai-filter-bar-clear" @click="clearFilterKeyword">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="ai-filter-bar-selects">
        <el-select
          v-model="filterStatus"
          placeholder="全部状态"
          clearable
          size="default"
          class="ai-filter-el-select"
          popper-class="ai-select-popper"
          @change="applyFilter"
        >
          <template #prefix>
            <span
              class="material-symbols-outlined"
              style="font-size: 16px; color: var(--tp-text-muted)"
            >
              tune
            </span>
          </template>
          <el-option v-for="(label, key) in TaskStatusLabel" :key="key" :label="label" :value="key">
            <div class="ai-select-option-item">
              <span class="ai-select-option-dot" :class="getStatusColor(key)" />
              <span class="ai-select-option-label">{{ label }}</span>
            </div>
          </el-option>
        </el-select>
        <button class="ai-filter-reset-btn" title="重置筛选" @click="resetFilter">
          <span class="material-symbols-outlined" style="font-size: 16px">restart_alt</span>
        </button>

        <div class="ai-filter-divider"></div>

        <button class="ai-btn ai-btn-ghost ai-btn-sm" @click="openTokenDialog">
          <span class="material-symbols-outlined">key</span>
          Token
        </button>
        <button class="ai-btn ai-btn-primary ai-btn-sm" @click="openCreateDialog">
          <span class="material-symbols-outlined">add</span>
          新建任务
        </button>
      </div>
    </div>

    <!-- 主表格 -->
    <div class="ai-table-wrap">
      <div class="ai-table-scroll-container">
        <table class="ai-table">
          <thead>
            <tr>
              <th class="ai-col-check">
                <input
                  type="checkbox"
                  class="ai-row-checkbox"
                  :checked="currentPageAllSelected"
                  :data-partial="currentPagePartiallySelected"
                  @click.stop
                  @change="handleCurrentPageCheckboxChange"
                />
              </th>
              <th>任务名称 / ID</th>
              <th>关联用例</th>
              <th>输出框架</th>
              <th>任务状态</th>
              <th>验证状态</th>
              <th>创建人</th>
              <th>创建时间</th>
              <th>更新时间</th>
              <th class="ai-col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="task in store.taskList"
              :key="task.id"
              :class="{
                'is-selected': store.isTaskSelected(task.id),
                'is-running': isRunning(task.taskStatus),
              }"
              @click="goDetail(task)"
            >
              <td @click.stop>
                <input
                  type="checkbox"
                  class="ai-row-checkbox"
                  :checked="store.isTaskSelected(task.id)"
                  @click.stop
                  @change="toggleTaskChecked(task.id)"
                />
              </td>
              <td>
                <div class="ai-task-cell">
                  <span class="ai-task-name">{{ task.taskName }}</span>
                  <span class="ai-task-id">TASK-{{ task.id }}</span>
                </div>
              </td>
              <td>
                <div class="ai-case-tags">
                  <span v-for="tag in task.caseTags" :key="tag" class="ai-case-tag">{{ tag }}</span>
                  <span v-if="!task.caseTags?.length" class="ai-case-tag">
                    {{ task.caseCount }} 条用例
                  </span>
                </div>
              </td>
              <td>
                <span class="ai-framework-text">{{ task.frameworkType }}</span>
              </td>
              <td>
                <div class="ai-status-badge" :class="getStatusColor(task.taskStatus)">
                  <span
                    class="ai-status-dot"
                    :class="{ 'animate-pulse': isRunning(task.taskStatus) }"
                  ></span>
                  <template v-if="task.taskStatus === TaskStatus.GENERATE_SUCCESS">
                    <span class="material-symbols-outlined ai-status-icon">check_circle</span>
                  </template>
                  <template v-else-if="task.taskStatus === TaskStatus.GENERATE_FAILED">
                    <span class="material-symbols-outlined ai-status-icon">error</span>
                  </template>
                  <template v-else-if="task.taskStatus === TaskStatus.PENDING_CONFIRM">
                    <span class="material-symbols-outlined ai-status-icon">pending</span>
                  </template>
                  {{ TaskStatusLabel[task.taskStatus] }}
                </div>
              </td>
              <td>
                <div
                  v-if="task.latestValidationStatus"
                  class="ai-status-badge"
                  :class="ValidationStatusColor[task.latestValidationStatus]"
                >
                  {{ ValidationStatusLabel[task.latestValidationStatus] }}
                </div>
                <span v-else class="ai-validation-empty">—</span>
              </td>
              <td>
                <span class="ai-task-creator">{{ task.createdName }}</span>
              </td>
              <td>
                <span class="ai-task-time">{{ formatTime(task.createdAt) }}</span>
              </td>
              <td>
                <span class="ai-task-time">{{ formatTime(task.updatedAt) }}</span>
              </td>
              <td>
                <div class="ai-row-actions">
                  <button
                    class="ai-row-action-btn"
                    aria-label="查看详情"
                    data-tooltip="查看详情"
                    @click.stop="goDetail(task)"
                  >
                    <span class="material-symbols-outlined">visibility</span>
                  </button>
                  <button
                    v-if="task.taskStatus !== TaskStatus.DISCARDED"
                    class="ai-row-action-btn"
                    aria-label="编辑任务"
                    data-tooltip="编辑任务"
                    @click.stop="openRenameDialog(task)"
                  >
                    <span class="material-symbols-outlined">edit</span>
                  </button>
                  <button
                    class="ai-row-action-btn"
                    aria-label="复制配置"
                    data-tooltip="复制配置"
                    @click.stop
                  >
                    <span class="material-symbols-outlined">content_copy</span>
                  </button>
                  <button
                    class="ai-row-action-btn danger"
                    aria-label="废弃"
                    data-tooltip="废弃"
                    @click.stop="openDiscardDialog(task)"
                  >
                    <span class="material-symbols-outlined">block</span>
                  </button>
                  <button
                    v-if="task.taskStatus === TaskStatus.DISCARDED"
                    class="ai-row-action-btn danger"
                    aria-label="删除"
                    data-tooltip="删除"
                    @click.stop="openDeleteDialog(task)"
                  >
                    <span class="material-symbols-outlined">delete_forever</span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页 -->
      <div class="ai-table-footer">
        <span class="info">
          显示
          <strong>
            {{ (currentPage - 1) * pageSize + 1 }} -
            {{ Math.min(currentPage * pageSize, store.taskTotal) }}
          </strong>
          / 共 {{ store.taskTotal }} 条任务
        </span>
        <div class="ai-pagination">
          <button :disabled="currentPage <= 1" @click="loadPage(currentPage - 1)">
            <span class="material-symbols-outlined" style="font-size: 18px">chevron_left</span>
          </button>
          <button v-if="displayPages.length && displayPages[0]! > 1" @click="loadPage(1)">1</button>
          <span v-if="displayPages.length && displayPages[0]! > 2" class="dots">...</span>
          <button
            v-for="p in displayPages"
            :key="p"
            :class="{ active: p === currentPage }"
            @click="loadPage(p)"
          >
            {{ p }}
          </button>
          <span
            v-if="displayPages.length && displayPages[displayPages.length - 1]! < totalPages - 1"
            class="dots"
          >
            ...
          </span>
          <button
            v-if="displayPages.length && displayPages[displayPages.length - 1]! < totalPages"
            @click="loadPage(totalPages)"
          >
            {{ totalPages }}
          </button>
          <button :disabled="currentPage >= totalPages" @click="loadPage(currentPage + 1)">
            <span class="material-symbols-outlined" style="font-size: 18px">chevron_right</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 底部统计卡片 -->
    <div class="ai-stats-grid">
      <!-- 成功率 -->
      <div class="ai-stat-card ai-stat-card--success-rate">
        <div class="ai-stat-label">
          成功率
          <span class="material-symbols-outlined">trending_up</span>
        </div>
        <div class="ai-stat-value">{{ statsSuccessRate }}%</div>
        <div class="ai-stat-desc">当前页 {{ store.taskList.length }} 条任务统计</div>
        <div class="ai-stat-bar">
          <div class="ai-stat-bar-fill" :style="{ width: statsSuccessRate + '%' }"></div>
        </div>
      </div>

      <!-- 活跃运行器 -->
      <div class="ai-stat-card ai-stat-card--running">
        <div class="ai-stat-label">
          活跃运行器
          <span class="material-symbols-outlined">bolt</span>
        </div>
        <div class="ai-stat-value">{{ statsRunningCount }}</div>
        <div class="ai-stat-desc">当前正在生成中的任务</div>
        <div class="ai-stat-segments">
          <div class="ai-stat-segment is-active"></div>
          <div class="ai-stat-segment is-active"></div>
          <div class="ai-stat-segment is-active animate-pulse"></div>
          <div class="ai-stat-segment"></div>
        </div>
      </div>

      <!-- 快速入口 -->
      <div class="ai-quickstart-card ai-quickstart-card--recording">
        <div class="ai-quickstart-content">
          <div class="ai-stat-label">快速入口</div>
          <h4>从 UI 轨迹生成</h4>
          <p>录制轨迹直接生成 Playwright 代码</p>
        </div>
        <button class="ai-quickstart-link" @click="openCreateDialog">
          立即体验
          <span class="material-symbols-outlined ai-quickstart-link-icon">arrow_forward</span>
        </button>
        <div class="ai-quickstart-glow"></div>
      </div>
    </div>

    <!-- 浮动批量操作栏 -->
    <Teleport to="body">
      <Transition name="batch-slide">
        <div v-if="store.selectedTaskCount > 0" class="batch-float-overlay ai-task-batch-overlay">
          <div class="batch-float-bar ai-task-batch-bar">
            <div class="batch-left">
              <div class="batch-count-badge">{{ store.selectedTaskCount }}</div>
              <div class="batch-text">
                <div class="batch-text-title">已选 {{ store.selectedTaskCount }} 项任务</div>
                <div class="batch-text-sub">批量操作模式已启用</div>
              </div>
            </div>
            <div class="batch-actions">
              <button
                class="batch-action-item batch-action-warning"
                @click="openBatchDiscardDialog"
              >
                <span class="material-symbols-outlined">block</span>
                <span>批量废弃</span>
              </button>
              <button class="batch-action-item batch-action-danger" @click="openBatchDeleteDialog">
                <span class="material-symbols-outlined">delete</span>
                <span>批量删除</span>
              </button>
              <div class="batch-divider"></div>
              <button
                class="batch-close"
                aria-label="关闭批量操作栏"
                @click="store.clearTaskSelection()"
              >
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- FAB — 跳转脚本资产 -->
    <button
      class="ai-fab ai-task-library-fab"
      title="脚本资产管理"
      aria-label="脚本资产管理"
      @click="router.push('/ai-script/library')"
    >
      <span class="material-symbols-outlined">inventory_2</span>
    </button>

    <!-- 新建任务 Dialog -->
    <Teleport to="body">
      <div
        v-if="showCreateDialog"
        class="ai-dialog-overlay ai-create-dialog-overlay"
        @click.self="showCreateDialog = false"
      >
        <div
          class="ai-dialog ai-create-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-task-title"
          @click="closeCreateDropdowns"
        >
          <div class="ai-dialog-header">
            <div>
              <h2 id="create-task-title">新建智能生成任务</h2>
              <p class="ai-dialog-subtitle">配置场景、关联用例后生成可验证的自动化脚本</p>
            </div>
            <button class="ai-dialog-close" aria-label="关闭弹窗" @click="showCreateDialog = false">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="ai-dialog-body ai-create-dialog-body">
            <div class="ai-create-form">
              <section class="ai-create-section">
                <div class="ai-create-section-head">
                  <span class="ai-create-section-index">01</span>
                  <div>
                    <h3>生成配置</h3>
                    <p>选择脚本生成路径和本次任务使用的项目环境</p>
                  </div>
                </div>
                <div class="ai-form-grid">
                  <div class="ai-form-group ai-form-group-full">
                    <label class="ai-form-label">
                      生成模式
                      <span class="ai-required">*</span>
                    </label>
                    <div class="ai-choice-grid">
                      <button
                        v-for="mode in generationModeOptions"
                        :key="mode.value"
                        type="button"
                        class="ai-choice-card"
                        :class="{ active: createForm.generationMode === mode.value }"
                        :aria-pressed="createForm.generationMode === mode.value"
                        @click="createForm.generationMode = mode.value"
                      >
                        <span class="ai-choice-title">{{ mode.label }}</span>
                        <span class="ai-choice-desc">{{ mode.desc }}</span>
                      </button>
                    </div>
                  </div>
                  <div class="ai-form-group ai-form-group-full">
                    <label class="ai-form-label">
                      测试环境
                      <span class="ai-required">*</span>
                    </label>
                    <div class="ai-env-select" :class="{ loading: environmentLoading }" @click.stop>
                      <div class="ai-env-select-trigger ai-env-select-trigger-readonly">
                        <span class="ai-env-choice-dot active"></span>
                        <span class="ai-env-select-copy">
                          <span class="ai-env-choice-name">
                            {{ selectedEnvironment?.name || '跟随项目配置' }}
                          </span>
                          <span class="ai-env-choice-url">
                            {{ selectedEnvironment?.base_url || '请先在项目管理中配置测试环境' }}
                          </span>
                        </span>
                        <span class="ai-env-choice-badge">项目配置</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
              <section class="ai-create-section">
                <div class="ai-create-section-head">
                  <span class="ai-create-section-index">02</span>
                  <div>
                    <h3>任务详情</h3>
                    <p>描述本次自动化任务的目标、路径和验证结果</p>
                  </div>
                </div>
                <div class="ai-form-grid">
                  <div class="ai-form-group ai-form-group-full">
                    <label class="ai-form-label">
                      任务名称
                      <span class="ai-required">*</span>
                    </label>
                    <input
                      v-model="createForm.taskName"
                      class="ai-form-input"
                      placeholder="例如：登录流程回归测试"
                    />
                  </div>
                  <div class="ai-form-group ai-form-group-full">
                    <div class="ai-case-field-head">
                      <label class="ai-form-label">
                        场景描述
                        <span class="ai-required">*</span>
                      </label>
                      <span class="ai-prompt-count">{{ createForm.scenarioDesc.length }} 字</span>
                    </div>
                    <div class="ai-prompt-helper">
                      <span class="material-symbols-outlined">tips_and_updates</span>
                      建议写清入口页面、操作路径、关键数据和断言目标
                    </div>
                    <textarea
                      v-model="createForm.scenarioDesc"
                      class="ai-form-textarea ai-prompt-textarea"
                      placeholder="例如：登录系统 → 进入订单列表 → 筛选待处理订单 → 验证订单状态为待处理"
                    />
                  </div>
                </div>
              </section>
              <section class="ai-create-section">
                <div class="ai-create-section-head">
                  <span class="ai-create-section-index">03</span>
                  <div>
                    <h3>执行上下文</h3>
                    <p>关联用例和测试账号会作为生成脚本的上下文</p>
                  </div>
                </div>
                <div class="ai-form-grid">
                  <div class="ai-form-group ai-form-group-full ai-case-field">
                    <div class="ai-case-field-head">
                      <label class="ai-form-label">
                        关联用例
                        <span class="ai-required">*</span>
                      </label>
                      <span class="ai-case-selected-count">
                        已选择 {{ selectedCaseIds.length }} 条
                      </span>
                    </div>
                    <div class="ai-case-picker-panel" @click.stop>
                      <div class="ai-case-toolbar">
                        <div class="ai-case-picker">
                          <input
                            class="ai-form-input"
                            :value="caseSearchKeyword"
                            placeholder="搜索用例名称或 ID..."
                            @input="handleCaseSearch"
                            @focus="showCaseDropdown = true"
                          />
                        </div>
                        <span v-if="caseLoadError && !caseLoading" class="ai-case-inline-error">
                          {{ caseLoadError }}
                        </span>
                      </div>
                      <div v-if="showCaseDropdown" class="ai-case-dropdown">
                        <div v-if="caseLoading" class="ai-case-dropdown-state">正在加载用例...</div>
                        <div v-else-if="caseCandidates.length === 0" class="ai-case-dropdown-state">
                          {{ caseLoadError || '当前没有可关联用例' }}
                        </div>
                        <template v-else>
                          <div
                            v-for="c in caseCandidates"
                            :key="c.id"
                            class="ai-case-option"
                            :class="{ selected: isCaseSelected(c.id) }"
                            @mousedown.prevent="toggleCase(c)"
                          >
                            <span
                              class="material-symbols-outlined ai-case-check"
                              :class="{ selected: isCaseSelected(c.id) }"
                            >
                              {{ isCaseSelected(c.id) ? 'check_box' : 'check_box_outline_blank' }}
                            </span>
                            <span class="ai-case-id">TC-{{ c.id }}</span>
                            <span class="ai-case-title">
                              {{ c.title }}
                            </span>
                            <span v-if="c.level" class="ai-case-level">
                              {{ c.level }}
                            </span>
                          </div>
                        </template>
                      </div>
                      <div v-if="selectedCaseIds.length" class="ai-selected-case-list">
                        <span
                          v-for="cid in selectedCaseIds"
                          :key="cid"
                          class="ai-selected-case-tag"
                        >
                          TC-{{ cid }}
                          <button
                            type="button"
                            class="ai-selected-case-remove"
                            aria-label="移除关联用例"
                            @click="removeSelectedCase(cid)"
                          >
                            <span class="material-symbols-outlined">close</span>
                          </button>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="ai-form-group ai-form-group-full">
                    <label class="ai-form-label">测试账号 (可选)</label>
                    <input
                      v-model="createForm.accountRef"
                      class="ai-form-input"
                      placeholder="引用的测试账号标识"
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>
          <div class="ai-dialog-footer ai-create-footer">
            <span class="ai-create-footer-note">创建后将进入任务详情，可继续录制或执行验证</span>
            <div class="ai-create-footer-actions">
              <button class="ai-btn ai-btn-ghost" @click="showCreateDialog = false">取消</button>
              <button
                class="ai-btn ai-btn-primary"
                :disabled="store.actionLoading"
                @click="submitCreateTask"
              >
                <span v-if="store.actionLoading" class="ai-spinner"></span>
                {{ store.actionLoading ? '创建中...' : '创建任务' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Token 管理 Dialog -->
    <Teleport to="body">
      <div v-if="showTokenDialog" class="ai-dialog-overlay" @click.self="closeTokenDialog">
        <div class="ai-dialog" style="max-width: 520px">
          <div class="ai-dialog-header">
            <div>
              <h2>Token 管理</h2>
              <p class="ai-dialog-subtitle">管理目标站点的认证状态，为测试脚本执行提供登录环境</p>
            </div>
            <button class="ai-dialog-close" @click="closeTokenDialog">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="ai-dialog-body">
            <!-- 目标站点 URL（只读回显） -->
            <div class="ai-form-group">
              <label class="ai-form-label">目标站点地址</label>
              <div style="display: flex; align-items: center; gap: 8px">
                <span
                  style="
                    flex: 1;
                    font-size: 0.85rem;
                    color: var(--tp-text-primary);
                    word-break: break-all;
                  "
                >
                  {{ tokenTargetUrl || '未配置测试环境' }}
                </span>
                <button
                  class="ai-btn ai-btn-ghost"
                  style="padding: 6px 14px; white-space: nowrap"
                  :disabled="tokenLoading || !tokenTargetUrl"
                  @click="loadTokenStatus(false)"
                >
                  <span v-if="tokenLoading" class="ai-spinner"></span>
                  <span v-else class="material-symbols-outlined" style="font-size: 16px">
                    refresh
                  </span>
                  刷新
                </button>
                <button
                  class="ai-btn ai-btn-ghost"
                  style="padding: 6px 14px; white-space: nowrap"
                  :disabled="tokenKeepAliveLoading || !tokenTargetUrl || !tokenAuthState?.exists"
                  @click="handleTokenKeepAlive(false)"
                >
                  <span v-if="tokenKeepAliveLoading" class="ai-spinner"></span>
                  <span v-else class="material-symbols-outlined" style="font-size: 16px">sync</span>
                  {{ tokenKeepAliveLabel }}
                </button>
              </div>
            </div>

            <!-- 认证状态结果 -->
            <div
              v-if="tokenLoading && !tokenAuthState"
              class="ai-token-status-panel ai-auth-checking"
            >
              <div class="ai-token-status-header">
                <span class="ai-section-title" style="font-size: 0.82rem">认证状态</span>
                <div class="ai-auth-status-badge missing">
                  <span class="ai-spinner"></span>
                  校验中
                </div>
              </div>
              <div class="ai-auth-empty-hint">
                <span class="material-symbols-outlined">sync</span>
                <span>正在打开目标站点做在线校验，请稍候...</span>
              </div>
            </div>
            <div v-else-if="tokenLastError && !tokenAuthState" class="ai-token-status-panel">
              <div class="ai-token-status-header">
                <span class="ai-section-title" style="font-size: 0.82rem">认证状态</span>
                <div class="ai-auth-status-badge expired">
                  <span class="ai-auth-dot"></span>
                  异常
                </div>
              </div>
              <div class="ai-auth-warning">
                <span class="material-symbols-outlined">error</span>
                <span>{{ tokenLastError }}</span>
              </div>
            </div>
            <div v-else-if="tokenAuthState" class="ai-token-status-panel">
              <div class="ai-token-status-header">
                <span class="ai-section-title" style="font-size: 0.82rem">认证状态</span>
                <div class="ai-auth-status-badge" :class="tokenStatusClass">
                  <span class="ai-auth-dot"></span>
                  {{ tokenStatusText }}
                </div>
              </div>
              <div v-if="tokenAuthState.exists" class="ai-auth-meta">
                <div class="ai-auth-meta-item">
                  <span class="ai-info-label">文件年龄</span>
                  <span class="ai-info-value">
                    {{
                      tokenAuthState.file_age_hours !== null
                        ? tokenAuthState.file_age_hours + ' 小时'
                        : '-'
                    }}
                  </span>
                </div>
                <div class="ai-auth-meta-item">
                  <span class="ai-info-label">Cookie 数</span>
                  <span class="ai-info-value">{{ tokenAuthState.cookie_count }}</span>
                </div>
                <div class="ai-auth-meta-item">
                  <span class="ai-info-label">最近检查</span>
                  <span class="ai-info-value">{{ tokenLastCheckedAt || '-' }}</span>
                </div>
              </div>
              <div v-if="tokenWarningText" class="ai-auth-warning">
                <span class="material-symbols-outlined">info</span>
                <span>{{ tokenWarningText }}</span>
              </div>
              <div v-if="tokenLastError" class="ai-auth-warning">
                <span class="material-symbols-outlined">error</span>
                <span>{{ tokenLastError }}</span>
              </div>
              <div v-if="tokenSuccessMessage" class="ai-auth-success">
                <span class="material-symbols-outlined">check_circle</span>
                <span>{{ tokenSuccessMessage }}</span>
              </div>
              <div v-if="!tokenAuthState.exists" class="ai-auth-empty-hint">
                <span class="material-symbols-outlined">lock_open</span>
                <span>暂无认证状态，请获取 Token 后再执行测试脚本</span>
              </div>
            </div>

            <!-- 手动登录提示区 -->
            <div
              v-if="manualLoginActive"
              class="ai-token-status-panel"
              style="margin-top: 12px; border-color: var(--tp-accent, #7c5cfc)"
            >
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px">
                <span class="ai-spinner"></span>
                <span
                  class="ai-section-title"
                  style="font-size: 0.82rem; color: var(--tp-accent, #7c5cfc)"
                >
                  等待登录
                </span>
              </div>
              <p style="font-size: 0.8rem; color: var(--tp-text-secondary); margin: 0 0 12px 0">
                浏览器已打开，请在浏览器窗口中完成登录操作（处理验证码、短信验证等），登录成功后点击下方按钮保存认证状态。
              </p>
              <button
                class="ai-btn ai-btn-primary"
                style="padding: 6px 14px; font-size: 0.8rem"
                :disabled="manualLoginLoading"
                @click="handleManualLoginComplete"
              >
                <span class="material-symbols-outlined" style="font-size: 16px">check_circle</span>
                {{ manualLoginLoading ? '保存中...' : '登录完成，保存状态' }}
              </button>
            </div>
          </div>
          <div class="ai-dialog-footer">
            <div class="ai-auth-actions" style="flex: 1">
              <button
                v-if="!manualLoginActive"
                class="ai-btn ai-btn-primary"
                style="padding: 6px 14px; font-size: 0.8rem"
                :disabled="manualLoginLoading || !tokenTargetUrl.trim()"
                @click="handleManualLogin"
              >
                <span class="material-symbols-outlined" style="font-size: 16px">
                  open_in_browser
                </span>
                手动登录
              </button>
              <button
                v-if="tokenAuthState?.exists"
                class="ai-btn ai-btn-danger-ghost"
                style="padding: 6px 14px; font-size: 0.8rem"
                @click="handleTokenInvalidate"
              >
                <span class="material-symbols-outlined" style="font-size: 16px">delete</span>
                清除 Token
              </button>
            </div>
            <button class="ai-btn ai-btn-ghost" @click="closeTokenDialog">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Toast 提示 -->
    <Transition name="toast">
      <div v-if="toastMsg" class="task-list-toast" role="status" aria-live="polite">
        <span class="material-symbols-outlined task-list-toast-icon">info</span>
        {{ toastMsg }}
      </div>
    </Transition>

    <!-- 重命名任务 Dialog -->
    <Teleport to="body">
      <div
        v-if="showRenameDialog"
        class="ai-dialog-overlay ai-rename-dialog-overlay"
        @click.self="showRenameDialog = false"
      >
        <div
          class="ai-dialog ai-rename-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-task-title"
        >
          <div class="ai-dialog-header">
            <div>
              <h2 id="rename-task-title">编辑任务信息</h2>
              <p class="ai-dialog-subtitle">TASK-{{ renameTaskId }}</p>
            </div>
            <button class="ai-dialog-close" aria-label="关闭弹窗" @click="showRenameDialog = false">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="ai-dialog-body">
            <div class="ai-form-group">
              <label class="ai-form-label">任务名称</label>
              <input
                v-model="renameNewName"
                class="ai-form-input"
                placeholder="请输入新的任务名称"
                maxlength="128"
                @keyup.enter="confirmRename"
              />
              <span class="ai-form-hint">{{ renameNewName.length }} / 128</span>
            </div>
            <div class="ai-form-group">
              <label class="ai-form-label">场景描述</label>
              <textarea
                v-model="renameScenarioDesc"
                class="ai-form-textarea ai-rename-scenario-textarea"
                placeholder="请输入场景描述"
                rows="4"
              />
              <span class="ai-form-hint">{{ renameScenarioDesc.length }} 字</span>
            </div>
          </div>
          <div class="ai-dialog-footer">
            <button class="ai-btn ai-btn-ghost" @click="showRenameDialog = false">取消</button>
            <button
              class="ai-btn ai-btn-primary"
              :disabled="renameLoading || !renameNewName.trim() || !renameScenarioDesc.trim()"
              @click="confirmRename"
            >
              <span v-if="renameLoading" class="ai-spinner"></span>
              {{ renameLoading ? '保存中...' : '确认修改' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 废弃确认 Dialog -->
    <Teleport to="body">
      <div
        v-if="showDiscardDialog"
        class="ai-dialog-overlay"
        @click.self="showDiscardDialog = false"
      >
        <div class="ai-dialog ai-confirm-dialog" style="max-width: 440px">
          <div class="ai-dialog-header">
            <div>
              <h2>废弃任务</h2>
              <p class="ai-dialog-subtitle">此操作不可撤销，请谨慎确认</p>
            </div>
            <button class="ai-dialog-close" @click="showDiscardDialog = false">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="ai-dialog-body">
            <div class="ai-confirm-alert">
              <span class="material-symbols-outlined ai-confirm-alert-icon">warning</span>
              <p>
                确定要废弃任务
                <strong>{{ discardTaskName }}</strong>
                吗？废弃后任务将不可恢复。
              </p>
            </div>
            <div class="ai-form-group">
              <label class="ai-form-label">
                废弃原因
                <span class="ai-required">*</span>
              </label>
              <textarea
                v-model="discardReason"
                class="ai-form-textarea"
                placeholder="请输入废弃原因..."
                rows="3"
              />
            </div>
          </div>
          <div class="ai-dialog-footer">
            <button class="ai-btn ai-btn-ghost" @click="showDiscardDialog = false">取消</button>
            <button
              class="ai-btn ai-btn-danger-solid"
              :disabled="store.actionLoading || !discardReason.trim()"
              @click="confirmDiscard"
            >
              <span v-if="store.actionLoading" class="ai-spinner"></span>
              {{ store.actionLoading ? '处理中...' : '确认废弃' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认 Dialog -->
    <Teleport to="body">
      <div v-if="showDeleteDialog" class="ai-dialog-overlay" @click.self="showDeleteDialog = false">
        <div class="ai-dialog ai-confirm-dialog" style="max-width: 440px">
          <div class="ai-dialog-header">
            <div>
              <h2>删除任务</h2>
              <p class="ai-dialog-subtitle">此操作不可撤销，请谨慎确认</p>
            </div>
            <button class="ai-dialog-close" @click="showDeleteDialog = false">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="ai-dialog-body">
            <div class="ai-confirm-alert ai-confirm-alert--danger">
              <span class="material-symbols-outlined ai-confirm-alert-icon">delete_forever</span>
              <div>
                <p>
                  确定要彻底删除任务
                  <strong>{{ deleteTaskName }}</strong>
                  吗？
                </p>
                <p class="ai-confirm-alert-sub">
                  此操作将级联删除任务关联的所有脚本版本、验证记录、轨迹、证据和录制会话，不可恢复。
                </p>
              </div>
            </div>
          </div>
          <div class="ai-dialog-footer">
            <button class="ai-btn ai-btn-ghost" @click="showDeleteDialog = false">取消</button>
            <button
              class="ai-btn ai-btn-danger-solid"
              :disabled="store.actionLoading"
              @click="confirmDelete"
            >
              <span v-if="store.actionLoading" class="ai-spinner"></span>
              {{ store.actionLoading ? '删除中...' : '确认删除' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 批量废弃确认 Dialog -->
    <Teleport to="body">
      <div
        v-if="showBatchDiscardDialog"
        class="ai-dialog-overlay"
        @click.self="showBatchDiscardDialog = false"
      >
        <div class="ai-dialog ai-confirm-dialog" style="max-width: 460px">
          <div class="ai-dialog-header">
            <div>
              <h2>批量废弃任务</h2>
              <p class="ai-dialog-subtitle">已选中 {{ store.selectedTaskCount }} 条任务</p>
            </div>
            <button class="ai-dialog-close" @click="showBatchDiscardDialog = false">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="ai-dialog-body">
            <div class="ai-confirm-alert">
              <span class="material-symbols-outlined ai-confirm-alert-icon">warning</span>
              <p>
                确定要批量废弃已选中的
                <strong>{{ store.selectedTaskCount }}</strong>
                条任务吗？废弃后不可恢复。
              </p>
            </div>
            <div class="ai-form-group">
              <label class="ai-form-label">
                废弃原因
                <span class="ai-required">*</span>
              </label>
              <textarea
                v-model="batchDiscardReason"
                class="ai-form-textarea"
                placeholder="请输入统一废弃原因..."
                rows="3"
              />
            </div>
          </div>
          <div class="ai-dialog-footer">
            <button class="ai-btn ai-btn-ghost" @click="showBatchDiscardDialog = false">
              取消
            </button>
            <button
              class="ai-btn ai-btn-danger-solid"
              :disabled="store.actionLoading || !batchDiscardReason.trim()"
              @click="confirmBatchDiscard"
            >
              <span v-if="store.actionLoading" class="ai-spinner"></span>
              {{ store.actionLoading ? '处理中...' : '确认批量废弃' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 批量删除确认 Dialog -->
    <Teleport to="body">
      <div
        v-if="showBatchDeleteDialog"
        class="ai-dialog-overlay"
        @click.self="showBatchDeleteDialog = false"
      >
        <div class="ai-dialog ai-confirm-dialog" style="max-width: 460px">
          <div class="ai-dialog-header">
            <div>
              <h2>批量删除任务</h2>
              <p class="ai-dialog-subtitle">已选中 {{ store.selectedTaskCount }} 条任务</p>
            </div>
            <button class="ai-dialog-close" @click="showBatchDeleteDialog = false">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="ai-dialog-body">
            <div class="ai-confirm-alert ai-confirm-alert--danger">
              <span class="material-symbols-outlined ai-confirm-alert-icon">delete_forever</span>
              <div>
                <p>
                  确定要批量删除已选中的
                  <strong>{{ store.selectedTaskCount }}</strong>
                  条任务吗？
                </p>
                <p class="ai-confirm-alert-sub">
                  只有已废弃任务会被真正删除，不满足条件的任务会在结果中按"跳过/失败"统计返回。
                </p>
              </div>
            </div>
          </div>
          <div class="ai-dialog-footer">
            <button class="ai-btn ai-btn-ghost" @click="showBatchDeleteDialog = false">取消</button>
            <button
              class="ai-btn ai-btn-danger-solid"
              :disabled="store.actionLoading"
              @click="confirmBatchDelete"
            >
              <span v-if="store.actionLoading" class="ai-spinner"></span>
              {{ store.actionLoading ? '删除中...' : '确认批量删除' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.ai-filter-divider {
  width: 1px;
  height: 18px;
  background: var(--tp-border-subtle);
  margin: 0 6px;
  opacity: 0.8;
}

.ai-task-list-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

.ai-row-action-btn {
  position: relative;
}

.ai-row-action-btn::after {
  content: attr(data-tooltip);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  z-index: 20;
  max-width: 120px;
  padding: 5px 8px;
  border: 1px solid rgba(139, 92, 246, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
  color: var(--tp-text-primary, #111827);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%) translateY(3px);
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.ai-row-action-btn:hover::after,
.ai-row-action-btn:focus-visible::after {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

:global(.ai-rename-dialog-overlay) {
  align-items: center !important;
  justify-content: center !important;
  padding: 24px !important;
  background: rgba(15, 23, 42, 0.28) !important;
  backdrop-filter: blur(8px) saturate(108%) !important;
  -webkit-backdrop-filter: blur(8px) saturate(108%) !important;
}

:global(.ai-rename-dialog) {
  width: min(520px, calc(100vw - 48px)) !important;
  max-width: none !important;
  max-height: calc(100vh - 48px) !important;
  overflow: hidden !important;
  border: 1px solid rgba(139, 92, 246, 0.14) !important;
  border-radius: 16px !important;
  background: #ffffff !important;
  box-shadow:
    0 24px 64px rgba(15, 23, 42, 0.18),
    0 0 0 1px rgba(255, 255, 255, 0.88) inset !important;
}

:global(.ai-rename-dialog .ai-dialog-header) {
  align-items: flex-start !important;
  padding: 18px 20px 14px !important;
  border-bottom: 1px solid rgba(139, 92, 246, 0.1) !important;
  background: #ffffff !important;
}

:global(.ai-rename-dialog .ai-dialog-header h2) {
  color: var(--tp-text-primary, #111827) !important;
  font-size: 16px !important;
  line-height: 1.4 !important;
}

:global(.ai-rename-dialog .ai-dialog-subtitle) {
  margin: 4px 0 0 !important;
  color: var(--tp-text-subtle, #6b7280) !important;
  font-size: 12px !important;
}

:global(.ai-rename-dialog .ai-dialog-body) {
  padding: 18px 20px !important;
  background: #fbfbfe !important;
}

:global(.ai-rename-dialog .ai-form-label) {
  color: var(--tp-text-secondary, #374151) !important;
}

:global(.ai-rename-dialog .ai-form-input),
:global(.ai-rename-dialog .ai-form-textarea) {
  width: 100% !important;
  box-sizing: border-box !important;
  background: #ffffff !important;
  border: 1px solid rgba(139, 92, 246, 0.18) !important;
  color: var(--tp-text-primary, #111827) !important;
}

:global(.ai-rename-dialog .ai-form-input:focus),
:global(.ai-rename-dialog .ai-form-textarea:focus) {
  border-color: var(--tp-primary, #8b5cf6) !important;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.14) !important;
}

:global(.ai-rename-dialog .ai-rename-scenario-textarea) {
  min-height: 104px !important;
  line-height: 1.55 !important;
  resize: vertical !important;
}

:global(.ai-rename-dialog .ai-dialog-footer) {
  padding: 14px 20px 18px !important;
  border-top: 1px solid rgba(139, 92, 246, 0.1) !important;
  background: #ffffff !important;
}

:global(html[data-theme='genart'] .ai-row-action-btn::after) {
  background: rgba(20, 20, 28, 0.96);
  border-color: rgba(255, 255, 255, 0.12);
  color: #f8fafc;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4);
}

:global(html[data-theme='genart'] .ai-rename-dialog-overlay) {
  background: rgba(4, 4, 8, 0.58) !important;
}

:global(html[data-theme='genart'] .ai-rename-dialog) {
  background: rgba(20, 20, 28, 0.98) !important;
  border-color: rgba(139, 92, 246, 0.24) !important;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.56) !important;
}

:global(html[data-theme='genart'] .ai-rename-dialog :is(.ai-dialog-header, .ai-dialog-footer)) {
  background: rgba(20, 20, 28, 0.98) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

:global(html[data-theme='genart'] .ai-rename-dialog .ai-dialog-body) {
  background: rgba(10, 10, 15, 0.35) !important;
}

.ai-table-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--tp-surface-card);
  border: 1px solid var(--tp-border-subtle);
  border-radius: 14px;
}

.ai-table-scroll-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.ai-stats-grid {
  flex-shrink: 0;
  margin-top: 12px;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
.animate-pulse {
  animation: pulse 2s ease-in-out infinite;
}

/* 筛选面板 */
.ai-filter-panel {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 16px;
  animation: fadeIn 0.2s ease;
}
.ai-filter-row {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}
.ai-filter-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ai-filter-item label {
  font-size: 0.7rem;
  color: var(--tp-gray-500);
  font-weight: 500;
}
.ai-filter-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

/* Toast */
.task-list-toast {
  position: fixed !important;
  top: 74px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30000;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 9px 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(139, 92, 246, 0.16);
  color: var(--tp-text-primary, #111827);
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.45;
  box-shadow:
    0 16px 36px rgba(15, 23, 42, 0.14),
    0 0 0 1px rgba(255, 255, 255, 0.72) inset;
  backdrop-filter: blur(14px) saturate(118%);
  -webkit-backdrop-filter: blur(14px) saturate(118%);
  max-width: min(520px, calc(100vw - 48px));
  width: auto;
  white-space: normal;
  word-break: break-word;
}
.task-list-toast-icon {
  flex: 0 0 auto;
  font-size: 17px !important;
  color: var(--tp-primary, #8b5cf6);
}
.toast-enter-active {
  animation: task-toast-in 0.3s ease;
}
.toast-leave-active {
  animation: task-toast-in 0.2s ease reverse;
}
@keyframes task-toast-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-12px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

:global(html[data-theme='genart'] .task-list-toast) {
  background: rgba(20, 20, 28, 0.98);
  border-color: rgba(139, 92, 246, 0.26);
  color: #f8fafc;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.48);
}

:global(html[data-theme='genart'] .task-list-toast-icon) {
  color: #c084fc;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 废弃确认弹窗 */
.discard-warning {
  font-size: 0.85rem;
  color: var(--tp-gray-300);
  line-height: 1.6;
  margin-bottom: 16px;
}
.discard-warning strong {
  color: #ff8a80;
}
.ai-btn-danger {
  background: linear-gradient(135deg, #e53935, #c62828);
  color: #fff;
  border: none;
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}
.ai-btn-danger:hover {
  background: linear-gradient(135deg, #f44336, #d32f2f);
  box-shadow: 0 4px 12px rgba(229, 57, 53, 0.4);
}
.ai-btn-danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ai-bulk-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}

.ai-bulk-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 0.85rem;
  color: var(--tp-gray-300);
}

.ai-bulk-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ai-row-checkbox {
  appearance: none;
  -webkit-appearance: none;
  display: inline-grid;
  place-content: center;
  width: 14px;
  height: 14px;
  margin: 0;
  border: 1px solid color-mix(in srgb, var(--tp-text-subtle) 68%, transparent);
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  vertical-align: middle;
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.ai-row-checkbox:hover {
  border-color: color-mix(in srgb, var(--tp-text-muted) 82%, transparent);
  background: var(--tp-surface-muted);
}

.ai-row-checkbox:focus-visible {
  outline: none;
  border-color: var(--tp-primary);
  box-shadow: 0 0 0 3px var(--tp-accent-primary-soft);
}

.ai-row-checkbox:checked {
  border-color: var(--tp-primary) !important;
  background-color: var(--tp-primary) !important;
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='8' viewBox='0 0 10 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 4L3.5 6.5L9 1' stroke='white' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  background-size: 10px 8px;
}

.ai-row-checkbox[data-partial='true'] {
  border-color: var(--tp-primary) !important;
  background-color: var(--tp-primary) !important;
  background-image: linear-gradient(#fff, #fff);
  background-repeat: no-repeat;
  background-position: center;
  background-size: 8px 2px;
}

:global(html[data-theme='genart'] .ai-row-checkbox) {
  border-color: rgba(255, 255, 255, 0.36);
  background-color: rgba(0, 0, 0, 0.18);
}

:global(html[data-theme='genart'] .ai-row-checkbox:hover) {
  border-color: rgba(255, 255, 255, 0.56);
  background-color: rgba(255, 255, 255, 0.035);
}

:global(html[data-theme='genart'] .ai-row-checkbox:checked),
:global(html[data-theme='genart'] .ai-row-checkbox[data-partial='true']) {
  border-color: var(--tp-primary) !important;
  background-color: var(--tp-primary) !important;
}

/* ── 下拉选择器弹出框 (Popper) 样式优化 ── */
:global(.ai-select-popper.el-popper) {
  background: var(--tp-glass-bg) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  border: 1px solid var(--tp-glass-border) !important;
  box-shadow: var(--tp-shadow-md) !important;
  border-radius: var(--tp-radius-md) !important;
}

:global(.ai-select-popper .el-select-dropdown__list) {
  padding: 6px !important;
  background: transparent !important;
}

:global(.ai-select-popper .el-select-dropdown__item) {
  display: flex !important;
  align-items: center !important;
  height: 36px !important;
  line-height: 36px !important;
  padding: 0 10px !important;
  margin: 2px 0 !important;
  border-radius: var(--tp-radius-sm) !important;
  color: var(--tp-text-secondary) !important;
  font-size: 13px !important;
  transition: all var(--tp-transition) !important;
  background: transparent !important;
}

/* 悬浮与选中状态 */
:global(.ai-select-popper :is(.el-select-dropdown__item.hover, .el-select-dropdown__item:hover)) {
  background: var(--tp-surface-hover) !important;
  color: var(--tp-text-primary) !important;
}

:global(.ai-select-popper .el-select-dropdown__item.selected) {
  background: var(--tp-primary-lighter) !important;
  color: var(--tp-primary) !important;
  font-weight: 600 !important;
}

/* 滚动条美化 */
:global(.ai-select-popper .el-scrollbar__bar) {
  opacity: 0.6 !important;
}

:global(.ai-select-popper .el-scrollbar__thumb) {
  background-color: var(--tp-gray-400) !important;
}

/* 下拉小箭头 */
:global(.ai-select-popper .el-popper__arrow::before) {
  background: var(--tp-glass-bg) !important;
  border: 1px solid var(--tp-glass-border) !important;
}

/* 下拉项内容布局与状态圆点 */
.ai-select-option-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 100%;
}

.ai-select-option-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
  background: var(--tp-gray-400);
}

/* 语义状态指示点颜色与外发光 */
.ai-select-option-dot.success {
  background: var(--tp-success);
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
}

.ai-select-option-dot.warning {
  background: var(--tp-warning);
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.4);
}

.ai-select-option-dot.danger {
  background: var(--tp-danger);
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.4);
}

.ai-select-option-dot.primary {
  background: var(--tp-primary);
  box-shadow: 0 0 6px rgba(139, 92, 246, 0.4);
}

.ai-select-option-dot.info {
  background: var(--tp-gray-400);
}

/* 暗色主题 (genart) 微调 */
:global(html[data-theme='genart'] .ai-select-popper.el-popper) {
  background: rgba(10, 10, 12, 0.82) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}
:global(html[data-theme='genart'] .ai-select-popper .el-popper__arrow::before) {
  background: rgba(10, 10, 12, 0.82) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

/* ── 底部统计卡片高度 (上下宽度) 与间距优化 ── */
.ai-stats-grid .ai-stat-card,
.ai-stats-grid .ai-quickstart-card {
  min-height: 100px !important;
  padding: 10px 16px !important;
}

/* 快速入口卡片布局优化：由垂直排列改为水平排列以缩减高度 */
.ai-stats-grid .ai-quickstart-card {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 16px !important;
}

.ai-stats-grid .ai-quickstart-content {
  display: flex;
  flex-direction: column;
}

.ai-stats-grid .ai-stat-label {
  margin-bottom: 4px !important;
}

.ai-stats-grid .ai-stat-value {
  font-size: 1.6rem !important;
  margin-bottom: 2px !important;
}

.ai-stats-grid .ai-stat-bar {
  margin-top: 8px !important;
}

.ai-stats-grid .ai-stat-segments {
  margin-top: 8px !important;
}

.ai-stats-grid .ai-quickstart-card h4 {
  margin-top: 4px !important;
}

.ai-stats-grid .ai-quickstart-card p {
  margin-top: 4px !important;
  max-width: 220px !important;
}

.ai-stats-grid .ai-quickstart-link {
  margin-top: 0 !important;
  align-self: center !important;
  white-space: nowrap !important;
  flex-shrink: 0 !important;
}

/* ── 新建任务弹窗 Glassmorphism 与品牌配色深度优化 ── */

/* 遮罩层毛玻璃 — 调轻遮罩底色，保持整体明亮感 */
:global(.ai-create-dialog-overlay) {
  background: rgba(15, 23, 42, 0.25) !important;
  backdrop-filter: blur(10px) saturate(110%) !important;
  -webkit-backdrop-filter: blur(10px) saturate(110%) !important;
}

:global(html[data-theme='genart'] .ai-create-dialog-overlay) {
  background: rgba(4, 4, 8, 0.65) !important;
}

/* 弹窗主体 — 引入品牌浅紫微光边框与圆润投影 */
:global(.ai-create-dialog) {
  background: #ffffff !important;
  border: 1px solid rgba(139, 92, 246, 0.15) !important;
  box-shadow:
    0 24px 60px -10px rgba(139, 92, 246, 0.12),
    var(--tp-shadow-md) !important;
  border-radius: var(--tp-radius-lg, 16px) !important;
  overflow: hidden !important;
}

:global(html[data-theme='genart'] .ai-create-dialog) {
  background: rgba(20, 20, 28, 0.95) !important;
  border-color: rgba(139, 92, 246, 0.2) !important;
  box-shadow:
    0 24px 60px -10px rgba(0, 0, 0, 0.5),
    0 0 1px 1px rgba(255, 255, 255, 0.05) !important;
}

/* 弹窗 Body 区域 — 使用极淡的品牌紫靛色温底面，彻底消除灰色感 */
:global(.ai-create-dialog-body) {
  background: #f8f9fc !important;
  padding: 24px !important;
}

:global(html[data-theme='genart'] .ai-create-dialog-body) {
  background: rgba(10, 10, 15, 0.3) !important;
}

/* 头尾区域 — 设为纯白，与 body 的极淡紫靛色形成层次对比，摒弃灰色拼凑感 */
:global(.ai-create-dialog .ai-dialog-header) {
  border-bottom: 1px solid rgba(139, 92, 246, 0.1) !important;
  background: #ffffff !important;
  padding: 20px 24px !important;
}

:global(.ai-create-dialog .ai-dialog-footer) {
  border-top: 1px solid rgba(139, 92, 246, 0.1) !important;
  background: #ffffff !important;
  padding: 16px 24px !important;
}

:global(html[data-theme='genart'] .ai-create-dialog :is(.ai-dialog-header, .ai-dialog-footer)) {
  background: rgba(20, 20, 28, 0.95) !important;
  border-color: rgba(255, 255, 255, 0.06) !important;
}

/* 分块区域设计 — 纯白卡片结合微弱品牌紫描边与精致发光 */
:global(.ai-create-section) {
  background: #ffffff !important;
  border: 1px solid rgba(139, 92, 246, 0.08) !important;
  border-radius: var(--tp-radius-lg, 16px) !important;
  padding: 24px !important;
  margin-bottom: 20px !important;
  box-shadow:
    0 8px 24px -8px rgba(139, 92, 246, 0.06),
    var(--tp-shadow-sm) !important;
}

:global(html[data-theme='genart'] .ai-create-section) {
  background: rgba(255, 255, 255, 0.02) !important;
  border-color: rgba(255, 255, 255, 0.05) !important;
  box-shadow: none !important;
}

:global(.ai-create-section-head) {
  display: flex !important;
  align-items: flex-start !important;
  gap: 14px !important;
  margin-bottom: 20px !important;
}

:global(.ai-create-section-head h3) {
  margin: 0 !important;
  font-size: 15px !important;
  font-weight: 600 !important;
  color: var(--tp-text-primary) !important;
  line-height: 1.4 !important;
}

:global(.ai-create-section-head p) {
  margin: 2px 0 0 0 !important;
  font-size: 12px !important;
  color: var(--tp-text-subtle) !important;
}

/* 区域数字标识（完美圆形） */
:global(.ai-create-section-index) {
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  border-radius: 50% !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: var(--tp-primary-lighter, rgba(139, 92, 246, 0.1)) !important;
  color: var(--tp-primary, #8b5cf6) !important;
  font-weight: 700 !important;
  font-size: 13px !important;
  border: 1px solid var(--tp-primary-light, #a78bfa) !important;
}

:global(html[data-theme='genart'] .ai-create-section-index) {
  background: rgba(139, 92, 246, 0.15) !important;
  border-color: rgba(139, 92, 246, 0.3) !important;
}

/* 必填星号星红色标注 */
:global(.ai-required) {
  color: var(--tp-danger, #ef4444) !important;
  font-weight: bold !important;
  margin-left: 2px !important;
}

/* 表单输入与文本域 — 纯白背景与精致品牌微光边框 */
:global(.ai-create-dialog .ai-form-group) {
  margin-bottom: 16px !important;
}

:global(.ai-create-dialog .ai-form-label) {
  display: block !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  color: var(--tp-text-secondary) !important;
  margin-bottom: 8px !important;
}

:global(.ai-create-dialog .ai-form-input),
:global(.ai-create-dialog .ai-form-textarea) {
  background: #ffffff !important;
  border: 1px solid rgba(139, 92, 246, 0.15) !important;
  border-radius: var(--tp-radius-sm, 8px) !important;
  padding: 10px 14px !important;
  transition: all var(--tp-transition, 0.2s) !important;
  font-size: 13px !important;
  color: var(--tp-text-primary) !important;
}

:global(html[data-theme='genart'] .ai-create-dialog :is(.ai-form-input, .ai-form-textarea)) {
  background: rgba(0, 0, 0, 0.2) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  color: #fff !important;
}

:global(.ai-create-dialog :is(.ai-form-input, .ai-form-textarea):focus) {
  border-color: var(--tp-primary, #8b5cf6) !important;
  background: #ffffff !important;
  box-shadow: 0 0 0 3px var(--tp-primary-lighter, rgba(139, 92, 246, 0.15)) !important;
}

:global(html[data-theme='genart'] .ai-create-dialog :is(.ai-form-input, .ai-form-textarea):focus) {
  background: rgba(0, 0, 0, 0.35) !important;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.25) !important;
}

/* 模式选择卡片 — 精致白底与焦点框 */
:global(.ai-choice-card) {
  border: 1px solid rgba(139, 92, 246, 0.15) !important;
  background: #ffffff !important;
  border-radius: var(--tp-radius-md, 12px) !important;
  padding: 14px 16px !important;
  transition: all var(--tp-transition, 0.2s) !important;
  cursor: pointer !important;
  text-align: left !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 6px !important;
  width: 100% !important;
}

:global(html[data-theme='genart'] .ai-choice-card) {
  background: rgba(255, 255, 255, 0.02) !important;
  border-color: rgba(255, 255, 255, 0.06) !important;
}

:global(.ai-choice-card:hover) {
  border-color: var(--tp-primary-light, #a78bfa) !important;
  background: var(--tp-surface-hover, #f5f3ff) !important;
  transform: translateY(-1px);
}

:global(html[data-theme='genart'] .ai-choice-card:hover) {
  background: rgba(255, 255, 255, 0.04) !important;
  border-color: rgba(255, 255, 255, 0.2) !important;
}

:global(.ai-choice-card.active) {
  border-color: var(--tp-primary, #8b5cf6) !important;
  background: var(--tp-primary-lighter, rgba(139, 92, 246, 0.08)) !important;
  box-shadow:
    0 0 0 1px var(--tp-primary, #8b5cf6),
    0 8px 20px -6px rgba(139, 92, 246, 0.15) !important;
}

:global(html[data-theme='genart'] .ai-choice-card.active) {
  background: rgba(139, 92, 246, 0.12) !important;
  border-color: var(--tp-primary, #8b5cf6) !important;
  box-shadow:
    0 0 0 1px var(--tp-primary, #8b5cf6),
    0 8px 20px -6px rgba(139, 92, 246, 0.3) !important;
}

:global(.ai-choice-title) {
  font-weight: 600 !important;
  font-size: 14px !important;
  color: var(--tp-text-primary) !important;
}

:global(.ai-choice-desc) {
  font-size: 12px !important;
  color: var(--tp-text-subtle) !important;
  line-height: 1.45 !important;
}

/* 环境下拉选择框 — 纯白精致外观 */
:global(.ai-env-select-trigger) {
  border: 1px solid rgba(139, 92, 246, 0.15) !important;
  background: #ffffff !important;
  border-radius: var(--tp-radius-sm, 8px) !important;
  padding: 10px 14px !important;
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  width: 100% !important;
  transition: all var(--tp-transition, 0.2s) !important;
  cursor: pointer;
}

:global(.ai-env-select-trigger-readonly) {
  cursor: default !important;
}

:global(html[data-theme='genart'] .ai-env-select-trigger) {
  background: rgba(255, 255, 255, 0.02) !important;
  border-color: rgba(255, 255, 255, 0.06) !important;
}

:global(.ai-env-select.open .ai-env-select-trigger) {
  border-color: var(--tp-primary, #8b5cf6) !important;
  background: var(--tp-surface-base, #ffffff) !important;
  box-shadow: 0 0 0 3px var(--tp-primary-lighter, rgba(139, 92, 246, 0.15)) !important;
}

:global(html[data-theme='genart'] .ai-env-select.open .ai-env-select-trigger) {
  background: rgba(0, 0, 0, 0.4) !important;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.25) !important;
}

/* 紫色助手提示横幅 */
:global(.ai-prompt-helper) {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  padding: 10px 14px !important;
  background: var(--tp-accent-primary-soft, rgba(139, 92, 246, 0.06)) !important;
  border: 1px solid var(--tp-accent-primary-border, rgba(139, 92, 246, 0.18)) !important;
  border-radius: var(--tp-radius-sm, 8px) !important;
  color: var(--tp-primary, #8b5cf6) !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  margin-bottom: 12px !important;
}

:global(html[data-theme='genart'] .ai-prompt-helper) {
  background: rgba(139, 92, 246, 0.08) !important;
  border-color: rgba(139, 92, 246, 0.2) !important;
  color: #c084fc !important;
}

:global(.ai-prompt-helper .material-symbols-outlined) {
  font-size: 16px !important;
  color: inherit !important;
}

/* 浮动下拉用例列表 (Autocomplete) */
:global(.ai-case-picker-panel) {
  position: relative !important;
}

:global(.ai-case-dropdown) {
  position: absolute !important;
  top: 100% !important;
  left: 0 !important;
  right: 0 !important;
  z-index: 1000 !important;
  margin-top: 6px !important;
  max-height: 220px !important;
  overflow-y: auto !important;
  background: var(--tp-glass-bg-strong, rgba(255, 255, 255, 0.98)) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border: 1px solid var(--tp-glass-border, rgba(229, 231, 235, 0.8)) !important;
  border-radius: var(--tp-radius-md, 12px) !important;
  box-shadow:
    var(--tp-shadow-md),
    0 12px 32px -8px rgba(0, 0, 0, 0.12) !important;
  padding: 6px !important;
}

:global(html[data-theme='genart'] .ai-case-dropdown) {
  background: rgba(20, 20, 28, 0.96) !important;
  border-color: rgba(255, 255, 255, 0.1) !important;
  box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.5) !important;
}

:global(.ai-case-option) {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  padding: 8px 12px !important;
  border-radius: var(--tp-radius-sm, 8px) !important;
  cursor: pointer !important;
  transition: all var(--tp-transition, 0.2s) !important;
  margin: 2px 0 !important;
  color: var(--tp-text-secondary) !important;
  font-size: 13px !important;
}

:global(.ai-case-option:hover) {
  background: var(--tp-surface-hover, #f5f3ff) !important;
  color: var(--tp-text-primary) !important;
}

:global(html[data-theme='genart'] .ai-case-option:hover) {
  background: rgba(255, 255, 255, 0.04) !important;
}

:global(.ai-case-option.selected) {
  background: var(--tp-primary-lighter, rgba(139, 92, 246, 0.08)) !important;
  color: var(--tp-primary, #8b5cf6) !important;
}

:global(html[data-theme='genart'] .ai-case-option.selected) {
  background: rgba(139, 92, 246, 0.15) !important;
  color: #c084fc !important;
}

/* 已选择的用例标签 */
:global(.ai-selected-case-list) {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 8px !important;
  margin-top: 12px !important;
}

:global(.ai-selected-case-tag) {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 4px 10px !important;
  background: var(--tp-primary-lighter, rgba(139, 92, 246, 0.08)) !important;
  border: 1px solid var(--tp-btn-plain-border, rgba(139, 92, 246, 0.2)) !important;
  color: var(--tp-primary, #8b5cf6) !important;
  border-radius: var(--tp-radius-sm, 8px) !important;
  font-size: 12px !important;
  font-weight: 500 !important;
}

:global(html[data-theme='genart'] .ai-selected-case-tag) {
  background: rgba(139, 92, 246, 0.12) !important;
  border-color: rgba(139, 92, 246, 0.25) !important;
  color: #c084fc !important;
}

:global(.ai-selected-case-remove) {
  border: none !important;
  background: transparent !important;
  padding: 0 !important;
  cursor: pointer !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  color: inherit !important;
  opacity: 0.7 !important;
  transition: opacity 0.2s !important;
}

:global(.ai-selected-case-remove:hover) {
  opacity: 1 !important;
}

:global(.ai-selected-case-remove .material-symbols-outlined) {
  font-size: 14px !important;
}
</style>
