<script setup lang="ts">
/**
 * ReviewListTable — 评审计划列表表格
 *
 * 职责：按设计稿渲染评审任务表格（名称 / 创建人 / 进度 / 状态 / 操作列），
 * 行点击与操作按钮以 emit 向父组件暴露意图，保持组件纯展示。
 *
 * 设计约束：
 *   - 所有颜色走 --tp-* 设计 Token，无硬编码
 *   - 三态闭环由父组件负责（loading / empty / data），本组件仅处理 data 态
 *   - 行操作按钮点击 stop propagation，避免触发整行跳转
 */
import { computed } from 'vue'
import { apiClient } from '../api/client'
import type { CaseReview } from '../api/caseReview'

interface Props {
  /** 评审计划数据列表 */
  reviews: CaseReview[]
  /** 加载中（遮罩层） */
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), { loading: false })

/** 行级操作事件：父组件决定跳路由 / 弹确认框 / 调 API */
const emit = defineEmits<{
  (e: 'view', review: CaseReview): void
  (e: 'copy', review: CaseReview): void
  (e: 'close', review: CaseReview): void
  (e: 'delete', review: CaseReview): void
}>()

/** 服务端静态资源根（去除 /api/v1 后缀），用于拼接头像 URL */
const serverBase = computed(() => {
  const base = apiClient.defaults.baseURL || '/api/v1'
  return base.replace(/\/api\/v1\/?$/, '')
})

/** 从姓名抽取两位首字母作为头像占位（无头像图片时使用） */
function getInitials(name: string): string {
  if (!name) return '?'
  return name.slice(0, 2).toUpperCase()
}

/** 将后端返回的头像路径拼成完整 URL（相对路径加 serverBase 前缀） */
function getAvatarUrl(avatar?: string): string {
  const raw = (avatar || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  const normalized = raw.startsWith('/') ? raw : `/${raw}`
  return `${serverBase.value}${normalized}`
}

/** 计算评审进度百分比：已处理条数 / 总条数，空数据时返回 0 */
function getProgressPercent(review: CaseReview): number {
  if (review.case_total_count <= 0) return 0
  const done = getReviewedCount(review)
  return Math.round((done / review.case_total_count) * 100)
}

function getReviewedCount(review: CaseReview): number {
  return review.approved_count + review.rejected_count + review.needs_update_count
}

function getProgressPendingCount(review: CaseReview): number {
  return Math.max(review.case_total_count - getReviewedCount(review), 0)
}

function progressBarClass(review: CaseReview): string {
  if (review.rejected_count > 0) return 'bar-danger'
  if (review.needs_update_count > 0) return 'bar-warning'
  if (getProgressPercent(review) >= 100 && review.case_total_count > 0) return 'bar-complete'
  return ''
}

function progressResultClass(review: CaseReview): string {
  if (review.rejected_count > 0) return 'result-danger'
  if (review.needs_update_count > 0) return 'result-warning'
  if (getProgressPercent(review) >= 100 && review.case_total_count > 0) return 'result-success'
  return 'result-muted'
}

function progressResultLabel(review: CaseReview): string {
  if (review.case_total_count <= 0) return '暂无用例'
  if (review.rejected_count > 0) return `${review.rejected_count} 条未通过`
  if (review.needs_update_count > 0) return `${review.needs_update_count} 条需修改`
  if (getProgressPercent(review) >= 100) return '全部通过'
  return `${getProgressPendingCount(review)} 条待评审`
}

/** 状态 → 中文文案 */
function statusLabel(status: string): string {
  const map: Record<string, string> = {
    not_started: '未开始',
    in_progress: '进行中',
    completed: '已完成',
    closed: '已关闭',
  }
  return map[status] || status
}

/** 状态 → CSS badge 修饰类 */
function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    not_started: 'badge-secondary',
    in_progress: 'badge-primary',
    completed: 'badge-success',
    closed: 'badge-muted',
  }
  return map[status] || 'badge-secondary'
}

