<script setup lang="ts">
import { onMounted, ref, reactive, computed, watch } from 'vue'
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
  type AiScriptTask,
  type AiScriptTaskListQuery,
} from '../../api/aiScript'
import { TaskStatus } from '../../api/aiScript'
import { listProjects } from '../../api/project'
import { listTestCases } from '../../api/testcase'
import type { Project, TestCase } from '../../api/types'

const router = useRouter()
const store = useAiScriptStore()
const projectStore = useProjectStore()

const projects = ref<Project[]>([])
const currentPage = ref(1)
const pageSize = ref(10)

// ── 筛选状态 ──
const showFilterPanel = ref(false)
const filterProjectId = ref<number | undefined>(undefined)
const filterStatus = ref<TaskStatus | ''>('')
const filterKeyword = ref('')
const sortDesc = ref(true)

// ── Toast 提示 ──
const toastMsg = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(msg: string) {
  toastMsg.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 3000)
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

/** 当前是否处于按筛选结果全选模式。 */
const isFilterAllSelection = computed(() => store.taskSelection.selectionMode === 'FILTER_ALL')

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
  showFilterPanel.value = false
}

function resetFilter() {
  store.clearTaskSelection()
  filterProjectId.value = undefined
  filterStatus.value = ''
  filterKeyword.value = ''
  applyFilter()
}

function toggleSort() {
  sortDesc.value = !sortDesc.value
  applyFilter()
}

