<script setup lang="ts">
/**
 * 任务生成用例详情工作台 (独立路由页面)
 */
import { computed, ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useGenTasks } from '@/composables/useRequirementGen'
import type { GenResult } from '@/api/requirementGen'

const route = useRoute()
const router = useRouter()
const taskId = Number(route.params.taskId)

const {
  currentTask,
  currentResults,
  detailLoading,
  batchAdopting,
  fetchTaskDetail,
  handleAdopt,
  handleDiscard,
  handleBatchAdoptResults,
} = useGenTasks()

onMounted(() => {
  if (taskId) {
    fetchTaskDetail(taskId)
  }
})

const adoptedResultCount = computed(
  () => currentResults.value.filter((result) => result.adopted).length,
)
const discardedResultCount = computed(
  () => currentResults.value.filter((result) => result.discarded).length,
)
const pendingResultCount = computed(
  () => currentResults.value.length - adoptedResultCount.value - discardedResultCount.value,
)

const activeResultId = ref<number | null>(null)
const activeResult = computed(() => {
  const matched = currentResults.value.find((result) => result.id === activeResultId.value)
  return matched || currentResults.value[0] || null
})
const activeResultPosition = computed(() => {
  if (!activeResult.value) return 0
  return currentResults.value.findIndex((result) => result.id === activeResult.value?.id) + 1
})
const canGoPrevResult = computed(() => activeResultPosition.value > 1)
const canGoNextResult = computed(() => activeResultPosition.value < currentResults.value.length)
const activeSteps = computed(() => parseSteps(activeResult.value?.steps || ''))
const activeSuggestedTags = computed(() =>
  parseSuggestedTags(activeResult.value?.tags_suggested || ''),
)
const pendingActionableResults = computed(() =>
  currentResults.value.filter((result) => !result.adopted && !result.discarded),
)

function selectResult(resultId: number) {
  activeResultId.value = resultId
}

function goPrevResult() {
  if (!canGoPrevResult.value) return
  const target = currentResults.value[activeResultPosition.value - 2]
  if (target) selectResult(target.id)
}

function goNextResult() {
  if (!canGoNextResult.value) return
  const target = currentResults.value[activeResultPosition.value]
  if (target) selectResult(target.id)
}

async function adoptActiveResult() {
  if (!activeResult.value) return
  await handleAdopt(activeResult.value.id)
}

async function discardActiveResult() {
  if (!activeResult.value) return
  await handleDiscard(activeResult.value.id)
}

async function adoptPendingResults() {
  await handleBatchAdoptResults(pendingActionableResults.value)
}

/** 解析步骤 JSON */
function parseSteps(stepsJson: string): Array<{ action: string; expected: string }> {
  try {
    return JSON.parse(stepsJson)
  } catch {
    return []
  }
}

function formatStepIndex(index: number) {
  return String(index + 1).padStart(2, '0')
}

function parseSuggestedTags(tags: string): string[] {
  if (!tags) return []
  try {
    const parsed = JSON.parse(tags)
    if (Array.isArray(parsed)) {
      return parsed.map((tag) => String(tag).trim()).filter(Boolean)
    }
  } catch {
    return tags
      .split(/[，,;\s]+/)
      .map((tag) => tag.trim())
      .filter(Boolean)
  }
  return []
}

function goBack() {
  router.push({ name: 'RequirementGenTasks' })
}

