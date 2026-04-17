<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getReview, listReviewItems, linkItems, unlinkItems,
  submitItemReview, batchReview, batchReassign, batchResubmit,
  listItemRecords,
  type CaseReview, type CaseReviewItem, type CaseReviewRecord,
  type ReviewItemListParams
} from '@/api/caseReview'
import {
  uploadReviewAttachment, listReviewAttachmentsByItem,
  deleteReviewAttachment, downloadReviewAttachment,
  type CaseReviewAttachment,
} from '@/api/caseReviewAttachment'
import { apiClient } from '@/api/client'
import { useProjectStore } from '@/stores/project'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()

const reviewId = computed(() => Number(route.params.reviewId) || 0)
const projectId = computed(() => projectStore.selectedProjectId || 0)

function goBack() {
  router.push('/case-reviews')
}

// ── 状态 ──
const review = ref<CaseReview | null>(null)
const items = ref<CaseReviewItem[]>([])
const itemTotal = ref(0)
const itemPage = ref(1)
const itemPageSize = ref(50)
const loading = ref(false)
const submitting = ref(false)

const currentItemIndex = ref(0)
const currentItem = computed(() => items.value[currentItemIndex.value] || null)

const reviewDecision = ref<'approved' | 'rejected' | 'needs_update'>('approved')
const reviewComment = ref('')

const isActive = computed(() => review.value?.status === 'in_progress' || review.value?.status === 'not_started')

// 用户列表
const allUsers = ref<{ id: number; name: string }[]>([])
// 可用用例列表
const availableCases = ref<{ id: number; title: string }[]>([])

// 关联对话框
const linkDialogVisible = ref(false)
const linkCases = ref<number[]>([])
const linkLoading = ref(false)

// 重新分配
const reassignDialogVisible = ref(false)
const reassignReviewerIds = ref<number[]>([])

// 评审记录（主区域内嵌 + drawer 共用同一份数据）
const recordDrawerVisible = ref(false)
const records = ref<CaseReviewRecord[]>([])
const recordsLoading = ref(false)
const recordDrawerItem = ref<CaseReviewItem | null>(null)

// 加载当前评审项的历史记录，供左栏时间线展示
async function loadCurrentItemRecords() {
  if (!projectId.value || !reviewId.value || !currentItem.value) {
    records.value = []
    return
  }
  recordsLoading.value = true
  try {
    const resp = await listItemRecords(
      projectId.value,
      reviewId.value,
      currentItem.value.id,
      { page: 1, pageSize: 50 },
    )
    records.value = resp.items || []
  } catch {
    records.value = []
  } finally {
    recordsLoading.value = false
  }
}

// 评审附件
const attachments = ref<CaseReviewAttachment[]>([])
const attachmentsLoading = ref(false)
const attachmentUploading = ref(false)
const attachmentInputRef = ref<HTMLInputElement | null>(null)

async function loadAttachments() {
  if (!projectId.value || !reviewId.value || !currentItem.value) {
    attachments.value = []
    return
  }
  attachmentsLoading.value = true
  try {
    attachments.value = await listReviewAttachmentsByItem(
      projectId.value,
      reviewId.value,
      currentItem.value.id,
    )
  } catch {
    attachments.value = []
  } finally {
    attachmentsLoading.value = false
  }
}

function triggerAttachmentUpload() {
  attachmentInputRef.value?.click()
}

async function onAttachmentFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  if (!currentItem.value) {
    ElMessage.warning('请先选择评审用例')
    target.value = ''
    return
  }
  attachmentUploading.value = true
  try {
    await uploadReviewAttachment(
      projectId.value,
      reviewId.value,
      currentItem.value.id,
      file,
    )
    ElMessage.success('上传成功')
    await loadAttachments()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '上传失败')
  } finally {
    attachmentUploading.value = false
    target.value = ''
  }
}

async function handleDeleteAttachment(att: CaseReviewAttachment) {
  try {
    await ElMessageBox.confirm(`确定删除附件「${att.file_name}」？`, '提示', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await deleteReviewAttachment(projectId.value, att.id)
    ElMessage.success('已删除')
    await loadAttachments()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '删除失败')
  }
}

async function handleDownloadAttachment(att: CaseReviewAttachment) {
  try {
    const blob = await downloadReviewAttachment(projectId.value, att.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = att.file_name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '下载失败')
  }
}

