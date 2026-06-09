<script setup lang="ts">
/**
 * 需求智生主页面。
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { UploadFile } from 'element-plus'
import { InfoFilled, SuccessFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useGenTasks, useRequirementDocs } from '@/composables/useRequirementGen'
import { useTheme } from '@/composables/useTheme'

import { getActiveAIModel, type AIModelConfig } from '@/api/aiModelConfig'
import type { RequirementDoc } from '@/api/requirementDoc'
import type { SmartGeneratePayload, SmartGenerateResult } from '@/api/requirementGen'

const router = useRouter()
const { isGenArtTheme } = useTheme()
const {
  docs,
  fetchDocs,
  handleUpload,
  handlePaste,
  gitLabConfig,
  gitLabConfigLoading,
  gitLabConfigSaving,
  gitLabTesting,
  gitLabImporting,
  loadGitLabConfig,
  handleSaveGitLabConfig,
  handleTestGitLabConfig,
  handleImportGitLabIssue,
} = useRequirementDocs()
const { tasks, smartGenerating, handleSmartGenerate, fetchTasks } = useGenTasks()

const parsedDocCount = computed(
  () => docs.value.filter((doc) => isParsedDocStatus(doc.parse_status)).length,
)
const parseSuccessRate = computed(() => {
  if (!docs.value.length) return 0
  return Math.round((parsedDocCount.value / docs.value.length) * 100)
})
const activeTaskStatuses = new Set(['pending', 'running'])
function isActiveTaskStatus(status: string) {
  return activeTaskStatuses.has(status.toLowerCase())
}
function isParsingDocStatus(status: string | undefined) {
  const normalized = status?.toLowerCase()
  return normalized === 'parsing' || normalized === 'not_parsed'
}
function isParsedDocStatus(status: string | undefined) {
  return status?.toLowerCase() === 'parsed'
}
const runningTaskCount = computed(
  () => tasks.value.filter((task) => isActiveTaskStatus(task.status)).length,
)
const latestDoc = computed(() => docs.value[0] || null)
// 基于最新文档的任务过滤
const latestDocTasks = computed(() =>
  latestDoc.value ? tasks.value.filter((t) => t.requirement_doc_id === latestDoc.value!.id) : [],
)
const latestDocRunningTask = computed(
  () => latestDocTasks.value.find((task) => isActiveTaskStatus(task.status)) || null,
)
const latestDocGenerating = computed(() => latestDocRunningTask.value !== null)
const latestDocCaseTotal = computed(() =>
  latestDocTasks.value.reduce((sum, t) => sum + (t.generated_count || 0), 0),
)
const hasPendingDocs = computed(() => docs.value.some((d) => isParsingDocStatus(d.parse_status)))
const activeEngineStatus = computed(() => {
  if (smartGenerating.value) return '流式处理中'
  if (gitLabIntakeActive.value) return '导入中'
  if (runningTaskCount.value) return '生成中'
  if (hasPendingDocs.value) return '解析中'
  return '待机'
})
// 活跃冷却机制：任何操作后动画至少保持 8 秒
const activeCooldown = ref(false)
let cooldownTimer: ReturnType<typeof setTimeout> | null = null
function triggerActiveCooldown(durationMs = 8000) {
  activeCooldown.value = true
  if (cooldownTimer) clearTimeout(cooldownTimer)
  cooldownTimer = setTimeout(() => {
    activeCooldown.value = false
  }, durationMs)
}
const isSystemActive = computed(() => activeEngineStatus.value !== '待机' || activeCooldown.value)
const latencyVal = ref(14)
const progressNow = ref(Date.now())
const particlesCanvas = ref<HTMLCanvasElement | null>(null)
const mouseGlowEl = ref<HTMLDivElement | null>(null)
let animFrameId = 0
let latencyTimer: ReturnType<typeof setInterval> | null = null
let progressTimer: ReturnType<typeof setInterval> | null = null
let particlesResizeHandler: (() => void) | null = null
const diagnosticsSkillMatch = computed(() => {
  if (smartResultData.value?.recommended_skills.length) {
    return `${smartResultData.value.recommended_skills.length} 条路由`
  }
  return `${parseSuccessRate.value}%`
})
const activeAIModel = ref<AIModelConfig | null>(null)
const diagnosticsModelName = computed(() => {
  return activeAIModel.value?.name || activeAIModel.value?.model_id || '--'
})

async function loadActiveAIModel() {
  try {
    activeAIModel.value = await getActiveAIModel()
  } catch {
    activeAIModel.value = null
  }
}

// ── Pipeline：体现当前任务流各步骤状态 ──
const latestDocParsed = computed(() => isParsedDocStatus(latestDoc.value?.parse_status))
const latestDocParsing = computed(() => isParsingDocStatus(latestDoc.value?.parse_status))
const matchedSkillCount = computed(() => smartResultData.value?.recommended_skills?.length || 0)
const uploading = ref(false)
const pasting = ref(false)
const gitLabIntakeActive = ref(false)
const intakeStageStartedAt = ref<number | null>(null)
const smartStageStartedAt = ref<number | null>(null)

function clampPercentage(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)))
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function getTimedProgress(
  start: number,
  end: number,
  durationMs: number,
  startedAt: number | null,
) {
  if (!startedAt) return start
  const elapsed = Math.max(0, progressNow.value - startedAt)
  const ratio = Math.min(1, elapsed / durationMs)
  const easedRatio = 1 - Math.pow(1 - ratio, 2)
  return clampPercentage(start + (end - start) * easedRatio)
}

const pipelineSteps = computed(() => {
  const step1Done = docs.value.length > 0
  const step1Active = uploading.value || pasting.value || gitLabIntakeActive.value
  const step1Progress = step1Done
    ? 100
    : step1Active
      ? getTimedProgress(8, 90, 12000, intakeStageStartedAt.value)
      : 0

  const step2Active = latestDocParsing.value
  const step2Done = latestDocParsed.value
  const step2Progress = step2Done
    ? 100
    : step2Active
      ? getTimedProgress(18, 88, 45000, parseTimestamp(latestDoc.value?.created_at))
      : 0

  const step3Active = smartGenerating.value
  const step3Done = matchedSkillCount.value > 0 || latestDocTasks.value.length > 0
  const step3Count = matchedSkillCount.value || latestDocTasks.value.length
  const step3Progress = step3Done
    ? 100
    : step3Active
      ? getTimedProgress(12, 90, 45000, smartStageStartedAt.value)
      : 0

  const step4Active = latestDocGenerating.value
  const step4Done = latestDocCaseTotal.value > 0
  const step4Progress = step4Done
    ? 100
    : step4Active
      ? getTimedProgress(6, 96, 180000, parseTimestamp(latestDocRunningTask.value?.created_at))
      : 0

  return [
    {
      no: '01',
      title: '需求读取',
      desc: step1Done ? '文档已就绪' : gitLabIntakeActive.value ? '导入 Issue...' : '等待上传...',
      progress: step1Progress,
      active: step1Active || (step1Done && !step2Done),
      completed: step1Done,
    },
    {
      no: '02',
      title: '需求解析',
      desc: step2Done ? '解析完成' : step2Active ? '解析中...' : '等待解析...',
      progress: step2Progress,
      active: step2Active,
      completed: step2Done,
    },
    {
      no: '03',
      title: '策略匹配',
      desc: step3Done ? `${step3Count} 个策略已匹配` : step3Active ? '匹配中...' : '等待匹配...',
      progress: step3Progress,
      active: step3Active,
      completed: step3Done,
    },
    {
      no: '04',
      title: '用例生成',
      desc: step4Done
        ? `已生成 ${latestDocCaseTotal.value} 个用例`
        : step4Active
          ? '生成中...'
          : '等待生成...',
      progress: step4Progress,
      active: step4Active,
      completed: step4Done,
    },
  ]
})

const isPipelineInProgress = computed(
  () =>
    uploading.value ||
    pasting.value ||
    gitLabIntakeActive.value ||
    latestDocParsing.value ||
    smartGenerating.value ||
    latestDocGenerating.value,
)
const centralNumber = computed(() => {
  if (!isPipelineInProgress.value) return 0
  const [readStep, parseStep, matchStep, generateStep] = pipelineSteps.value
  const weightedProgress =
    (readStep?.progress || 0) * 0.1 +
    (parseStep?.progress || 0) * 0.25 +
    (matchStep?.progress || 0) * 0.25 +
    (generateStep?.progress || 0) * 0.4
  return Math.min(99, Math.max(1, clampPercentage(weightedProgress)))
})
const centralIdleTitle = computed(() => {
  if (latestDoc.value && latestDocParsed.value) return 'READY'
  return 'IDLE'
})
const centralHubAriaLabel = computed(() => {
  if (isPipelineInProgress.value) return `需求智生进度 ${centralNumber.value}%`
  if (latestDoc.value && latestDocParsed.value) return '开始智能生成'
  if (latestDoc.value) return '等待需求解析完成'
  return '上传需求'
})
const showPipelineFooter = computed(() => isPipelineInProgress.value)
let pollTimer: ReturnType<typeof setInterval> | null = null
// 防止重复自动触发智能生成
const autoGenTriggeredDocId = ref<number | null>(null)
// 任务状态轮询（等待 LLM 生成完成）
let taskPollTimer: ReturnType<typeof setInterval> | null = null

function startTaskPoll() {
  if (taskPollTimer) return
  taskPollTimer = setInterval(async () => {
    await fetchTasks()
    const hasRunning = tasks.value.some((t) => isActiveTaskStatus(t.status))
    if (!hasRunning) {
      stopTaskPoll()
    }
  }, 5000)
}

function stopTaskPoll() {
  if (taskPollTimer) {
    clearInterval(taskPollTimer)
    taskPollTimer = null
  }
}

// 当有文档处于解析中状态时，自动轮询刷新
function startPollIfNeeded() {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    const hasParsing = docs.value.some((d) => isParsingDocStatus(d.parse_status))
    if (!hasParsing) {
      stopPoll()
      // 解析全部完成后，自动触发智能生成
      await autoTriggerSmartGenerate()
      return
    }
    await fetchDocs()
    const stillParsing = docs.value.some((d) => isParsingDocStatus(d.parse_status))
    if (!stillParsing) {
      stopPoll()
      await autoTriggerSmartGenerate()
    }
  }, 3000)
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// 解析完成后自动触发智能生成（无需弹窗）
async function autoTriggerSmartGenerate() {
  const doc = latestDoc.value
  if (!doc || !isParsedDocStatus(doc.parse_status)) return
  // 防止对同一文档重复触发
  if (autoGenTriggeredDocId.value === doc.id) return
  // 已有该文档的任务则跳过
  if (latestDocTasks.value.length > 0) return
  autoGenTriggeredDocId.value = doc.id
  smartStageStartedAt.value = Date.now()
  triggerActiveCooldown(15000)
  const payload: SmartGeneratePayload = {
    requirement_doc_id: doc.id,
    task_name_prefix: '',
    max_cases_per_skill: 20,
    default_level: 'P2',
    extra_prompt: '',
  }
  const result = await handleSmartGenerate(payload)
  if (result) {
    smartResultData.value = result
    triggerActiveCooldown(5000)
    // 启动任务轮询，等待 LLM 生成完成
    startTaskPoll()
  }
}

// 粒子系统
interface PData {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  a: number
  color: number
}

function getParticleColor(color: number, opacity: number): string {
  if (isGenArtTheme.value) {
    if (color < 0.33) return `rgba(100,140,255,${opacity})`
    if (color < 0.66) return `rgba(160,100,255,${opacity * 0.8})`
    return `rgba(80,220,255,${opacity * 0.7})`
  }
  // 浅色主题：使用更柔和的紫蓝色调
  if (color < 0.33) return `rgba(139,92,246,${opacity * 0.5})`
  if (color < 0.66) return `rgba(99,102,241,${opacity * 0.4})`
  return `rgba(168,85,247,${opacity * 0.35})`
}

function initParticles() {
  const canvasEl = particlesCanvas.value
  if (!canvasEl) return
  const canvas = canvasEl
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const context = ctx
  const particles: PData[] = []
  let width = 0
  let height = 0
  function resize() {
    width = canvas.parentElement?.clientWidth ?? window.innerWidth
    height = canvas.parentElement?.clientHeight ?? window.innerHeight
    canvas.width = width
    canvas.height = height
  }
  if (particlesResizeHandler) {
    window.removeEventListener('resize', particlesResizeHandler)
  }
  particlesResizeHandler = resize
  window.addEventListener('resize', particlesResizeHandler)
  resize()
  function makeP(): PData {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.8 + 0.4,
      a: Math.random() * 0.5 + 0.15,
      color: Math.random(),
    }
  }
  for (let i = 0; i < 120; i++) particles.push(makeP())
  function tick() {
    context.clearRect(0, 0, width, height)
    const isDark = isGenArtTheme.value
    const glowOne = context.createRadialGradient(
      width * 0.3,
      height * 0.5,
      0,
      width * 0.3,
      height * 0.5,
      width * 0.4,
    )
    glowOne.addColorStop(0, isDark ? 'rgba(100,60,200,0.04)' : 'rgba(139,92,246,0.03)')
    glowOne.addColorStop(1, 'transparent')
    context.fillStyle = glowOne
    context.fillRect(0, 0, width, height)
    const glowTwo = context.createRadialGradient(
      width * 0.7,
      height * 0.4,
      0,
      width * 0.7,
      height * 0.4,
      width * 0.35,
    )
    glowTwo.addColorStop(0, isDark ? 'rgba(60,100,200,0.03)' : 'rgba(99,102,241,0.025)')
    glowTwo.addColorStop(1, 'transparent')
    context.fillStyle = glowTwo
    context.fillRect(0, 0, width, height)
    context.lineWidth = 0.5
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i]
      if (!p) continue
      p.x += p.vx
      p.y += p.vy
      if (p.x < 0 || p.x > width) p.vx *= -1
      if (p.y < 0 || p.y > height) p.vy *= -1
      context.beginPath()
      context.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      context.fillStyle = getParticleColor(p.color, p.a)
      context.shadowBlur = 8
      context.shadowColor = getParticleColor(p.color, Math.min(p.a + 0.2, 0.75))
      context.fill()
      context.shadowBlur = 0
      for (let j = i + 1; j < particles.length; j += 1) {
        const q = particles[j]
        if (!q) continue
        const dx = p.x - q.x
        const dy = p.y - q.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance < 140) {
          context.beginPath()
          context.moveTo(p.x, p.y)
          context.lineTo(q.x, q.y)
          const lineAlpha = isDark ? 0.12 : 0.06
          context.strokeStyle = isDark
            ? `rgba(140,160,255,${lineAlpha * (1 - distance / 140)})`
            : `rgba(139,92,246,${lineAlpha * (1 - distance / 140)})`
          context.stroke()
        }
      }
    }
    animFrameId = requestAnimationFrame(tick)
  }
  tick()
}

function onMouseMove(e: MouseEvent) {
  const el = mouseGlowEl.value
  if (el) {
    el.style.setProperty('--x', `${e.clientX}px`)
    el.style.setProperty('--y', `${e.clientY}px`)
  }
}

onMounted(() => {
  void loadActiveAIModel()
  // 挂载后如果有待解析文档立即开始轮询
  if (docs.value.some((d) => isParsingDocStatus(d.parse_status))) {
    startPollIfNeeded()
  }
  // 如果有正在运行的任务，启动任务轮询
  if (tasks.value.some((t) => isActiveTaskStatus(t.status))) {
    startTaskPoll()
  }
  // 鼠标跟随光晕
  window.addEventListener('mousemove', onMouseMove)
  // Canvas 粒子系统
  nextTick(() => initParticles())
  // 延迟数值动态更新
  latencyTimer = setInterval(() => {
    latencyVal.value = Math.floor(Math.random() * 6) + 12
  }, 2000)
  progressTimer = setInterval(() => {
    progressNow.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  stopPoll()
  stopTaskPoll()
  window.removeEventListener('mousemove', onMouseMove)
  if (particlesResizeHandler) {
    window.removeEventListener('resize', particlesResizeHandler)
    particlesResizeHandler = null
  }
  cancelAnimationFrame(animFrameId)
  if (latencyTimer) clearInterval(latencyTimer)
  if (progressTimer) clearInterval(progressTimer)
  if (cooldownTimer) clearTimeout(cooldownTimer)
})

const showUploadDialog = ref(false)
const uploadFile = ref<File | null>(null)
const uploadTitle = ref('')
const uploadRemark = ref('')
const showPasteDialog = ref(false)
const pasteTitle = ref('')
const pasteContent = ref('')
const pasteRemark = ref('')
const showGitLabDialog = ref(false)
const gitLabBaseURL = ref('')
const gitLabProjectPath = ref('')
const gitLabToken = ref('')
const gitLabEnabled = ref(true)
const gitLabIssueURL = ref('')
const gitLabIncludeComments = ref(true)
const gitLabAnalyzeImages = ref(true)
const showSmartDialog = ref(false)
const smartDocId = ref(0)
const smartDocTitle = ref('')
const smartForm = ref<SmartGeneratePayload>({
  requirement_doc_id: 0,
  task_name_prefix: '',
  max_cases_per_skill: 20,
  default_level: 'P2',
  extra_prompt: '',
})
const smartResultData = ref<SmartGenerateResult | null>(null)
const gitLabConfigReady = computed(
  () => !!gitLabConfig.value?.enabled && !!gitLabConfig.value?.token_configured,
)
const gitLabConfigStatusText = computed(() => {
  if (gitLabConfigLoading.value) return '正在读取配置'
  if (!gitLabConfig.value?.token_configured) return '未配置 Token'
  if (!gitLabConfig.value.enabled) return '已停用'
  return `已连接 ${gitLabConfig.value.token_mask || 'GitLab'}`
})
const gitLabHasSavedToken = computed(() => !!gitLabConfig.value?.token_configured)
const canSaveGitLabConfig = computed(
  () =>
    !!gitLabBaseURL.value.trim() &&
    !!gitLabProjectPath.value.trim() &&
    (gitLabHasSavedToken.value || !!gitLabToken.value.trim()),
)
const canImportGitLabIssue = computed(
  () => gitLabConfigReady.value && !!gitLabIssueURL.value.trim() && !gitLabImporting.value,
)

function onFileChange(file: UploadFile) {
  uploadFile.value = file.raw ?? null
  if (!uploadTitle.value) uploadTitle.value = file.name
}

async function submitUpload() {
  if (!uploadFile.value || !uploadTitle.value.trim()) return
  intakeStageStartedAt.value = Date.now()
  uploading.value = true
  try {
    await handleUpload(uploadFile.value, uploadTitle.value.trim(), uploadRemark.value.trim())
    showUploadDialog.value = false
    uploadFile.value = null
    uploadTitle.value = ''
    uploadRemark.value = ''
    triggerActiveCooldown()
    // 短暂等待后检查：解析可能已瞬间完成
    await nextTick()
    if (isParsedDocStatus(latestDoc.value?.parse_status)) {
      autoTriggerSmartGenerate()
    } else {
      startPollIfNeeded()
    }
  } finally {
    uploading.value = false
  }
}

async function submitPaste() {
  if (!pasteTitle.value.trim() || !pasteContent.value.trim()) return
  intakeStageStartedAt.value = Date.now()
  pasting.value = true
  try {
    await handlePaste(pasteTitle.value.trim(), pasteContent.value.trim(), pasteRemark.value.trim())
    showPasteDialog.value = false
    pasteTitle.value = ''
    pasteContent.value = ''
    pasteRemark.value = ''
    triggerActiveCooldown()
    await nextTick()
    if (isParsedDocStatus(latestDoc.value?.parse_status)) {
      autoTriggerSmartGenerate()
    } else {
      startPollIfNeeded()
    }
  } finally {
    pasting.value = false
  }
}

async function openGitLabDialog() {
  showGitLabDialog.value = true
  const config = await loadGitLabConfig()
  if (config) {
    gitLabBaseURL.value = config.base_url
    gitLabProjectPath.value = config.project_path
    gitLabEnabled.value = config.enabled || !config.token_configured
    gitLabToken.value = ''
  }
}

async function submitGitLabConfig() {
  if (!canSaveGitLabConfig.value) {
    ElMessage.warning('请填写 GitLab 地址、项目路径和 Token')
    return
  }
  const config = await handleSaveGitLabConfig({
    base_url: gitLabBaseURL.value.trim(),
    project_path: gitLabProjectPath.value.trim(),
    token: gitLabToken.value.trim() || undefined,
    enabled: gitLabEnabled.value,
  })
  if (config) {
    gitLabToken.value = ''
  }
}

async function submitGitLabTest() {
  await handleTestGitLabConfig()
}

async function submitGitLabImport() {
  if (!canImportGitLabIssue.value) {
    ElMessage.warning('请先完成 GitLab 配置并填写 Issue URL')
    return
  }
  intakeStageStartedAt.value = Date.now()
  gitLabIntakeActive.value = true
  try {
    const doc = await handleImportGitLabIssue({
      issue_url: gitLabIssueURL.value.trim(),
      include_comments: gitLabIncludeComments.value,
      analyze_images: gitLabAnalyzeImages.value,
    })
    if (!doc) return
    showGitLabDialog.value = false
    gitLabIssueURL.value = ''
    triggerActiveCooldown()
    await nextTick()
    if (isParsedDocStatus(doc.parse_status) || isParsedDocStatus(latestDoc.value?.parse_status)) {
      autoTriggerSmartGenerate()
    } else {
      startPollIfNeeded()
    }
  } finally {
    gitLabIntakeActive.value = false
  }
}

function openSmartGenerate(doc: RequirementDoc) {
  smartDocId.value = doc.id
  smartDocTitle.value = doc.title
  smartForm.value = {
    requirement_doc_id: doc.id,
    task_name_prefix: '',
    max_cases_per_skill: 20,
    default_level: 'P2',
    extra_prompt: '',
  }
  smartResultData.value = null
  showSmartDialog.value = true
}

function handleCentralHubClick() {
  if (isPipelineInProgress.value) return
  if (latestDoc.value && latestDocParsed.value) {
    openSmartGenerate(latestDoc.value)
    return
  }
  if (!latestDoc.value) {
    showUploadDialog.value = true
  }
}

async function submitSmartGenerate() {
  smartStageStartedAt.value = Date.now()
  triggerActiveCooldown(15000)
  const result = await handleSmartGenerate(smartForm.value)
  if (!result) return
  smartResultData.value = result
  triggerActiveCooldown(5000)
  startTaskPoll()
}

function onSmartDialogClose() {
  showSmartDialog.value = false
}

function goToTaskRecords() {
  router.push({ name: 'RequirementGenTasks' })
}

function goToResults() {
  router.push({
    name: 'RequirementGenResults',
    query: latestDoc.value ? { docId: latestDoc.value.id } : {},
  })
}
</script>

<template>
  <div class="requirement-gen-page" :class="{ 'is-dark': isGenArtTheme }">
    <div ref="mouseGlowEl" class="mouse-glow"></div>
    <div class="grid-overlay"></div>
    <div class="ambient-glow"></div>

    <main class="intel-canvas">
      <canvas ref="particlesCanvas" class="particles-canvas"></canvas>

      <section class="floating-panel status-panel">
        <div class="panel-title">
          <span class="panel-title-left">
            <span class="panel-dot"></span>
            SYSTEM STATUS
          </span>
          <em class="streaming-tag">{{ activeEngineStatus === '待机' ? 'IDLE' : 'STREAMING' }}</em>
        </div>
        <div class="panel-lines">
          <div class="panel-row">
            <span>Engine Ver:</span>
            <strong>v2.8.4-ALPHA</strong>
          </div>
          <div class="panel-row">
            <span>Latency:</span>
            <strong class="cyan">{{ latencyVal }}ms</strong>
          </div>
          <div class="panel-row">
            <span>Processing:</span>
            <strong>{{ isSystemActive ? '94.2 TFLOPS' : 'Idle' }}</strong>
          </div>
          <!-- beam-in 数据流光束 -->
          <div class="beam-overlay">
            <div class="beam beam-1"></div>
            <div class="beam beam-2"></div>
          </div>
        </div>
      </section>

      <section class="floating-panel diagnostic-panel">
        <div class="panel-title">
          <span>AI DIAGNOSTICS</span>
          <span class="material-symbols-outlined panel-icon">bolt</span>
        </div>
        <div class="panel-lines">
          <div class="panel-row">
            <span>Model:</span>
            <strong class="primary-text">{{ diagnosticsModelName }}</strong>
          </div>
          <div class="panel-row">
            <span>Skill Match:</span>
            <strong class="primary-text">{{ diagnosticsSkillMatch }}</strong>
          </div>
          <div class="panel-row">
            <span>Token Flux:</span>
            <strong>{{ isSystemActive ? '1.2k/sec' : '0.0k/sec' }}</strong>
          </div>
        </div>
      </section>

      <section
        class="central-zone"
        :class="{ 'is-generating': smartGenerating, 'is-active': isSystemActive }"
      >
        <!-- SVG 能量环 -->
        <div class="svg-rings-wrap">
          <svg class="svg-rings" viewBox="0 0 100 100" aria-hidden="true">
            <circle
              cx="50"
              cy="50"
              r="48"
              fill="none"
              stroke="currentColor"
              stroke-width="0.1"
              class="ring-outer"
            />
            <g class="ring-group ring-group-mid">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="currentColor"
                stroke-dasharray="1,4"
                stroke-width="0.3"
                class="ring-mid"
              />
            </g>
            <g class="ring-group ring-group-inner">
              <circle
                cx="50"
                cy="50"
                r="35"
                fill="none"
                stroke="currentColor"
                stroke-dasharray="5,10"
                stroke-width="0.2"
                class="ring-inner"
              />
            </g>
          </svg>
        </div>

        <!-- CSS 旋转轨道（圆形，idle 态显示） -->
        <div class="orbit orbit-one"></div>
        <div class="orbit orbit-two"></div>
        <div class="orbit orbit-three"></div>
        <div class="orbit orbit-four"></div>
        <!-- Active 态几何多边形（对标设计图，仅 active 时可见） -->
        <div class="polygon polygon-1"></div>
        <div class="polygon polygon-2"></div>
        <div class="polygon polygon-3"></div>
        <div class="polygon polygon-4"></div>

        <!-- SVG 连接线 -->
        <div class="data-lines-wrap">
          <svg class="data-lines" viewBox="0 0 1000 1000" aria-hidden="true">
            <defs>
              <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#b6c4ff" stop-opacity="1" />
                <stop offset="100%" stop-color="transparent" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path class="data-line" d="M500,500 L700,300" stroke="url(#lineGrad)" />
            <path class="data-line dl-2" d="M500,500 L300,700" stroke="url(#lineGrad)" />
            <path class="data-line dl-3" d="M500,500 L300,300" stroke="url(#lineGrad)" />
            <path class="data-line dl-4" d="M500,500 L700,700" stroke="url(#lineGrad)" />
          </svg>
        </div>

        <!-- 中央 Hub（圆形） -->
        <button
          class="central-hub"
          :class="{ 'is-idle': !isPipelineInProgress }"
          type="button"
          :aria-label="centralHubAriaLabel"
          @click="handleCentralHubClick"
        >
          <span class="material-symbols-outlined hub-icon">psychology</span>
          <template v-if="isPipelineInProgress">
            <strong class="hub-number glitch-effect">
              {{ centralNumber }}
            </strong>
            <em class="hub-label">PROGRESS</em>
          </template>
          <template v-else>
            <strong class="hub-idle-title">{{ centralIdleTitle }}</strong>
          </template>
        </button>

        <!-- 浮动数据节点 -->
        <div class="float-node node-1">
          <span class="node-dot dot-tertiary"></span>
          <span class="node-text">Business Flow</span>
        </div>
        <div class="float-node node-2">
          <span class="node-dot dot-secondary"></span>
          <span class="node-text">Data Integrity</span>
        </div>
        <div class="float-node node-3">
          <span class="node-dot dot-error"></span>
          <span class="node-text">Security Pulse</span>
        </div>
        <div class="float-node node-4">
          <span class="node-dot dot-primary"></span>
          <span class="node-text">UX Logic</span>
        </div>
      </section>

      <transition name="fade-slide">
        <div v-if="showPipelineFooter" class="pipeline-footer">
          <div class="pipeline-inner">
            <div class="pipeline-steps">
              <template v-for="(step, idx) in pipelineSteps" :key="step.no">
                <div
                  class="pipeline-step"
                  :class="{ active: step.active, completed: step.completed }"
                >
                  <div class="step-head">
                    <div class="step-no">
                      <span v-if="step.completed" class="material-symbols-outlined step-check">
                        check_circle
                      </span>
                      <span v-else>{{ step.no }}</span>
                    </div>
                    <h3 class="step-title">{{ step.title }}</h3>
                  </div>
                  <div class="step-track">
                    <i :style="{ width: step.progress + '%' }"></i>
                    <b v-if="step.active"></b>
                  </div>
                  <p class="step-desc">{{ step.desc }}</p>
                </div>
                <div v-if="idx < pipelineSteps.length - 1" class="step-chevron">
                  <span class="material-symbols-outlined">chevron_right</span>
                </div>
              </template>
            </div>
          </div>
        </div>
      </transition>

      <button class="fab-btn records-fab-btn" type="button" @click="goToTaskRecords">
        <div class="fab-border">
          <div class="fab-inner">
            <span class="material-symbols-outlined">history</span>
            <span class="fab-label">TASK RECORDS</span>
          </div>
        </div>
      </button>

      <button class="fab-btn gitlab-fab-btn" type="button" @click="openGitLabDialog">
        <div class="fab-border">
          <div class="fab-inner">
            <span class="material-symbols-outlined">merge</span>
            <span class="fab-label">GITLAB ISSUE</span>
          </div>
        </div>
      </button>

      <button
        class="fab-btn new-requirement-fab-btn"
        type="button"
        @click="showUploadDialog = true"
      >
        <div class="fab-border">
          <div class="fab-inner">
            <span class="material-symbols-outlined">add_task</span>
            <span class="fab-label">NEW REQUIREMENT</span>
          </div>
        </div>
      </button>
    </main>

    <el-dialog
      v-model="showUploadDialog"
      title="上传需求文档"
      width="540px"
      class="requirement-upload-dialog"
    >
      <el-form class="upload-dialog-form" label-position="top">
        <el-form-item label="需求文件" class="upload-file-form-item">
          <el-upload
            class="upload-doc-uploader"
            :auto-upload="false"
            :disabled="uploading"
            :show-file-list="false"
            accept=".docx,.pdf,.md,.txt"
            @change="onFileChange"
          >
            <div class="upload-select-card">
              <span class="material-symbols-outlined upload-select-icon">upload_file</span>
              <span class="upload-select-main">
                <strong class="upload-select-title" :title="uploadFile?.name || ''">
                  {{ uploadFile ? uploadFile.name : '选择需求文档' }}
                </strong>
                <span class="upload-select-desc">支持 docx、pdf、md、txt 格式，最大 10MB</span>
              </span>
              <span class="upload-select-action">
                {{ uploadFile ? '重新选择' : '选择文件' }}
              </span>
            </div>
          </el-upload>
        </el-form-item>
        <div class="upload-dialog-fields">
          <el-form-item label="标题">
            <el-input
              v-model="uploadTitle"
              class="upload-dialog-input"
              clearable
              placeholder="文档标题（默认使用文件名）"
            />
          </el-form-item>
          <el-form-item label="备注">
            <el-input
              v-model="uploadRemark"
              class="upload-dialog-input"
              clearable
              placeholder="可选备注"
            />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <div class="upload-dialog-footer">
          <el-button @click="showUploadDialog = false">取消</el-button>
          <el-button
            type="primary"
            :disabled="!uploadFile || uploading"
            :loading="uploading"
            @click="submitUpload"
          >
            确定上传
          </el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="showPasteDialog" title="粘贴需求文本" width="600px">
      <el-form label-width="80px">
        <el-form-item label="标题">
          <el-input v-model="pasteTitle" placeholder="文档标题" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input
            v-model="pasteContent"
            type="textarea"
            :rows="12"
            placeholder="粘贴需求文本内容..."
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="pasteRemark" placeholder="可选备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPasteDialog = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="!pasteTitle || !pasteContent || pasting"
          :loading="pasting"
          @click="submitPaste"
        >
          确定创建
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showGitLabDialog"
      title="导入 GitLab Issue"
      width="680px"
      class="gitlab-import-dialog requirement-upload-dialog"
      :close-on-click-modal="false"
    >
      <el-form class="gitlab-dialog-form" label-position="top">
        <section class="gitlab-dialog-section">
          <div class="gitlab-section-head">
            <div>
              <h3>GitLab 连接</h3>
              <p>{{ gitLabConfigStatusText }}</p>
            </div>
            <el-tag size="small" :type="gitLabConfigReady ? 'success' : 'warning'" effect="plain">
              {{ gitLabConfigReady ? '已配置' : '待配置' }}
            </el-tag>
          </div>
          <div class="gitlab-config-grid">
            <el-form-item label="GitLab 地址">
              <el-input
                v-model="gitLabBaseURL"
                class="upload-dialog-input"
                placeholder="https://gitlab.example.com"
                clearable
              />
            </el-form-item>
            <el-form-item label="项目路径">
              <el-input
                v-model="gitLabProjectPath"
                class="upload-dialog-input"
                placeholder="group/project"
                clearable
              />
            </el-form-item>
          </div>
          <el-form-item label="访问 Token">
            <el-input
              v-model="gitLabToken"
              class="upload-dialog-input"
              type="password"
              show-password
              :placeholder="
                gitLabHasSavedToken ? '留空则保留已保存 Token' : '仅保存到后端，推荐 read_api 权限'
              "
            />
          </el-form-item>
          <div class="gitlab-config-actions">
            <el-checkbox v-model="gitLabEnabled">启用 GitLab 集成</el-checkbox>
            <div class="gitlab-action-buttons">
              <el-button
                :loading="gitLabConfigSaving"
                :disabled="!canSaveGitLabConfig"
                @click="submitGitLabConfig"
              >
                保存配置
              </el-button>
              <el-button
                :loading="gitLabTesting"
                :disabled="!gitLabConfigReady"
                @click="submitGitLabTest"
              >
                测试连接
              </el-button>
            </div>
          </div>
        </section>

        <section class="gitlab-dialog-section">
          <div class="gitlab-section-head">
            <div>
              <h3>Issue 导入</h3>
              <p>标题、描述和可选评论会转换成已解析需求文档</p>
            </div>
          </div>
          <el-form-item label="Issue URL">
            <el-input
              v-model="gitLabIssueURL"
              class="upload-dialog-input"
              placeholder="https://gitlab.example.com/group/project/-/issues/123"
              clearable
            />
          </el-form-item>
          <div class="gitlab-option-list">
            <label class="gitlab-option-toggle">
              <el-checkbox v-model="gitLabIncludeComments">包含用户评论</el-checkbox>
              <span>适合验收标准或补充说明写在评论里的需求</span>
            </label>
            <label class="gitlab-option-toggle">
              <el-checkbox v-model="gitLabAnalyzeImages">分析图片附件</el-checkbox>
              <span>识别描述和评论中的截图、流程图、原型图，最多分析 6 张</span>
            </label>
          </div>
        </section>
      </el-form>
      <template #footer>
        <div class="upload-dialog-footer">
          <el-button @click="showGitLabDialog = false">取消</el-button>
          <el-button
            type="primary"
            :loading="gitLabImporting"
            :disabled="!canImportGitLabIssue"
            @click="submitGitLabImport"
          >
            导入 Issue
          </el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showSmartDialog"
      title="智能生成测试用例"
      width="620px"
      :close-on-click-modal="false"
    >
      <div v-if="!smartResultData">
        <div class="smart-doc-info">
          <span class="smart-doc-label">目标文档：</span>
          <span class="smart-doc-name">{{ smartDocTitle }}</span>
        </div>
        <el-form :model="smartForm" label-width="120px" style="margin-top: 12px">
          <el-form-item label="任务名前缀">
            <el-input v-model="smartForm.task_name_prefix" placeholder="可选，留空则使用文档标题" />
          </el-form-item>
          <el-form-item label="每类最大条数">
            <el-input-number v-model="smartForm.max_cases_per_skill" :min="5" :max="50" />
            <span class="form-tip" style="margin-left: 8px">每个匹配策略最多生成的用例数</span>
          </el-form-item>
          <el-form-item label="默认优先级">
            <el-select v-model="smartForm.default_level" style="width: 120px">
              <el-option label="P0" value="P0" />
              <el-option label="P1" value="P1" />
              <el-option label="P2" value="P2" />
              <el-option label="P3" value="P3" />
            </el-select>
          </el-form-item>
          <el-form-item label="补充提示">
            <el-input
              v-model="smartForm.extra_prompt"
              type="textarea"
              :rows="2"
              placeholder="对 AI 的额外说明（可选）"
            />
          </el-form-item>
          <div class="smart-hint">
            <el-icon><InfoFilled /></el-icon>
            <span>AI 将自动分析需求特征，匹配最适合的测试策略并批量生成测试用例</span>
          </div>
        </el-form>
      </div>
      <div v-else class="smart-result">
        <div class="smart-result-header">
          <el-icon color="var(--el-color-success)"><SuccessFilled /></el-icon>
          <span>
            已匹配 {{ smartResultData.recommended_skills.length }} 个测试策略，创建
            {{ smartResultData.created_tasks.length }} 个生成任务
          </span>
        </div>
        <div class="smart-result-list">
          <div
            v-for="rec in smartResultData.recommended_skills"
            :key="rec.skill_key"
            class="smart-result-item"
          >
            <el-tag size="small" type="info">{{ rec.skill_key }}</el-tag>
            <span class="rec-reason">{{ rec.reason }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <span v-if="!smartResultData">
          <el-button @click="onSmartDialogClose">取消</el-button>
          <el-button type="primary" :loading="smartGenerating" @click="submitSmartGenerate">
            {{ smartGenerating ? 'AI 分析中...' : '开始智能生成' }}
          </el-button>
        </span>
        <span v-else>
          <el-button @click="goToResults">查看结果</el-button>
          <el-button type="primary" @click="onSmartDialogClose">完成</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ═══════ Base ═══════ */