watch(
  currentResults,
  (results) => {
    if (results.length === 0) {
      activeResultId.value = null
      return
    }
    if (
      !activeResultId.value ||
      !results.some((result: GenResult) => result.id === activeResultId.value)
    ) {
      const firstResult = results[0]
      if (firstResult) activeResultId.value = firstResult.id
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="gen-task-detail-page">
    <header class="result-topbar">
      <div class="topbar-left">
        <button class="custom-back-btn" @click="goBack">
          <span class="material-symbols-outlined">arrow_back</span>
          <span>返回列表</span>
        </button>
        <div v-if="currentTask" class="doc-meta">
          <div class="doc-title-row">
            <span class="task-id-badge">TASK-{{ currentTask.id }}</span>
            <h1>{{ currentTask.task_name }}</h1>
          </div>
        </div>
        <div v-else class="doc-meta">
          <span class="doc-kicker">Requirement Intelligence Output</span>
          <h1>任务详情加载中...</h1>
        </div>
      </div>

      <!-- 顶部指标区 -->
      <div v-if="currentTask" class="topbar-metrics-container">
        <div class="topbar-metric-pill">
          <span class="metric-val">{{ currentTask.generated_count }}</span>
          <span class="metric-lbl">生成</span>
        </div>
        <div class="topbar-metric-pill is-success">
          <span class="metric-val">{{ adoptedResultCount }}</span>
          <span class="metric-lbl">采纳</span>
        </div>
        <div class="topbar-metric-pill is-muted">
          <span class="metric-val">{{ discardedResultCount }}</span>
          <span class="metric-lbl">丢弃</span>
        </div>
        <div class="topbar-metric-pill is-pending">
          <span class="metric-val">{{ pendingResultCount }}</span>
          <span class="metric-lbl">待处理</span>
        </div>
        <el-button
          class="topbar-bulk-adopt"
          type="primary"
          size="small"
          :loading="batchAdopting"
          :disabled="pendingActionableResults.length === 0"
          aria-label="采纳全部待处理生成用例"
          @click="adoptPendingResults"
        >
          采纳全部待处理 {{ pendingActionableResults.length }}
        </el-button>
      </div>
    </header>

    <main v-loading="detailLoading" class="task-detail-body">
      <!-- 失败提示横幅 -->
      <div v-if="currentTask?.fail_reason" class="task-fail-banner" role="alert">
        <span class="material-symbols-outlined">error</span>
        <span>{{ currentTask.fail_reason }}</span>
      </div>

      <!-- 用例列表 & 工作区 -->
      <section v-if="currentResults.length > 0" class="results-workbench" aria-label="生成用例列表">
        <aside class="result-nav-panel" aria-label="生成用例导航">
          <div class="result-nav-header">
            <div class="result-nav-title-row">
              <span class="material-symbols-outlined">fact_check</span>
              <span class="result-nav-title">生成用例</span>
              <span class="result-nav-counter">
                {{ activeResultPosition || 0 }}/{{ currentResults.length }}
              </span>
            </div>
          </div>
          <div class="result-nav-list">
            <button
              v-for="result in currentResults"
              :key="result.id"
              type="button"
              class="result-nav-row"
              :class="{
                active: result.id === activeResult?.id,
                adopted: result.adopted,
                discarded: result.discarded,
              }"
              :aria-label="`选择生成用例 ${result.seq_no}`"
              :aria-current="result.id === activeResult?.id ? 'true' : undefined"
              @click="selectResult(result.id)"
            >
              <span class="result-nav-index">{{ String(result.seq_no).padStart(2, '0') }}</span>
              <span class="result-nav-main">
                <span class="result-nav-name" :title="result.title">{{ result.title }}</span>
              </span>
            </button>
            <div v-if="currentResults.length === 0" class="result-nav-empty">暂无生成用例</div>
          </div>
        </aside>

        <section class="case-detail" aria-label="生成用例详情">
          <div v-if="activeResult" class="detail-card">
            <div class="detail-head">
              <div class="detail-title-wrap">
                <h2>{{ activeResult.title }}</h2>
                <span class="detail-priority" :class="'level--' + activeResult.level.toLowerCase()">
                  {{ activeResult.level }}
                </span>
              </div>
              <div class="result-nav-buttons">
                <button
                  type="button"
                  class="result-switch-btn"
                  :disabled="!canGoPrevResult"
                  aria-label="上一条生成用例"
                  @click="goPrevResult"
                >
                  <span class="material-symbols-outlined">arrow_back</span>
                </button>
                <button
                  type="button"
                  class="result-switch-btn"
                  :disabled="!canGoNextResult"
                  aria-label="下一条生成用例"
                  @click="goNextResult"
                >
                  <span class="material-symbols-outlined">arrow_forward</span>
                </button>
              </div>
            </div>

            <div class="detail-body">
              <div class="condition-grid">
                <section class="detail-section condition-card">
                  <h3>
                    <span class="material-symbols-outlined">subdirectory_arrow_right</span>
                    前置条件
                  </h3>
                  <div class="readonly-box">
                    {{ activeResult.precondition || '暂无前置条件' }}
                  </div>
                </section>

                <section class="detail-section condition-card">
                  <h3>
                    <span class="material-symbols-outlined">subdirectory_arrow_right</span>
                    后置条件
                  </h3>
                  <div class="readonly-box">
                    {{ activeResult.postcondition || '暂无后置条件' }}
                  </div>
                </section>
              </div>

              <section v-if="activeSuggestedTags.length" class="detail-section">
                <h3>建议标签</h3>
                <div class="result-tags">
                  <span
                    v-for="tag in activeSuggestedTags"
                    :key="tag"
                    class="result-tag"
                    :class="{ 'tag--none': tag === '无' || tag === '暂无' || tag === '' }"
                  >
                    {{ tag }}
                  </span>
                </div>
              </section>

              <section class="detail-section detail-section--steps">
                <div class="section-title-row">
                  <h3>
                    <span class="material-symbols-outlined">table_rows</span>
                    测试步骤
                  </h3>
                  <span class="step-count">共 {{ activeSteps.length }} 步</span>
                </div>
                <div v-if="activeSteps.length" class="step-table">
                  <div class="step-table-head">
                    <span>#</span>
                    <span>操作描述</span>
                    <span>预期结果</span>
                  </div>
                  <div v-for="(step, idx) in activeSteps" :key="idx" class="step-table-row">
                    <span class="step-index">{{ formatStepIndex(idx) }}</span>
                    <div class="step-cell">{{ step.action || '暂无操作描述' }}</div>
                    <div class="step-cell">{{ step.expected || '暂无预期结果' }}</div>
                  </div>
                </div>
                <div v-else class="step-table step-table--empty">
                  <div class="step-table-head">
                    <span>#</span>
                    <span>操作描述</span>
                    <span>预期结果</span>
                  </div>
                  <div class="step-table-row">
                    <span class="step-index">--</span>
                    <div class="step-cell empty-text">暂无步骤描述</div>
                    <div class="step-cell empty-text">暂无预期结果</div>
                  </div>
                </div>
              </section>

              <section v-if="activeResult.remark" class="detail-section remark-card">
                <h3>
                  <span class="material-symbols-outlined">notes</span>
                  备注说明
                </h3>
                <div class="readonly-box readonly-box--compact">
                  {{ activeResult.remark }}
                </div>
              </section>
            </div>

            <footer class="detail-actions">
              <div
                v-if="!activeResult.adopted && !activeResult.discarded"
                class="detail-action-group"
              >
                <el-button
                  class="detail-action-btn detail-action-btn--adopt"
                  type="primary"
                  size="small"
                  @click="adoptActiveResult"
                >
                  采纳用例
                </el-button>
                <el-button
                  class="detail-action-btn detail-action-btn--discard"
                  size="small"
                  @click="discardActiveResult"
                >
                  丢弃用例
                </el-button>
              </div>
            </footer>
          </div>
        </section>
      </section>

      <div v-else-if="!detailLoading" class="empty-state">
        <p>暂无用例数据</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.gen-task-detail-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px);
  overflow: hidden;
  color: var(--tp-text-primary);
  background: var(--tp-bg-page);
}

