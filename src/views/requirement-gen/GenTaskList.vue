<script setup lang="ts">
/**
 * 生成任务列表 + 详情子组件
 */
import { computed, ref } from 'vue'
import { useGenTasks } from '@/composables/useRequirementGen'
import type { GenResult, GenTask } from '@/api/requirementGen'

const {
  tasks,
  total,
  loading,
  page,
  pageSize,
  currentTask,
  currentResults,
  detailLoading,
  batchDeleting,
  fetchTasks,
  fetchTaskDetail,
  handleAdopt,
  handleDiscard,
  handleDeleteTask,
  handleBatchDeleteTasks,
} = useGenTasks()

const showDetailDialog = ref(false)
const selectedTasks = ref<GenTask[]>([])
const taskTableRef = ref<{ clearSelection: () => void } | null>(null)
const pageStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * pageSize.value + 1))
const pageEnd = computed(() => Math.min(page.value * pageSize.value, total.value))
const selectedCount = computed(() => selectedTasks.value.length)
const adoptedResultCount = computed(
  () => currentResults.value.filter((result) => result.adopted).length,
)
const discardedResultCount = computed(
  () => currentResults.value.filter((result) => result.discarded).length,
)
const pendingResultCount = computed(
  () => currentResults.value.length - adoptedResultCount.value - discardedResultCount.value,
)

function openDetail(taskId: number) {
  fetchTaskDetail(taskId)
  showDetailDialog.value = true
}

function handlePageChange(p: number) {
  page.value = p
  fetchTasks()
}

function handleRowClick(row: { id: number }) {
  openDetail(row.id)
}

function handleSelectionChange(selection: GenTask[]) {
  selectedTasks.value = selection
}

async function handleBatchDelete() {
  const deleted = await handleBatchDeleteTasks(selectedTasks.value)
  if (deleted) {
    clearBatchSelection()
  }
}

function clearBatchSelection() {
  taskTableRef.value?.clearSelection()
  selectedTasks.value = []
}

function normalizeStatus(status: string) {
  return status.toLowerCase()
}

/** 状态文本 */
function statusLabel(status: string) {
  const normalizedStatus = normalizeStatus(status)
  const map: Record<string, string> = {
    pending: '等待中',
    running: '生成中',
    success: '已完成',
    failed: '失败',
    partially_closed: '部分关闭',
    partial_adopted: '部分采纳',
    fully_closed: '已关闭',
  }
  return map[normalizedStatus] || status
}

/** 状态 CSS class */
function statusClass(status: string) {
  const normalizedStatus = normalizeStatus(status)
  const map: Record<string, string> = {
    pending: 'pill-pending',
    running: 'pill-running',
    success: 'pill-success',
    failed: 'pill-failed',
    partially_closed: 'pill-partial',
    partial_adopted: 'pill-partial',
    fully_closed: 'pill-closed',
  }
  return map[normalizedStatus] || 'pill-closed'
}

