<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '../stores/project'
import { apiClient } from '../api/client'
import { listUsersLookup } from '../api/user'
import {
  listReviews,
  createReview,
  deleteReview,
  closeReview,
  copyReview,
  getReview,
  getReviewSummary,
  listReviewItems,
  linkItems,
  submitItemReview,
  type CaseReview,
  type CaseReviewItem,
  type CreateReviewPayload,
  type ReviewListParams,
  type ReviewSummary,
} from '../api/caseReview'
import { runPlanAIGate, type PlanRunReport } from '../api/caseReviewV02'
import ReviewAIReportDialog from '../components/ReviewAIReportDialog.vue'
import { listTestCases } from '../api/testcase'
import { extractErrorMessage, isElMessageBoxCancel } from '../utils/error'

// ── Stores ──
const projectStore = useProjectStore()
const route = useRoute()
const router = useRouter()
const apiBaseUrl = apiClient.defaults.baseURL || '/api/v1'
const serverUrl = apiBaseUrl.replace(/\/api\/v1\/?$/, '')

const selectedProjectId = computed(() => projectStore.selectedProjectId)

// ── State ──
const loading = ref(false)
const reviews = ref<CaseReview[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const viewMode = ref<'all' | 'assigned' | 'created'>('all')
const searchKeyword = ref('')
const filterStatus = ref('')
const filterMode = ref('')

// ── 用户列表（评审人选择） ──
const allUsers = ref<{ id: number; name: string; email: string }[]>([])

async function loadUsers() {
  try {
    allUsers.value = await listUsersLookup()
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } }; message?: string }
    const msg = err?.response?.data?.message || err?.message || '加载用户列表失败'
    ElMessage.error(msg)
  }
}

// ── 数据加载 ──
async function fetchReviews() {
  if (!selectedProjectId.value) return
  loading.value = true
  try {
    const params: ReviewListParams = {
      page: page.value,
      pageSize: pageSize.value,
      view: viewMode.value,
      keyword: searchKeyword.value || undefined,
      status: filterStatus.value || undefined,
      review_mode: filterMode.value || undefined,
    }
    const resp = await listReviews(selectedProjectId.value, params)
    reviews.value = resp?.items || []
    total.value = resp?.total || 0
  } catch {
    ElMessage.error('加载评审列表失败')
  } finally {
    loading.value = false
  }
}

// 页码 / 每页条数变化：直接拉取，不重置页码
watch([page, pageSize], () => fetchReviews())

// 项目切换 / 视图模式 / 筛选条件变化：重置到第 1 页再拉取
watch([selectedProjectId, viewMode, filterStatus, filterMode], () => {
  if (page.value !== 1) {
    page.value = 1 // 触发 [page, pageSize] watch → fetchReviews
  } else {
    fetchReviews()
  }
})

// 搜索关键词防抖（350ms）；回车键由 handleSearch 立即触发
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
watch(searchKeyword, () => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    page.value = 1
    fetchReviews()
  }, 350)
})

watch(
  [
    selectedProjectId,
    () => route.query.create,
    () => route.query.testcaseId,
    () => route.query.testcaseIds,
    () => route.query.reviewId,
  ],
  () => {
    handleRouteIntent()
  },
)

onMounted(() => {
  fetchReviews()
  fetchSummary()
  loadUsers()
  handleRouteIntent()
})

function handleSearch() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  page.value = 1
  fetchReviews()
}

// ── 创建评审 ──
const createDialogVisible = ref(false)
const createForm = reactive({
  name: '',
  review_mode: 'single' as 'single' | 'parallel',
  description: '',
  default_reviewer_ids: [] as number[],
  planned_start_at: '',
  planned_end_at: '',
  testcase_ids: [] as number[],
})
const creating = ref(false)

// 测试用例列表（用于关联用例 用途选择）
const availableCases = ref<{ id: number; title: string }[]>([])
const loadingCases = ref(false)

async function loadCasesForLink() {
  if (!selectedProjectId.value) return
  loadingCases.value = true
  try {
    const resp = await listTestCases(selectedProjectId.value, { page: 1, pageSize: 200 })
    availableCases.value = (resp?.items || []).map((c) => ({ id: c.id, title: c.title }))
  } catch {
    /* ignore */
  }
  loadingCases.value = false
}

async function openCreateDialog(initialTestCaseIDs: number[] = []) {
  Object.assign(createForm, {
    name: '',
    review_mode: 'single',
    description: '',
    default_reviewer_ids: [],
    planned_start_at: '',
    planned_end_at: '',
    testcase_ids: [...initialTestCaseIDs],
  })
  await loadCasesForLink()
  createDialogVisible.value = true
}

function parseRouteTestCaseIDs() {
  const rawValues = Array.isArray(route.query.testcaseIds)
    ? route.query.testcaseIds
    : route.query.testcaseIds
      ? [route.query.testcaseIds]
      : []

  const idsFromList = rawValues
    .flatMap((value) => String(value).split(','))
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)

  if (idsFromList.length > 0) {
    return Array.from(new Set(idsFromList))
  }

  const testcaseId = Number(route.query.testcaseId)
  return Number.isFinite(testcaseId) && testcaseId > 0 ? [testcaseId] : []
}

async function openReviewDetail(reviewID: number) {
  if (!selectedProjectId.value || reviewID <= 0) return

  const review = await getReview(selectedProjectId.value, reviewID)
  currentReview.value = review
  detailDrawerVisible.value = true
}

async function handleRouteIntent() {
  if (!selectedProjectId.value || route.name !== 'CaseReviews') return

  if (route.query.create === '1') {
    await openCreateDialog(parseRouteTestCaseIDs())
    await router.replace({ name: 'CaseReviews', query: {} })
    return
  }

  const reviewID = Number(route.query.reviewId)
  if (Number.isFinite(reviewID) && reviewID > 0) {
    await openReviewDetail(reviewID)
    await router.replace({ name: 'CaseReviews', query: {} })
  }
}

