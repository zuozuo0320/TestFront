<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAiScriptStore } from '../../stores/aiScript'
import type { AiScriptTrace } from '../../api/aiScript'
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
  cancelCodegen,
  getPendingScript,
  clearPendingScript,
  fetchTaskDetail,
  type RecordingSession,
} from '../../api/aiScript'
import CodeEditor from '../../components/CodeEditor.vue'

const route = useRoute()
const router = useRouter()
const store = useAiScriptStore()

const taskId = computed(() => Number(route.params.taskId))

// ── Toast 提示 ──
const toastMsg = ref('')
const toastType = ref<'success' | 'error'>('success')
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(msg: string, type: 'success' | 'error' = 'success') {
  toastMsg.value = msg
  toastType.value = type
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMsg.value = ''
  }, 3000)
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '-'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return dateStr
  }
}

function cleanAnsi(text?: string) {
  if (!text) return ''
  // 清洗 ANSI 控制字符 (如 [1m, [2K, [36m 等)，防止干扰终端阅读
  const esc = String.fromCharCode(0x1b)
  return text
    .replace(new RegExp(esc + '\\[[0-9;]*[a-zA-Z]', 'g'), '')
    .replace(/\[[0-9;]*[a-zA-Z]/g, '')
}

onMounted(async () => {
  if (taskId.value) {
    await store.loadTaskDetailFull(taskId.value)
    // 录制增强模式加载录制状态
    if (task.value?.generationMode === GenerationMode.RECORDING_ENHANCED) {
      await loadRecording()
    }
    // #3: RUNNING 状态自动轮询
    startTaskPolling()
    startValidationPolling()
  }
})

// ── #3: 任务状态自动轮询 ──
let taskPollTimer: ReturnType<typeof setInterval> | null = null
let validationPollTimer: ReturnType<typeof setInterval> | null = null
let generatingMotionTimer: ReturnType<typeof setInterval> | null = null

function shouldPollTask(): boolean {
  const status = task.value?.taskStatus
  return status === TaskStatus.RUNNING || status === TaskStatus.PENDING_EXECUTE
}

function startTaskPolling() {
  stopTaskPolling()
  if (!shouldPollTask()) return
  taskPollTimer = setInterval(async () => {
    // 轻量轮询：只刷新任务元数据，不清空页面数据、不设 loading，避免页面闪动
    const fresh = await fetchTaskDetail(taskId.value)
    if (!fresh) return
    const prevStatus = task.value?.taskStatus
    store.currentTask = fresh
    // 状态从 RUNNING 变为完成态时，做一次全量刷新以加载新脚本
    if (prevStatus !== fresh.taskStatus && !shouldPollTask()) {
      stopTaskPolling()
      await store.loadTaskDetailFull(taskId.value)
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
    task.value?.latestValidationStatus === 'VALIDATING'
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
  stopGeneratingMotion()
  if (pollTimer) clearInterval(pollTimer)
})

const task = computed(() => store.currentTask)
const script = computed(() => store.currentScript)
const traces = computed(() => store.traces)
const validation = computed(() => store.latestValidation)
const validationHistory = computed(() => store.validationHistory)
const validationFailReason = computed(() => validation.value?.failReason?.trim() || '')
const validationNeedsLogin = computed(() => {
  const reason = validationFailReason.value
  return reason.includes('认证状态') || reason.includes('Token') || reason.includes('重新手动登录')
})
const generatingFrame = ref(0)

const GENERATING_STEPS = [
  { icon: 'travel_explore', label: '页面探索' },
  { icon: 'account_tree', label: '步骤编排' },
  { icon: 'data_object', label: '脚本生成' },
] as const
const GENERATING_PHASE_TEXTS = [
  '正在分析页面结构',
  '正在识别交互路径',
  '正在生成稳定定位器',
  '正在编排 Playwright 步骤',
  '正在整理工程化脚本',
] as const

// ── 操作轨迹（录制模式下用步骤模型填充）──
type RecordingStep = {
  stepNo?: number
  actionType?: string
  pageUrl?: string
  locator?: string
  inputValue?: string
  description?: string
}
type RecordingStepModel = {
  steps?: RecordingStep[]
}
type DisplayTrace = Omit<AiScriptTrace, 'actionType'> & { actionType: string }

/** 从 Playwright locator 字符串中提取人类可读的元素名 */
function readableFromLocator(locator: string): string {
  const m = locator.match(
    /getBy(?:Role|Text|Label|Placeholder|TestId|AltText|Title)\(['"]([^'"]{1,40})/,
  )
  if (m?.[1]) return m[1]
  return locator.length > 40 ? locator.slice(0, 40) + '\u2026' : locator
}

/** 将 step_model step 转为可读的 targetSummary */
function stepSummary(s: RecordingStep): string {
  const type = (s.actionType || 'CUSTOM').toUpperCase()
  if (type === 'NAVIGATE') return `导航到 ${s.pageUrl || ''}`
  if (type === 'CLICK') {
    const readable = s.locator ? readableFromLocator(s.locator) : `元素 ${s.stepNo}`
    return `点击「${readable}」`
  }
  if (type === 'INPUT') {
    const field = s.locator ? readableFromLocator(s.locator) : '输入框'
    const val = s.inputValue
      ? s.inputValue.length > 20
        ? s.inputValue.slice(0, 20) + '\u2026'
        : s.inputValue
      : ''
    return val ? `在「${field}」输入 ${val}` : `在「${field}」输入`
  }
  if (type === 'KEY_PRESS') return `按键 ${s.inputValue || ''}`
  if (type === 'SELECT') return `选择「${s.inputValue || ''}」`
  if (type === 'WAIT') return '等待页面响应'
  if (type === 'ASSERT') return '断言验证'
  return s.description || `步骤 ${s.stepNo}`
}

const displayTraces = computed<DisplayTrace[]>(() => {
  // 优先用 DB 持久化的 traces（AI 直生 & 录制增强 AI 重构完成后均有数据）
  if (traces.value.length > 0) return traces.value
  // 兜底：录制增强但 AI 还未重构完成，用 step_model_json 实时渲染
  if (isRecordingMode.value && recording.value?.stepModelJson) {
    const model = recording.value.stepModelJson as RecordingStepModel
    const steps = Array.isArray(model.steps) ? model.steps : []
    return steps.map((s, idx) => {
      const stepNo = s.stepNo ?? idx + 1
      return {
        id: stepNo,
        taskId: taskId.value,
        traceNo: stepNo,
        actionType: (s.actionType || 'CUSTOM').toUpperCase(),
        pageUrl: s.pageUrl || '',
        targetSummary: stepSummary(s),
        locatorUsed: s.locator || '',
        inputValueMasked: s.inputValue || '',
        occurredAt: '',
      }
    })
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
  } catch (e: unknown) {
    console.error('启动录制失败:', e)
    const err = e as { response?: { data?: { message?: string } }; message?: string }
    const msg = err?.response?.data?.message || err?.message || '录制浏览器启动失败'
    await markRecordingFailed(msg)
    recordingStatusText.value = `录制启动失败: ${msg}`
    showToast(`录制启动失败: ${msg}`, 'error')
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
  recording.value = {
    ...recording.value,
    recordingStatus: 'FAILED',
  }
}

async function handleRestartRecording() {
  recordingLoading.value = true
  recordingStatusText.value = '正在中断当前录制并准备重新录制...'
  try {
    stopPolling()
    if (codegenSessionId.value) {
      await cancelCodegen(codegenSessionId.value)
    }
    if (
      recording.value?.id &&
      ['RECORDING', 'FINISHED'].includes(recording.value.recordingStatus)
    ) {
      await failRecording(taskId.value, {
        recordingId: recording.value.id,
        reason: '用户放弃当前录制并重新录制',
      })
    }
    await clearPendingScript(taskId.value)
    finishScriptContent.value = ''
    codegenSessionId.value = ''
    showRecordingDialog.value = false
    await store.loadTaskDetailFull(taskId.value)
    await loadRecording()
    recording.value = null
    await handleStartRecording()
  } catch (e) {
    console.error('重新录制失败:', e)
    recordingStatusText.value = '重新录制失败，请稍后重试'
    showToast('重新录制失败，请稍后重试', 'error')
  } finally {
    recordingLoading.value = false
  }
}

function startPolling(sessionId: string) {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(async () => {
    try {
      const result = await pollCodegenStatus(sessionId)
      if (result.status === 'logging_in') {
        recordingStatusText.value = '🔐 正在自动登录系统（识别验证码中，最多 15 秒后自动跳过）...'
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
      } else if (result.status === 'cancelled') {
        stopPolling()
        recordingLoading.value = false
        recordingStatusText.value = '录制已取消，可重新发起录制'
      } else if (result.status === 'not_found') {
        stopPolling()
        recordingLoading.value = false
        await markRecordingFailed('录制会话不存在或已过期')
        recordingStatusText.value = '录制会话不存在或已过期，请重新发起录制'
      }
    } catch (e) {
      console.error('轮询失败:', e)
    }
  }, 1000) // 每 1 秒轮询，配合快速启动优化
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
    // 提交后任务进入 RUNNING（AI 重构中），启动轮询以捕获完成状态
    startTaskPolling()
  } finally {
    recordingLoading.value = false
  }
}

/** 轨迹动作图标 */
function traceIcon(type: string): string {
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
    showToast('已触发生成，请等待执行完成')
    // 执行后自动启动状态轮询
    startTaskPolling()
  } catch (e) {
    console.error('触发执行失败:', e)
    showToast('触发执行失败，请重试', 'error')
  }
}

async function handleRegenerateFromRecording() {
  if (!task.value) return
  try {
    await store.regenerateFromLatestRecording(taskId.value)
    await store.loadTaskDetailFull(taskId.value)
    showToast('已复用录制稿重新生成，请等待完成')
    startTaskPolling()
  } catch (e) {
    console.error('重新生成失败:', e)
    showToast('重新生成失败，请确认录制稿可用后重试', 'error')
  }
}

async function handleValidate() {
  if (!script.value) return
  try {
    await store.runValidation(taskId.value, script.value.id)
    await store.loadTaskDetailFull(taskId.value)
    showToast('验证已触发，正在执行回放...')
    startValidationPolling()
  } catch (e) {
    console.error('触发验证失败:', e)
    showToast('触发验证失败，请重试', 'error')
  }
}
async function handleConfirm() {
  if (!script.value) return
  try {
    await confirmScript(script.value.id)
    await store.loadTaskDetailFull(taskId.value)
    showToast('脚本已确认 ✅')
  } catch (e) {
    console.error('确认脚本失败:', e)
    showToast('确认脚本失败，请重试', 'error')
  }
}

async function handleDiscardScript() {
  if (!script.value) return
  const reason = prompt('请输入废弃原因')
  if (!reason) return
  try {
    await discardScript(script.value.id, reason)
    await store.loadTaskDetailFull(taskId.value)
    showToast('脚本版本已废弃')
  } catch (e) {
    console.error('废弃脚本失败:', e)
    showToast('废弃脚本失败，请重试', 'error')
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
    showToast('任务已废弃')
  } catch (e) {
    console.error('废弃任务失败:', e)
    showToast('废弃任务失败，请重试', 'error')
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
    showToast('任务已彻底删除')
    router.push('/ai-script')
  } catch (e) {
    console.error('删除任务失败:', e)
    showToast('删除任务失败，请重试', 'error')
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
// ── 覆盖确认 Dialog ──
const showOverwriteConfirm = ref(false)
let _overwriteResolve: ((v: boolean) => void) | null = null

function handleOverwriteConfirm() {
  showOverwriteConfirm.value = false
  _overwriteResolve?.(true)
  _overwriteResolve = null
}
function handleOverwriteCancel() {
  showOverwriteConfirm.value = false
  _overwriteResolve?.(false)
  _overwriteResolve = null
}

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
    showToast('脚本已更新，生成新版本')
  } catch (e) {
    console.error('编辑脚本失败:', e)
    showToast('编辑脚本失败，请重试', 'error')
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

  // 覆盖保护：当任务已有成功脚本时，弹出确认框防止误覆盖
  if (script.value?.scriptContent) {
    const confirmed = await new Promise<boolean>((resolve) => {
      _overwriteResolve = resolve
      showOverwriteConfirm.value = true
    })
    if (!confirmed) return
  }

  showRecordingDialog.value = false
  recording.value = {
    ...recording.value,
    recordingStatus: 'FINISHED',
  }
  try {
    await handleFinishRecording()
  } catch (e) {
    console.error('提交录制脚本失败:', e)
    showToast('提交录制脚本失败，请重试', 'error')
  }
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
const canRegenerateFromRecording = computed(() => {
  const rawScript = recording.value?.rawScriptContent?.trim()
  return (
    isRecordingMode.value &&
    task.value?.taskStatus === TaskStatus.GENERATE_FAILED &&
    recording.value?.recordingStatus === 'FINISHED' &&
    !!rawScript &&
    canExecute.value
  )
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
const isScriptConfirmed = computed(() => task.value?.taskStatus === TaskStatus.CONFIRMED)
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
const isGeneratingScript = computed(() => {
  const status = task.value?.taskStatus
  const isRunning = status === TaskStatus.RUNNING || status === TaskStatus.PENDING_EXECUTE
  if (!isRunning) return false
  if (!isRecordingMode.value) return true
  return recording.value?.recordingStatus === 'FINISHED'
})
const scriptGeneratingTitle = computed(() =>
  isRecordingMode.value ? 'AI 正在重构录制脚本' : 'AI 正在生成 Playwright 脚本',
)
const scriptGeneratingDesc = computed(() =>
  isRecordingMode.value
    ? '系统正在基于录制步骤提炼稳定定位器、断言与工程化文件，请稍候。'
    : '系统正在探索页面、识别交互路径并编排可执行脚本，请稍候。',
)
const generatingProgress = computed(() => {
  const f = generatingFrame.value
  const t = f * 0.12
  return Math.min(Math.round(95 * (1 - Math.exp(-t / 38))), 95)
})
const generatingActiveStep = computed(() => {
  const p = generatingProgress.value
  if (p < 30) return 0
  if (p < 65) return 1
  return 2
})
const generatingPhaseText = computed(() => {
  const p = generatingProgress.value
  if (p < 15) return GENERATING_PHASE_TEXTS[0]
  if (p < 30) return GENERATING_PHASE_TEXTS[1]
  if (p < 50) return GENERATING_PHASE_TEXTS[2]
  if (p < 75) return GENERATING_PHASE_TEXTS[3]
  return GENERATING_PHASE_TEXTS[4]
})
const generatingOrbScale = computed(() => 1 + Math.sin(generatingFrame.value / 3) * 0.08)
const generatingOuterRotate = computed(() => `rotate(${generatingFrame.value * 18}deg)`)
const generatingInnerRotate = computed(() => `rotate(${-generatingFrame.value * 25}deg)`)
const generatingSatelliteRotate = computed(() => `rotate(${generatingFrame.value * 32}deg)`)
const generatingSatelliteReverseRotate = computed(() => `rotate(${-generatingFrame.value * 27}deg)`)

const isGeneratingCardRendered = ref(false)
const isExploding = ref(false)
const cushioningProgress = computed(() => {
  if (isExploding.value) return 100
  return generatingProgress.value
})

function startGeneratingMotion() {
  if (generatingMotionTimer) return
  generatingFrame.value = 0
  generatingMotionTimer = setInterval(() => {
    generatingFrame.value += 1
  }, 120)
}

function stopGeneratingMotion() {
  if (generatingMotionTimer) {
    clearInterval(generatingMotionTimer)
    generatingMotionTimer = null
  }
}

watch(
  isGeneratingScript,
  (generating) => {
    if (generating) {
      isGeneratingCardRendered.value = true
      isExploding.value = false
      startGeneratingMotion()
      return
    }
    stopGeneratingMotion()

    // 触发成功时的编译终态爆裂庆祝
    if (task.value?.taskStatus === TaskStatus.GENERATE_SUCCESS) {
      isExploding.value = true
      setTimeout(() => {
        isGeneratingCardRendered.value = false
        isExploding.value = false
      }, 1400)
    } else {
      isGeneratingCardRendered.value = false
    }
  },
  { immediate: true },
)

const isValidationRunning = computed(() => {
  if (!script.value) return false
  return (
    validation.value?.validationStatus === 'VALIDATING' ||
    script.value.validationStatus === 'VALIDATING' ||
    task.value?.latestValidationStatus === 'VALIDATING'
  )
})

const runningElapsedSeconds = ref(0)
let elapsedTimer: ReturnType<typeof setInterval> | null = null

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

watch(
  isValidationRunning,
  (running) => {
    if (running) {
      runningElapsedSeconds.value = 0
      elapsedTimer = setInterval(() => {
        runningElapsedSeconds.value += 1
      }, 1000)
    } else {
      if (elapsedTimer) {
        clearInterval(elapsedTimer)
        elapsedTimer = null
      }
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="ai-page ai-task-detail-page">
    <!-- 顶部操作栏 -->
    <div class="ai-page-header ai-task-detail-header">
      <div class="ai-detail-header-left">
        <button
          class="ai-detail-back-icon"
          type="button"
          aria-label="返回智能任务列表"
          @click="goBack"
        >
          <span class="material-symbols-outlined">arrow_back</span>
        </button>
        <div class="ai-detail-title-block">
          <div class="ai-detail-title-row">
            <h1>{{ task?.taskName || '加载中...' }}</h1>
            <span
              v-if="task"
              class="ai-mode-tag"
              :class="isRecordingMode ? 'recording' : 'ai-direct'"
            >
              {{ GenerationModeLabel[task.generationMode] || task.generationMode }}
            </span>
          </div>
          <div class="ai-detail-subtitle">智能任务详情</div>
        </div>
      </div>
      <div class="ai-task-detail-actions">
        <div class="ai-detail-action-group ai-detail-action-group--primary">
          <template v-if="isRecordingMode && isTaskActive">
            <button
              v-if="canRegenerateFromRecording"
              class="ai-btn ai-btn-primary"
              :disabled="store.actionLoading"
              @click="handleRegenerateFromRecording"
            >
              <span v-if="store.actionLoading" class="ai-spinner"></span>
              <span v-else class="material-symbols-outlined">refresh</span>
              重新生成
            </button>
            <button
              v-if="!recording || recording.recordingStatus !== 'RECORDING'"
              class="ai-btn ai-btn-secondary"
              :disabled="recordingLoading || store.actionLoading"
              @click="handleStartRecording"
            >
              <span class="material-symbols-outlined">fiber_manual_record</span>
              {{
                recording?.recordingStatus === 'FINISHED' || recording?.recordingStatus === 'FAILED'
                  ? '重新录制'
                  : '开始录制'
              }}
            </button>
            <button v-else class="ai-btn ai-btn-warning" @click="openRecordingSubmitDialog">
              <span class="material-symbols-outlined">stop_circle</span>
              提交录制
            </button>
            <button
              v-if="recording?.recordingStatus === 'RECORDING'"
              class="ai-btn ai-btn-danger-ghost"
              :disabled="recordingLoading"
              @click="handleRestartRecording"
            >
              <span v-if="recordingLoading" class="ai-spinner"></span>
              <span v-else class="material-symbols-outlined">restart_alt</span>
              放弃并重录
            </button>
          </template>
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
          <button
            class="ai-btn ai-btn-primary"
            :disabled="store.actionLoading || !canValidate"
            @click="handleValidate"
          >
            <span v-if="store.actionLoading" class="ai-spinner"></span>
            <span
              v-else
              class="material-symbols-outlined"
              style="font-variation-settings: 'FILL' 1"
            >
              play_arrow
            </span>
            执行验证
          </button>
          <button
            v-if="canConfirm || isScriptConfirmed"
            class="ai-btn ai-btn-success"
            :disabled="isScriptConfirmed"
            @click="handleConfirm"
          >
            <span class="material-symbols-outlined">check_circle</span>
            {{ isScriptConfirmed ? '脚本已确认' : '确认脚本' }}
          </button>
        </div>
        <div class="ai-detail-action-group ai-detail-action-group--secondary">
          <button class="ai-btn ai-btn-secondary" :disabled="!canEdit" @click="openEditDialog">
            <span class="material-symbols-outlined">edit</span>
            编辑脚本
          </button>
          <button
            v-if="canExport"
            class="ai-btn ai-btn-ghost ai-btn-icon"
            title="导出脚本"
            @click="handleExport"
          >
            <span class="material-symbols-outlined">download</span>
          </button>
          <button
            v-if="canDiscard && script"
            class="ai-btn ai-btn-ghost ai-btn-icon"
            title="废弃当前脚本"
            @click="handleDiscardScript"
          >
            <span class="material-symbols-outlined">cancel</span>
          </button>
        </div>
        <div
          v-if="canDiscard || canDelete"
          class="ai-detail-action-group ai-detail-action-group--danger"
        >
          <button
            v-if="canDiscard"
            class="ai-btn ai-btn-danger-ghost ai-btn-icon"
            title="废弃任务"
            @click="handleDiscardTask"
          >
            <span class="material-symbols-outlined">block</span>
          </button>
          <button
            v-if="canDelete"
            class="ai-btn ai-btn-danger-ghost ai-btn-icon"
            title="删除任务"
            @click="handleDeleteTask"
          >
            <span class="material-symbols-outlined">delete_forever</span>
          </button>
        </div>
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
            <div v-if="task" class="ai-status-badge" :class="TaskStatusColor[task.taskStatus]">
              {{ TaskStatusLabel[task.taskStatus] }}
            </div>
          </div>
          <div class="ai-task-meta-list">
            <div class="ai-task-summary-card">
              <div class="ai-task-summary-main">
                <span class="material-symbols-outlined ai-task-summary-icon">automation</span>
                <div>
                  <div class="ai-task-summary-title">{{ task?.taskName || '加载中...' }}</div>
                  <div class="ai-task-summary-desc">
                    {{
                      task ? GenerationModeLabel[task.generationMode] || task.generationMode : '-'
                    }}
                  </div>
                </div>
              </div>
              <div class="ai-task-summary-metrics">
                <div>
                  <span>关联用例</span>
                  <strong v-if="task">
                    {{ task.caseTags?.join(', ') || `${task.caseCount} 条` }}
                  </strong>
                </div>
                <div>
                  <span>脚本状态</span>
                  <strong>{{ script ? ScriptStatusLabel[script.scriptStatus] : '未生成' }}</strong>
                </div>
              </div>
            </div>
            <div v-if="task?.startUrl">
              <div class="ai-info-label">起始地址</div>
              <div class="ai-info-url">{{ task.startUrl }}</div>
            </div>
            <!-- 场景描述 -->
            <div v-if="task?.scenarioDesc">
              <div class="ai-info-label">场景描述</div>
              <div class="ai-task-scenario">
                {{ task.scenarioDesc }}
              </div>
            </div>
            <!-- 创建人/时间 -->
            <div class="ai-task-time-grid">
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
              class="ai-task-error-block"
            >
              <div class="ai-info-label ai-task-error-label">失败原因</div>
              <div class="ai-task-error-message">
                {{ task.errorMessage }}
              </div>
            </div>
          </div>
        </section>

        <!-- 录制状态卡片（仅录制增强模式） -->
        <section v-if="isRecordingMode" class="ai-info-card">
          <span class="ai-section-title ai-card-section-title">录制状态</span>
          <!-- 状态消息 -->
          <div v-if="recordingStatusText" class="ai-recording-status-msg">
            {{ recordingStatusText }}
          </div>
          <div v-if="!recording && !recordingStatusText" class="ai-recording-empty">
            <span class="material-symbols-outlined">videocam</span>
            <p>点击上方"开始录制"按钮，系统将自动打开浏览器</p>
            <p>在弹出的浏览器中操作被测系统，关闭浏览器后脚本自动回收</p>
          </div>
          <div v-else-if="recording" class="ai-recording-summary">
            <div class="ai-recording-state-line">
              <span
                class="ai-rec-dot"
                :class="recording.recordingStatus === 'RECORDING' ? 'active' : 'done'"
              ></span>
              <span>
                {{ recording.recordingStatus === 'RECORDING' ? '录制中...' : '录制已完成' }}
              </span>
            </div>
            <div class="ai-recording-meta">录制 ID: {{ recording.id }}</div>
            <div v-if="recording.rawScriptContent" class="ai-recording-meta">
              脚本长度: {{ recording.rawScriptContent.length }} 字符
            </div>
          </div>
        </section>

        <!-- 操作轨迹时间线 -->
        <section class="ai-info-card ai-trace-card">
          <span class="ai-section-title ai-card-section-title">
            {{ isRecordingMode ? '操作步骤 (录制解析)' : '操作轨迹 (browser-use)' }}
          </span>
          <div v-if="displayTraces.length === 0" class="ai-trace-empty">
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
                  <span class="material-symbols-outlined">
                    {{ traceIcon(trace.actionType) }}
                  </span>
                </div>
                <p class="ai-timeline-desc">{{ trace.targetSummary }}</p>
                <!-- #11: 定位器展示 -->
                <div v-if="trace.locatorUsed" class="ai-trace-code">
                  <span class="material-symbols-outlined">code</span>
                  {{ trace.locatorUsed }}
                </div>
                <!-- 输入值 -->
                <div v-if="trace.inputValueMasked" class="ai-trace-input">
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
        <section v-if="script && !isGeneratingScript" class="ai-code-panel">
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
              min-height="320px"
              max-height="320px"
            />
          </div>
        </section>
        <section
          v-else-if="isGeneratingCardRendered"
          class="ai-info-card ai-script-generating-card"
          :class="{ 'is-exploding': isExploding }"
          aria-live="polite"
        >
          <!-- 编译完成时的爆裂冲击波 -->
          <div v-if="isExploding" class="ai-shockwave" aria-hidden="true"></div>

          <div class="ai-generating-visual" aria-hidden="true">
            <span
              class="ai-generating-orb"
              :style="{ transform: `scale(${generatingOrbScale})` }"
            ></span>
            <span
              class="ai-generating-ring ai-generating-ring--outer"
              :style="{ transform: generatingOuterRotate }"
            ></span>
            <span
              class="ai-generating-ring ai-generating-ring--inner"
              :style="{ transform: generatingInnerRotate }"
            ></span>
            <span
              class="ai-generating-satellite ai-generating-satellite--one"
              :style="{ transform: generatingSatelliteRotate }"
            ></span>
            <span
              class="ai-generating-satellite ai-generating-satellite--two"
              :style="{ transform: generatingSatelliteReverseRotate }"
            ></span>
            <span
              class="ai-generating-satellite ai-generating-satellite--three"
              :style="{ transform: generatingInnerRotate }"
            ></span>
          </div>

          <!-- SVG 极简光流桥接线 -->
          <div class="ai-fiber-connector-container" aria-hidden="true">
            <svg viewBox="0 0 120 40" class="ai-fiber-svg" fill="none">
              <path d="M 0 20 Q 30 10, 60 20 T 120 20" class="ai-fiber-pipe" />
              <path d="M 0 20 Q 30 10, 60 20 T 120 20" class="ai-fiber-pulse-stroke" />
            </svg>
            <div class="ai-fiber-photon"></div>
          </div>

          <div class="ai-generating-content">
            <span class="ai-generating-kicker">SCRIPT GENERATION</span>
            <h3>{{ scriptGeneratingTitle }}</h3>
            <p>{{ scriptGeneratingDesc }}</p>
            <div class="ai-generating-progress-meta">
              <span class="ai-loading-dots-container">
                {{ generatingPhaseText }}
                <span class="ai-loading-dot dot-1">.</span>
                <span class="ai-loading-dot dot-2">.</span>
                <span class="ai-loading-dot dot-3">.</span>
              </span>
              <strong>{{ cushioningProgress }}%</strong>
            </div>
            <div class="ai-generating-progress">
              <span :style="{ width: `${cushioningProgress}%` }"></span>
            </div>
            <div class="ai-generating-steps">
              <span
                v-for="(step, index) in GENERATING_STEPS"
                :key="step.label"
                :class="{
                  active: index === generatingActiveStep,
                  completed: index < generatingActiveStep,
                }"
              >
                <i class="material-symbols-outlined">
                  {{ index < generatingActiveStep ? 'check_circle' : step.icon }}
                </i>
                {{ step.label }}
              </span>
            </div>
          </div>
        </section>
        <section v-else class="ai-info-card ai-script-empty-card">
          <div class="ai-script-empty">
            <span class="material-symbols-outlined">code</span>
            <h3>暂无可预览脚本</h3>
            <p>
              {{
                isRecordingMode
                  ? '请先开始录制并提交录制稿，系统会自动重构生成脚本'
                  : '请先触发执行，系统会自动探索页面并生成 Playwright 脚本'
              }}
            </p>
          </div>
        </section>

        <!-- V1 多文件工程化面板 -->
        <section
          v-if="!isGeneratingScript && script?.files && script.files.length > 0"
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
              <span class="v1-file-type-badge" :class="file.fileType">
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

          <div
            v-if="validationFailReason"
            class="ai-validation-alert"
            :class="{ 'ai-validation-alert--auth': validationNeedsLogin }"
          >
            <span class="material-symbols-outlined">
              {{ validationNeedsLogin ? 'key' : 'error' }}
            </span>
            <div>
              <strong>{{ validationNeedsLogin ? '认证状态需要重新登录' : '验证失败原因' }}</strong>
              <p>{{ validationFailReason }}</p>
            </div>
          </div>

          <!-- 运行中仿真舱 -->
          <div v-if="isValidationRunning" class="ai-validation-body ai-replay-running-body">
            <!-- 终端仿真器 -->
            <div class="ai-replay-simulator-terminal">
              <div class="terminal-header">
                <span class="terminal-dot red"></span>
                <span class="terminal-dot yellow"></span>
                <span class="terminal-dot green"></span>
                <span class="terminal-title">PLAYWRIGHT ENGINE TERMINAL</span>
              </div>
              <div class="terminal-logs">
                <div class="log-row">
                  <span class="log-time">[00:01]</span>
                  <span class="log-tag system">SYSTEM</span>
                  <span class="log-text">Initializing headless Chromium instance...</span>
                </div>
                <div v-if="runningElapsedSeconds > 2" class="log-row">
                  <span class="log-time">[00:03]</span>
                  <span class="log-tag browser">BROWSER</span>
                  <span class="log-text">Loading session cookies and context...</span>
                </div>
                <div v-if="runningElapsedSeconds > 5" class="log-row">
                  <span class="log-time">[00:06]</span>
                  <span class="log-tag replay">REPLAY</span>
                  <span class="log-text">Replaying steps and interaction actions...</span>
                </div>
                <div v-if="runningElapsedSeconds > 8" class="log-row">
                  <span class="log-time">[00:09]</span>
                  <span class="log-tag assert">ASSERT</span>
                  <span class="log-text">Validating structural element locators...</span>
                </div>
                <div v-if="runningElapsedSeconds > 11" class="log-row current-row">
                  <span class="log-time">[{{ formatElapsed(runningElapsedSeconds) }}]</span>
                  <span class="log-tag stream">STREAM</span>
                  <span class="log-text">
                    Replay active, compiling validation report
                    <span class="dots-blink">...</span>
                  </span>
                </div>
              </div>
            </div>

            <!-- 取景器 HUD 仿真 -->
            <div class="ai-replay-simulator-viewport">
              <div class="viewport-hud-corners">
                <span class="hud-corner top-left"></span>
                <span class="hud-corner top-right"></span>
                <span class="hud-corner bottom-left"></span>
                <span class="hud-corner bottom-right"></span>
              </div>
              <div class="viewport-hud-grid"></div>
              <div class="viewport-laser-line"></div>

              <!-- 仿真浏览器主体 -->
              <div class="mock-browser">
                <!-- 浏览器标题栏与控制纽 -->
                <div class="mock-browser-header">
                  <div class="mock-browser-dots">
                    <span class="dot red"></span>
                    <span class="dot yellow"></span>
                    <span class="dot green"></span>
                  </div>
                  <div class="mock-browser-url">
                    <span class="material-symbols-outlined secure-icon">lock</span>
                    <span class="url-text">localhost:5173/cases/review</span>
                  </div>
                </div>

                <!-- 模拟浏览器内容区 -->
                <div class="mock-browser-content">
                  <!-- 模拟侧边栏 -->
                  <div class="mock-sidebar">
                    <div class="sidebar-item active"></div>
                    <div class="sidebar-item"></div>
                    <div class="sidebar-item"></div>
                  </div>
                  <!-- 模拟主工作区（增加滚动和多步骤包裹） -->
                  <div class="mock-main-scroll-viewport">
                    <div class="mock-main">
                      <div class="mock-card bento-1">
                        <div class="skeleton-line title"></div>
                        <div class="skeleton-line text"></div>
                        <!-- Bounding Box AI 瞄准框 -->
                        <div class="ai-inspect-box"></div>
                      </div>
                      <div class="mock-card bento-2">
                        <div class="skeleton-line text-sm"></div>
                        <!-- 模拟输入闪烁光标 -->
                        <div class="mock-typing-cursor"></div>
                      </div>
                      <div class="mock-card bento-3">
                        <div class="mock-btn-target">
                          <span class="btn-glow-pulse"></span>
                          <span class="btn-text">RUN TEST</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 模拟高科技瞄准器 & 鼠标指针 -->
                  <div class="mock-target-pointer">
                    <!-- 声呐雷达定位圈 -->
                    <div class="pointer-radar">
                      <div class="radar-circle rc1"></div>
                      <div class="radar-circle rc2"></div>
                    </div>
                    <span class="material-symbols-outlined cursor-icon">navigation</span>
                  </div>
                </div>
              </div>

              <!-- HUD 状态指示层 -->
              <div class="viewport-scanner-core">
                <span class="scanner-label">
                  <span class="rec-dot"></span>
                  BROWSER PLAYBACK RUNNING
                </span>
              </div>
            </div>
          </div>

          <!-- 常规结果展示 -->
          <div v-else class="ai-validation-body">
            <!-- 日志流 -->
            <div class="ai-log-stream">
              <div
                v-for="(log, i) in validation.logs"
                :key="i"
                class="ai-log-line"
                :class="log.level.toLowerCase()"
              >
                {{ cleanAnsi(log.message) }}
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
                  截取于 {{ formatDate(validation.screenshots?.[0]?.createdAt) }}
                </span>
              </div>
              <div class="ai-fail-screenshot">
                <img
                  v-if="validation.screenshots?.length"
                  :src="validation.screenshots?.[0]?.fileUrl"
                  :alt="validation.screenshots?.[0]?.caption || '错误状态截图'"
                  style="
                    width: 100%;
                    border-radius: 8px;
                    object-fit: contain;
                    max-height: 300px;
                    background: rgba(0, 0, 0, 0.3);
                  "
                />
                <div v-else class="ai-fail-screenshot-placeholder">
                  <span class="material-symbols-outlined">broken_image</span>
                  <span>无截图</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 断言标签 -->
          <div
            v-if="!isValidationRunning && validation.assertionSummary?.length"
            class="ai-assertion-pills"
          >
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
          <div class="validation-history-scroll-container">
            <div
              v-for="(v, idx) in validationHistory"
              :key="v.id || idx"
              class="validation-history-row"
            >
              <div
                class="ai-status-badge"
                :class="ValidationStatusColor[v.validationStatus]"
                style="font-size: 0.65rem; min-width: 60px; text-align: center"
              >
                {{ ValidationStatusLabel[v.validationStatus] }}
              </div>
              <div class="history-time-col">
                {{ formatDate(v.startedAt) }}
              </div>
              <div class="history-user-col">
                <span class="material-symbols-outlined history-meta-icon">person</span>
                {{ v.triggeredName || '-' }}
              </div>
              <div v-if="v.durationMs" class="history-duration-col">
                <span class="material-symbols-outlined history-meta-icon">schedule</span>
                {{ (v.durationMs / 1000).toFixed(1) }}s
              </div>
              <div class="history-steps-col">
                <span class="material-symbols-outlined history-meta-icon">done_all</span>
                通过 {{ v.passedStepCount }}/{{ v.totalStepCount }}
              </div>
            </div>
          </div>
        </section>

        <!-- 脚本版本记录 -->
        <section
          v-if="store.scriptVersions.length > 0"
          class="ai-info-card"
          style="margin-top: 16px"
        >
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
              <div
                style="
                  font-size: 0.8rem;
                  font-weight: 600;
                  color: var(--tp-gray-300);
                  min-width: 36px;
                "
              >
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
                style="
                  font-size: 0.6rem;
                  padding: 1px 6px;
                  border-radius: 8px;
                  background: rgba(124, 77, 255, 0.15);
                  color: #b388ff;
                "
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
    <Teleport to="body">
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
            <button
              class="ai-btn ai-btn-danger-ghost"
              :disabled="recordingLoading"
              @click="handleRestartRecording"
            >
              <span v-if="recordingLoading" class="ai-spinner"></span>
              <span v-else class="material-symbols-outlined">restart_alt</span>
              放弃并重新录制
            </button>
            <button class="ai-btn ai-btn-ghost" @click="showRecordingDialog = false">
              稍后提交
            </button>
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
    </Teleport>

    <!-- 覆盖确认 Dialog -->
    <Teleport to="body">
      <div
        v-if="showOverwriteConfirm"
        class="ai-dialog-overlay"
        @click.self="handleOverwriteCancel"
      >
        <div class="ai-dialog" style="max-width: 460px">
          <div class="ai-dialog-header">
            <h2>⚠️ 覆盖确认</h2>
            <button class="ai-dialog-close" @click="handleOverwriteCancel">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="ai-dialog-body">
            <p style="font-size: 0.85rem; color: var(--tp-text-secondary); margin-bottom: 8px">
              当前任务已有一个
              <strong style="color: var(--tp-primary)">已生成的脚本</strong>
              ，提交新录制将触发 AI 重新重构，
              <strong>原脚本会被新版本替代</strong>
              。
            </p>
            <p style="font-size: 0.8rem; color: var(--tp-text-muted)">
              确定要用本次录制覆盖现有脚本吗？
            </p>
          </div>
          <div class="ai-dialog-footer">
            <button class="ai-btn ai-btn-ghost" @click="handleOverwriteCancel">取消</button>
            <button class="ai-btn ai-btn-warning" @click="handleOverwriteConfirm">
              <span class="material-symbols-outlined">warning</span>
              确认覆盖
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 废弃任务 Dialog -->
    <Teleport to="body">
      <div
        v-if="showDetailDiscardDialog"
        class="ai-dialog-overlay"
        @click.self="showDetailDiscardDialog = false"
      >
        <div class="ai-dialog" style="max-width: 440px">
          <div class="ai-dialog-header">
            <h2>ℹ️ 废弃任务</h2>
            <button class="ai-dialog-close" @click="showDetailDiscardDialog = false">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="ai-dialog-body">
            <p style="font-size: 0.85rem; color: var(--tp-gray-300); margin-bottom: 12px">
              确定要废弃任务
              <strong>{{ task?.taskName }}</strong>
              吗？废弃后任务将不可恢复。
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
            <button class="ai-btn ai-btn-ghost" @click="showDetailDiscardDialog = false">
              取消
            </button>
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
    </Teleport>

    <!-- 删除任务 Dialog -->
    <Teleport to="body">
      <div
        v-if="showDetailDeleteDialog"
        class="ai-dialog-overlay"
        @click.self="showDetailDeleteDialog = false"
      >
        <div class="ai-dialog" style="max-width: 440px">
          <div class="ai-dialog-header">
            <h2>⚠️ 删除任务</h2>
            <button class="ai-dialog-close" @click="showDetailDeleteDialog = false">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="ai-dialog-body">
            <p style="font-size: 0.85rem; color: #ff8a80">
              确定要彻底删除任务
              <strong>{{ task?.taskName }}</strong>
              吗？
            </p>
            <p style="font-size: 0.8rem; color: var(--tp-gray-500); margin-top: 8px">
              此操作将级联删除任务关联的所有脚本版本、验证记录、轨迹、证据和录制会话，
              <strong style="color: #ff8a80">不可恢复</strong>
              。
            </p>
          </div>
          <div class="ai-dialog-footer">
            <button class="ai-btn ai-btn-ghost" @click="showDetailDeleteDialog = false">
              取消
            </button>
            <button class="ai-btn ai-btn-danger" @click="confirmDetailDelete">确认删除</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Toast 提示 -->
    <Transition name="detail-toast">
      <div v-if="toastMsg" class="detail-toast" :class="toastType">
        <span class="material-symbols-outlined" style="font-size: 16px">
          {{ toastType === 'success' ? 'check_circle' : 'error' }}
        </span>
        {{ toastMsg }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.detail-toast {
  position: fixed;
  top: 80px; /* 避开最顶部全局导航，完美悬浮于右上角内容侧方 */
  right: 24px;
  z-index: 9999;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 0.82rem;
  font-weight: 500;
  box-shadow:
    0 10px 30px rgba(139, 92, 246, 0.08),
    0 1px 3px rgba(0, 0, 0, 0.02);
  backdrop-filter: blur(12px);
  max-width: 400px;
  white-space: nowrap;
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.detail-toast.success {
  background: rgba(240, 253, 244, 0.96);
  border: 1px solid rgba(34, 197, 94, 0.22);
  color: #16a34a;
}
.detail-toast.error {
  background: rgba(254, 242, 242, 0.96);
  border: 1px solid rgba(239, 68, 68, 0.22);
  color: #dc2626;
}

/* 在黑曜深色主题下，回归暗黑深空底色，避免刺眼 */
:global(html[data-theme='genart']) .detail-toast {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45) !important;
}
:global(html[data-theme='genart']) .detail-toast.success {
  background: rgba(30, 46, 30, 0.95) !important;
  border: 1px solid rgba(76, 175, 80, 0.3) !important;
  color: #81c784 !important;
}
:global(html[data-theme='genart']) .detail-toast.error {
  background: rgba(46, 30, 30, 0.95) !important;
  border: 1px solid rgba(255, 138, 128, 0.3) !important;
  color: #ff8a80 !important;
}

.detail-toast-enter-active {
  animation: detail-toast-in 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.detail-toast-leave-active {
  animation: detail-toast-in 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) reverse;
}
@keyframes detail-toast-in {
  from {
    opacity: 0;
    transform: translateX(35px); /* 从右侧柔和滑入，绝不遮挡中央 */
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>

<style>
/* ==================== Default / Light Theme Styles (默认浅色优雅白紫主题) ==================== */

/* 0. 验证历史滚动容器与行样式 (默认浅色) */
.validation-history-scroll-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
  padding-right: 6px;
}

/* 适配 Chrome/Firefox 极简滚动条 */
.validation-history-scroll-container::-webkit-scrollbar {
  width: 5px;
}
.validation-history-scroll-container::-webkit-scrollbar-track {
  background: transparent;
}
.validation-history-scroll-container::-webkit-scrollbar-thumb {
  background: rgba(139, 92, 246, 0.15);
  border-radius: 99px;
}
.validation-history-scroll-container::-webkit-scrollbar-thumb:hover {
  background: rgba(139, 92, 246, 0.3);
}

/* 验证历史行样式 (默认浅色) */
.validation-history-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 14px;
  border-radius: 8px;
  background: rgba(139, 92, 246, 0.02) !important;
  border: 1px solid rgba(139, 92, 246, 0.06) !important;
  transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.validation-history-row:hover {
  background: rgba(139, 92, 246, 0.05) !important;
  border-color: rgba(139, 92, 246, 0.22) !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.04);
}

.validation-history-row .history-time-col {
  flex: 1;
  font-size: 0.75rem;
  color: #4b5563 !important;
  font-family: var(--tp-font-mono, monospace);
  font-weight: 500;
}

.validation-history-row .history-user-col,
.validation-history-row .history-duration-col,
.validation-history-row .history-steps-col {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
  color: #6b7280 !important;
}

.validation-history-row .history-meta-icon {
  font-size: 13px !important;
  color: #9ca3af;
  vertical-align: middle;
}

/* 顶部操作区、标题与按钮高保真优化 (默认浅色) */
.ai-task-detail-page .ai-detail-back-icon {
  width: 34px !important;
  height: 34px !important;
  border-radius: 50% !important;
  background: rgba(139, 92, 246, 0.03) !important;
  border: 1px solid rgba(139, 92, 246, 0.1) !important;
  color: var(--tp-primary) !important;
  transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02) !important;
}

.ai-task-detail-page .ai-detail-back-icon:hover {
  background: var(--tp-primary) !important;
  border-color: var(--tp-primary) !important;
  color: #ffffff !important;
  transform: translateX(-2px) scale(1.04);
  box-shadow: 0 4px 10px rgba(139, 92, 246, 0.18) !important;
}

.ai-task-detail-page .ai-detail-title-block h1 {
  font-size: 1.15rem !important;
  font-weight: 700 !important;
  letter-spacing: -0.2px;
}

.ai-task-detail-page .ai-detail-subtitle {
  font-size: 0.72rem !important;
  color: var(--tp-gray-500) !important;
  margin-top: 1px;
}

.ai-task-detail-page .ai-mode-tag {
  font-size: 0.68rem !important;
  padding: 2px 8px !important;
  border-radius: 6px !important;
  font-weight: 600 !important;
}

.ai-task-detail-page .ai-mode-tag.recording {
  background: rgba(139, 92, 246, 0.08) !important;
  color: var(--tp-primary) !important;
  border: 1px solid rgba(139, 92, 246, 0.15) !important;
}

.ai-task-detail-actions .ai-btn {
  min-height: 32px !important;
  padding: 0 14px !important;
  border-radius: 8px !important;
  font-weight: 500 !important;
  transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
}

/* “重新录制” 录音室专属呼吸红圈图标 */
.ai-task-detail-actions .ai-btn-secondary {
  border: 1px solid rgba(139, 92, 246, 0.16) !important;
  background: rgba(139, 92, 246, 0.02) !important;
  color: var(--tp-primary) !important;
}

.ai-task-detail-actions .ai-btn-secondary .material-symbols-outlined {
  color: #ef4444 !important;
}

.ai-task-detail-actions .ai-btn-secondary:hover:not(:disabled) {
  background: rgba(139, 92, 246, 0.06) !important;
  border-color: rgba(139, 92, 246, 0.3) !important;
  transform: translateY(-1px);
}

/* “执行验证” 主要 CTA 彩虹渐变 */
.ai-task-detail-actions .ai-btn-primary {
  background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%) !important;
  border: none !important;
  color: #ffffff !important;
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.2) !important;
}

.ai-task-detail-actions .ai-btn-primary:hover:not(:disabled) {
  transform: translateY(-1px) scale(1.02);
  box-shadow: 0 6px 16px rgba(236, 72, 153, 0.25) !important;
}

/* “确认脚本” 成功翡翠绿色 */
.ai-task-detail-actions .ai-btn-success {
  background: rgba(16, 185, 129, 0.05) !important;
  border: 1px solid rgba(16, 185, 129, 0.22) !important;
  color: #059669 !important;
}

.ai-task-detail-actions .ai-btn-success:hover:not(:disabled) {
  background: #10b981 !important;
  border-color: #10b981 !important;
  color: #ffffff !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15) !important;
}

/* 纯图标功能键：优雅小圆镜，支持缩放 */
.ai-task-detail-page .ai-detail-action-group .ai-btn-icon {
  width: 32px !important;
  height: 32px !important;
  min-width: 32px !important;
  border-radius: 50% !important;
  border: 1px solid rgba(139, 92, 246, 0.1) !important;
  background: rgba(139, 92, 246, 0.02) !important;
  color: var(--tp-text-secondary) !important;
}

.ai-task-detail-page .ai-detail-action-group .ai-btn-icon:hover:not(:disabled) {
  background: rgba(139, 92, 246, 0.08) !important;
  border-color: var(--tp-primary) !important;
  color: var(--tp-primary) !important;
  transform: scale(1.05);
}

/* 危险操作键 (废弃、删除等) */
.ai-task-detail-page .ai-detail-action-group--danger .ai-btn-icon {
  border-color: rgba(239, 68, 68, 0.12) !important;
  background: rgba(239, 68, 68, 0.01) !important;
  color: #ef4444 !important;
}

.ai-task-detail-page .ai-detail-action-group--danger .ai-btn-icon:hover:not(:disabled) {
  background: #ef4444 !important;
  border-color: #ef4444 !important;
  color: #ffffff !important;
  box-shadow: 0 4px 10px rgba(239, 68, 68, 0.18) !important;
}

/* 起始地址一键复制卡片样式 (默认浅色) */
.ai-task-detail-page .ai-info-url {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  cursor: pointer !important;
  background: rgba(139, 92, 246, 0.02) !important;
  border: 1px solid rgba(139, 92, 246, 0.08) !important;
  color: var(--tp-primary) !important;
  font-family: var(--tp-font-mono, monospace) !important;
  font-weight: 500 !important;
  padding: 8px 12px !important;
  border-radius: 8px !important;
  font-size: 11px !important;
  line-height: 17px !important;
  transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
}

.ai-task-detail-page .ai-info-url:hover {
  background: rgba(139, 92, 246, 0.06) !important;
  border-color: rgba(139, 92, 246, 0.22) !important;
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.04) !important;
  transform: translateY(-0.5px);
}

.ai-task-detail-page .ai-info-url .url-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 8px;
}

.ai-task-detail-page .ai-info-url .copy-icon {
  font-size: 13px !important;
  color: rgba(139, 92, 246, 0.4) !important;
  transition: color 0.2s !important;
}

.ai-task-detail-page .ai-info-url:hover .copy-icon {
  color: var(--tp-primary) !important;
}

/* 小标题样式微调 (默认浅色) */
.ai-task-detail-page .ai-info-label {
  font-size: 10px !important;
  text-transform: uppercase !important;
  letter-spacing: 0.5px !important;
  font-weight: 600 !important;
  margin-bottom: 5px !important;
  color: var(--tp-text-subtle) !important;
}

/* 1. 仿真终端外壳 (默认浅色) */
.ai-replay-simulator-terminal {
  background: rgba(246, 245, 252, 0.85) !important;
  border: 1px solid rgba(139, 92, 246, 0.16) !important;
  box-shadow: inset 0 2px 6px rgba(139, 92, 246, 0.05) !important;
}

/* 终端头部 (默认浅色) */
.ai-replay-simulator-terminal .terminal-header {
  background: rgba(236, 235, 245, 0.9) !important;
  border-bottom: 1px solid rgba(139, 92, 246, 0.12) !important;
}

/* 终端标题 (默认浅色) */
.ai-replay-simulator-terminal .terminal-title {
  color: #4b5563 !important;
}

/* 日志文本行 (默认浅色) */
.ai-replay-simulator-terminal .log-row {
  color: #1f2937 !important;
}

/* 浅色日志行高亮 */
.ai-replay-simulator-terminal .log-row.current-row {
  color: var(--tp-primary) !important;
  font-weight: 700 !important;
}

.ai-replay-simulator-terminal .log-row.current-row .log-text {
  color: var(--tp-primary) !important;
}

/* 日志标签适配 (默认浅色) */
.ai-replay-simulator-terminal .log-tag.system {
  background: rgba(59, 130, 246, 0.08) !important;
  color: #2563eb !important;
}
.ai-replay-simulator-terminal .log-tag.browser {
  background: rgba(139, 92, 246, 0.08) !important;
  color: #7c3aed !important;
}
.ai-replay-simulator-terminal .log-tag.replay {
  background: rgba(16, 185, 129, 0.08) !important;
  color: #059669 !important;
}
.ai-replay-simulator-terminal .log-tag.assert {
  background: rgba(245, 158, 11, 0.08) !important;
  color: #d97706 !important;
}
.ai-replay-simulator-terminal .log-tag.stream {
  background: rgba(236, 72, 153, 0.08) !important;
  color: #db2777 !important;
}

/* 2. 仿真取景器 HUD (默认浅色) */
.ai-replay-simulator-viewport {
  position: relative;
  background: linear-gradient(135deg, #f4f1fe 0%, #fbf9ff 100%) !important;
  border: 1px solid rgba(139, 92, 246, 0.15) !important;
  border-radius: var(--tp-radius-lg);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 250px;
  box-shadow: inset 0 0 35px rgba(139, 92, 246, 0.05) !important;
}

/* CRT 扫描线 (默认浅色) */
.ai-replay-simulator-viewport::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(rgba(139, 92, 246, 0) 50%, rgba(139, 92, 246, 0.03) 50%);
  background-size: 100% 4px;
  pointer-events: none;
  z-index: 2;
  opacity: 0.35;
}

/* Vignette 镜头暗角 (默认浅色) */
.ai-replay-simulator-viewport::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 50%, transparent 60%, rgba(139, 92, 246, 0.06) 100%);
  pointer-events: none;
  z-index: 2;
}

/* 浅色网格 */
.ai-replay-simulator-viewport .viewport-hud-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(90deg, rgba(139, 92, 246, 0.04) 1px, transparent 1px),
    linear-gradient(180deg, rgba(139, 92, 246, 0.04) 1px, transparent 1px) !important;
  background-size: 20px 20px;
  opacity: 0.85;
  z-index: 1;
}

/* 仿真浏览器容器 (默认浅白玻璃) */
.ai-replay-simulator-viewport .mock-browser {
  width: 82%;
  height: 175px;
  background: rgba(255, 255, 255, 0.88) !important;
  border: 1.5px solid rgba(139, 92, 246, 0.2) !important;
  border-radius: 12px;
  box-shadow:
    0 12px 30px rgba(139, 92, 246, 0.08),
    0 0 15px rgba(139, 92, 246, 0.03) !important;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 2;
  position: relative;
  backdrop-filter: blur(8px);
  animation: mock-browser-flicker 16s ease-in-out infinite !important;
}

/* 模拟浏览器头部 (默认浅色) */
.ai-replay-simulator-viewport .mock-browser-header {
  height: 32px;
  background: rgba(243, 244, 248, 0.95) !important;
  border-bottom: 1px solid rgba(139, 92, 246, 0.12) !important;
  display: flex;
  align-items: center;
  padding: 0 var(--tp-space-3);
  gap: var(--tp-space-4);
  flex-shrink: 0;
}

/* 模拟三个控制小圆点 */
.ai-replay-simulator-viewport .mock-browser-dots {
  display: flex;
  gap: 6px;
}

.ai-replay-simulator-viewport .mock-browser-dots .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.ai-replay-simulator-viewport .mock-browser-dots .dot.red {
  background: #ff5f56;
}
.ai-replay-simulator-viewport .mock-browser-dots .dot.yellow {
  background: #ffbd2e;
}
.ai-replay-simulator-viewport .mock-browser-dots .dot.green {
  background: #27c93f;
}

/* 模拟 URL 输入框 (默认浅色) */
.ai-replay-simulator-viewport .mock-browser-url {
  flex-grow: 1;
  max-width: 240px;
  height: 20px;
  background: #ffffff !important;
  border: 1px solid rgba(139, 92, 246, 0.18) !important;
  border-radius: 4px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  gap: 4px;
  color: #4b5563 !important;
  transition: all 0.4s ease;
  animation: mock-url-focus 16s infinite !important;
}

.ai-replay-simulator-viewport .mock-browser-url .secure-icon {
  font-size: 11px;
  color: #10b981;
}

.ai-replay-simulator-viewport .mock-browser-url .url-text {
  font-size: 10px;
  font-family: var(--tp-font-mono, monospace);
  letter-spacing: 0.2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 模拟页面内容 */
.ai-replay-simulator-viewport .mock-browser-content {
  flex-grow: 1;
  display: flex;
  position: relative;
  background: #ffffff !important;
}

/* 模拟侧边栏 (默认浅色) */
.ai-replay-simulator-viewport .mock-sidebar {
  width: 40px;
  border-right: 1px solid rgba(139, 92, 246, 0.08) !important;
  background: rgba(245, 243, 255, 0.5) !important;
  display: flex;
  flex-direction: column;
  padding: 8px 4px;
  gap: 6px;
  align-items: center;
}

.ai-replay-simulator-viewport .mock-sidebar .sidebar-item {
  width: 100%;
  height: 8px;
  border-radius: 3px;
  background: rgba(139, 92, 246, 0.08) !important;
}

.ai-replay-simulator-viewport .mock-sidebar .sidebar-item.active {
  background: linear-gradient(90deg, var(--tp-primary), var(--tp-secondary));
  box-shadow: 0 0 6px var(--tp-primary-shadow);
}

/* 模拟滚动容器 */
.ai-replay-simulator-viewport .mock-main-scroll-viewport {
  flex-grow: 1;
  overflow: hidden;
  position: relative;
  height: 100%;
}

.ai-replay-simulator-viewport .mock-main {
  flex-grow: 1;
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1);
  animation: mock-content-scroll-step 16s cubic-bezier(0.25, 1, 0.5, 1) infinite !important;
}

/* 模拟卡片组件 (默认浅色) */
.ai-replay-simulator-viewport .mock-card {
  background: rgba(248, 249, 250, 0.92) !important;
  border: 1px solid rgba(139, 92, 246, 0.06) !important;
  border-radius: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  position: relative;
  transition: all 0.4s ease;
}

.ai-replay-simulator-viewport .skeleton-line {
  height: 6px;
  background: rgba(139, 92, 246, 0.07) !important;
  border-radius: 3px;
  animation: mock-skeleton-pulse 1.8s ease-in-out infinite !important;
}

.ai-replay-simulator-viewport .skeleton-line.title {
  width: 60%;
  height: 8px;
  background: rgba(139, 92, 246, 0.14) !important;
}

.ai-replay-simulator-viewport .skeleton-line.text {
  width: 85%;
}

.ai-replay-simulator-viewport .skeleton-line.text-sm {
  width: 45%;
}

/* 1. 卡片1 瞄准定位动画 (0s - 3s) */
.ai-replay-simulator-viewport .mock-card.bento-1 {
  animation: mock-bento1-active 16s infinite !important;
}

.ai-replay-simulator-viewport .ai-inspect-box {
  position: absolute;
  inset: 0;
  border: 1.5px solid var(--tp-primary);
  border-radius: 6px;
  opacity: 0;
  pointer-events: none;
  box-shadow: inset 0 0 8px var(--tp-primary-shadow);
  animation: mock-inspect-pulse 16s infinite !important;
}

/* 2. 卡片2 打字状态绑定 (3s - 6s) */
.ai-replay-simulator-viewport .mock-card.bento-2 {
  animation: mock-bento2-active 16s infinite !important;
}

.ai-replay-simulator-viewport .mock-typing-cursor {
  position: absolute;
  right: 12px;
  bottom: 12px;
  width: 2px;
  height: 10px;
  background: var(--tp-secondary);
  opacity: 0;
  animation: mock-cursor-blink 16s infinite !important;
}

/* 4. 按钮点击高亮 (9s - 12s) */
.ai-replay-simulator-viewport .mock-btn-target {
  align-self: center;
  width: 100%;
  height: 24px;
  border: 1px solid var(--tp-primary);
  border-radius: 4px;
  background: rgba(139, 92, 246, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: bold;
  letter-spacing: 0.5px;
  color: var(--tp-primary);
  text-shadow: none;
  position: relative;
  overflow: hidden;
  animation: mock-btn-click 16s infinite !important;
}

.ai-replay-simulator-viewport .btn-glow-pulse {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
  transform: translateX(-100%);
  animation: mock-btn-sweep 2.4s infinite !important;
}

/* 5. 鼠标飞行航线控制 (默认品牌紫色指针) */
.ai-replay-simulator-viewport .mock-target-pointer {
  position: absolute;
  width: 20px;
  height: 20px;
  z-index: 10;
  pointer-events: none;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  animation: mock-pointer-path 16s cubic-bezier(0.25, 1, 0.5, 1) infinite !important;
}

.ai-replay-simulator-viewport .cursor-icon {
  font-size: 14px;
  color: var(--tp-primary) !important;
  transform: rotate(-35deg);
  filter: drop-shadow(0 2px 4px rgba(139, 92, 246, 0.2)) !important;
  z-index: 12;
}

.ai-replay-simulator-viewport .pointer-radar {
  position: absolute;
  top: 1px;
  left: 1px;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 11;
}

.ai-replay-simulator-viewport .radar-circle {
  position: absolute;
  border-radius: 50%;
  border: 1px solid var(--tp-primary);
  pointer-events: none;
  opacity: 0;
}

.ai-replay-simulator-viewport .radar-circle.rc1 {
  animation: mock-radar-ping 16s infinite !important;
}

.ai-replay-simulator-viewport .radar-circle.rc2 {
  border-style: dashed;
  animation: mock-radar-ping-delayed 16s infinite !important;
}

/* 垂直扫描激光 (浅色) */
.ai-replay-simulator-viewport .viewport-laser-line {
  position: absolute;
  left: 0;
  width: 100%;
  height: 2.5px;
  background: linear-gradient(90deg, transparent, var(--tp-primary), transparent);
  box-shadow: 0 0 10px var(--tp-primary);
  animation: ai-viewport-laser 3.5s cubic-bezier(0.4, 0, 0.2, 1) infinite !important;
  opacity: 0.65;
  z-index: 3;
}

/* 底部状态指示条 (默认浅色) */
.ai-replay-simulator-viewport .viewport-scanner-core {
  position: absolute;
  bottom: 12px;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff !important;
  border: 1px solid rgba(139, 92, 246, 0.15) !important;
  border-radius: 20px;
  padding: 4px 14px;
  box-shadow: 0 4px 15px rgba(139, 92, 246, 0.08) !important;
  backdrop-filter: blur(8px);
}

.ai-replay-simulator-viewport .scanner-label {
  display: inline-flex;
  align-items: center;
  gap: var(--tp-space-2);
  font-size: var(--tp-text-xs);
  color: var(--tp-primary) !important;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-shadow: none !important;
}

.ai-replay-simulator-viewport .rec-dot {
  width: 6.5px;
  height: 6.5px;
  border-radius: 50%;
  background: #ef4444;
  box-shadow:
    0 0 4px #ef4444,
    0 0 8px #ef4444;
  animation: ai-rec-blink 0.8s infinite alternate !important;
}

/* ==================== Dark Theme Overrides (html[data-theme='genart'] 赛博黑曜主题重写) ==================== */

/* 0. 验证历史列表 (深色黑曜) */
html[data-theme='genart'] .validation-history-scroll-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1) !important;
}
html[data-theme='genart'] .validation-history-scroll-container::-webkit-scrollbar-thumb:hover {
  background: rgba(168, 85, 247, 0.3) !important;
}

html[data-theme='genart'] .validation-history-row {
  background: rgba(255, 255, 255, 0.02) !important;
  border: 1px solid rgba(255, 255, 255, 0.04) !important;
}

html[data-theme='genart'] .validation-history-row:hover {
  background: rgba(168, 85, 247, 0.06) !important;
  border-color: rgba(168, 85, 247, 0.2) !important;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4) !important;
}

html[data-theme='genart'] .validation-history-row .history-time-col {
  color: #9ca3af !important;
}

html[data-theme='genart'] .validation-history-row .history-user-col,
html[data-theme='genart'] .validation-history-row .history-duration-col,
html[data-theme='genart'] .validation-history-row .history-steps-col {
  color: #6b7280 !important;
}

html[data-theme='genart'] .validation-history-row .history-meta-icon {
  color: #4b5563 !important;
}

/* 顶部操作区、标题与按钮高保真优化 (深色黑曜) */
html[data-theme='genart'] .ai-task-detail-page .ai-detail-back-icon {
  background: rgba(255, 255, 255, 0.03) !important;
  border: 1px solid rgba(255, 255, 255, 0.05) !important;
  color: #a0aec0 !important;
}

html[data-theme='genart'] .ai-task-detail-page .ai-detail-back-icon:hover {
  background: var(--tp-primary) !important;
  border-color: var(--tp-primary) !important;
  color: #ffffff !important;
  box-shadow: 0 4px 14px rgba(168, 85, 247, 0.3) !important;
}

html[data-theme='genart'] .ai-task-detail-page .ai-mode-tag.recording {
  background: rgba(168, 85, 247, 0.15) !important;
  color: #c084fc !important;
  border: 1px solid rgba(168, 85, 247, 0.25) !important;
}

html[data-theme='genart'] .ai-task-detail-actions .ai-btn-secondary {
  border: 1px solid rgba(255, 255, 255, 0.06) !important;
  background: rgba(255, 255, 255, 0.02) !important;
  color: #e2e8f0 !important;
}

html[data-theme='genart'] .ai-task-detail-actions .ai-btn-secondary .material-symbols-outlined {
  color: #f87171 !important;
}

html[data-theme='genart'] .ai-task-detail-actions .ai-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.05) !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
}

