<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getReview, listReviewItems, linkItems, unlinkItems,
  submitItemReview, batchReview, batchReassign, batchResubmit,
  listItemRecords,
  type CaseReview, type CaseReviewItem, type CaseReviewRecord,
  type ReviewItemListParams
} from '@/api/caseReview'
import { apiClient } from '@/api/client'

const props = defineProps<{
  projectId: number
  reviewId: number
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'updated'): void
}>()

// ── 状态 ──
const review = ref<CaseReview | null>(null)
const items = ref<CaseReviewItem[]>([])
const itemTotal = ref(0)
const itemPage = ref(1)
const itemPageSize = ref(20)
const itemKeyword = ref('')
const itemFilterResult = ref('')
const loading = ref(false)
const selectedItems = ref<CaseReviewItem[]>([])

// ── 评审记录 ──
const recordDrawerVisible = ref(false)
const recordDrawerItem = ref<CaseReviewItem | null>(null)
const records = ref<CaseReviewRecord[]>([])
const recordsLoading = ref(false)

// ── 评审提交 ──
const reviewDialogVisible = ref(false)
const reviewingItem = ref<CaseReviewItem | null>(null)
const reviewForm = ref({ result: 'approved', comment: '' })
const submitting = ref(false)

// ── 关联用例 ──
const linkDialogVisible = ref(false)
const linkCases = ref<number[]>([])
const availableCases = ref<{ id: number; title: string }[]>([])
const linkLoading = ref(false)

// ── 用户列表（批量改评审人用）──
const allUsers = ref<{ id: number; name: string }[]>([])
const reassignDialogVisible = ref(false)
const reassignReviewerIds = ref<number[]>([])

// ── 加载数据 ──
async function fetchReview() {
  try {
    const resp = await getReview(props.projectId, props.reviewId)
    review.value = resp
  } catch { /* ignore */ }
}

async function fetchItems() {
  loading.value = true
  try {
    const params: ReviewItemListParams = {
      page: itemPage.value,
      pageSize: itemPageSize.value,
    }
    if (itemKeyword.value) params.keyword = itemKeyword.value
    if (itemFilterResult.value) params.final_result = itemFilterResult.value
    const resp = await listReviewItems(props.projectId, props.reviewId, params)
    items.value = resp.items || []
    itemTotal.value = resp.total
  } catch { /* ignore */ } finally {
    loading.value = false
  }
}

async function fetchUsers() {
  try {
    const { data } = await apiClient.get<{ items: { id: number; name: string; email: string }[] }>('/users', { params: { page: 1, pageSize: 200 } })
    allUsers.value = data.items || []
  } catch { /* ignore */ }
}

async function fetchAvailableCases() {
  try {
    const { data } = await apiClient.get<{ items: { id: number; title: string }[] }>(
      `/projects/${props.projectId}/testcases`,
      { params: { page: 1, pageSize: 500 } }
    )
    availableCases.value = data.items || []
  } catch { /* ignore */ }
}

onMounted(() => {
  fetchReview()
  fetchItems()
  fetchUsers()
})

watch(() => [itemPage.value, itemPageSize.value], () => fetchItems())

// ── 格式辅助 ──
function statusLabel(s: string) {
  return { not_started: '未开始', in_progress: '进行中', completed: '已完成', closed: '已关闭' }[s] || s
}
function statusClass(s: string) {
  return { not_started: 'info', in_progress: 'warning', completed: 'success', closed: 'danger' }[s] || 'info'
}
function resultLabel(r: string) {
  return { pending: '待评审', approved: '通过', rejected: '拒绝', needs_update: '建议修改' }[r] || r
}
function resultClass(r: string) {
  return { pending: 'pending', approved: 'approved', rejected: 'rejected', needs_update: 'needs-update' }[r] || ''
}
function formatDate(d: string) {
  if (!d) return '-'
  return new Date(d).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
const isActive = computed(() => review.value && review.value.status !== 'closed' && review.value.status !== 'completed')

// ── 关联用例 ──
async function openLinkDialog() {
  await fetchAvailableCases()
  linkCases.value = []
  linkDialogVisible.value = true
}

async function handleLink() {
  if (linkCases.value.length === 0) return
  linkLoading.value = true
  try {
    const entries = linkCases.value.map(id => ({ testcase_id: id }))
    await linkItems(props.projectId, props.reviewId, entries, true)
    ElMessage.success(`已关联 ${linkCases.value.length} 条用例`)
    linkDialogVisible.value = false
    fetchReview()
    fetchItems()
    emit('updated')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '关联失败')
  } finally {
    linkLoading.value = false
  }
}

