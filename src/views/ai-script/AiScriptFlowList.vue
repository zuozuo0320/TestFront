<script setup lang="ts">
/**
 * 固定场景库页面。
 *
 * 承接录制任务发布后的可复用流程资产，首期提供列表、筛选、详情和发布入口。
 */
import { onMounted } from 'vue'
import {
  FlowAssetStatusColor,
  FlowAssetStatusLabel,
  ValidationStatus,
  ValidationStatusColor,
  ValidationStatusLabel,
  type AiFlowAsset,
} from '@/api/aiScript'
import { useAiFlowAssets } from '@/composables/useAiFlowAssets'
import { formatBeijingDateTime } from '@/utils/time'

const {
  FlowAssetStatus,
  hasProject,
  flows,
  total,
  page,
  pageSize,
  loading,
  detailLoading,
  governanceLoading,
  errorMessage,
  currentFlow,
  detailVisible,
  versions,
  references,
  filters,
  publishDialogVisible,
  publishSubmitting,
  manualDialogVisible,
  manualSubmitting,
  sourceTasksLoading,
  publishableTasks,
  publishForm,
  manualForm,
  manualDialogTitle,
  fetchFlows,
  applyFilters,
  resetFilters,
  changePage,
  changePageSize,
  openDetail,
  openManualCreateDialog,
  openManualEditDialog,
  submitManualSave,
  publishManual,
  archiveManual,
  deleteManual,
  openPublishDialog,
  fillFromSourceTask,
  submitPublish,
} = useAiFlowAssets()

onMounted(() => {
  fetchFlows(1)
})

function getFlowStatusLabel(status: AiFlowAsset['status']) {
  return FlowAssetStatusLabel[status] || status
}

function getFlowStatusColor(status: AiFlowAsset['status']) {
  return FlowAssetStatusColor[status] || 'info'
}

function getValidationLabel(status?: AiFlowAsset['latestValidationStatus']) {
  if (!status) return '-'
  return ValidationStatusLabel[status] || status
}

function getValidationColor(status?: AiFlowAsset['latestValidationStatus']) {
  if (!status) return 'info'
  return ValidationStatusColor[status] || 'info'
}

function formatList(items?: string[]) {
  return Array.isArray(items) && items.length > 0 ? items : ['-']
}
</script>

