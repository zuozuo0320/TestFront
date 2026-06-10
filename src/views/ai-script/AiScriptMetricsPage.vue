<script setup lang="ts">
/**
 * 编排指标看板页（18.3）。
 *
 * 展示复用命中率、采纳率、一次验证通过率与人工干预步骤数，对照阶段目标。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import { extractErrorMessage } from '@/utils/error'
import { fetchOrchestrationMetrics, type OrchestrationMetrics } from '@/api/aiRegression'

const projectStore = useProjectStore()
const projectId = computed(() => projectStore.selectedProjectId)
const hasProject = computed(() => Boolean(projectId.value))

const metrics = ref<OrchestrationMetrics | null>(null)
const loading = ref(false)
const days = ref(30)

const dayOptions = [7, 14, 30, 90]

async function fetchMetrics() {
  if (!projectId.value) {
    metrics.value = null
    return
  }
  loading.value = true
  try {
    metrics.value = await fetchOrchestrationMetrics(projectId.value, days.value)
  } catch (error: unknown) {
    ElMessage.error(extractErrorMessage(error, '加载编排指标失败'))
  } finally {
    loading.value = false
  }
}

interface RateCard {
  key: string
  label: string
  description: string
  value: number | null
  target: number
}

const rateCards = computed<RateCard[]>(() => {
  const m = metrics.value
  if (!m) return []
  return [
    {
      key: 'reuse',
      label: '复用命中率',
      description: 'AI 计划步骤中引用固定场景的占比',
      value: m.reuseHitRate,
      target: m.reuseHitTarget,
    },
    {
      key: 'adoption',
      label: '采纳率',
      description: '生成的 AI 计划被采纳生成编排的占比',
      value: m.adoptionRate,
      target: m.adoptionTarget,
    },
    {
      key: 'firstPass',
      label: '一次验证通过率',
      description: '由计划生成的编排首次验证即通过的占比',
      value: m.firstPassRate,
      target: m.firstPassTarget,
    },
  ]
})

function formatRate(value: number | null) {
  if (value === null || value === undefined) return '-'
  return `${(value * 100).toFixed(1)}%`
}

function rateStatus(card: RateCard): 'success' | 'warning' | 'exception' {
  if (card.value === null) return 'warning'
  return card.value >= card.target ? 'success' : 'exception'
}

function ratePercent(value: number | null) {
  if (value === null || value === undefined) return 0
  return Math.min(100, Math.round(value * 100))
}

watch(projectId, fetchMetrics)
watch(days, fetchMetrics)

onMounted(fetchMetrics)
</script>

<template>
  <div class="metrics-page">
    <section class="metrics-header">
      <div class="metrics-title">
        <span class="metrics-eyebrow">测试智编资产</span>
        <h1>编排指标看板</h1>
        <p>复用命中率、采纳率、一次验证通过率与人工干预步骤数，对照 18.3 阶段目标。</p>
      </div>
      <div class="metrics-actions">
        <el-select v-model="days" style="width: 130px">
          <el-option
            v-for="option in dayOptions"
            :key="option"
            :label="`近 ${option} 天`"
            :value="option"
          />
        </el-select>
        <el-button :disabled="loading || !hasProject" @click="fetchMetrics">
          <span class="material-symbols-outlined">refresh</span>
          刷新
        </el-button>
      </div>
    </section>

    <section v-if="!hasProject" class="metrics-state-panel">
      <span class="material-symbols-outlined">monitoring</span>
      <h2>请选择项目</h2>
      <p>编排指标按项目统计，选择项目后查看 AI 编排效果与回归健康度。</p>
    </section>

    <template v-else>
      <section v-loading="loading" class="metrics-rate-grid">
        <article v-for="card in rateCards" :key="card.key" class="metrics-rate-card">
          <header>
            <h2>{{ card.label }}</h2>
            <el-tag
              size="small"
              effect="light"
              :type="rateStatus(card) === 'success' ? 'success' : 'warning'"
            >
              目标 ≥ {{ Math.round(card.target * 100) }}%
            </el-tag>
          </header>
          <strong class="metrics-rate-value">{{ formatRate(card.value) }}</strong>
          <el-progress
            :percentage="ratePercent(card.value)"
            :status="rateStatus(card)"
            :show-text="false"
          />
          <p>{{ card.description }}</p>
        </article>
        <article v-if="metrics" class="metrics-rate-card">
          <header>
            <h2>人工干预步骤数</h2>
            <el-tag size="small" effect="light" type="info">均值</el-tag>
          </header>
          <strong class="metrics-rate-value">
            {{
              metrics.avgManualConfirmSteps === null
                ? '-'
                : metrics.avgManualConfirmSteps.toFixed(1)
            }}
          </strong>
          <p>采纳计划时人工确认低置信度步骤的平均数量，越低代表 AI 计划越可靠。</p>
        </article>
      </section>

      <section v-if="metrics" v-loading="loading" class="metrics-count-panel">
        <h2>统计明细</h2>
        <div class="metrics-count-grid">
          <div class="metrics-count-item">
            <span>AI 计划数</span>
            <strong>{{ metrics.planCount }}</strong>
          </div>
          <div class="metrics-count-item">
            <span>计划总步骤</span>
            <strong>{{ metrics.totalSteps }}</strong>
          </div>
          <div class="metrics-count-item">
            <span>固定场景步骤</span>
            <strong>{{ metrics.flowCallSteps }}</strong>
          </div>
          <div class="metrics-count-item">
            <span>已采纳计划</span>
            <strong>{{ metrics.adoptedPlanCount }}</strong>
          </div>
          <div class="metrics-count-item">
            <span>采纳步骤</span>
            <strong>{{ metrics.adoptedSteps }}</strong>
          </div>
          <div class="metrics-count-item">
            <span>修改步骤</span>
            <strong>{{ metrics.modifiedSteps }}</strong>
          </div>
          <div class="metrics-count-item">
            <span>已首次验证</span>
            <strong>{{ metrics.firstValidated }}</strong>
          </div>
          <div class="metrics-count-item">
            <span>一次验证通过</span>
            <strong>{{ metrics.firstPassed }}</strong>
          </div>
          <div class="metrics-count-item">
            <span>回归执行</span>
            <strong>{{ metrics.regressionTotal }}</strong>
          </div>
          <div class="metrics-count-item">
            <span>回归通过</span>
            <strong class="success">{{ metrics.regressionPassed }}</strong>
          </div>
          <div class="metrics-count-item">
            <span>回归失败</span>
            <strong class="danger">{{ metrics.regressionFailed }}</strong>
          </div>
          <div class="metrics-count-item">
            <span>待确认修复建议</span>
            <strong class="warning">{{ metrics.pendingSuggestions }}</strong>
          </div>
          <div class="metrics-count-item">
            <span>已采纳修复建议</span>
            <strong>{{ metrics.adoptedSuggestions }}</strong>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.metrics-page {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: var(--tp-space-4);
  box-sizing: border-box;
}

.metrics-header,
.metrics-state-panel,
.metrics-count-panel {
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-lg);
  background: var(--tp-surface-card);
  box-shadow: var(--tp-shadow-sm);
}

.metrics-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--tp-space-4);
  padding: var(--tp-space-5) var(--tp-space-6);
}

.metrics-title {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--tp-space-1);
}

.metrics-eyebrow {
  color: var(--tp-primary);
  font-size: 12px;
  font-weight: 700;
}

.metrics-title h1 {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}

.metrics-title p {
  margin: 0;
  color: var(--tp-text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.metrics-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--tp-space-2);
}

.metrics-actions .material-symbols-outlined {
  font-size: 18px;
}

.metrics-rate-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--tp-space-4);
}

.metrics-rate-card {
  display: flex;
  flex-direction: column;
  gap: var(--tp-space-3);
  padding: var(--tp-space-5);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-lg);
  background: var(--tp-surface-card);
  box-shadow: var(--tp-shadow-sm);
}

.metrics-rate-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--tp-space-2);
}

.metrics-rate-card h2 {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 14px;
  font-weight: 700;
}

.metrics-rate-value {
  color: var(--tp-text-primary);
  font-size: 32px;
  font-weight: 700;
  line-height: 1.1;
}

.metrics-rate-card p {
  margin: 0;
  color: var(--tp-text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.metrics-count-panel {
  display: flex;
  flex-direction: column;
  gap: var(--tp-space-4);
  padding: var(--tp-space-5) var(--tp-space-6);
}

.metrics-count-panel h2 {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 16px;
  font-weight: 700;
}

.metrics-count-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--tp-space-3);
}

.metrics-count-item {
  display: flex;
  flex-direction: column;
  gap: var(--tp-space-1);
  padding: var(--tp-space-3);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  background: var(--tp-surface-muted);
}

.metrics-count-item span {
  color: var(--tp-text-muted);
  font-size: 12px;
}

.metrics-count-item strong {
  color: var(--tp-text-primary);
  font-size: 20px;
  font-weight: 700;
}

.metrics-count-item strong.success {
  color: var(--tp-success, #67c23a);
}

.metrics-count-item strong.danger {
  color: var(--tp-danger, #f56c6c);
}

.metrics-count-item strong.warning {
  color: var(--tp-warning, #e6a23c);
}

.metrics-state-panel {
  display: flex;
  min-height: 420px;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--tp-space-2);
  padding: var(--tp-space-8);
  text-align: center;
}

.metrics-state-panel .material-symbols-outlined {
  color: var(--tp-primary);
  font-size: 44px;
}

.metrics-state-panel h2 {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 20px;
}

.metrics-state-panel p {
  max-width: 420px;
  margin: 0;
  color: var(--tp-text-muted);
  font-size: 14px;
  line-height: 1.7;
}

@media (max-width: 980px) {
  .metrics-header {
    flex-direction: column;
  }

  .metrics-actions {
    justify-content: flex-start;
  }
}
</style>