html[data-theme='genart'] .ai-task-detail-page .ai-detail-action-group .ai-btn-icon {
  border: 1px solid rgba(255, 255, 255, 0.05) !important;
  background: rgba(255, 255, 255, 0.01) !important;
  color: #a0aec0 !important;
}

html[data-theme='genart'] .ai-task-detail-page .ai-detail-action-group .ai-btn-icon:hover {
  background: rgba(168, 85, 247, 0.12) !important;
  border-color: #a855f7 !important;
  color: #ffffff !important;
}

html[data-theme='genart'] .ai-task-detail-page .ai-detail-action-group--danger .ai-btn-icon {
  border-color: rgba(239, 68, 68, 0.2) !important;
  background: rgba(239, 68, 68, 0.05) !important;
  color: #f87171 !important;
}

html[data-theme='genart'] .ai-task-detail-page .ai-detail-action-group--danger .ai-btn-icon:hover {
  background: #ef4444 !important;
  border-color: #ef4444 !important;
  color: #ffffff !important;
}

/* 起始地址一键复制卡片样式 (深色黑曜) */
html[data-theme='genart'] .ai-task-detail-page .ai-info-url {
  background: rgba(255, 255, 255, 0.01) !important;
  border: 1px solid rgba(255, 255, 255, 0.04) !important;
  color: #adc6ff !important;
}