function formatFileSize(size: number) {
  if (!size) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

// 批量选中
const selectedItems = ref<CaseReviewItem[]>([])

// ── 加载数据 ──
async function fetchReview() {
  try {
    const resp = await getReview(projectId.value, reviewId.value)
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
    const resp = await listReviewItems(projectId.value, reviewId.value, params)
    items.value = resp.items || []
    itemTotal.value = resp.total
  } catch { /* ignore */ } finally {
    loading.value = false
  }
}

async function fetchUsers() {
  try {
    const { data } = await apiClient.get<{ items: { id: number; name: string }[] }>('/users', { params: { page: 1, pageSize: 200 } })
    allUsers.value = data.items || []
  } catch { /* ignore */ }
}

async function fetchAvailableCases() {
  try {
    const { data } = await apiClient.get<{ items: { id: number; title: string }[] }>(
      `/projects/${projectId.value}/testcases`,
      { params: { page: 1, pageSize: 500 } }
    )
    availableCases.value = data.items || []
  } catch { /* ignore */ }
}

// ── 辅助函数 ──
function resultClass(result: string) {
  if (result === 'approved') return 'approved'
  if (result === 'rejected') return 'rejected'
  if (result === 'needs_update') return 'needs-update'
  return 'pending'
}
function resultLabel(result: string) {
  const map: Record<string, string> = {
    pending: '待评审', approved: '通过', rejected: '拒绝', needs_update: '需修改'
  }
  return map[result] || result
}
function statusLabel(status: string) {
  const map: Record<string, string> = {
    not_started: '未开始', in_progress: '进行中', completed: '已完成', closed: '已关闭'
  }
  return map[status] || status
}
function formatDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
}

// ── 导航 ──
function goNextItem() {
  if (currentItemIndex.value < items.value.length - 1) currentItemIndex.value++
}
function goPrevItem() {
  if (currentItemIndex.value > 0) currentItemIndex.value--
}

// ── 关联用例 ──
function openLinkDialog() {
  linkCases.value = []
  linkDialogVisible.value = true
  fetchAvailableCases()
}
async function handleLink() {
  if (linkCases.value.length === 0) return ElMessage.warning('请选择用例')
  linkLoading.value = true
  try {
    const entries = linkCases.value.map(id => ({ testcase_id: id }))
    await linkItems(projectId.value, reviewId.value, entries, true)
    ElMessage.success(`已关联 ${linkCases.value.length} 条用例`)
    linkDialogVisible.value = false
    fetchReview()
    fetchItems()
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
    await unlinkItems(projectId.value, reviewId.value, [item.id])
    ElMessage.success('已移除')
    fetchReview()
    fetchItems()
  } catch { /* cancelled */ }
}

// ── 提交评审 ──
async function handleSubmitReview() {
  if (!currentItem.value) return
  submitting.value = true
  try {
    await submitItemReview(
      projectId.value, reviewId.value, currentItem.value.id,
      reviewDecision.value, reviewComment.value
    )
    ElMessage.success('评审提交成功')
    reviewComment.value = ''
    fetchReview()
    await fetchItems()
    // 刷新当前用例的评审记录时间线
    await loadCurrentItemRecords()
    // 自动跳到下一条
    if (currentItemIndex.value < items.value.length - 1) {
      goNextItem()
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '提交失败')
  } finally {
    submitting.value = false
  }
}

// ── 批量操作 ──
async function handleBatchReview(result: 'approved' | 'rejected') {
  const ids = selectedItems.value.map((item) => item.id)
  if (ids.length === 0) return ElMessage.warning('请先选择评审项')
  try {
    const resp = await batchReview(projectId.value, reviewId.value, ids, result, '')
    ElMessage.success(`批量评审完成：成功 ${resp.success_count}，失败 ${resp.fail_count}`)
    fetchReview()
    fetchItems()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '批量评审失败')
  }
}

async function handleBatchResubmit() {
  const ids = selectedItems.value.map((item) => item.id)
  if (ids.length === 0) return ElMessage.warning('请先选择评审项')
  try {
    await batchResubmit(projectId.value, reviewId.value, ids)
    ElMessage.success('已重新提审')
    fetchReview()
    fetchItems()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '重新提审失败')
  }
}

function openReassignDialog() {
  reassignReviewerIds.value = []
  reassignDialogVisible.value = true
}

async function handleReassign() {
  const ids = selectedItems.value.map((item) => item.id)
  try {
    await batchReassign(projectId.value, reviewId.value, ids, reassignReviewerIds.value)
    ElMessage.success('已更换评审人')
    reassignDialogVisible.value = false
    fetchItems()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '更换失败')
  }
}

// ── 评审记录 ──
async function openRecordDrawer(item: CaseReviewItem) {
  recordDrawerItem.value = item
  recordDrawerVisible.value = true
  // 如果点的就是当前用例，直接复用已有数据；否则重新拉取
  if (!currentItem.value || item.id !== currentItem.value.id) {
    recordsLoading.value = true
    try {
      const resp = await listItemRecords(projectId.value, reviewId.value, item.id, { page: 1, pageSize: 50 })
      records.value = resp.items || []
    } catch { /* ignore */ } finally {
      recordsLoading.value = false
    }
  } else {
    // 点的就是当前用例，保险起见刷一次最新记录
    await loadCurrentItemRecords()
  }
}

function handleSelectionChange(rows: CaseReviewItem[]) {
  selectedItems.value = rows
}

