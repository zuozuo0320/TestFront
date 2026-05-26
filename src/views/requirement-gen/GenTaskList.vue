<script setup lang="ts">
/**
 * 生成任务列表 + 详情子组件
 */
import { computed, ref } from 'vue'
import { useGenTasks } from '@/composables/useRequirementGen'

const {
  tasks,
  total,
  loading,
  page,
  pageSize,
  currentTask,
  currentResults,
  detailLoading,
  fetchTasks,
  fetchTaskDetail,
  handleAdopt,
  handleDiscard,
  handleDeleteTask,
} = useGenTasks()

// 详情对话框
const showDetailDialog = ref(false)
const pageStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * pageSize.value + 1))
const pageEnd = computed(() => Math.min(page.value * pageSize.value, total.value))

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
</script>

<template>
  <div class="task-list-page">
    <div class="task-list-container">
      <!-- 任务列表 -->
      <div class="task-table-wrap">
        <el-table
          v-loading="loading"
          :data="tasks"
          row-key="id"
          style="width: 100%"
          @row-click="handleRowClick"
        >
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
                  @click.stop="handleDeleteTask(row.id, row.task_name)"
                >
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>
            </template>
          </el-table-column>
          <template #empty>
            <div class="table-empty">暂无任务记录</div>
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

      <!-- 产出用例对话框 -->
      <el-dialog v-model="showDetailDialog" title="产出用例" width="900px" top="5vh">
        <div v-loading="detailLoading">
          <!-- 任务信息 -->
          <div v-if="currentTask" class="task-meta">
            <el-descriptions :column="3" border size="small">
              <el-descriptions-item label="任务名称">
                {{ currentTask.task_name }}
              </el-descriptions-item>
              <el-descriptions-item label="状态">
                <span class="status-pill" :class="statusClass(currentTask.status)">
                  <i class="status-dot" />
                  {{ statusLabel(currentTask.status) }}
                </span>
              </el-descriptions-item>
              <el-descriptions-item label="模型">
                {{ currentTask.ai_model_snapshot }}
              </el-descriptions-item>
              <el-descriptions-item label="生成数">
                {{ currentTask.generated_count }}
              </el-descriptions-item>
              <el-descriptions-item label="已采纳">
                {{ currentTask.adopted_count }}
              </el-descriptions-item>
              <el-descriptions-item label="已丢弃">
                {{ currentTask.discarded_count }}
              </el-descriptions-item>
              <el-descriptions-item v-if="currentTask.fail_reason" label="失败原因" :span="3">
                <span class="fail-reason">{{ currentTask.fail_reason }}</span>
              </el-descriptions-item>
            </el-descriptions>
          </div>

          <!-- 用例列表 -->
          <div v-if="currentResults.length > 0" class="results-section">
            <h4 class="section-title">用例列表（{{ currentResults.length }} 条）</h4>
            <div class="result-cards">
              <div
                v-for="result in currentResults"
                :key="result.id"
                class="result-card"
                :class="{ adopted: result.adopted, discarded: result.discarded }"
              >
                <div class="result-header">
                  <span class="result-seq">#{{ result.seq_no }}</span>
                  <span class="result-title">{{ result.title }}</span>
                  <el-tag size="small" class="result-level">{{ result.level }}</el-tag>
                  <span v-if="result.adopted" class="result-badge adopted">已采纳</span>
                  <span v-if="result.discarded" class="result-badge discarded">已丢弃</span>
                </div>
                <div v-if="result.precondition" class="result-field">
                  <span class="field-label">前置条件：</span>
                  {{ result.precondition }}
                </div>
                <div v-if="parseSteps(result.steps).length" class="result-field">
                  <span class="field-label">测试步骤：</span>
                  <ol class="steps-list">
                    <li v-for="(step, idx) in parseSteps(result.steps)" :key="idx">
                      <span>{{ step.action }}</span>
                      <span v-if="step.expected" class="step-expected">→ {{ step.expected }}</span>
                    </li>
                  </ol>
                </div>
                <div v-if="!result.adopted && !result.discarded" class="result-actions">
                  <el-button type="primary" size="small" @click="handleAdopt(result.id)">
                    采纳
                  </el-button>
                  <el-button size="small" @click="handleDiscard(result.id)">丢弃</el-button>
                </div>
              </div>
            </div>
          </div>

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
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 0 0;
  box-sizing: border-box;
}

.task-list-container {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.task-table-wrap {
  overflow: hidden;
  background: var(--tp-surface-card);
  border: 1px solid color-mix(in srgb, var(--tp-border-subtle) 86%, transparent);
  border-radius: var(--tp-radius-lg);
  box-shadow: 0 10px 24px -22px color-mix(in srgb, var(--tp-text-primary) 32%, transparent);
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
  padding: 42px 0;
  color: var(--tp-text-subtle);
  font-size: 12px;
  letter-spacing: 0.2px;
}

.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.task-meta {
  margin-bottom: 20px;
}

.results-section {
  margin-top: 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px;
}

.result-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 60vh;
  overflow-y: auto;
}

.result-card {
  border: 1px solid var(--tp-border-subtle);
  background-color: var(--tp-surface-muted, #f9fafb);
  border-radius: var(--tp-radius-sm, 6px);
  padding: 12px 16px;
  transition: all 0.25s ease;
}

.result-card:hover {
  border-color: var(--tp-primary-light);
  box-shadow: var(--tp-shadow-sm);
}

.result-card.adopted {
  border-color: var(--tp-success);
  background: var(--tp-accent-success-soft, var(--el-color-success-light-9));
}

.result-card.discarded {
  border-color: var(--tp-border-subtle);
  background-color: transparent;
  opacity: 0.5;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.result-seq {
  font-size: 12px;
  color: var(--tp-text-muted, var(--el-text-color-secondary));
  font-weight: 500;
}

.result-title {
  font-weight: 600;
  color: var(--tp-text-primary, var(--el-text-color-primary));
  flex: 1;
}

.result-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
}

.result-badge.adopted {
  background: var(--tp-accent-success-soft);
  color: var(--tp-success);
}

.result-badge.discarded {
  background: var(--tp-surface-input);
  color: var(--tp-text-muted);
}

.result-field {
  font-size: 13px;
  color: var(--tp-text-secondary, var(--el-text-color-regular));
  margin-bottom: 6px;
}

.field-label {
  font-weight: 500;
  color: var(--tp-text-primary, var(--el-text-color-primary));
}

.steps-list {
  margin: 4px 0 0 16px;
  padding: 0;
}

.steps-list li {
  margin-bottom: 2px;
}

.step-expected {
  color: var(--tp-success, var(--el-color-success));
  font-weight: 500;
}

.result-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}

.fail-reason {
  color: var(--el-color-danger);
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

:deep(.el-table__fixed-right td.el-table__cell),
:deep(.el-table__fixed-right th.el-table__cell) {
  background: var(--tp-surface-card);
}

:deep(.el-table__fixed-right) {
  box-shadow: -10px 0 18px -18px color-mix(in srgb, var(--tp-text-primary) 24%, transparent);
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
:deep(.el-button--primary) {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border: none;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
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
