import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  AiScriptTask,
  AiScriptVersion,
  AiScriptValidation,
  AiScriptTrace,
} from '../api/aiScript'
import {
  fetchTaskList,
  fetchTaskDetail,
  fetchScriptVersions,
  fetchCurrentScript,
  fetchTraces,
  fetchLatestValidation,
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
    latestValidation.value = await fetchLatestValidation(scriptId)
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
        await loadLatestValidation(currentScript.value.id)
      }
    } finally {
      detailLoading.value = false
    }
  }

  return {
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
    loadTaskDetailFull,
  }
})