.result-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 58px;
  gap: var(--tp-space-5);
  padding: 0 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--tp-border-subtle) 72%, transparent);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--tp-surface-elevated) 36%, transparent),
      transparent
    ),
    var(--tp-surface-card);
  box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--tp-bg-page) 52%, transparent);
}

.topbar-left {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 12px;
  min-width: 0;
}

.custom-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  height: 30px;
  padding: 0 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--tp-radius-sm);
  color: var(--tp-text-muted);
  font-size: 12px;
  font-weight: var(--tp-font-medium);
  cursor: pointer;
  transition:
    background var(--tp-transition),
    border-color var(--tp-transition),
    color var(--tp-transition),
    transform var(--tp-transition);
}

.custom-back-btn:hover {
  background: color-mix(in srgb, var(--tp-surface-elevated) 44%, transparent);
  border-color: color-mix(in srgb, var(--tp-border-subtle) 68%, transparent);
  color: var(--tp-text-primary);
  transform: translateX(-1px);
}

.custom-back-btn .material-symbols-outlined {
  font-size: 14px;
  line-height: 1;
}

.doc-meta {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 12px;
  border-left: 1px solid color-mix(in srgb, var(--tp-border-subtle) 70%, transparent);
}

.doc-title-row {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 9px;
}

.task-id-badge {
  display: inline-flex;
  align-items: center;
  flex: none;
  height: 20px;
  color: var(--tp-accent-primary);
  font-family: var(--tp-font-family-mono);
  font-size: 10px;
  font-weight: var(--tp-font-bold);
  line-height: 1;
  background: var(--tp-accent-primary-soft);
  border: 1px solid var(--tp-accent-primary-border);
  padding: 0 8px;
  border-radius: 999px;
}