function reviewStatusBadgeClass(review: CaseReview): string {
  if (review.status === 'completed' && review.rejected_count > 0) return 'badge-danger'
  if (review.status === 'completed' && review.needs_update_count > 0) return 'badge-warning'
  return statusBadgeClass(review.status)
}

function reviewStatusLabel(review: CaseReview): string {
  if (review.status === 'completed' && review.rejected_count > 0) return '已完成·有驳回'
  if (review.status === 'completed' && review.needs_update_count > 0) return '已完成·需修改'
  if (review.status === 'completed' && review.case_total_count > 0) return '已完成·通过'
  return statusLabel(review.status)
}

/** 评审模式 → 中文文案 */
function modeLabel(mode: string): string {
  return mode === 'parallel' ? '会签' : '独审'
}

/** 评审人姓名摘要：最多显示前 2 个，超出用 +N 表示 */
function reviewerSummary(review: CaseReview): string {
  const names = review.reviewer_names || []
  if (names.length === 0) return '—'
  if (names.length <= 2) return names.join('、')
  return `${names.slice(0, 2).join('、')} +${names.length - 2}`
}
</script>

<template>
  <div class="table-scroll-area">
    <div v-if="props.loading" class="loading-overlay">
      <span class="material-symbols-outlined spin-icon">progress_activity</span>
    </div>
    <table class="pipeline-table">
      <thead>
        <tr>
          <th>评审任务名称</th>
          <th>创建人 / 评审人</th>
          <th>评审进度</th>
          <th>状态</th>
          <th class="th-right">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="review in props.reviews"
          :key="review.id"
          class="pipeline-row"
          @click="emit('view', review)"
        >
          <td>
            <div class="review-name-cell">
              <span class="review-name" :title="review.name">{{ review.name }}</span>
              <span class="review-id-sub">
                ID: #{{ review.id }} · {{ modeLabel(review.review_mode) }}
              </span>
            </div>
          </td>
          <td>
            <div class="person-cell">
              <img
                v-if="review.created_by_avatar"
                class="avatar-circle-img"
                :src="getAvatarUrl(review.created_by_avatar)"
                :alt="review.created_by_name || '创建人头像'"
              />
              <div v-else class="avatar-circle">
                {{ getInitials(review.created_by_name || '') }}
              </div>
              <div class="person-meta">
                <span class="person-name">{{ review.created_by_name || '—' }}</span>
                <span class="reviewer-sub" :title="review.reviewer_names?.join('、')">
                  评审：{{ reviewerSummary(review) }}
                </span>
              </div>
            </div>
          </td>
          <td>
            <div class="progress-cell-pl">
              <div class="progress-top-row">
                <span class="progress-pct">{{ getProgressPercent(review) }}%</span>
                <span class="progress-count">
                  {{ getReviewedCount(review) }}
                  / {{ review.case_total_count }} 条
                </span>
              </div>
              <div class="progress-bar-track">
                <div
                  class="progress-bar-fill"
                  :class="progressBarClass(review)"
                  :style="{ width: getProgressPercent(review) + '%' }"
                ></div>
              </div>
              <div class="progress-result" :class="progressResultClass(review)">
                {{ progressResultLabel(review) }}
              </div>
            </div>
          </td>
          <td>
            <span class="status-badge-pl" :class="reviewStatusBadgeClass(review)">
              {{ reviewStatusLabel(review) }}
            </span>
          </td>
          <td class="td-right">
            <div class="row-actions" @click.stop>
              <button
                class="action-btn action-edit icon-only"
                title="查看详情"
                @click="emit('view', review)"
              >
                <span class="material-symbols-outlined">visibility</span>
              </button>
              <button
                class="action-btn action-clone icon-only"
                title="复制"
                @click="emit('copy', review)"
              >
                <span class="material-symbols-outlined">content_copy</span>
              </button>
              <button
                v-if="review.status !== 'closed'"
                class="action-btn icon-only"
                title="关闭"
                @click="emit('close', review)"
              >
                <span class="material-symbols-outlined">block</span>
              </button>
              <button
                class="action-btn action-delete icon-only"
                title="删除"
                @click="emit('delete', review)"
              >
                <span class="material-symbols-outlined">delete</span>
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-scroll-area {
  position: relative;
  flex: 1;
}
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(17, 19, 30, 0.6);
  z-index: 10;
}
.spin-icon {
  font-size: 32px;
  color: var(--tp-primary, #d2bbff);
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.pipeline-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
.pipeline-table thead tr {
  background: rgba(25, 27, 38, 0.5);
}
.pipeline-table th {
  padding: 14px 24px;
  font-size: 11px;
  font-weight: 700;
  color: var(--tp-gray-500, #958da1);
}
.th-right {
  text-align: right !important;
}
.pipeline-table tbody tr {
  border-bottom: 1px solid rgba(74, 68, 85, 0.05);
  cursor: pointer;
  transition: background 0.15s;
}
.pipeline-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.04);
}
.pipeline-table td {
  padding: 18px 24px;
  font-size: 13px;
  color: var(--tp-gray-800, #e1e1f2);
}
.td-right {
  text-align: right;
}

.review-name-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.review-name {
  color: #fff;
  font-weight: 500;
  font-size: 14px;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.review-id-sub {
  font-size: 12px;
  color: var(--tp-gray-500, #958da1);
}

.person-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.person-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.reviewer-sub {
  font-size: 11px;
  color: var(--tp-gray-500, #958da1);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.avatar-circle {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--tp-primary, #7c3aed), var(--tp-info, #0566d9));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.avatar-circle-img {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.person-name {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.88);
  font-weight: 500;
}

.progress-cell-pl {
  width: 180px;
}
.progress-top-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
}
.progress-pct {
  font-size: 12px;
  color: var(--tp-primary-light, #d2bbff);
  font-weight: 600;
}
.progress-count {
  font-size: 12px;
  color: var(--tp-gray-500, #958da1);
}
.progress-bar-track {
  height: 5px;
  width: 100%;
  background: var(--tp-surface-base, #0c0e18);
  border-radius: 4px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  background: var(--tp-primary, #d2bbff);
  border-radius: 4px;
  transition: width 0.4s ease;
}
.progress-bar-fill.bar-complete {
  background: var(--tp-success, #34d399);
}
.progress-bar-fill.bar-warning {
  background: var(--tp-warning, #f59e0b);
}
.progress-bar-fill.bar-danger {
  background: var(--tp-danger, #f87171);
}
.progress-result {
  margin-top: 5px;
  font-size: 11px;
  font-weight: 600;
}
.progress-result.result-muted {
  color: var(--tp-gray-500, #958da1);
}
.progress-result.result-success {
  color: var(--tp-success, #34d399);
}
.progress-result.result-warning {
  color: var(--tp-warning, #f59e0b);
}
.progress-result.result-danger {
  color: var(--tp-danger, #f87171);
}

.status-badge-pl {
  display: inline-block;
  padding: 5px 12px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.badge-secondary {
  background: rgba(173, 198, 255, 0.1);
  color: var(--tp-info, #adc6ff);
  border: 1px solid rgba(173, 198, 255, 0.2);
}
.badge-primary {
  background: rgba(210, 187, 255, 0.1);
  color: var(--tp-primary-light, #d2bbff);
  border: 1px solid rgba(210, 187, 255, 0.2);
}
.badge-success {
  background: rgba(52, 211, 153, 0.08);
  color: var(--tp-success, #34d399);
  border: 1px solid rgba(52, 211, 153, 0.15);
}
.badge-warning {
  background: rgba(245, 158, 11, 0.1);
  color: var(--tp-warning, #f59e0b);
  border: 1px solid rgba(245, 158, 11, 0.18);
}
.badge-danger {
  background: rgba(248, 113, 113, 0.1);
  color: var(--tp-danger, #f87171);
  border: 1px solid rgba(248, 113, 113, 0.18);
}
.badge-muted {
  background: rgba(55, 56, 69, 0.5);
  color: var(--tp-gray-500, #958da1);
  border: 1px solid rgba(74, 68, 85, 0.2);
}

.row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
</style>
