<script setup lang="ts">
/**
 * 需求智生主页面。
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { UploadFile } from 'element-plus'
import { InfoFilled, SuccessFilled } from '@element-plus/icons-vue'
import { useGenTasks, useRequirementDocs } from '@/composables/useRequirementGen'

import type { RequirementDoc } from '@/api/requirementDoc'
import type { SmartGeneratePayload, SmartGenerateResult } from '@/api/requirementGen'

const router = useRouter()
const { docs, fetchDocs, handleUpload, handlePaste } = useRequirementDocs()
const { tasks, smartGenerating, handleSmartGenerate, fetchTasks } = useGenTasks()

const parsedDocCount = computed(
  () => docs.value.filter((doc) => doc.parse_status === 'parsed').length,
)
const parseSuccessRate = computed(() => {
  if (!docs.value.length) return 0
  return Math.round((parsedDocCount.value / docs.value.length) * 100)
})
const runningTaskCount = computed(
  () => tasks.value.filter((task) => task.status === 'running').length,
)
const latestDoc = computed(() => docs.value[0] || null)
// 基于最新文档的任务过滤
const latestDocTasks = computed(() =>
  latestDoc.value ? tasks.value.filter((t) => t.requirement_doc_id === latestDoc.value!.id) : [],
)
const latestDocRunning = computed(
  () => latestDocTasks.value.filter((t) => t.status === 'running').length,
)
const latestDocCaseTotal = computed(() =>
  latestDocTasks.value.reduce((sum, t) => sum + (t.generated_count || 0), 0),
)
const hasPendingDocs = computed(() =>
  docs.value.some((d) => d.parse_status === 'parsing' || d.parse_status === 'not_parsed'),
)
const activeEngineStatus = computed(() => {
  if (smartGenerating.value) return '流式处理中'
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
const particlesCanvas = ref<HTMLCanvasElement | null>(null)
const mouseGlowEl = ref<HTMLDivElement | null>(null)
let animFrameId = 0
let latencyTimer: ReturnType<typeof setInterval> | null = null
let glitchTimer: ReturnType<typeof setInterval> | null = null
const glitchDisplay = ref<string | number>('')
const centralNumber = computed(() => {
  if (smartGenerating.value) return parsedDocCount.value || docs.value.length || 'AI'
  if (smartResultData.value) return smartResultData.value.created_tasks.length
  return docs.value.length || 0
})
const diagnosticsSkillMatch = computed(() => {
  if (smartResultData.value?.recommended_skills.length) {
    return `${smartResultData.value.recommended_skills.length} 条路由`
  }
  return `${parseSuccessRate.value}%`
})
// ── Pipeline：体现当前任务流各步骤状态 ──
const latestDocParsed = computed(() => latestDoc.value?.parse_status === 'parsed')
const latestDocParsing = computed(
  () =>
    latestDoc.value?.parse_status === 'parsing' || latestDoc.value?.parse_status === 'not_parsed',
)
const matchedSkillCount = computed(() => smartResultData.value?.recommended_skills?.length || 0)

const pipelineSteps = computed(() => {
  // 步骤1: 需求读取 — 有文档就完成
  const step1Done = docs.value.length > 0
  // 步骤2: 需求解析 — 最新文档解析完成
  const step2Active = latestDocParsing.value
  const step2Done = latestDocParsed.value
  // 步骤3: 策略匹配 — 只看当前最新文档的任务
  const step3Active = smartGenerating.value
  const step3Done = matchedSkillCount.value > 0 || latestDocTasks.value.length > 0
  const step3Count = matchedSkillCount.value || latestDocTasks.value.length
  // 步骤4: 用例生成 — 只看当前最新文档的任务
  const step4Active = latestDocRunning.value > 0
  const step4Done = latestDocCaseTotal.value > 0

  return [
    {
      no: '01',
      title: '需求读取',
      desc: step1Done ? '文档已就绪' : '等待上传...',
      progress: step1Done ? 100 : 0,
      active: step1Done && !step2Done,
      completed: step1Done,
    },
    {
      no: '02',
      title: '需求解析',
      desc: step2Done ? '解析完成' : step2Active ? '解析中...' : '等待解析...',
      progress: step2Done ? 100 : step2Active ? 50 : 0,
      active: step2Active,
      completed: step2Done,
    },
    {
      no: '03',
      title: '策略匹配',
      desc: step3Done ? `${step3Count} 个策略已匹配` : step3Active ? '匹配中...' : '等待匹配...',
      progress: step3Done ? 100 : step3Active ? 60 : 0,
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
      progress: step4Done ? 100 : step4Active ? 64 : 0,
      active: step4Active,
      completed: step4Done,
    },
  ]
})

const uploading = ref(false)
const pasting = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null
// 防止重复自动触发智能生成
const autoGenTriggeredDocId = ref<number | null>(null)
// 任务状态轮询（等待 LLM 生成完成）
let taskPollTimer: ReturnType<typeof setInterval> | null = null

function startTaskPoll() {
  if (taskPollTimer) return
  taskPollTimer = setInterval(async () => {
    await fetchTasks()
    const hasRunning = tasks.value.some((t) => t.status === 'running')
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
    const hasParsing = docs.value.some(
      (d) => d.parse_status === 'parsing' || d.parse_status === 'not_parsed',
    )
    if (!hasParsing) {
      stopPoll()
      // 解析全部完成后，自动触发智能生成
      autoTriggerSmartGenerate()
      return
    }
    await fetchDocs()
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
  if (!doc || doc.parse_status !== 'parsed') return
  // 防止对同一文档重复触发
  if (autoGenTriggeredDocId.value === doc.id) return
  // 已有该文档的任务则跳过
  if (latestDocTasks.value.length > 0) return
  autoGenTriggeredDocId.value = doc.id
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
  size: number
  speedX: number
  speedY: number
  life: number
  opacity: number
  growth: number
}
function initParticles() {
  const canvas = particlesCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const particles: PData[] = []
  function resize() {
    canvas!.width = canvas!.parentElement?.clientWidth ?? window.innerWidth
    canvas!.height = canvas!.parentElement?.clientHeight ?? window.innerHeight
  }
  window.addEventListener('resize', resize)
  resize()
  function makeP(): PData {
    return {
      x: Math.random() * canvas!.width,
      y: Math.random() * canvas!.height,
      size: Math.random() * 1.5 + 0.5,
      speedX: Math.random() * 0.2 - 0.1,
      speedY: Math.random() * 0.2 - 0.1,
      life: Math.random(),
      opacity: 0,
      growth: Math.random() * 0.005 + 0.002,
    }
  }
  for (let i = 0; i < 80; i++) particles.push(makeP())
  function tick() {
    ctx!.clearRect(0, 0, canvas!.width, canvas!.height)
    for (const p of particles) {
      p.x += p.speedX
      p.y += p.speedY
      p.life += p.growth
      p.opacity = Math.sin(p.life * Math.PI) * 0.3
      if (p.life > 1) Object.assign(p, makeP())
      ctx!.fillStyle = `rgba(182,196,255,${p.opacity})`
      ctx!.beginPath()
      ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx!.fill()
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
  // 挂载后如果有待解析文档立即开始轮询
  if (docs.value.some((d) => d.parse_status === 'parsing' || d.parse_status === 'not_parsed')) {
    startPollIfNeeded()
  }
  // 如果有正在运行的任务，启动任务轮询
  if (tasks.value.some((t) => t.status === 'running')) {
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
  // 中央数字微闪烁
  glitchTimer = setInterval(() => {
    if (Math.random() > 0.92) {
      const real = centralNumber.value
      glitchDisplay.value = typeof real === 'number' ? real + (Math.random() > 0.5 ? 1 : -1) : real
      setTimeout(() => {
        glitchDisplay.value = ''
      }, 100)
    }
  }, 2000)
})

onUnmounted(() => {
  stopPoll()
  stopTaskPoll()
  window.removeEventListener('mousemove', onMouseMove)
  cancelAnimationFrame(animFrameId)
  if (latencyTimer) clearInterval(latencyTimer)
  if (glitchTimer) clearInterval(glitchTimer)
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

function onFileChange(file: UploadFile) {
  uploadFile.value = file.raw ?? null
  if (!uploadTitle.value) uploadTitle.value = file.name
}

async function submitUpload() {
  if (!uploadFile.value || !uploadTitle.value.trim()) return
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
    if (latestDoc.value?.parse_status === 'parsed') {
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
  pasting.value = true
  try {
    await handlePaste(pasteTitle.value.trim(), pasteContent.value.trim(), pasteRemark.value.trim())
    showPasteDialog.value = false
    pasteTitle.value = ''
    pasteContent.value = ''
    pasteRemark.value = ''
    triggerActiveCooldown()
    await nextTick()
    if (latestDoc.value?.parse_status === 'parsed') {
      autoTriggerSmartGenerate()
    } else {
      startPollIfNeeded()
    }
  } finally {
    pasting.value = false
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

async function submitSmartGenerate() {
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

function goToDocs() {
  router.push({ name: 'RequirementGenDocs' })
}
function goToResults() {
  router.push({
    name: 'RequirementGenResults',
    query: latestDoc.value ? { docId: latestDoc.value.id } : {},
  })
}
</script>

<template>
  <div class="requirement-gen-page">
    <div ref="mouseGlowEl" class="mouse-glow"></div>
    <div class="grid-overlay"></div>
    <div class="ambient-glow"></div>

    <header class="top-bar">
      <div class="top-bar-left">
        <span class="brand-title">Aisight</span>
        <div class="global-search">
          <span class="material-symbols-outlined">search</span>
          <input class="search-input" placeholder="全局搜索..." readonly />
        </div>
      </div>
      <div class="top-bar-right">
        <button class="nav-btn" type="button" @click="goToDocs">
          <span class="material-symbols-outlined">description</span>
          需求文档
        </button>
        <button class="nav-btn" type="button" @click="goToResults">
          <span class="material-symbols-outlined">assignment_turned_in</span>
          生成用例
        </button>
      </div>
    </header>

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
            <strong class="primary-text">GPT-4o-COGNITIVE</strong>
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
          </svg>
        </div>

        <!-- CSS 旋转轨道（圆形，idle 态显示） -->
        <div class="orbit orbit-one"></div>
        <div class="orbit orbit-two"></div>
        <div class="orbit orbit-three"></div>
        <div class="orbit orbit-four"></div>
        <div class="orbit-orb"></div>

        <!-- Active 态几何多边形（对标设计图，仅 active 时可见） -->
        <div class="polygon polygon-1"></div>
        <div class="polygon polygon-2"></div>
        <div class="polygon polygon-3"></div>
        <div class="polygon polygon-4"></div>
        <div class="polygon polygon-5"></div>

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
          type="button"
          @click="latestDoc && openSmartGenerate(latestDoc)"
        >
          <span class="material-symbols-outlined hub-icon">psychology</span>
          <strong class="hub-number glitch-effect">{{ glitchDisplay || centralNumber }}</strong>
          <em class="hub-label">ACTIVE ANALYSIS</em>
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
        <div v-if="isSystemActive" class="pipeline-footer">
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

      <button class="fab-btn" type="button" @click="showUploadDialog = true">
        <div class="fab-border">
          <div class="fab-inner">
            <span class="material-symbols-outlined">add_task</span>
            <span class="fab-label">NEW REQUIREMENT</span>
          </div>
        </div>
      </button>
    </main>

    <el-dialog v-model="showUploadDialog" title="上传需求文档" width="500px">
      <el-form label-width="80px">
        <el-form-item label="文件">
          <el-upload
            :auto-upload="false"
            :limit="1"
            accept=".docx,.pdf,.md,.txt"
            @change="onFileChange"
          >
            <el-button type="primary">选择文件</el-button>
            <template #tip>
              <div class="el-upload__tip">支持 docx、pdf、md、txt 格式，最大 10MB</div>
            </template>
          </el-upload>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="uploadTitle" placeholder="文档标题（默认使用文件名）" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="uploadRemark" placeholder="可选备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showUploadDialog = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="!uploadFile || uploading"
          :loading="uploading"
          @click="submitUpload"
        >
          确定上传
        </el-button>
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
  background: #0b0e14;
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
  background-image: radial-gradient(rgba(182, 196, 255, 0.04) 1px, transparent 1px);
  background-size: 32px 32px;
}

.ambient-glow {
  background: linear-gradient(
    135deg,
    rgba(182, 196, 255, 0.08),
    transparent,
    rgba(216, 185, 255, 0.08)
  );
  animation: pulse-glow 8s ease-in-out infinite;
}

/* ═══════ Top Bar ═══════ */
.top-bar {
  position: relative;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(16, 19, 26, 0.6);
  backdrop-filter: blur(16px);
}

