/**
 * useCaseReviewList — 用例评审列表业务逻辑 Composable
 *
 * 职责：封装评审流程列表页（CaseReviewPage.vue）的全部业务逻辑，包括
 *   - 列表加载 / 项目级统计汇总（并行拉取）
 *   - 分页 / 视图切换（全部 · 我创建的 · 我评审的）/ 状态 · 模式筛选
 *   - 搜索关键词防抖 + AbortController 竞态控制
 *   - 筛选条件与 URL query 双向同步（刷新不丢状态）
 *   - 行级操作：删除 / 关闭 / 复制评审计划
 *
 * 使用约束：
 *   - 仅供 CaseReviewPage.vue 消费；详情抽屉与创建向导均为独立页面（router）
 *   - 错误提示统一在此处理，API 层保持无 UI 逻辑（前端铁律）
 *
 * @module useCaseReviewList
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'

import { useProjectStore } from '../stores/project'
import {
  listReviews,
  getReviewSummary,
  deleteReview,
  closeReview,
  copyReview,
  type CaseReview,
  type ReviewListParams,
  type ReviewSummary,
} from '../api/caseReview'
import { extractErrorMessage, isAbortError, isElMessageBoxCancel } from '../utils/error'

/** 列表视图维度：全部 / 我创建的 / 我评审的 */
export type ReviewViewMode = 'all' | 'created' | 'assigned'

/** 默认评审汇总数据（所有字段 0），避免模板首帧访问 undefined */
const emptySummary: ReviewSummary = {
  total_plans: 0,
  not_started_plans: 0,
  in_progress_plans: 0,
  completed_plans: 0,
  closed_plans: 0,
  my_pending_items: 0,
}

/** 搜索防抖时间（毫秒）；小于后端最短响应，避免按键中途发请求 */
const SEARCH_DEBOUNCE_MS = 350