html[data-theme='genart'] .ai-task-detail-page .ai-info-url:hover {
  background: rgba(168, 85, 247, 0.06) !important;
  border-color: rgba(168, 85, 247, 0.2) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
}

html[data-theme='genart'] .ai-task-detail-page .ai-info-url .copy-icon {
  color: rgba(255, 255, 255, 0.25) !important;
}

html[data-theme='genart'] .ai-task-detail-page .ai-info-url:hover .copy-icon {
  color: #adc6ff !important;
}

/* 小标题样式微调 (深色黑曜) */
html[data-theme='genart'] .ai-task-detail-page .ai-info-label {
  color: rgba(255, 255, 255, 0.35) !important;
}

/* 1. 仿真终端外壳 (深色黑曜) */
html[data-theme='genart'] .ai-replay-simulator-terminal {
  background: #090a10 !important;
  border: 1px solid var(--tp-border-subtle) !important;
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.4) !important;
}

/* 终端头部 (深色黑曜) */
html[data-theme='genart'] .ai-replay-simulator-terminal .terminal-header {
  background: #10121a !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
}

/* 终端标题 (深色黑曜) */
html[data-theme='genart'] .ai-replay-simulator-terminal .terminal-title {
  color: #a0aec0 !important;
}

/* 日志文本行 (深色黑曜) */
html[data-theme='genart'] .ai-replay-simulator-terminal .log-row {
  color: rgba(255, 255, 255, 0.7) !important;
}

