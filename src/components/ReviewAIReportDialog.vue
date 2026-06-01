<script setup lang="ts">
/**
 * ReviewAIReportDialog：计划级规则检查报告弹窗
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

import '@/styles/review-ai-report-dialog.css'

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
const passRateLabel = computed(() => {
  if (passRate.value >= 80) return '质量稳定'
  if (passRate.value >= 50) return '存在风险'
  return '需重点关注'
})
const passRateColor = computed(() => {
  if (passRate.value >= 80) return 'var(--tp-success)'
  if (passRate.value >= 50) return 'var(--tp-warning)'
  return 'var(--tp-danger)'
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
    width="960px"
    append-to-body
    class="ai-report-dialog"
    :before-close="close"
  >
    <template #header>
      <div class="ai-report-header">
        <div>
          <h3>规则检查报告</h3>
          <p v-if="report">
            {{ report.total_count }} 个用例 ·
            {{ report.failed_count + report.error_count }} 项需关注
          </p>
        </div>
        <span class="ai-report-status" :class="{ 'is-warning': passRate < 80 }">
          {{ passRateLabel }}
        </span>
      </div>
    </template>

    <div v-if="report" class="ai-report">
      <!-- 顶部统计 -->
      <div class="ai-report-stats">
        <div class="stat-card stat-total">
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
          <div class="stat-rate-value">{{ passRate }}%</div>
          <ElProgress
            :percentage="passRate"
            :color="passRateColor"
            :stroke-width="8"
            :show-text="false"
          />
        </div>
      </div>

      <!-- 明细表格 -->
      <ElTable
        class="ai-report-table"
        :data="report.items"
        :row-class-name="rowClass"
        max-height="420"
        size="small"
      >
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
            <span class="count-pill" :class="{ 'count-critical': row.critical_count > 0 }">
              {{ row.critical_count }}
            </span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="主要" width="72" align="center">
          <template #default="{ row }">
            <span class="count-pill" :class="{ 'count-major': row.major_count > 0 }">
              {{ row.major_count }}
            </span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="提示" width="72" align="center">
          <template #default="{ row }">
            <span class="count-pill">{{ row.minor_count }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="Action Items" width="110" align="center">
          <template #default="{ row }">
            <span class="count-pill" :class="{ 'count-action': row.defect_count > 0 }">
              {{ row.defect_count }}
            </span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="110">
          <template #default="{ row }">
            <ElButton link type="primary" size="small" @click="jump(row.item_id)">
              查看详情
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <div class="ai-report-meta">
        <span>生成时间：{{ report.run_at }}</span>
      </div>
    </div>

    <template #footer>
      <ElButton @click="close">关闭</ElButton>
    </template>
  </ElDialog>
</template>