.doc-meta h1 {
  margin: 0;
  overflow: hidden;
  color: var(--tp-text-primary);
  font-size: 15px;
  font-weight: var(--tp-font-bold);
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.25;
}

.topbar-metrics-container {
  display: flex;
  align-items: center;
  flex: none;
  gap: 0;
  padding: 3px;
  border: 1px solid color-mix(in srgb, var(--tp-border-subtle) 42%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--tp-surface-elevated) 34%, transparent);
}

.topbar-metric-pill {
  display: inline-grid;
  grid-template-columns: max-content max-content;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 11px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  position: relative;
}

.topbar-metric-pill + .topbar-metric-pill::before {
  position: absolute;
  top: 7px;
  bottom: 7px;
  left: -1px;
  width: 1px;
  background: color-mix(in srgb, var(--tp-border-subtle) 54%, transparent);
  content: '';
}

.metric-val {
  color: var(--tp-text-primary);
  font-family: var(--tp-font-family-mono);
  font-size: 13px;
  font-weight: var(--tp-font-bold);
  line-height: 1;
}

.metric-lbl {
  color: color-mix(in srgb, var(--tp-text-muted) 86%, transparent);
  font-size: 12px;
  font-weight: var(--tp-font-medium);
  line-height: 1;
}

.topbar-metric-pill.is-success {
  background: transparent;
  border-color: transparent;
}

.topbar-metric-pill.is-success .metric-val {
  color: var(--tp-success);
}

.topbar-metric-pill.is-muted {
  opacity: 0.72;
}

.topbar-metric-pill.is-muted .metric-val {
  color: var(--tp-text-muted);
}

.topbar-metric-pill.is-pending {
  background: transparent;
  border-color: transparent;
}

.topbar-metric-pill.is-pending .metric-val {
  color: var(--tp-primary);
}

.topbar-bulk-adopt {
  --el-button-bg-color: color-mix(in srgb, var(--tp-primary) 20%, transparent);
  --el-button-border-color: color-mix(in srgb, var(--tp-primary) 32%, transparent);
  --el-button-text-color: color-mix(in srgb, var(--tp-text-primary) 92%, var(--tp-primary));
  --el-button-hover-bg-color: color-mix(in srgb, var(--tp-primary) 28%, transparent);
  --el-button-hover-border-color: color-mix(in srgb, var(--tp-primary) 45%, transparent);
  --el-button-hover-text-color: var(--tp-text-primary);
  --el-button-active-bg-color: color-mix(in srgb, var(--tp-primary) 34%, transparent);
  --el-button-active-border-color: color-mix(in srgb, var(--tp-primary) 52%, transparent);
  flex: none;
  height: 28px;
  margin-left: 10px;
  padding: 0 12px;
  border-radius: 8px;
  box-shadow: none;
  font-weight: var(--tp-font-semibold);
  line-height: 1;
  position: relative;
}

.topbar-bulk-adopt::before {
  position: absolute;
  top: 5px;
  bottom: 5px;
  left: -7px;
  width: 1px;
  background: color-mix(in srgb, var(--tp-border-subtle) 62%, transparent);
  content: '';
}

.task-detail-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 10px 12px 12px;
  gap: 10px;
}

