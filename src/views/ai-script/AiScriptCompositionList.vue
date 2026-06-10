<script setup lang="ts">
/**
 * 场景编排列表页。
 *
 * 管理复杂测试场景编排入口，支持新建、筛选、进入工作台和 AI 编排建议预览。
 */
import { onMounted } from 'vue'
import {
  ScenarioCompositionStatusColor,
  ScenarioCompositionStatusLabel,
  ValidationStatus,
  ValidationStatusColor,
  ValidationStatusLabel,
  type AiScenarioComposition,
} from '@/api/aiScript'
import { useAiCompositions } from '@/composables/useAiCompositions'
import { formatBeijingDateTime } from '@/utils/time'

const {
  ScenarioCompositionStatus,
  compositions,
  total,
  page,
  pageSize,
  loading,
  submitting,
  aiPlanning,
  creatingFromPlan,
  sourceTasksLoading,
  errorMessage,
  createDialogVisible,
  aiPlanDialogVisible,
  aiPlanResultVisible,
  publishedTaskOptions,
  aiPlanResult,
  filters,
  form,
  aiPlanForm,
  hasProject,
  canCreateFromAiPlan,
  fetchCompositions,
  applyFilters,
  resetFilters,
  changePage,
  changePageSize,
  openCreateDialog,
  fillScenarioKey,
  submitCreate,
  openAiPlanDialog,
  submitAiPlan,
  confirmAiPlanStep,
  isLowConfidencePlanStep,
  isAiPlanStepConfirmed,
  createCompositionFromPlan,
  goWorkbench,
  deleteDraft,
} = useAiCompositions()

onMounted(() => {
  fetchCompositions(1)
})

function getStatusLabel(status: AiScenarioComposition['status']) {
  return ScenarioCompositionStatusLabel[status] || status
}

function getStatusColor(status: AiScenarioComposition['status']) {
  return ScenarioCompositionStatusColor[status] || 'info'
}

function getValidationLabel(status?: AiScenarioComposition['latestValidationStatus']) {
  if (!status) return '-'
  return ValidationStatusLabel[status] || status
}

function getValidationColor(status?: AiScenarioComposition['latestValidationStatus']) {
  if (!status) return 'info'
  return ValidationStatusColor[status] || 'info'
}
</script>