/** 解析步骤 JSON */
function parseSteps(stepsJson: string): Array<{ action: string; expected: string }> {
  try {
    return JSON.parse(stepsJson)
  } catch {
    return []
  }
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

function formatDuration(durationMs: number) {
  if (!durationMs) return '—'
  return `${(durationMs / 1000).toFixed(1)}s`
}

function formatDateTime(dateTime: string) {
  if (!dateTime) return '—'
  return dateTime.slice(0, 16).replace('T', ' ')
}

function formatConfidence(confidence: number) {
  if (!confidence) return '—'
  const percent = confidence <= 1 ? confidence * 100 : confidence
  return `${Math.round(percent)}%`
}

function resultStateLabel(result: GenResult) {
  if (result.adopted) return '已采纳'
  if (result.discarded) return '已丢弃'
  return '待处理'
}
</script>

<template>
  <div class="task-list-page">
    <div class="task-list-container">
      <!-- 任务列表 -->
      <div class="task-table-wrap">
        <el-table
          ref="taskTableRef"
          v-loading="loading"
          class="task-table"
          :data="tasks"
          height="100%"
          row-key="id"
          style="width: 100%"
          @row-click="handleRowClick"
          @selection-change="handleSelectionChange"
        >
          <el-table-column type="selection" width="44" fixed="left" />
          <el-table-column prop="task_name" label="任务名称" min-width="360" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="task-cell">
                <span class="task-name-text">{{ row.task_name }}</span>
                <span class="task-id-text">TASK-{{ row.id }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="104" align="center">
            <template #default="{ row }">
              <span class="status-pill" :class="statusClass(row.status)">
                <i class="status-dot" />
                {{ statusLabel(row.status) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="模型" width="260" prop="ai_model_snapshot" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="mono-text model-text">{{ row.ai_model_snapshot }}</span>
            </template>
          </el-table-column>
          <el-table-column label="生成 / 采纳 / 丢弃" width="132" align="center">
            <template #default="{ row }">
              <span class="stat-text">
                <span class="stat-gen">{{ row.generated_count }}</span>
                <span class="stat-sep">/</span>
                <span class="stat-adopt">{{ row.adopted_count }}</span>
                <span class="stat-sep">/</span>
                <span class="stat-discard">{{ row.discarded_count }}</span>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="耗时" width="84" align="right">
            <template #default="{ row }">
              <span class="mono-text dim-text">
                {{ row.duration_ms ? (row.duration_ms / 1000).toFixed(1) + 's' : '—' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" width="152">
            <template #default="{ row }">
              <span class="mono-text dim-text">
                {{ row.created_at?.slice(0, 16).replace('T', ' ') }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="96" fixed="right" align="right">
            <template #default="{ row }">
              <div class="row-actions">
                <button
                  type="button"
                  class="action-btn"
                  title="查看用例"
                  :aria-label="`查看用例：${row.task_name}`"
                  @click.stop="openDetail(row.id)"
                >
                  <span class="material-symbols-outlined">visibility</span>
                </button>
                <button
                  type="button"
                  class="action-btn action-btn--danger"
                  title="删除任务"
                  :aria-label="`删除任务：${row.task_name}`"
                  @click.stop="handleDeleteTask(row.id)"
                >
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>
            </template>
          </el-table-column>
          <template #empty>
            <div class="table-empty" role="status">
              <div class="table-empty-visual" aria-hidden="true">
                <div class="table-empty-card table-empty-card--back"></div>
                <div class="table-empty-card table-empty-card--front">
                  <span class="material-symbols-outlined">auto_awesome_motion</span>
                </div>
              </div>
              <div class="table-empty-title">暂无生成任务</div>
              <div class="table-empty-desc">上传并解析需求文档后，生成任务会显示在这里。</div>
            </div>
          </template>
        </el-table>

        <!-- 分页 -->
        <div v-if="total > 0" class="pagination-wrap">
          <span class="pagination-info">
            显示
            <strong>{{ pageStart }} - {{ pageEnd }}</strong>
            / 共 {{ total }} 条任务
          </span>
          <el-pagination
            v-if="total > pageSize"
            v-model:current-page="page"
            :page-size="pageSize"
            :total="total"
            layout="prev, pager, next"
            @current-change="handlePageChange"
          />
        </div>
      </div>

      <Teleport to="body">
        <Transition name="task-batch-slide">
          <div v-if="selectedCount > 0" class="task-batch-float-overlay">
            <div class="task-batch-float-bar">
              <div class="task-batch-left">
                <div class="task-batch-count-badge">{{ selectedCount }}</div>
                <div class="task-batch-text">
                  <div class="task-batch-text-title">已选 {{ selectedCount }} 个任务</div>
                  <div class="task-batch-text-sub">批量操作模式已启用</div>
                </div>
              </div>
              <div class="task-batch-actions">
                <button
                  type="button"
                  class="task-batch-action-item task-batch-action-danger"
                  :disabled="batchDeleting"
                  @click="handleBatchDelete"
                >
                  <span class="material-symbols-outlined">delete</span>
                  <span>{{ batchDeleting ? '删除中...' : '批量删除' }}</span>
                </button>
                <div class="task-batch-divider"></div>
                <button
                  type="button"
                  class="task-batch-close"
                  aria-label="退出批量操作"
                  @click="clearBatchSelection"
                >
                  <span class="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- 产出用例对话框 -->
      <el-dialog
        v-model="showDetailDialog"
        class="task-detail-dialog"
        title="产出用例"
        width="960px"
        top="4vh"
      >
        <div v-loading="detailLoading" class="task-detail-body">
          <!-- 任务信息 -->
          <section v-if="currentTask" class="task-detail-summary" aria-label="任务摘要">
            <div class="task-summary-main">
              <div class="task-summary-title-row">
                <span class="task-summary-id">TASK-{{ currentTask.id }}</span>
                <span class="status-pill" :class="statusClass(currentTask.status)">
                  <i class="status-dot" />
                  {{ statusLabel(currentTask.status) }}
                </span>
              </div>
              <h3 class="task-summary-title">{{ currentTask.task_name }}</h3>
              <div class="task-summary-meta">
                <span class="task-summary-meta-item">
                  <span class="meta-label">模型</span>
                  <span class="meta-value">{{ currentTask.ai_model_snapshot || '—' }}</span>
                </span>
                <span class="task-summary-meta-item">
                  <span class="meta-label">耗时</span>
                  <span class="meta-value mono-text">
                    {{ formatDuration(currentTask.duration_ms) }}
                  </span>
                </span>
                <span class="task-summary-meta-item">
                  <span class="meta-label">创建</span>
                  <span class="meta-value mono-text">
                    {{ formatDateTime(currentTask.created_at) }}
                  </span>
                </span>
              </div>
            </div>
            <div class="task-summary-stats">
              <div class="summary-stat">
                <span class="summary-stat-value">{{ currentTask.generated_count }}</span>
                <span class="summary-stat-label">生成</span>
              </div>
              <div class="summary-stat summary-stat--success">
                <span class="summary-stat-value">{{ adoptedResultCount }}</span>
                <span class="summary-stat-label">采纳</span>
              </div>
              <div class="summary-stat summary-stat--muted">
                <span class="summary-stat-value">{{ discardedResultCount }}</span>
                <span class="summary-stat-label">丢弃</span>
              </div>
              <div class="summary-stat summary-stat--pending">
                <span class="summary-stat-value">{{ pendingResultCount }}</span>
                <span class="summary-stat-label">待处理</span>
              </div>
            </div>
            <div v-if="currentTask.fail_reason" class="task-fail-banner" role="alert">
              <span class="material-symbols-outlined">error</span>
              <span>{{ currentTask.fail_reason }}</span>
            </div>
          </section>

          <!-- 用例列表 -->
          <section
            v-if="currentResults.length > 0"
            class="results-section"
            aria-label="生成用例列表"
          >
            <div class="section-head">
              <div>
                <h4 class="section-title">用例列表</h4>
                <p class="section-subtitle">
                  共 {{ currentResults.length }} 条生成结果，可逐条采纳或丢弃。
                </p>
              </div>
            </div>
            <div class="result-cards">
              <article
                v-for="result in currentResults"
                :key="result.id"
                class="result-card"
                :class="{ adopted: result.adopted, discarded: result.discarded }"
              >
                <header class="result-header">
                  <div class="result-title-block">
                    <div class="result-kicker">
                      <span class="result-seq">#{{ result.seq_no }}</span>
                      <span
                        class="result-state"
                        :class="{ adopted: result.adopted, discarded: result.discarded }"
                      >
                        {{ resultStateLabel(result) }}
                      </span>
                    </div>
                    <h5 class="result-title">{{ result.title }}</h5>
                  </div>
                  <div class="result-badges">
                    <span class="result-level">{{ result.level }}</span>
                    <span class="result-confidence">
                      置信度 {{ formatConfidence(result.ai_confidence) }}
                    </span>
                  </div>
                </header>

                <div class="result-content-grid">
                  <div v-if="result.precondition" class="result-field result-field--full">
                    <span class="field-label">前置条件</span>
                    <p class="field-text">{{ result.precondition }}</p>
                  </div>
                  <div
                    v-if="parseSuggestedTags(result.tags_suggested).length"
                    class="result-field result-field--full"
                  >
                    <span class="field-label">建议标签</span>
                    <div class="result-tags">
                      <span
                        v-for="tag in parseSuggestedTags(result.tags_suggested)"
                        :key="tag"
                        class="result-tag"
                      >
                        {{ tag }}
                      </span>
                    </div>
                  </div>
                  <div
                    v-if="parseSteps(result.steps).length"
                    class="result-field result-field--full"
                  >
                    <span class="field-label">测试步骤</span>
                    <ol class="steps-list">
                      <li
                        v-for="(step, idx) in parseSteps(result.steps)"
                        :key="idx"
                        class="step-item"
                      >
                        <span class="step-index">{{ idx + 1 }}</span>
                        <span class="step-body">
                          <span class="step-action">{{ step.action }}</span>
                          <span v-if="step.expected" class="step-expected">
                            {{ step.expected }}
                          </span>
                        </span>
                      </li>
                    </ol>
                  </div>
                  <div v-if="result.postcondition" class="result-field result-field--full">
                    <span class="field-label">后置条件</span>
                    <p class="field-text">{{ result.postcondition }}</p>
                  </div>
                </div>

                <footer class="result-actions">
                  <span v-if="result.remark" class="result-remark">{{ result.remark }}</span>
                  <span v-else class="result-remark result-remark--empty">
                    AI 生成结果，请确认后采纳。
                  </span>
                  <div v-if="!result.adopted && !result.discarded" class="result-action-buttons">
                    <el-button type="primary" size="small" @click="handleAdopt(result.id)">
                      采纳
                    </el-button>
                    <el-button size="small" @click="handleDiscard(result.id)">丢弃</el-button>
                  </div>
                </footer>
              </article>
            </div>
          </section>

          <div v-else-if="!detailLoading" class="empty-state">
            <p>暂无用例数据</p>
          </div>
        </div>
      </el-dialog>
    </div>
  </div>
</template>

<style scoped>
.task-list-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 4px 0 0;
  box-sizing: border-box;
}

.task-list-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 0;
}

.task-table-wrap {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--tp-surface-card);
  border: 1px solid color-mix(in srgb, var(--tp-border-subtle) 86%, transparent);
  border-radius: var(--tp-radius-lg);
  box-shadow: 0 10px 24px -22px color-mix(in srgb, var(--tp-text-primary) 32%, transparent);
}

.task-table {
  flex: 1;
  min-height: 0;
}

.task-batch-float-overlay {
  position: fixed;
  bottom: 32px;
  left: 50%;
  z-index: 9000;
  pointer-events: none;
  transform: translateX(-50%);
}

.task-batch-float-bar {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  gap: 18px;
  pointer-events: auto;
  background: var(--tp-surface-card);
  border: 1px solid var(--tp-border-subtle);
  border-radius: 18px;
  box-shadow:
    0 18px 48px color-mix(in srgb, var(--tp-text-primary) 18%, transparent),
    0 8px 20px color-mix(in srgb, var(--tp-primary) 10%, transparent);
}

.task-batch-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.task-batch-count-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: var(--tp-btn-text);
  background: var(--tp-btn-bg);
  box-shadow: var(--tp-btn-shadow);
  font-size: 16px;
  font-weight: var(--tp-font-bold);
}

.task-batch-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-batch-text-title {
  color: var(--tp-text-primary);
  font-size: 13px;
  font-weight: var(--tp-font-bold);
  line-height: 1.2;
}

.task-batch-text-sub {
  color: var(--tp-text-muted);
  font-size: 11px;
  line-height: 1.2;
}

.task-batch-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.task-batch-action-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 10px;
  gap: 4px;
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-btn-radius);
  background: var(--tp-surface-input);
  color: var(--tp-text-secondary);
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    opacity 0.18s ease;
}

.task-batch-action-item:hover:not(:disabled) {
  background: var(--tp-surface-hover);
  border-color: var(--tp-accent-primary-border);
  color: var(--tp-primary);
}

.task-batch-action-item:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.task-batch-action-item:focus-visible,
.task-batch-close:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--tp-primary) 46%, transparent);
  outline-offset: 2px;
}