.task-fail-banner {
  grid-column: 1 / -1;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 10px;
  color: var(--tp-danger);
  background: var(--tp-accent-danger-soft);
  border: 1px solid var(--tp-accent-danger-border);
  border-radius: var(--tp-radius-sm);
  font-size: 12px;
  line-height: 1.6;
}

.task-fail-banner .material-symbols-outlined {
  flex: none;
  margin-top: 1px;
  font-size: 16px;
}

.results-workbench {
  display: grid;
  flex: 1;
  grid-template-columns: clamp(460px, 30vw, 520px) minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
  background: var(--tp-surface-card);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
}

.result-nav-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: color-mix(in srgb, var(--tp-surface-elevated) 70%, var(--tp-surface-card));
  border-right: 1px solid var(--tp-border-subtle);
}

.result-nav-header {
  flex: none;
  padding: 12px;
  border-bottom: 1px solid var(--tp-border-subtle);
}

.result-nav-title-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.result-nav-title-row .material-symbols-outlined {
  color: var(--tp-primary);
  font-size: 18px;
  line-height: 1;
}

.result-nav-title {
  min-width: 0;
  color: var(--tp-text-primary);
  font-size: 14px;
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-ui);
}

.result-nav-counter {
  margin-left: auto;
  color: var(--tp-text-muted);
  font-family: var(--tp-font-family-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: var(--tp-line-ui);
}

.result-nav-row:focus-visible,
.result-switch-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--tp-primary) 42%, transparent);
  outline-offset: 2px;
}

.result-nav-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 8px;
  gap: 7px;
  overflow-y: auto;
}

.result-nav-list::-webkit-scrollbar,
.detail-body::-webkit-scrollbar {
  width: 6px;
}

.result-nav-list::-webkit-scrollbar-track,
.detail-body::-webkit-scrollbar-track {
  background: transparent;
}

.result-nav-list::-webkit-scrollbar-thumb,
.detail-body::-webkit-scrollbar-thumb {
  background: var(--tp-border-subtle);
  border-radius: 999px;
}

.result-nav-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: center;
  width: 100%;
  min-height: 68px;
  padding: 11px;
  gap: 12px;
  text-align: left;
  background: color-mix(in srgb, var(--tp-surface-elevated) 40%, transparent);
  border: 1px solid color-mix(in srgb, var(--tp-border-subtle) 40%, transparent);
  border-radius: 10px;
  cursor: pointer;
  margin-bottom: 4px;
  transition:
    background 0.22s ease,
    border-color 0.22s ease,
    box-shadow 0.22s ease,
    transform 0.22s ease;
}

.result-nav-row:hover {
  background: color-mix(in srgb, var(--tp-surface-hover) 85%, transparent);
  border-color: color-mix(in srgb, var(--tp-border-subtle) 90%, transparent);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.result-nav-row.active {
  background: var(--tp-accent-primary-soft);
  border-color: var(--tp-accent-primary-border);
  box-shadow:
    0 0 0 1px var(--tp-accent-primary-border),
    0 4px 16px -4px var(--tp-primary-shadow);
}

.result-nav-row.adopted {
  background: color-mix(in srgb, var(--tp-accent-success-soft) 30%, transparent);
  border-color: color-mix(in srgb, var(--tp-success) 35%, transparent);
}

.result-nav-row.adopted.active {
  background: color-mix(in srgb, var(--tp-accent-success-soft) 55%, transparent);
  border-color: var(--tp-success);
}

.result-nav-row.discarded {
  opacity: 0.62;
}

.result-nav-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  width: 30px;
  height: 30px;
  margin-top: 0;
  color: var(--tp-primary);
  background: var(--tp-accent-primary-soft);
  border: 1px solid var(--tp-accent-primary-border);
  border-radius: 999px;
  font-family: var(--tp-font-family-mono);
  font-size: 11px;
  font-weight: var(--tp-font-bold);
  line-height: 1;
  transition: all 0.2s ease;
}

.result-nav-main {
  justify-content: center;
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 5px;
}