<template>
  <div class="ai-flow-page">
    <section class="flow-header">
      <div class="flow-title">
        <span class="flow-eyebrow">测试智编资产</span>
        <h1>固定场景</h1>
        <p>沉淀已验证通过的录制流程，作为场景编排和 AI 推荐的复用资产。</p>
      </div>
      <div class="flow-actions">
        <el-button :disabled="loading || !hasProject" @click="fetchFlows(page)">
          <span class="material-symbols-outlined">refresh</span>
          刷新
        </el-button>
        <el-button :disabled="!hasProject" @click="openManualCreateDialog">
          <span class="material-symbols-outlined">add</span>
          新建
        </el-button>
        <el-button type="primary" :disabled="!hasProject" @click="openPublishDialog">
          <span class="material-symbols-outlined">publish</span>
          从录制任务发布
        </el-button>
      </div>
    </section>

    <section class="flow-filter" aria-label="固定场景筛选">
      <el-input
        v-model="filters.keyword"
        class="flow-keyword"
        clearable
        placeholder="搜索场景名称、Key 或描述"
        @keyup.enter="applyFilters"
      >
        <template #prefix>
          <span class="material-symbols-outlined">search</span>
        </template>
      </el-input>
      <el-select v-model="filters.status" clearable placeholder="资产状态">
        <el-option label="草稿" :value="FlowAssetStatus.DRAFT" />
        <el-option label="已发布" :value="FlowAssetStatus.PUBLISHED" />
        <el-option label="已归档" :value="FlowAssetStatus.ARCHIVED" />
      </el-select>
      <el-select v-model="filters.validationStatus" clearable placeholder="验证状态">
        <el-option label="验证通过" :value="ValidationStatus.PASSED" />
        <el-option label="验证失败" :value="ValidationStatus.FAILED" />
        <el-option label="未验证" :value="ValidationStatus.NOT_VALIDATED" />
        <el-option label="验证中" :value="ValidationStatus.VALIDATING" />
      </el-select>
      <el-button type="primary" :disabled="!hasProject" @click="applyFilters">查询</el-button>
      <el-button :disabled="!hasProject" @click="resetFilters">重置</el-button>
    </section>

    <section v-if="!hasProject" class="flow-state-panel">
      <span class="material-symbols-outlined">folder_managed</span>
      <h2>请选择项目</h2>
      <p>固定场景按项目隔离管理，选择项目后可查看和发布场景资产。</p>
    </section>

    <section v-else class="flow-table-panel">
      <el-alert
        v-if="errorMessage"
        class="flow-alert"
        type="error"
        :title="errorMessage"
        show-icon
        :closable="false"
      />

      <el-table
        v-loading="loading"
        :data="flows"
        height="100%"
        empty-text="暂无固定场景"
        row-key="id"
        @row-click="openDetail"
      >
        <el-table-column label="场景" min-width="280" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="flow-name-cell">
              <span class="flow-name">{{ row.flowName }}</span>
              <span class="flow-key">{{ row.flowKey }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="标签" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <div v-if="row.tags?.length" class="flow-tags">
              <el-tag v-for="tag in row.tags.slice(0, 2)" :key="tag" size="small">
                {{ tag }}
              </el-tag>
              <span v-if="row.tags.length > 2" class="flow-tag-more">
                +{{ row.tags.length - 2 }}
              </span>
            </div>
            <span v-else class="flow-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="104" align="center">
          <template #default="{ row }">
            <el-tag :type="getFlowStatusColor(row.status)" effect="light" size="small">
              {{ getFlowStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近验证" width="116" align="center">
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
        <el-table-column label="AI 复用" width="88" align="center">
          <template #default="{ row }">
            <span class="flow-boolean" :class="{ active: row.allowAiReuse }">
              {{ row.allowAiReuse ? '允许' : '关闭' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="来源任务" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <span>
              {{ row.sourceTaskName || (row.sourceTaskId ? `#${row.sourceTaskId}` : '-') }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="更新人" width="112" show-overflow-tooltip>
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
        <el-table-column label="操作" width="188" fixed="right" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="openDetail(row)">查看</el-button>
            <el-button link type="primary" @click.stop="openManualEditDialog(row)">编辑</el-button>
            <el-button
              v-if="row.status !== FlowAssetStatus.PUBLISHED"
              link
              type="success"
              @click.stop="publishManual(row)"
            >
              发布
            </el-button>
            <el-button
              v-if="row.status !== FlowAssetStatus.ARCHIVED"
              link
              type="warning"
              @click.stop="archiveManual(row)"
            >
              归档
            </el-button>
            <el-button
              v-if="row.status === FlowAssetStatus.DRAFT"
              link
              type="danger"
              @click.stop="deleteManual(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="flow-pagination">
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

    <el-drawer v-model="detailVisible" title="固定场景详情" size="520px" class="flow-detail-drawer">
      <div v-loading="detailLoading" class="flow-detail">
        <template v-if="currentFlow">
          <div class="detail-heading">
            <h2>{{ currentFlow.flowName }}</h2>
            <span>{{ currentFlow.flowKey }}</span>
          </div>
          <div class="detail-status-row">
            <el-tag :type="getFlowStatusColor(currentFlow.status)" effect="light">
              {{ getFlowStatusLabel(currentFlow.status) }}
            </el-tag>
            <el-tag :type="getValidationColor(currentFlow.latestValidationStatus)" effect="light">
              {{ getValidationLabel(currentFlow.latestValidationStatus) }}
            </el-tag>
            <el-tag :type="currentFlow.allowAiReuse ? 'success' : 'info'" effect="light">
              {{ currentFlow.allowAiReuse ? '允许 AI 复用' : '关闭 AI 复用' }}
            </el-tag>
          </div>
          <p class="detail-desc">{{ currentFlow.description || '暂无描述' }}</p>

          <div class="detail-section">
            <h3>前置条件</h3>
            <ul>
              <li v-for="item in formatList(currentFlow.preconditions)" :key="item">{{ item }}</li>
            </ul>
          </div>
          <div class="detail-section">
            <h3>后置条件</h3>
            <ul>
              <li v-for="item in formatList(currentFlow.postconditions)" :key="item">{{ item }}</li>
            </ul>
          </div>
          <div class="detail-grid">
            <div>
              <span>来源任务</span>
              <strong>
                {{ currentFlow.sourceTaskName || `#${currentFlow.sourceTaskId || '-'}` }}
              </strong>
            </div>
            <div>
              <span>来源版本</span>
              <strong>#{{ currentFlow.sourceVersionId || '-' }}</strong>
            </div>
            <div>
              <span>创建人</span>
              <strong>{{ currentFlow.createdName || '-' }}</strong>
            </div>
            <div>
              <span>更新时间</span>
              <strong>{{ formatBeijingDateTime(currentFlow.updatedAt) }}</strong>
            </div>
          </div>

          <el-divider>版本与影响</el-divider>
          <div v-loading="governanceLoading" class="detail-governance">
            <section class="detail-section">
              <h3>发布版本</h3>
              <div v-if="versions.length === 0" class="detail-empty">暂无发布版本</div>
              <div v-else class="detail-list">
                <div v-for="version in versions" :key="version.id" class="detail-list-item">
                  <div>
                    <strong>V{{ version.versionNo }}</strong>
                    <span>{{ version.changeSummary || '发布版本' }}</span>
                  </div>
                  <small>{{ formatBeijingDateTime(version.createdAt) }}</small>
                </div>
              </div>
            </section>
            <section class="detail-section">
              <h3>引用关系</h3>
              <div v-if="references.length === 0" class="detail-empty">暂无编排引用</div>
              <div v-else class="detail-list">
                <div v-for="ref in references" :key="ref.id" class="detail-list-item">
                  <div>
                    <strong>{{ ref.sourceName || `来源 #${ref.sourceId}` }}</strong>
                    <span>
                      {{ ref.impactLevel === 'INDIRECT' ? '间接影响' : '直接引用' }}
                      ·
                      {{ ref.sourceType }} 引用 {{ ref.targetType }}
                    </span>
                  </div>
                  <small>版本 {{ ref.targetVersionId || '-' }}</small>
                </div>
              </div>
            </section>
          </div>
        </template>
      </div>
    </el-drawer>

    <el-dialog
      v-model="manualDialogVisible"
      :title="manualDialogTitle"
      width="760px"
      class="flow-manual-dialog"
      destroy-on-close
    >
      <el-form label-width="116px" :model="manualForm">
        <el-form-item label="场景 Key" required>
          <el-input
            v-model="manualForm.flowKey"
            :disabled="Boolean(manualForm.id)"
            placeholder="login_system"
          />
        </el-form-item>
        <el-form-item label="场景名称" required>
          <el-input v-model="manualForm.flowName" placeholder="例如：登录系统" />
        </el-form-item>
        <el-form-item label="场景描述">
          <el-input
            v-model="manualForm.description"
            type="textarea"
            :rows="3"
            placeholder="说明业务流程、适用页面和复用边界"
          />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="manualForm.tagsText" placeholder="用逗号或空格分隔" />
        </el-form-item>
        <el-form-item label="入参 Schema">
          <el-input
            v-model="manualForm.inputSchemaText"
            type="textarea"
            :rows="4"
            spellcheck="false"
          />
        </el-form-item>
        <el-form-item label="出参 Schema">
          <el-input
            v-model="manualForm.outputSchemaText"
            type="textarea"
            :rows="4"
            spellcheck="false"
          />
        </el-form-item>
        <el-form-item label="前置条件" required>
          <el-input v-model="manualForm.preconditionsText" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="后置条件" required>
          <el-input v-model="manualForm.postconditionsText" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="流程 DSL">
          <el-input v-model="manualForm.dslText" type="textarea" :rows="5" spellcheck="false" />
        </el-form-item>
        <el-form-item label="代码快照">
          <el-input
            v-model="manualForm.codeSnapshot"
            type="textarea"
            :rows="5"
            spellcheck="false"
          />
        </el-form-item>
        <el-form-item label="AI 复用">
          <el-switch v-model="manualForm.allowAiReuse" active-text="允许" inactive-text="关闭" />
        </el-form-item>
        <el-form-item label="版本说明">
          <el-input v-model="manualForm.changeSummary" placeholder="保存固定场景" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="manualDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="manualSubmitting" @click="submitManualSave">
          保存
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="publishDialogVisible"
      title="发布固定场景"
      width="680px"
      class="flow-publish-dialog"
      destroy-on-close
    >
      <el-form label-width="104px" :model="publishForm">
        <el-form-item label="来源任务" required>
          <el-select
            v-model="publishForm.taskId"
            filterable
            :loading="sourceTasksLoading"
            placeholder="选择验证通过的录制任务"
            style="width: 100%"
            @change="fillFromSourceTask"
          >
            <el-option
              v-for="task in publishableTasks"
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
        <el-form-item label="场景 Key" required>
          <el-input
            v-model="publishForm.flowKey"
            placeholder="login_system，例如小写字母和下划线"
          />
        </el-form-item>
        <el-form-item label="场景名称" required>
          <el-input v-model="publishForm.flowName" placeholder="例如：登录系统" />
        </el-form-item>
        <el-form-item label="场景描述">
          <el-input
            v-model="publishForm.description"
            type="textarea"
            :rows="3"
            placeholder="说明业务流程、适用页面和复用边界"
          />
        </el-form-item>
        <el-form-item label="标签">
          <el-input
            v-model="publishForm.tagsText"
            placeholder="用逗号或空格分隔，例如：登录 基础流程"
          />
        </el-form-item>
        <el-form-item label="前置条件" required>
          <el-input v-model="publishForm.preconditionsText" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="后置条件" required>
          <el-input v-model="publishForm.postconditionsText" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="AI 复用">
          <el-switch v-model="publishForm.allowAiReuse" active-text="允许" inactive-text="关闭" />
        </el-form-item>
        <el-form-item label="版本说明">
          <el-input v-model="publishForm.changeSummary" placeholder="首次发布" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="publishDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="publishSubmitting" @click="submitPublish">
          发布
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.ai-flow-page {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: var(--tp-space-4);
  box-sizing: border-box;
}

.flow-header,
.flow-filter,
.flow-table-panel,
.flow-state-panel {
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-lg);
  background: var(--tp-surface-card);
  box-shadow: var(--tp-shadow-sm);
}

.flow-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--tp-space-4);
  padding: var(--tp-space-5) var(--tp-space-6);
}

.flow-title {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--tp-space-1);
}

.flow-eyebrow {
  color: var(--tp-primary);
  font-size: 12px;
  font-weight: 700;
}

.flow-title h1 {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}

.flow-title p {
  margin: 0;
  color: var(--tp-text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.flow-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--tp-space-2);
}

.flow-actions .material-symbols-outlined,
.flow-filter .material-symbols-outlined {
  font-size: 18px;
}

.flow-filter {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 160px 160px auto auto;
  gap: var(--tp-space-3);
  padding: var(--tp-space-4);
}

.flow-table-panel {
  display: flex;
  min-height: 520px;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.flow-alert {
  margin: var(--tp-space-3) var(--tp-space-3) 0;
}

.flow-name-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.flow-name {
  overflow: hidden;
  color: var(--tp-text-primary);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flow-key,
.flow-muted,
.flow-tag-more {
  color: var(--tp-text-muted);
  font-size: 12px;
}

.flow-tags {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--tp-space-1);
}

.flow-boolean {
  color: var(--tp-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.flow-boolean.active {
  color: var(--tp-success);
}

.flow-pagination {
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

.flow-state-panel {
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

.flow-state-panel .material-symbols-outlined {
  color: var(--tp-primary);
  font-size: 44px;
}

.flow-state-panel h2 {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 20px;
}

.flow-state-panel p {
  max-width: 420px;
  margin: 0;
  color: var(--tp-text-muted);
  font-size: 14px;
  line-height: 1.7;
}

.flow-detail {
  min-height: 280px;
}

.detail-heading {
  display: flex;
  flex-direction: column;
  gap: var(--tp-space-1);
  padding-bottom: var(--tp-space-4);
  border-bottom: 1px solid var(--tp-border-subtle);
}

.detail-heading h2 {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 20px;
}

.detail-heading span,
.detail-desc {
  color: var(--tp-text-muted);
  font-size: 13px;
}

.detail-status-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--tp-space-2);
  margin-top: var(--tp-space-4);
}

.detail-desc {
  margin: var(--tp-space-4) 0;
  line-height: 1.7;
}

.detail-section {
  margin-top: var(--tp-space-4);
}

.detail-section h3 {
  margin: 0 0 var(--tp-space-2);
  color: var(--tp-text-primary);
  font-size: 14px;
}

.detail-section ul {
  margin: 0;
  padding-left: var(--tp-space-5);
  color: var(--tp-text-secondary);
  font-size: 13px;
  line-height: 1.8;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--tp-space-3);
  margin-top: var(--tp-space-5);
}

.detail-grid div {
  min-width: 0;
  padding: var(--tp-space-3);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  background: var(--tp-surface-muted);
}

.detail-grid span {
  display: block;
  color: var(--tp-text-muted);
  font-size: 12px;
}

.detail-grid strong {
  display: block;
  overflow: hidden;
  margin-top: var(--tp-space-1);
  color: var(--tp-text-primary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-governance {
  display: flex;
  min-height: 160px;
  flex-direction: column;
  gap: var(--tp-space-4);
}

.detail-empty {
  padding: var(--tp-space-3);
  border: 1px dashed var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  color: var(--tp-text-muted);
  font-size: 13px;
  text-align: center;
}

.detail-list {
  display: flex;
  flex-direction: column;
  gap: var(--tp-space-2);
}

.detail-list-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--tp-space-3);
  padding: var(--tp-space-3);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  background: var(--tp-surface-muted);
}

.detail-list-item div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.detail-list-item strong {
  overflow: hidden;
  color: var(--tp-text-primary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-list-item span,
.detail-list-item small {
  color: var(--tp-text-muted);
  font-size: 12px;
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
  box-shadow: 0 0 0 1px var(--tp-primary) inset;
}

:global(.flow-publish-dialog .el-dialog),
:global(.flow-manual-dialog .el-dialog),
:global(.flow-detail-drawer .el-drawer) {
  background: var(--tp-surface-card);
  color: var(--tp-text-primary);
}

:global(.flow-publish-dialog .el-dialog__title),
:global(.flow-manual-dialog .el-dialog__title),
:global(.flow-detail-drawer .el-drawer__title) {
  color: var(--tp-text-primary);
  font-weight: 700;
}

@media (max-width: 960px) {
  .flow-header {
    flex-direction: column;
  }

  .flow-actions {
    justify-content: flex-start;
  }

  .flow-filter {
    grid-template-columns: 1fr 1fr;
  }

  .flow-keyword {
    grid-column: 1 / -1;
  }
}

@media (max-width: 640px) {
  .flow-filter,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .flow-pagination {
    align-items: flex-start;
    flex-direction: column;
    padding: var(--tp-space-3) var(--tp-space-4);
  }
}
</style>
