<script setup lang="ts">
/**
 * AI 修复建议页（18.3）。
 *
 * 回归失败自动生成的修复 Diff 建议列表，人工确认后应用（走手工补丁通道，14.3 约束）或拒绝。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import { extractErrorMessage, isElMessageBoxCancel } from '@/utils/error'
import { formatBeijingDateTime } from '@/utils/time'
import {
  RepairSuggestionStatus,
  RepairSuggestionStatusColor,
  RepairSuggestionStatusLabel,
  applyRepairSuggestion,
  fetchRepairSuggestionDetail,
  fetchRepairSuggestions,
  rejectRepairSuggestion,
  type RepairSuggestion,
} from '@/api/aiRegression'

const route = useRoute()
const projectStore = useProjectStore()
const projectId = computed(() => projectStore.selectedProjectId)
const hasProject = computed(() => Boolean(projectId.value))

const suggestions = ref<RepairSuggestion[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const statusFilter = ref<RepairSuggestionStatus | ''>('')

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<RepairSuggestion | null>(null)
const applying = ref(false)
const rejecting = ref(false)
const diffView = ref<'diff' | 'patched'>('diff')

async function fetchList(targetPage = page.value) {
  if (!projectId.value) {
    suggestions.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const result = await fetchRepairSuggestions({
      projectId: projectId.value,
      status: statusFilter.value,
      pageNo: targetPage,
      pageSize: pageSize.value,
    })
    suggestions.value = result.list
    total.value = result.total
    page.value = targetPage
  } catch (error: unknown) {
    ElMessage.error(extractErrorMessage(error, '加载修复建议失败'))
  } finally {
    loading.value = false
  }
}

async function changePage(targetPage: number) {
  await fetchList(targetPage)
}

async function changePageSize(size: number) {
  pageSize.value = size
  await fetchList(1)
}

async function openDetail(suggestionId: number) {
  if (!projectId.value) return
  detailVisible.value = true
  detailLoading.value = true
  diffView.value = 'diff'
  detail.value = null
  try {
    detail.value = await fetchRepairSuggestionDetail(suggestionId, projectId.value)
  } catch (error: unknown) {
    ElMessage.error(extractErrorMessage(error, '加载修复建议详情失败'))
    detailVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

async function applySuggestion() {
  if (!projectId.value || !detail.value) return
  try {
    await ElMessageBox.confirm(
      '确认应用此修复建议？应用后将通过手工补丁通道更新编排代码，需重新验证后再发布。',
      '应用修复建议',
      { type: 'warning', confirmButtonText: '确认应用', cancelButtonText: '取消' },
    )
  } catch (error: unknown) {
    if (isElMessageBoxCancel(error)) return
    throw error
  }
  applying.value = true
  try {
    await applyRepairSuggestion(detail.value.id, projectId.value)
    ElMessage.success('修复建议已应用，请前往编排工作台重新验证')
    detailVisible.value = false
    await fetchList(page.value)
  } catch (error: unknown) {
    ElMessage.error(extractErrorMessage(error, '应用修复建议失败'))
  } finally {
    applying.value = false
  }
}

async function rejectSuggestion() {
  if (!projectId.value || !detail.value) return
  try {
    await ElMessageBox.confirm('确认拒绝此修复建议？', '拒绝修复建议', {
      type: 'warning',
      confirmButtonText: '拒绝',
      cancelButtonText: '取消',
    })
  } catch (error: unknown) {
    if (isElMessageBoxCancel(error)) return
    throw error
  }
  rejecting.value = true
  try {
    await rejectRepairSuggestion(detail.value.id, projectId.value)
    ElMessage.success('修复建议已拒绝')
    detailVisible.value = false
    await fetchList(page.value)
  } catch (error: unknown) {
    ElMessage.error(extractErrorMessage(error, '拒绝修复建议失败'))
  } finally {
    rejecting.value = false
  }
}

function statusLabel(status: RepairSuggestion['status']) {
  return RepairSuggestionStatusLabel[status] || status
}

function statusColor(status: RepairSuggestion['status']) {
  return RepairSuggestionStatusColor[status] || 'info'
}

watch(projectId, () => {
  page.value = 1
  fetchList(1)
})

onMounted(async () => {
  await fetchList(1)
  const suggestionId = Number(route.query.suggestion_id)
  if (suggestionId > 0 && projectId.value) {
    await openDetail(suggestionId)
  }
})
</script>

<template>
  <div class="repair-page">
    <section class="repair-header">
      <div class="repair-title">
        <span class="repair-eyebrow">测试智编资产</span>
        <h1>AI 修复建议</h1>
        <p>回归失败自动生成修复 Diff，仅建议不自动应用，需人工确认后走手工补丁通道更新编排。</p>
      </div>
      <div class="repair-actions">
        <el-select
          v-model="statusFilter"
          clearable
          placeholder="建议状态"
          style="width: 150px"
          @change="fetchList(1)"
        >
          <el-option
            v-for="(label, status) in RepairSuggestionStatusLabel"
            :key="status"
            :label="label"
            :value="status"
          />
        </el-select>
        <el-button :disabled="loading || !hasProject" @click="fetchList(page)">
          <span class="material-symbols-outlined">refresh</span>
          刷新
        </el-button>
      </div>
    </section>

    <section v-if="!hasProject" class="repair-state-panel">
      <span class="material-symbols-outlined">build</span>
      <h2>请选择项目</h2>
      <p>修复建议按项目隔离管理，选择项目后查看回归失败的修复 Diff。</p>
    </section>

    <section v-else class="repair-table-panel">
      <el-table
        v-loading="loading"
        :data="suggestions"
        height="100%"
        empty-text="暂无修复建议"
        row-key="id"
        @row-click="(row: RepairSuggestion) => openDetail(row.id)"
      >
        <el-table-column label="编排" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.compositionName || `编排 #${row.compositionId}` }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="statusColor(row.status)" effect="light" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="建议摘要" min-width="280" show-overflow-tooltip>
          <template #default="{ row }">{{ row.summary || row.errorMessage || '-' }}</template>
        </el-table-column>
        <el-table-column label="模型" width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.model || '-' }}</template>
        </el-table-column>
        <el-table-column label="生成时间" width="160">
          <template #default="{ row }">{{ formatBeijingDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="openDetail(row.id)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="repair-pagination">
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
      v-model="detailVisible"
      title="修复建议详情"
      width="860px"
      class="repair-dialog"
      destroy-on-close
    >
      <div v-loading="detailLoading" class="repair-detail">
        <template v-if="detail">
          <div class="repair-detail-meta">
            <el-tag :type="statusColor(detail.status)" effect="light" size="small">
              {{ statusLabel(detail.status) }}
            </el-tag>
            <span>{{ detail.compositionName || `编排 #${detail.compositionId}` }}</span>
            <span v-if="detail.model" class="repair-meta-muted">模型：{{ detail.model }}</span>
            <span v-if="detail.totalTokens" class="repair-meta-muted">
              Tokens：{{ detail.totalTokens }}
            </span>
          </div>
          <p class="repair-detail-summary">{{ detail.summary || '-' }}</p>
          <el-alert
            v-if="detail.errorMessage"
            type="error"
            :title="detail.errorMessage"
            show-icon
            :closable="false"
          />
          <el-radio-group v-model="diffView" size="small">
            <el-radio-button value="diff">Diff</el-radio-button>
            <el-radio-button value="patched">修复后全文</el-radio-button>
          </el-radio-group>
          <pre class="repair-code">{{
            diffView === 'diff'
              ? detail.diffContent || '（无 Diff 内容）'
              : detail.patchedCode || '（无补丁内容）'
          }}</pre>
        </template>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <template v-if="detail && detail.status === RepairSuggestionStatus.PENDING">
          <el-button type="danger" :loading="rejecting" @click="rejectSuggestion">拒绝</el-button>
          <el-button type="primary" :loading="applying" @click="applySuggestion">
            确认应用
          </el-button>
        </template>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.repair-page {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: var(--tp-space-4);
  box-sizing: border-box;
}

.repair-header,
.repair-table-panel,
.repair-state-panel {
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-lg);
  background: var(--tp-surface-card);
  box-shadow: var(--tp-shadow-sm);
}

.repair-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--tp-space-4);
  padding: var(--tp-space-5) var(--tp-space-6);
}

.repair-title {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--tp-space-1);
}

.repair-eyebrow {
  color: var(--tp-primary);
  font-size: 12px;
  font-weight: 700;
}

.repair-title h1 {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}

.repair-title p {
  margin: 0;
  color: var(--tp-text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.repair-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--tp-space-2);
}

.repair-actions .material-symbols-outlined {
  font-size: 18px;
}

.repair-table-panel {
  display: flex;
  min-height: 520px;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.repair-pagination {
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

.repair-state-panel {
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

.repair-state-panel .material-symbols-outlined {
  color: var(--tp-primary);
  font-size: 44px;
}

.repair-state-panel h2 {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 20px;
}

.repair-state-panel p {
  max-width: 420px;
  margin: 0;
  color: var(--tp-text-muted);
  font-size: 14px;
  line-height: 1.7;
}

.repair-detail {
  display: flex;
  min-height: 200px;
  flex-direction: column;
  gap: var(--tp-space-3);
}

.repair-detail-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--tp-space-3);
  color: var(--tp-text-primary);
  font-size: 13px;
  font-weight: 700;
}

.repair-meta-muted {
  color: var(--tp-text-muted);
  font-weight: 400;
}

.repair-detail-summary {
  margin: 0;
  color: var(--tp-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.repair-code {
  max-height: 420px;
  margin: 0;
  padding: var(--tp-space-3);
  overflow: auto;
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  background: var(--tp-surface-muted);
  color: var(--tp-text-primary);
  font-family: var(--tp-font-mono, monospace);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
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

:global(.repair-dialog .el-dialog) {
  background: var(--tp-surface-card);
  color: var(--tp-text-primary);
}

@media (max-width: 980px) {
  .repair-header {
    flex-direction: column;
  }

  .repair-actions {
    justify-content: flex-start;
  }
}
</style>