.requirement-gen-page {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 100vh;
  overflow: hidden;
  color: #e1e2eb;
  font-family: 'Inter', sans-serif;
  background: #000;
}

/* ═══════ Mouse Glow ═══════ */
.mouse-glow {
  position: fixed;
  inset: 0;
  z-index: 10;
  pointer-events: none;
  background: radial-gradient(
    600px circle at var(--x) var(--y),
    rgba(182, 196, 255, 0.06),
    transparent 40%
  );
}

/* ═══════ Particles Canvas ═══════ */
.particles-canvas {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

.grid-overlay,
.ambient-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.grid-overlay {
  display: none;
  background-image: radial-gradient(rgba(182, 196, 255, 0.04) 1px, transparent 1px);
  background-size: 32px 32px;
}

.ambient-glow {
  display: none;
  background: linear-gradient(
    135deg,
    rgba(182, 196, 255, 0.08),
    transparent,
    rgba(216, 185, 255, 0.08)
  );
  animation: pulse-glow 8s ease-in-out infinite;
}

/* ═══════ Canvas ═══════ */
.intel-canvas {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ═══════ Floating Panels ═══════ */
.floating-panel {
  position: absolute;
  z-index: 30;
  width: 288px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  background: rgba(16, 19, 26, 0.6);
  backdrop-filter: blur(16px);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.floating-panel:hover {
  background: rgba(29, 32, 38, 0.7);
  border-color: rgba(182, 196, 255, 0.2);
  transform: translateY(-4px);
  box-shadow:
    0 10px 30px -10px rgba(0, 0, 0, 0.5),
    0 0 20px rgba(182, 196, 255, 0.05);
}

.status-panel {
  top: 24px;
  left: 24px;
}

.diagnostic-panel {
  top: 24px;
  right: 24px;
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.05em;
  color: rgba(196, 197, 215, 0.6);
  text-transform: uppercase;
}

.panel-title-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: #00dce5;
  box-shadow: 0 0 8px rgba(0, 220, 229, 0.5);
  animation: dot-pulse 2s ease-in-out infinite;
}

.streaming-tag {
  font-size: 10px;
  color: rgba(0, 220, 229, 0.6);
  animation: blink-tag 2s ease-in-out infinite;
  font-style: normal;
}

.panel-icon {
  font-size: 16px;
  color: #b6c4ff;
  animation: blink-tag 2s ease-in-out infinite;
}

.panel-lines {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  line-height: 20px;
  letter-spacing: 0.02em;
}

.panel-row {
  display: flex;
  justify-content: space-between;
}

.panel-row span {
  color: rgba(196, 197, 215, 0.6);
}

.panel-row strong {
  color: #e1e2eb;
  font-weight: 500;
}

.panel-row .cyan {
  color: #00dce5;
}

.panel-row .primary-text {
  color: #b6c4ff;
}

/* ═══════ Central Zone ═══════ */
.central-zone {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.central-zone::before {
  content: '';
  position: absolute;
  z-index: 2;
  width: 760px;
  height: 760px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(16, 10, 28, 0.52) 0%,
    rgba(7, 5, 14, 0.34) 38%,
    rgba(0, 0, 0, 0) 70%
  );
  pointer-events: none;
}

.central-zone::after {
  content: '';
  position: absolute;
  z-index: 3;
  width: 360px;
  height: 360px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(162, 89, 255, 0.14) 0%,
    rgba(100, 116, 255, 0.06) 42%,
    rgba(0, 0, 0, 0) 72%
  );
  filter: blur(18px);
  pointer-events: none;
}

.orbit {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  display: none;
}

.orbit-one {
  width: 600px;
  height: 600px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  animation: orbit-drift-cw 22s ease-in-out infinite;
}

.orbit-two {
  width: 520px;
  height: 520px;
  border: 1.5px dashed rgba(182, 196, 255, 0.15);
  animation: orbit-drift-ccw 14s ease-in-out infinite;
}

.orbit-three {
  width: 440px;
  height: 440px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  animation: orbit-drift-cw 30s ease-in-out infinite reverse;
}

.orbit-four {
  width: 380px;
  height: 380px;
  border: 1.5px dotted rgba(216, 185, 255, 0.25);
  animation: orbit-drift-ccw 18s ease-in-out infinite;
}

.data-lines-wrap {
  position: absolute;
  z-index: 10;
  width: 700px;
  height: 700px;
  pointer-events: none;
  opacity: 0.4;
}

.data-lines {
  width: 100%;
  height: 100%;
}

.data-line {
  fill: none;
  stroke: rgba(182, 196, 255, 0.5);
  stroke-dasharray: 10;
  stroke-width: 1;
  animation: line-glow 10s linear infinite;
}

.dl-2 {
  animation-delay: -2s;
}
.dl-3 {
  animation-delay: -4s;
}
.dl-4 {
  animation-delay: -6s;
}

.central-hub {
  position: relative;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 208px;
  height: 208px;
  border: 1px solid rgba(162, 89, 255, 0.5);
  border-radius: 16px;
  color: #e1e2eb;
  background: rgba(20, 14, 32, 0.85);
  backdrop-filter: blur(16px);
  cursor: pointer;
  animation: pulse-glow 4s ease-in-out infinite;
  box-shadow:
    0 0 60px rgba(162, 89, 255, 0.45),
    0 0 120px rgba(162, 89, 255, 0.2),
    inset 0 0 40px rgba(162, 89, 255, 0.08);
  transition:
    transform 0.3s ease,
    border-radius 0.6s ease,
    box-shadow 0.8s ease,
    border-color 0.8s ease,
    background 0.8s ease;
}

.central-hub:active {
  transform: scale(0.95);
}

.central-hub:focus-visible {
  outline: 2px solid rgba(182, 196, 255, 0.82);
  outline-offset: 4px;
}

.central-hub.is-idle {
  background:
    radial-gradient(circle at 50% 30%, rgba(182, 196, 255, 0.08), transparent 42%),
    rgba(18, 13, 29, 0.86);
  border-color: rgba(182, 196, 255, 0.28);
  animation: none;
  box-shadow:
    0 0 0 1px rgba(182, 196, 255, 0.05),
    inset 0 0 34px rgba(162, 89, 255, 0.05);
}

.hub-icon {
  color: #b6c4ff;
  font-size: 44px;
  margin-bottom: 4px;
}

.central-hub.is-idle .hub-icon {
  margin-bottom: 12px;
  color: rgba(182, 196, 255, 0.86);
  font-size: 42px;
}

.hub-number {
  font-family: 'Geist', sans-serif;
  font-size: 48px;
  line-height: 56px;
  font-weight: 700;
  letter-spacing: -0.02em;
  background: linear-gradient(to right, #b6c4ff, #d8b9ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hub-label {
  margin-top: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  line-height: 16px;
  letter-spacing: 0.1em;
  color: rgba(196, 197, 215, 0.6);
  text-transform: uppercase;
  font-style: normal;
}

.hub-idle-title {
  font-family: 'Geist', sans-serif;
  font-size: 22px;
  line-height: 28px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: rgba(226, 232, 255, 0.92);
}

/* ═══════ Active Polygons (严格对标 code.html 的 4 个旋转环) ═══════ */
/* code.html 的 tailwind config 里 borderRadius.full = 0.75rem = 12px，所以所有 rounded-full 实际是圆角方形 */
.polygon {
  position: absolute;
  z-index: 12;
  pointer-events: none;
  opacity: 1;
  border-radius: 12px;
}

/* 100% 还原 code.html 第 281-284 行的 4 个 rounded-full 方形：
   <div class="absolute w-[600px] h-[600px] rounded-full border border-white/5 animate-rotate"></div>
   <div class="absolute w-[520px] h-[520px] rounded-full border border-dashed border-primary/10 animate-rotate-fast"></div>
   <div class="absolute w-[440px] h-[440px] rounded-full border border-white/5 animate-rotate-rev"></div>
   <div class="absolute w-[380px] h-[380px] rounded-full border border-dotted border-secondary/20 animate-rotate"></div>
*/
.polygon-1 {
  width: 600px;
  height: 600px;
  border: 1px solid rgba(108, 122, 220, 0.11);
  animation: rotate-slow 25s linear infinite;
}

.polygon-2 {
  width: 520px;
  height: 520px;
  border: 1px dashed rgba(126, 146, 255, 0.22);
  animation: rotate-slow 15s linear infinite;
}

.polygon-3 {
  width: 440px;
  height: 440px;
  border: 1px solid rgba(88, 102, 190, 0.14);
  animation: rotate-reverse 35s linear infinite;
}

.polygon-4 {
  width: 380px;
  height: 380px;
  border: 1px dotted rgba(174, 134, 255, 0.34);
  animation: rotate-slow 25s linear infinite;
}

/* ═══════ Pipeline Footer Transition ═══════ */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition:
    opacity 0.5s ease,
    transform 0.5s ease;
}
.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(24px);
}