<template>
  <div class="composition-page">
    <section class="composition-header">
      <div class="composition-title">
        <span class="composition-eyebrow">测试智编资产</span>
        <h1>场景编排</h1>
        <p>组合固定场景、断言和原子操作，生成可验证、可发布的 Playwright 工程脚本。</p>
      </div>
      <div class="composition-actions">
        <el-button :disabled="loading || !hasProject" @click="fetchCompositions(page)">
          <span class="material-symbols-outlined">refresh</span>
          刷新
        </el-button>
        <el-button :disabled="!hasProject" @click="openAiPlanDialog">
          <span class="material-symbols-outlined">auto_awesome</span>
          AI 计划
        </el-button>
        <el-button type="primary" :disabled="!hasProject" @click="openCreateDialog">
          <span class="material-symbols-outlined">add</span>
          新建编排
        </el-button>
      </div>
    </section>

    <section class="composition-filter" aria-label="场景编排筛选">
      <el-input
        v-model="filters.keyword"
        class="composition-keyword"
        clearable
        placeholder="搜索场景名称、Key 或描述"
        @keyup.enter="applyFilters"
      >
        <template #prefix>
          <span class="material-symbols-outlined">search</span>
        </template>
      </el-input>
      <el-select v-model="filters.status" clearable placeholder="编排状态">
        <el-option label="草稿" :value="ScenarioCompositionStatus.DRAFT" />
        <el-option label="已生成" :value="ScenarioCompositionStatus.GENERATED" />
        <el-option label="验证通过" :value="ScenarioCompositionStatus.PASSED" />
        <el-option label="验证失败" :value="ScenarioCompositionStatus.FAILED" />
        <el-option label="已发布" :value="ScenarioCompositionStatus.PUBLISHED" />
        <el-option label="已归档" :value="ScenarioCompositionStatus.ARCHIVED" />
      </el-select>
      <el-select v-model="filters.validationStatus" clearable placeholder="验证状态">
        <el-option label="验证通过" :value="ValidationStatus.PASSED" />
        <el-option label="验证失败" :value="ValidationStatus.FAILED" />
        <el-option label="未验证" :value="ValidationStatus.NOT_VALIDATED" />
      </el-select>
      <el-button type="primary" :disabled="!hasProject" @click="applyFilters">查询</el-button>
      <el-button :disabled="!hasProject" @click="resetFilters">重置</el-button>
    </section>

    <section v-if="!hasProject" class="composition-state-panel">
      <span class="material-symbols-outlined">schema</span>
      <h2>请选择项目</h2>
      <p>场景编排按项目隔离管理，选择项目后可组合固定场景与断言资产。</p>
    </section>

    <section v-else class="composition-table-panel">
      <el-alert
        v-if="errorMessage"
        class="composition-alert"
        type="error"
        :title="errorMessage"
        show-icon
        :closable="false"
      />

      <el-table
        v-loading="loading"
        :data="compositions"
        height="100%"
        empty-text="暂无场景编排"
        row-key="id"
        @row-click="goWorkbench"
      >
        <el-table-column label="场景" min-width="280" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="composition-name-cell">
              <span class="composition-name">{{ row.scenarioName }}</span>
              <span class="composition-key">{{ row.scenarioKey }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="引用资产" width="132" align="center">
          <template #default="{ row }">
            <div class="ref-counts">
              <span>场景 {{ row.flowRefCount || 0 }}</span>
              <span>断言 {{ row.assertionRefCount || 0 }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="112" align="center">
          <template #default="{ row }">
            <el-tag :type="getStatusColor(row.status)" effect="light" size="small">
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="验证" width="116" align="center">
          <template #default="{ row }">
            <el-tag
              :type="getValidationColor(row.latestValidationStatus)"
              effect="light"
              size="small"
            >
              {{ getValidationLabel(row.latestValidationStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="修订" width="80" align="center">
          <template #default="{ row }">R{{ row.revision }}</template>
        </el-table-column>
        <el-table-column label="创建人" width="112" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.createdName || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="160">
          <template #default="{ row }">
            <span
              :title="`${formatBeijingDateTime(row.updatedAt, { includeSeconds: true })} 北京时间`"
            >
              {{ formatBeijingDateTime(row.updatedAt) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="148" fixed="right" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="goWorkbench(row)">工作台</el-button>
            <el-button
              v-if="row.status === ScenarioCompositionStatus.DRAFT"
              link
              type="danger"
              @click.stop="deleteDraft(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="composition-pagination">
        <span>共 {{ total }} 条</span>
        <el-pagination
          background
          layout="sizes, prev, pager, next"
          :current-page="page"
          :page-size="pageSize"
          :page-sizes="[10, 20, 50]"
          :total="total"
          @current-change="changePage"
          @size-change="changePageSize"
        />
      </div>
    </section>

    <el-dialog
      v-model="createDialogVisible"
      title="新建场景编排"
      width="620px"
      class="composition-dialog"
      destroy-on-close
    >
      <el-form label-width="104px" :model="form">
        <el-form-item label="场景名称" required>
          <el-input
            v-model="form.scenarioName"
            placeholder="例如：创建测试智编任务并验证"
            @blur="fillScenarioKey"
          />
        </el-form-item>
        <el-form-item label="场景 Key" required>
          <el-input v-model="form.scenarioKey" placeholder="create_ai_script_task_and_verify" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="说明编排目标、复用资产和验证边界"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="aiPlanDialogVisible"
      title="AI 编排计划"
      width="720px"
      class="composition-dialog"
      destroy-on-close
    >
      <el-form label-width="112px" :model="aiPlanForm">
        <el-form-item label="来源任务" required>
          <el-select
            v-model="aiPlanForm.taskId"
            filterable
            :loading="sourceTasksLoading"
            placeholder="选择验证通过的录制任务"
            style="width: 100%"
          >
            <el-option
              v-for="task in publishedTaskOptions"
              :key="task.id"
              :label="task.taskName"
              :value="task.id"
            >
              <div class="task-option">
                <span>{{ task.taskName }}</span>
                <small>#{{ task.id }} · {{ formatBeijingDateTime(task.updatedAt) }}</small>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="最大步骤数">
          <el-input-number v-model="aiPlanForm.maxSteps" :min="1" :max="20" />
        </el-form-item>
      </el-form>

      <section v-if="aiPlanResultVisible && aiPlanResult" class="ai-plan-result">
        <div class="ai-plan-summary">
          <strong>{{ aiPlanResult.summary }}</strong>
          <span>置信度 {{ Math.round(aiPlanResult.confidence * 100) }}%</span>
        </div>
        <div v-if="aiPlanResult.warnings.length" class="ai-plan-warning">
          {{ aiPlanResult.warnings.join('；') }}
        </div>
        <div class="ai-plan-steps">
          <div
            v-for="(step, index) in aiPlanResult.steps"
            :key="`${step.type}-${index}`"
            class="ai-plan-step"
            :class="{ caution: isLowConfidencePlanStep(step) }"
          >
            <span>{{ index + 1 }}</span>
            <div>
              <strong>{{ step.flowKey || step.assertionKey || step.type }}</strong>
              <small>{{ step.reason }}</small>
            </div>
            <em>{{ Math.round(step.confidence * 100) }}%</em>
            <el-button
              v-if="isLowConfidencePlanStep(step) && !isAiPlanStepConfirmed(step)"
              size="small"
              @click="confirmAiPlanStep(step)"
            >
              确认
            </el-button>
            <el-tag
              v-else-if="isLowConfidencePlanStep(step)"
              size="small"
              type="success"
              effect="light"
            >
              已确认
            </el-tag>
          </div>
        </div>
      </section>

      <template #footer>
        <el-button @click="aiPlanDialogVisible = false">关闭</el-button>
        <el-button type="primary" :loading="aiPlanning" @click="submitAiPlan">生成计划</el-button>
        <el-button
          v-if="aiPlanResultVisible"
          type="success"
          :disabled="!canCreateFromAiPlan"
          :loading="creatingFromPlan"
          @click="createCompositionFromPlan"
        >
          生成编排草稿
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.composition-page {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: var(--tp-space-4);
  box-sizing: border-box;
}

.composition-header,
.composition-filter,
.composition-table-panel,
.composition-state-panel {
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-lg);
  background: var(--tp-surface-card);
  box-shadow: var(--tp-shadow-sm);
}

.composition-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--tp-space-4);
  padding: var(--tp-space-5) var(--tp-space-6);
}

.composition-title {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--tp-space-1);
}

.composition-eyebrow {
  color: var(--tp-primary);
  font-size: 12px;
  font-weight: 700;
}

.composition-title h1 {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}

.composition-title p {
  margin: 0;
  color: var(--tp-text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.composition-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--tp-space-2);
}

.composition-actions .material-symbols-outlined,
.composition-filter .material-symbols-outlined {
  font-size: 18px;
}

.composition-filter {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 160px 160px auto auto;
  gap: var(--tp-space-3);
  padding: var(--tp-space-4);
}

.composition-table-panel {
  display: flex;
  min-height: 520px;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.composition-alert {
  margin: var(--tp-space-3) var(--tp-space-3) 0;
}

.composition-name-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.composition-name {
  overflow: hidden;
  color: var(--tp-text-primary);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composition-key {
  color: var(--tp-text-muted);
  font-size: 12px;
}

.ref-counts {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  color: var(--tp-text-muted);
  font-size: 12px;
  line-height: 1.3;
}

.composition-pagination {
  display: flex;
  min-height: 56px;
  align-items: center;
  justify-content: space-between;
  gap: var(--tp-space-3);
  padding: 0 var(--tp-space-4);
  border-top: 1px solid var(--tp-border-subtle);
  color: var(--tp-text-muted);
  font-size: 13px;
}

.composition-state-panel {
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

.composition-state-panel .material-symbols-outlined {
  color: var(--tp-primary);
  font-size: 44px;
}

.composition-state-panel h2 {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 20px;
}

.composition-state-panel p {
  max-width: 420px;
  margin: 0;
  color: var(--tp-text-muted);
  font-size: 14px;
  line-height: 1.7;
}

.task-option {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.task-option small {
  color: var(--tp-text-muted);
}

.ai-plan-result {
  display: flex;
  flex-direction: column;
  gap: var(--tp-space-3);
  margin-top: var(--tp-space-4);
  padding: var(--tp-space-4);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  background: var(--tp-surface-muted);
}

.ai-plan-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--tp-space-3);
  color: var(--tp-text-primary);
  font-size: 13px;
}

.ai-plan-summary span,
.ai-plan-step small,
.ai-plan-step em {
  color: var(--tp-text-muted);
  font-size: 12px;
  font-style: normal;
}

.ai-plan-warning {
  color: var(--tp-warning);
  font-size: 12px;
}

.ai-plan-steps {
  display: flex;
  flex-direction: column;
  gap: var(--tp-space-2);
}

.ai-plan-step {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 44px auto;
  align-items: center;
  gap: var(--tp-space-2);
  padding: var(--tp-space-2);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-sm);
  background: var(--tp-surface-card);
}

.ai-plan-step.caution {
  border-color: var(--tp-warning);
  background: var(--tp-accent-warning-soft);
}

.ai-plan-step > span {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--tp-primary-lighter);
  color: var(--tp-primary);
  font-size: 12px;
  font-weight: 700;
}

.ai-plan-step div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.ai-plan-step strong {
  overflow: hidden;
  color: var(--tp-text-primary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.el-table) {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: var(--tp-surface-header);
  --el-table-row-hover-bg-color: var(--tp-surface-row-hover);
  --el-table-border-color: var(--tp-border-subtle);
  --el-table-text-color: var(--tp-text-secondary);
  --el-table-header-text-color: var(--tp-text-muted);
  flex: 1;
}

:deep(.el-table th.el-table__cell) {
  height: 44px;
  font-size: 12px;
  font-weight: 700;
}

:deep(.el-table td.el-table__cell) {
  height: 56px;
  border-bottom-color: var(--tp-border-subtle);
}

:deep(.el-table__inner-wrapper::before) {
  display: none;
}

:deep(.el-input__wrapper),
:deep(.el-select__wrapper),
:deep(.el-textarea__inner) {
  background: var(--tp-surface-input);
  box-shadow: 0 0 0 1px var(--tp-border-subtle) inset;
}

:deep(.el-input__wrapper.is-focus),
:deep(.el-select__wrapper.is-focused),
:deep(.el-textarea__inner:focus) {
  box-shadow: 0 0 0 1px var(--tp-border-strong) inset;
}

:global(.composition-dialog .el-dialog) {
  background: var(--tp-surface-card);
  color: var(--tp-text-primary);
}

:global(.composition-dialog .el-dialog__title) {
  color: var(--tp-text-primary);
  font-weight: 700;
}

@media (max-width: 980px) {
  .composition-header {
    flex-direction: column;
  }

  .composition-actions {
    justify-content: flex-start;
  }

  .composition-filter {
    grid-template-columns: 1fr 1fr;
  }

  .composition-keyword {
    grid-column: 1 / -1;
  }
}

@media (max-width: 640px) {
  .composition-filter {
    grid-template-columns: 1fr;
  }

  .composition-pagination {
    align-items: flex-start;
    flex-direction: column;
    padding: var(--tp-space-3) var(--tp-space-4);
  }
}
</style>