async function handleCreate() {
  if (!createForm.name.trim()) {
    ElMessage.warning('请输入评审计划名称')
    return
  }
  if (createForm.default_reviewer_ids.length === 0) {
    ElMessage.warning('请选择至少一名评审人')
    return
  }
  creating.value = true
  try {
    const payload: CreateReviewPayload = {
      name: createForm.name.trim(),
      review_mode: createForm.review_mode,
      description: createForm.description,
      default_reviewer_ids: createForm.default_reviewer_ids,
      testcase_ids: createForm.testcase_ids,
      auto_submit: true,
    }
    if (createForm.planned_start_at) payload.planned_start_at = createForm.planned_start_at
    if (createForm.planned_end_at) payload.planned_end_at = createForm.planned_end_at
    await createReview(selectedProjectId.value!, payload)
    ElMessage.success('评审计划创建成功')
    createDialogVisible.value = false
    fetchReviews()
    fetchSummary()
  } catch (e) {
    ElMessage.error(extractErrorMessage(e, '创建失败'))
  } finally {
    creating.value = false
  }
}

// ── 操作 ──
async function handleDelete(review: CaseReview) {
  try {
    await ElMessageBox.confirm(`确定删除评审计划「${review.name}」？`, '删除确认', {
      type: 'warning',
    })
    await deleteReview(selectedProjectId.value!, review.id)
    ElMessage.success('已删除')
    fetchReviews()
    fetchSummary()
  } catch (e) {
    // 用户取消确认时不弹错提示
    if (isElMessageBoxCancel(e)) return
    ElMessage.error(extractErrorMessage(e, '删除失败'))
  }
}

async function handleClose(review: CaseReview) {
  try {
    await ElMessageBox.confirm(`确定关闭评审计划「${review.name}」？关闭后不可编辑。`, '关闭确认', {
      type: 'warning',
    })
    await closeReview(selectedProjectId.value!, review.id)
    ElMessage.success('已关闭')
    fetchReviews()
    fetchSummary()
  } catch {
    /* cancelled */
  }
}

async function handleCopy(review: CaseReview) {
  try {
    await copyReview(selectedProjectId.value!, review.id, { include_cases: true })
    ElMessage.success('已复制')
    fetchReviews()
    fetchSummary()
  } catch (e) {
    ElMessage.error(extractErrorMessage(e, '复制失败'))
  }
}

// ── 计划级 AI 评审：对该任务下所有用例批量跑规则引擎 ──
/** 每个 review 的 AI 评审 running 状态（按 id 追踪，互不影响，支持多行并行） */
const aiRunningSet = ref<Set<number>>(new Set())
/** 最近一次 AI 评审报告（由 ReviewAIReportDialog 展示聚合结果） */
const aiReport = ref<PlanRunReport | null>(null)
const aiReportVisible = ref(false)
/** 报告弹窗点"查看详情"时跳转对应的评审详情页，并带上 itemId 便于高亮 */
function handleJumpFromReport(itemId: number) {
  const reviewId = aiReport.value?.review_id
  if (!reviewId) return
  aiReportVisible.value = false
  router.push({ path: `/case-reviews/${reviewId}`, query: { itemId: String(itemId) } })
}

/** 对列表行触发计划级 AI 评审 */
async function handleRunAI(review: CaseReview) {
  const projectId = selectedProjectId.value
  if (!projectId) return
  if (aiRunningSet.value.has(review.id)) return
  // 非终态才允许批量评审：closed / completed 禁止，避免把冻结的计划数据搅乱
  if (review.status === 'closed' || review.status === 'completed') {
    ElMessage.warning('计划已关闭或完成，无法再运行 AI 评审')
    return
  }
  aiRunningSet.value = new Set(aiRunningSet.value).add(review.id)
  try {
    const report = await runPlanAIGate(projectId, review.id)
    aiReport.value = report
    aiReportVisible.value = true
    // 刷新列表，让行上的 passed/failed 统计跟上
    fetchReviews()
    fetchSummary()
    const tip = `AI 评审完成：${report.passed_count}/${report.total_count} 通过`
    if (report.failed_count === 0 && report.error_count === 0) ElMessage.success(tip)
    else ElMessage.warning(tip)
  } catch (e) {
    ElMessage.error(extractErrorMessage(e, 'AI 评审失败'))
  } finally {
    const next = new Set(aiRunningSet.value)
    next.delete(review.id)
    aiRunningSet.value = next
  }
}

// ── 格式辅助 ──
function statusLabel(status: string) {
  const map: Record<string, string> = {
    not_started: '未开始',
    in_progress: '进行中',
    completed: '已完成',
    closed: '已关闭',
  }
  return map[status] || status
}

function statusType(status: string): 'info' | 'warning' | 'success' | 'danger' | '' {
  const map: Record<string, 'info' | 'warning' | 'success' | 'danger'> = {
    not_started: 'info',
    in_progress: 'warning',
    completed: 'success',
    closed: 'danger',
  }
  return map[status] || 'info'
}

function modeLabel(mode: string) {
  return mode === 'parallel' ? '会签' : '独审'
}

function formatDate(d: string) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('zh-CN')
}

// ── 评审详情（内嵌抽屉） ──
const detailDrawerVisible = ref(false)
const currentReview = ref<CaseReview | null>(null)
const detailItems = ref<CaseReviewItem[]>([])
const detailItemsLoading = ref(false)
const detailItemsTotal = ref(0)
const reviewComment = ref('')
const detailLinkDialogVisible = ref(false)
const detailLinkLoading = ref(false)
const detailLinkCases = ref<number[]>([])
const detailAvailableCases = ref<{ id: number; title: string }[]>([])

async function loadDetailItems(reviewId: number) {
  if (!selectedProjectId.value) return
  detailItemsLoading.value = true
  try {
    const resp = await listReviewItems(selectedProjectId.value, reviewId, {
      page: 1,
      pageSize: 100,
    })
    detailItems.value = resp?.items || []
    detailItemsTotal.value = resp?.total || 0
  } catch {
    detailItems.value = []
  } finally {
    detailItemsLoading.value = false
  }
}

async function refreshCurrentReviewDetail() {
  if (!selectedProjectId.value || !currentReview.value) return
  currentReview.value = await getReview(selectedProjectId.value, currentReview.value.id)
  await loadDetailItems(currentReview.value.id)
}

async function loadCasesForDetailLink() {
  if (!selectedProjectId.value || !currentReview.value) return
  detailLinkLoading.value = true
  try {
    const resp = await listTestCases(selectedProjectId.value, { page: 1, pageSize: 200 })
    const linkedCaseIDs = new Set(detailItems.value.map((item) => item.testcase_id))
    detailAvailableCases.value =
      (resp?.items || [])
        .filter((item) => !linkedCaseIDs.has(item.id))
        .map((item) => ({ id: item.id, title: item.title })) || []
  } catch {
    detailAvailableCases.value = []
  } finally {
    detailLinkLoading.value = false
  }
}