.task-batch-action-item .material-symbols-outlined {
  font-size: 17px;
}

.task-batch-action-item span:not(.material-symbols-outlined) {
  font-size: 12px;
  font-weight: var(--tp-font-bold);
}

.task-batch-action-danger {
  color: var(--tp-danger);
  background: var(--tp-accent-danger-soft);
  border-color: var(--tp-accent-danger-border);
}

.task-batch-action-danger .material-symbols-outlined {
  color: var(--tp-danger);
}

.task-batch-action-danger:hover:not(:disabled) {
  color: var(--tp-danger);
  background: var(--tp-accent-danger-soft);
  border-color: var(--tp-danger);
}

.task-batch-divider {
  width: 1px;
  height: 28px;
  margin: 0 2px;
  background: var(--tp-border-subtle);
}

.task-batch-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--tp-text-muted);
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease;
}

.task-batch-close:hover {
  background: var(--tp-surface-hover);
  color: var(--tp-text-primary);
}

.task-batch-close .material-symbols-outlined {
  font-size: 18px;
}

.task-batch-slide-enter-active,
.task-batch-slide-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.task-batch-slide-enter-from,
.task-batch-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}

.pagination-wrap {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 40px;
  padding: 7px 14px;
  border-top: 1px solid color-mix(in srgb, var(--tp-border-subtle) 86%, transparent);
  background: var(--tp-surface-elevated);
  gap: 12px;
}