// ── 模拟测试步骤 ──
const mockSteps = computed(() => {
  if (!currentItem.value) return []
  return [
    { no: '01', action: '打开系统并登录测试账号', expected: '系统正确进入主页面' },
    { no: '02', action: '根据用例标题执行核心操作流程', expected: '操作响应正常，无报错' },
    { no: '03', action: '验证结果数据与预期一致', expected: '数据完整且格式正确' },
    { no: '04', action: '执行边界条件与异常场景测试', expected: '系统具备容错能力，行为符合设计' },
  ]
})

// ── 生命周期 ──
onMounted(() => {
  if (projectId.value && reviewId.value) {
    fetchReview()
    fetchItems()
    fetchUsers()
  }
})

watch([projectId, reviewId], () => {
  if (projectId.value && reviewId.value) {
    fetchReview()
    fetchItems()
  }
})

// 切换当前评审项时，自动拉取其历史记录与附件
watch(
  () => currentItem.value?.id,
  (id) => {
    if (id) {
      loadCurrentItemRecords()
      loadAttachments()
    } else {
      records.value = []
      attachments.value = []
    }
  },
)
</script>

<template>
  <div class="rd-page">
    <!-- ══ 顶部导航栏 ══ -->
    <header class="rd-header">
      <div class="rd-header-left">
        <button class="rd-back-btn" @click="goBack()">
          <span class="material-symbols-outlined">arrow_back</span>
        </button>
        <span class="rd-logo">Review Console</span>
        <nav class="rd-breadcrumb" v-if="review">
          <span class="rd-crumb-muted">{{ review.name }}</span>
          <span class="material-symbols-outlined rd-crumb-sep">chevron_right</span>
          <span class="rd-crumb-active" v-if="currentItem">TestCase-{{ currentItem.testcase_id }}</span>
        </nav>
      </div>
      <div class="rd-header-right">
        <div class="rd-header-icons">
          <span class="material-symbols-outlined rd-hdr-icon" title="评审记录" @click="currentItem && openRecordDrawer(currentItem)">history</span>
        </div>
        <button class="rd-submit-top" v-if="isActive" @click="handleSubmitReview" :disabled="submitting">Submit Review</button>
      </div>
    </header>

    <!-- ══ 主体：左右两栏 ══ -->
    <div class="rd-body" v-if="review">
      <!-- 左栏：用例详情 70% -->
      <section class="rd-main" v-if="currentItem">
        <!-- 标签 -->
        <div class="rd-tags">
          <span class="rd-tag tag-purple">{{ review.review_mode === 'parallel' ? '会签模式' : '独审模式' }}</span>
          <span class="rd-tag tag-blue">{{ currentItem.final_result === 'pending' ? 'PENDING' : currentItem.final_result === 'approved' ? 'APPROVED' : currentItem.final_result === 'rejected' ? 'REJECTED' : 'NEEDS UPDATE' }}</span>
        </div>

        <!-- 标题 + 描述 -->
        <h2 class="rd-title">{{ currentItem.title_snapshot }}</h2>
        <p class="rd-desc">
          评审轮次 R{{ currentItem.current_round_no }}，用例版本 {{ currentItem.testcase_version || 'V1' }}。
          请仔细阅读以下测试步骤并提交您的评审意见。
        </p>

        <!-- 信息卡片 Bento Grid -->
        <div class="rd-info-grid">
          <div class="rd-glass-card">
            <span class="rd-glass-label">创建者</span>
            <div class="rd-glass-value">
              <span class="material-symbols-outlined rd-glass-icon icon-primary">person</span>
              <span>{{ review?.created_by_name || '未知' }}</span>
            </div>
          </div>
          <div class="rd-glass-card">
            <span class="rd-glass-label">评审人</span>
            <div class="rd-glass-value">
              <span class="material-symbols-outlined rd-glass-icon icon-secondary">groups</span>
              <span>
                <template v-if="currentItem.reviewers && currentItem.reviewers.length">
                  {{ currentItem.reviewers.map((r: any) => r.reviewer_name || `#${r.reviewer_id}`).join(', ') }}
                </template>
                <template v-else>未指派</template>
              </span>
            </div>
          </div>
          <div class="rd-glass-card">
            <span class="rd-glass-label">前置条件</span>
            <div class="rd-glass-value">
              <span class="material-symbols-outlined rd-glass-icon icon-tertiary">key</span>
              <span>{{ currentItem.latest_comment || '暂无备注' }}</span>
            </div>
          </div>
        </div>

        <!-- 测试步骤 -->
        <div class="rd-section">
          <h3 class="rd-section-title">
            <span class="material-symbols-outlined rd-section-icon">list_alt</span>
            测试步骤 ({{ mockSteps.length }})
          </h3>
          <div class="rd-table-wrap">
            <table class="rd-table">
              <thead>
                <tr>
                  <th class="th-no">序号</th>
                  <th>步骤描述</th>
                  <th>预期结果</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="step in mockSteps" :key="step.no">
                  <td class="td-no">{{ step.no }}</td>
                  <td class="td-action">{{ step.action }}</td>
                  <td class="td-expect">{{ step.expected }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 附件与证据 -->
        <div class="rd-section">
          <h3 class="rd-section-title">
            <span class="material-symbols-outlined rd-section-icon">attachment</span>
            附件与证据 ({{ attachments.length }})
            <span class="rd-section-hint">评审附件会同步到用例详情作为评审证据（只读）</span>
          </h3>
          <input
            ref="attachmentInputRef"
            type="file"
            class="rd-attach-file"
            @change="onAttachmentFileChange"
          />
          <div class="rd-attachments" v-loading="attachmentsLoading">
            <div
              class="rd-attach-upload"
              :class="{ disabled: attachmentUploading || !currentItem }"
              @click="triggerAttachmentUpload"
            >
              <span class="material-symbols-outlined">
                {{ attachmentUploading ? 'hourglass_empty' : 'add_circle' }}
              </span>
              <span class="rd-attach-text">
                {{ attachmentUploading ? '上传中…' : '上传附件' }}
              </span>
            </div>
            <div
              v-for="att in attachments"
              :key="att.id"
              class="rd-attach-card"
            >
              <div class="rd-attach-icon">
                <span class="material-symbols-outlined">description</span>
              </div>
              <div class="rd-attach-info">
                <div class="rd-attach-name" :title="att.file_name">{{ att.file_name }}</div>
                <div class="rd-attach-meta">
                  <span>{{ formatFileSize(att.file_size) }}</span>
                  <span v-if="att.uploader_name">· {{ att.uploader_name }}</span>
                </div>
                <div class="rd-attach-actions">
                  <button class="rd-attach-btn" @click="handleDownloadAttachment(att)">
                    <span class="material-symbols-outlined">download</span>
                    下载
                  </button>
                  <button class="rd-attach-btn danger" @click="handleDeleteAttachment(att)">
                    <span class="material-symbols-outlined">delete</span>
                    删除
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 评审记录时间线 -->
        <div class="rd-section">
          <h3 class="rd-section-title">
            <span class="material-symbols-outlined rd-section-icon">history</span>
            评审记录 ({{ records.length }})
          </h3>
          <div v-loading="recordsLoading">
            <div v-if="records.length === 0 && !recordsLoading" class="rd-records-empty">
              <span class="material-symbols-outlined" style="font-size:32px;opacity:0.3">forum</span>
              <span>暂无评审记录，提交后将在这里展示</span>
            </div>
            <div class="rd-records-inline" v-else>
              <div v-for="rec in records" :key="rec.id" class="rd-record-card">
                <div class="rd-record-card-head">
                  <span class="rd-result-badge" :class="resultClass(rec.result)">{{ resultLabel(rec.result) }}</span>
                  <span class="rd-record-round">R{{ rec.round_no }}</span>
                  <span class="rd-record-reviewer">{{ rec.reviewer_name || `评审人 #${rec.reviewer_id}` }}</span>
                  <span class="rd-record-time">{{ formatDate(rec.created_at) }}</span>
                </div>
                <div class="rd-record-comment-inline" v-if="rec.comment">{{ rec.comment }}</div>
                <div class="rd-record-comment-inline rd-record-comment-empty" v-else>（无评审意见）</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 用例列表导航 -->
        <div class="rd-section">
          <h3 class="rd-section-title">
            <span class="material-symbols-outlined rd-section-icon">folder_open</span>
            评审用例列表 ({{ items.length }})
          </h3>
          <div class="rd-case-list">
            <div
              v-for="(item, idx) in items"
              :key="item.id"
              class="rd-case-row"
              :class="{ active: idx === currentItemIndex }"
              @click="currentItemIndex = idx"
            >
              <span class="rd-case-idx">{{ idx + 1 }}</span>
              <span class="rd-case-name">{{ item.title_snapshot }}</span>
              <span class="rd-result-dot" :class="resultClass(item.final_result)"></span>
            </div>
          </div>
        </div>
      </section>

      <!-- 空状态 -->
      <section class="rd-main rd-empty" v-else>
        <span class="material-symbols-outlined" style="font-size: 48px; opacity: 0.3">rate_review</span>
        <p>暂无评审用例，请先关联用例</p>
        <button class="rd-link-btn" @click="openLinkDialog" v-if="isActive">
          <span class="material-symbols-outlined">add_link</span> 关联用例
        </button>
      </section>

      <!-- ══ 右栏：评审操作面板 30% ══ -->
      <aside class="rd-sidebar">
        <!-- 进度 -->
        <div class="rd-progress">
          <div class="rd-progress-row">
            <span class="rd-progress-label">当前评审进度</span>
            <span class="rd-progress-nums">
              <span class="rd-progress-big">{{ review.approved_count + review.rejected_count + review.needs_update_count }}</span>
              <span class="rd-progress-small"> / {{ review.case_total_count }} 已处理</span>
            </span>
          </div>
          <div class="rd-progress-track">
            <div
              class="rd-progress-fill"
              :style="{ width: review.case_total_count > 0 ? ((review.approved_count + review.rejected_count + review.needs_update_count) / review.case_total_count * 100) + '%' : '0%' }"
            ></div>
          </div>
        </div>

        <!-- 评审决策 -->
        <div class="rd-decisions-section">
          <span class="rd-section-label">评审决定</span>
          <div class="rd-decisions">
            <label
              class="rd-decision pass"
              :class="{ selected: reviewDecision === 'approved' }"
              @click="reviewDecision = 'approved'"
            >
              <div class="rd-dec-icon pass">
                <span class="material-symbols-outlined">check_circle</span>
              </div>
              <div class="rd-dec-text">
                <span class="rd-dec-title">通过 (Pass)</span>
                <span class="rd-dec-desc">用例逻辑严密，可直接执行</span>
              </div>
            </label>
            <label
              class="rd-decision rework"
              :class="{ selected: reviewDecision === 'needs_update' }"
              @click="reviewDecision = 'needs_update'"
            >
              <div class="rd-dec-icon rework">
                <span class="material-symbols-outlined">edit_note</span>
              </div>
              <div class="rd-dec-text">
                <span class="rd-dec-title">打回 (Rework)</span>
                <span class="rd-dec-desc">部分逻辑缺失，需修改补充</span>
              </div>
            </label>
            <label
              class="rd-decision fail"
              :class="{ selected: reviewDecision === 'rejected' }"
              @click="reviewDecision = 'rejected'"
            >
              <div class="rd-dec-icon fail">
                <span class="material-symbols-outlined">cancel</span>
              </div>
              <div class="rd-dec-text">
                <span class="rd-dec-title">拒绝 (Fail)</span>
                <span class="rd-dec-desc">核心逻辑错误或方案不可行</span>
              </div>
            </label>
          </div>
        </div>

        <!-- 评审意见 -->
        <div class="rd-comment-section">
          <span class="rd-section-label">评审意见</span>
          <div class="rd-comment-box">
            <div class="rd-comment-toolbar">
              <button class="rd-tb-btn"><span class="material-symbols-outlined">format_bold</span></button>
              <button class="rd-tb-btn"><span class="material-symbols-outlined">format_list_bulleted</span></button>
              <button class="rd-tb-btn"><span class="material-symbols-outlined">link</span></button>
              <button class="rd-tb-btn"><span class="material-symbols-outlined">alternate_email</span></button>
            </div>
            <textarea
              v-model="reviewComment"
              class="rd-comment-input"
              placeholder="请输入您的专业建议或修改要求..."
            ></textarea>
          </div>
        </div>

        <!-- 提交按钮 -->
        <button
          class="rd-submit-btn"
          :disabled="submitting || !currentItem"
          @click="handleSubmitReview"
        >
          <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1">send</span>
          {{ submitting ? '提交中...' : '提交评审结论' }}
        </button>
      </aside>
    </div>

    <!-- ══ 对话框 ══ -->
    <el-dialog v-model="linkDialogVisible" title="关联用例" width="560px" destroy-on-close>
      <el-select v-model="linkCases" multiple filterable placeholder="搜索并选择用例" style="width:100%">
        <el-option v-for="c in availableCases" :key="c.id" :label="`#${c.id} ${c.title}`" :value="c.id" />
      </el-select>
      <template #footer>
        <el-button @click="linkDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="linkLoading" @click="handleLink">确定关联</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="reassignDialogVisible" title="更换评审人" width="480px" destroy-on-close>
      <el-select v-model="reassignReviewerIds" multiple filterable placeholder="选择新评审人" style="width:100%">
        <el-option v-for="u in allUsers" :key="u.id" :label="u.name" :value="u.id" />
      </el-select>
      <template #footer>
        <el-button @click="reassignDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleReassign" :disabled="reassignReviewerIds.length === 0">确认更换</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="recordDrawerVisible" :title="`评审记录 - ${recordDrawerItem?.title_snapshot || ''}`" direction="rtl" size="420px">
      <div v-loading="recordsLoading">
        <div v-if="records.length === 0 && !recordsLoading" class="rd-empty-records">
          <span class="material-symbols-outlined" style="font-size:40px;opacity:0.3">history</span>
          <p>暂无评审记录</p>
        </div>
        <div class="rd-record-timeline" v-else>
          <div v-for="rec in records" :key="rec.id" class="rd-record-item">
            <div class="rd-record-header">
              <span class="rd-result-badge" :class="resultClass(rec.result)">{{ resultLabel(rec.result) }}</span>
              <span class="rd-record-round">R{{ rec.round_no }}</span>
              <span class="rd-record-time">{{ formatDate(rec.created_at) }}</span>
            </div>
            <div class="rd-record-comment" v-if="rec.comment">{{ rec.comment }}</div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════ */
/*  Case Review Detail – Pixel-Perfect Design Match  */
/* ═══════════════════════════════════════════════════ */

.rd-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: 'Inter', sans-serif;
}