/* ═══════ Pipeline Footer ═══════ */
.pipeline-footer {
  position: relative;
  z-index: 20;
  padding: 16px 48px 48px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.96), rgba(0, 0, 0, 0.78) 58%, transparent);
}

.pipeline-inner {
  max-width: 1440px;
  margin: 0 auto;
}

.pipeline-steps {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.pipeline-step {
  flex: 1;
  min-width: 0;
}

.step-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.step-no {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 9999px;
  border: 1px solid rgba(182, 196, 255, 0.22);
  background: rgba(20, 24, 36, 0.92);
  color: rgba(196, 197, 215, 0.74);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 500;
  flex-shrink: 0;
}

.step-title {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  line-height: 20px;
  letter-spacing: 0.02em;
  font-weight: 500;
  color: rgba(196, 197, 215, 0.72);
  margin: 0;
  white-space: nowrap;
}

.pipeline-step.active .step-no {
  background: rgba(182, 196, 255, 0.28);
  border-color: rgba(182, 196, 255, 0.72);
  color: #d8e0ff;
  box-shadow: 0 0 0 3px rgba(182, 196, 255, 0.08);
}

.pipeline-step.active .step-title {
  color: #d8e0ff;
}

.pipeline-step.active .step-desc {
  color: rgba(216, 224, 255, 0.82);
}

/* ── 完成态 ── */
.pipeline-step.completed .step-no {
  background: rgba(0, 220, 180, 0.15);
  border-color: rgba(0, 220, 180, 0.4);
  color: #00dcb4;
}

.pipeline-step.completed .step-title {
  color: #00dcb4;
}

.pipeline-step.completed .step-track i {
  background: rgba(0, 220, 180, 0.5);
}

.pipeline-step.completed .step-desc {
  color: rgba(0, 220, 180, 0.7);
}

.step-check {
  font-size: 16px;
  line-height: 1;
}

.step-track {
  position: relative;
  height: 4px;
  border-radius: 9999px;
  background: rgba(88, 96, 122, 0.42);
  overflow: hidden;
}

.step-track i {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: rgba(182, 196, 255, 0.52);
  transition: width 1.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.step-track b {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(90deg, transparent, rgba(182, 196, 255, 0.4), transparent);
  background-size: 200% 100%;
  animation: flow-progress 2s linear infinite;
}

.pipeline-step.active .step-track i {
  background: #b6c4ff;
}

.step-desc {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 20px;
  color: rgba(196, 197, 215, 0.56);
}

.step-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  flex-shrink: 0;
  opacity: 0.34;
}

.step-chevron .material-symbols-outlined {
  font-size: 14px;
  color: #e1e2eb;
}

/* ═══════ FAB Button ═══════ */
.fab-btn {
  position: absolute;
  bottom: 48px;
  right: 48px;
  z-index: 50;
  width: 252px;
  border: none;
  background: none;
  cursor: pointer;
  transition: all 0.5s ease;
}

.fab-btn:hover {
  transform: scale(1.05);
}

.fab-btn:active {
  transform: scale(0.95);
}

.new-requirement-fab-btn {
  bottom: 48px;
}

.records-fab-btn {
  bottom: 118px;
}

.gitlab-fab-btn {
  bottom: 188px;
}

.fab-border {
  width: 100%;
  padding: 1.5px;
  border-radius: 9999px;
  background: linear-gradient(to right, #b6c4ff, #d8b9ff);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.fab-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px 24px;
  border-radius: 9999px;
  background: #0b0e14;
}

.fab-inner .material-symbols-outlined {
  color: #b6c4ff;
  font-size: 24px;
}

.fab-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  line-height: 20px;
  letter-spacing: 0.02em;
  font-weight: 700;
  color: #e1e2eb;
}

/* ═══════ Active State (parsing / running / generating) ═══════ */
/* 对标设计图：圆环+方形+SVG线始终同时显示，Active 态仅隐藏浮动节点 */
.is-active .float-node {
  opacity: 0;
  transition: opacity 0.6s ease;
}

/* ═══════ Generating State (smart generate) - 加速漂移 ═══════ */
.is-generating .polygon-1 {
  animation-duration: 10s;
}
.is-generating .polygon-2 {
  animation-duration: 8s;
}
.is-generating .polygon-3 {
  animation-duration: 12s;
}
.is-generating .polygon-4 {
  animation-duration: 9s;
}

.is-generating .central-hub {
  box-shadow:
    0 0 80px rgba(162, 89, 255, 0.55),
    0 0 160px rgba(162, 89, 255, 0.3),
    inset 0 0 50px rgba(162, 89, 255, 0.12);
}

/* ═══════ SVG Energy Rings ═══════ */
.svg-rings-wrap {
  position: absolute;
  z-index: 8;
  width: 700px;
  height: 700px;
  pointer-events: none;
}

.svg-rings {
  width: 100%;
  height: 100%;
  opacity: 0.58;
  overflow: hidden;
}

.ring-outer {
  color: rgba(67, 70, 85, 1);
}

.ring-mid {
  color: #b6c4ff;
}

.ring-inner {
  color: #d8b9ff;
}

/* 两个虚线圆形漂移：translate 在 SVG user units 空间生效，1 unit ≈ 7px
   两个圈共用 30s cycle，但有 3 段节奏：
   0-33%   大圈（mid）独走（小圈隐藏）
   33-66%  小圈（inner）独走（大圈隐藏）
   66-100% 两圈同时出来交叉
   每个圈的两次出现走不同方向，避免重复 */
.ring-group {
  transform-origin: 50px 50px;
  transform-box: view-box;
  will-change: transform, opacity;
}

.ring-group-mid {
  animation: ring-mid-cycle 30s linear infinite;
}

.ring-group-inner {
  animation: ring-inner-cycle 30s linear infinite;
}

/* ═══════ Floating Data Nodes ═══════ */
.float-node {
  position: absolute;
  z-index: 25;
  display: none;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-radius: 9999px;
  background: rgba(16, 19, 26, 0.6);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  animation: float-node 6s ease-in-out infinite;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.float-node:hover {
  background: rgba(29, 32, 38, 0.7);
  border-color: rgba(182, 196, 255, 0.2);
  transform: translateY(-4px);
}

.node-1 {
  transform: translate(210px, -210px);
  border-color: rgba(0, 220, 229, 0.2);
}

.node-2 {
  transform: translate(-240px, 145px);
  animation-delay: -2s;
  border-color: rgba(216, 185, 255, 0.2);
}

.node-3 {
  transform: translate(-175px, -175px);
  animation-delay: -4s;
  border-color: rgba(255, 180, 171, 0.2);
}

.node-4 {
  transform: translate(145px, 210px);
  animation-delay: -1.5s;
  border-color: rgba(182, 196, 255, 0.2);
}

.node-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-tertiary {
  background: #00dce5;
  box-shadow: 0 0 8px rgba(0, 220, 229, 0.5);
}

.dot-secondary {
  background: #d8b9ff;
  box-shadow: 0 0 8px rgba(216, 185, 255, 0.5);
}

.dot-error {
  background: #ffb4ab;
  box-shadow: 0 0 8px rgba(255, 180, 171, 0.5);
}

.dot-primary {
  background: #b6c4ff;
  box-shadow: 0 0 8px rgba(182, 196, 255, 0.5);
}

.node-text {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  line-height: 20px;
  letter-spacing: 0.02em;
  color: #e1e2eb;
  white-space: nowrap;
}

/* ═══════ Glitch Hover Effect ═══════ */
.glitch-effect:hover {
  animation: glitch 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) both infinite;
}

/* ═══════ Beam-in Data Stream ═══════ */
.beam-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.1;
  overflow: hidden;
}