.pagination-info {
  margin-right: auto;
  color: var(--tp-text-muted);
  font-size: var(--tp-text-xs);
  font-variant-numeric: tabular-nums;
  line-height: var(--tp-line-ui);
}

.pagination-info strong {
  color: var(--tp-text-primary);
  font-weight: var(--tp-font-semibold);
}

.empty-state {
  text-align: center;
  padding: 48px 0;
  color: var(--tp-text-muted, var(--el-text-color-secondary));
  font-size: 13px;
}

.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 280px;
  padding: 48px 20px 56px;
  color: var(--tp-text-muted);
  text-align: center;
}

.table-empty-visual {
  position: relative;
  width: 86px;
  height: 68px;
  margin-bottom: 18px;
}

.table-empty-card {
  position: absolute;
  border: 1px solid var(--tp-border-subtle);
  border-radius: 14px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--tp-surface-elevated) 92%, transparent),
    color-mix(in srgb, var(--tp-surface-card) 96%, transparent)
  );
  box-shadow: 0 14px 34px -26px color-mix(in srgb, var(--tp-primary) 42%, transparent);
}

.table-empty-card--back {
  inset: 8px 4px 0 18px;
  opacity: 0.72;
  transform: rotate(7deg);
}

.table-empty-card--front {
  inset: 0 14px 8px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tp-primary);
  background:
    radial-gradient(circle at 70% 18%, var(--tp-accent-primary-soft), transparent 36%),
    var(--tp-surface-elevated);
  transform: rotate(-5deg);
}