/* 日志行高亮 (深色黑曜) */
html[data-theme='genart'] .ai-replay-simulator-terminal .log-row.current-row {
  color: #ffffff !important;
  text-shadow: 0 0 6px var(--tp-primary-light, rgba(139, 92, 246, 0.6)) !important;
}

html[data-theme='genart'] .ai-replay-simulator-terminal .log-row.current-row .log-text {
  color: var(--tp-primary-light, #c084fc) !important;
}

/* 日志标签适配 (深色黑曜) */
html[data-theme='genart'] .ai-replay-simulator-terminal .log-tag.system {
  background: rgba(66, 153, 225, 0.15) !important;
  color: #4299e1 !important;
}
html[data-theme='genart'] .ai-replay-simulator-terminal .log-tag.browser {
  background: rgba(159, 122, 234, 0.15) !important;
  color: #9f7aea !important;
}
html[data-theme='genart'] .ai-replay-simulator-terminal .log-tag.replay {
  background: rgba(72, 187, 120, 0.15) !important;
  color: #48bb78 !important;
}
html[data-theme='genart'] .ai-replay-simulator-terminal .log-tag.assert {
  background: rgba(237, 137, 54, 0.15) !important;
  color: #ed8936 !important;
}
html[data-theme='genart'] .ai-replay-simulator-terminal .log-tag.stream {
  background: rgba(236, 72, 153, 0.15) !important;
  color: #ec4899 !important;
}

html[data-theme='genart'] .ai-replay-simulator-viewport {
  background: linear-gradient(135deg, #090a10 0%, #111422 100%) !important;
  border: 1px solid var(--tp-border-subtle) !important;
  box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.8) !important;
}

html[data-theme='genart'] .ai-replay-simulator-viewport::before {
  background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.15) 50%) !important;
  opacity: 0.45;
}