.beam {
  height: 1px;
  width: 100%;
  background: linear-gradient(90deg, transparent, #00dce5, transparent);
  animation: beam-in 3s infinite;
}

.beam-2 {
  animation-duration: 5s;
  animation-delay: 1s;
}

/* ═══════ Dialog Styles ═══════ */
.smart-doc-info,
.smart-result,
.task-detail-body {
  color: var(--tp-text-primary);
}

.smart-doc-label,
.form-tip,
.rec-reason {
  color: var(--tp-text-muted);
}

.smart-result-header,
.smart-result-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.smart-result-header {
  margin-bottom: 12px;
}

.smart-result-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.smart-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--tp-text-muted);
  font-size: 13px;
}

.requirement-upload-dialog {
  --upload-dialog-panel: #111620;
  --upload-dialog-sunken: #0c1018;
  --upload-dialog-input-bg: #090d13;
  --upload-dialog-input-focus: #0b1018;
  --upload-dialog-text: #e1e2eb;
  --upload-dialog-accent: #b6c4ff;
  --upload-dialog-accent-hover: #ced8ff;
  --upload-dialog-label: rgba(196, 197, 215, 0.68);
  --upload-dialog-muted: rgba(196, 197, 215, 0.58);
  --upload-dialog-placeholder: rgba(196, 197, 215, 0.4);
  --upload-dialog-disabled: rgba(196, 197, 215, 0.38);
  --upload-dialog-border: rgba(182, 196, 255, 0.18);
  --upload-dialog-border-soft: rgba(182, 196, 255, 0.12);
  --upload-dialog-border-strong: rgba(182, 196, 255, 0.58);
  --upload-dialog-soft: rgba(182, 196, 255, 0.08);
  --upload-dialog-soft-hover: rgba(182, 196, 255, 0.1);
  --upload-dialog-ring: rgba(182, 196, 255, 0.1);
}

