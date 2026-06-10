<script setup lang="ts">
/**
 * 断言库页面。
 *
 * 承载测试智编断言资产的创建、发布、归档和影响分析入口。
 */
import { onMounted } from 'vue'
import {
  AssertionAssetStatusColor,
  AssertionAssetStatusLabel,
  AssertionAssetType,
  AssertionAssetTypeLabel,
  ValidationStatusColor,
  ValidationStatusLabel,
  type AiAssertionAsset,
} from '@/api/aiScript'
import { useAiAssertions } from '@/composables/useAiAssertions'
import { formatBeijingDateTime } from '@/utils/time'

const {
  AssertionAssetStatus,
  assertions,
  total,
  page,
  pageSize,
  loading,
  submitting,
  detailLoading,
  referenceLoading,
  errorMessage,
  dialogVisible,
  detailVisible,
  currentAssertion,
  references,
  filters,
  form,
  hasProject,
  dialogTitle,
  fetchAssertions,
  applyFilters,
  resetFilters,
  changePage,
  changePageSize,
  openCreateDialog,
  openEditDialog,
  openDetail,
  submitForm,
  publish,
  archive,
  deleteDraft,
} = useAiAssertions()

const assertionTypeOptions = Object.values(AssertionAssetType)

onMounted(() => {
  fetchAssertions(1)
})

function getStatusLabel(status: AiAssertionAsset['status']) {
  return AssertionAssetStatusLabel[status] || status
}

function getStatusColor(status: AiAssertionAsset['status']) {
  return AssertionAssetStatusColor[status] || 'info'
}

function getTypeLabel(type: AiAssertionAsset['assertionType']) {
  return AssertionAssetTypeLabel[type] || type
}

function getValidationLabel(status?: AiAssertionAsset['latestValidationStatus']) {
  if (!status) return '-'
  return ValidationStatusLabel[status] || status
}

function getValidationColor(status?: AiAssertionAsset['latestValidationStatus']) {
  if (!status) return 'info'
  return ValidationStatusColor[status] || 'info'
}
</script>

