import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  AiScriptTask,
  AiScriptVersion,
  AiScriptValidation,
  AiScriptTrace,
  AiScriptTaskListQuery,
  BatchTaskActionResult,
  BatchTaskSelectionMode,
  BatchTaskSelectionPayload,
  TaskFilterSnapshot,
} from '../api/aiScript'
import type { GenerationMode } from '../api/aiScript'
import {
  fetchTaskList,
  fetchTaskDetail,
  fetchScriptVersions,
  fetchCurrentScript,
  fetchTraces,
  fetchLatestValidation,
  fetchValidationHistory,
  createTask as apiCreateTask,
  executeTask as apiExecuteTask,
  editScript as apiEditScript,
  triggerValidation as apiTriggerValidation,
  discardTask as apiDiscardTask,
  deleteTask as apiDeleteTask,
  batchDiscardTasks as apiBatchDiscardTasks,
  batchDeleteTasks as apiBatchDeleteTasks,
} from '../api/aiScript'

interface TaskSelectionState {
  selectionMode: BatchTaskSelectionMode
  selectedIds: number[]
  excludedIds: number[]
  filterSnapshot: TaskFilterSnapshot | null
  expectedTotal: number
}

/** 创建默认的任务选择状态。 */
function createEmptyTaskSelection(): TaskSelectionState {
  return {
    selectionMode: 'IDS',
    selectedIds: [],
    excludedIds: [],
    filterSnapshot: null,
    expectedTotal: 0,
  }
}

/** 归一化任务列表查询参数，避免刷新后丢失当前筛选上下文。 */
function normalizeTaskListQuery(params?: AiScriptTaskListQuery): AiScriptTaskListQuery {
  return {
    projectId: params?.projectId,
    taskStatus: params?.taskStatus,
    keyword: params?.keyword?.trim() || undefined,
    pageNo: params?.pageNo ?? 1,
    pageSize: params?.pageSize ?? 20,
  }
}