.requirement-upload-dialog :deep(.el-dialog) {
  overflow: hidden;
  border: 1px solid var(--upload-dialog-border);
  border-radius: 18px;
  background: var(--upload-dialog-panel);
  box-shadow:
    0 28px 80px rgba(0, 0, 0, 0.48),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.requirement-upload-dialog :deep(.el-dialog__header) {
  display: flex;
  align-items: center;
  min-height: 64px;
  margin: 0;
  padding: 0 24px;
  border-bottom: 1px solid var(--upload-dialog-border-soft);
}

.requirement-upload-dialog :deep(.el-dialog__title) {
  color: var(--upload-dialog-text);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.requirement-upload-dialog :deep(.el-dialog__headerbtn) {
  top: 16px;
  right: 18px;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  transition:
    background 0.18s ease,
    color 0.18s ease;
}

.requirement-upload-dialog :deep(.el-dialog__headerbtn:hover) {
  background: var(--upload-dialog-soft);
}

.requirement-upload-dialog :deep(.el-dialog__close) {
  color: color-mix(in srgb, var(--upload-dialog-text) 72%, transparent);
}

.requirement-upload-dialog :deep(.el-dialog__body) {
  padding: 22px 24px 18px;
}

.requirement-upload-dialog :deep(.el-dialog__footer) {
  padding: 16px 24px 22px;
  border-top: 1px solid var(--upload-dialog-border-soft);
}

.upload-dialog-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.upload-dialog-form :deep(.el-form-item) {
  margin-bottom: 0;
}

.upload-dialog-form :deep(.el-form-item__label) {
  margin-bottom: 8px;
  color: var(--upload-dialog-label);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
}

.upload-doc-uploader {
  width: 100%;
}

.upload-doc-uploader :deep(.el-upload) {
  width: 100%;
  outline: none;
}

.upload-file-form-item {
  margin-bottom: 2px;
}

.upload-select-card {
  display: flex;
  align-items: center;
  min-height: 82px;
  padding: 16px;
  gap: 14px;
  border: 1px dashed color-mix(in srgb, var(--upload-dialog-accent) 28%, transparent);
  border-radius: 16px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--upload-dialog-accent) 5.5%, transparent),
      color-mix(in srgb, var(--upload-dialog-accent) 1.8%, transparent)
    ),
    var(--upload-dialog-sunken);
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.upload-select-card:hover {
  border-color: color-mix(in srgb, var(--upload-dialog-accent) 50%, transparent);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--upload-dialog-accent) 9%, transparent),
      color-mix(in srgb, var(--upload-dialog-accent) 2.6%, transparent)
    ),
    var(--upload-dialog-sunken);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--upload-dialog-accent) 5%, transparent);
}

.upload-doc-uploader :deep(.el-upload:focus-visible) .upload-select-card {
  border-color: color-mix(in srgb, var(--upload-dialog-accent) 72%, transparent);
  box-shadow: 0 0 0 3px var(--upload-dialog-border-soft);
}

.upload-select-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border: 1px solid var(--upload-dialog-border);
  border-radius: 13px;
  background: var(--upload-dialog-soft);
  color: var(--upload-dialog-accent);
  font-size: 22px;
  line-height: 1;
}

.upload-select-main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  text-align: left;
}

.upload-select-title {
  overflow: hidden;
  color: var(--upload-dialog-text);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-select-desc {
  color: var(--upload-dialog-muted);
  font-size: 12px;
  line-height: 1.4;
}

.upload-select-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 76px;
  height: 32px;
  flex-shrink: 0;
  border: 1px solid var(--upload-dialog-border);
  border-radius: 10px;
  background: var(--upload-dialog-soft);
  color: var(--upload-dialog-accent);
  font-size: 12px;
  font-weight: 700;
}