.result-nav-name {
  display: -webkit-box;
  overflow: hidden;
  color: var(--tp-text-primary);
  font-size: 13px;
  font-weight: var(--tp-font-semibold);
  line-height: 1.45;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.result-nav-empty {
  padding: 24px 8px;
  color: var(--tp-text-muted);
  text-align: center;
  font-size: 12px;
}

.case-detail {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 8px 10px 10px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--tp-surface-muted) 46%, transparent) 0%,
    var(--tp-bg-page) 100%
  );
}

.detail-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--tp-border-subtle) 84%, transparent);
  border-radius: var(--tp-radius-lg);
  background: var(--tp-surface-card);
  box-shadow: var(--tp-shadow-card);
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--tp-space-4);
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--tp-border-subtle);
  background: color-mix(in srgb, var(--tp-surface-elevated) 30%, transparent);
}

.detail-title-wrap {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
}

.detail-head h2 {
  margin: 0;
  min-width: 0;
  color: var(--tp-text-primary);
  font-size: var(--tp-text-xl);
  font-weight: var(--tp-font-bold);
  line-height: 1.45;
}

.detail-priority {
  display: inline-flex;
  align-items: center;
  flex: none;
  height: 22px;
  padding: 0 8px;
  border-radius: var(--tp-radius-sm);
  font-size: 11px;
  font-weight: var(--tp-font-bold);
  line-height: 1;
}

.result-nav-buttons {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding-left: 2px;
}

.result-switch-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  color: var(--tp-text-muted);
  background: var(--tp-surface-input);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-sm);
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    opacity 0.18s ease;
}

.result-switch-btn:hover:not(:disabled) {
  color: var(--tp-primary);
  background: var(--tp-accent-primary-soft);
  border-color: var(--tp-accent-primary-border);
}

.result-switch-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.result-switch-btn .material-symbols-outlined {
  font-size: 16px;
  line-height: 1;
}

.detail-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px 14px;
}

.condition-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.detail-section {
  overflow: hidden;
  padding: 14px;
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-lg);
  background: color-mix(in srgb, var(--tp-surface-elevated) 46%, var(--tp-surface-card));
}

.condition-card {
  min-height: 148px;
}

.detail-section--steps {
  border-color: color-mix(in srgb, var(--tp-accent-primary-border) 62%, var(--tp-border-subtle));
  background: color-mix(in srgb, var(--tp-surface-elevated) 56%, var(--tp-surface-card));
}

.remark-card {
  max-width: none;
}

.detail-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 54px;
  padding: 10px 18px;
  border-top: 1px solid var(--tp-border-subtle);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--tp-surface-elevated) 18%, transparent),
      transparent
    ),
    color-mix(in srgb, var(--tp-surface-muted) 88%, var(--tp-surface-card));
}

.detail-action-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  border: 1px solid color-mix(in srgb, var(--tp-border-subtle) 46%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--tp-bg-page) 36%, transparent);
}

.detail-action-btn {
  height: 30px;
  margin-left: 0;
  padding: 0 14px;
  border-radius: 8px;
  font-weight: var(--tp-font-semibold);
}

.detail-action-btn--adopt {
  --el-button-bg-color: color-mix(in srgb, var(--tp-primary) 74%, var(--tp-warning) 26%);
  --el-button-border-color: color-mix(in srgb, var(--tp-primary) 62%, var(--tp-warning) 38%);
  --el-button-hover-bg-color: color-mix(in srgb, var(--tp-primary) 82%, var(--tp-warning) 18%);
  --el-button-hover-border-color: color-mix(in srgb, var(--tp-primary) 72%, var(--tp-warning) 28%);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--tp-primary) 12%, transparent);
}

.detail-action-btn--discard {
  --el-button-bg-color: color-mix(in srgb, var(--tp-surface-elevated) 46%, transparent);
  --el-button-border-color: color-mix(in srgb, var(--tp-border-subtle) 72%, transparent);
  --el-button-text-color: var(--tp-text-muted);
  --el-button-hover-bg-color: color-mix(in srgb, var(--tp-danger) 13%, transparent);
  --el-button-hover-border-color: color-mix(in srgb, var(--tp-danger) 36%, transparent);
  --el-button-hover-text-color: var(--tp-danger);
}