<template>
  <div class="assertion-page">
    <section class="asset-header">
      <div class="asset-title">
        <span class="asset-eyebrow">测试智编资产</span>
        <h1>断言库</h1>
        <p>将页面、表格、接口和自定义代码校验沉淀为独立资产，供场景编排复用。</p>
      </div>
      <div class="asset-actions">
        <el-button :disabled="loading || !hasProject" @click="fetchAssertions(page)">
          <span class="material-symbols-outlined">refresh</span>
          刷新
        </el-button>
        <el-button type="primary" :disabled="!hasProject" @click="openCreateDialog">
          <span class="material-symbols-outlined">add_task</span>
          新建断言
        </el-button>
      </div>
    </section>

    <section class="asset-filter" aria-label="断言库筛选">
      <el-input
        v-model="filters.keyword"
        class="asset-keyword"
        clearable
        placeholder="搜索断言名称、Key 或描述"
        @keyup.enter="applyFilters"
      >
        <template #prefix>
          <span class="material-symbols-outlined">search</span>
        </template>
      </el-input>
      <el-select v-model="filters.status" clearable placeholder="资产状态">
        <el-option label="草稿" :value="AssertionAssetStatus.DRAFT" />
        <el-option label="已发布" :value="AssertionAssetStatus.PUBLISHED" />
        <el-option label="已归档" :value="AssertionAssetStatus.ARCHIVED" />
      </el-select>
      <el-select v-model="filters.assertionType" clearable placeholder="断言类型">
        <el-option
          v-for="type in assertionTypeOptions"
          :key="type"
          :label="AssertionAssetTypeLabel[type]"
          :value="type"
        />
      </el-select>
      <el-button type="primary" :disabled="!hasProject" @click="applyFilters">查询</el-button>
      <el-button :disabled="!hasProject" @click="resetFilters">重置</el-button>
    </section>

    <section v-if="!hasProject" class="asset-state-panel">
      <span class="material-symbols-outlined">fact_check</span>
      <h2>请选择项目</h2>
      <p>断言资产按项目隔离管理，选择项目后可创建和引用断言。</p>
    </section>

    <section v-else class="asset-table-panel">
      <el-alert
        v-if="errorMessage"
        class="asset-alert"
        type="error"
        :title="errorMessage"
        show-icon
        :closable="false"
      />

      <el-table
        v-loading="loading"
        :data="assertions"
        height="100%"
        empty-text="暂无断言资产"
        row-key="id"
        @row-click="openDetail"
      >
        <el-table-column label="断言" min-width="280" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="asset-name-cell">
              <span class="asset-name">{{ row.assertionName }}</span>
              <span class="asset-key">{{ row.assertionKey }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="132" show-overflow-tooltip>
          <template #default="{ row }">
            {{ getTypeLabel(row.assertionType) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="104" align="center">
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
        <el-table-column label="AI 推荐" width="96" align="center">
          <template #default="{ row }">
            <span class="asset-boolean" :class="{ active: row.allowAiReuse }">
              {{ row.allowAiReuse ? '允许' : '关闭' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="引用" width="88" align="center">
          <template #default="{ row }">
            {{ row.refCount || 0 }}
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
        <el-table-column label="操作" width="216" fixed="right" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="openEditDialog(row)">编辑</el-button>
            <el-button
              v-if="row.status !== AssertionAssetStatus.PUBLISHED"
              link
              type="success"
              @click.stop="publish(row)"
            >
              发布
            </el-button>
            <el-button
              v-if="row.status !== AssertionAssetStatus.ARCHIVED"
              link
              type="warning"
              @click.stop="archive(row)"
            >
              归档
            </el-button>
            <el-button
              v-if="row.status === AssertionAssetStatus.DRAFT"
              link
              type="danger"
              @click.stop="deleteDraft(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="asset-pagination">
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
      v-model="dialogVisible"
      :title="dialogTitle"
      width="760px"
      class="asset-dialog"
      destroy-on-close
    >
      <el-form label-width="112px" :model="form">
        <el-form-item v-if="!form.id" label="断言 Key" required>
          <el-input v-model="form.assertionKey" placeholder="task_visible，例如小写字母和下划线" />
        </el-form-item>
        <el-form-item label="断言名称" required>
          <el-input v-model="form.assertionName" placeholder="例如：任务列表可见" />
        </el-form-item>
        <el-form-item label="断言类型" required>
          <el-select v-model="form.assertionType" style="width: 100%">
            <el-option
              v-for="type in assertionTypeOptions"
              :key="type"
              :label="AssertionAssetTypeLabel[type]"
              :value="type"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="参数 Schema">
          <el-input v-model="form.paramSchemaText" type="textarea" :rows="6" spellcheck="false" />
        </el-form-item>
        <el-form-item label="实现模板">
          <el-input
            v-model="form.implementationText"
            type="textarea"
            :rows="6"
            spellcheck="false"
          />
        </el-form-item>
        <el-form-item label="失败提示">
          <el-input v-model="form.failureMessageTpl" />
        </el-form-item>
        <el-form-item label="证据配置">
          <el-input
            v-model="form.evidenceConfigText"
            type="textarea"
            :rows="4"
            spellcheck="false"
          />
        </el-form-item>
        <el-form-item label="AI 推荐">
          <el-switch v-model="form.allowAiReuse" active-text="允许" inactive-text="关闭" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="断言详情" size="520px" class="asset-drawer">
      <div v-loading="detailLoading" class="asset-detail">
        <template v-if="currentAssertion">
          <div class="detail-heading">
            <h2>{{ currentAssertion.assertionName }}</h2>
            <span>{{ currentAssertion.assertionKey }}</span>
          </div>
          <div class="detail-status-row">
            <el-tag :type="getStatusColor(currentAssertion.status)" effect="light">
              {{ getStatusLabel(currentAssertion.status) }}
            </el-tag>
            <el-tag effect="light">{{ getTypeLabel(currentAssertion.assertionType) }}</el-tag>
            <el-tag
              :type="getValidationColor(currentAssertion.latestValidationStatus)"
              effect="light"
            >
              {{ getValidationLabel(currentAssertion.latestValidationStatus) }}
            </el-tag>
          </div>
          <p class="detail-desc">{{ currentAssertion.description || '暂无描述' }}</p>
          <div class="detail-section">
            <h3>参数 Schema</h3>
            <pre>{{ JSON.stringify(currentAssertion.paramSchema || {}, null, 2) }}</pre>
          </div>
          <div class="detail-section">
            <h3>实现模板</h3>
            <pre>{{ JSON.stringify(currentAssertion.implementation || {}, null, 2) }}</pre>
          </div>
          <div class="detail-section">
            <h3>引用关系</h3>
            <el-skeleton v-if="referenceLoading" :rows="3" animated />
            <div v-else-if="references.length === 0" class="detail-empty">暂无引用</div>
            <div v-else class="reference-list">
              <div v-for="ref in references" :key="ref.id" class="reference-item">
                <strong>{{ ref.sourceName || `${ref.sourceType} #${ref.sourceId}` }}</strong>
                <span>
                  {{ ref.impactLevel === 'INDIRECT' ? '间接影响' : '直接引用' }}
                  ·
                  {{ formatBeijingDateTime(ref.createdAt) }}
                </span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.assertion-page {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: var(--tp-space-4);
  box-sizing: border-box;
}

.asset-header,
.asset-filter,
.asset-table-panel,
.asset-state-panel {
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-lg);
  background: var(--tp-surface-card);
  box-shadow: var(--tp-shadow-sm);
}

.asset-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--tp-space-4);
  padding: var(--tp-space-5) var(--tp-space-6);
}

.asset-title {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--tp-space-1);
}

.asset-eyebrow {
  color: var(--tp-primary);
  font-size: 12px;
  font-weight: 700;
}

.asset-title h1 {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}

.asset-title p {
  margin: 0;
  color: var(--tp-text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.asset-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--tp-space-2);
}

.asset-actions .material-symbols-outlined,
.asset-filter .material-symbols-outlined {
  font-size: 18px;
}

.asset-filter {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 160px 180px auto auto;
  gap: var(--tp-space-3);
  padding: var(--tp-space-4);
}

.asset-table-panel {
  display: flex;
  min-height: 520px;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.asset-alert {
  margin: var(--tp-space-3) var(--tp-space-3) 0;
}

.asset-name-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.asset-name {
  overflow: hidden;
  color: var(--tp-text-primary);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-key,
.detail-heading span,
.detail-desc,
.detail-empty {
  color: var(--tp-text-muted);
  font-size: 12px;
}

.asset-boolean {
  color: var(--tp-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.asset-boolean.active {
  color: var(--tp-success);
}

.asset-pagination {
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

.asset-state-panel {
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

.asset-state-panel .material-symbols-outlined {
  color: var(--tp-primary);
  font-size: 44px;
}

.asset-state-panel h2 {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 20px;
}

.asset-state-panel p {
  max-width: 420px;
  margin: 0;
  color: var(--tp-text-muted);
  font-size: 14px;
  line-height: 1.7;
}

.asset-detail {
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

.detail-section pre {
  max-height: 220px;
  overflow: auto;
  margin: 0;
  padding: var(--tp-space-3);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  background: var(--tp-surface-muted);
  color: var(--tp-text-secondary);
  font-family: var(--tp-font-family-mono);
  font-size: 12px;
  line-height: 1.6;
}

.reference-list {
  display: flex;
  flex-direction: column;
  gap: var(--tp-space-2);
}

.reference-item {
  display: flex;
  justify-content: space-between;
  gap: var(--tp-space-3);
  padding: var(--tp-space-3);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  background: var(--tp-surface-muted);
}

.reference-item strong {
  color: var(--tp-text-primary);
  font-size: 13px;
}

.reference-item span {
  color: var(--tp-text-muted);
  font-size: 12px;
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

:global(.asset-dialog .el-dialog),
:global(.asset-drawer .el-drawer) {
  background: var(--tp-surface-card);
  color: var(--tp-text-primary);
}

:global(.asset-dialog .el-dialog__title),
:global(.asset-drawer .el-drawer__title) {
  color: var(--tp-text-primary);
  font-weight: 700;
}

@media (max-width: 980px) {
  .asset-header {
    flex-direction: column;
  }

  .asset-actions {
    justify-content: flex-start;
  }

  .asset-filter {
    grid-template-columns: 1fr 1fr;
  }

  .asset-keyword {
    grid-column: 1 / -1;
  }
}

@media (max-width: 640px) {
  .asset-filter {
    grid-template-columns: 1fr;
  }

  .asset-pagination {
    align-items: flex-start;
    flex-direction: column;
    padding: var(--tp-space-3) var(--tp-space-4);
  }
}
</style>