html[data-theme='genart'] .ai-replay-simulator-viewport::after {
  background: radial-gradient(
    circle at 50% 50%,
    transparent 55%,
    rgba(0, 0, 0, 0.55) 100%
  ) !important;
}

html[data-theme='genart'] .ai-replay-simulator-viewport .viewport-hud-grid {
  background-image:
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(180deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px) !important;
  opacity: 0.85 !important;
}

html[data-theme='genart'] .ai-replay-simulator-viewport .mock-browser {
  background: rgba(10, 11, 18, 0.85) !important;
  border: 1.5px solid rgba(168, 85, 247, 0.25) !important;
  box-shadow:
    0 12px 30px rgba(0, 0, 0, 0.6),
    0 0 20px rgba(168, 85, 247, 0.1) !important;
}

html[data-theme='genart'] .ai-replay-simulator-viewport .mock-browser-header {
  background: rgba(20, 21, 35, 0.9) !important;
  border-bottom: 1px solid rgba(168, 85, 247, 0.2) !important;
}

html[data-theme='genart'] .ai-replay-simulator-viewport .mock-browser-url {
  background: rgba(10, 11, 18, 0.7) !important;
  border: 1px solid rgba(168, 85, 247, 0.15) !important;
  color: rgba(255, 255, 255, 0.55) !important;
}