.upload-dialog-fields {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.upload-dialog-input :deep(.el-input__wrapper) {
  min-height: 42px;
  border: 1px solid color-mix(in srgb, var(--upload-dialog-accent) 14%, transparent);
  border-radius: 13px;
  background: var(--upload-dialog-input-bg);
  box-shadow: none;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.upload-dialog-input :deep(.el-input__wrapper.is-focus) {
  border-color: var(--upload-dialog-border-strong);
  background: var(--upload-dialog-input-focus);
  box-shadow: 0 0 0 3px var(--upload-dialog-ring);
}

.upload-dialog-input :deep(.el-input__inner) {
  color: var(--upload-dialog-text);
  font-size: 13px;
}

.upload-dialog-input :deep(.el-input__inner::placeholder) {
  color: var(--upload-dialog-placeholder);
}

.upload-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.requirement-upload-dialog :deep(.el-button) {
  min-height: 36px;
  padding: 0 16px;
  border-radius: 11px;
  font-size: 13px;
  font-weight: 700;
}

.requirement-upload-dialog :deep(.el-button:not(.el-button--primary)) {
  border-color: color-mix(in srgb, var(--upload-dialog-accent) 14%, transparent);
  background: color-mix(in srgb, var(--upload-dialog-accent) 6%, transparent);
  color: color-mix(in srgb, var(--upload-dialog-text) 82%, transparent);
}

.requirement-upload-dialog :deep(.el-button:not(.el-button--primary):hover) {
  border-color: color-mix(in srgb, var(--upload-dialog-accent) 30%, transparent);
  background: var(--upload-dialog-soft-hover);
  color: var(--upload-dialog-text);
}

.requirement-upload-dialog :deep(.el-button--primary) {
  border-color: color-mix(in srgb, var(--upload-dialog-accent) 64%, transparent);
  background: var(--upload-dialog-accent);
  color: var(--upload-dialog-sunken);
  box-shadow: 0 10px 26px var(--upload-dialog-border);
}

.requirement-upload-dialog :deep(.el-button--primary:hover) {
  border-color: color-mix(in srgb, var(--upload-dialog-accent-hover) 82%, transparent);
  background: var(--upload-dialog-accent-hover);
  color: var(--upload-dialog-sunken);
}

.requirement-upload-dialog :deep(.el-button.is-disabled),
.requirement-upload-dialog :deep(.el-button.is-disabled:hover) {
  border-color: var(--upload-dialog-border-soft);
  background: var(--upload-dialog-soft);
  color: var(--upload-dialog-disabled);
  box-shadow: none;
}

.requirement-upload-dialog {
  --upload-dialog-panel: #111722;
  --upload-dialog-sunken: #0b1018;
  --upload-dialog-input-bg: rgba(7, 10, 16, 0.82);
  --upload-dialog-input-focus: rgba(10, 15, 24, 0.96);
  --upload-dialog-text: #f1f3fb;
  --upload-dialog-accent: #b6c4ff;
  --upload-dialog-accent-hover: #d0d8ff;
  --upload-dialog-label: rgba(225, 226, 235, 0.72);
  --upload-dialog-muted: rgba(196, 197, 215, 0.68);
  --upload-dialog-placeholder: rgba(196, 197, 215, 0.42);
  --upload-dialog-disabled: rgba(196, 197, 215, 0.36);
  --upload-dialog-border: rgba(182, 196, 255, 0.2);
  --upload-dialog-border-soft: rgba(182, 196, 255, 0.12);
  --upload-dialog-border-strong: rgba(182, 196, 255, 0.62);
  --upload-dialog-soft: rgba(182, 196, 255, 0.085);
  --upload-dialog-soft-hover: rgba(182, 196, 255, 0.14);
  --upload-dialog-ring: rgba(182, 196, 255, 0.14);
}

.requirement-upload-dialog :deep(.el-dialog) {
  width: min(540px, calc(100vw - 48px)) !important;
  border-color: rgba(182, 196, 255, 0.22);
  border-radius: 20px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 42%), var(--upload-dialog-panel);
  box-shadow:
    0 28px 72px rgba(0, 0, 0, 0.56),
    0 0 0 1px rgba(255, 255, 255, 0.025) inset;
}

.requirement-upload-dialog :deep(.el-dialog__header) {
  min-height: 60px;
  padding: 0 20px;
}

.requirement-upload-dialog :deep(.el-dialog__title) {
  font-size: 16px;
  letter-spacing: 0;
}

.requirement-upload-dialog :deep(.el-dialog__body) {
  padding: 18px 20px 16px;
}

.requirement-upload-dialog :deep(.el-dialog__footer) {
  padding: 14px 20px 18px;
  background: rgba(8, 12, 18, 0.28);
}

.upload-dialog-form {
  gap: 16px;
}

.upload-dialog-form :deep(.el-form-item__label) {
  margin-bottom: 8px;
  color: var(--upload-dialog-label);
  font-size: 12px;
  font-weight: 700;
}

.upload-doc-uploader {
  display: block;
  width: 100%;
}

.upload-doc-uploader :deep(.el-upload) {
  display: block;
  width: 100%;
}

.upload-select-card {
  display: grid;
  width: 100%;
  min-height: 92px;
  box-sizing: border-box;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  align-items: center;
  padding: 16px 18px;
  gap: 14px;
  border: 1px solid rgba(182, 196, 255, 0.22);
  border-radius: 16px;
  background:
    linear-gradient(135deg, rgba(182, 196, 255, 0.11), rgba(255, 255, 255, 0.018) 54%), #0b1018;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.04) inset,
    0 14px 34px rgba(0, 0, 0, 0.16);
}

.upload-select-card:hover {
  border-color: rgba(182, 196, 255, 0.52);
  background:
    linear-gradient(135deg, rgba(182, 196, 255, 0.15), rgba(255, 255, 255, 0.026) 54%), #0d1320;
  box-shadow:
    0 0 0 3px rgba(182, 196, 255, 0.06),
    0 16px 36px rgba(0, 0, 0, 0.18);
}

.upload-select-icon {
  width: 46px;
  height: 46px;
  border-color: rgba(182, 196, 255, 0.24);
  border-radius: 15px;
  background: rgba(182, 196, 255, 0.105);
  color: var(--upload-dialog-accent);
  font-size: 23px;
}

.upload-select-main {
  gap: 6px;
}

.upload-select-title {
  color: var(--upload-dialog-text);
  font-size: 14px;
  letter-spacing: 0;
}

.upload-select-desc {
  color: var(--upload-dialog-muted);
  font-size: 12px;
}

.upload-select-action {
  min-width: 82px;
  height: 34px;
  border-color: rgba(182, 196, 255, 0.3);
  border-radius: 11px;
  background: rgba(182, 196, 255, 0.12);
  color: var(--upload-dialog-accent);
}

.upload-dialog-fields {
  gap: 12px;
}

.upload-dialog-input :deep(.el-input__wrapper) {
  min-height: 40px;
  border-color: rgba(182, 196, 255, 0.18);
  border-radius: 12px;
  background: var(--upload-dialog-input-bg);
}

.upload-dialog-input :deep(.el-input__wrapper:hover) {
  border-color: rgba(182, 196, 255, 0.32);
  background: rgba(9, 13, 21, 0.94);
}

.upload-dialog-input :deep(.el-input__wrapper.is-focus) {
  border-color: var(--upload-dialog-border-strong);
  box-shadow: 0 0 0 3px var(--upload-dialog-ring);
}

.upload-dialog-footer {
  gap: 8px;
}

.requirement-upload-dialog :deep(.el-button) {
  height: 36px !important;
  min-height: 36px !important;
  padding: 0 15px !important;
  border-radius: 11px !important;
}

.requirement-upload-dialog :deep(.el-button:not(.el-button--primary)) {
  border-color: rgba(182, 196, 255, 0.16) !important;
  background: rgba(255, 255, 255, 0.045) !important;
  color: rgba(241, 243, 251, 0.78) !important;
  box-shadow: none !important;
}

.requirement-upload-dialog :deep(.el-button:not(.el-button--primary):hover) {
  border-color: rgba(182, 196, 255, 0.32) !important;
  background: rgba(182, 196, 255, 0.09) !important;
  color: var(--upload-dialog-text) !important;
}

.requirement-upload-dialog :deep(.el-button--primary) {
  border-color: rgba(182, 196, 255, 0.75) !important;
  background: linear-gradient(135deg, #c8d2ff 0%, #98aefe 100%) !important;
  color: #070b12 !important;
  box-shadow: 0 12px 28px rgba(154, 174, 254, 0.22) !important;
}

.requirement-upload-dialog :deep(.el-button--primary:hover) {
  border-color: rgba(214, 222, 255, 0.9) !important;
  background: linear-gradient(135deg, #dce3ff 0%, #adbefd 100%) !important;
  color: #070b12 !important;
}

.requirement-upload-dialog :deep(.el-button.is-disabled),
.requirement-upload-dialog :deep(.el-button.is-disabled:hover) {
  border-color: rgba(182, 196, 255, 0.12) !important;
  background: rgba(182, 196, 255, 0.06) !important;
  color: var(--upload-dialog-disabled) !important;
  box-shadow: none !important;
}

:deep(.gitlab-import-dialog.el-dialog) {
  width: min(680px, calc(100vw - 48px)) !important;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  margin-top: 20px !important;
  margin-bottom: 20px;
  max-height: min(760px, calc(100vh - 40px));
}

:deep(.gitlab-import-dialog.el-dialog .el-dialog__header),
:deep(.gitlab-import-dialog.el-dialog .el-dialog__footer) {
  min-height: 0;
}

:deep(.gitlab-import-dialog.el-dialog .el-dialog__body) {
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 20px;
}

.gitlab-dialog-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gitlab-dialog-form :deep(.el-form-item) {
  margin-bottom: 10px;
}

.gitlab-dialog-form :deep(.el-input__wrapper) {
  min-height: 36px;
}

.gitlab-dialog-section {
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.045);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.015);
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  transition: all var(--tp-transition);
}

.requirement-upload-dialog :deep(.el-checkbox) {
  --el-checkbox-text-color: var(--upload-dialog-text);
  --el-checkbox-input-border: rgba(182, 196, 255, 0.3) !important;
}

.requirement-upload-dialog :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: #8b5cf6 !important;
  border-color: #8b5cf6 !important;
}

.requirement-upload-dialog :deep(.el-checkbox__input.is-checked + .el-checkbox__label) {
  color: #b6c4ff !important;
}

.gitlab-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.gitlab-section-head h3 {
  margin: 0;
  color: var(--upload-dialog-text);
  font-size: 14px;
  line-height: 20px;
  font-weight: 700;
}

.gitlab-section-head p {
  margin: 2px 0 0;
  color: var(--upload-dialog-muted);
  font-size: 12px;
  line-height: 18px;
}

.gitlab-config-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
}

.gitlab-config-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 2px;
}

.gitlab-action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.gitlab-option-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gitlab-option-toggle {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gitlab-option-toggle span {
  padding-left: 26px;
  color: var(--upload-dialog-muted);
  font-size: 12px;
  line-height: 18px;
}

/* ═══════ Light Mode Overrides ═══════ */
.requirement-gen-page:not(.is-dark) {
  background: linear-gradient(145deg, #f5f3ff 0%, #eef2ff 40%, #faf5ff 100%);
  color: #1f2937;
}

.requirement-gen-page:not(.is-dark) .mouse-glow {
  background: radial-gradient(
    600px circle at var(--x) var(--y),
    rgba(139, 92, 246, 0.04),
    transparent 40%
  );
}

.requirement-gen-page:not(.is-dark) .floating-panel {
  border: 1px solid rgba(139, 92, 246, 0.12);
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(16px);
  box-shadow: 0 4px 24px rgba(139, 92, 246, 0.06);
}

.requirement-gen-page:not(.is-dark) .floating-panel:hover {
  background: rgba(255, 255, 255, 0.92);
  border-color: rgba(139, 92, 246, 0.24);
  box-shadow:
    0 8px 32px rgba(139, 92, 246, 0.1),
    0 0 0 1px rgba(139, 92, 246, 0.06);
}

.requirement-gen-page:not(.is-dark) .panel-title {
  border-bottom-color: rgba(139, 92, 246, 0.08);
  color: rgba(107, 114, 128, 0.8);
}

.requirement-gen-page:not(.is-dark) .panel-dot {
  background: #8b5cf6;
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.4);
}

.requirement-gen-page:not(.is-dark) .streaming-tag {
  color: rgba(139, 92, 246, 0.7);
}

.requirement-gen-page:not(.is-dark) .panel-icon {
  color: #8b5cf6;
}

.requirement-gen-page:not(.is-dark) .panel-row span {
  color: rgba(107, 114, 128, 0.8);
}

.requirement-gen-page:not(.is-dark) .panel-row strong {
  color: #1f2937;
}

.requirement-gen-page:not(.is-dark) .panel-row .cyan {
  color: #7c3aed;
}

.requirement-gen-page:not(.is-dark) .panel-row .primary-text {
  color: #8b5cf6;
}

.requirement-gen-page:not(.is-dark) .central-zone::before {
  background: radial-gradient(
    circle,
    rgba(245, 243, 255, 0.6) 0%,
    rgba(238, 242, 255, 0.3) 38%,
    rgba(255, 255, 255, 0) 70%
  );
}

.requirement-gen-page:not(.is-dark) .central-zone::after {
  background: radial-gradient(
    circle,
    rgba(139, 92, 246, 0.1) 0%,
    rgba(99, 102, 241, 0.05) 42%,
    rgba(255, 255, 255, 0) 72%
  );
}

.requirement-gen-page:not(.is-dark) .polygon-1 {
  border-color: rgba(139, 92, 246, 0.1);
}

.requirement-gen-page:not(.is-dark) .polygon-2 {
  border-color: rgba(99, 102, 241, 0.15);
}

.requirement-gen-page:not(.is-dark) .polygon-3 {
  border-color: rgba(139, 92, 246, 0.08);
}

.requirement-gen-page:not(.is-dark) .polygon-4 {
  border-color: rgba(168, 85, 247, 0.18);
}

.requirement-gen-page:not(.is-dark) .ring-outer {
  color: rgba(209, 213, 219, 0.8);
}

.requirement-gen-page:not(.is-dark) .ring-mid {
  color: rgba(139, 92, 246, 0.5);
}

.requirement-gen-page:not(.is-dark) .ring-inner {
  color: rgba(168, 85, 247, 0.4);
}

.requirement-gen-page:not(.is-dark) .data-line {
  stroke: rgba(139, 92, 246, 0.25);
}

.requirement-gen-page:not(.is-dark) .data-lines-wrap {
  opacity: 0.3;
}

.requirement-gen-page:not(.is-dark) .central-hub {
  border-color: rgba(139, 92, 246, 0.35);
  color: #1f2937;
  background: rgba(255, 255, 255, 0.88);
  box-shadow:
    0 0 40px rgba(139, 92, 246, 0.15),
    0 0 80px rgba(139, 92, 246, 0.08),
    0 8px 32px rgba(139, 92, 246, 0.1);
}

.requirement-gen-page:not(.is-dark) .central-hub.is-idle {
  background:
    radial-gradient(circle at 50% 30%, rgba(139, 92, 246, 0.06), transparent 42%),
    rgba(255, 255, 255, 0.92);
  border-color: rgba(139, 92, 246, 0.2);
  box-shadow:
    0 0 0 1px rgba(139, 92, 246, 0.06),
    0 4px 24px rgba(139, 92, 246, 0.08);
}

.requirement-gen-page:not(.is-dark) .hub-icon {
  color: #8b5cf6;
}

.requirement-gen-page:not(.is-dark) .central-hub.is-idle .hub-icon {
  color: rgba(139, 92, 246, 0.7);
}

.requirement-gen-page:not(.is-dark) .hub-number {
  background: linear-gradient(to right, #7c3aed, #a855f7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.requirement-gen-page:not(.is-dark) .hub-label {
  color: rgba(107, 114, 128, 0.7);
}

.requirement-gen-page:not(.is-dark) .hub-idle-title {
  color: rgba(31, 41, 55, 0.88);
}

.requirement-gen-page:not(.is-dark) .central-hub:focus-visible {
  outline-color: rgba(139, 92, 246, 0.6);
}

.requirement-gen-page:not(.is-dark) .float-node {
  background: rgba(255, 255, 255, 0.72);
  border-color: rgba(139, 92, 246, 0.1);
}

.requirement-gen-page:not(.is-dark) .float-node:hover {
  background: rgba(255, 255, 255, 0.92);
  border-color: rgba(139, 92, 246, 0.22);
}

.requirement-gen-page:not(.is-dark) .node-text {
  color: #374151;
}

.requirement-gen-page:not(.is-dark) .dot-tertiary {
  background: #7c3aed;
  box-shadow: 0 0 8px rgba(124, 58, 237, 0.3);
}

.requirement-gen-page:not(.is-dark) .dot-secondary {
  background: #a855f7;
  box-shadow: 0 0 8px rgba(168, 85, 247, 0.3);
}

.requirement-gen-page:not(.is-dark) .dot-error {
  background: #ef4444;
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.3);
}

.requirement-gen-page:not(.is-dark) .dot-primary {
  background: #8b5cf6;
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.3);
}

