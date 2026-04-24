<script setup lang="ts">
/**
 * ReviewAIGatePanel：评审详情页的 AI 门禁 + Action Items 面板
 *
 * 职责：
 *   - 展示当前评审项的 `ai_gate_status` 徽标与语义化描述
 *   - 提供"重跑 AI 门禁"按钮（幂等，后端已保护 resolved/disputed 缺陷不被覆盖）
 *   - 展示并操作 Action Items（缺陷）：Resolve / Dispute / Reopen
 *
 * 为什么只做"基础交互"：
 *   - 流程打通优先，UI 按设计稿后续迭代
 *   - 当前依赖 ElMessageBox 做 note/reason 输入，避免新增抽屉/弹窗
 */
import { computed, onBeforeUnmount, watch } from 'vue'

import { ElButton, ElMessageBox, ElTag } from 'element-plus'

import {
  AI_GATE_STATUS,
  DEFECT_STATUS,
  type CaseReviewDefect,
  type ReviewSeverity,
} from '@/api/caseReviewV02'
import { useReviewDefects } from '@/composables/useReviewDefects'

/** Props：父组件控制上下文与可变数据源 */
interface Props {
  projectId: number
  reviewId: number
  itemId: number
  /** 当前评审项的 ai_gate_status（由父组件 listReviewItems 拉回） */
  aiGateStatus?: string
  /** 当前登录用户是否具备 Moderator 权限（简化版：直接复用 admin / manager 标识） */
  canModerate?: boolean
  /** 当前登录用户是否是 author（决定能否 Resolve/Dispute） */
  canAuthorAct?: boolean
  /** readOnly=true 时隐藏"重跑"按钮，仅展示状态 + Action Items（用于"AI 评审由计划级触发"的场景） */
  readOnly?: boolean
  /**
   * embedded=true 时不画外层 card 装饰（background / border / padding），用于嵌入到父面板中，
   * 避免出现双层 card 叠套的视觉冗余。
   */
  embedded?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  aiGateStatus: AI_GATE_STATUS.NotStarted,
  canModerate: true,
  canAuthorAct: true,
  readOnly: false,
  embedded: false,
})

/** 对外事件：父组件收到后可以刷新 item 列表拿到最新 ai_gate_status */
const emit = defineEmits<{
  (e: 'reran', passed: boolean): void
}>()

const {
  defects,
  loading,
  runningRerun,
  openCount,
  criticalCount,
  fetchDefects,
  rerun,
  resolve,
  dispute,
  reopen,
  cancel,
} = useReviewDefects()

/** AI 门禁徽标颜色与文案映射 */
const gateBadge = computed(() => {
  switch (props.aiGateStatus) {
    case AI_GATE_STATUS.Passed:
      return { label: 'AI 门禁通过', type: 'success' as const }
    case AI_GATE_STATUS.Failed:
      return { label: 'AI 门禁未通过', type: 'danger' as const }
    case AI_GATE_STATUS.Running:
      return { label: 'AI 门禁运行中', type: 'warning' as const }
    case AI_GATE_STATUS.Timeout:
      return { label: 'AI 门禁超时', type: 'warning' as const }
    case AI_GATE_STATUS.Bypassed:
      return { label: 'AI 门禁已放行', type: 'info' as const }
    default:
      return { label: 'AI 门禁未开始', type: 'info' as const }
  }
})

/** severity → Element 语义色 */
const severityType: Record<ReviewSeverity, 'danger' | 'warning' | 'info'> = {
  critical: 'danger',
  major: 'warning',
  minor: 'info',
}

/** defect.status → Element 语义色 */
const statusType: Record<string, 'success' | 'warning' | 'info'> = {
  open: 'warning',
  resolved: 'success',
  disputed: 'info',
}

