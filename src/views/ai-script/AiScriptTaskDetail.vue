<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAiScriptStore } from '../../stores/aiScript'
import type { TraceActionType } from '../../api/aiScript'
import {
  TaskStatusLabel,
  TaskStatusColor,
  TaskStatus,
  GenerationMode,
  GenerationModeLabel,
  ValidationStatusLabel,
  ValidationStatusColor,
  ScriptStatusLabel,
  ScriptStatusColor,
  SourceTypeLabel,
} from '../../api/aiScript'
import {
  confirmScript,
  discardScript,
  discardTask,
  deleteTask,
  exportScript,
  startRecording,
  finishRecording,
  failRecording,
  fetchLatestRecording,
  launchCodegen,
  pollCodegenStatus,
  getPendingScript,
  clearPendingScript,
  type RecordingSession,
} from '../../api/aiScript'
import CodeEditor from '../../components/CodeEditor.vue'

const route = useRoute()
const router = useRouter()
const store = useAiScriptStore()

const taskId = computed(() => Number(route.params.taskId))

onMounted(async () => {
  if (taskId.value) {
    await store.loadTaskDetailFull(taskId.value)
    // ??????????????????????
    if (task.value?.generationMode === GenerationMode.RECORDING_ENHANCED) {
      await loadRecording()
    }
    // #3: RUNNING ??????????
    startTaskPolling()
    startValidationPolling()
  }
})

// ── #3: 任务状态自动轮询 ──
let taskPollTimer: ReturnType<typeof setInterval> | null = null
let validationPollTimer: ReturnType<typeof setInterval> | null = null

function startTaskPolling() {
  stopTaskPolling()
  if (task.value?.taskStatus !== TaskStatus.RUNNING) return
  taskPollTimer = setInterval(async () => {
    await store.loadTaskDetailFull(taskId.value)
    // 任务结束时停止轮询
    if (task.value?.taskStatus !== TaskStatus.RUNNING) {
      stopTaskPolling()
    }
  }, 5000)
}

function stopTaskPolling() {
  if (taskPollTimer) {
    clearInterval(taskPollTimer)
    taskPollTimer = null
  }
}

function shouldPollValidation(): boolean {
  if (!script.value) return false
  return (
    validation.value?.validationStatus === 'VALIDATING' ||
    script.value.validationStatus === 'VALIDATING' ||
    task.value?.validationStatus === 'VALIDATING'
  )
}

async function refreshValidationState() {
  if (!script.value) return
  await Promise.all([
    store.loadLatestValidation(script.value.id),
    store.loadValidationHistory(script.value.id),
    store.loadCurrentScript(taskId.value),
    store.loadTaskDetail(taskId.value),
  ])
}

function startValidationPolling() {
  stopValidationPolling()
  if (!shouldPollValidation()) return

  // 验证结果由后台异步回写，这里持续轮询直到状态脱离 VALIDATING。
  validationPollTimer = setInterval(async () => {
    await refreshValidationState()
    if (!shouldPollValidation()) {
      stopValidationPolling()
    }
  }, 3000)
}

function stopValidationPolling() {
  if (validationPollTimer) {
    clearInterval(validationPollTimer)
    validationPollTimer = null
  }
}

onUnmounted(() => {
  stopTaskPolling()
  stopValidationPolling()
  if (pollTimer) clearInterval(pollTimer)
})

const task = computed(() => store.currentTask)
const script = computed(() => store.currentScript)
const traces = computed(() => store.traces)
const validation = computed(() => store.latestValidation)
const validationHistory = computed(() => store.validationHistory)

// ── 操作轨迹（录制模式下用步骤模型填充）──