export function useCaseReviewList() {
  const projectStore = useProjectStore()
  const route = useRoute()
  const router = useRouter()

  /** 当前项目 ID；切换项目会触发列表重载 */
  const selectedProjectId = computed(() => projectStore.selectedProjectId)

  // ── 列表状态 ──
  const loading = ref(false)
  const reviews = ref<CaseReview[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(10)

  // ── 筛选状态（初始值从 URL query 读取，刷新不丢失） ──
  const viewMode = ref<ReviewViewMode>(parseViewMode(route.query.view))
  const filterStatus = ref(parseString(route.query.status))
  const filterMode = ref(parseString(route.query.mode))
  const searchKeyword = ref(parseString(route.query.q))

  // ── 项目级汇总（四个统计卡片的数据源） ──
  const summary = ref<ReviewSummary>({ ...emptySummary })

  // ── 竞态控制：每次发起列表请求时取消上一次未完成的请求 ──
  let listController: AbortController | null = null
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

  // ───────────────────────────── 数据加载 ─────────────────────────────

  /**
   * 拉取评审列表 + 项目级汇总（并行）。
   * 每次调用会先 abort 上一次未完成的列表请求，防止 stale 数据覆盖新结果。
   */
  async function fetchList() {
    if (!selectedProjectId.value) return
    listController?.abort()
    listController = new AbortController()

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
      const resp = await listReviews(selectedProjectId.value, params, {
        signal: listController.signal,
      })
      reviews.value = resp?.items || []
      total.value = resp?.total || 0
    } catch (err) {
      if (isAbortError(err) || axios.isCancel(err)) return
      reviews.value = []
      total.value = 0
      ElMessage.error(extractErrorMessage(err, '加载评审列表失败'))
    } finally {
      loading.value = false
    }
  }

  /** 拉取项目级评审汇总（四个卡片 + 徽标数据）。失败静默，不阻塞列表渲染。 */
  async function fetchSummary() {
    if (!selectedProjectId.value) return
    try {
      summary.value = await getReviewSummary(selectedProjectId.value)
    } catch (err) {
      // 汇总失败不影响主流程，仅在开发环境记录
      if (import.meta.env.DEV) console.warn('[useCaseReviewList] summary 拉取失败', err)
    }
  }

  /** 并行刷新列表和汇总，用于创建 / 删除 / 关闭 / 复制后统一调用 */
  async function refreshAll() {
    await Promise.all([fetchList(), fetchSummary()])
  }

  // ───────────────────────────── 筛选变化联动 ─────────────────────────────

  // 项目 / 视图 / 状态 / 模式 变化：重置到第 1 页后拉取
  watch([selectedProjectId, viewMode, filterStatus, filterMode], () => {
    page.value = 1
    fetchList()
    fetchSummary()
    syncQuery()
  })

  // 页码 / 每页条数变化：不重置页码直接拉取
  watch([page, pageSize], () => {
    fetchList()
  })

  // 搜索关键词：防抖 350ms，回车由 submitSearch 立即触发
  watch(searchKeyword, () => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => {
      page.value = 1
      fetchList()
      syncQuery()
    }, SEARCH_DEBOUNCE_MS)
  })

  /** 立即执行搜索（取消防抖），用于回车键 */
  function submitSearch() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    page.value = 1
    fetchList()
    syncQuery()
  }

  /** 清空所有筛选（重置到"全部"视图、无搜索、无状态/模式筛选） */
  function clearFilters() {
    viewMode.value = 'all'
    filterStatus.value = ''
    filterMode.value = ''
    searchKeyword.value = ''
    // 上面 watch 会自动重置 page 并拉取
  }

  // ───────────────────────────── URL 同步 ─────────────────────────────

  /** 将筛选条件写回 URL query，保证刷新 / 分享链接时状态完整保留 */
  function syncQuery() {
    const nextQuery: Record<string, string> = {}
    if (viewMode.value !== 'all') nextQuery.view = viewMode.value
    if (filterStatus.value) nextQuery.status = filterStatus.value
    if (filterMode.value) nextQuery.mode = filterMode.value
    if (searchKeyword.value) nextQuery.q = searchKeyword.value
    router.replace({ name: 'CaseReviews', query: nextQuery }).catch(() => {
      // 忽略 NavigationDuplicated 等无害错误
    })
  }

  // ───────────────────────────── 行级操作 ─────────────────────────────

  /**
   * 删除评审计划（含连带的评审项 / 记录，后端级联）。
   * 二次确认文案强调"不可恢复"，避免用户误操作。
   */
  async function removeReview(review: CaseReview) {
    const projectId = selectedProjectId.value
    if (!projectId) return
    try {
      await ElMessageBox.confirm(
        `确定删除评审计划「${review.name}」？\n此操作将一并删除 ${review.case_total_count} 条评审项及所有评审记录，不可恢复。`,
        '删除确认',
        { type: 'warning', confirmButtonText: '确定删除', cancelButtonText: '取消' },
      )
      await deleteReview(projectId, review.id)
      ElMessage.success('已删除')
      await refreshAll()
    } catch (err) {
      if (isElMessageBoxCancel(err)) return
      ElMessage.error(extractErrorMessage(err, '删除失败'))
    }
  }

  /** 关闭评审计划（关闭后不可再编辑，但保留历史记录） */
  async function close(review: CaseReview) {
    const projectId = selectedProjectId.value
    if (!projectId) return
    try {
      await ElMessageBox.confirm(
        `确定关闭评审计划「${review.name}」？关闭后不可编辑，但历史记录保留。`,
        '关闭确认',
        { type: 'warning' },
      )
      await closeReview(projectId, review.id)
      ElMessage.success('已关闭')
      await refreshAll()
    } catch (err) {
      if (isElMessageBoxCancel(err)) return
      ElMessage.error(extractErrorMessage(err, '关闭失败'))
    }
  }

  /**
   * 复制评审计划。默认连同用例一起复制，重置评审人列表由调用方控制。
   *
   * @param review - 源评审计划
   * @param options - 复制选项（name 自定义 / reset_reviewers 是否清空评审人）
   */
  async function copy(
    review: CaseReview,
    options: { name?: string; include_cases?: boolean; reset_reviewers?: boolean } = {},
  ) {
    const projectId = selectedProjectId.value
    if (!projectId) return
    try {
      await copyReview(projectId, review.id, {
        include_cases: options.include_cases ?? true,
        ...options,
      })
      ElMessage.success('已复制')
      await refreshAll()
    } catch (err) {
      ElMessage.error(extractErrorMessage(err, '复制失败'))
    }
  }

  // ───────────────────────────── 初始挂载 ─────────────────────────────

  onMounted(() => {
    refreshAll()
  })

  return {
    // state
    loading,
    reviews,
    total,
    page,
    pageSize,
    viewMode,
    filterStatus,
    filterMode,
    searchKeyword,
    summary,
    selectedProjectId,
    // actions
    fetchList,
    fetchSummary,
    refreshAll,
    submitSearch,
    clearFilters,
    removeReview,
    close,
    copy,
  }
}

// ───────────────────────────── 内部工具 ─────────────────────────────

/** 解析路由 query 中的字符串参数（数组取第一项） */
function parseString(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return ''
}

/** 解析视图模式：不合法值回退到 'all' */
function parseViewMode(value: unknown): ReviewViewMode {
  const str = parseString(value)
  return str === 'created' || str === 'assigned' ? str : 'all'
}