onMounted(async () => {
  store.loadTaskList(buildQueryParams(1))
  projects.value = await listProjects()
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

function getStatusColor(status: TaskStatus) {
  return TaskStatusColor[status] || 'info'
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

// ── 用例搜索选择 ──
const caseCandidates = ref<TestCase[]>([])
const selectedCaseIds = ref<number[]>([])
const caseSearchKeyword = ref('')
const showCaseDropdown = ref(false)
const caseLoading = ref(false)
const caseLoadError = ref('')
let caseSearchTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 为新建任务弹窗选择默认项目。
 * 优先沿用左侧导航当前选中的项目，避免弹窗默认切到其它空项目导致误以为“没有可关联用例”。
 */
function resolveDefaultCreateProjectId(): number {
  const selectedProjectId = projectStore.selectedProjectId
  if (
    typeof selectedProjectId === 'number' &&
    projects.value.some((project) => project.id === selectedProjectId)
  ) {
    return selectedProjectId
  }
  return projects.value[0]?.id ?? 0
}

/**
 * 重置关联用例选择器状态。
 * 打开弹窗或切换所属项目时，需要清掉旧项目残留的已选项、搜索词和错误提示。
 */
function resetCasePickerState() {
  caseCandidates.value = []
  selectedCaseIds.value = []
  caseSearchKeyword.value = ''
  createForm.caseIds = ''
  caseLoadError.value = ''
}

/**
 * 打开新建任务弹窗并预加载关联用例。
 * 这里会在打开前确保项目列表可用，避免项目尚未加载完成时 projectId 被初始化为 0。
 */
async function openCreateDialog() {
  if (projects.value.length === 0) {
    projects.value = await listProjects()
  }

  createForm.projectId = resolveDefaultCreateProjectId()
  createForm.taskName = ''
  createForm.scenarioDesc = ''
  createForm.startUrl = ''
  createForm.accountRef = ''
  createForm.caseIds = ''
  createForm.frameworkType = 'Playwright'
  createForm.generationMode = GenerationMode.RECORDING_ENHANCED
  resetCasePickerState()
  showCaseDropdown.value = false
  showCreateDialog.value = true

  if (!createForm.projectId) {
    showToast('当前没有可用项目，请先创建项目')
    return
  }

  await loadCases(createForm.projectId)
}

/**
 * 加载当前项目下可供关联的测试用例候选列表。
 * 这里不会按评审结果或用例状态做额外过滤，理论上只要是该项目下的用例都应能被搜到。
 */
async function loadCases(projectId: number, keyword = '') {
  if (!projectId) {
    caseCandidates.value = []
    caseLoadError.value = '请先选择所属项目'
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
  if (!createForm.taskName.trim()) {
    showToast('请输入任务名称')
    return
  }
  if (!createForm.scenarioDesc.trim()) {
    showToast('请输入场景描述')
    return
  }
  if (!createForm.startUrl.trim()) {
    showToast('请输入起始 URL')
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

// ── 触发执行 ──
// ── 批量操作 ──
const showBatchDiscardDialog = ref(false)
const batchDiscardReason = ref('')
const showBatchDeleteDialog = ref(false)

/** 汇总批量执行结果，用于 Toast 提示。 */
function buildBatchResultMessage(actionName: string, result: {
  matched: number
  success: number
  skipped: number
  failed: number
}): string {
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

/** 按当前筛选结果全选。 */
function selectAllByCurrentFilter() {
  if (store.taskTotal <= 0) {
    showToast('当前没有可选择的任务')
    return
  }
  store.selectAllTasksByCurrentFilter()
  showToast(`已选择当前筛选结果的 ${store.taskTotal} 条任务`)
}

/** 清空当前全部勾选。 */
function clearSelectedTasks() {
  store.clearTaskSelection()
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

async function handleExecute(task: AiScriptTask) {
  if (
    task.taskStatus !== TaskStatus.PENDING_EXECUTE &&
    task.taskStatus !== TaskStatus.GENERATE_FAILED
  )
    return
  try {
    await store.executeTask(task.id)
    await store.loadTaskList()
  } catch (e) {
    console.error('触发执行失败:', e)
  }
}
</script>

<template>
  <div class="ai-page">
    <!-- 页面头部 -->
    <div class="ai-page-header">
      <div class="ai-page-header-left">
        <div class="ai-breadcrumb">
          <span>测试智编</span>
          <span class="material-symbols-outlined">chevron_right</span>
          <span class="current">生成任务</span>
        </div>
        <h1>智能脚本生成任务列表</h1>
      </div>
      <div class="ai-action-group">
        <button class="ai-btn ai-btn-ghost" @click="showFilterPanel = !showFilterPanel">
          <span class="material-symbols-outlined">filter_alt</span>
          筛选条件
        </button>
        <button class="ai-btn ai-btn-ghost" @click="toggleSort">
          <span class="material-symbols-outlined">{{ sortDesc ? 'arrow_downward' : 'arrow_upward' }}</span>
          {{ sortDesc ? '最新优先' : '最早优先' }}
        </button>
        <button class="ai-btn ai-btn-primary" @click="openCreateDialog">
          <span class="material-symbols-outlined">add</span>
          新建任务
        </button>
      </div>
    </div>

    <!-- 筛选面板 -->
    <div v-if="showFilterPanel" class="ai-filter-panel">
      <div class="ai-filter-row">
        <div class="ai-filter-item">
          <label>项目</label>
          <select v-model="filterProjectId" class="ai-form-select" style="min-width: 160px">
            <option :value="undefined">全部项目</option>
            <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <div class="ai-filter-item">
          <label>状态</label>
          <select v-model="filterStatus" class="ai-form-select" style="min-width: 140px">
            <option value="">全部状态</option>
            <option v-for="(label, key) in TaskStatusLabel" :key="key" :value="key">{{ label }}</option>
          </select>
        </div>
        <div class="ai-filter-item">
          <label>关键字</label>
          <input v-model="filterKeyword" class="ai-form-input" style="min-width: 180px" placeholder="任务名称 / 用例名称" @keyup.enter="applyFilter" />
        </div>
        <div class="ai-filter-actions">
          <button class="ai-btn ai-btn-primary" style="padding: 6px 16px; font-size: 0.8rem" @click="applyFilter">
            <span class="material-symbols-outlined" style="font-size: 16px">search</span>
            查询
          </button>
          <button class="ai-btn ai-btn-ghost" style="padding: 6px 12px; font-size: 0.8rem" @click="resetFilter">重置</button>
        </div>
      </div>
    </div>

    <div class="ai-bulk-toolbar">
      <div class="ai-bulk-summary">
        <span>已选择 {{ store.selectedTaskCount }} 条任务</span>
        <span v-if="isFilterAllSelection">（按当前筛选结果全选）</span>
        <span v-if="isFilterAllSelection && store.taskSelection.excludedIds.length > 0">
          ，已排除 {{ store.taskSelection.excludedIds.length }} 条
        </span>
      </div>
      <div class="ai-bulk-actions">
        <button
          class="ai-btn ai-btn-ghost"
          :disabled="store.taskList.length === 0"
          @click="toggleCurrentPageSelection(!currentPageAllSelected)"
        >
          {{ currentPageAllSelected ? '取消本页全选' : '本页全选' }}
        </button>
        <button
          class="ai-btn ai-btn-ghost"
          :disabled="store.taskTotal === 0 || isFilterAllSelection"
          @click="selectAllByCurrentFilter"
        >
          按筛选结果全选
        </button>
        <button
          class="ai-btn ai-btn-ghost"
          :disabled="store.selectedTaskCount <= 0"
          @click="clearSelectedTasks"
        >
          清空勾选
        </button>
        <button
          class="ai-btn ai-btn-ghost"
          :disabled="store.selectedTaskCount <= 0"
          @click="openBatchDiscardDialog"
        >
          批量废弃
        </button>
        <button
          class="ai-btn ai-btn-danger"
          :disabled="store.selectedTaskCount <= 0"
          @click="openBatchDeleteDialog"
        >
          批量删除
        </button>
      </div>
    </div>

    <!-- 主表格 -->
    <div class="ai-table-wrap">
      <table class="ai-table">
        <thead>
          <tr>
            <th style="width: 54px">
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
            <th>所属项目</th>
            <th>关联用例</th>
            <th>输出框架</th>
            <th>任务状态</th>
            <th>验证状态</th>
            <th>创建人</th>
            <th>创建时间</th>
            <th>更新时间</th>
            <th style="text-align: right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in store.taskList" :key="task.id" @click="goDetail(task)">
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
              <span style="font-size: 0.85rem; color: var(--tp-gray-700)">
                {{ task.projectName }}
              </span>
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
              <span style="font-family: monospace; font-size: 0.85rem; color: var(--tp-gray-700)">
                {{ task.frameworkType }}
              </span>
            </td>
            <td>
              <div class="ai-status-badge" :class="getStatusColor(task.taskStatus)">
                <span
                  class="ai-status-dot"
                  :class="{ 'animate-pulse': isRunning(task.taskStatus) }"
                ></span>
                <template v-if="task.taskStatus === TaskStatus.GENERATE_SUCCESS">
                  <span class="material-symbols-outlined" style="font-size: 12px">
                    check_circle
                  </span>
                </template>
                <template v-else-if="task.taskStatus === TaskStatus.GENERATE_FAILED">
                  <span class="material-symbols-outlined" style="font-size: 12px">error</span>
                </template>
                <template v-else-if="task.taskStatus === TaskStatus.PENDING_CONFIRM">
                  <span class="material-symbols-outlined" style="font-size: 12px">pending</span>
                </template>
                {{ TaskStatusLabel[task.taskStatus] }}
              </div>
            </td>
            <td>
              <div v-if="task.latestValidationStatus" class="ai-status-badge" :class="ValidationStatusColor[task.latestValidationStatus]" style="font-size: 0.7rem">
                {{ ValidationStatusLabel[task.latestValidationStatus] }}
              </div>
              <span v-else style="font-size: 0.75rem; color: var(--tp-gray-600)">—</span>
            </td>
            <td>
              <span style="font-size: 0.8rem; font-weight: 500">{{ task.createdName }}</span>
            </td>
            <td>
              <span style="font-size: 0.75rem; color: var(--tp-gray-500)">{{ formatTime(task.createdAt) }}</span>
            </td>
            <td>
              <span style="font-size: 0.75rem; color: var(--tp-gray-500)">{{ formatTime(task.updatedAt) }}</span>
            </td>
            <td>
              <div class="ai-row-actions">
                <button class="ai-row-action-btn" title="查看详情" @click.stop="goDetail(task)">
                  <span class="material-symbols-outlined">visibility</span>
                </button>
                <button
                  v-if="
                    task.taskStatus === TaskStatus.PENDING_EXECUTE ||
                    task.taskStatus === TaskStatus.GENERATE_FAILED
                  "
                  class="ai-row-action-btn"
                  title="触发执行"
                  @click.stop="handleExecute(task)"
                >
                  <span class="material-symbols-outlined">play_arrow</span>
                </button>
                <button class="ai-row-action-btn" title="复制配置" @click.stop>
                  <span class="material-symbols-outlined">content_copy</span>
                </button>
                <button class="ai-row-action-btn danger" title="废弃" @click.stop="openDiscardDialog(task)">
                  <span class="material-symbols-outlined">block</span>
                </button>
                <button
                  v-if="task.taskStatus === TaskStatus.DISCARDED"
                  class="ai-row-action-btn danger"
                  title="删除"
                  @click.stop="openDeleteDialog(task)"
                >
                  <span class="material-symbols-outlined">delete_forever</span>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

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
      <div class="ai-stat-card">
        <div class="ai-stat-label" style="color: #adc6ff">
          成功率
          <span class="material-symbols-outlined" style="color: #adc6ff">trending_up</span>
        </div>
        <div class="ai-stat-value">{{ statsSuccessRate }}%</div>
        <div class="ai-stat-desc">当前页 {{ store.taskList.length }} 条任务统计</div>
        <div class="ai-stat-bar">
          <div
            class="ai-stat-bar-fill"
            :style="{ width: statsSuccessRate + '%', background: '#adc6ff' }"
          ></div>
        </div>
      </div>

      <!-- 活跃运行器 -->
      <div class="ai-stat-card">
        <div class="ai-stat-label" style="color: var(--tp-primary-light)">
          活跃运行器
          <span class="material-symbols-outlined" style="color: var(--tp-primary-light)">bolt</span>
        </div>
        <div class="ai-stat-value">{{ statsRunningCount }}</div>
        <div class="ai-stat-desc">当前正在生成中的任务</div>
        <div style="display: flex; gap: 4px; margin-top: 14px">
          <div
            style="height: 4px; flex: 1; background: var(--tp-primary-light); border-radius: 4px"
          ></div>
          <div
            style="height: 4px; flex: 1; background: var(--tp-primary-light); border-radius: 4px"
          ></div>
          <div
            class="animate-pulse"
            style="height: 4px; flex: 1; background: var(--tp-primary-light); border-radius: 4px"
          ></div>
          <div
            style="height: 4px; flex: 1; background: var(--tp-surface-elevated); border-radius: 4px"
          ></div>
        </div>
      </div>

      <!-- 快速入口 -->
      <div class="ai-quickstart-card">
        <div style="position: relative; z-index: 1">
          <div class="ai-stat-label" style="color: #ffb784">快速入口</div>
          <h4>从 UI 轨迹生成</h4>
          <p>将手动录制的操作日志直接转换为 Playwright 代码</p>
        </div>
        <button
          class="ai-quickstart-link"
          style="position: relative; z-index: 1"
          @click="openCreateDialog(); createForm.generationMode = GenerationMode.RECORDING_ENHANCED"
        >
          立即体验
          <span class="material-symbols-outlined" style="font-size: 14px">arrow_forward</span>
        </button>
        <div class="ai-quickstart-glow"></div>
      </div>
    </div>

    <!-- FAB — 跳转脚本资产 -->
    <button class="ai-fab" title="脚本资产管理" @click="router.push('/ai-script/library')">
      <span class="material-symbols-outlined">inventory_2</span>
    </button>

    <!-- 新建任务 Dialog -->
    <div v-if="showCreateDialog" class="ai-dialog-overlay" @click.self="showCreateDialog = false">
      <div class="ai-dialog">
        <div class="ai-dialog-header">
          <h2>新建智能生成任务</h2>
          <button class="ai-dialog-close" @click="showCreateDialog = false">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="ai-dialog-body">
          <div class="ai-form-group">
            <label class="ai-form-label">所属项目 *</label>
            <select v-model="createForm.projectId" class="ai-form-select">
              <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div class="ai-form-group">
            <label class="ai-form-label">生成模式 *</label>
            <select v-model="createForm.generationMode" class="ai-form-select">
              <option v-for="(label, key) in GenerationModeLabel" :key="key" :value="key">
                {{ label }}
              </option>
            </select>
            <span class="ai-form-hint">
              {{
                createForm.generationMode === GenerationMode.RECORDING_ENHANCED
                  ? '录制增强：先 Playwright 录制，再 AI 重构为标准脚本'
                  : 'AI 直生：browser-use 自动探索并生成脚本'
              }}
            </span>
          </div>
          <div class="ai-form-group">
            <label class="ai-form-label">任务名称 *</label>
            <input
              v-model="createForm.taskName"
              class="ai-form-input"
              placeholder="例如：登录流程回归测试"
            />
          </div>
          <div class="ai-form-group">
            <label class="ai-form-label">场景描述 *</label>
            <textarea
              v-model="createForm.scenarioDesc"
              class="ai-form-textarea"
              placeholder="描述 browser-use 需要探索的业务场景"
            />
          </div>
          <div class="ai-form-group">
            <label class="ai-form-label">起始 URL *</label>
            <input
              v-model="createForm.startUrl"
              class="ai-form-input"
              placeholder="https://your-app.com/login"
            />
          </div>
          <div class="ai-form-group">
            <label class="ai-form-label">关联用例 *</label>
            <!-- 已选用例标签 -->
            <div
              v-if="selectedCaseIds.length"
              style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px"
            >
              <span
                v-for="cid in selectedCaseIds"
                :key="cid"
                style="
                  display: inline-flex;
                  align-items: center;
                  gap: 4px;
                  background: rgba(124, 77, 255, 0.15);
                  color: #b388ff;
                  padding: 2px 8px;
                  border-radius: 12px;
                  font-size: 0.75rem;
                "
              >
                TC-{{ cid }}
                <span
                  class="material-symbols-outlined"
                  style="font-size: 14px; cursor: pointer"
                  @click="selectedCaseIds.splice(selectedCaseIds.indexOf(cid), 1); createForm.caseIds = selectedCaseIds.join(',')"
                >
                  ×
                </span>
              </span>
            </div>
            <!-- 搜索输入 -->
            <div style="position: relative">
              <input
                class="ai-form-input"
                :value="caseSearchKeyword"
                placeholder="搜索用例名称或 ID..."
                @input="handleCaseSearch"
                @focus="showCaseDropdown = true"
              />
              <!-- 下拉列表 -->
              <div
                v-if="showCaseDropdown"
                style="
                  position: absolute;
                  top: 100%;
                  left: 0;
                  right: 0;
                  z-index: 100;
                  max-height: 200px;
                  overflow-y: auto;
                  background: var(--tp-surface-elevated, #1e1e2e);
                  border: 1px solid rgba(255, 255, 255, 0.1);
                  border-radius: 8px;
                  margin-top: 4px;
                  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
                "
              >
                <div
                  v-if="caseLoading"
                  style="
                    padding: 10px 12px;
                    font-size: 0.8rem;
                    color: var(--tp-gray-500);
                  "
                >
                  正在加载用例...
                </div>
                <div
                  v-else-if="caseCandidates.length === 0"
                  style="
                    padding: 10px 12px;
                    font-size: 0.8rem;
                    color: var(--tp-gray-500);
                  "
                >
                  {{ caseLoadError || '当前没有可关联用例' }}
                </div>
                <template v-else>
                  <div
                    v-for="c in caseCandidates"
                    :key="c.id"
                    style="
                      padding: 8px 12px;
                      cursor: pointer;
                      display: flex;
                      align-items: center;
                      gap: 8px;
                      font-size: 0.8rem;
                      transition: background 0.15s;
                    "
                    :style="{ background: isCaseSelected(c.id) ? 'rgba(124,77,255,0.12)' : '' }"
                    @mousedown.prevent="toggleCase(c)"
                  >
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 16px"
                      :style="{ color: isCaseSelected(c.id) ? '#b388ff' : 'var(--tp-gray-500)' }"
                    >
                      {{ isCaseSelected(c.id) ? 'check_box' : 'check_box_outline_blank' }}
                    </span>
                    <span style="color: var(--tp-gray-500); min-width: 50px">TC-{{ c.id }}</span>
                    <span
                      style="
                        color: var(--tp-gray-300);
                        flex: 1;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                      "
                    >
                      {{ c.title }}
                    </span>
                    <span
                      v-if="c.level"
                      style="
                        font-size: 0.65rem;
                        padding: 1px 6px;
                        border-radius: 8px;
                        background: rgba(255, 255, 255, 0.06);
                        color: var(--tp-gray-500);
                      "
                    >
                      {{ c.level }}
                    </span>
                  </div>
                </template>
              </div>
            </div>
            <span class="ai-form-hint">
              已选择 {{ selectedCaseIds.length }} 条用例
              <template v-if="caseLoadError && !caseLoading">，{{ caseLoadError }}</template>
            </span>
          </div>
          <div class="ai-form-group">
            <label class="ai-form-label">测试账号 (可选)</label>
            <input
              v-model="createForm.accountRef"
              class="ai-form-input"
              placeholder="引用的测试账号标识"
            />
          </div>
        </div>
        <div class="ai-dialog-footer">
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

    <!-- Toast 提示 -->
    <Transition name="toast">
      <div v-if="toastMsg" class="task-list-toast">
        <span class="material-symbols-outlined" style="font-size: 16px; color: #ff8a80">error</span>
        {{ toastMsg }}
      </div>
    </Transition>

    <!-- 废弃确认 Dialog -->
    <div v-if="showDiscardDialog" class="ai-dialog-overlay" @click.self="showDiscardDialog = false">
      <div class="ai-dialog" style="max-width: 440px">
        <div class="ai-dialog-header">
          <h2>ℹ️ 废弃任务</h2>
          <button class="ai-dialog-close" @click="showDiscardDialog = false">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="ai-dialog-body">
          <p class="discard-warning">
            确定要废弃任务 <strong>{{ discardTaskName }}</strong>（ID: {{ discardTaskId }}）吗？废弃后任务将不可恢复。
          </p>
          <div class="ai-form-group">
            <label class="ai-form-label">废弃原因 *</label>
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
            class="ai-btn ai-btn-danger"
            :disabled="store.actionLoading"
            @click="confirmDiscard"
          >
            <span v-if="store.actionLoading" class="ai-spinner"></span>
            {{ store.actionLoading ? '处理中...' : '确认废弃' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 删除确认 Dialog -->
    <div v-if="showDeleteDialog" class="ai-dialog-overlay" @click.self="showDeleteDialog = false">
      <div class="ai-dialog" style="max-width: 440px">
        <div class="ai-dialog-header">
          <h2>⚠️ 删除任务</h2>
          <button class="ai-dialog-close" @click="showDeleteDialog = false">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="ai-dialog-body">
          <p class="discard-warning" style="color: #ff8a80">
            确定要彻底删除任务 <strong>{{ deleteTaskName }}</strong>（ID: {{ deleteTaskId }}）吗？
          </p>
          <p style="font-size: 0.8rem; color: var(--tp-gray-500); margin-top: 8px">
            此操作将级联删除任务关联的所有脚本版本、验证记录、轨迹、证据和录制会话，<strong style="color: #ff8a80">不可恢复</strong>。
          </p>
        </div>
        <div class="ai-dialog-footer">
          <button class="ai-btn ai-btn-ghost" @click="showDeleteDialog = false">取消</button>
          <button
            class="ai-btn ai-btn-danger"
            :disabled="store.actionLoading"
            @click="confirmDelete"
          >
            <span v-if="store.actionLoading" class="ai-spinner"></span>
            {{ store.actionLoading ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 批量废弃确认 Dialog -->
    <div v-if="showBatchDiscardDialog" class="ai-dialog-overlay" @click.self="showBatchDiscardDialog = false">
      <div class="ai-dialog" style="max-width: 460px">
        <div class="ai-dialog-header">
          <h2>批量废弃任务</h2>
          <button class="ai-dialog-close" @click="showBatchDiscardDialog = false">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="ai-dialog-body">
          <p class="discard-warning">
            确定要批量废弃已选中的 <strong>{{ store.selectedTaskCount }}</strong> 条任务吗？
          </p>
          <div class="ai-form-group">
            <label class="ai-form-label">废弃原因 *</label>
            <textarea
              v-model="batchDiscardReason"
              class="ai-form-textarea"
              placeholder="请输入统一废弃原因..."
              rows="3"
            />
          </div>
        </div>
        <div class="ai-dialog-footer">
          <button class="ai-btn ai-btn-ghost" @click="showBatchDiscardDialog = false">取消</button>
          <button
            class="ai-btn ai-btn-danger"
            :disabled="store.actionLoading"
            @click="confirmBatchDiscard"
          >
            <span v-if="store.actionLoading" class="ai-spinner"></span>
            {{ store.actionLoading ? '处理中...' : '确认批量废弃' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 批量删除确认 Dialog -->
    <div v-if="showBatchDeleteDialog" class="ai-dialog-overlay" @click.self="showBatchDeleteDialog = false">
      <div class="ai-dialog" style="max-width: 460px">
        <div class="ai-dialog-header">
          <h2>批量删除任务</h2>
          <button class="ai-dialog-close" @click="showBatchDeleteDialog = false">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="ai-dialog-body">
          <p class="discard-warning" style="color: #ff8a80">
            确定要批量删除已选中的 <strong>{{ store.selectedTaskCount }}</strong> 条任务吗？
          </p>
          <p style="font-size: 0.8rem; color: var(--tp-gray-500); margin-top: 8px">
            只有已废弃任务会被真正删除，不满足条件的任务会在结果中按“跳过/失败”统计返回。
          </p>
        </div>
        <div class="ai-dialog-footer">
          <button class="ai-btn ai-btn-ghost" @click="showBatchDeleteDialog = false">取消</button>
          <button
            class="ai-btn ai-btn-danger"
            :disabled="store.actionLoading"
            @click="confirmBatchDelete"
          >
            <span v-if="store.actionLoading" class="ai-spinner"></span>
            {{ store.actionLoading ? '删除中...' : '确认批量删除' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 10px;
  background: rgba(30, 30, 46, 0.95);
  border: 1px solid rgba(255, 138, 128, 0.3);
  color: #ff8a80;
  font-size: 0.82rem;
  font-weight: 500;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
  max-width: 360px;
  width: auto;
  white-space: nowrap;
}
.toast-enter-active { animation: task-toast-in 0.3s ease; }
.toast-leave-active { animation: task-toast-in 0.2s ease reverse; }
@keyframes task-toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
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
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--tp-primary, #4f8cff);
}

.ai-row-checkbox[data-partial='true'] {
  outline: 2px solid rgba(79, 140, 255, 0.4);
  outline-offset: 1px;
}
</style>