.table-empty-card--front .material-symbols-outlined {
  font-size: 30px;
  line-height: 1;
}

.table-empty-title {
  color: var(--tp-text-primary);
  font-size: var(--tp-text-base);
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-ui);
}

.table-empty-desc {
  max-width: 360px;
  margin-top: 8px;
  color: var(--tp-text-muted);
  font-size: var(--tp-text-xs);
  line-height: 1.7;
}

.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.task-detail-body {
  max-height: calc(92vh - 108px);
  overflow: hidden;
}

:global(.task-detail-dialog.el-dialog) {
  --el-dialog-bg-color: var(--tp-surface-card);
  border: 1px solid var(--tp-border-subtle);
  border-radius: 14px;
  box-shadow: 0 18px 44px -34px color-mix(in srgb, var(--tp-text-primary) 36%, transparent);
}

:global(html[data-theme='genart'] .task-detail-dialog.el-dialog) {
  backdrop-filter: blur(20px);
  background: rgba(18, 20, 30, 0.85);
  border-color: rgba(255, 255, 255, 0.08);
}

:global(.task-detail-dialog .el-dialog__header) {
  display: flex;
  align-items: center;
  min-height: 48px;
  padding: 0 18px;
  margin: 0;
  border-bottom: 1px solid var(--tp-border-subtle);
}

:global(.task-detail-dialog .el-dialog__title) {
  color: var(--tp-text-primary);
  font-size: var(--tp-text-base);
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-ui);
}

:global(.task-detail-dialog .el-dialog__headerbtn) {
  top: 0;
  width: 48px;
  height: 48px;
}

:global(.task-detail-dialog .el-dialog__body) {
  padding: 14px 18px 18px;
  background: var(--tp-surface-muted, #f6f7fb);
}

.task-detail-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  padding: 14px;
  background: var(--tp-surface-card);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-lg);
}

.task-summary-main {
  min-width: 0;
}

.task-summary-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 7px;
}

.task-summary-id {
  color: var(--tp-text-muted);
  font-family: var(--tp-font-family-mono);
  font-size: 11px;
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-ui);
}

.task-summary-title {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 15px;
  font-weight: var(--tp-font-bold);
  line-height: 1.45;
}

.task-summary-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-top: 12px;
}

.task-summary-meta-item {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  gap: 6px;
}

.meta-label {
  flex: none;
  color: var(--tp-text-muted);
  font-size: 11px;
  font-weight: var(--tp-font-semibold);
}

.meta-value {
  min-width: 0;
  color: var(--tp-text-secondary);
  font-size: 12px;
  line-height: var(--tp-line-ui);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-summary-stats {
  display: grid;
  grid-template-columns: repeat(4, 64px);
  gap: 8px;
}

.summary-stat {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 58px;
  padding: 8px;
  background: var(--tp-surface-input);
  border: 1px solid var(--tp-border-subtle);
  border-radius: 10px;
  transition: all 0.2s ease;
}

.summary-stat-value {
  color: var(--tp-text-primary);
  font-family: var(--tp-font-family-mono);
  font-size: 18px;
  font-weight: var(--tp-font-bold);
  line-height: 1.1;
}

.summary-stat-label {
  margin-top: 5px;
  color: var(--tp-text-muted);
  font-size: 11px;
  line-height: 1;
}

.summary-stat--success {
  background: var(--tp-accent-success-soft);
  border-color: var(--tp-accent-success-border);
}
.summary-stat--success .summary-stat-value {
  color: var(--tp-success);
}

.summary-stat--muted {
  opacity: 0.85;
}
.summary-stat--muted .summary-stat-value {
  color: var(--tp-text-muted);
}

.summary-stat--pending {
  background: var(--tp-accent-primary-soft);
  border-color: var(--tp-accent-primary-border);
}
.summary-stat--pending .summary-stat-value {
  color: var(--tp-primary);
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

.results-section {
  margin-top: 14px;
}

.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 10px;
}

.section-title {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 14px;
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-ui);
}

