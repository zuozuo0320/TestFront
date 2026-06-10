<script setup lang="ts">
/**
 * 定时回归页（18.3）。
 *
 * 管理已发布编排的定时回归计划，并查看回归执行记录。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import { extractErrorMessage, isElMessageBoxCancel } from '@/utils/error'
import { formatBeijingDateTime } from '@/utils/time'
import {
  ScenarioCompositionStatus,
  fetchScenarioCompositionList,
  type AiScenarioComposition,
} from '@/api/aiScript'
import {
  RegressionExecutionStatusColor,
  RegressionExecutionStatusLabel,
  RegressionTriggerTypeLabel,
  createRegressionPlan,
  deleteRegressionPlan,
  fetchRegressionExecutions,
  fetchRegressionPlans,
  triggerRegressionPlan,
  updateRegressionPlan,
  type RegressionExecution,
  type RegressionExecutionStatus,
  type RegressionPlan,
  type RegressionTriggerType,
} from '@/api/aiRegression'

const projectStore = useProjectStore()
const projectId = computed(() => projectStore.selectedProjectId)
const hasProject = computed(() => Boolean(projectId.value))

const activeTab = ref<'plans' | 'executions'>('plans')

// ── 回归计划 ──

const plans = ref<RegressionPlan[]>([])
const plansLoading = ref(false)
const planSubmitting = ref(false)
const planDialogVisible = ref(false)
const editingPlan = ref<RegressionPlan | null>(null)
const publishedCompositions = ref<AiScenarioComposition[]>([])
const compositionsLoading = ref(false)
const triggeringPlanId = ref<number | null>(null)

const planForm = reactive({
  compositionId: undefined as number | undefined,
  name: '',
  intervalMinutes: 60,
  enabled: true,
})

async function fetchPlans() {
  if (!projectId.value) {
    plans.value = []
    return
  }
  plansLoading.value = true
  try {
    plans.value = await fetchRegressionPlans(projectId.value)
  } catch (error: unknown) {
    ElMessage.error(extractErrorMessage(error, '加载回归计划失败'))
  } finally {
    plansLoading.value = false
  }
}

async function fetchPublishedCompositions() {
  if (!projectId.value) return
  compositionsLoading.value = true
  try {
    const result = await fetchScenarioCompositionList({
      projectId: projectId.value,
      status: ScenarioCompositionStatus.PUBLISHED,
      pageNo: 1,
      pageSize: 100,
    })
    publishedCompositions.value = result.list
  } catch (error: unknown) {
    ElMessage.error(extractErrorMessage(error, '加载已发布编排失败'))
  } finally {
    compositionsLoading.value = false
  }
}

async function openCreateDialog() {
  editingPlan.value = null
  planForm.compositionId = undefined
  planForm.name = ''
  planForm.intervalMinutes = 60
  planForm.enabled = true
  planDialogVisible.value = true
  await fetchPublishedCompositions()
}

function openEditDialog(plan: RegressionPlan) {
  editingPlan.value = plan
  planForm.compositionId = plan.compositionId
  planForm.name = plan.name
  planForm.intervalMinutes = plan.intervalMinutes
  planForm.enabled = plan.enabled
  planDialogVisible.value = true
}

async function submitPlan() {
  if (!projectId.value) {
    ElMessage.warning('请先选择项目')
    return
  }
  if (!editingPlan.value && !planForm.compositionId) {
    ElMessage.warning('请选择已发布编排')
    return
  }
  planSubmitting.value = true
  try {
    if (editingPlan.value) {
      await updateRegressionPlan(editingPlan.value.id, {
        projectId: projectId.value,
        name: planForm.name.trim() || undefined,
        intervalMinutes: planForm.intervalMinutes,
        enabled: planForm.enabled,
      })
      ElMessage.success('回归计划已更新')
    } else {
      await createRegressionPlan({
        projectId: projectId.value,
        compositionId: planForm.compositionId,
        name: planForm.name.trim() || undefined,
        intervalMinutes: planForm.intervalMinutes,
        enabled: planForm.enabled,
      })
      ElMessage.success('回归计划已创建')
    }
    planDialogVisible.value = false
    await fetchPlans()
  } catch (error: unknown) {
    ElMessage.error(extractErrorMessage(error, '保存回归计划失败'))
  } finally {
    planSubmitting.value = false
  }
}

async function togglePlanEnabled(plan: RegressionPlan) {
  if (!projectId.value) return
  try {
    await updateRegressionPlan(plan.id, {
      projectId: projectId.value,
      enabled: !plan.enabled,
    })
    ElMessage.success(plan.enabled ? '回归计划已停用' : '回归计划已启用')
    await fetchPlans()
  } catch (error: unknown) {
    ElMessage.error(extractErrorMessage(error, '切换回归计划状态失败'))
  }
}

async function triggerPlan(plan: RegressionPlan) {
  if (!projectId.value) return
  triggeringPlanId.value = plan.id
  try {
    const execution = await triggerRegressionPlan(plan.id, projectId.value)
    const label = RegressionExecutionStatusLabel[execution.status] || execution.status
    ElMessage.success(`手动回归完成：${label}`)
    await fetchPlans()
    if (activeTab.value === 'executions') {
      await fetchExecutions(1)
    }
  } catch (error: unknown) {
    ElMessage.error(extractErrorMessage(error, '手动触发回归失败'))
  } finally {
    triggeringPlanId.value = null
  }
}

async function deletePlan(plan: RegressionPlan) {
  if (!projectId.value) return
  try {
    await ElMessageBox.confirm(`确定删除回归计划「${plan.name}」？`, '删除回归计划', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await deleteRegressionPlan(plan.id, projectId.value)
    ElMessage.success('回归计划已删除')
    await fetchPlans()
  } catch (error: unknown) {
    if (!isElMessageBoxCancel(error)) {
      ElMessage.error(extractErrorMessage(error, '删除回归计划失败'))
    }
  }
}

// ── 执行记录 ──

const executions = ref<RegressionExecution[]>([])
const executionsTotal = ref(0)
const executionsPage = ref(1)
const executionsPageSize = ref(20)
const executionsLoading = ref(false)
const executionStatusFilter = ref<RegressionExecutionStatus | ''>('')

async function fetchExecutions(targetPage = executionsPage.value) {
  if (!projectId.value) {
    executions.value = []
    executionsTotal.value = 0
    return
  }
  executionsLoading.value = true
  try {
    const result = await fetchRegressionExecutions({
      projectId: projectId.value,
      status: executionStatusFilter.value,
      pageNo: targetPage,
      pageSize: executionsPageSize.value,
    })
    executions.value = result.list
    executionsTotal.value = result.total
    executionsPage.value = targetPage
  } catch (error: unknown) {
    ElMessage.error(extractErrorMessage(error, '加载回归执行记录失败'))
  } finally {
    executionsLoading.value = false
  }
}

async function changeExecutionsPage(targetPage: number) {
  await fetchExecutions(targetPage)
}

async function changeExecutionsPageSize(size: number) {
  executionsPageSize.value = size
  await fetchExecutions(1)
}

function executionStatusLabel(status: RegressionExecution['status']) {
  return RegressionExecutionStatusLabel[status] || status
}

function executionStatusColor(status: RegressionExecution['status']) {
  return RegressionExecutionStatusColor[status] || 'info'
}

function formatDuration(ms: number) {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

watch(projectId, () => {
  fetchPlans()
  executionsPage.value = 1
  fetchExecutions(1)
})

watch(activeTab, (tab) => {
  if (tab === 'executions' && executions.value.length === 0) {
    fetchExecutions(1)
  }
})

onMounted(() => {
  fetchPlans()
})
</script>

<template>
  <div class="regression-page">
    <section class="regression-header">
      <div class="regression-title">
        <span class="regression-eyebrow">测试智编资产</span>
        <h1>定时回归</h1>
        <p>已发布编排定时回归与执行记录，回归失败自动生成 AI 修复建议（需人工确认）。</p>
      </div>
      <div class="regression-actions">
        <el-button
          :disabled="!hasProject"
          @click="activeTab === 'plans' ? fetchPlans() : fetchExecutions(executionsPage)"
        >
          <span class="material-symbols-outlined">refresh</span>
          刷新
        </el-button>
        <el-button type="primary" :disabled="!hasProject" @click="openCreateDialog">
          <span class="material-symbols-outlined">add</span>
          新建回归计划
        </el-button>
      </div>
    </section>

    <section v-if="!hasProject" class="regression-state-panel">
      <span class="material-symbols-outlined">update</span>
      <h2>请选择项目</h2>
      <p>定时回归按项目隔离管理，选择项目后可为已发布编排配置回归计划。</p>
    </section>

    <section v-else class="regression-table-panel">
      <el-tabs v-model="activeTab" class="regression-tabs">
        <el-tab-pane label="回归计划" name="plans">
          <el-table v-loading="plansLoading" :data="plans" empty-text="暂无回归计划" row-key="id">
            <el-table-column label="计划名称" min-width="220" show-overflow-tooltip>
              <template #default="{ row }">
                <div class="plan-name-cell">
                  <span class="plan-name">{{ row.name }}</span>
                  <span class="plan-composition">
                    {{ row.compositionName || `编排 #${row.compositionId}` }}
                  </span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="间隔" width="100" align="center">
              <template #default="{ row }">{{ row.intervalMinutes }} 分钟</template>
            </el-table-column>
            <el-table-column label="启用" width="90" align="center">
              <template #default="{ row }">
                <el-switch :model-value="row.enabled" @change="togglePlanEnabled(row)" />
              </template>
            </el-table-column>
            <el-table-column label="上次结果" width="110" align="center">
              <template #default="{ row }">
                <el-tag
                  v-if="row.lastStatus"
                  :type="executionStatusColor(row.lastStatus)"
                  effect="light"
                  size="small"
                >
                  {{ executionStatusLabel(row.lastStatus) }}
                </el-tag>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="上次运行" width="160">
              <template #default="{ row }">
                {{ row.lastRunAt ? formatBeijingDateTime(row.lastRunAt) : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="下次运行" width="160">
              <template #default="{ row }">
                {{ row.nextRunAt ? formatBeijingDateTime(row.nextRunAt) : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right" align="right">
              <template #default="{ row }">
                <el-button
                  link
                  type="primary"
                  :loading="triggeringPlanId === row.id"
                  @click="triggerPlan(row)"
                >
                  立即回归
                </el-button>
                <el-button link @click="openEditDialog(row)">编辑</el-button>
                <el-button link type="danger" @click="deletePlan(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="执行记录" name="executions">
          <div class="executions-filter">
            <el-select
              v-model="executionStatusFilter"
              clearable
              placeholder="执行状态"
              style="width: 160px"
              @change="fetchExecutions(1)"
            >
              <el-option
                v-for="(label, status) in RegressionExecutionStatusLabel"
                :key="status"
                :label="label"
                :value="status"
              />
            </el-select>
          </div>
          <el-table
            v-loading="executionsLoading"
            :data="executions"
            empty-text="暂无执行记录"
            row-key="id"
          >
            <el-table-column label="编排" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.compositionName || `编排 #${row.compositionId}` }}
              </template>
            </el-table-column>
            <el-table-column label="触发方式" width="100" align="center">
              <template #default="{ row }">
                {{
                  RegressionTriggerTypeLabel[row.triggerType as RegressionTriggerType] ||
                  row.triggerType
                }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="executionStatusColor(row.status)" effect="light" size="small">
                  {{ executionStatusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="失败摘要" min-width="240" show-overflow-tooltip>
              <template #default="{ row }">{{ row.failureSummary || '-' }}</template>
            </el-table-column>
            <el-table-column label="修复建议" width="100" align="center">
              <template #default="{ row }">
                <router-link
                  v-if="row.repairSuggestionId"
                  :to="`/ai-script/repair-suggestions?suggestion_id=${row.repairSuggestionId}`"
                  class="suggestion-link"
                >
                  #{{ row.repairSuggestionId }}
                </router-link>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="耗时" width="90" align="center">
              <template #default="{ row }">{{ formatDuration(row.durationMs) }}</template>
            </el-table-column>
            <el-table-column label="时间" width="160">
              <template #default="{ row }">
                {{ formatBeijingDateTime(row.createdAt) }}
              </template>
            </el-table-column>
          </el-table>
          <div class="executions-pagination">
            <span>共 {{ executionsTotal }} 条</span>
            <el-pagination
              background
              layout="sizes, prev, pager, next"
              :current-page="executionsPage"
              :page-size="executionsPageSize"
              :page-sizes="[10, 20, 50]"
              :total="executionsTotal"
              @current-change="changeExecutionsPage"
              @size-change="changeExecutionsPageSize"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>

    <el-dialog
      v-model="planDialogVisible"
      :title="editingPlan ? '编辑回归计划' : '新建回归计划'"
      width="560px"
      class="regression-dialog"
      destroy-on-close
    >
      <el-form label-width="104px" :model="planForm">
        <el-form-item v-if="!editingPlan" label="已发布编排" required>
          <el-select
            v-model="planForm.compositionId"
            filterable
            :loading="compositionsLoading"
            placeholder="选择已发布的场景编排"
            style="width: 100%"
          >
            <el-option
              v-for="composition in publishedCompositions"
              :key="composition.id"
              :label="composition.scenarioName"
              :value="composition.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-else label="编排">
          <span>{{ editingPlan.compositionName || `编排 #${editingPlan.compositionId}` }}</span>
        </el-form-item>
        <el-form-item label="计划名称">
          <el-input v-model="planForm.name" placeholder="留空默认使用编排名称" />
        </el-form-item>
        <el-form-item label="回归间隔">
          <el-input-number v-model="planForm.intervalMinutes" :min="5" :max="10080" :step="5" />
          <span class="interval-unit">分钟</span>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="planForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="planDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="planSubmitting" @click="submitPlan">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.regression-page {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: var(--tp-space-4);
  box-sizing: border-box;
}

.regression-header,
.regression-table-panel,
.regression-state-panel {
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-lg);
  background: var(--tp-surface-card);
  box-shadow: var(--tp-shadow-sm);
}

.regression-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--tp-space-4);
  padding: var(--tp-space-5) var(--tp-space-6);
}

.regression-title {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--tp-space-1);
}

.regression-eyebrow {
  color: var(--tp-primary);
  font-size: 12px;
  font-weight: 700;
}

.regression-title h1 {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}

.regression-title p {
  margin: 0;
  color: var(--tp-text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.regression-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--tp-space-2);
}

.regression-actions .material-symbols-outlined {
  font-size: 18px;
}

.regression-table-panel {
  display: flex;
  min-height: 520px;
  flex: 1;
  flex-direction: column;
  padding: var(--tp-space-2) var(--tp-space-4) var(--tp-space-4);
}

.regression-tabs {
  flex: 1;
}

.plan-name-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.plan-name {
  overflow: hidden;
  color: var(--tp-text-primary);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-composition {
  color: var(--tp-text-muted);
  font-size: 12px;
}

.executions-filter {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--tp-space-3);
}

.executions-pagination {
  display: flex;
  min-height: 56px;
  align-items: center;
  justify-content: space-between;
  gap: var(--tp-space-3);
  color: var(--tp-text-muted);
  font-size: 13px;
}

.suggestion-link {
  color: var(--tp-primary);
  text-decoration: none;
}

.interval-unit {
  margin-left: var(--tp-space-2);
  color: var(--tp-text-muted);
  font-size: 13px;
}

.regression-state-panel {
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

.regression-state-panel .material-symbols-outlined {
  color: var(--tp-primary);
  font-size: 44px;
}

.regression-state-panel h2 {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 20px;
}

.regression-state-panel p {
  max-width: 420px;
  margin: 0;
  color: var(--tp-text-muted);
  font-size: 14px;
  line-height: 1.7;
}

:deep(.el-table) {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: var(--tp-surface-header);
  --el-table-row-hover-bg-color: var(--tp-surface-row-hover);
  --el-table-border-color: var(--tp-border-subtle);
  --el-table-text-color: var(--tp-text-secondary);
  --el-table-header-text-color: var(--tp-text-muted);
}

:global(.regression-dialog .el-dialog) {
  background: var(--tp-surface-card);
  color: var(--tp-text-primary);
}

@media (max-width: 980px) {
  .regression-header {
    flex-direction: column;
  }

  .regression-actions {
    justify-content: flex-start;
  }
}
</style>