.top-bar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.brand-title {
  font-family: 'Geist', sans-serif;
  font-size: 24px;
  font-weight: 700;
  color: #e1e2eb;
}

.top-bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid rgba(182, 196, 255, 0.15);
  border-radius: 8px;
  background: rgba(182, 196, 255, 0.06);
  color: rgba(196, 197, 215, 0.8);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-btn .material-symbols-outlined {
  font-size: 16px;
}

.nav-btn:hover {
  background: rgba(182, 196, 255, 0.15);
  border-color: rgba(182, 196, 255, 0.3);
  color: #b6c4ff;
}

.global-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 9999px;
  background: rgba(39, 42, 49, 0.4);
}

.global-search .material-symbols-outlined {
  color: rgba(196, 197, 215, 0.6);
  font-size: 18px;
}

.search-input {
  width: 192px;
  border: none;
  outline: none;
  background: transparent;
  color: rgba(196, 197, 215, 0.6);
  font-size: 14px;
  line-height: 20px;
}

.search-input::placeholder {
  color: rgba(196, 197, 215, 0.4);
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

.orbit {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  transition: border-color 0.8s ease;
}

.orbit-one {
  width: 600px;
  height: 600px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  animation: rotate-slow 25s linear infinite;
}

.orbit-two {
  width: 520px;
  height: 520px;
  border: 1.5px dashed rgba(182, 196, 255, 0.15);
  animation: rotate-slow 15s linear infinite;
}

.orbit-three {
  width: 440px;
  height: 440px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  animation: rotate-reverse 35s linear infinite;
}

.orbit-four {
  width: 380px;
  height: 380px;
  border: 1.5px dotted rgba(216, 185, 255, 0.25);
  animation: rotate-slow 25s linear infinite;
}

.data-lines-wrap {
  position: absolute;
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
  border: 1px solid rgba(182, 196, 255, 0.3);
  border-radius: 50%;
  color: #e1e2eb;
  background: rgba(16, 19, 26, 0.6);
  backdrop-filter: blur(16px);
  cursor: pointer;
  animation: pulse-glow 4s ease-in-out infinite;
  box-shadow: 0 0 40px rgba(182, 196, 255, 0.1);
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

.hub-icon {
  color: #b6c4ff;
  font-size: 44px;
  margin-bottom: 4px;
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

/* ═══════ Active Polygons (设计图方形) ═══════ */
.polygon {
  position: absolute;
  z-index: 12;
  width: 560px;
  height: 560px;
  border: 1.2px solid rgba(216, 185, 255, 0.2);
  pointer-events: none;
  opacity: 0;
  border-radius: 4px;
  transition: opacity 0.6s ease;
}

.polygon-1 {
  animation: rotate-slow 12s linear infinite;
}
.polygon-2 {
  animation: rotate-reverse 16s linear infinite;
  border-color: rgba(216, 185, 255, 0.25);
}
.polygon-3 {
  animation: rotate-slow 20s linear infinite;
  border-color: rgba(182, 196, 255, 0.2);
}
.polygon-4 {
  animation: rotate-reverse 24s linear infinite;
  border-color: rgba(216, 185, 255, 0.18);
}
.polygon-5 {
  animation: rotate-slow 28s linear infinite;
  border-color: rgba(182, 196, 255, 0.15);
}
/* ═══════ Glowing Orb ═══════ */
.orbit-orb {
  position: absolute;
  z-index: 15;
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(182, 196, 255, 0.9), rgba(162, 89, 255, 0.6));
  box-shadow:
    0 0 20px rgba(182, 196, 255, 0.6),
    0 0 60px rgba(162, 89, 255, 0.3);
  animation: orb-travel 8s ease-in-out infinite;
  pointer-events: none;
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
  background: linear-gradient(to top, #0b0e14, #0b0e14 60%, transparent);
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
  border: 1px solid rgba(141, 144, 160, 0.2);
  background: rgba(39, 42, 49, 1);
  color: rgba(196, 197, 215, 0.6);
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
  color: rgba(196, 197, 215, 0.6);
  margin: 0;
  white-space: nowrap;
}

.pipeline-step.active .step-no {
  background: rgba(182, 196, 255, 0.2);
  border-color: rgba(182, 196, 255, 0.4);
  color: #b6c4ff;
}

.pipeline-step.active .step-title {
  color: #b6c4ff;
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
  background: rgba(50, 53, 60, 1);
  overflow: hidden;
}

.step-track i {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: rgba(182, 196, 255, 0.4);
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
  background: rgba(182, 196, 255, 0.5);
}

.step-desc {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 20px;
  color: rgba(196, 197, 215, 0.4);
}

.step-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  flex-shrink: 0;
  opacity: 0.2;
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

.fab-border {
  padding: 1.5px;
  border-radius: 9999px;
  background: linear-gradient(to right, #b6c4ff, #d8b9ff);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.fab-inner {
  display: flex;
  align-items: center;
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
/* 对标设计图：隐藏圆环/节点，显示旋转方形多边形，Hub 变圆角方形 */
.is-active .orbit,
.is-active .orbit-orb,
.is-active .svg-rings-wrap,
.is-active .data-lines-wrap,
.is-active .float-node {
  opacity: 0;
  transition: opacity 0.6s ease;
}

.is-active .polygon {
  opacity: 1;
}

.is-active .central-hub {
  border-radius: 16px;
  border-color: rgba(162, 89, 255, 0.5);
  background: rgba(20, 14, 32, 0.85);
  box-shadow:
    0 0 60px rgba(162, 89, 255, 0.45),
    0 0 120px rgba(162, 89, 255, 0.2),
    inset 0 0 40px rgba(162, 89, 255, 0.08);
}

/* ═══════ Generating State (smart generate) ═══════ */
.is-generating .polygon-1 {
  animation-duration: 8s;
}
.is-generating .polygon-2 {
  animation-duration: 10s;
}
.is-generating .polygon-3 {
  animation-duration: 12s;
}
.is-generating .polygon-4 {
  animation-duration: 14s;
}
.is-generating .polygon-5 {
  animation-duration: 16s;
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
  width: 700px;
  height: 700px;
  pointer-events: none;
}

.svg-rings {
  width: 100%;
  height: 100%;
  opacity: 0.3;
}

.ring-outer {
  color: rgba(67, 70, 85, 1);
}

.ring-mid {
  color: #b6c4ff;
  animation: rotate-slow 25s linear infinite;
  transform-origin: 50% 50%;
}

.ring-inner {
  color: #d8b9ff;
  animation: rotate-reverse 35s linear infinite;
  transform-origin: 50% 50%;
}

/* ═══════ Floating Data Nodes ═══════ */
.float-node {
  position: absolute;
  z-index: 25;
  display: flex;
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

/* ═══════ Responsive ═══════ */
@media (max-width: 1280px) {
  .floating-panel {
    width: 220px;
    padding: 12px;
  }
}

@media (max-width: 900px) {
  .top-bar {
    height: auto;
    padding: 12px 16px;
  }

  .global-search {
    display: none;
  }

  .pipeline-steps {
    flex-wrap: wrap;
  }

  .step-chevron {
    display: none;
  }

  .fab-btn {
    bottom: 24px;
    right: 24px;
  }
}
</style>

<style>
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

@keyframes orb-travel {
  0% {
    top: 10%;
    left: 50%;
  }
  25% {
    top: 50%;
    left: 90%;
  }
  50% {
    top: 90%;
    left: 50%;
  }
  75% {
    top: 50%;
    left: 10%;
  }
  100% {
    top: 10%;
    left: 50%;
  }
}
</style>
