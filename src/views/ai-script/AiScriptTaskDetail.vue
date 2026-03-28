<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAiScriptStore } from '../../stores/aiScript'
import {
  TaskStatusLabel,
  TaskStatusColor,
  TraceActionType,
} from '../../api/aiScript'

const route = useRoute()
const router = useRouter()
const store = useAiScriptStore()

const taskId = computed(() => Number(route.params.taskId))

onMounted(async () => {
  if (taskId.value) {
    await store.loadTaskDetailFull(taskId.value)
  }
})

const task = computed(() => store.currentTask)
const script = computed(() => store.currentScript)
const traces = computed(() => store.traces)
const validation = computed(() => store.latestValidation)

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

/** 简易语法高亮：将脚本内容拆分为行 */
function highlightLines(content: string) {
  return content.split('\n').map((line, i) => ({
    no: i + 1,
    raw: line,
    html: highlightLine(line),
  }))
}

function highlightLine(line: string): string {
  // 转义 HTML
  let s = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // 注释
  if (/^\s*\/\//.test(s)) return `<span class="ai-code-comment">${s}</span>`
  // 关键字
  s = s.replace(
    /\b(import|from|export|const|let|var|async|await|function|return|test|expect)\b/g,
    '<span class="ai-code-keyword">$1</span>',
  )
  // 字符串
  s = s.replace(
    /'([^']*)'/g,
    "'<span class=\"ai-code-string\">$1</span>'",
  )
  return s
}

function goBack() {
  router.push('/ai-script')
}
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
        <h1>{{ task?.taskName || '加载中...' }}</h1>
      </div>
      <div class="ai-action-group">
        <button class="ai-btn ai-btn-ghost">
          <span class="material-symbols-outlined">refresh</span>
          重新生成
        </button>
        <button class="ai-btn ai-btn-secondary">
          <span class="material-symbols-outlined">check_circle</span>
          确认脚本
        </button>
        <button class="ai-btn ai-btn-primary">
          <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1">play_arrow</span>
          执行验证
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
                <span class="material-symbols-outlined" style="font-size: 16px; color: #adc6ff">terminal</span>
                <span v-if="task">{{ task.caseTags.join(', ') }}</span>
              </div>
            </div>
            <div>
              <div class="ai-info-label">起始地址</div>
              <div class="ai-info-url">{{ task?.startUrl || '-' }}</div>
            </div>
          </div>
        </section>

        <!-- 操作轨迹时间线 -->
        <section class="ai-info-card" style="flex: 1">
          <span class="ai-section-title" style="margin-bottom: 18px; display: block">
            操作轨迹 (browser-use)
          </span>
          <div class="ai-timeline">
            <div
              v-for="(trace, idx) in traces"
              :key="trace.id"
              class="ai-timeline-step"
              :class="{ active: idx === 0 }"
            >
              <div class="ai-timeline-dot"></div>
              <div class="ai-timeline-card">
                <div class="ai-timeline-meta">
                  <span class="ai-timeline-time">{{ trace.occurredAt }}</span>
                  <span class="material-symbols-outlined" style="font-size: 16px; color: var(--tp-gray-500)">
                    {{ traceIcon(trace.actionType) }}
                  </span>
                </div>
                <p class="ai-timeline-desc">{{ trace.targetSummary }}</p>
                <!-- 第一步显示截图占位 -->
                <div v-if="idx === 0" class="ai-timeline-screenshot">
                  <span class="material-symbols-outlined" style="font-size: 24px">image</span>
                  &nbsp;页面截图
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- 右: 脚本 + 验证 -->
      <div class="ai-detail-right">
        <!-- 脚本代码预览 -->
        <section class="ai-code-panel" v-if="script">
          <div class="ai-code-header">
            <div class="ai-code-header-left">
              <span class="material-symbols-outlined">javascript</span>
              <h3>Playwright 执行脚本</h3>
            </div>
            <div class="ai-code-header-right">
              <span class="ai-code-filename">auth-flow.spec.ts</span>
              <button class="ai-code-copy-btn" title="复制代码">
                <span class="material-symbols-outlined" style="font-size: 16px">content_copy</span>
              </button>
            </div>
          </div>
          <div class="ai-code-body">
            <div
              v-for="line in highlightLines(script.scriptContent)"
              :key="line.no"
              class="ai-code-line"
            >
              <span class="ai-code-line-no">{{ line.no }}</span>
              <span class="ai-code-line-content" v-html="line.html"></span>
            </div>
          </div>
        </section>

        <!-- 验证报告 -->
        <section class="ai-validation-panel" v-if="validation">
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
                  截取于 {{ validation.screenshots[0]?.takenAt || '-' }}
                </span>
              </div>
              <div class="ai-fail-screenshot">
                <div class="ai-fail-screenshot-placeholder">
                  <span class="material-symbols-outlined">broken_image</span>
                  <span>错误状态</span>
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
      </div>
    </div>
  </div>
</template>