.section-subtitle {
  margin: 3px 0 0;
  color: var(--tp-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.result-cards {
  display: flex;
  flex-direction: column;
  max-height: calc(92vh - 310px);
  min-height: 220px;
  padding-right: 8px;
  gap: 12px;
  overflow-y: auto;
}

/* 滚动条高保真美化 */
.result-cards::-webkit-scrollbar {
  width: 6px;
}

.result-cards::-webkit-scrollbar-track {
  background: transparent;
}

.result-cards::-webkit-scrollbar-thumb {
  background: var(--tp-border-subtle);
  border-radius: 999px;
}

.result-cards::-webkit-scrollbar-thumb:hover {
  background: var(--tp-text-subtle);
}

.result-card {
  position: relative;
  padding: 16px 20px;
  background: var(--tp-surface-card);
  border: 1px solid var(--tp-border-subtle);
  border-radius: 12px;
  transition:
    border-color 0.18s ease,
    background 0.18s ease;
}

.result-card::before {
  content: '';
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 0;
  width: 3px;
  background: var(--tp-primary);
  border-radius: 0 999px 999px 0;
  opacity: 0.22;
}

.result-card:hover {
  border-color: var(--tp-accent-primary-border);
}

.result-card.adopted {
  border-color: var(--tp-accent-success-border);
  background: color-mix(in srgb, var(--tp-accent-success-soft) 32%, var(--tp-surface-card));
}

.result-card.adopted::before {
  background: var(--tp-success);
  opacity: 0.52;
}

.result-card.discarded {
  background: var(--tp-surface-muted);
  opacity: 0.72;
}

.result-card.discarded::before {
  background: var(--tp-text-muted);
}

.result-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-left: 6px;
}

.result-title-block {
  min-width: 0;
}

.result-kicker {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 6px;
}

.result-seq {
  color: var(--tp-text-muted);
  font-family: var(--tp-font-family-mono);
  font-size: 11px;
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-ui);
}

.result-state {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 7px;
  color: var(--tp-primary);
  background: var(--tp-accent-primary-soft);
  border: 1px solid var(--tp-accent-primary-border);
  border-radius: 999px;
  font-size: 11px;
  font-weight: var(--tp-font-semibold);
  line-height: 1;
}

.result-state.adopted {
  color: var(--tp-success);
  background: var(--tp-accent-success-soft);
  border-color: var(--tp-accent-success-border);
}

.result-state.discarded {
  color: var(--tp-text-muted);
  background: var(--tp-surface-input);
  border-color: var(--tp-border-subtle);
}

.result-title {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 14px;
  font-weight: var(--tp-font-bold);
  line-height: 1.55;
}

.result-badges {
  display: inline-flex;
  align-items: center;
  flex: none;
  gap: 6px;
}

.result-level,
.result-confidence {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: var(--tp-font-semibold);
  line-height: 1;
}

.result-level {
  color: var(--tp-primary);
  background: var(--tp-accent-primary-soft);
  border: 1px solid var(--tp-accent-primary-border);
}

.result-confidence {
  color: var(--tp-text-muted);
  background: var(--tp-surface-elevated);
  border: 1px solid var(--tp-border-subtle);
}

.result-content-grid {
  display: grid;
  grid-template-columns: 1fr;
  margin-top: 12px;
  padding-left: 6px;
  gap: 10px;
}

.result-field {
  min-width: 0;
}

.result-field--full {
  grid-column: 1 / -1;
}

.field-label {
  display: block;
  margin-bottom: 5px;
  color: var(--tp-text-muted);
  font-size: 11px;
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-ui);
}

.field-text {
  margin: 0;
  padding: 8px 12px;
  background: var(--tp-surface-input);
  border: 1px solid var(--tp-border-subtle);
  border-radius: 8px;
  color: var(--tp-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.result-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.result-tag {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  color: var(--tp-text-secondary);
  background: var(--tp-surface-elevated);
  border: 1px solid var(--tp-border-subtle);
  border-radius: 999px;
  font-size: 11px;
  font-weight: var(--tp-font-medium);
}

.steps-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  gap: 8px;
  list-style: none;
}

.step-item {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 8px;
}

.step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--tp-primary);
  background: var(--tp-accent-primary-soft);
  border: 1px solid var(--tp-accent-primary-border);
  border-radius: 999px;
  font-family: var(--tp-font-family-mono);
  font-size: 11px;
  font-weight: var(--tp-font-bold);
  line-height: 1;
}

.step-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 1px 0 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--tp-border-subtle) 70%, transparent);
  gap: 4px;
}

.step-item:last-child .step-body {
  padding-bottom: 0;
  border-bottom: 0;
}