// ── 移除用例 ──
async function handleUnlink(item: CaseReviewItem) {
  try {
    await ElMessageBox.confirm(`确定移除用例「${item.title_snapshot}」？`, '移除确认', { type: 'warning' })
    await unlinkItems(props.projectId, props.reviewId, [item.id])
    ElMessage.success('已移除')
    fetchReview()
    fetchItems()
    emit('updated')
  } catch { /* cancelled */ }
}

// ── 单条评审 ──
function openReviewDialog(item: CaseReviewItem) {
  reviewingItem.value = item
  reviewForm.value = { result: 'approved', comment: '' }
  reviewDialogVisible.value = true
}

async function handleSubmitReview() {
  if (!reviewingItem.value) return
  submitting.value = true
  try {
    await submitItemReview(
      props.projectId, props.reviewId, reviewingItem.value.id,
      reviewForm.value.result, reviewForm.value.comment
    )
    ElMessage.success('评审提交成功')
    reviewDialogVisible.value = false
    fetchReview()
    fetchItems()
    emit('updated')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '提交失败')
  } finally {
    submitting.value = false
  }
}

// ── 批量评审 ──
async function handleBatchReview(result: string) {
  const ids = selectedItems.value.map(i => i.id)
  if (ids.length === 0) return ElMessage.warning('请先选择评审项')
  try {
    const resp = await batchReview(props.projectId, props.reviewId, ids, result, '')
    ElMessage.success(`批量评审完成：成功 ${resp.success_count}，失败 ${resp.fail_count}`)
    fetchReview()
    fetchItems()
    emit('updated')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '批量评审失败')
  }
}

// ── 批量重新提审 ──
async function handleBatchResubmit() {
  const ids = selectedItems.value.map(i => i.id)
  if (ids.length === 0) return ElMessage.warning('请先选择评审项')
  try {
    await batchResubmit(props.projectId, props.reviewId, ids)
    ElMessage.success('已重新提审')
    fetchReview()
    fetchItems()
    emit('updated')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '重新提审失败')
  }
}

// ── 批量改评审人 ──
function openReassignDialog() {
  if (selectedItems.value.length === 0) return ElMessage.warning('请先选择评审项')
  reassignReviewerIds.value = []
  reassignDialogVisible.value = true
}

async function handleReassign() {
  const ids = selectedItems.value.map(i => i.id)
  try {
    await batchReassign(props.projectId, props.reviewId, ids, reassignReviewerIds.value)
    ElMessage.success('已更换评审人')
    reassignDialogVisible.value = false
    fetchItems()
    emit('updated')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '更换失败')
  }
}

// ── 查看评审记录 ──
async function openRecordDrawer(item: CaseReviewItem) {
  recordDrawerItem.value = item
  recordsLoading.value = true
  recordDrawerVisible.value = true
  try {
    const resp = await listItemRecords(props.projectId, props.reviewId, item.id, { page: 1, pageSize: 50 })
    records.value = resp.items || []
  } catch { /* ignore */ } finally {
    recordsLoading.value = false
  }
}

function handleSelectionChange(rows: CaseReviewItem[]) {
  selectedItems.value = rows
}
</script>