export const useAiScriptStore = defineStore('aiScript', () => {
  // ── 任务列表 ──
  const taskList = ref<AiScriptTask[]>([])
  const taskTotal = ref(0)
  const taskLoading = ref(false)
  const taskListQuery = ref<AiScriptTaskListQuery>(normalizeTaskListQuery())

  /** 构建当前激活列表的筛选快照，供批量接口复用。 */
  function buildActiveTaskFilterSnapshot(): TaskFilterSnapshot | null {
    const query = taskListQuery.value
    if (!query.projectId && !query.keyword && !query.taskStatus) {
      return null
    }
    return {
      projectId: query.projectId,
      keyword: query.keyword,
      taskStatus: query.taskStatus,
    }
  }

  async function loadTaskList(params?: AiScriptTaskListQuery) {
    taskLoading.value = true
    try {
      const normalizedQuery = normalizeTaskListQuery(params ?? taskListQuery.value)
      taskListQuery.value = normalizedQuery
      const res = await fetchTaskList(normalizedQuery)
      taskList.value = res.list
      taskTotal.value = res.total
    } finally {
      taskLoading.value = false
    }
  }

  // ── 任务详情 ──
  const currentTask = ref<AiScriptTask | null>(null)
  const detailLoading = ref(false)

  async function loadTaskDetail(taskId: number) {
    detailLoading.value = true
    try {
      const task = await fetchTaskDetail(taskId)
      currentTask.value = task || null
    } finally {
      detailLoading.value = false
    }
  }

  // ── 脚本版本 ──
  const scriptVersions = ref<AiScriptVersion[]>([])
  const currentScript = ref<AiScriptVersion | null>(null)

  async function loadScriptVersions(taskId: number) {
    scriptVersions.value = await fetchScriptVersions(taskId)
  }

  async function loadCurrentScript(taskId: number) {
    const script = await fetchCurrentScript(taskId)
    currentScript.value = script || null
  }

  // ── 轨迹 ──
  const traces = ref<AiScriptTrace[]>([])

  async function loadTraces(taskId: number) {
    traces.value = await fetchTraces(taskId)
  }

  // ── 验证结果 ──
  const latestValidation = ref<AiScriptValidation | null>(null)

  async function loadLatestValidation(scriptId: number) {
    latestValidation.value = (await fetchLatestValidation(scriptId)) || null
  }

  // ── 验证历史 ──
  const validationHistory = ref<AiScriptValidation[]>([])

  async function loadValidationHistory(scriptId: number) {
    validationHistory.value = await fetchValidationHistory(scriptId)
  }

  // ── 批量勾选 ──
  const taskSelection = ref<TaskSelectionState>(createEmptyTaskSelection())

  /** 清空任务勾选状态，确保筛选变化后不会误操作旧选择。 */
  function clearTaskSelection() {
    taskSelection.value = createEmptyTaskSelection()
  }

  /** 判断指定任务当前是否处于选中状态。 */
  function isTaskSelected(taskId: number): boolean {
    if (taskSelection.value.selectionMode === 'FILTER_ALL') {
      return !taskSelection.value.excludedIds.includes(taskId)
    }
    return taskSelection.value.selectedIds.includes(taskId)
  }

  /** 切换单条任务的勾选状态。 */
  function toggleTaskSelection(taskId: number) {
    if (taskSelection.value.selectionMode === 'FILTER_ALL') {
      const index = taskSelection.value.excludedIds.indexOf(taskId)
      if (index >= 0) {
        taskSelection.value.excludedIds.splice(index, 1)
      } else {
        taskSelection.value.excludedIds.push(taskId)
      }
      return
    }

    const index = taskSelection.value.selectedIds.indexOf(taskId)
    if (index >= 0) {
      taskSelection.value.selectedIds.splice(index, 1)
    } else {
      taskSelection.value.selectedIds.push(taskId)
    }
  }

  /** 批量设置当前页任务的勾选状态。 */
  function setCurrentPageTaskSelection(taskIds: number[], checked: boolean) {
    if (taskIds.length === 0) return

    if (taskSelection.value.selectionMode === 'FILTER_ALL') {
      const excluded = new Set(taskSelection.value.excludedIds)
      for (const taskId of taskIds) {
        if (checked) {
          excluded.delete(taskId)
        } else {
          excluded.add(taskId)
        }
      }
      taskSelection.value.excludedIds = Array.from(excluded)
      return
    }

    const selected = new Set(taskSelection.value.selectedIds)
    for (const taskId of taskIds) {
      if (checked) {
        selected.add(taskId)
      } else {
        selected.delete(taskId)
      }
    }
    taskSelection.value.selectedIds = Array.from(selected)
  }

  /** 启用“按当前筛选结果全选”模式。 */
  function selectAllTasksByCurrentFilter() {
    taskSelection.value = {
      selectionMode: 'FILTER_ALL',
      selectedIds: [],
      excludedIds: [],
      filterSnapshot: buildActiveTaskFilterSnapshot(),
      expectedTotal: taskTotal.value,
    }
  }

  /** 计算当前被选中的任务数量。 */
  const selectedTaskCount = computed(() => {
    if (taskSelection.value.selectionMode === 'FILTER_ALL') {
      return Math.max(taskSelection.value.expectedTotal - taskSelection.value.excludedIds.length, 0)
    }
    return taskSelection.value.selectedIds.length
  })

  /** 组装批量接口请求体，统一前后端的选择模型。 */
  function buildTaskSelectionPayload(): BatchTaskSelectionPayload | null {
    if (selectedTaskCount.value <= 0) {
      return null
    }

    return {
      selectionMode: taskSelection.value.selectionMode,
      taskIds: [...taskSelection.value.selectedIds],
      excludedTaskIds: [...taskSelection.value.excludedIds],
      filterSnapshot: taskSelection.value.filterSnapshot,
      expectedTotal: taskSelection.value.expectedTotal || selectedTaskCount.value,
    }
  }

  // ── 加载任务详情页全量数据 ──
  async function loadTaskDetailFull(taskId: number) {
    detailLoading.value = true
    try {
      await Promise.all([
        loadTaskDetail(taskId),
        loadScriptVersions(taskId),
        loadCurrentScript(taskId),
        loadTraces(taskId),
      ])
      if (currentScript.value) {
        await Promise.all([
          loadLatestValidation(currentScript.value.id),
          loadValidationHistory(currentScript.value.id),
        ])
      }
    } finally {
      detailLoading.value = false
    }
  }

  // ── 写操作 ──
  const actionLoading = ref(false)

  /** 创建任务。 */
  async function createTask(payload: {
    projectId: number
    taskName: string
    generationMode?: GenerationMode
    scenarioDesc: string
    startUrl: string
    accountRef?: string
    caseIds: number[]
    frameworkType?: string
  }): Promise<AiScriptTask> {
    actionLoading.value = true
    try {
      const task = await apiCreateTask(payload)
      await loadTaskList(taskListQuery.value)
      return task
    } finally {
      actionLoading.value = false
    }
  }

  /** 触发执行生成。 */
  async function executeTask(taskId: number): Promise<void> {
    actionLoading.value = true
    try {
      await apiExecuteTask(taskId)
      await loadTaskDetail(taskId)
    } finally {
      actionLoading.value = false
    }
  }

  /** 编辑脚本并生成新版本。 */
  async function updateScript(
    taskId: number,
    payload: { scriptContent: string; commentText?: string },
  ): Promise<AiScriptVersion> {
    actionLoading.value = true
    try {
      const version = await apiEditScript(taskId, payload)
      await Promise.all([
        loadCurrentScript(taskId),
        loadScriptVersions(taskId),
        loadTaskDetail(taskId),
      ])
      return version
    } finally {
      actionLoading.value = false
    }
  }

  /** 触发回放验证。 */
  async function runValidation(taskId: number, scriptVersionId: number): Promise<void> {
    actionLoading.value = true
    try {
      await apiTriggerValidation(taskId, scriptVersionId)
      await Promise.all([loadLatestValidation(scriptVersionId), loadTaskDetail(taskId)])
    } finally {
      actionLoading.value = false
    }
  }

  /** 废弃任务。 */
  async function discardTask(taskId: number, reason: string): Promise<void> {
    actionLoading.value = true
    try {
      await apiDiscardTask(taskId, reason)
      await loadTaskList(taskListQuery.value)
    } finally {
      actionLoading.value = false
    }
  }

  /** 删除已废弃任务。 */
  async function deleteDiscardedTask(taskId: number): Promise<void> {
    actionLoading.value = true
    try {
      await apiDeleteTask(taskId)
      await loadTaskList(taskListQuery.value)
    } finally {
      actionLoading.value = false
    }
  }

  /** 批量废弃当前已勾选任务。 */
  async function batchDiscardSelectedTasks(reason: string): Promise<BatchTaskActionResult> {
    const payload = buildTaskSelectionPayload()
    if (!payload) {
      throw new Error('未选择任务')
    }

    actionLoading.value = true
    try {
      const result = await apiBatchDiscardTasks({ ...payload, reason })
      clearTaskSelection()
      await loadTaskList(taskListQuery.value)
      return result
    } finally {
      actionLoading.value = false
    }
  }

  /** 批量删除当前已勾选任务。 */
  async function batchDeleteSelectedTasks(): Promise<BatchTaskActionResult> {
    const payload = buildTaskSelectionPayload()
    if (!payload) {
      throw new Error('未选择任务')
    }

    actionLoading.value = true
    try {
      const result = await apiBatchDeleteTasks(payload)
      clearTaskSelection()
      await loadTaskList(taskListQuery.value)
      return result
    } finally {
      actionLoading.value = false
    }
  }

  return {
    // 读
    taskList,
    taskTotal,
    taskLoading,
    taskListQuery,
    loadTaskList,
    currentTask,
    detailLoading,
    loadTaskDetail,
    scriptVersions,
    currentScript,
    loadScriptVersions,
    loadCurrentScript,
    traces,
    loadTraces,
    latestValidation,
    loadLatestValidation,
    validationHistory,
    loadValidationHistory,
    loadTaskDetailFull,
    // 批量勾选
    taskSelection,
    selectedTaskCount,
    clearTaskSelection,
    isTaskSelected,
    toggleTaskSelection,
    setCurrentPageTaskSelection,
    selectAllTasksByCurrentFilter,
    buildTaskSelectionPayload,
    // 写
    actionLoading,
    createTask,
    executeTask,
    updateScript,
    runValidation,
    discardTask,
    deleteDiscardedTask,
    batchDiscardSelectedTasks,
    batchDeleteSelectedTasks,
  }
})
