import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  AiScriptTask,
  AiScriptVersion,
  AiScriptValidation,
  AiScriptTrace,
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
} from '../api/aiScript'

export const useAiScriptStore = defineStore('aiScript', () => {
  // ── 任务列表 ──
  const taskList = ref<AiScriptTask[]>([])
  const taskTotal = ref(0)
  const taskLoading = ref(false)

  async function loadTaskList(params?: {
    projectId?: number
    keyword?: string
    pageNo?: number
    pageSize?: number
  }) {
    taskLoading.value = true
    try {
      const res = await fetchTaskList(params)
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
      // 加载验证数据
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

  /** 操作进行中标志 */
  const actionLoading = ref(false)

  /** 创建任务 */
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
      // 创建成功后刷新列表
      await loadTaskList()
      return task
    } finally {
      actionLoading.value = false
    }
  }

  /** 触发执行生成 */
  async function executeTask(taskId: number): Promise<void> {
    actionLoading.value = true
    try {
      await apiExecuteTask(taskId)
      // 执行提交后刷新详情（状态变为 RUNNING）
      await loadTaskDetail(taskId)
    } finally {
      actionLoading.value = false
    }
  }

  /** 编辑脚本（生成新版本） */
  async function updateScript(
    taskId: number,
    payload: { scriptContent: string; commentText?: string },
  ): Promise<AiScriptVersion> {
    actionLoading.value = true
    try {
      const version = await apiEditScript(taskId, payload)
      // 刷新脚本相关数据
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

  /** 触发回放验证 */
  async function runValidation(taskId: number, scriptVersionId: number): Promise<void> {
    actionLoading.value = true
    try {
      await apiTriggerValidation(taskId, scriptVersionId)
      // 刷新验证与任务状态
      await Promise.all([loadLatestValidation(scriptVersionId), loadTaskDetail(taskId)])
    } finally {
      actionLoading.value = false
    }
  }

  /** 废弃任务 */
  async function discardTask(taskId: number, reason: string): Promise<void> {
    actionLoading.value = true
    try {
      await apiDiscardTask(taskId, reason)
      await loadTaskList()
    } finally {
      actionLoading.value = false
    }
  }

  return {
    // 读
    taskList,
    taskTotal,
    taskLoading,
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
    // 写
    actionLoading,
    createTask,
    executeTask,
    updateScript,
    runValidation,
    discardTask,
  }
})