/* 优先级等级样式 */
.level--p0 {
  color: var(--tp-p0) !important;
  background: var(--tp-p0-bg) !important;
  border: 1px solid rgba(220, 38, 38, 0.25) !important;
}

.level--p1 {
  color: var(--tp-p1) !important;
  background: var(--tp-p1-bg) !important;
  border: 1px solid rgba(249, 115, 22, 0.25) !important;
}

.level--p2 {
  color: var(--tp-p2) !important;
  background: var(--tp-p2-bg) !important;
  border: 1px solid rgba(139, 92, 246, 0.25) !important;
}

.level--p3 {
  color: var(--tp-p3) !important;
  background: var(--tp-p3-bg) !important;
  border: 1px solid rgba(100, 116, 139, 0.25) !important;
}

.detail-section h3 {
  display: flex;
  align-items: center;
  gap: var(--tp-space-2);
  margin: 0 0 12px;
  color: var(--tp-text-primary);
  font-size: 14px;
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-ui);
}

.detail-section h3 .material-symbols-outlined {
  color: var(--tp-accent-primary);
  font-size: 18px;
  line-height: 1;
}

.detail-section p {
  margin: 0;
  color: var(--tp-text-muted);
  line-height: var(--tp-line-relaxed);
}

.readonly-box {
  min-height: 96px;
  padding: 14px 16px;
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--tp-border-subtle) 84%, transparent);
  border-radius: var(--tp-radius-lg);
  background: color-mix(in srgb, var(--tp-bg-page) 72%, var(--tp-surface-card));
  color: var(--tp-text-primary);
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
}

.readonly-box--compact {
  min-height: 76px;
}

.result-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.result-tag {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  color: var(--tp-text-secondary);
  background: var(--tp-surface-elevated);
  border: 1px solid var(--tp-border-subtle);
  border-radius: 999px;
  font-size: 12px;
  font-weight: var(--tp-font-medium);
  transition: all 0.2s ease;
}

.result-tag.tag--none {
  color: var(--tp-text-subtle) !important;
  background: transparent !important;
  border: 1px dashed var(--tp-border-subtle) !important;
  opacity: 0.65;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--tp-space-3);
  margin-bottom: var(--tp-space-3);
}

.section-title-row h3 {
  margin: 0;
}

.step-count {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 var(--tp-space-3);
  border: 1px solid var(--tp-accent-primary-border);
  border-radius: 999px;
  color: var(--tp-accent-primary);
  background: var(--tp-accent-primary-soft);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-semibold);
}

.step-table {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--tp-border-subtle) 86%, transparent);
  border-radius: var(--tp-radius-lg);
  background: color-mix(in srgb, var(--tp-bg-page) 68%, var(--tp-surface-card));
}

.step-table-head,
.step-table-row {
  display: grid;
  grid-template-columns: 74px minmax(0, 1.08fr) minmax(0, 1fr);
  align-items: stretch;
}

.step-table-head {
  min-height: 46px;
  border-bottom: 1px solid var(--tp-border-subtle);
  color: var(--tp-text-muted);
  background: color-mix(in srgb, var(--tp-surface-muted) 76%, transparent);
  font-size: 13px;
  font-weight: var(--tp-font-bold);
}

.step-table-head span,
.step-table-row > * {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 14px 16px;
}

.step-table-row {
  min-height: 78px;
  color: var(--tp-text-primary);
}

.step-table-row + .step-table-row {
  border-top: 1px solid color-mix(in srgb, var(--tp-border-subtle) 72%, transparent);
}

.step-table-row > * + * {
  border-left: 1px solid color-mix(in srgb, var(--tp-border-subtle) 70%, transparent);
}

.step-index {
  justify-content: center;
  color: var(--tp-text-muted);
  font-family: var(--tp-font-family-mono);
  font-size: var(--tp-text-sm);
  font-weight: var(--tp-font-bold);
}

.step-cell {
  color: var(--tp-text-primary);
  font-size: 14px;
  line-height: 1.75;
  white-space: pre-wrap;
}

.empty-text {
  color: var(--tp-text-muted);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 48px;
  color: var(--tp-text-muted);
}
</style>