.requirement-gen-page:not(.is-dark) .beam {
  background: linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.4), transparent);
}

.requirement-gen-page:not(.is-dark) .beam-overlay {
  opacity: 0.06;
}

/* ── Light: Pipeline Footer ── */
.requirement-gen-page:not(.is-dark) .pipeline-footer {
  background: linear-gradient(
    to top,
    rgba(245, 243, 255, 0.98),
    rgba(245, 243, 255, 0.8) 58%,
    transparent
  );
}

.requirement-gen-page:not(.is-dark) .step-no {
  border-color: rgba(139, 92, 246, 0.18);
  background: rgba(255, 255, 255, 0.92);
  color: rgba(107, 114, 128, 0.8);
}

.requirement-gen-page:not(.is-dark) .step-title {
  color: rgba(75, 85, 99, 0.8);
}

.requirement-gen-page:not(.is-dark) .step-desc {
  color: rgba(107, 114, 128, 0.7);
}

.requirement-gen-page:not(.is-dark) .step-track {
  background: rgba(139, 92, 246, 0.1);
}

.requirement-gen-page:not(.is-dark) .step-track i {
  background: rgba(139, 92, 246, 0.35);
}

.requirement-gen-page:not(.is-dark) .step-track b {
  background: linear-gradient(90deg, transparent, rgba(139, 92, 246, 0.3), transparent);
  background-size: 200% 100%;
}

.requirement-gen-page:not(.is-dark) .pipeline-step.active .step-no {
  background: rgba(139, 92, 246, 0.15);
  border-color: rgba(139, 92, 246, 0.5);
  color: #7c3aed;
}

.requirement-gen-page:not(.is-dark) .pipeline-step.active .step-title {
  color: #7c3aed;
}

.requirement-gen-page:not(.is-dark) .pipeline-step.active .step-desc {
  color: rgba(124, 58, 237, 0.8);
}

.requirement-gen-page:not(.is-dark) .pipeline-step.active .step-track i {
  background: #8b5cf6;
}

.requirement-gen-page:not(.is-dark) .pipeline-step.completed .step-no {
  background: rgba(34, 197, 94, 0.1);
  border-color: rgba(34, 197, 94, 0.35);
  color: #16a34a;
}

.requirement-gen-page:not(.is-dark) .pipeline-step.completed .step-title {
  color: #16a34a;
}

.requirement-gen-page:not(.is-dark) .pipeline-step.completed .step-track i {
  background: rgba(34, 197, 94, 0.45);
}

.requirement-gen-page:not(.is-dark) .pipeline-step.completed .step-desc {
  color: rgba(22, 163, 106, 0.75);
}

.requirement-gen-page:not(.is-dark) .step-chevron .material-symbols-outlined {
  color: #9ca3af;
}

/* ── Light: FAB Buttons ── */
.requirement-gen-page:not(.is-dark) .fab-border {
  background: linear-gradient(to right, #8b5cf6, #a855f7);
}

.requirement-gen-page:not(.is-dark) .fab-inner {
  background: #ffffff;
}

.requirement-gen-page:not(.is-dark) .fab-inner .material-symbols-outlined {
  color: #8b5cf6;
}

.requirement-gen-page:not(.is-dark) .fab-label {
  color: #1f2937;
}

/* ── Light: Generating state ── */
.requirement-gen-page:not(.is-dark).is-generating .central-hub,
.requirement-gen-page:not(.is-dark) .is-generating .central-hub {
  box-shadow:
    0 0 50px rgba(139, 92, 246, 0.2),
    0 0 100px rgba(139, 92, 246, 0.1),
    0 8px 40px rgba(139, 92, 246, 0.12);
}

/* ═══════ Responsive ═══════ */
@media (max-width: 1280px) {
  .floating-panel {
    width: 220px;
    padding: 12px;
  }
}

@media (max-width: 900px) {
  .pipeline-steps {
    flex-wrap: wrap;
  }

  .step-chevron {
    display: none;
  }

  .new-requirement-fab-btn {
    bottom: 24px;
    right: 24px;
  }

  .records-fab-btn {
    bottom: 94px;
    right: 24px;
  }

  .gitlab-fab-btn {
    bottom: 164px;
    right: 24px;
  }

  .fab-btn {
    width: 252px;
    max-width: calc(100vw - 48px);
  }

  .gitlab-config-grid {
    grid-template-columns: 1fr;
  }

  .gitlab-config-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .gitlab-action-buttons {
    justify-content: flex-start;
  }
}

/* 覆盖全局 reduced-motion 规则，确保 HUD 动画始终运行 */
@media (prefers-reduced-motion: reduce) {
  .requirement-gen-page .polygon-1 {
    animation: rotate-slow 25s linear infinite !important;
  }
  .requirement-gen-page .polygon-2 {
    animation: rotate-slow 15s linear infinite !important;
  }
  .requirement-gen-page .polygon-3 {
    animation: rotate-reverse 35s linear infinite !important;
  }
  .requirement-gen-page .polygon-4 {
    animation: rotate-slow 25s linear infinite !important;
  }
  .requirement-gen-page .ring-group-mid {
    animation: ring-mid-cycle 30s linear infinite !important;
  }
  .requirement-gen-page .ring-group-inner {
    animation: ring-inner-cycle 30s linear infinite !important;
  }
  .requirement-gen-page .central-hub {
    animation: pulse-glow 4s ease-in-out infinite !important;
  }
  .requirement-gen-page .float-node {
    animation: float-node 6s ease-in-out infinite !important;
  }
  .requirement-gen-page .ambient-glow {
    animation: pulse-glow 8s ease-in-out infinite !important;
  }
  .requirement-gen-page .data-line {
    animation: line-glow 10s linear infinite !important;
  }
  .requirement-gen-page .flow-bar {
    animation: flow-progress 2s linear infinite !important;
  }
  .requirement-gen-page .streaming-tag {
    animation: blink-tag 2s ease-in-out infinite !important;
  }
  .requirement-gen-page .panel-dot {
    animation: dot-pulse 2s ease-in-out infinite !important;
  }
  .requirement-gen-page .panel-icon {
    animation: pulse-glow 2s ease-in-out infinite !important;
  }
  .requirement-gen-page .beam-1 {
    animation: beam-in 3s linear infinite !important;
  }
  .requirement-gen-page .beam-2 {
    animation: beam-in 5s linear infinite 1s !important;
  }
  .requirement-gen-page .step-track b {
    animation: flow-progress 2s linear infinite !important;
  }

  .requirement-gen-page,
  .requirement-gen-page *,
  .requirement-gen-page *::before,
  .requirement-gen-page *::after {
    transition-duration: 0.4s !important;
  }
}
</style>

<style>
/* 两个虚线圆形 30s 同步 cycle，3 段节奏 + 4 条不同路径
   translate 单位为 SVG user units（viewBox 0..100, 1 unit ≈ 7 CSS px）
   translate3d 强制 GPU 合成；linear timing 保证匀速 */

/* 大圈：path A 对角线（左上→右下）独走，path B 垂直（下→上）与小圈同时交叉 */
@keyframes ring-mid-cycle {
  /* Phase A 0-33%: 独走 - 左上 → 右下 */
  0% {
    opacity: 0;
    transform: translate3d(-55px, -50px, 0) rotate(0deg);
  }
  4% {
    opacity: 0.85;
    transform: translate3d(-38px, -34px, 0) rotate(15deg);
  }
  16% {
    opacity: 0.85;
    transform: translate3d(0px, 0px, 0) rotate(60deg);
  }
  28% {
    opacity: 0.85;
    transform: translate3d(38px, 34px, 0) rotate(105deg);
  }
  33% {
    opacity: 0;
    transform: translate3d(55px, 50px, 0) rotate(120deg);
  }

  /* Phase B 33-66%: 隐藏（小圈独走） */
  65% {
    opacity: 0;
    transform: translate3d(55px, 50px, 0) rotate(234deg);
  }

  /* Phase C 66-100%: 交叉 - 下 → 上（垂直路径） */
  66% {
    opacity: 0;
    transform: translate3d(-5px, 60px, 0) rotate(238deg);
  }
  70% {
    opacity: 0.85;
    transform: translate3d(-3px, 35px, 0) rotate(252deg);
  }
  82% {
    opacity: 0.85;
    transform: translate3d(2px, 0px, 0) rotate(296deg);
  }
  95% {
    opacity: 0.85;
    transform: translate3d(8px, -42px, 0) rotate(343deg);
  }
  100% {
    opacity: 0;
    transform: translate3d(10px, -55px, 0) rotate(360deg);
  }
}

/* 小圈：path A 水平（右→左）独走，path B 对角线（左上→右下）与大圈同时交叉 */
@keyframes ring-inner-cycle {
  /* Phase A 0-33%: 隐藏（大圈独走） */
  0% {
    opacity: 0;
    transform: translate3d(60px, 5px, 0) rotate(0deg);
  }
  33% {
    opacity: 0;
    transform: translate3d(60px, 5px, 0) rotate(-120deg);
  }

  /* Phase B 33-66%: 独走 - 右 → 左（水平路径） */
  37% {
    opacity: 0.85;
    transform: translate3d(38px, 8px, 0) rotate(-135deg);
  }
  49% {
    opacity: 0.85;
    transform: translate3d(0px, 2px, 0) rotate(-180deg);
  }
  61% {
    opacity: 0.85;
    transform: translate3d(-38px, -3px, 0) rotate(-225deg);
  }
  65% {
    opacity: 0;
    transform: translate3d(-60px, -6px, 0) rotate(-238deg);
  }

  /* Phase C 66-100%: 交叉 - 左上 → 右下（对角线，与大圈方向不同） */
  66% {
    opacity: 0;
    transform: translate3d(-50px, -45px, 0) rotate(-238deg);
  }
  70% {
    opacity: 0.85;
    transform: translate3d(-32px, -28px, 0) rotate(-252deg);
  }
  82% {
    opacity: 0.85;
    transform: translate3d(0px, 2px, 0) rotate(-296deg);
  }
  95% {
    opacity: 0.85;
    transform: translate3d(35px, 38px, 0) rotate(-343deg);
  }
  100% {
    opacity: 0;
    transform: translate3d(55px, 50px, 0) rotate(-360deg);
  }
}

/* Keyframes - non-scoped for Vue compatibility */
@keyframes rotate-slow {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes rotate-reverse {
  from {
    transform: rotate(360deg);
  }
  to {
    transform: rotate(0deg);
  }
}

/* 方形大幅度漂移旋转：先 translate（屏幕坐标偏移）再 rotate，确保位移可见 */
@keyframes poly-drift-1 {
  0% {
    transform: translate(0, 0) rotate(0deg);
  }
  20% {
    transform: translate(50px, -40px) rotate(72deg);
  }
  40% {
    transform: translate(-45px, 55px) rotate(144deg);
  }
  60% {
    transform: translate(60px, 35px) rotate(216deg);
  }
  80% {
    transform: translate(-50px, -45px) rotate(288deg);
  }
  100% {
    transform: translate(0, 0) rotate(360deg);
  }
}

@keyframes poly-drift-2 {
  0% {
    transform: translate(0, 0) rotate(0deg);
  }
  16% {
    transform: translate(-55px, 40px) rotate(-58deg);
  }
  33% {
    transform: translate(60px, -25px) rotate(-120deg);
  }
  50% {
    transform: translate(-35px, -55px) rotate(-180deg);
  }
  66% {
    transform: translate(50px, 50px) rotate(-240deg);
  }
  83% {
    transform: translate(-60px, 20px) rotate(-300deg);
  }
  100% {
    transform: translate(0, 0) rotate(-360deg);
  }
}

@keyframes poly-drift-3 {
  0% {
    transform: translate(0, 0) rotate(0deg);
  }
  14% {
    transform: translate(40px, 45px) rotate(50deg);
  }
  28% {
    transform: translate(-55px, -30px) rotate(100deg);
  }
  42% {
    transform: translate(50px, -45px) rotate(152deg);
  }
  57% {
    transform: translate(-40px, 55px) rotate(205deg);
  }
  71% {
    transform: translate(60px, 25px) rotate(256deg);
  }
  85% {
    transform: translate(-45px, -35px) rotate(308deg);
  }
  100% {
    transform: translate(0, 0) rotate(360deg);
  }
}

@keyframes poly-drift-4 {
  0% {
    transform: translate(0, 0) rotate(0deg);
  }
  18% {
    transform: translate(55px, -45px) rotate(-65deg);
  }
  36% {
    transform: translate(-45px, 55px) rotate(-130deg);
  }
  54% {
    transform: translate(50px, 35px) rotate(-194deg);
  }
  72% {
    transform: translate(-60px, -40px) rotate(-260deg);
  }
  90% {
    transform: translate(35px, 50px) rotate(-324deg);
  }
  100% {
    transform: translate(0, 0) rotate(-360deg);
  }
}

@keyframes pulse-glow {
  0%,
  100% {
    box-shadow: 0 0 20px rgba(77, 119, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.08);
  }
  50% {
    box-shadow: 0 0 50px rgba(162, 89, 255, 0.25);
    border-color: rgba(162, 89, 255, 0.3);
  }
}

@keyframes float-node {
  0%,
  100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-10px);
  }
}