async function openDetailLinkDialog() {
  if (!currentReview.value) return
  await loadCasesForDetailLink()
  detailLinkCases.value = []
  if (detailAvailableCases.value.length === 0) {
    ElMessage.info('暂无可关联用例')
    return
  }
  detailLinkDialogVisible.value = true
}

async function handleDetailLink() {
  if (!selectedProjectId.value || !currentReview.value) return
  if (detailLinkCases.value.length === 0) {
    ElMessage.warning('请选择至少一条用例')
    return
  }
  detailLinkLoading.value = true
  try {
    const entries = detailLinkCases.value.map((id) => ({ testcase_id: id }))
    await linkItems(selectedProjectId.value, currentReview.value.id, entries, true)
    ElMessage.success(`已关联 ${detailLinkCases.value.length} 条用例`)
    detailLinkDialogVisible.value = false
    await refreshCurrentReviewDetail()
    fetchReviews()
  } catch (e) {
    ElMessage.error(extractErrorMessage(e, '关联失败'))
  } finally {
    detailLinkLoading.value = false
  }
}

async function handleSubmitReview(item: CaseReviewItem, result: 'approved' | 'rejected') {
  if (!selectedProjectId.value || !currentReview.value) return
  try {
    await submitItemReview(
      selectedProjectId.value,
      currentReview.value.id,
      item.id,
      result,
      reviewComment.value || '',
    )
    ElMessage.success(result === 'approved' ? '已通过' : '已驳回')
    reviewComment.value = ''
    await refreshCurrentReviewDetail()
    fetchReviews()
  } catch (e) {
    ElMessage.error(extractErrorMessage(e, '评审提交失败'))
  }
}

function reviewResultLabel(result: string) {
  const map: Record<string, string> = {
    pending: '待评审',
    approved: '通过',
    rejected: '驳回',
    needs_update: '需修改',
  }
  return map[result] || result
}

function reviewResultType(result: string) {
  const map: Record<string, string> = {
    pending: 'warning',
    approved: 'success',
    rejected: 'danger',
    needs_update: 'info',
  }
  return map[result] || 'info'
}

// ── 统计卡片：调用后端 /summary 接口，获取项目级全局统计──
// 这是计划维度的计数（未开始/进行中/已完成/已关闭），与分页无关。
const summary = ref<ReviewSummary>({
  total_plans: 0,
  not_started_plans: 0,
  in_progress_plans: 0,
  completed_plans: 0,
  closed_plans: 0,
  my_pending_items: 0,
})

async function fetchSummary() {
  if (!selectedProjectId.value) return
  try {
    summary.value = await getReviewSummary(selectedProjectId.value)
  } catch {
    /* 汇总失败不阻止列表展示，保持静默 */
  }
}

/** 统计卡进度条宽度：按占"全部计划"的比例渲染 */
function barWidth(count: number): number {
  const total = summary.value.total_plans
  if (!total || total <= 0) return 0
  return Math.round((count / total) * 100)
}

/** "已完成"卡副标：当已完成 > 0 且还有其它计划时，展示完成率 */
const completedRateLabel = computed(() => {
  const { completed_plans: done, total_plans: total } = summary.value
  if (!done || !total || total <= 0) return ''
  return `${Math.round((done / total) * 100)}% 完成率`
})

// ── 分页辅助 ──
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const startItem = computed(() => (page.value - 1) * pageSize.value + 1)
const endItem = computed(() => Math.min(page.value * pageSize.value, total.value))
const displayPages = computed(() => {
  const pages: number[] = []
  const tp = totalPages.value
  const cur = page.value
  for (let i = Math.max(1, cur - 2); i <= Math.min(tp, cur + 2); i++) {
    pages.push(i)
  }
  return pages
})

function goPage(p: number) {
  if (p < 1 || p > totalPages.value) return
  page.value = p
}

// ── 辅助工具 ──
function getInitials(name: string) {
  if (!name) return '?'
  return name.slice(0, 2).toUpperCase()
}

function getUserAvatarUrl(avatar?: string) {
  const raw = (avatar || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  const normalized = raw.startsWith('/') ? raw : `/${raw}`
  return `${serverUrl}${normalized}`
}

function getProgressPercent(review: CaseReview) {
  if (review.case_total_count <= 0) return 0
  const done = getReviewedCount(review)
  return Math.round((done / review.case_total_count) * 100)
}

function getReviewedCount(review: CaseReview) {
  return review.approved_count + review.rejected_count + review.needs_update_count
}

function getProgressPendingCount(review: CaseReview) {
  return Math.max(review.case_total_count - getReviewedCount(review), 0)
}

function progressBarClass(review: CaseReview) {
  if (review.rejected_count > 0) return 'bar-danger'
  if (review.needs_update_count > 0) return 'bar-warning'
  if (getProgressPercent(review) >= 100 && review.case_total_count > 0) return 'bar-complete'
  return ''
}

function progressResultClass(review: CaseReview) {
  if (review.rejected_count > 0) return 'result-danger'
  if (review.needs_update_count > 0) return 'result-warning'
  if (getProgressPercent(review) >= 100 && review.case_total_count > 0) return 'result-success'
  return 'result-muted'
}

function progressResultLabel(review: CaseReview) {
  if (review.case_total_count <= 0) return '暂无用例'
  if (review.rejected_count > 0) return `${review.rejected_count} 条未通过`
  if (review.needs_update_count > 0) return `${review.needs_update_count} 条需修改`
  if (getProgressPercent(review) >= 100) return '全部通过'
  return `${getProgressPendingCount(review)} 条待评审`
}

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    not_started: 'badge-secondary',
    in_progress: 'badge-primary',
    completed: 'badge-success',
    closed: 'badge-muted',
  }
  return map[status] || 'badge-secondary'
}

function reviewStatusBadgeClass(review: CaseReview) {
  if (review.status === 'completed' && review.rejected_count > 0) return 'badge-danger'
  if (review.status === 'completed' && review.needs_update_count > 0) return 'badge-warning'
  return statusBadgeClass(review.status)
}