html[data-theme='genart'] .ai-replay-simulator-viewport .mock-browser-content {
  background: rgba(8, 9, 15, 0.95) !important;
}

html[data-theme='genart'] .ai-replay-simulator-viewport .mock-sidebar {
  border-right: 1px solid rgba(255, 255, 255, 0.03) !important;
  background: rgba(13, 14, 25, 0.5) !important;
}

html[data-theme='genart'] .ai-replay-simulator-viewport .mock-sidebar .sidebar-item {
  background: rgba(255, 255, 255, 0.1) !important;
}

html[data-theme='genart'] .ai-replay-simulator-viewport .mock-card {
  background: rgba(18, 19, 30, 0.85) !important;
  border: 1px solid rgba(255, 255, 255, 0.04) !important;
}

html[data-theme='genart'] .ai-replay-simulator-viewport .skeleton-line {
  background: rgba(255, 255, 255, 0.08) !important;
}

html[data-theme='genart'] .ai-replay-simulator-viewport .skeleton-line.title {
  background: rgba(255, 255, 255, 0.15) !important;
}

html[data-theme='genart'] .ai-replay-simulator-viewport .mock-btn-target {
  background: rgba(168, 85, 247, 0.12) !important;
  text-shadow: 0 0 4px var(--tp-primary-shadow) !important;
}