<template>
  <div class="review-detail-page">
    <!-- 返回 + 标题栏 -->
    <div class="detail-topbar">
      <button class="back-btn" @click="emit('back')">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <div class="topbar-info" v-if="review">
        <h2 class="review-title">{{ review.name }}</h2>
        <div class="topbar-tags">
          <span class="tag-status" :class="statusClass(review.status)">{{ statusLabel(review.status) }}</span>
          <span class="tag-mode">{{ review.review_mode === 'parallel' ? '会签' : '独审' }}</span>
        </div>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-row" v-if="review">
      <div class="stat-card">
        <span class="material-symbols-outlined stat-icon total">folder_open</span>
        <div class="stat-body">
          <div class="stat-val">{{ review.case_total_count }}</div>
          <div class="stat-lbl">关联用例</div>
        </div>
      </div>
      <div class="stat-card approved">
        <span class="material-symbols-outlined stat-icon">check_circle</span>
        <div class="stat-body">
          <div class="stat-val">{{ review.approved_count }}</div>
          <div class="stat-lbl">通过</div>
        </div>
      </div>
      <div class="stat-card rejected">
        <span class="material-symbols-outlined stat-icon">cancel</span>
        <div class="stat-body">
          <div class="stat-val">{{ review.rejected_count }}</div>
          <div class="stat-lbl">拒绝</div>
        </div>
      </div>
      <div class="stat-card pending">
        <span class="material-symbols-outlined stat-icon">hourglass_top</span>
        <div class="stat-body">
          <div class="stat-val">{{ review.pending_count }}</div>
          <div class="stat-lbl">待评审</div>
        </div>
      </div>
      <div class="stat-card rate">
        <span class="material-symbols-outlined stat-icon">speed</span>
        <div class="stat-body">
          <div class="stat-val">{{ review.case_total_count > 0 ? review.pass_rate.toFixed(1) + '%' : '-' }}</div>
          <div class="stat-lbl">通过率</div>
        </div>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="items-toolbar">
      <div class="toolbar-left">
        <el-input v-model="itemKeyword" placeholder="搜索用例" clearable style="width:200px" @keyup.enter="fetchItems">
          <template #prefix><span class="material-symbols-outlined" style="font-size:16px">search</span></template>
        </el-input>
        <el-select v-model="itemFilterResult" placeholder="结果筛选" clearable style="width:120px" @change="fetchItems">
          <el-option label="待评审" value="pending" />
          <el-option label="通过" value="approved" />
          <el-option label="拒绝" value="rejected" />
          <el-option label="建议修改" value="needs_update" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <template v-if="selectedItems.length > 0">
          <el-button type="success" size="small" @click="handleBatchReview('approved')">
            <span class="material-symbols-outlined" style="font-size:16px;margin-right:4px">thumb_up</span>批量通过
          </el-button>
          <el-button type="danger" size="small" @click="handleBatchReview('rejected')">
            <span class="material-symbols-outlined" style="font-size:16px;margin-right:4px">thumb_down</span>批量拒绝
          </el-button>
          <el-button size="small" @click="handleBatchResubmit">
            <span class="material-symbols-outlined" style="font-size:16px;margin-right:4px">replay</span>重新提审
          </el-button>
          <el-button size="small" @click="openReassignDialog">
            <span class="material-symbols-outlined" style="font-size:16px;margin-right:4px">swap_horiz</span>改评审人
          </el-button>
        </template>
        <el-button v-if="isActive" type="primary" @click="openLinkDialog">
          <span class="material-symbols-outlined" style="font-size:16px;margin-right:4px">add_link</span>关联用例
        </el-button>
      </div>
    </div>

    <!-- 评审项表格 -->
    <el-table
      :data="items" v-loading="loading" row-key="id"
      class="items-table" @selection-change="handleSelectionChange"
      @row-click="openRecordDrawer"
    >
      <el-table-column type="selection" width="40" />
      <el-table-column prop="testcase_id" label="用例ID" width="80" align="center">
        <template #default="{ row }">
          <span class="id-badge">#{{ row.testcase_id }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="title_snapshot" label="用例名称" min-width="200">
        <template #default="{ row }">
          <span class="case-title">{{ row.title_snapshot }}</span>
        </template>
      </el-table-column>
      <el-table-column label="评审结果" width="110" align="center">
        <template #default="{ row }">
          <span class="result-badge" :class="resultClass(row.final_result)">{{ resultLabel(row.final_result) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="轮次" width="60" align="center">
        <template #default="{ row }">
          <span class="round-num">R{{ row.current_round_no }}</span>
        </template>
      </el-table-column>
      <el-table-column label="评审人" width="150">
        <template #default="{ row }">
          <div class="reviewer-avatars" v-if="row.reviewers && row.reviewers.length">
            <span v-for="r in row.reviewers" :key="r.id"
              class="reviewer-chip" :class="{ reviewed: r.review_status === 'reviewed' }"
              :title="r.reviewer_name || `ID:${r.reviewer_id}`"
            >
              <span class="material-symbols-outlined" style="font-size:14px">{{
                r.review_status === 'reviewed' ? (r.latest_result === 'approved' ? 'check' : r.latest_result === 'rejected' ? 'close' : 'edit') : 'schedule'
              }}</span>
            </span>
          </div>
          <span v-else class="no-reviewer">-</span>
        </template>
      </el-table-column>
      <el-table-column label="最新评论" min-width="150">
        <template #default="{ row }">
          <span class="comment-text">{{ row.latest_comment || '-' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" align="center" fixed="right">
        <template #default="{ row }">
          <div class="action-btns" @click.stop>
            <button class="act-btn review" title="评审" @click="openReviewDialog(row)" v-if="isActive">
              <span class="material-symbols-outlined">rate_review</span>
            </button>
            <button class="act-btn record" title="评审记录" @click="openRecordDrawer(row)">
              <span class="material-symbols-outlined">history</span>
            </button>
            <button class="act-btn delete" title="移除" @click="handleUnlink(row)" v-if="isActive && row.final_result === 'pending'">
              <span class="material-symbols-outlined">link_off</span>
            </button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pagination-bar" v-if="itemTotal > 0">
      <el-pagination
        v-model:current-page="itemPage"
        v-model:page-size="itemPageSize"
        :total="itemTotal"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
      />
    </div>

    <!-- 关联用例对话框 -->
    <el-dialog v-model="linkDialogVisible" title="关联用例" width="560px" destroy-on-close class="link-dialog">
      <el-select v-model="linkCases" multiple filterable placeholder="搜索并选择用例" style="width:100%">
        <el-option v-for="c in availableCases" :key="c.id" :label="`#${c.id} ${c.title}`" :value="c.id" />
      </el-select>
      <template #footer>
        <el-button @click="linkDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="linkLoading" @click="handleLink">确定关联</el-button>
      </template>
    </el-dialog>

    <!-- 评审提交对话框 -->
    <el-dialog v-model="reviewDialogVisible" title="提交评审" width="480px" destroy-on-close class="review-submit-dialog">
      <div class="review-target" v-if="reviewingItem">
        <span class="id-badge">#{{ reviewingItem.testcase_id }}</span>
        <span class="case-name">{{ reviewingItem.title_snapshot }}</span>
      </div>
      <el-form label-position="top">
        <el-form-item label="评审结果" required>
          <el-radio-group v-model="reviewForm.result" class="result-radio-group">
            <el-radio-button value="approved">
              <span class="result-opt approved"><span class="material-symbols-outlined" style="font-size:16px">thumb_up</span> 通过</span>
            </el-radio-button>
            <el-radio-button value="rejected">
              <span class="result-opt rejected"><span class="material-symbols-outlined" style="font-size:16px">thumb_down</span> 拒绝</span>
            </el-radio-button>
            <el-radio-button value="needs_update">
              <span class="result-opt needs-update"><span class="material-symbols-outlined" style="font-size:16px">edit_note</span> 建议修改</span>
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="评审意见">
          <el-input v-model="reviewForm.comment" type="textarea" :rows="4" placeholder="输入评审意见（可选）" maxlength="1000" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reviewDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmitReview">提交评审</el-button>
      </template>
    </el-dialog>

    <!-- 批量改评审人对话框 -->
    <el-dialog v-model="reassignDialogVisible" title="更换评审人" width="480px" destroy-on-close>
      <el-select v-model="reassignReviewerIds" multiple filterable placeholder="选择新评审人" style="width:100%">
        <el-option v-for="u in allUsers" :key="u.id" :label="u.name" :value="u.id" />
      </el-select>
      <template #footer>
        <el-button @click="reassignDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleReassign" :disabled="reassignReviewerIds.length === 0">确认更换</el-button>
      </template>
    </el-dialog>

    <!-- 评审记录抽屉 -->
    <el-drawer v-model="recordDrawerVisible" :title="`评审记录 - ${recordDrawerItem?.title_snapshot || ''}`" direction="rtl" size="420px">
      <div v-loading="recordsLoading">
        <div v-if="records.length === 0 && !recordsLoading" class="empty-records">
          <span class="material-symbols-outlined" style="font-size:40px;color:var(--tp-gray-500)">history</span>
          <p>暂无评审记录</p>
        </div>
        <div class="record-timeline" v-else>
          <div v-for="rec in records" :key="rec.id" class="record-item">
            <div class="record-header">
              <span class="result-badge" :class="resultClass(rec.result)">{{ resultLabel(rec.result) }}</span>
              <span class="record-round">R{{ rec.round_no }}</span>
              <span class="record-time">{{ formatDate(rec.created_at) }}</span>
            </div>
            <div class="record-comment" v-if="rec.comment">{{ rec.comment }}</div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.review-detail-page {
  padding: 0;
}

/* ── 顶部栏 ── */
.detail-topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 0 12px;
  border-bottom: 1px solid var(--tp-border);
  margin-bottom: 16px;
}
.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--tp-border);
  border-radius: 8px;
  background: var(--tp-surface-card);
  color: var(--tp-gray-400);
  cursor: pointer;
  transition: all 0.2s;
}
.back-btn:hover {
  color: var(--tp-primary);
  border-color: var(--tp-primary);
}
.review-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--tp-gray-100);
  margin: 0 0 4px;
}
.topbar-tags {
  display: flex;
  gap: 8px;
}
.tag-status, .tag-mode {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
}
.tag-status.info { background: rgba(108,117,125,0.15); color: #6c757d; }
.tag-status.warning { background: rgba(245,158,11,0.15); color: #F59E0B; }
.tag-status.success { background: rgba(16,185,129,0.15); color: #10B981; }
.tag-status.danger { background: rgba(239,68,68,0.15); color: #EF4444; }
.tag-mode { background: rgba(124,58,237,0.12); color: var(--tp-primary-light, #a78bfa); }

/* ── 统计卡片 ── */
.stats-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.stat-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--tp-surface-card);
  border: 1px solid var(--tp-border);
  border-radius: 10px;
  transition: border-color 0.2s;
}
.stat-card:hover { border-color: var(--tp-border-hover, rgba(255,255,255,0.12)); }
.stat-icon {
  font-size: 22px;
  padding: 8px;
  border-radius: 8px;
  background: rgba(124,58,237,0.1);
  color: var(--tp-primary);
}
.stat-card.approved .stat-icon { background: rgba(16,185,129,0.1); color: #10B981; }
.stat-card.rejected .stat-icon { background: rgba(239,68,68,0.1); color: #EF4444; }
.stat-card.pending .stat-icon { background: rgba(245,158,11,0.1); color: #F59E0B; }
.stat-card.rate .stat-icon { background: rgba(59,130,246,0.1); color: #3B82F6; }
.stat-val { font-size: 20px; font-weight: 700; color: var(--tp-gray-100); }
.stat-lbl { font-size: 12px; color: var(--tp-gray-500); margin-top: 2px; }

/* ── 工具栏 ── */
.items-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
}
.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── 表格 ── */
.items-table {
  border-radius: 8px;
  overflow: hidden;
}
.id-badge {
  display: inline-block;
  background: rgba(124,58,237,0.12);
  color: var(--tp-primary-light, #a78bfa);
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
}
.case-title { color: var(--tp-gray-200); font-weight: 500; }
.result-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}
.result-badge.pending { background: rgba(108,117,125,0.12); color: #6c757d; }
.result-badge.approved { background: rgba(16,185,129,0.12); color: #10B981; }
.result-badge.rejected { background: rgba(239,68,68,0.12); color: #EF4444; }
.result-badge.needs-update { background: rgba(245,158,11,0.12); color: #F59E0B; }
.round-num {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  color: var(--tp-gray-400);
  background: rgba(255,255,255,0.05);
  padding: 2px 6px;
  border-radius: 4px;
}
.reviewer-avatars { display: flex; gap: 4px; flex-wrap: wrap; }
.reviewer-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(108,117,125,0.15);
  color: #6c757d;
  font-size: 14px;
}
.reviewer-chip.reviewed { background: rgba(16,185,129,0.15); color: #10B981; }
.no-reviewer { color: var(--tp-gray-600); }
.comment-text {
  font-size: 13px;
  color: var(--tp-gray-400);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
}
.action-btns { display: flex; gap: 6px; justify-content: center; }
.act-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: 1px solid var(--tp-border);
  background: transparent;
  color: var(--tp-gray-400);
  cursor: pointer;
  transition: all 0.2s;
}
.act-btn .material-symbols-outlined { font-size: 16px; }
.act-btn.review:hover { color: var(--tp-primary); border-color: var(--tp-primary); }
.act-btn.record:hover { color: #3B82F6; border-color: #3B82F6; }
.act-btn.delete:hover { color: #EF4444; border-color: #EF4444; }

/* ── 分页 ── */
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  padding: 12px 0;
}

/* ── 评审提交对话框 ── */
.review-target {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--tp-surface-card);
  border: 1px solid var(--tp-border);
  border-radius: 8px;
  margin-bottom: 16px;
}
.case-name { color: var(--tp-gray-200); font-weight: 500; }
.result-radio-group { display: flex; gap: 4px; }
.result-opt { display: inline-flex; align-items: center; gap: 4px; font-weight: 500; }
.result-opt.approved { color: #10B981; }
.result-opt.rejected { color: #EF4444; }
.result-opt.needs-update { color: #F59E0B; }

/* ── 评审记录 ── */
.empty-records {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  color: var(--tp-gray-500);
  gap: 8px;
}
.record-timeline {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 0;
}
.record-item {
  padding: 12px 14px;
  background: var(--tp-surface-card);
  border: 1px solid var(--tp-border);
  border-radius: 8px;
}
.record-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.record-round { font-size: 12px; color: var(--tp-gray-500); font-weight: 600; }
.record-time { font-size: 12px; color: var(--tp-gray-600); margin-left: auto; }
.record-comment { font-size: 13px; color: var(--tp-gray-300); line-height: 1.5; }
</style>