function reviewStatusLabel(review: CaseReview) {
  if (review.status === 'completed' && review.rejected_count > 0) return '已完成·有驳回'
  if (review.status === 'completed' && review.needs_update_count > 0) return '已完成·需修改'
  if (review.status === 'completed' && review.case_total_count > 0) return '已完成·通过'
  return statusLabel(review.status)
}
</script>

<template>
  <div class="case-review-page">
    <!-- AI 评审报告弹窗（计划级批量评审完成后展示聚合结果） -->
    <ReviewAIReportDialog
      v-model="aiReportVisible"
      :report="aiReport"
      @jump="handleJumpFromReport"
    />

    <!-- ─── 页面标题 ─── -->
    <div class="pipeline-header">
      <div class="pipeline-header-top">
        <div>
          <h1 class="pipeline-title">评审流程 (Review Pipeline)</h1>
          <p class="pipeline-subtitle">管理和跟踪所有挂起的测试用例评审任务。</p>
        </div>
        <div class="pipeline-actions">
          <div class="pipeline-search-box">
            <span class="material-symbols-outlined search-icon-pl">search</span>
            <input
              v-model="searchKeyword"
              type="text"
              placeholder="搜索计划名称 / ID"
              class="pipeline-search-input"
              @keyup.enter="handleSearch"
            />
          </div>
          <button class="pipeline-btn-create" @click="router.push('/case-reviews/create')">
            <span class="material-symbols-outlined" style="font-size: 18px">add_circle</span>
            新建评审
          </button>
        </div>
      </div>
    </div>

    <!-- ─── 统计卡片（计划维度：未开始/进行中/已完成/已关闭） ─── -->
    <div class="stats-grid">
      <!-- 未开始 -->
      <div class="stat-card-pl">
        <div class="stat-bg-icon">
          <span class="material-symbols-outlined">pending_actions</span>
        </div>
        <p class="stat-label-pl">未开始</p>
        <div class="stat-value-row">
          <span class="stat-num">{{ summary.not_started_plans }}</span>
          <span class="stat-sub-hint">个计划</span>
        </div>
        <div class="stat-bar-track">
          <div
            class="stat-bar-fill bar-secondary"
            :style="{ width: barWidth(summary.not_started_plans) + '%' }"
          ></div>
        </div>
      </div>
      <!-- 进行中 -->
      <div class="stat-card-pl">
        <div class="stat-bg-icon icon-primary">
          <span class="material-symbols-outlined">sync</span>
        </div>
        <p class="stat-label-pl">进行中</p>
        <div class="stat-value-row">
          <span class="stat-num">{{ summary.in_progress_plans }}</span>
          <span v-if="summary.in_progress_plans > 0" class="stat-sub primary">进行中</span>
        </div>
        <div class="stat-bar-track">
          <div
            class="stat-bar-fill bar-primary"
            :style="{ width: barWidth(summary.in_progress_plans) + '%' }"
          ></div>
        </div>
      </div>
      <!-- 已完成 -->
      <div class="stat-card-pl">
        <div class="stat-bg-icon icon-emerald">
          <span class="material-symbols-outlined">check_circle</span>
        </div>
        <p class="stat-label-pl">已完成</p>
        <div class="stat-value-row">
          <span class="stat-num">{{ summary.completed_plans }}</span>
          <span v-if="completedRateLabel" class="stat-sub emerald">{{ completedRateLabel }}</span>
        </div>
        <div class="stat-bar-track">
          <div
            class="stat-bar-fill bar-emerald"
            :style="{ width: barWidth(summary.completed_plans) + '%' }"
          ></div>
        </div>
      </div>
      <!-- 已关闭 -->
      <div class="stat-card-pl">
        <div class="stat-bg-icon icon-error">
          <span class="material-symbols-outlined">cancel</span>
        </div>
        <p class="stat-label-pl">已关闭</p>
        <div class="stat-value-row">
          <span class="stat-num">{{ summary.closed_plans }}</span>
          <span v-if="summary.closed_plans > 0" class="stat-sub-hint">不再可编辑</span>
        </div>
        <div class="stat-bar-track">
          <div
            class="stat-bar-fill bar-error"
            :style="{ width: barWidth(summary.closed_plans) + '%' }"
          ></div>
        </div>
      </div>
    </div>

    <!-- ─── 数据表格容器 ─── -->
    <div class="table-container-pl">
      <!-- 表头栏 -->
      <div class="table-header-bar">
        <h3 class="table-section-title">所有评审任务</h3>
        <div class="table-header-actions">
          <div class="view-tabs-pl">
            <button
              v-for="tab in [
                { key: 'all', label: '全部', icon: 'list' },
                { key: 'created', label: '我创建的', icon: 'edit_note' },
                { key: 'assigned', label: '我评审的', icon: 'how_to_reg' },
              ]"
              :key="tab.key"
              class="view-tab-pl"
              :class="{ active: viewMode === tab.key }"
              @click="viewMode = tab.key as any"
            >
              <span class="material-symbols-outlined" style="font-size: 16px">{{ tab.icon }}</span>
              {{ tab.label }}
              <!-- "我评审的" 显示待评审条目数徽标（source: summary.my_pending_items） -->
              <span
                v-if="tab.key === 'assigned' && summary.my_pending_items > 0"
                class="view-tab-badge"
                :class="{ 'badge-active': viewMode === tab.key }"
              >
                {{ summary.my_pending_items > 99 ? '99+' : summary.my_pending_items }}
              </span>
            </button>
          </div>
          <el-select v-model="filterStatus" placeholder="状态" clearable class="filter-select-pl">
            <el-option label="未开始" value="not_started" />
            <el-option label="进行中" value="in_progress" />
            <el-option label="已完成" value="completed" />
            <el-option label="已关闭" value="closed" />
          </el-select>
          <el-select v-model="filterMode" placeholder="模式" clearable class="filter-select-pl">
            <el-option label="独审" value="single" />
            <el-option label="会签" value="parallel" />
          </el-select>
        </div>
      </div>

      <!-- 有数据：原生表格 -->
      <div v-if="reviews.length > 0 || loading" class="table-scroll-area">
        <div v-if="loading" class="loading-overlay">
          <span class="material-symbols-outlined spin-icon">progress_activity</span>
        </div>
        <table class="pipeline-table">
          <thead>
            <tr>
              <th>评审任务名称</th>
              <th>创建人</th>
              <th>评审进度</th>
              <th>状态</th>
              <th class="th-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="review in reviews"
              :key="review.id"
              class="pipeline-row"
              @click="router.push(`/case-reviews/${review.id}`)"
            >
              <td>
                <div class="review-name-cell">
                  <span class="review-name">{{ review.name }}</span>
                  <span class="review-id-sub">
                    ID: #{{ review.id }} · {{ modeLabel(review.review_mode) }}
                  </span>
                </div>
              </td>
              <td>
                <div class="person-cell">
                  <img
                    v-if="review.created_by_avatar"
                    class="avatar-circle-img"
                    :src="getUserAvatarUrl(review.created_by_avatar)"
                    :alt="review.created_by_name || '创建人头像'"
                  />
                  <div v-else class="avatar-circle">
                    {{ getInitials(review.created_by_name || '') }}
                  </div>
                  <span class="person-name">{{ review.created_by_name || '—' }}</span>
                </div>
              </td>
              <td>
                <div class="progress-cell-pl">
                  <div class="progress-top-row">
                    <span class="progress-pct">{{ getProgressPercent(review) }}%</span>
                    <span class="progress-count">
                      {{ getReviewedCount(review) }}
                      / {{ review.case_total_count }} 条
                    </span>
                  </div>
                  <div class="progress-bar-track">
                    <div
                      class="progress-bar-fill"
                      :class="progressBarClass(review)"
                      :style="{ width: getProgressPercent(review) + '%' }"
                    ></div>
                  </div>
                  <div class="progress-result" :class="progressResultClass(review)">
                    {{ progressResultLabel(review) }}
                  </div>
                </div>
              </td>
              <td>
                <span class="status-badge-pl" :class="reviewStatusBadgeClass(review)">
                  {{ reviewStatusLabel(review) }}
                </span>
              </td>
              <td class="td-right">
                <div class="row-actions" @click.stop>
                  <button
                    class="action-btn action-edit icon-only"
                    title="查看详情"
                    @click="router.push(`/case-reviews/${review.id}`)"
                  >
                    <span class="material-symbols-outlined">visibility</span>
                  </button>
                  <button
                    class="action-btn action-ai icon-only"
                    :disabled="
                      aiRunningSet.has(review.id) ||
                      review.status === 'closed' ||
                      review.status === 'completed'
                    "
                    :title="
                      aiRunningSet.has(review.id)
                        ? 'AI 评审中…'
                        : review.status === 'closed' || review.status === 'completed'
                          ? '计划已关闭/完成，无法再运行 AI 评审'
                          : '对该任务下所有用例运行 AI 评审'
                    "
                    @click="handleRunAI(review)"
                  >
                    <span
                      class="material-symbols-outlined"
                      :class="{ 'spin-anim': aiRunningSet.has(review.id) }"
                    >
                      auto_awesome
                    </span>
                  </button>
                  <button
                    class="action-btn action-clone icon-only"
                    title="复制"
                    @click="handleCopy(review)"
                  >
                    <span class="material-symbols-outlined">content_copy</span>
                  </button>
                  <button
                    v-if="review.status !== 'closed'"
                    class="action-btn icon-only"
                    title="关闭"
                    @click="handleClose(review)"
                  >
                    <span class="material-symbols-outlined">block</span>
                  </button>
                  <button
                    class="action-btn action-delete icon-only"
                    title="删除"
                    @click="handleDelete(review)"
                  >
                    <span class="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 空状态 -->
      <div v-else class="empty-state-pl">
        <span class="material-symbols-outlined empty-icon-pl">rate_review</span>
        <h3 class="empty-title-pl">还没有评审计划</h3>
        <p class="empty-desc-pl">创建评审计划，关联测试用例，邀请团队成员进行用例评审</p>
        <button class="pipeline-btn-create" @click="router.push('/case-reviews/create')">
          <span class="material-symbols-outlined" style="font-size: 18px">add_circle</span>
          创建第一个评审计划
        </button>
      </div>

      <!-- 分页器 -->
      <div v-if="total > 0" class="pagination-bar-pl">
        <span class="pagination-info">
          显示 {{ startItem }}-{{ endItem }} 条，共 {{ total }} 条任务
        </span>
        <div class="pagination-btns">
          <button class="page-btn" :disabled="page <= 1" @click="goPage(page - 1)">
            <span class="material-symbols-outlined">chevron_left</span>
          </button>
          <button
            v-for="p in displayPages"
            :key="p"
            class="page-btn"
            :class="{ active: p === page }"
            @click="goPage(p)"
          >
            {{ p }}
          </button>
          <button class="page-btn" :disabled="page >= totalPages" @click="goPage(page + 1)">
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ─── 创建评审对话框 ─── -->
    <el-dialog
      v-model="createDialogVisible"
      title="新建评审计划"
      width="640px"
      destroy-on-close
      class="create-dialog"
    >
      <el-form label-width="100px" label-position="top">
        <el-form-item label="计划名称" required>
          <el-input
            v-model="createForm.name"
            placeholder="例：V3.2 功能评审"
            maxlength="128"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="评审模式" required>
          <el-radio-group v-model="createForm.review_mode" class="mode-radio-group">
            <el-radio-button value="single">
              <span class="mode-option">
                <span class="material-symbols-outlined" style="font-size: 18px">person</span>
                独审
              </span>
            </el-radio-button>
            <el-radio-button value="parallel">
              <span class="mode-option">
                <span class="material-symbols-outlined" style="font-size: 18px">group</span>
                会签
              </span>
            </el-radio-button>
          </el-radio-group>
          <div class="form-hint">
            <span
              class="material-symbols-outlined"
              style="font-size: 14px; vertical-align: middle; margin-right: 2px"
            >
              info
            </span>
            {{
              createForm.review_mode === 'single'
                ? '任意一人评审即出结果'
                : '所有人通过才算通过，任一人拒绝则拒绝'
            }}
          </div>
        </el-form-item>
        <el-form-item label="评审人" required>
          <el-select
            v-model="createForm.default_reviewer_ids"
            multiple
            filterable
            placeholder="选择评审人"
            style="width: 100%"
          >
            <el-option v-for="u in allUsers" :key="u.id" :label="u.name" :value="u.id">
              <span>{{ u.name }}</span>
              <span style="color: #999; font-size: 12px; margin-left: 8px">{{ u.email }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="关联用例">
          <el-select
            v-model="createForm.testcase_ids"
            multiple
            filterable
            placeholder="选择要关联的用例（可选）"
            style="width: 100%"
            :loading="loadingCases"
          >
            <el-option
              v-for="c in availableCases"
              :key="c.id"
              :label="`#${c.id} ${c.title}`"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="createForm.description"
            type="textarea"
            :rows="3"
            placeholder="评审计划描述"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- ─── 评审详情抽屉 ─── -->
    <el-drawer
      v-model="detailDrawerVisible"
      :title="currentReview?.name || '评审详情'"
      direction="rtl"
      size="55%"
    >
      <div v-if="currentReview" class="review-detail">
        <div class="detail-header">
          <el-tag :type="statusType(currentReview.status)">
            {{ statusLabel(currentReview.status) }}
          </el-tag>
          <el-tag>{{ modeLabel(currentReview.review_mode) }}</el-tag>
        </div>
        <div class="detail-stats">
          <div class="stat-card">
            <div class="stat-value">{{ currentReview.case_total_count }}</div>
            <div class="stat-label">关联用例</div>
          </div>
          <div class="stat-card approved">
            <div class="stat-value">{{ currentReview.approved_count }}</div>
            <div class="stat-label">通过</div>
          </div>
          <div class="stat-card rejected">
            <div class="stat-value">{{ currentReview.rejected_count }}</div>
            <div class="stat-label">拒绝</div>
          </div>
          <div class="stat-card pending">
            <div class="stat-value">{{ currentReview.pending_count }}</div>
            <div class="stat-label">待评审</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">
              {{ currentReview.pass_rate ? currentReview.pass_rate.toFixed(1) + '%' : '-' }}
            </div>
            <div class="stat-label">通过率</div>
          </div>
        </div>
        <div v-if="currentReview.description" class="detail-desc">
          <h4>描述</h4>
          <p>{{ currentReview.description }}</p>
        </div>
        <div class="detail-meta">
          <div>创建时间：{{ formatDate(currentReview.created_at) }}</div>
          <div>更新时间：{{ formatDate(currentReview.updated_at) }}</div>
        </div>

        <!-- 关联用例列表 -->
        <div class="detail-items-section">
          <div class="section-head">
            <h4 class="section-title">
              <span
                class="material-symbols-outlined"
                style="font-size: 18px; vertical-align: middle; margin-right: 4px"
              >
                checklist
              </span>
              关联用例 ({{ detailItemsTotal }})
            </h4>
            <el-button
              v-if="currentReview.status !== 'closed' && currentReview.status !== 'completed'"
              type="primary"
              plain
              size="small"
              @click="openDetailLinkDialog"
            >
              <span class="material-symbols-outlined" style="font-size: 14px; margin-right: 4px">
                add_link
              </span>
              关联用例
            </el-button>
          </div>
          <el-table
            v-loading="detailItemsLoading"
            :data="detailItems"
            style="width: 100%"
            size="small"
            stripe
          >
            <el-table-column label="用例" min-width="200">
              <template #default="{ row }">
                <span style="color: var(--tp-gray-500); margin-right: 4px">
                  #{{ row.testcase_id }}
                </span>
                {{ row.title_snapshot }}
              </template>
            </el-table-column>
            <el-table-column label="评审结果" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="reviewResultType(row.final_result)" size="small">
                  {{ reviewResultLabel(row.final_result) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="轮次" width="60" align="center">
              <template #default="{ row }">R{{ row.current_round_no }}</template>
            </el-table-column>
            <el-table-column
              v-if="currentReview.status !== 'closed' && currentReview.status !== 'completed'"
              label="操作"
              width="160"
              align="center"
            >
              <template #default="{ row }">
                <template v-if="row.final_result === 'pending'">
                  <el-button
                    type="success"
                    size="small"
                    plain
                    @click.stop="handleSubmitReview(row, 'approved')"
                  >
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 14px; margin-right: 2px"
                    >
                      check_circle
                    </span>
                    通过
                  </el-button>
                  <el-button
                    type="danger"
                    size="small"
                    plain
                    @click.stop="handleSubmitReview(row, 'rejected')"
                  >
                    <span
                      class="material-symbols-outlined"
                      style="font-size: 14px; margin-right: 2px"
                    >
                      cancel
                    </span>
                    驳回
                  </el-button>
                </template>
                <el-tag v-else :type="reviewResultType(row.final_result)" size="small">
                  {{ reviewResultLabel(row.final_result) }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="detailItems.length === 0 && !detailItemsLoading" class="empty-items">
            <span
              class="material-symbols-outlined"
              style="font-size: 32px; color: var(--tp-gray-400)"
            >
              inbox
            </span>
            <p>暂无关联用例</p>
          </div>
        </div>
      </div>
    </el-drawer>

    <el-dialog
      v-model="detailLinkDialogVisible"
      title="关联用例"
      width="560px"
      destroy-on-close
      class="link-dialog"
    >
      <el-select
        v-model="detailLinkCases"
        multiple
        filterable
        placeholder="搜索并选择用例"
        style="width: 100%"
        :loading="detailLinkLoading"
      >
        <el-option
          v-for="item in detailAvailableCases"
          :key="item.id"
          :label="`#${item.id} ${item.title}`"
          :value="item.id"
        />
      </el-select>
      <template #footer>
        <el-button @click="detailLinkDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="detailLinkLoading" @click="handleDetailLink">
          确定关联
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════════════
   Pipeline 暗色主题 — 用例评审列表
   ══════════════════════════════════════════════════ */

.case-review-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 24px 28px 24px;
  overflow-y: auto;
}

/* ── 页面标题 ── */
.pipeline-header {
  margin-bottom: 24px;
}
.pipeline-header-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.pipeline-title {
  font-size: 28px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 6px;
  letter-spacing: -0.02em;
}
.pipeline-subtitle {
  font-size: 14px;
  color: var(--tp-gray-400, #958da1);
  margin: 0;
  font-weight: 300;
}
.pipeline-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.pipeline-search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(74, 68, 85, 0.35);
  border-radius: 8px;
  padding: 6px 12px;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.pipeline-search-box:focus-within {
  border-color: rgba(124, 58, 237, 0.5);
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.12);
  background: rgba(255, 255, 255, 0.07);
}
.search-icon-pl {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.4);
  flex-shrink: 0;
  transition: color 0.2s;
}
.pipeline-search-box:focus-within .search-icon-pl {
  color: rgba(124, 58, 237, 0.8);
}
.pipeline-search-input {
  background: transparent;
  border: none;
  outline: none;
  color: rgba(255, 255, 255, 0.9);
  caret-color: #a78bfa;
  font-size: 13px;
  width: 390px;
}
.pipeline-search-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

/* 与用例列表页 insights-btn-primary 保持一致：纯紫色，无渐变 */
.pipeline-btn-create {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  height: 36px;
  border-radius: 8px;
  border: none;
  background: #7c3aed;
  color: #fff;
  font-weight: 500;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.25);
  font-family: inherit;
  letter-spacing: 0.5px;
}
.pipeline-btn-create .material-symbols-outlined {
  font-size: 18px !important;
}
.pipeline-btn-create:hover {
  background: #6d28d9;
  box-shadow: 0 4px 16px rgba(124, 58, 237, 0.35);
}
.pipeline-btn-create:active {
  transform: scale(0.97);
}

/* ── 统计卡片网格 ── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 28px;
}
.stat-card-pl {
  position: relative;
  overflow: hidden;
  padding: 22px 24px;
  border-radius: 12px;
  background: var(--tp-surface-card, #191b26);
  border: 1px solid rgba(74, 68, 85, 0.15);
}
.stat-bg-icon {
  position: absolute;
  top: 12px;
  right: 12px;
  opacity: 0.06;
}
.stat-bg-icon .material-symbols-outlined {
  font-size: 56px;
}
.stat-bg-icon.icon-primary {
  color: var(--tp-primary, #d2bbff);
  opacity: 0.08;
}
.stat-bg-icon.icon-emerald {
  color: #34d399;
  opacity: 0.08;
}
.stat-bg-icon.icon-error {
  color: var(--tp-danger, #ffb4ab);
  opacity: 0.08;
}
.stat-label-pl {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--tp-gray-400, #958da1);
  margin: 0 0 6px;
}
.stat-value-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.stat-num {
  font-size: 36px;
  font-weight: 700;
  color: #fff;
  line-height: 1.1;
}
.stat-sub {
  font-size: 11px;
  font-weight: 400;
}
.stat-sub.primary {
  color: var(--tp-primary-light, #d2bbff);
}
.stat-sub.emerald {
  color: #34d399;
}
.stat-sub.error {
  color: var(--tp-danger, #ffb4ab);
}
/* 淡灰辅助文本，用于 "个计划" / "不再可编辑" 等提示 */
.stat-sub-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 400;
}
/* "我评审的" tab 右侧的未读数徽标 */
.view-tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 9999px;
  background: var(--tp-danger, #ef4444);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  margin-left: 4px;
}
.view-tab-badge.badge-active {
  background: rgba(255, 255, 255, 0.25);
}
.stat-bar-track {
  margin-top: 16px;
  height: 3px;
  width: 100%;
  background: var(--tp-gray-700, #272935);
  border-radius: 4px;
  overflow: hidden;
}
.stat-bar-fill {
  height: 100%;
  border-radius: 4px;
}
.bar-secondary {
  background: var(--tp-info, #adc6ff);
}
.bar-primary {
  background: var(--tp-primary, #d2bbff);
}
.bar-emerald {
  background: #34d399;
}
.bar-error {
  background: var(--tp-danger, #ffb4ab);
}

/* ── 表格容器 ── */
.table-container-pl {
  background: var(--tp-surface-card, #1d1f2b);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.04);
  flex: 1;
  display: flex;
  flex-direction: column;
}
.table-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(74, 68, 85, 0.1);
  flex-wrap: wrap;
  gap: 12px;
}
.table-section-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}
.table-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* ── 视图切换标签 ── */
.view-tabs-pl {
  display: flex;
  gap: 0;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  padding: 3px;
}
.view-tab-pl {
  padding: 5px 12px;
  border: none;
  background: transparent;
  color: var(--tp-gray-400, #958da1);
  font-size: 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
}
.view-tab-pl.active {
  background: var(--tp-primary, #7c3aed);
  color: #fff;
}
.view-tab-pl:hover:not(.active) {
  color: #fff;
  background: rgba(255, 255, 255, 0.06);
}

/* ── 筛选下拉 ── */
/* 高度用 CSS 变量精确匹配标签组（30px = 3+5+14+5+3） */
.filter-select-pl {
  width: 90px;
  --el-component-size: 30px;
}
:deep(.filter-select-pl .el-select__wrapper) {
  background: rgba(255, 255, 255, 0.04) !important;
  box-shadow: none !important;
  border: 1px solid rgba(74, 68, 85, 0.3) !important;
  border-radius: 8px !important;
  padding: 0 10px !important;
  font-size: 12px !important;
}
:deep(.filter-select-pl .el-select__placeholder) {
  color: rgba(255, 255, 255, 0.65) !important;
  font-size: 12px !important;
}
:deep(.filter-select-pl .el-select__selected-item) {
  color: rgba(255, 255, 255, 0.85) !important;
  font-size: 12px !important;
}
:deep(.filter-select-pl .el-select__suffix .el-icon) {
  color: rgba(255, 255, 255, 0.45) !important;
  font-size: 12px !important;
}

/* ── 表格滚动区 ── */
.table-scroll-area {
  position: relative;
  flex: 1;
}
.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(17, 19, 30, 0.6);
  z-index: 10;
}
.spin-icon {
  font-size: 32px;
  color: var(--tp-primary, #d2bbff);
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* ── 原生表格 ── */
.pipeline-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
.pipeline-table thead tr {
  background: rgba(25, 27, 38, 0.5);
}
.pipeline-table th {
  padding: 14px 24px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--tp-gray-400, #958da1);
}
.th-right {
  text-align: right !important;
}
.pipeline-table tbody tr {
  border-bottom: 1px solid rgba(74, 68, 85, 0.05);
  cursor: pointer;
  transition: background 0.15s;
}
.pipeline-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.02);
}
.pipeline-table td {
  padding: 18px 24px;
  font-size: 13px;
}
.td-right {
  text-align: right;
}

/* 名称列 */
.review-name-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.review-name {
  color: #fff;
  font-weight: 500;
  font-size: 14px;
}
.review-id-sub {
  font-size: 12px;
  color: var(--tp-gray-400, #958da1);
}

/* 创建人列 */
.person-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.avatar-circle {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--tp-primary, #7c3aed), var(--tp-info, #0566d9));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.avatar-circle-img {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.person-name {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.88);
  font-weight: 500;
}

/* 进度列 */
.progress-cell-pl {
  width: 180px;
}
.progress-top-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
}
.progress-pct {
  font-size: 12px;
  color: var(--tp-primary-light, #d2bbff);
  font-weight: 600;
}
.progress-count {
  font-size: 12px;
  color: var(--tp-gray-400, #958da1);
}
.progress-bar-track {
  height: 5px;
  width: 100%;
  background: var(--tp-surface-base, #0c0e18);
  border-radius: 4px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  background: var(--tp-primary, #d2bbff);
  border-radius: 4px;
  transition: width 0.4s ease;
}
.progress-bar-fill.bar-complete {
  background: var(--tp-success, #34d399);
}
.progress-bar-fill.bar-warning {
  background: var(--tp-warning, #f59e0b);
}
.progress-bar-fill.bar-danger {
  background: var(--tp-danger, #f87171);
}
.progress-result {
  margin-top: 5px;
  font-size: 11px;
  font-weight: 600;
}
.progress-result.result-muted {
  color: var(--tp-gray-400, #958da1);
}
.progress-result.result-success {
  color: var(--tp-success, #34d399);
}
.progress-result.result-warning {
  color: var(--tp-warning, #f59e0b);
}
.progress-result.result-danger {
  color: var(--tp-danger, #f87171);
}

/* 状态药片标签 */
.status-badge-pl {
  display: inline-block;
  padding: 5px 12px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.badge-secondary {
  background: rgba(173, 198, 255, 0.1);
  color: var(--tp-info, #adc6ff);
  border: 1px solid rgba(173, 198, 255, 0.2);
}
.badge-primary {
  background: rgba(210, 187, 255, 0.1);
  color: var(--tp-primary-light, #d2bbff);
  border: 1px solid rgba(210, 187, 255, 0.2);
}
.badge-success {
  background: rgba(52, 211, 153, 0.08);
  color: var(--tp-success, #34d399);
  border: 1px solid rgba(52, 211, 153, 0.15);
}
.badge-warning {
  background: rgba(245, 158, 11, 0.1);
  color: var(--tp-warning, #f59e0b);
  border: 1px solid rgba(245, 158, 11, 0.18);
}
.badge-danger {
  background: rgba(248, 113, 113, 0.1);
  color: var(--tp-danger, #f87171);
  border: 1px solid rgba(248, 113, 113, 0.18);
}
.badge-muted {
  background: rgba(55, 56, 69, 0.5);
  color: var(--tp-gray-400, #958da1);
  border: 1px solid rgba(74, 68, 85, 0.2);
}

/* 操作按钮：使用全局 action-btn 体系与用例列表页对齐，此处仅保留 flex 容器 */
.row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

/* ── 空状态 ── */
.empty-state-pl {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
}
.empty-icon-pl {
  font-size: 56px;
  color: var(--tp-primary-light, #d2bbff);
  opacity: 0.4;
  margin-bottom: 16px;
}
.empty-title-pl {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 8px;
}
.empty-desc-pl {
  font-size: 13px;
  color: var(--tp-gray-400, #958da1);
  margin: 0 0 24px;
  text-align: center;
  max-width: 340px;
  line-height: 1.6;
}

/* ── 分页器 ── */
.pagination-bar-pl {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 24px;
  background: rgba(25, 27, 38, 0.3);
}
.pagination-info {
  font-size: 11px;
  color: var(--tp-gray-400, #958da1);
}
.pagination-btns {
  display: flex;
  gap: 6px;
}
.page-btn {
  min-width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: none;
  background: rgba(39, 41, 53, 0.8);
  color: var(--tp-gray-200, #e1e1f2);
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.page-btn .material-symbols-outlined {
  font-size: 16px;
}
.page-btn:hover:not(:disabled):not(.active) {
  background: rgba(124, 58, 237, 0.2);
}
.page-btn.active {
  background: var(--tp-primary, #7c3aed);
  color: #fff;
}
.page-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

/* ════════════════════════════════════════════════
   以下保留：对话框 / 详情抽屉 样式
   ══════════════════════════════════════════════════ */

/* ── 表单 ── */
.form-hint {
  font-size: 12px;
  color: var(--tp-gray-400);
  margin-top: 6px;
  display: flex;
  align-items: center;
}
.mode-option {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

/* ── 详情抽屉 ── */
.review-detail {
  padding: 8px;
}
.detail-header {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
}
.detail-stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}
.stat-card {
  text-align: center;
  padding: 16px 8px;
  background: var(--tp-surface-elevated);
  border-radius: var(--tp-radius-md);
  transition: transform 0.2s;
  border: 1px solid var(--tp-gray-200);
}
.stat-card:hover {
  transform: translateY(-2px);
}
.stat-card.approved .stat-value {
  color: var(--tp-success);
}
.stat-card.rejected .stat-value {
  color: var(--tp-danger);
}
.stat-card.pending .stat-value {
  color: var(--tp-warning);
}
.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--tp-gray-900);
  line-height: 1.2;
}
.stat-label {
  font-size: 12px;
  color: var(--tp-gray-500);
  margin-top: 4px;
}
.detail-desc {
  margin-bottom: 20px;
}
.detail-desc h4 {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--tp-gray-900);
}
.detail-desc p {
  font-size: 13px;
  color: var(--tp-gray-700);
  line-height: 1.6;
  margin: 0;
}
.detail-meta {
  font-size: 12px;
  color: var(--tp-gray-500);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 16px;
  border-top: 1px solid var(--tp-gray-200);
}

/* 关联用例列表 */
.detail-items-section {
  margin-top: 24px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--tp-gray-900);
  margin: 0;
  display: flex;
  align-items: center;
}
.empty-items {
  text-align: center;
  padding: 32px 16px;
  color: var(--tp-gray-400);
}
.empty-items p {
  margin: 8px 0 0;
  font-size: 13px;
}
</style>