html[data-theme='genart'] .ai-replay-simulator-viewport .cursor-icon {
  color: #ffffff !important;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5)) !important;
}

html[data-theme='genart'] .ai-replay-simulator-viewport .viewport-laser-line {
  box-shadow: 0 0 14px var(--tp-primary) !important;
  opacity: 0.8;
}

html[data-theme='genart'] .ai-replay-simulator-viewport .viewport-scanner-core {
  background: rgba(18, 19, 30, 0.85) !important;
  border: 1px solid rgba(255, 255, 255, 0.05) !important;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5) !important;
}

html[data-theme='genart'] .ai-replay-simulator-viewport .scanner-label {
  color: #ffffff !important;
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.4) !important;
}

/* ─── 统一 16s 强同步时间轴关键帧 ─── */

/* 1. 鼠标 16 秒飞行航线 */
@keyframes mock-pointer-path {
  0%,
  10% {
    /* 停在 Bento 1 (0s - 1.6s) */
    top: 45%;
    left: 20%;
  }
  22% {
    /* 飞达 Bento 2 */
    top: 50%;
    left: 55%;
  }
  32% {
    /* 停在 Bento 2 打字 (3.5s - 5.1s) */
    top: 50%;
    left: 55%;
  }
  44% {
    /* 飞达 URL 框 */
    top: -12px;
    left: 45%;
  }
  53% {
    /* 停在 URL 框 (7s - 8.5s) */
    top: -12px;
    left: 45%;
  }
  63% {
    /* 飞达目标按钮 */
    top: 55%;
    left: 78%;
  }
  64.3% {
    /* 按钮按下瞬间 (第10.3s) */
    top: 55%;
    left: 78%;
    transform: scale(0.85);
  }
  72% {
    /* 停留 */
    top: 55%;
    left: 78%;
    transform: scale(1);
  }
  84% {
    /* 移开到中下观察区 */
    top: 75%;
    left: 50%;
  }
  94% {
    /* 飞回起始过渡区 */
    top: 45%;
    left: 20%;
  }
  100% {
    top: 45%;
    left: 20%;
  }
}