/** 中文短语映射，保持 UI 直观 */
const severityLabel: Record<ReviewSeverity, string> = {
  critical: '严重',
  major: '主要',
  minor: '提示',
}
const statusLabel: Record<string, string> = {
  open: '待处理',
  resolved: '已处理',
  disputed: '有异议',
}
const sourceLabel: Record<string, string> = {
  primary_review: '主评人驳回',
  ai_gate: 'AI 门禁',
}

/** 跟随 itemId 变化自动重拉；AbortController 保证旧请求被取消 */
watch(
  () => [props.projectId, props.reviewId, props.itemId] as const,
  ([projectId, reviewId, itemId]) => {
    if (projectId && reviewId && itemId) fetchDefects(projectId, reviewId, itemId)
  },
  { immediate: true },
)

onBeforeUnmount(cancel)

/** 规则引擎重跑 */
async function handleRerun() {
  const report = await rerun(props.projectId, props.reviewId, props.itemId)
  if (report) emit('reran', report.passed)
}

/** Resolve：弹个简单 prompt 收备注，非必填 */
async function handleResolve(d: CaseReviewDefect) {
  try {
    const { value } = await ElMessageBox.prompt('请填写处理说明（可选）', '标记为已处理', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      inputType: 'textarea',
      inputValue: '',
    })
    const ok = await resolve(props.projectId, d.id, value ?? '')
    if (ok) await fetchDefects(props.projectId, props.reviewId, props.itemId)
  } catch {
    /* 用户取消 */
  }
}

/** Dispute：理由必填 */
async function handleDispute(d: CaseReviewDefect) {
  try {
    const { value } = await ElMessageBox.prompt('请填写异议理由', '提出异议', {
      confirmButtonText: '提交',
      cancelButtonText: '取消',
      inputType: 'textarea',
      inputValidator: (v) => (v && v.trim() ? true : '请填写异议理由'),
    })
    const ok = await dispute(props.projectId, d.id, value ?? '')
    if (ok) await fetchDefects(props.projectId, props.reviewId, props.itemId)
  } catch {
    /* 用户取消 */
  }
}

/** Reopen：Moderator 重新开缺陷（回到 open） */
async function handleReopen(d: CaseReviewDefect) {
  try {
    await ElMessageBox.confirm('确定要重新开启该 Action Item 吗？', '重开 Action Item', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
    })
    const ok = await reopen(props.projectId, d.id)
    if (ok) await fetchDefects(props.projectId, props.reviewId, props.itemId)
  } catch {
    /* 用户取消 */
  }
}
</script>

<template>
  <section class="ai-gate-panel" :class="{ 'is-embedded': embedded }">
    <!-- 顶部：徽标 + rerun 按钮 -->
    <header class="ai-gate-header">
      <div class="ai-gate-title">
        <ElTag :type="gateBadge.type" size="small">{{ gateBadge.label }}</ElTag>
        <span class="ai-gate-count">
          待处理 {{ openCount }} / 总计 {{ defects.length }}
          <span v-if="criticalCount > 0" class="critical">（含严重 {{ criticalCount }}）</span>
        </span>
      </div>
      <ElButton
        v-if="!readOnly"
        size="small"
        type="primary"
        :loading="runningRerun"
        @click="handleRerun"
      >
        重跑 AI 门禁
      </ElButton>
    </header>

    <!-- Action Items 列表 -->
    <div v-if="loading" class="ai-gate-empty">加载中…</div>
    <div v-else-if="defects.length === 0" class="ai-gate-empty">暂无 Action Items</div>
    <ul v-else class="defect-list">
      <li
        v-for="d in defects"
        :key="d.id"
        class="defect-row"
        :class="{ 'is-open': d.status === DEFECT_STATUS.Open }"
      >
        <div class="defect-head">
          <ElTag :type="severityType[d.severity]" size="small">
            {{ severityLabel[d.severity] }}
          </ElTag>
          <ElTag :type="statusType[d.status] ?? 'info'" size="small">
            {{ statusLabel[d.status] ?? d.status }}
          </ElTag>
          <span class="defect-source">{{ sourceLabel[d.source] ?? d.source }}</span>
        </div>
        <div class="defect-body">
          <p class="defect-title">{{ d.title }}</p>
          <p v-if="d.resolve_note" class="defect-note">处理说明：{{ d.resolve_note }}</p>
          <p v-if="d.dispute_reason" class="defect-note">异议理由：{{ d.dispute_reason }}</p>
        </div>
        <div class="defect-actions">
          <template v-if="d.status === DEFECT_STATUS.Open">
            <ElButton v-if="canAuthorAct" size="small" type="success" @click="handleResolve(d)">
              标记已处理
            </ElButton>
            <ElButton v-if="canAuthorAct" size="small" @click="handleDispute(d)">提异议</ElButton>
          </template>
          <template v-else>
            <ElButton v-if="canModerate" size="small" type="warning" @click="handleReopen(d)">
              重开
            </ElButton>
          </template>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