.step-action {
  color: var(--tp-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.step-expected {
  color: var(--tp-success);
  font-size: 12px;
  font-weight: var(--tp-font-semibold);
  line-height: 1.65;
}

.step-expected::before {
  content: '预期：';
  color: var(--tp-text-muted);
  font-weight: var(--tp-font-medium);
}

.result-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding: 10px 0 0 6px;
  gap: 12px;
  border-top: 1px solid var(--tp-border-subtle);
}

.result-remark {
  min-width: 0;
  color: var(--tp-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.result-remark--empty {
  color: var(--tp-text-subtle);
}

.result-action-buttons {
  display: inline-flex;
  flex: none;
  gap: 8px;
}

/* ── 状态 Pill 徽标 ─────────────────────────────────────── */
.status-pill {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.6rem;
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-ui);
  letter-spacing: 0.05em;
  border: 1px solid transparent;
  white-space: nowrap;
  color: var(--status-color);
  background: var(--status-bg);
  border-color: var(--status-border);
}

.status-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--status-color);
}

.pill-success {
  --status-bg: var(--tp-accent-success-soft);
  --status-border: var(--tp-accent-success-border);
  --status-color: var(--tp-success);
}

.pill-failed {
  --status-bg: var(--tp-accent-danger-soft);
  --status-border: var(--tp-accent-danger-border);
  --status-color: var(--tp-danger);
}

.pill-running {
  --status-bg: var(--tp-accent-primary-soft);
  --status-border: var(--tp-accent-primary-border);
  --status-color: var(--tp-primary);
}

.pill-pending,
.pill-closed {
  --status-bg: var(--tp-surface-muted);
  --status-border: var(--tp-border-subtle);
  --status-color: var(--tp-text-muted);
}

.pill-partial {
  --status-bg: var(--tp-accent-warning-soft);
  --status-border: var(--tp-accent-warning-border);
  --status-color: var(--tp-warning);
}

.pill-running .status-dot {
  animation: pulse-dot 1.6s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.4;
    transform: scale(0.7);
  }
}

/* ── 表格核心样式 ─────────────────────────────────────────── */
:deep(.el-table) {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: var(--tp-surface-header);
  --el-table-row-hover-bg-color: var(--tp-surface-row-hover);
  --el-table-border-color: var(--tp-border-subtle);
  --el-table-text-color: var(--tp-text-secondary);
  --el-table-header-text-color: var(--tp-text-subtle);
  background: transparent;
  border: 0;
  border-radius: 0;
  overflow: visible;
}

:deep(.el-table__header-wrapper) {
  position: sticky;
  top: 0;
  z-index: 10;
}

:deep(.el-table th.el-table__cell) {
  padding: 12px 14px;
  color: var(--tp-text-muted);
  font-size: 0.6rem;
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-ui);
  letter-spacing: 0;
  background: var(--tp-surface-header) !important;
}

:deep(.el-table td.el-table__cell) {
  padding: 11px 14px;
  color: var(--tp-text-secondary);
  font-size: var(--tp-text-sm);
  font-weight: var(--tp-font-medium);
  line-height: var(--tp-line-ui);
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease;
}

:deep(.el-table .el-table__cell) {
  border-bottom: 1px solid var(--tp-border-subtle);
}

:deep(.el-table__inner-wrapper::before) {
  background-color: color-mix(in srgb, var(--tp-border-subtle) 86%, transparent);
}

:deep(.el-table__body tr:hover td.el-table__cell) {
  background: var(--tp-surface-row-hover) !important;
}

:deep(.el-table__empty-block) {
  min-height: calc(100% - 48px);
}

:deep(.el-table__empty-text) {
  width: 100%;
  height: 100%;
  line-height: normal;
}

:deep(.el-table__fixed-right td.el-table__cell),
:deep(.el-table__fixed-right th.el-table__cell) {
  background: var(--tp-surface-card);
}

:deep(.el-table__fixed-right) {
  box-shadow: -10px 0 18px -18px color-mix(in srgb, var(--tp-text-primary) 24%, transparent);
}

:deep(.el-table__fixed td.el-table__cell),
:deep(.el-table__fixed th.el-table__cell) {
  background: var(--tp-surface-card);
}

:deep(.el-table__fixed) {
  box-shadow: 10px 0 18px -18px color-mix(in srgb, var(--tp-text-primary) 24%, transparent);
}

:deep(.el-table-column--selection .cell) {
  display: flex;
  justify-content: center;
}

:deep(.el-checkbox__input.is-checked .el-checkbox__inner),
:deep(.el-checkbox__input.is-indeterminate .el-checkbox__inner) {
  background-color: var(--tp-primary);
  border-color: var(--tp-primary);
}

:deep(.el-table__row:hover .task-name-text) {
  color: var(--tp-text-primary);
}

/* ── 任务名文字 ───────────────────────────────────────────── */
.task-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-name-text {
  color: var(--tp-text-primary);
  font-size: var(--tp-text-sm);
  font-weight: var(--tp-font-semibold);
  line-height: var(--tp-line-ui);
  transition: color 0.18s ease;
}

.task-id-text {
  color: var(--tp-text-muted);
  font-family: var(--tp-font-family-mono);
  font-size: 0.6rem;
  line-height: var(--tp-line-ui);
}