/** 从 Playwright locator 字符串中提取人类可读的元素名 */
function readableFromLocator(locator: string): string {
  const m = locator.match(/getBy(?:Role|Text|Label|Placeholder|TestId|AltText|Title)\(['"]([^'"]{1,40})/)
  if (m?.[1]) return m[1]
  return locator.length > 40 ? locator.slice(0, 40) + '\u2026' : locator
}

/** 将 step_model step 转为可读的 targetSummary */
function stepSummary(s: any): string {
  const type = (s.actionType || 'CUSTOM').toUpperCase()
  if (type === 'NAVIGATE') return `导航到 ${s.pageUrl || ''}`
  if (type === 'CLICK') {
    const readable = s.locator ? readableFromLocator(s.locator) : `元素 ${s.stepNo}`
    return `点击「${readable}」`
  }
  if (type === 'INPUT') {
    const field = s.locator ? readableFromLocator(s.locator) : '输入框'
    const val = s.inputValue ? (s.inputValue.length > 20 ? s.inputValue.slice(0, 20) + '\u2026' : s.inputValue) : ''
    return val ? `在「${field}」输入 ${val}` : `在「${field}」输入`
  }
  if (type === 'KEY_PRESS') return `按键 ${s.inputValue || ''}`
  if (type === 'SELECT') return `选择「${s.inputValue || ''}」`
  if (type === 'WAIT') return '等待页面响应'
  if (type === 'ASSERT') return '断言验证'
  return s.description || `步骤 ${s.stepNo}`
}

const displayTraces = computed(() => {
  // 优先用 DB 持久化的 traces（AI 直生 & 录制增强 AI 重构完成后均有数据）
  if (traces.value.length > 0) return traces.value
  // 兜底：录制增强但 AI 还未重构完成，用 step_model_json 实时渲染
  if (isRecordingMode.value && recording.value?.stepModelJson) {
    const model = recording.value.stepModelJson as any
    const steps = model?.steps || []
    return steps.map((s: any) => ({
      id: s.stepNo,
      taskId: taskId.value,
      traceNo: s.stepNo,
      actionType: (s.actionType || 'CUSTOM').toUpperCase(),
      pageUrl: s.pageUrl || '',
      targetSummary: stepSummary(s),
      locatorUsed: s.locator || '',
      inputValueMasked: s.inputValue || '',
      occurredAt: '',
    }))
  }
  return []
})

// ── 录制状态 ──
const recording = ref<RecordingSession | null>(null)
const recordingLoading = ref(false)
const finishScriptContent = ref('')
const codegenSessionId = ref('')
const recordingStatusText = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null

async function loadRecording() {
  try {
    recording.value = (await fetchLatestRecording(taskId.value)) || null
  } catch {
    recording.value = null
  }

  // 检查是否有待提交的录制脚本（页面刷新/关闭后自动恢复）
  try {
    const pending = await getPendingScript(taskId.value)
    if (pending.found && pending.script_content) {
      finishScriptContent.value = pending.script_content
      const source = pending.source === 'disk' ? '磁盘恢复' : '内存恢复'
      const timeHint = pending.captured_at ? `（录制于 ${pending.captured_at}）` : ''
      recordingStatusText.value = `✅ 已自动恢复上次录制的脚本${timeHint}，请确认并提交 [来源: ${source}]`
      showRecordingDialog.value = true
    }
  } catch (e) {
    console.warn('检查待提交脚本失败:', e)
  }
}

async function handleStartRecording() {
  if (!task.value) return
  recordingLoading.value = true
  recordingStatusText.value = '正在检查登录状态...'
  try {
    // 1. 后端创建录制 session
    recording.value = await startRecording(taskId.value)

    // 2. 解析 accountRef 中的 auth_config（如果有）
    let authConfig: Record<string, unknown> | undefined
    try {
      if (task.value.accountRef) {
        const parsed = JSON.parse(task.value.accountRef)
        // 确认是 auth_config 格式（有 login_url 或 username 字段）
        if (parsed.login_url || parsed.username) {
          authConfig = parsed
        }
      }
    } catch {
      // accountRef 不是有效 JSON，忽略
    }

    recordingStatusText.value = '正在启动录制浏览器（如需登录将自动完成）...'

    // 3. 调 Executor 启动 playwright codegen（传递 auth_config）
    const { session_id } = await launchCodegen(
      taskId.value,
      task.value.startUrl || 'https://www.baidu.com',
      authConfig,
    )
    codegenSessionId.value = session_id
    recordingStatusText.value = '浏览器启动中，请稍候...'

    // 4. 开始轮询 codegen 状态
    startPolling(session_id)
  } catch (e) {
    console.error('启动录制失败:', e)
    await markRecordingFailed('录制浏览器启动失败，请重新发起录制')
    recordingStatusText.value = '录制启动失败，请重新发起录制'
    recordingLoading.value = false
  }
}

async function markRecordingFailed(reason: string) {
  if (!recording.value) return
  try {
    // 录制异常时主动把后端会话标记为 FAILED，避免后续重试被“已有录制中”卡住。
    await failRecording(taskId.value, {
      recordingId: recording.value.id,
      reason,
    })
  } catch (e) {
    console.warn('标记录制失败失败:', e)
  }
}

function startPolling(sessionId: string) {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(async () => {
    try {
      const result = await pollCodegenStatus(sessionId)
      if (result.status === 'logging_in') {
        recordingStatusText.value = '🔐 正在自动登录系统（识别验证码中）...'
      } else if (result.status === 'recording') {
        recordingStatusText.value = '🔴 录制中... 请在弹出的浏览器中操作，完成后关闭浏览器'
      } else if (result.status === 'completed') {
        // 脚本回收成功
        stopPolling()
        recordingLoading.value = false
        if (result.script_content) {
          finishScriptContent.value = result.script_content
          recordingStatusText.value = '✅ 录制完成！脚本已自动回收，请确认并提交'
          showRecordingDialog.value = true // 自动弹出提交弹窗
        } else {
          await markRecordingFailed('录制已结束，但未产出可提交脚本')
          recordingStatusText.value = '录制已结束，但未产出脚本，请重新发起录制'
        }
      } else if (result.status === 'error') {
        stopPolling()
        recordingLoading.value = false
        await markRecordingFailed(result.error || '录制执行失败')
        recordingStatusText.value = `录制失败: ${result.error || '请重新发起录制'}`
      } else if (result.status === 'not_found') {
        stopPolling()
        recordingLoading.value = false
        await markRecordingFailed('录制会话不存在或已过期')
        recordingStatusText.value = '录制会话不存在或已过期，请重新发起录制'
      }
    } catch (e) {
      console.error('轮询失败:', e)
    }
  }, 2000) // 每 2 秒轮询
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function handleFinishRecording() {
  if (!recording.value) return
  recordingLoading.value = true
  try {
    await finishRecording(taskId.value, {
      recordingId: recording.value.id,
      rawScriptContent: finishScriptContent.value,
      triggerAiRefactor: true,
    })
    // 提交成功后清理磁盘上的 pending 脚本
    await clearPendingScript(taskId.value)
    await store.loadTaskDetailFull(taskId.value)
    await loadRecording()
    finishScriptContent.value = ''
    recordingStatusText.value = ''
  } finally {
    recordingLoading.value = false
  }
}

/** 轨迹动作图标 */
function traceIcon(type: TraceActionType): string {
  const map: Record<string, string> = {
    NAVIGATE: 'open_in_browser',
    CLICK: 'mouse',
    INPUT: 'keyboard',
    SELECT: 'list',
    UPLOAD: 'upload_file',
    SCROLL: 'swap_vert',
    WAIT: 'hourglass_empty',
    ASSERT_CANDIDATE: 'verified',
    CUSTOM: 'extension',
  }
  return map[type] || 'radio_button_checked'
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

function goBack() {
  router.push('/ai-script')
}

// ── 操作按钮 ──

async function handleExecute() {
  if (!task.value) return
  try {
    await store.executeTask(taskId.value)
    await store.loadTaskDetailFull(taskId.value)
    // 执行后自动启动状态轮询
    startTaskPolling()
  } catch (e) {
    console.error('触发执行失败:', e)
  }
}

async function handleValidate() {
  if (!script.value) return
  try {
    await store.runValidation(taskId.value, script.value.id)
    await store.loadTaskDetailFull(taskId.value)
    // ??????????????????????????????????
    startValidationPolling()
  } catch (e) {
    console.error('?????????:', e)
  }
}
async function handleConfirm() {
  if (!script.value) return
  try {
    await confirmScript(script.value.id)
    await store.loadTaskDetailFull(taskId.value)
  } catch (e) {
    console.error('确认脚本失败:', e)
  }
}

async function handleDiscardScript() {
  if (!script.value) return
  const reason = prompt('请输入废弃原因')
  if (!reason) return
  try {
    await discardScript(script.value.id, reason)
    await store.loadTaskDetailFull(taskId.value)
  } catch (e) {
    console.error('废弃脚本失败:', e)
  }
}

// ── 废弃任务 Dialog ──
const showDetailDiscardDialog = ref(false)
const detailDiscardReason = ref('')

function handleDiscardTask() {
  detailDiscardReason.value = ''
  showDetailDiscardDialog.value = true
}

async function confirmDetailDiscard() {
  if (!detailDiscardReason.value.trim()) return
  try {
    await discardTask(taskId.value, detailDiscardReason.value.trim())
    showDetailDiscardDialog.value = false
    await store.loadTaskDetailFull(taskId.value)
  } catch (e) {
    console.error('废弃任务失败:', e)
  }
}

// ── 删除任务 Dialog ──
const showDetailDeleteDialog = ref(false)

function handleDeleteTask() {
  showDetailDeleteDialog.value = true
}

async function confirmDetailDelete() {
  try {
    await deleteTask(taskId.value)
    showDetailDeleteDialog.value = false
    router.push('/ai-script')
  } catch (e) {
    console.error('删除任务失败:', e)
  }
}

async function handleExport() {
  if (!script.value) return
  try {
    const blob = await exportScript(script.value.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${script.value.scriptName || 'script'}.spec.ts`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    console.error('导出失败:', e)
  }
}

async function handleCopyScript() {
  if (!script.value?.scriptContent) return
  try {
    await navigator.clipboard.writeText(script.value.scriptContent)
    copyTooltip.value = '已复制!'
    setTimeout(() => {
      copyTooltip.value = ''
    }, 2000)
  } catch {
    // fallback
    const ta = document.createElement('textarea')
    ta.value = script.value.scriptContent
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    copyTooltip.value = '已复制!'
    setTimeout(() => {
      copyTooltip.value = ''
    }, 2000)
  }
}
const copyTooltip = ref('')

// 原始录制稿折叠
const showRawScript = ref(false)

// ── V1 多文件查看器 ──
const activeFileIdx = ref(0)
const activeFile = computed(() => {
  const files = script.value?.files
  if (!files || files.length === 0) return null
  return files[activeFileIdx.value] || files[0]
})
function fileBasename(path: string): string {
  return path.split('/').pop() || path
}

// ── 编辑脚本 Dialog ──
const showEditDialog = ref(false)
const editContent = ref('')
const editComment = ref('')
// ── 录制提交 Dialog ──
const showRecordingDialog = ref(false)

function openEditDialog() {
  editContent.value = script.value?.scriptContent || ''
  editComment.value = ''
  showEditDialog.value = true
}

async function submitEditScript() {
  if (!editContent.value.trim()) return
  try {
    await store.updateScript(taskId.value, {
      scriptContent: editContent.value,
      commentText: editComment.value.trim() || undefined,
    })
    showEditDialog.value = false
    await store.loadTaskDetailFull(taskId.value)
  } catch (e) {
    console.error('编辑脚本失败:', e)
  }
}

async function openRecordingSubmitDialog() {
  // 如果当前没有脚本内容，尝试从 Executor 恢复
  if (!finishScriptContent.value.trim()) {
    try {
      const pending = await getPendingScript(taskId.value)
      if (pending.found && pending.script_content) {
        finishScriptContent.value = pending.script_content
      }
    } catch (e) {
      console.warn('恢复待提交脚本失败:', e)
    }
  }
  showRecordingDialog.value = true
}

async function submitRecordingScript() {
  if (!finishScriptContent.value.trim() || !recording.value) return
  await handleFinishRecording()
  showRecordingDialog.value = false
}

/** 权限计算 */
const isRecordingMode = computed(
  () => task.value?.generationMode === GenerationMode.RECORDING_ENHANCED,
)
const isAIDirectMode = computed(() => task.value?.generationMode === GenerationMode.AI_DIRECT)

const canExecute = computed(() => {
  if (task.value?.permissions) return task.value.permissions.canExecute
  const s = task.value?.taskStatus
  return s === TaskStatus.PENDING_EXECUTE || s === TaskStatus.GENERATE_FAILED
})
const canEdit = computed(() => {
  if (task.value?.permissions) return task.value.permissions.canEdit
  const s = task.value?.taskStatus
  return (
    s === TaskStatus.GENERATE_SUCCESS ||
    s === TaskStatus.PENDING_CONFIRM ||
    s === TaskStatus.PENDING_REVALIDATE
  )
})
const canValidate = computed(() => {
  if (task.value?.permissions) return task.value.permissions.canValidate
  return !!script.value && canEdit.value
})
const canConfirm = computed(() => {
  if (task.value?.permissions) return task.value.permissions.canConfirm
  return false
})
const canExport = computed(() => {
  if (task.value?.permissions) return task.value.permissions.canExport
  return !!script.value
})
const canDiscard = computed(() => {
  if (task.value?.permissions) return task.value.permissions.canDiscard
  const s = task.value?.taskStatus
  return s !== TaskStatus.DISCARDED && s !== TaskStatus.CONFIRMED
})
const canDelete = computed(() => {
  if (task.value?.permissions) return task.value.permissions.canDelete
  return task.value?.taskStatus === TaskStatus.DISCARDED
})
const isTaskActive = computed(() => {
  const s = task.value?.taskStatus
  return s !== TaskStatus.DISCARDED && s !== TaskStatus.CONFIRMED
})
</script>

<template>
  <div class="ai-page">
    <!-- 顶部操作栏 -->
    <div class="ai-page-header" style="margin-bottom: 20px">
      <div class="ai-page-header-left">
        <div class="ai-breadcrumb">
          <span style="cursor: pointer" @click="goBack">测试智编</span>
          <span class="material-symbols-outlined">chevron_right</span>
          <span style="cursor: pointer" @click="goBack">生成任务</span>
          <span class="material-symbols-outlined">chevron_right</span>
          <span class="current">验证详情</span>
        </div>
        <h1>
          {{ task?.taskName || '加载中...' }}
          <span
            v-if="task"
            class="ai-mode-tag"
            :class="isRecordingMode ? 'recording' : 'ai-direct'"
          >
            {{ GenerationModeLabel[task.generationMode] || task.generationMode }}
          </span>
        </h1>
      </div>
      <div class="ai-action-group">
        <!-- 录制增强模式：录制按钮 -->
        <template v-if="isRecordingMode && isTaskActive">
          <button
            v-if="!recording || recording.recordingStatus !== 'RECORDING'"
            class="ai-btn ai-btn-secondary"
            :disabled="recordingLoading"
            @click="handleStartRecording"
          >
            <span class="material-symbols-outlined">fiber_manual_record</span>
            开始录制
          </button>
          <button v-else class="ai-btn ai-btn-warning" @click="openRecordingSubmitDialog">
            <span class="material-symbols-outlined">stop_circle</span>
            提交录制
          </button>
        </template>
        <!-- AI 直生模式：执行按钮 -->
        <button
          v-if="isAIDirectMode"
          class="ai-btn ai-btn-ghost"
          :disabled="store.actionLoading || !canExecute"
          @click="handleExecute"
        >
          <span v-if="store.actionLoading" class="ai-spinner"></span>
          <span v-else class="material-symbols-outlined">refresh</span>
          {{ canExecute ? '触发执行' : '重新生成' }}
        </button>
        <!-- 通用操作 -->
        <button class="ai-btn ai-btn-secondary" :disabled="!canEdit" @click="openEditDialog">
          <span class="material-symbols-outlined">edit</span>
          编辑脚本
        </button>
        <button
          class="ai-btn ai-btn-primary"
          :disabled="store.actionLoading || !canValidate"
          @click="handleValidate"
        >
          <span v-if="store.actionLoading" class="ai-spinner"></span>
          <span v-else class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1">
            play_arrow
          </span>
          执行验证
        </button>
        <button v-if="canConfirm" class="ai-btn ai-btn-success" @click="handleConfirm">
          <span class="material-symbols-outlined">check_circle</span>
          确认脚本
        </button>
        <button
          v-if="canDiscard && script"
          class="ai-btn ai-btn-ghost"
          title="废弃当前脚本"
          @click="handleDiscardScript"
        >
          <span class="material-symbols-outlined">cancel</span>
        </button>
        <button v-if="canExport" class="ai-btn ai-btn-ghost" title="导出脚本" @click="handleExport">
          <span class="material-symbols-outlined">download</span>
        </button>
        <button
          v-if="canDiscard"
          class="ai-btn ai-btn-danger-ghost"
          title="废弃任务"
          @click="handleDiscardTask"
        >
          <span class="material-symbols-outlined">block</span>
        </button>
        <button
          v-if="canDelete"
          class="ai-btn ai-btn-danger-ghost"
          title="删除任务"
          @click="handleDeleteTask"
        >
          <span class="material-symbols-outlined">delete_forever</span>
        </button>
      </div>
    </div>

    <!-- 双栏布局 -->
    <div class="ai-detail-grid">
      <!-- 左: 基础信息 + 时间线 -->
      <div class="ai-detail-left">
        <!-- 任务基础信息 -->
        <section class="ai-info-card">
          <div class="ai-info-card-header">
            <span class="ai-section-title">任务基础信息</span>
            <div
              v-if="task"
              class="ai-status-badge"
              :class="TaskStatusColor[task.taskStatus]"
              style="font-size: 0.55rem"
            >
              {{ TaskStatusLabel[task.taskStatus] }}
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 14px">
            <div>
              <div class="ai-info-label">关联用例</div>
              <div class="ai-info-value">
                <span class="material-symbols-outlined" style="font-size: 16px; color: #adc6ff">
                  terminal
                </span>
                <span v-if="task">
                  {{ task.caseTags?.join(', ') || `${task.caseCount} 条用例` }}
                </span>
              </div>
            </div>
            <div>
              <div class="ai-info-label">起始地址</div>
              <div class="ai-info-url">{{ task?.startUrl || '-' }}</div>
            </div>
            <!-- 场景描述 -->
            <div v-if="task?.scenarioDesc">
              <div class="ai-info-label">场景描述</div>
              <div style="font-size: 0.8rem; color: var(--tp-gray-300); line-height: 1.6; background: rgba(255,255,255,0.02); padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); white-space: pre-wrap">
                {{ task.scenarioDesc }}
              </div>
            </div>
            <!-- 创建人/时间 -->
            <div style="display: flex; gap: 24px">
              <div>
                <div class="ai-info-label">创建人</div>
                <div class="ai-info-value">{{ task?.createdName || '-' }}</div>
              </div>
              <div>
                <div class="ai-info-label">创建时间</div>
                <div class="ai-info-value">{{ formatTime(task?.createdAt) }}</div>
              </div>
              <div v-if="task?.updatedAt">
                <div class="ai-info-label">更新时间</div>
                <div class="ai-info-value">{{ formatTime(task.updatedAt) }}</div>
              </div>
            </div>
            <!-- 失败原因 -->
            <div
              v-if="task?.taskStatus === TaskStatus.GENERATE_FAILED && task?.errorMessage"
              style="margin-top: 4px"
            >
              <div class="ai-info-label" style="color: #ff5252">失败原因</div>
              <div
                style="
                  font-size: 0.8rem;
                  color: #ff8a80;
                  background: rgba(255, 82, 82, 0.08);
                  padding: 8px 12px;
                  border-radius: 6px;
                  border: 1px solid rgba(255, 82, 82, 0.15);
                  margin-top: 4px;
                  line-height: 1.5;
                  word-break: break-all;
                "
              >
                {{ task.errorMessage }}
              </div>
            </div>
          </div>
        </section>

        <!-- 录制状态卡片（仅录制增强模式） -->
        <section v-if="isRecordingMode" class="ai-info-card">
          <span class="ai-section-title" style="margin-bottom: 12px; display: block">录制状态</span>
          <!-- 状态消息 -->
          <div
            v-if="recordingStatusText"
            class="ai-recording-status-msg"
            style="
              margin-bottom: 12px;
              padding: 10px 14px;
              border-radius: 8px;
              background: rgba(124, 77, 255, 0.08);
              border: 1px solid rgba(124, 77, 255, 0.2);
              font-size: 0.8rem;
              color: #b388ff;
              line-height: 1.5;
            "
          >
            {{ recordingStatusText }}
          </div>
          <div
            v-if="!recording && !recordingStatusText"
            style="text-align: center; padding: 20px; color: var(--tp-gray-500); font-size: 0.8rem"
          >
            <span class="material-symbols-outlined" style="font-size: 36px; opacity: 0.3">
              videocam
            </span>
            <p style="margin-top: 8px">点击上方"开始录制"按钮，系统将自动打开浏览器</p>
            <p style="font-size: 0.7rem; color: var(--tp-gray-600); margin-top: 4px">
              在弹出的浏览器中操作被测系统，关闭浏览器后脚本自动回收
            </p>
          </div>
          <div v-else-if="recording" style="display: flex; flex-direction: column; gap: 10px">
            <div style="display: flex; align-items: center; gap: 8px">
              <span
                class="ai-rec-dot"
                :class="recording.recordingStatus === 'RECORDING' ? 'active' : 'done'"
              ></span>
              <span style="font-size: 0.8rem; color: var(--tp-gray-300)">
                {{ recording.recordingStatus === 'RECORDING' ? '录制中...' : '录制已完成' }}
              </span>
            </div>
            <div style="font-size: 0.75rem; color: var(--tp-gray-500)">
              录制 ID: {{ recording.id }}
            </div>
            <div
              v-if="recording.rawScriptContent"
              style="font-size: 0.75rem; color: var(--tp-gray-500)"
            >
              脚本长度: {{ recording.rawScriptContent.length }} 字符
            </div>
          </div>
        </section>

        <!-- 操作轨迹时间线 -->
        <section class="ai-info-card" style="flex: 1; overflow-y: auto; max-height: 600px">
          <span class="ai-section-title" style="margin-bottom: 18px; display: block">
            {{ isRecordingMode ? '操作步骤 (录制解析)' : '操作轨迹 (browser-use)' }}
          </span>
          <div
            v-if="displayTraces.length === 0"
            style="text-align: center; padding: 24px; color: var(--tp-gray-500); font-size: 0.8rem"
          >
            暂无轨迹数据，请先触发执行
          </div>
          <div v-else class="ai-timeline">
            <div
              v-for="(trace, idx) in displayTraces"
              :key="trace.id || idx"
              class="ai-timeline-step"
              :class="{ active: idx === 0 }"
            >
              <div class="ai-timeline-dot"></div>
              <div class="ai-timeline-card">
                <div class="ai-timeline-meta">
                  <span class="ai-timeline-time">
                    {{ trace.occurredAt || `#${trace.traceNo}` }}
                  </span>
                  <span
                    class="material-symbols-outlined"
                    style="font-size: 16px; color: var(--tp-gray-500)"
                  >
                    {{ traceIcon(trace.actionType) }}
                  </span>
                </div>
                <p class="ai-timeline-desc">{{ trace.targetSummary }}</p>
                <!-- #11: 定位器展示 -->
                <div
                  v-if="trace.locatorUsed"
                  style="
                    margin-top: 6px;
                    padding: 4px 8px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 4px;
                    font-family: monospace;
                    font-size: 0.7rem;
                    color: #80cbc4;
                    word-break: break-all;
                  "
                >
                  <span
                    class="material-symbols-outlined"
                    style="
                      font-size: 12px;
                      vertical-align: middle;
                      margin-right: 4px;
                      color: var(--tp-gray-500);
                    "
                  >
                    code
                  </span>
                  {{ trace.locatorUsed }}
                </div>
                <!-- 输入值 -->
                <div
                  v-if="trace.inputValueMasked"
                  style="margin-top: 4px; font-size: 0.7rem; color: #ffb74d"
                >
                  输入: "{{ trace.inputValueMasked }}"
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- 右: 脚本 + 验证 -->
      <div class="ai-detail-right">
        <!-- 脚本代码预览 -->
        <section v-if="script" class="ai-code-panel">
          <div class="ai-code-header">
            <div class="ai-code-header-left">
              <span class="material-symbols-outlined">javascript</span>
              <h3>Playwright 执行脚本</h3>
            </div>
            <div class="ai-code-header-right">
              <span class="ai-code-filename">{{ script.scriptName || 'script.spec.ts' }}</span>
              <button
                class="ai-code-copy-btn"
                :title="copyTooltip || '复制代码'"
                @click="handleCopyScript"
              >
                <span class="material-symbols-outlined" style="font-size: 16px">
                  {{ copyTooltip ? 'check' : 'content_copy' }}
                </span>
                <span
                  v-if="copyTooltip"
                  style="font-size: 0.7rem; color: #69f0ae; margin-left: 4px"
                >
                  {{ copyTooltip }}
                </span>
              </button>
            </div>
          </div>
          <div class="ai-code-body">
            <CodeEditor
              :model-value="script.scriptContent"
              :readonly="true"
              min-height="200px"
              max-height="600px"
            />
          </div>
        </section>

        <!-- V1 多文件工程化面板 -->
        <section
          v-if="script?.files && script.files.length > 0"
          class="ai-info-card"
          style="margin-top: 16px"
        >
          <div class="ai-code-header" style="margin-bottom: 12px">
            <div class="ai-code-header-left">
              <span class="material-symbols-outlined">folder_open</span>
              <h3>V1 工程化文件 ({{ script.files.length }})</h3>
            </div>
            <div v-if="script.versionStatus" class="ai-code-header-right">
              <span
                class="ai-status-badge"
                :class="script.versionStatus === 'MANUAL_REVIEW_REQUIRED' ? 'warning' : 'success'"
                style="font-size: 0.6rem"
              >
                {{ script.versionStatus === 'MANUAL_REVIEW_REQUIRED' ? '需要人工审核' : '已生成' }}
              </span>
            </div>
          </div>

          <!-- 生成摘要 -->
          <div
            v-if="script.generationSummary"
            style="
              font-size: 0.78rem;
              color: var(--tp-gray-400);
              background: rgba(124, 77, 255, 0.06);
              padding: 8px 12px;
              border-radius: 6px;
              border: 1px solid rgba(124, 77, 255, 0.12);
              margin-bottom: 12px;
              line-height: 1.5;
            "
          >
            {{ script.generationSummary }}
          </div>

          <!-- 人工审核项 -->
          <div
            v-if="script.manualReviewItems && script.manualReviewItems.length > 0"
            style="
              background: rgba(255, 152, 0, 0.08);
              border: 1px solid rgba(255, 152, 0, 0.2);
              border-radius: 6px;
              padding: 10px 12px;
              margin-bottom: 12px;
            "
          >
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px">
              <span class="material-symbols-outlined" style="font-size: 16px; color: #ffb74d">
                warning
              </span>
              <span style="font-size: 0.78rem; color: #ffb74d; font-weight: 500">
                需要人工审核 ({{ script.manualReviewItems.length }})
              </span>
            </div>
            <ul style="margin: 0; padding-left: 18px">
              <li
                v-for="(item, idx) in script.manualReviewItems"
                :key="idx"
                style="font-size: 0.72rem; color: var(--tp-gray-400); line-height: 1.6"
              >
                {{ item }}
              </li>
            </ul>
          </div>

          <!-- 文件标签页 -->
          <div class="v1-file-tabs">
            <button
              v-for="(file, idx) in script.files"
              :key="file.id || idx"
              class="v1-file-tab"
              :class="{ active: activeFileIdx === idx }"
              @click="activeFileIdx = idx"
            >
              <span
                class="v1-file-type-badge"
                :class="file.fileType"
              >
                {{ file.fileType }}
              </span>
              <span class="v1-file-name">{{ fileBasename(file.relativePath) }}</span>
            </button>
          </div>

          <!-- 当前文件预览 -->
          <div v-if="activeFile" style="margin-top: 8px">
            <div
              style="
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 6px 10px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 6px 6px 0 0;
                font-family: monospace;
                font-size: 0.72rem;
                color: var(--tp-gray-400);
              "
            >
              <span>{{ activeFile.relativePath }}</span>
              <span
                class="v1-file-type-badge"
                :class="activeFile.sourceKind"
                style="font-size: 0.6rem"
              >
                {{ activeFile.sourceKind }}
              </span>
            </div>
            <CodeEditor
              :model-value="activeFile.content"
              :readonly="true"
              min-height="150px"
              max-height="500px"
            />
          </div>
        </section>

        <!-- 原始录制稿对比（录制增强模式） -->
        <section
          v-if="isRecordingMode && recording?.rawScriptContent"
          class="ai-info-card"
          style="margin-top: 16px"
        >
          <div
            style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              cursor: pointer;
            "
            @click="showRawScript = !showRawScript"
          >
            <span class="ai-section-title" style="font-size: 0.85rem">
              <span
                class="material-symbols-outlined"
                style="font-size: 16px; vertical-align: middle"
              >
                compare_arrows
              </span>
              原始录制稿
            </span>
            <span
              class="material-symbols-outlined"
              style="font-size: 18px; color: var(--tp-gray-500); transition: transform 0.2s"
              :style="{ transform: showRawScript ? 'rotate(180deg)' : '' }"
            >
              expand_more
            </span>
          </div>
          <div v-if="showRawScript" style="margin-top: 12px">
            <CodeEditor
              :model-value="recording.rawScriptContent"
              :readonly="true"
              min-height="150px"
              max-height="400px"
            />
            <div style="margin-top: 8px; font-size: 0.7rem; color: var(--tp-gray-600)">
              此为 Playwright Codegen 录制的原始代码，上方为 AI 重构后的标准化脚本
            </div>
          </div>
        </section>
        <section
          v-else
          class="ai-info-card"
          style="flex: 1; display: flex; align-items: center; justify-content: center"
        >
          <div style="text-align: center; color: var(--tp-gray-500)">
            <span class="material-symbols-outlined" style="font-size: 48px; opacity: 0.3">
              code
            </span>
            <p style="margin-top: 12px; font-size: 0.85rem">暂无脚本，请先触发执行生成</p>
          </div>
        </section>

        <!-- 验证报告 -->
        <section v-if="validation" class="ai-validation-panel">
          <div class="ai-validation-header">
            <span class="ai-section-title">验证报告</span>
            <div class="ai-validation-stats">
              <div class="ai-validation-stat">
                <span class="dot pass"></span>
                <span>通过: {{ validation.passedStepCount }}</span>
              </div>
              <div class="ai-validation-stat">
                <span class="dot fail"></span>
                <span>失败: {{ validation.totalStepCount - validation.passedStepCount }}</span>
              </div>
            </div>
          </div>

          <div class="ai-validation-body">
            <!-- 日志流 -->
            <div class="ai-log-stream">
              <div
                v-for="(log, i) in validation.logs"
                :key="i"
                class="ai-log-line"
                :class="log.level.toLowerCase()"
              >
                {{ log.message }}
              </div>
            </div>

            <!-- 失败截图 -->
            <div class="ai-fail-evidence">
              <div class="ai-fail-label">
                <span class="ai-fail-label-text">
                  <span class="material-symbols-outlined" style="font-size: 14px">warning</span>
                  最终状态截图
                </span>
                <span class="ai-fail-label-time">
                  截取于 {{ validation.screenshots?.[0]?.createdAt || '-' }}
                </span>
              </div>
              <div class="ai-fail-screenshot">
                <img
                  v-if="validation.screenshots?.length"
                  :src="validation.screenshots?.[0]?.fileUrl"
                  :alt="validation.screenshots?.[0]?.caption || '错误状态截图'"
                  style="width: 100%; border-radius: 8px; object-fit: contain; max-height: 300px; background: rgba(0,0,0,0.3)"
                />
                <div v-else class="ai-fail-screenshot-placeholder">
                  <span class="material-symbols-outlined">broken_image</span>
                  <span>无截图</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 断言标签 -->
          <div class="ai-assertion-pills">
            <span
              v-for="a in validation.assertionSummary"
              :key="a.name"
              class="ai-assertion-pill"
              :class="{ pass: a.passed, fail: !a.passed && !a.skipped, skip: a.skipped }"
            >
              <span class="material-symbols-outlined">
                {{ a.passed ? 'check' : a.skipped ? 'block' : 'close' }}
              </span>
              {{ a.name }}
            </span>
          </div>
        </section>

        <!-- #12: 验证历史列表 -->
        <section v-if="validationHistory.length > 1" class="ai-info-card" style="margin-top: 16px">
          <span class="ai-section-title" style="margin-bottom: 12px; display: block">
            <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle">
              history
            </span>
            验证历史 ({{ validationHistory.length }})
          </span>
          <div style="display: flex; flex-direction: column; gap: 8px">
            <div
              v-for="(v, idx) in validationHistory"
              :key="v.id || idx"
              style="
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 8px 12px;
                border-radius: 6px;
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.06);
              "
            >
              <div
                class="ai-status-badge"
                :class="ValidationStatusColor[v.validationStatus]"
                style="font-size: 0.65rem; min-width: 60px; text-align: center"
              >
                {{ ValidationStatusLabel[v.validationStatus] }}
              </div>
              <div style="flex: 1; font-size: 0.75rem; color: var(--tp-gray-400)">
                {{ v.startedAt }}
              </div>
              <div style="font-size: 0.7rem; color: var(--tp-gray-500)">
                {{ v.triggeredName || '-' }}
              </div>
              <div v-if="v.durationMs" style="font-size: 0.7rem; color: var(--tp-gray-600)">
                {{ (v.durationMs / 1000).toFixed(1) }}s
              </div>
              <div style="font-size: 0.7rem; color: var(--tp-gray-600)">
                通过 {{ v.passedStepCount }}/{{ v.totalStepCount }}
              </div>
            </div>
          </div>
        </section>

        <!-- 脚本版本记录 -->
        <section v-if="store.scriptVersions.length > 0" class="ai-info-card" style="margin-top: 16px">
          <span class="ai-section-title" style="margin-bottom: 12px; display: block">
            <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle">
              layers
            </span>
            版本记录 ({{ store.scriptVersions.length }})
          </span>
          <div style="display: flex; flex-direction: column; gap: 8px">
            <div
              v-for="ver in store.scriptVersions"
              :key="ver.id"
              style="
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 8px 12px;
                border-radius: 6px;
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.06);
              "
              :style="{ borderColor: ver.isCurrentFlag ? 'rgba(124,77,255,0.3)' : '' }"
            >
              <div style="font-size: 0.8rem; font-weight: 600; color: var(--tp-gray-300); min-width: 36px">
                v{{ ver.versionNo }}
              </div>
              <div
                class="ai-status-badge"
                :class="ScriptStatusColor[ver.scriptStatus]"
                style="font-size: 0.65rem; min-width: 48px; text-align: center"
              >
                {{ ScriptStatusLabel[ver.scriptStatus] }}
              </div>
              <div style="font-size: 0.7rem; color: var(--tp-gray-500)">
                {{ SourceTypeLabel[ver.sourceType] || ver.sourceType }}
              </div>
              <div style="flex: 1; font-size: 0.7rem; color: var(--tp-gray-600); text-align: right">
                {{ ver.createdName }} · {{ ver.createdAt }}
              </div>
              <span
                v-if="ver.isCurrentFlag"
                style="font-size: 0.6rem; padding: 1px 6px; border-radius: 8px; background: rgba(124,77,255,0.15); color: #b388ff"
              >
                当前
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- 编辑脚本 Dialog -->
    <div v-if="showEditDialog" class="ai-dialog-overlay" @click.self="showEditDialog = false">
      <div class="ai-dialog wide">
        <div class="ai-dialog-header">
          <h2>编辑脚本</h2>
          <button class="ai-dialog-close" @click="showEditDialog = false">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="ai-dialog-body">
          <div class="ai-form-group">
            <label class="ai-form-label">脚本内容</label>
            <CodeEditor
              v-model="editContent"
              :readonly="false"
              min-height="320px"
              max-height="500px"
            />
          </div>
          <div class="ai-form-group">
            <label class="ai-form-label">修改备注 (可选)</label>
            <input v-model="editComment" class="ai-form-input" placeholder="描述修改内容" />
          </div>
        </div>
        <div class="ai-dialog-footer">
          <button class="ai-btn ai-btn-ghost" @click="showEditDialog = false">取消</button>
          <button
            class="ai-btn ai-btn-primary"
            :disabled="store.actionLoading"
            @click="submitEditScript"
          >
            <span v-if="store.actionLoading" class="ai-spinner"></span>
            {{ store.actionLoading ? '保存中...' : '保存并生成新版本' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 提交录制脚本 Dialog -->
    <div
      v-if="showRecordingDialog"
      class="ai-dialog-overlay"
      @click.self="showRecordingDialog = false"
    >
      <div class="ai-dialog wide">
        <div class="ai-dialog-header">
          <h2>提交录制脚本</h2>
          <button class="ai-dialog-close" @click="showRecordingDialog = false">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="ai-dialog-body">
          <div class="ai-form-group">
            <label class="ai-form-label">粘贴 Playwright Codegen 录制的脚本 *</label>
            <textarea
              v-model="finishScriptContent"
              class="ai-form-textarea"
              style="
                min-height: 300px;
                font-family: 'JetBrains Mono', 'Fira Code', monospace;
                font-size: 0.8rem;
              "
              placeholder="将 npx playwright codegen 输出的 TypeScript 脚本粘贴到这里..."
            />
          </div>
          <div class="ai-form-hint" style="margin-top: -8px">
            <span class="material-symbols-outlined" style="font-size: 14px">info</span>
            提交后系统将自动调用 AI 重构为标准化脚本
          </div>
        </div>
        <div class="ai-dialog-footer">
          <button class="ai-btn ai-btn-ghost" @click="showRecordingDialog = false">取消</button>
          <button
            class="ai-btn ai-btn-primary"
            :disabled="recordingLoading || !finishScriptContent.trim()"
            @click="submitRecordingScript"
          >
            <span v-if="recordingLoading" class="ai-spinner"></span>
            {{ recordingLoading ? 'AI 重构中...' : '提交并 AI 重构' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 废弃任务 Dialog -->
    <div v-if="showDetailDiscardDialog" class="ai-dialog-overlay" @click.self="showDetailDiscardDialog = false">
      <div class="ai-dialog" style="max-width: 440px">
        <div class="ai-dialog-header">
          <h2>ℹ️ 废弃任务</h2>
          <button class="ai-dialog-close" @click="showDetailDiscardDialog = false">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="ai-dialog-body">
          <p style="font-size: 0.85rem; color: var(--tp-gray-300); margin-bottom: 12px">
            确定要废弃任务 <strong>{{ task?.taskName }}</strong> 吗？废弃后任务将不可恢复。
          </p>
          <div class="ai-form-group">
            <label class="ai-form-label">废弃原因 *</label>
            <textarea
              v-model="detailDiscardReason"
              class="ai-form-textarea"
              placeholder="请输入废弃原因..."
              rows="3"
            />
          </div>
        </div>
        <div class="ai-dialog-footer">
          <button class="ai-btn ai-btn-ghost" @click="showDetailDiscardDialog = false">取消</button>
          <button
            class="ai-btn ai-btn-danger"
            :disabled="!detailDiscardReason.trim()"
            @click="confirmDetailDiscard"
          >
            确认废弃
          </button>
        </div>
      </div>
    </div>

    <!-- 删除任务 Dialog -->
    <div v-if="showDetailDeleteDialog" class="ai-dialog-overlay" @click.self="showDetailDeleteDialog = false">
      <div class="ai-dialog" style="max-width: 440px">
        <div class="ai-dialog-header">
          <h2>⚠️ 删除任务</h2>
          <button class="ai-dialog-close" @click="showDetailDeleteDialog = false">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="ai-dialog-body">
          <p style="font-size: 0.85rem; color: #ff8a80">
            确定要彻底删除任务 <strong>{{ task?.taskName }}</strong> 吗？
          </p>
          <p style="font-size: 0.8rem; color: var(--tp-gray-500); margin-top: 8px">
            此操作将级联删除任务关联的所有脚本版本、验证记录、轨迹、证据和录制会话，<strong style="color: #ff8a80">不可恢复</strong>。
          </p>
        </div>
        <div class="ai-dialog-footer">
          <button class="ai-btn ai-btn-ghost" @click="showDetailDeleteDialog = false">取消</button>
          <button class="ai-btn ai-btn-danger" @click="confirmDetailDelete">
            确认删除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