/* 2. Bento 1 高亮定位动画 */
@keyframes mock-bento1-active {
  0%,
  15% {
    /* 0s - 2.4s 间高亮 */
    border-color: rgba(139, 92, 246, 0.6) !important;
    box-shadow: 0 0 10px rgba(139, 92, 246, 0.2) !important;
  }
  20%,
  100% {
    border-color: rgba(139, 92, 246, 0.08) !important;
    box-shadow: none !important;
  }
}

@keyframes mock-inspect-pulse {
  0%,
  5% {
    opacity: 0.9;
    transform: scale(1.02);
  }
  10% {
    opacity: 0.5;
    transform: scale(0.98);
  }
  15% {
    opacity: 0;
  }
  16%,
  100% {
    opacity: 0;
  }
}

/* 3. Bento 2 表单键入动画 */
@keyframes mock-bento2-active {
  21%,
  33% {
    /* 3.3s - 5.3s 间激活 */
    border-color: rgba(139, 92, 246, 0.5) !important;
    background: rgba(139, 92, 246, 0.04) !important;
    box-shadow: 0 0 8px rgba(139, 92, 246, 0.12) !important;
  }
  0%,
  20%,
  35%,
  100% {
    border-color: rgba(139, 92, 246, 0.08) !important;
    background: rgba(248, 249, 250, 0.92) !important;
    box-shadow: none !important;
  }
}

@keyframes mock-cursor-blink {
  21%,
  33% {
    opacity: 1;
    animation: steps(2) infinite alternate;
  }
  0%,
  20%,
  34%,
  100% {
    opacity: 0;
  }
}

/* 4. URL 框重新聚焦加载动画 */
@keyframes mock-url-focus {
  43%,
  54% {
    /* 6.8s - 8.6s 间激活 */
    border-color: rgba(139, 92, 246, 0.5) !important;
    box-shadow: 0 0 8px rgba(139, 92, 246, 0.12) !important;
  }
  0%,
  42%,
  55%,
  100% {
    border-color: rgba(139, 92, 246, 0.18) !important;
    box-shadow: none !important;
  }
}

/* 5. 目标测试执行点击 (第 10.3 秒触发) */
@keyframes mock-btn-click {
  0%,
  63% {
    /* 点击前：普通测试就绪态 */
    background: rgba(139, 92, 246, 0.08) !important;
    border-color: var(--tp-primary) !important;
    color: var(--tp-primary) !important;
    transform: scale(1) !important;
  }
  64.3%,
  71.5% {
    /* 按下并释放瞬间 */
    background: var(--tp-primary) !important;
    border-color: #7c3aed !important;
    color: #ffffff !important;
    box-shadow: 0 0 12px rgba(139, 92, 246, 0.4) !important;
    transform: scale(0.95) !important;
  }
  72%,
  84% {
    /* 11.5s - 13.5s 成功状态常驻 */
    background: rgba(16, 185, 129, 0.15) !important;
    border-color: #10b981 !important;
    color: #10b981 !important;
    transform: scale(1) !important;
    box-shadow: 0 0 10px rgba(16, 185, 129, 0.2) !important;
  }
  85%,
  100% {
    /* 13.6s 页面离开或复位 */
    background: rgba(139, 92, 246, 0.08) !important;
    border-color: var(--tp-primary) !important;
    color: var(--tp-primary) !important;
    transform: scale(1) !important;
    box-shadow: none !important;
  }
}

/* 6. 精准点击声呐冲击圈 */
@keyframes mock-radar-ping {
  0%,
  63% {
    width: 4px;
    height: 4px;
    opacity: 0;
  }
  64.3% {
    /* 精准在 10.3s 的 64.3% 帧引爆第一个脉冲 */
    width: 8px;
    height: 8px;
    opacity: 0.95;
  }
  74% {
    width: 32px;
    height: 32px;
    opacity: 0;
  }
  100% {
    width: 32px;
    height: 32px;
    opacity: 0;
  }
}

@keyframes mock-radar-ping-delayed {
  0%,
  64.5% {
    width: 4px;
    height: 4px;
    opacity: 0;
  }
  66% {
    /* 稍滞后一点引爆第二个虚线脉冲 */
    width: 10px;
    height: 10px;
    opacity: 0.75;
  }
  80% {
    width: 60px;
    height: 60px;
    opacity: 0;
  }
  100% {
    width: 60px;
    height: 60px;
    opacity: 0;
  }
}

/* 7. 点击成功后，页面向下滚动，进行底层元素 Assert 校验 (12s - 15s) */
@keyframes mock-content-scroll-step {
  0%,
  75% {
    /* 前 12 秒稳在顶部 */
    transform: translateY(0);
  }
  80%,
  93% {
    /* 12.8s - 14.8s 页面滚动断言 */
    transform: translateY(-22px);
  }
  96%,
  100% {
    /* 复位 */
    transform: translateY(0);
  }
}

/* 按钮微弱反光掠过 */
@keyframes mock-btn-sweep {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

/* 骨架条呼吸 */
@keyframes mock-skeleton-pulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 0.95;
  }
}

/* 整体扫描器 CRT 荧光抖动 */
@keyframes mock-browser-flicker {
  0%,
  100% {
    filter: brightness(1);
  }
  35% {
    filter: brightness(1.02);
  }
  36% {
    filter: brightness(0.98);
  }
  37% {
    filter: brightness(1.01);
  }
  85% {
    filter: brightness(1);
  }
  86% {
    filter: brightness(0.97);
  }
  87% {
    filter: brightness(1.03);
  }
}

/* 底部状态指示灯闪烁 */
@keyframes ai-rec-blink {
  0% {
    opacity: 0.25;
  }
  100% {
    opacity: 1;
  }
}

/* 垂直紫光栅格激光扫描动画 */
@keyframes ai-viewport-laser {
  0% {
    top: 0%;
  }
  50% {
    top: 100%;
  }
  100% {
    top: 0%;
  }
}
</style>