/* ── AI 门禁 Action Items 面板：对齐 "Digital Cockpit" 设计系统 ── */
.ai-gate-panel {
  background: #191b26; /* surface-container-low */
  border: 1px solid rgba(74, 68, 85, 0.15);
  border-radius: 0.75rem; /* xl */
  padding: 24px;
}
/* 内嵌到父面板时卸掉外层 card 装饰，避免双层卡片 */
.ai-gate-panel.is-embedded {
  background: transparent;
  border: none;
  padding: 0;
}
.ai-gate-panel.is-embedded .ai-gate-header {
  padding-top: 16px;
  margin-top: 4px;
  border-top: 1px solid rgba(74, 68, 85, 0.15);
}
.ai-gate-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 12px;
  flex-wrap: wrap;
}
.ai-gate-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(204, 195, 216, 0.85);
}
.ai-gate-count {
  color: rgba(204, 195, 216, 0.5);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
}
.ai-gate-count .critical {
  color: #f87171;
  font-weight: 500;
}
.ai-gate-empty {
  padding: 24px;
  text-align: center;
  color: rgba(204, 195, 216, 0.5);
  font-size: 13px;
  border: 1px dashed rgba(74, 68, 85, 0.2);
  border-radius: 0.5rem;
}
.defect-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.defect-row {
  position: relative;
  overflow: hidden;
  padding: 14px 16px;
  border-radius: 0.5rem;
  background: #1d1f2b; /* surface-container */
  border: 1px solid rgba(74, 68, 85, 0.12);
  transition:
    border-color 0.15s,
    background 0.15s;
}
.defect-row:hover {
  background: #272935;
  border-color: rgba(74, 68, 85, 0.3);
}
.defect-row.is-open::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(to bottom, rgba(239, 68, 68, 0.8), rgba(245, 158, 11, 0.5));
}
.defect-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.defect-source {
  color: rgba(204, 195, 216, 0.45);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-left: auto;
}
.defect-body {
  margin-bottom: 12px;
}
.defect-title {
  margin: 0 0 6px;
  color: #e1e1f2;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.55;
}
.defect-note {
  margin: 0 0 4px;
  padding: 6px 10px;
  color: rgba(204, 195, 216, 0.75);
  background: rgba(12, 14, 24, 0.5);
  border-left: 2px solid rgba(124, 58, 237, 0.3);
  border-radius: 3px;
  font-size: 12px;
  line-height: 1.5;
  font-family: 'JetBrains Mono', monospace;
}
.defect-actions {
  display: flex;
  gap: 8px;
}
/* Element Plus Tag 在深色下读起来略刺眼，手工回落到半透明 */
:deep(.el-tag--small) {
  border: none;
  font-weight: 600;
  letter-spacing: 0.04em;
}
:deep(.el-tag--danger) {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}
:deep(.el-tag--warning) {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}
:deep(.el-tag--success) {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}
:deep(.el-tag--info) {
  background: rgba(173, 198, 255, 0.1);
  color: #adc6ff;
}
</style>