/* ── 顶部导航 ── */
.rd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.rd-header-left { display: flex; align-items: center; gap: 16px; }
.rd-header-right { display: flex; align-items: center; gap: 16px; }
.rd-back-btn {
  display: flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.08); background: transparent;
  color: rgba(204, 195, 216, 0.6); cursor: pointer; transition: all 0.2s;
}
.rd-back-btn:hover { color: #d2bbff; border-color: rgba(210,187,255,0.3); }
.rd-logo { font-size: 18px; font-weight: 700; color: #d2bbff; letter-spacing: -0.02em; }
.rd-breadcrumb { display: flex; align-items: center; gap: 8px; }
.rd-crumb-muted { font-size: 14px; font-weight: 500; color: rgba(204, 195, 216, 0.5); }
.rd-crumb-sep { font-size: 14px; color: rgba(204, 195, 216, 0.3); }
.rd-crumb-active { font-size: 14px; font-weight: 600; color: #d2bbff; }
.rd-header-icons {
  display: flex; align-items: center; gap: 12px;
  padding-right: 16px; border-right: 1px solid rgba(255,255,255,0.1);
}
.rd-hdr-icon { font-size: 20px; color: rgba(204, 195, 216, 0.6); cursor: pointer; transition: color 0.2s; }
.rd-hdr-icon:hover { color: #d2bbff; }
.rd-submit-top {
  padding: 6px 20px; border-radius: 8px; border: none;
  background: #7c3aed; color: #ede0ff; font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all 0.15s;
}
.rd-submit-top:hover { filter: brightness(1.1); }
.rd-submit-top:active { transform: scale(0.95); }
.rd-submit-top:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── 主体 ── */
.rd-body { display: flex; flex: 1; overflow: hidden; }

/* ── 左栏 ── */
.rd-main { width: 70%; overflow-y: auto; padding: 32px; }
.rd-main::-webkit-scrollbar { width: 4px; }
.rd-main::-webkit-scrollbar-thumb { background: rgba(124, 58, 237, 0.15); border-radius: 4px; }
.rd-main.rd-empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 12px; color: rgba(204,195,216,0.5);
}
.rd-link-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 18px; border-radius: 8px; border: none;
  background: #7c3aed; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
}

/* 标签 */
.rd-tags { display: flex; gap: 12px; margin-bottom: 16px; }
.rd-tag {
  padding: 4px 12px; border-radius: 4px; font-size: 12px;
  font-weight: 600; letter-spacing: 0.06em;
}
.tag-purple { background: rgba(124, 58, 237, 0.1); color: #d2bbff; }
.tag-blue { background: rgba(5, 102, 217, 0.1); color: #adc6ff; }

/* 标题+描述 */
.rd-title {
  font-size: 30px; font-weight: 600; color: #e1e1f2;
  margin: 0 0 16px; line-height: 1.25; letter-spacing: -0.02em;
}
.rd-desc {
  font-size: 14px; color: rgba(204, 195, 216, 0.7);
  line-height: 1.7; margin: 0 0 32px; max-width: 740px;
}

/* 信息卡片 glass */
.rd-info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 32px; }
.rd-glass-card {
  background: rgba(255, 255, 255, 0.04); backdrop-filter: blur(12px);
  border: 1px solid rgba(74, 68, 85, 0.15); border-radius: 12px;
  padding: 20px; display: flex; flex-direction: column; gap: 8px;
}
.rd-glass-label {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em;
  color: rgba(204, 195, 216, 0.4);
}
.rd-glass-value {
  display: flex; align-items: center; gap: 8px;
  font-size: 14px; font-weight: 500; color: #e1e1f2;
}
.rd-glass-icon { font-size: 18px; }
.icon-primary { color: #d2bbff; }
.icon-secondary { color: #adc6ff; }
.icon-tertiary { color: #ffb784; }

/* 区段 */
.rd-section { margin-bottom: 32px; }
.rd-section-title {
  font-size: 18px; font-weight: 600; color: #e1e1f2;
  display: flex; align-items: center; gap: 8px; margin: 0 0 16px;
}
.rd-section-icon { color: #d2bbff; }

/* 步骤表 */
.rd-table-wrap {
  border-radius: 12px; overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.05); background: #191b26;
}
.rd-table { width: 100%; text-align: left; border-collapse: collapse; }
.rd-table thead tr {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
}
.rd-table th {
  padding: 16px 24px; font-size: 12px; font-weight: 500;
  text-transform: uppercase; letter-spacing: 0.08em; color: rgba(204, 195, 216, 0.5);
}
.th-no { width: 80px; }
.rd-table tbody tr {
  border-bottom: 1px solid rgba(255, 255, 255, 0.04); transition: background 0.15s;
}
.rd-table tbody tr:last-child { border-bottom: none; }
.rd-table tbody tr:hover { background: rgba(255, 255, 255, 0.03); }
.td-no {
  padding: 20px 24px; vertical-align: top;
  color: rgba(204, 195, 216, 0.3); font-family: 'JetBrains Mono', monospace; font-size: 14px;
}
.td-action { padding: 20px 24px; color: #e1e1f2; font-size: 14px; }
.td-expect { padding: 20px 24px; color: rgba(204, 195, 216, 0.7); font-size: 14px; }

/* 附件 */
.rd-attachments { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.rd-attach-file { display: none; }
.rd-attach-upload {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; height: 128px; border-radius: 8px;
  border: 1px dashed rgba(255, 255, 255, 0.1); color: rgba(204, 195, 216, 0.3);
  cursor: pointer; transition: all 0.2s;
}
.rd-attach-upload:hover { border-color: rgba(124, 58, 237, 0.5); color: #d2bbff; }
.rd-attach-upload.disabled { opacity: 0.5; cursor: not-allowed; }
.rd-attach-text { font-size: 12px; }
.rd-section-hint {
  margin-left: 12px; font-size: 12px; font-weight: 400;
  color: rgba(204, 195, 216, 0.5);
}
.rd-attach-card {
  display: flex; gap: 12px; height: 128px; padding: 12px;
  border-radius: 8px; background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.rd-attach-icon {
  flex-shrink: 0; width: 40px; height: 40px; border-radius: 8px;
  background: rgba(124, 58, 237, 0.15); color: #d2bbff;
  display: flex; align-items: center; justify-content: center;
}
.rd-attach-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.rd-attach-name {
  font-size: 13px; color: #e1e1f2; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rd-attach-meta {
  font-size: 12px; color: rgba(204, 195, 216, 0.6);
  display: flex; gap: 4px;
}
.rd-attach-actions { margin-top: auto; display: flex; gap: 8px; }
.rd-attach-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 6px; font-size: 12px;
  background: rgba(255, 255, 255, 0.06); color: #d2bbff;
  border: none; cursor: pointer; transition: background 0.2s;
}
.rd-attach-btn:hover { background: rgba(124, 58, 237, 0.25); }
.rd-attach-btn.danger { color: #f87171; }
.rd-attach-btn.danger:hover { background: rgba(239, 68, 68, 0.2); }
.rd-attach-btn .material-symbols-outlined { font-size: 14px; }

/* 用例列表 */
.rd-case-list {
  display: flex; flex-direction: column; max-height: 240px;
  overflow-y: auto; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.05);
}
.rd-case-row {
  display: flex; align-items: center; gap: 12px; padding: 12px 16px;
  cursor: pointer; transition: background 0.15s; font-size: 13px;
  color: rgba(204, 195, 216, 0.7); border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}
.rd-case-row:last-child { border-bottom: none; }
.rd-case-row:hover { background: rgba(255, 255, 255, 0.03); }
.rd-case-row.active {
  background: rgba(124, 58, 237, 0.08); border-left: 3px solid #7c3aed; color: #e1e1f2;
}
.rd-case-idx { font-size: 12px; font-weight: 600; color: rgba(204,195,216,0.4); min-width: 24px; }
.rd-case-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rd-result-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: #6c757d; }
.rd-result-dot.approved { background: #10B981; }
.rd-result-dot.rejected { background: #EF4444; }
.rd-result-dot.needs-update { background: #F59E0B; }

/* ── 右栏 ── */
.rd-sidebar {
  width: 30%; background: #191b26;
  border-left: 1px solid rgba(255, 255, 255, 0.05);
  padding: 32px; display: flex; flex-direction: column; gap: 32px; overflow-y: auto;
}
.rd-sidebar::-webkit-scrollbar { width: 4px; }
.rd-sidebar::-webkit-scrollbar-thumb { background: rgba(124, 58, 237, 0.15); border-radius: 4px; }

/* 进度 */
.rd-progress { display: flex; flex-direction: column; gap: 12px; }
.rd-progress-row { display: flex; justify-content: space-between; align-items: flex-end; }
.rd-progress-label { font-size: 14px; font-weight: 500; color: #e1e1f2; }
.rd-progress-big { font-size: 28px; font-weight: 700; color: #d2bbff; }
.rd-progress-small { font-size: 14px; color: rgba(204, 195, 216, 0.4); font-weight: 400; }
.rd-progress-track {
  height: 6px; width: 100%; background: rgba(255, 255, 255, 0.05);
  border-radius: 9999px; overflow: hidden;
}
.rd-progress-fill {
  height: 100%; background: #7c3aed; border-radius: 9999px;
  box-shadow: 0 0 12px rgba(124, 58, 237, 0.4); transition: width 0.4s ease;
}

/* 小节标签 */
.rd-section-label {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em;
  color: rgba(204, 195, 216, 0.4); font-weight: 600;
}

/* 评审决策 */
.rd-decisions-section { display: flex; flex-direction: column; gap: 16px; }
.rd-decisions { display: flex; flex-direction: column; gap: 12px; }
.rd-decision {
  display: flex; align-items: center; gap: 16px; padding: 16px;
  border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.02); cursor: pointer; transition: all 0.2s;
}
.rd-decision:hover { background: rgba(255, 255, 255, 0.05); }
.rd-decision.pass.selected { border-color: rgba(16, 185, 129, 0.5); background: rgba(16, 185, 129, 0.05); }
.rd-decision.rework.selected { border-color: rgba(245, 158, 11, 0.5); background: rgba(245, 158, 11, 0.05); }
.rd-decision.fail.selected { border-color: rgba(239, 68, 68, 0.5); background: rgba(239, 68, 68, 0.05); }
.rd-dec-icon {
  width: 40px; height: 40px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: transform 0.2s;
}
.rd-decision:hover .rd-dec-icon { transform: scale(1.1); }
.rd-dec-icon .material-symbols-outlined { font-size: 22px; }
.rd-dec-icon.pass { background: rgba(16, 185, 129, 0.1); color: #10B981; }
.rd-dec-icon.rework { background: rgba(245, 158, 11, 0.1); color: #F59E0B; }
.rd-dec-icon.fail { background: rgba(239, 68, 68, 0.1); color: #EF4444; }
.rd-dec-text { display: flex; flex-direction: column; }
.rd-dec-title { font-size: 14px; font-weight: 600; color: #e1e1f2; }
.rd-dec-desc { font-size: 12px; color: rgba(204, 195, 216, 0.5); margin-top: 2px; }

/* 评审意见 */
.rd-comment-section { display: flex; flex-direction: column; gap: 16px; flex: 1; }
.rd-comment-box {
  flex: 1; display: flex; flex-direction: column; border-radius: 12px;
  border: 1px solid rgba(74, 68, 85, 0.15); background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px); overflow: hidden;
}
.rd-comment-toolbar {
  display: flex; align-items: center; gap: 4px;
  padding: 8px 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.02);
}
.rd-tb-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 28px; border-radius: 4px; border: none;
  background: transparent; color: rgba(204, 195, 216, 0.6);
  cursor: pointer; transition: all 0.15s;
}
.rd-tb-btn .material-symbols-outlined { font-size: 18px; }
.rd-tb-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
.rd-comment-input {
  flex: 1; min-height: 100px; resize: none; border: none;
  background: transparent; padding: 16px; font-size: 14px;
  color: #e1e1f2; font-family: inherit;
}
.rd-comment-input::placeholder { color: rgba(204, 195, 216, 0.2); }
.rd-comment-input:focus { outline: none; }

/* 提交按钮 */
.rd-submit-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; padding: 16px; border-radius: 12px; border: none;
  background: linear-gradient(135deg, #7c3aed, #0566d9);
  color: #ffffff; font-size: 15px; font-weight: 700;
  cursor: pointer; transition: all 0.2s;
  box-shadow: 0 8px 24px rgba(124, 58, 237, 0.3); flex-shrink: 0;
}
.rd-submit-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(124, 58, 237, 0.4); }
.rd-submit-btn:active { transform: translateY(0); }
.rd-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

/* ── 评审记录 ── */
.rd-empty-records {
  display: flex; flex-direction: column; align-items: center;
  padding: 60px 0; color: rgba(204,195,216,0.4); gap: 8px;
}
.rd-record-timeline { display: flex; flex-direction: column; gap: 12px; }
.rd-record-item {
  padding: 12px 14px; background: rgba(255,255,255,0.04);
  border: 1px solid rgba(74,68,85,0.15); border-radius: 8px;
}
.rd-record-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.rd-result-badge {
  display: inline-flex; padding: 3px 10px; border-radius: 10px;
  font-size: 12px; font-weight: 600;
}
.rd-result-badge.pending { background: rgba(108,117,125,0.12); color: #6c757d; }
.rd-result-badge.approved { background: rgba(16,185,129,0.12); color: #10B981; }
.rd-result-badge.rejected { background: rgba(239,68,68,0.12); color: #EF4444; }
.rd-result-badge.needs-update { background: rgba(245,158,11,0.12); color: #F59E0B; }
.rd-record-round { font-size: 12px; color: rgba(204,195,216,0.5); font-weight: 600; }
.rd-record-time { font-size: 12px; color: rgba(204,195,216,0.3); margin-left: auto; }
.rd-record-comment { font-size: 13px; color: rgba(204,195,216,0.7); line-height: 1.5; }

/* 主区域内嵌的评审记录时间线 */
.rd-records-empty {
  display: flex; align-items: center; gap: 12px;
  padding: 24px; border-radius: 8px;
  border: 1px dashed rgba(255,255,255,0.08);
  color: rgba(204,195,216,0.4); font-size: 13px;
}
.rd-records-inline { display: flex; flex-direction: column; gap: 12px; }
.rd-record-card {
  padding: 14px 16px; border-radius: 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(74,68,85,0.18);
}
.rd-record-card-head {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 8px; flex-wrap: wrap;
}
.rd-record-reviewer {
  font-size: 12px; font-weight: 500;
  color: rgba(204,195,216,0.7);
}
.rd-record-comment-inline {
  font-size: 13px; color: #e1e1f2; line-height: 1.6;
  white-space: pre-wrap; word-break: break-word;
}
.rd-record-comment-empty { color: rgba(204,195,216,0.35); font-style: italic; }
</style>