@keyframes flow-progress {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

@keyframes line-glow {
  0% {
    stroke-dashoffset: 1000;
    opacity: 0.2;
  }
  50% {
    opacity: 1;
  }
  100% {
    stroke-dashoffset: 0;
    opacity: 0.2;
  }
}

@keyframes blink-tag {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

@keyframes dot-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
    box-shadow: 0 0 8px rgba(0, 220, 229, 0.5);
  }
  50% {
    opacity: 0.4;
    transform: scale(0.6);
    box-shadow: 0 0 3px rgba(0, 220, 229, 0.2);
  }
}

@keyframes glitch {
  0% {
    transform: translate(0);
    text-shadow: none;
  }
  20% {
    transform: translate(-2px, 1px);
    text-shadow:
      2px 0 #4d77ff,
      -1px 0 #a259ff;
  }
  40% {
    transform: translate(1px, -1px);
    text-shadow:
      -1px 0 #4d77ff,
      2px 0 #a259ff;
  }
  60% {
    transform: translate(-1px, 1px);
  }
  80% {
    transform: translate(2px, -1px);
  }
  100% {
    transform: translate(0);
  }
}

@keyframes beam-in {
  0% {
    transform: translateX(300px) scaleX(0);
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
  100% {
    transform: translateX(0) scaleX(1);
    opacity: 0;
  }
}

/* ═══════ Light Mode: Dialog Overrides (teleported to body) ═══════ */
html:not([data-theme]) .requirement-upload-dialog .el-dialog {
  border-color: rgba(139, 92, 246, 0.14) !important;
  background: #ffffff !important;
  box-shadow:
    0 20px 60px rgba(139, 92, 246, 0.1),
    0 0 0 1px rgba(139, 92, 246, 0.04) inset !important;
}

html:not([data-theme]) .requirement-upload-dialog .el-dialog__header {
  border-bottom-color: rgba(139, 92, 246, 0.08) !important;
}

html:not([data-theme]) .requirement-upload-dialog .el-dialog__title {
  color: #1f2937 !important;
}

html:not([data-theme]) .requirement-upload-dialog .el-dialog__close {
  color: rgba(107, 114, 128, 0.7) !important;
}

html:not([data-theme]) .requirement-upload-dialog .el-dialog__footer {
  background: rgba(245, 243, 255, 0.5) !important;
  border-top: 1px solid rgba(139, 92, 246, 0.06) !important;
}

html:not([data-theme]) .requirement-upload-dialog .el-form-item__label {
  color: #4b5563 !important;
}

html:not([data-theme]) .requirement-upload-dialog .el-input__wrapper {
  border-color: rgba(139, 92, 246, 0.14) !important;
  background: #fafafa !important;
}

html:not([data-theme]) .requirement-upload-dialog .el-input__wrapper:hover {
  border-color: rgba(139, 92, 246, 0.28) !important;
}

html:not([data-theme]) .requirement-upload-dialog .el-input__wrapper.is-focus {
  border-color: rgba(139, 92, 246, 0.5) !important;
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.08) !important;
}

html:not([data-theme]) .requirement-upload-dialog .el-input__inner {
  color: #1f2937 !important;
}

html:not([data-theme]) .requirement-upload-dialog .el-input__inner::placeholder {
  color: rgba(107, 114, 128, 0.5) !important;
}

html:not([data-theme]) .requirement-upload-dialog .upload-select-card {
  border-color: rgba(139, 92, 246, 0.18) !important;
  background:
    linear-gradient(135deg, rgba(139, 92, 246, 0.04), rgba(255, 255, 255, 0.6) 54%), #fafafa !important;
  box-shadow: 0 2px 12px rgba(139, 92, 246, 0.04) !important;
}

html:not([data-theme]) .requirement-upload-dialog .upload-select-card:hover {
  border-color: rgba(139, 92, 246, 0.35) !important;
  background:
    linear-gradient(135deg, rgba(139, 92, 246, 0.07), rgba(255, 255, 255, 0.8) 54%), #f5f3ff !important;
  box-shadow: 0 4px 16px rgba(139, 92, 246, 0.08) !important;
}

html:not([data-theme]) .requirement-upload-dialog .upload-select-icon {
  border-color: rgba(139, 92, 246, 0.18) !important;
  background: rgba(139, 92, 246, 0.08) !important;
  color: #8b5cf6 !important;
}

html:not([data-theme]) .requirement-upload-dialog .upload-select-title {
  color: #1f2937 !important;
}

html:not([data-theme]) .requirement-upload-dialog .upload-select-desc {
  color: rgba(107, 114, 128, 0.7) !important;
}

html:not([data-theme]) .requirement-upload-dialog .upload-select-action {
  border-color: rgba(139, 92, 246, 0.2) !important;
  background: rgba(139, 92, 246, 0.06) !important;
  color: #8b5cf6 !important;
}

html:not([data-theme]) .requirement-upload-dialog .el-button:not(.el-button--primary) {
  border-color: rgba(139, 92, 246, 0.14) !important;
  background: rgba(139, 92, 246, 0.04) !important;
  color: #374151 !important;
}

html:not([data-theme]) .requirement-upload-dialog .el-button:not(.el-button--primary):hover {
  border-color: rgba(139, 92, 246, 0.25) !important;
  background: rgba(139, 92, 246, 0.08) !important;
  color: #1f2937 !important;
}

html:not([data-theme]) .requirement-upload-dialog .el-button--primary {
  border-color: rgba(139, 92, 246, 0.6) !important;
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%) !important;
  color: #ffffff !important;
  box-shadow: 0 8px 20px rgba(139, 92, 246, 0.2) !important;
}

html:not([data-theme]) .requirement-upload-dialog .el-button--primary:hover {
  background: linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%) !important;
}

html:not([data-theme]) .requirement-upload-dialog .el-button.is-disabled,
html:not([data-theme]) .requirement-upload-dialog .el-button.is-disabled:hover {
  border-color: rgba(209, 213, 219, 0.5) !important;
  background: rgba(243, 244, 246, 0.8) !important;
  color: rgba(156, 163, 175, 0.6) !important;
  box-shadow: none !important;
}

/* ═══════ Light Mode: GitLab Dialog Custom Overrides ═══════ */
html:not([data-theme]) .requirement-upload-dialog .gitlab-dialog-section {
  background: rgba(245, 243, 255, 0.45) !important;
  border: 1px solid rgba(139, 92, 246, 0.08) !important;
  backdrop-filter: blur(12px) !important;
  border-radius: 12px !important;
  box-shadow: 0 4px 20px rgba(139, 92, 246, 0.03) !important;
}

html:not([data-theme]) .requirement-upload-dialog .gitlab-section-head h3 {
  color: #1f2937 !important;
}

html:not([data-theme]) .requirement-upload-dialog .gitlab-section-head p {
  color: #6b7280 !important;
}

html:not([data-theme]) .requirement-upload-dialog .gitlab-option-toggle span {
  color: #6b7280 !important;
}

html:not([data-theme]) .requirement-upload-dialog .el-checkbox {
  --el-checkbox-text-color: #374151 !important;
  --el-checkbox-input-border: rgba(139, 92, 246, 0.25) !important;
}

html:not([data-theme])
  .requirement-upload-dialog
  .el-checkbox__input.is-checked
  .el-checkbox__inner {
  background-color: #8b5cf6 !important;
  border-color: #8b5cf6 !important;
}

html:not([data-theme])
  .requirement-upload-dialog
  .el-checkbox__input.is-checked
  + .el-checkbox__label {
  color: #8b5cf6 !important;
}

/* 亮色模式下的 GitLab 连接配置中的非 Primary 按钮 (保存配置、测试连接) 亮暗模式细节适配 */
html:not([data-theme]) .requirement-upload-dialog .gitlab-action-buttons .el-button,
html:not([data-theme])
  .requirement-upload-dialog
  .upload-dialog-footer
  .el-button:not(.el-button--primary) {
  border-color: rgba(139, 92, 246, 0.16) !important;
  background: rgba(255, 255, 255, 0.72) !important;
  color: #6d28d9 !important;
  backdrop-filter: blur(4px) !important;
}

html:not([data-theme]) .requirement-upload-dialog .gitlab-action-buttons .el-button:hover,
html:not([data-theme])
  .requirement-upload-dialog
  .upload-dialog-footer
  .el-button:not(.el-button--primary):hover {
  border-color: rgba(139, 92, 246, 0.35) !important;
  background: rgba(245, 243, 255, 0.95) !important;
  color: #5b21b6 !important;
}

html:not([data-theme]) .requirement-upload-dialog .gitlab-action-buttons .el-button.is-disabled,
html:not([data-theme])
  .requirement-upload-dialog
  .gitlab-action-buttons
  .el-button.is-disabled:hover {
  border-color: rgba(229, 231, 235, 0.7) !important;
  background: rgba(243, 244, 246, 0.7) !important;
  color: rgba(156, 163, 175, 0.6) !important;
}
</style>
