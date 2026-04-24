<script setup lang="ts">
/**
 * ReviewAIReportDialog：计划级 AI 评审报告弹窗
 *
 * 职责：
 *   - 承载 run-all 之后返回的聚合报告展示
 *   - 点击每条记录可快速跳到该评审项（触发父组件 switchItem）
 *
 * 为什么是 Dialog 而非独立路由：
 *   - Phase 1 保持路由最小改动；报告是一次性查看场景，关闭后不持久化
 */
import { computed } from 'vue'

import { ElDialog, ElTable, ElTableColumn, ElTag, ElButton, ElProgress } from 'element-plus'

import type { PlanRunReport, PlanItemSummary, AIGateStatus } from '@/api/caseReviewV02'

interface Props {
  modelValue: boolean
  report: PlanRunReport | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'jump', itemId: number): void
}>()

function close() {
  emit('update:modelValue', false)
}
function jump(itemId: number) {
  emit('jump', itemId)
  close()
}

const passRate = computed(() => {
  const r = props.report
  if (!r || r.total_count === 0) return 0
  return Math.round((r.passed_count / r.total_count) * 100)
})

const gateLabel: Record<AIGateStatus, string> = {
  not_started: '未开始',
  running: '运行中',
  passed: '通过',
  failed: '未通过',
  timeout: '超时',
  bypassed: '已放行',
}
const gateTagType: Record<AIGateStatus, 'success' | 'danger' | 'warning' | 'info'> = {
  not_started: 'info',
  running: 'warning',
  passed: 'success',
  failed: 'danger',
  timeout: 'warning',
  bypassed: 'info',
}

function rowClass({ row }: { row: PlanItemSummary }) {
  return row.passed ? '' : 'row-failed'
}
</script>

<template>
  <ElDialog
    :model-value="modelValue"
    title="AI 评审报告"
    width="960px"
    append-to-body
    :before-close="close"
  >
    <div v-if="report" class="ai-report">
      <!-- 顶部统计 -->
      <div class="ai-report-stats">
        <div class="stat-card">
          <div class="stat-label">用例总数</div>
          <div class="stat-value">{{ report.total_count }}</div>
        </div>
        <div class="stat-card stat-pass">
          <div class="stat-label">通过</div>
          <div class="stat-value">{{ report.passed_count }}</div>
        </div>
        <div class="stat-card stat-fail">
          <div class="stat-label">未通过</div>
          <div class="stat-value">{{ report.failed_count }}</div>
        </div>
        <div v-if="report.error_count > 0" class="stat-card stat-error">
          <div class="stat-label">执行异常</div>
          <div class="stat-value">{{ report.error_count }}</div>
        </div>
        <div class="stat-card stat-rate">
          <div class="stat-label">通过率</div>
          <ElProgress
            :percentage="passRate"
            :color="passRate >= 80 ? '#10b981' : passRate >= 50 ? '#f59e0b' : '#ef4444'"
            :stroke-width="10"
          />
        </div>
      </div>

      <!-- 明细表格 -->
      <ElTable :data="report.items" :row-class-name="rowClass" max-height="480" size="small">
        <ElTableColumn prop="item_id" label="评审项" width="90" />
        <ElTableColumn prop="title_snapshot" label="用例" min-width="260" show-overflow-tooltip />
        <ElTableColumn label="门禁状态" width="110">
          <template #default="{ row }">
            <ElTag :type="gateTagType[row.ai_gate_status as AIGateStatus] ?? 'info'" size="small">
              {{ gateLabel[row.ai_gate_status as AIGateStatus] ?? row.ai_gate_status }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="严重" width="72" align="center">
          <template #default="{ row }">
            <span :class="{ 'count-critical': row.critical_count > 0 }">
              {{ row.critical_count }}
            </span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="主要" width="72" align="center">
          <template #default="{ row }">
            <span :class="{ 'count-major': row.major_count > 0 }">{{ row.major_count }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="提示" width="72" align="center" prop="minor_count" />
        <ElTableColumn label="Action Items" width="110" align="center" prop="defect_count" />
        <ElTableColumn label="操作" width="110">
          <template #default="{ row }">
            <ElButton link type="primary" size="small" @click="jump(row.item_id)">
              查看详情
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <p class="ai-report-meta">生成时间：{{ report.run_at }}</p>
    </div>

    <template #footer>
      <ElButton @click="close">关闭</ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.ai-report {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.ai-report-stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}
.stat-card {
  padding: 12px 16px;
  border-radius: 8px;
  background: #f5f5f7;
  border: 1px solid #e5e5ea;
}
.stat-card.stat-pass {
  background: #ecfdf5;
  border-color: #a7f3d0;
}
.stat-card.stat-fail {
  background: #fef2f2;
  border-color: #fecaca;
}
.stat-card.stat-error {
  background: #fff7ed;
  border-color: #fed7aa;
}
.stat-card.stat-rate {
  grid-column: span 1;
}
.stat-label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}
.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #111827;
}
.count-critical {
  color: #ef4444;
  font-weight: 600;
}
.count-major {
  color: #f59e0b;
  font-weight: 600;
}
:deep(.row-failed) {
  background: rgba(248, 113, 113, 0.04);
}
.ai-report-meta {
  margin: 0;
  text-align: right;
  color: #9ca3af;
  font-size: 12px;
}
</style>