/* ── 等宽数字/日期 ────────────────────────────────────────── */
.mono-text {
  font-family: var(--tp-font-family-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--tp-text-xs);
  letter-spacing: 0;
}

.model-text {
  color: var(--tp-text-secondary);
  font-size: 11px;
  font-weight: var(--tp-font-medium);
}

.dim-text {
  color: var(--tp-text-subtle);
}

/* ── 统计数字（生成/采纳/丢弃） ──────────────────────────── */
.stat-text {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--tp-font-family-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--tp-text-xs);
  line-height: var(--tp-line-ui);
}

.stat-gen {
  color: var(--tp-text-secondary);
}
.stat-adopt {
  color: var(--tp-success);
}
.stat-discard {
  color: var(--tp-text-subtle);
}
.stat-sep {
  color: color-mix(in srgb, var(--tp-text-subtle) 48%, transparent);
}

/* ── 操作按钮 ────────────────────────────────────────────── */
.row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
  opacity: 0.65;
  transition: opacity var(--tp-transition);
}

:deep(.el-table__row:hover) .row-actions {
  opacity: 1;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 7px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--tp-text-muted);
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
}

.action-btn .material-symbols-outlined {
  font-size: 15px;
  line-height: 1;
}

.action-btn:hover {
  background: var(--tp-accent-primary-soft);
  border-color: var(--tp-accent-primary-border);
  color: var(--tp-primary);
}

.action-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--tp-primary) 46%, transparent);
  outline-offset: 2px;
}

.action-btn--danger {
  color: var(--tp-text-muted);
}

.action-btn--danger:hover {
  background: var(--tp-accent-danger-soft);
  border-color: var(--tp-accent-danger-border);
  color: var(--tp-danger);
}

/* ── 分页 ────────────────────────────────────────────────── */
:deep(.el-pagination) {
  --el-pagination-bg-color: transparent;
  --el-pagination-text-color: var(--tp-text-subtle);
  --el-pagination-hover-color: var(--tp-primary);
  --el-pagination-button-bg-color: transparent;
  --el-pagination-button-disabled-bg-color: transparent;
  gap: 4px;
}

:deep(.el-pagination button),
:deep(.el-pagination .el-pager li) {
  min-width: 28px;
  height: 28px;
  margin: 0;
  border: 0;
  border-radius: var(--tp-radius-sm);
  background: transparent;
  color: var(--tp-text-muted);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-medium);
  transition:
    background 0.18s ease,
    color 0.18s ease;
}

:deep(.el-pagination button:hover),
:deep(.el-pagination .el-pager li:hover) {
  background: var(--tp-surface-hover);
  color: var(--tp-primary);
}

:deep(.el-pagination .el-pager li.is-active) {
  background: var(--tp-btn-bg);
  color: var(--tp-btn-text);
  font-weight: var(--tp-font-bold);
  box-shadow: var(--tp-btn-shadow);
}

/* ── 对话框内按钮 ─────────────────────────────────────────── */
:global(.task-detail-dialog .el-button--primary) {
  background: var(--tp-btn-bg);
  color: var(--tp-btn-text, #ffffff);
  border: 1px solid var(--tp-btn-border, transparent);
  box-shadow: none;
  transition: all 0.2s ease;
}

:global(.task-detail-dialog .el-button--primary:hover) {
  background: var(--tp-btn-bg-hover);
  border-color: var(--tp-primary-light);
}

:global(.task-detail-dialog .el-button:not(.el-button--primary)) {
  background: var(--tp-surface-input, #f3f4f6);
  color: var(--tp-text-secondary, #4b5563);
  border: 1px solid var(--tp-border-subtle, #e5e7eb);
  transition: all 0.2s ease;
}

:global(.task-detail-dialog .el-button:not(.el-button--primary):hover) {
  background: var(--tp-surface-hover, #e5e7eb);
  color: var(--tp-text-primary, #111827);
  border-color: var(--tp-border-strong, #d1d5db);
}

:global(.task-detail-dialog .el-button:focus-visible) {
  outline: 2px solid color-mix(in srgb, var(--tp-primary) 42%, transparent);
  outline-offset: 2px;
}

@media (max-width: 980px) {
  :global(.task-detail-dialog.el-dialog) {
    width: calc(100vw - 24px) !important;
  }

  .task-detail-summary {
    grid-template-columns: 1fr;
  }

  .task-summary-stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .result-header,
  .result-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .result-badges,
  .result-action-buttons {
    justify-content: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pill-running .status-dot {
    animation: none;
  }

  .action-btn,
  .task-name-text,
  :deep(.el-table td.el-table__cell) {
    transition: none;
  }
}
</style>
