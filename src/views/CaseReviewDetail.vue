<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  rerunAIGate,
  DEFECT_STATUS,
  type CaseReviewDefect,
  type ReviewSeverity,
} from '../api/caseReviewV02'
import { useReviewDefects } from '@/composables/useReviewDefects'
import { getTestCase } from '../api/testcase'
import type { TestCase } from '../api/types'
import {
  getReview,
  listReviewItems,
  linkItems,
  submitItemReview,
  listItemRecords,
  type CaseReview,
  type CaseReviewItem,
  type CaseReviewRecord,
  type ReviewItemListParams,
} from '@/api/caseReview'
import {
  uploadReviewAttachment,
  listReviewAttachmentsByItem,
  deleteReviewAttachment,
  downloadReviewAttachment,
  type CaseReviewAttachment,
} from '@/api/caseReviewAttachment'
import { apiClient } from '@/api/client'
import { useProjectStore } from '@/stores/project'
import { useAuthStore } from '@/stores/auth'
import { extractErrorMessage, isElMessageBoxCancel } from '@/utils/error'
import { parseTestCaseStepsToRows } from '@/utils/testCaseSteps'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const authStore = useAuthStore()

const reviewId = computed(() => Number(route.params.reviewId) || 0)
const projectId = computed(() => projectStore.selectedProjectId || 0)

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
const activeReviewField = ref<ReviewFieldKey | null>(null)
let activeReviewFieldTimer: number | undefined

type ReviewDecision = 'approved' | 'rejected' | 'needs_update'
const reviewDecision = ref<ReviewDecision | null>(null)
const reviewComment = ref('')

const isActive = computed(
  () => review.value?.status === 'in_progress' || review.value?.status === 'not_started',
)

// 用户列表
const allUsers = ref<{ id: number; name: string; avatar?: string }[]>([])
// 可用用例列表
const availableCases = ref<{ id: number; title: string }[]>([])

// 关联对话框
const linkDialogVisible = ref(false)
const linkCases = ref<number[]>([])
const linkLoading = ref(false)

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
    const resp = await listItemRecords(projectId.value, reviewId.value, currentItem.value.id, {
      page: 1,
      pageSize: 50,
    })
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
const attachmentPreviewUrls = ref<Record<number, string>>({})
const attachmentPreviewDialogVisible = ref(false)
const previewingAttachment = ref<CaseReviewAttachment | null>(null)
let attachmentPreviewRunId = 0

const IMAGE_ATTACHMENT_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'])

function getAttachmentExtension(fileName: string) {
  const ext = fileName.trim().toLowerCase().split('.').pop()
  return ext && ext !== fileName.toLowerCase() ? ext : ''
}

function isImageAttachment(att: CaseReviewAttachment) {
  const mimeType = att.mime_type?.toLowerCase() || ''
  return (
    mimeType.startsWith('image/') ||
    IMAGE_ATTACHMENT_EXTENSIONS.has(getAttachmentExtension(att.file_name))
  )
}

function clearAttachmentPreviewUrls() {
  Object.values(attachmentPreviewUrls.value).forEach((url) => URL.revokeObjectURL(url))
  attachmentPreviewUrls.value = {}
  attachmentPreviewDialogVisible.value = false
  previewingAttachment.value = null
}

function removeAttachmentPreviewUrl(attachmentId: number) {
  const next = { ...attachmentPreviewUrls.value }
  const url = next[attachmentId]
  if (url) URL.revokeObjectURL(url)
  delete next[attachmentId]
  attachmentPreviewUrls.value = next
}

const previewingAttachmentUrl = computed(() =>
  previewingAttachment.value ? attachmentPreviewUrls.value[previewingAttachment.value.id] : '',
)

function openAttachmentPreview(att: CaseReviewAttachment) {
  if (!isImageAttachment(att) || !attachmentPreviewUrls.value[att.id]) return
  previewingAttachment.value = att
  attachmentPreviewDialogVisible.value = true
}

async function hydrateAttachmentPreviewUrls(list: CaseReviewAttachment[]) {
  const runId = ++attachmentPreviewRunId
  clearAttachmentPreviewUrls()
  const imageAttachments = list.filter(isImageAttachment)
  const previewProjectId = projectId.value
  if (!previewProjectId || imageAttachments.length === 0) return

  const nextUrls: Record<number, string> = {}
  await Promise.all(
    imageAttachments.map(async (att) => {
      try {
        const blob = await downloadReviewAttachment(previewProjectId, att.id)
        const url = URL.createObjectURL(blob)
        if (runId !== attachmentPreviewRunId) {
          URL.revokeObjectURL(url)
          return
        }
        nextUrls[att.id] = url
        attachmentPreviewUrls.value = { ...nextUrls }
      } catch {
        /* 图片预览失败时保留文件卡片，不阻断附件列表 */
      }
    }),
  )
}

async function loadAttachments() {
  if (!projectId.value || !reviewId.value || !currentItem.value) {
    attachments.value = []
    clearAttachmentPreviewUrls()
    return
  }
  attachmentsLoading.value = true
  clearAttachmentPreviewUrls()
  try {
    const list = await listReviewAttachmentsByItem(
      projectId.value,
      reviewId.value,
      currentItem.value.id,
    )
    attachments.value = list
    void hydrateAttachmentPreviewUrls(list)
  } catch {
    attachments.value = []
    clearAttachmentPreviewUrls()
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
    await uploadReviewAttachment(projectId.value, reviewId.value, currentItem.value.id, file)
    ElMessage.success('上传成功')
    await loadAttachments()
  } catch (err: unknown) {
    ElMessage.error(extractErrorMessage(err, '上传失败'))
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
    await deleteReviewAttachment(projectId.value, att.id)
    ElMessage.success('已删除')
    await loadAttachments()
  } catch (err: unknown) {
    if (isElMessageBoxCancel(err)) return
    ElMessage.error(extractErrorMessage(err, '删除失败'))
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
  } catch (err: unknown) {
    ElMessage.error(extractErrorMessage(err, '下载失败'))
  }
}

function formatFileSize(size: number) {
  if (!size) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

// ── 加载数据 ──
async function fetchReview() {
  try {
    const resp = await getReview(projectId.value, reviewId.value)
    review.value = resp
  } catch {
    /* ignore */
  }
}

// ── v0.2 规则检查（计划级批量已移到列表页） ──
const aiReviewRunning = ref(false)

/** 点击"规则检查"按钮：对当前评审项跑规则引擎；
 *  计划级批量规则检查入口已挪到列表页每行操作区，避免详情页误伤他人正在处理的条目。 */
async function handleRunAIReview() {
  if (!projectId.value || !reviewId.value || !currentItem.value) return
  const itemId = currentItem.value.id
  aiReviewRunning.value = true
  try {
    const report = await rerunAIGate(projectId.value, reviewId.value, itemId)
    // 刷新 items 令当前 item 的 ai_gate_status 同步；同时刷 defects
    await fetchItems()
    await fetchAIDefects(projectId.value, reviewId.value, itemId)
    if (report.passed) {
      ElMessage.success('检查通过')
    } else if (report.auto_review_status === 'submitted') {
      ElMessage.warning('检查未通过，已自动打回修订')
    } else if (report.auto_review_status === 'already') {
      ElMessage.warning('检查未通过，已存在自动打回记录')
    } else if (report.auto_review_status === 'skipped') {
      ElMessage.warning(report.auto_review_message || '检查未通过，未自动打回')
    } else if (report.auto_review_status === 'error') {
      ElMessage.error(report.auto_review_message || '检查未通过，自动打回失败')
    } else {
      ElMessage.warning('检查未通过，查看规则门禁')
    }
  } catch (e) {
    ElMessage.error(extractErrorMessage(e, '规则检查失败'))
  } finally {
    aiReviewRunning.value = false
  }
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
    restoreCurrentItemFromRoute()
  } catch {
    /* ignore */
  } finally {
    loading.value = false
  }
}

async function fetchUsers() {
  try {
    const { data } = await apiClient.get<{ id: number; name: string; avatar?: string }[]>(
      '/users/lookup',
      {
        params: { page: 1, pageSize: 200 },
      },
    )
    allUsers.value = data || []
  } catch {
    /* ignore */
  }
}

async function fetchAvailableCases() {
  try {
    const { data } = await apiClient.get<{ items: { id: number; title: string }[] }>(
      `/projects/${projectId.value}/testcases`,
      { params: { page: 1, pageSize: 500 } },
    )
    availableCases.value = data.items || []
  } catch {
    /* ignore */
  }
}

// ── 辅助函数 ──
function routeItemId() {
  const raw = route.query.itemId
  const value = Array.isArray(raw) ? raw[0] : raw
  const itemId = Number(value)
  return Number.isFinite(itemId) && itemId > 0 ? itemId : 0
}

function restoreCurrentItemFromRoute() {
  const itemId = routeItemId()
  if (itemId) {
    const index = items.value.findIndex((item) => item.id === itemId)
    if (index >= 0) {
      currentItemIndex.value = index
      return
    }
  }
  if (currentItemIndex.value >= items.value.length) {
    currentItemIndex.value = Math.max(0, items.value.length - 1)
  }
}

function syncCurrentItemToRoute(itemId: number) {
  if (!itemId || routeItemId() === itemId) return
  router
    .replace({
      path: route.path,
      query: { ...route.query, itemId: String(itemId) },
      hash: route.hash,
    })
    .catch(() => {
      /* ignore */
    })
}

function selectItemIndex(index: number) {
  if (index < 0 || index >= items.value.length) return
  currentItemIndex.value = index
}

function resultClass(result: string) {
  if (result === 'approved') return 'approved'
  if (result === 'rejected') return 'rejected'
  if (result === 'needs_update') return 'needs-update'
  return 'pending'
}
function resultLabel(result: string) {
  const map: Record<string, string> = {
    pending: '待评审',
    approved: '通过',
    rejected: '拒绝',
    needs_update: '打回修订',
  }
  return map[result] || result
}

function resultIcon(result: string) {
  const map: Record<string, string> = {
    approved: 'check_circle',
    rejected: 'block',
    needs_update: 'edit_note',
  }
  return map[result] || 'pending_actions'
}
function reviewerUser(reviewerId: number) {
  return allUsers.value.find((user) => user.id === reviewerId)
}
function reviewerName(record: CaseReviewRecord) {
  return (
    record.reviewer_name ||
    reviewerUser(record.reviewer_id)?.name ||
    `评审人 #${record.reviewer_id}`
  )
}
function reviewerAvatarUrl(record: CaseReviewRecord) {
  const name = reviewerName(record)
  return authStore.resolveAvatarUrl(
    record.reviewer_avatar || reviewerUser(record.reviewer_id)?.avatar,
    name,
  )
}
function onReviewerAvatarError(event: Event, name: string) {
  authStore.handleAvatarError(event, name)
}

function formatDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
}

// ── 导航 ──
function goNextItem() {
  selectItemIndex(currentItemIndex.value + 1)
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
    const entries = linkCases.value.map((id) => ({ testcase_id: id }))
    await linkItems(projectId.value, reviewId.value, entries, true)
    ElMessage.success(`已关联 ${linkCases.value.length} 条用例`)
    linkDialogVisible.value = false
    fetchReview()
    fetchItems()
  } catch (e: unknown) {
    ElMessage.error(extractErrorMessage(e, '关联失败'))
  } finally {
    linkLoading.value = false
  }
}

// ── 提交评审 ──
async function handleSubmitReview() {
  if (!currentItem.value || !reviewDecision.value) return
  submitting.value = true
  try {
    await submitItemReview(
      projectId.value,
      reviewId.value,
      currentItem.value.id,
      reviewDecision.value,
      reviewComment.value,
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
  } catch (e: unknown) {
    ElMessage.error(extractErrorMessage(e, '提交失败'))
  } finally {
    submitting.value = false
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
      const resp = await listItemRecords(projectId.value, reviewId.value, item.id, {
        page: 1,
        pageSize: 50,
      })
      records.value = resp.items || []
    } catch {
      /* ignore */
    } finally {
      recordsLoading.value = false
    }
  } else {
    // 点的就是当前用例，保险起见刷一次最新记录
    await loadCurrentItemRecords()
  }
}

// ── 真实用例详情：切换评审项时按需拉取 testcase（获取 steps / precondition / postcondition） ──
const currentTestCase = ref<TestCase | null>(null)
const testCaseLoading = ref(false)

async function loadCurrentTestCase() {
  const item = currentItem.value
  if (!projectId.value || !item?.testcase_id) {
    currentTestCase.value = null
    return
  }
  testCaseLoading.value = true
  try {
    currentTestCase.value = await getTestCase(projectId.value, item.testcase_id)
  } catch {
    currentTestCase.value = null
  } finally {
    testCaseLoading.value = false
  }
}

/** 把 steps 字符串切成结构化行，兼容生成链路遗留的 JSON 数组。 */
function parseSteps(raw?: string): Array<{ no: string; action: string; expected: string }> {
  return parseTestCaseStepsToRows(raw ?? '')
    .filter((row) => row.action || row.expected)
    .map((row, i) => {
      return {
        no: String(i + 1).padStart(2, '0'),
        action: row.action,
        expected: row.expected,
      }
    })
}

const realSteps = computed(() => parseSteps(currentTestCase.value?.steps))
const realPrecondition = computed(() => currentTestCase.value?.precondition?.trim() ?? '')
const realPostcondition = computed(() => currentTestCase.value?.postcondition?.trim() ?? '')

// ── 设计稿派生数据：规则门禁卡、条件 checklist ──

/** 把多行文本切成单行 checklist；同时支持换行 / 中英文分号。 */
function parseConditionLines(raw?: string): string[] {
  const text = (raw ?? '').trim()
  if (!text) return []
  let parts = text
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length <= 1) {
    parts = text
      .split(/[;；]+/)
      .map((p) => p.trim())
      .filter(Boolean)
  }
  return parts
}

const preconditionItems = computed(() => parseConditionLines(realPrecondition.value))
const postconditionItems = computed(() => parseConditionLines(realPostcondition.value))

/** 设计稿 3 张规则门禁卡：基础信息 / 执行条件 / 执行步骤 */
type AIGateCardStatus = 'PASS' | 'WARN' | 'FAIL' | 'IDLE'
type DimensionKey = 'basic' | 'conditions' | 'steps'
type ReviewFieldKey =
  | 'title'
  | 'level'
  | 'module'
  | 'precondition'
  | 'postcondition'
  | 'steps'
  | 'case'

/** 统一的卡内展示项（来源可能是后端 defect 或前端静态校验） */
type CardFindingStatus = 'open' | 'resolved' | 'disputed' | 'pending'
interface CardFinding {
  /** defect 有持久化 id 可以 resolve/dispute；static 是前端即时推导，只读提示 */
  kind: 'defect' | 'static'
  /** v-for key（defect 用 `defect-<id>`，static 用 `static-<rule>`） */
  key: string
  /** 规则名（作为去重键；后端 defect 从 title 前缀解析） */
  rule: string
  /** 完整展示文本，格式与后端 defect.title 保持一致（"<规则名>：<message>"） */
  title: string
  fieldKey: ReviewFieldKey
  fieldLabel: string
  severity: ReviewSeverity
  status: CardFindingStatus
  dispute_reason?: string
  resolve_note?: string
  /** kind === 'defect' 时持有后端 defect，用于调用 resolve/dispute/reopen API */
  defect?: CaseReviewDefect
}

interface AIGateCard {
  key: DimensionKey
  title: string
  desc: string
  icon: string
  accent: 'secondary' | 'primary' | 'tertiary'
  status: AIGateCardStatus
  /** 该维度下所有可展示项：后端 defect + 前端静态 finding 去重合并 */
  findings: CardFinding[]
}

/**
 * Layer 1 规则引擎产出的 8 条规则到 3 个维度的映射。
 * 规则名与后端 `reviewrule/engine.go` 的 Rule 字段严格对齐（defect.title 形如 "<规则名>：<message>"）。
 * 若后端扩展新规则尚未同步到前端，兜底到 basic，避免落入不存在的维度。
 */
const RULE_DIMENSION_MAP: Record<string, DimensionKey> = {
  标题必填: 'basic',
  标题过长: 'basic',
  模块目录必填: 'basic',
  前置条件必填: 'conditions',
  步骤必填: 'steps',
  步骤过于简略: 'steps',
  后置条件建议补充: 'conditions',
  等级必填: 'basic',
}

const RULE_FIELD_MAP: Record<string, ReviewFieldKey> = {
  标题必填: 'title',
  标题过长: 'title',
  模块目录必填: 'module',
  前置条件必填: 'precondition',
  步骤必填: 'steps',
  步骤过于简略: 'steps',
  后置条件建议补充: 'postcondition',
  等级必填: 'level',
}

const REVIEW_FIELD_LABEL: Record<ReviewFieldKey, string> = {
  title: '标题',
  level: '等级',
  module: '模块',
  precondition: '前置条件',
  postcondition: '后置条件',
  steps: '执行步骤',
  case: '用例信息',
}

function ruleFieldKey(rule: string): ReviewFieldKey {
  return RULE_FIELD_MAP[rule] ?? 'case'
}

/** 历史数据会把未绑定目录存成 /未分类，规则层统一视为未归属。 */
function isModuleUnbound(tc: TestCase | null) {
  const modulePath = (tc?.module_path ?? '').trim().replace(/^\/+|\/+$/g, '')
  return !tc || !tc.module_id || !modulePath || modulePath === '未分类'
}

/**
 * 前端静态规则表：mirror 后端 `reviewrule.Evaluate`，用于在规则门禁**未运行**或
 * **已处理但字段仍空**的情况下，立即把用例的合规问题反馈到维度卡上，避免出现
 * "用例字段空但维度卡显示 PASS" 的误导。
 *
 * 与后端保持同步的规则：
 *   - title 必填 / 过长、module 必填、precondition 必填、steps 必填 / 过短、postcondition 建议、level 必填
 * 该表变更时必须同步 `engine.go`。
 */
const STATIC_RULES: Array<{
  key: string
  rule: string
  severity: ReviewSeverity
  dimension: DimensionKey
  predicate: (tc: TestCase | null) => { fail: boolean; message: string }
}> = [
  {
    key: 'RULE_TITLE_REQUIRED',
    rule: '标题必填',
    severity: 'critical',
    dimension: 'basic',
    predicate: (tc) => ({ fail: !tc?.title?.trim(), message: '用例标题为空' }),
  },
  {
    key: 'RULE_TITLE_LEN_MAX',
    rule: '标题过长',
    severity: 'minor',
    dimension: 'basic',
    predicate: (tc) => {
      const t = tc?.title?.trim() ?? ''
      return { fail: [...t].length > 120, message: '标题字符数超过 120，建议精简' }
    },
  },
  {
    key: 'RULE_MODULE_REQUIRED',
    rule: '模块目录必填',
    severity: 'major',
    dimension: 'basic',
    predicate: (tc) => ({
      fail: isModuleUnbound(tc),
      message: '用例未绑定模块目录，请在用例库中归属到具体目录',
    }),
  },
  {
    key: 'RULE_PRECONDITION_REQUIRED',
    rule: '前置条件必填',
    severity: 'major',
    dimension: 'conditions',
    predicate: (tc) => ({
      fail: !tc?.precondition?.trim(),
      message: '用例前置条件为空，评审人无法判断执行前提',
    }),
  },
  {
    key: 'RULE_STEPS_REQUIRED',
    rule: '步骤必填',
    severity: 'critical',
    dimension: 'steps',
    predicate: (tc) => ({ fail: !tc?.steps?.trim(), message: '用例步骤为空' }),
  },
  {
    key: 'RULE_STEPS_MIN_LEN',
    rule: '步骤过于简略',
    severity: 'major',
    dimension: 'steps',
    predicate: (tc) => {
      const s = tc?.steps?.trim() ?? ''
      return {
        fail: s.length > 0 && [...s].length < 20,
        message: '步骤字符数过少，建议补充操作细节与预期结果',
      }
    },
  },
  {
    key: 'RULE_POSTCONDITION_REQUIRED',
    rule: '后置条件建议补充',
    severity: 'minor',
    dimension: 'conditions',
    predicate: (tc) => ({
      fail: !tc?.postcondition?.trim(),
      message: '后置条件为空，建议补充清理/回滚逻辑',
    }),
  },
  {
    key: 'RULE_LEVEL_REQUIRED',
    rule: '等级必填',
    severity: 'major',
    dimension: 'basic',
    predicate: (tc) => ({
      fail: !tc?.level?.trim(),
      message: '用例等级为空，无法纳入回归范围评估',
    }),
  },
]

/** 接入规则门禁 defects（按 item 切换自动刷新） */
const {
  defects: aiDefects,
  loading: aiDefectsLoading,
  fetchDefects: fetchAIDefects,
  cancel: cancelAIDefects,
} = useReviewDefects()

onBeforeUnmount(cancelAIDefects)

/** severity 权重，用于同维度内按严重度排序 */
const SEVERITY_WEIGHT: Record<ReviewSeverity, number> = { critical: 3, major: 2, minor: 1 }

/** defect.status 在"活跃度"维度的权重（open > disputed > resolved），用于冲突时选更活跃的那条 */
const STATUS_WEIGHT: Record<string, number> = { open: 3, disputed: 2, resolved: 1 }
const ACTIVE_FINDING_STATUSES: CardFindingStatus[] = ['open', 'pending', 'disputed']

function isActiveFinding(finding: CardFinding) {
  return ACTIVE_FINDING_STATUSES.includes(finding.status)
}

const aiGateCards = computed<AIGateCard[]>(() => {
  // 1) 先把后端 defects 按规则名归档。同规则多条时选 status 最"活跃"的那条。
  const defectByRule = new Map<string, CaseReviewDefect>()
  for (const d of aiDefects.value) {
    const rule = d.title.split('：')[0]?.trim() ?? ''
    const prev = defectByRule.get(rule)
    if (!prev || (STATUS_WEIGHT[d.status] ?? 0) > (STATUS_WEIGHT[prev.status] ?? 0)) {
      defectByRule.set(rule, d)
    }
  }

  // 2) 跑前端静态规则，得到当前用例"即时"问题集合（与后端可能不一致）
  const tc = currentTestCase.value
  const staticHits = STATIC_RULES.map((r) => ({ r, res: r.predicate(tc) })).filter(
    ({ res }) => res.fail,
  )

  const byDim: Record<DimensionKey, CardFinding[]> = {
    basic: [],
    conditions: [],
    steps: [],
  }
  const handledRules = new Set<string>()

  // 3) 静态命中的规则：优先用后端 defect 展示（有 id + 可处理）；否则降级为静态提示
  for (const { r, res } of staticHits) {
    handledRules.add(r.rule)
    const backend = defectByRule.get(r.rule)
    if (backend && backend.status !== DEFECT_STATUS.Resolved) {
      // 后端有活跃 defect（open / disputed）：用它
      const fieldKey = ruleFieldKey(r.rule)
      byDim[r.dimension].push({
        kind: 'defect',
        key: `defect-${backend.id}`,
        rule: r.rule,
        title: backend.title,
        fieldKey,
        fieldLabel: REVIEW_FIELD_LABEL[fieldKey],
        severity: backend.severity,
        status: backend.status,
        dispute_reason: backend.dispute_reason,
        resolve_note: backend.resolve_note,
        defect: backend,
      })
    } else {
      // 无后端 defect，或 defect 已 resolved 但字段仍空 → 用静态展示（提示用户重新运行规则检查）
      const fieldKey = ruleFieldKey(r.rule)
      byDim[r.dimension].push({
        kind: 'static',
        key: `static-${r.key}`,
        rule: r.rule,
        title: `${r.rule}：${res.message}`,
        fieldKey,
        fieldLabel: REVIEW_FIELD_LABEL[fieldKey],
        severity: r.severity,
        status: 'pending',
      })
    }
  }

  // 4) 后端有、静态未命中的规则（用例已补齐但历史 defect 尚未处理）：保留展示但标状态
  for (const d of aiDefects.value) {
    const rule = d.title.split('：')[0]?.trim() ?? ''
    if (handledRules.has(rule)) continue
    if (d.status === DEFECT_STATUS.Resolved) continue
    const dim = RULE_DIMENSION_MAP[rule] ?? 'basic'
    const fieldKey = ruleFieldKey(rule)
    byDim[dim].push({
      kind: 'defect',
      key: `defect-${d.id}`,
      rule,
      title: d.title,
      fieldKey,
      fieldLabel: REVIEW_FIELD_LABEL[fieldKey],
      severity: d.severity,
      status: d.status,
      dispute_reason: d.dispute_reason,
      resolve_note: d.resolve_note,
      defect: d,
    })
  }

  // 5) 排序：critical > major > minor；同级内 open > disputed > pending > resolved
  for (const k of Object.keys(byDim) as DimensionKey[]) {
    byDim[k].sort((a, b) => {
      const s = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]
      if (s !== 0) return s
      return (STATUS_WEIGHT[b.status] ?? 0) - (STATUS_WEIGHT[a.status] ?? 0)
    })
  }

  // 6) 卡状态推导：critical 未处理 → FAIL；major 未处理 → WARN；仅 minor → WARN
  const gate = currentItem.value?.ai_gate_status
  function deriveStatus(findings: CardFinding[]): AIGateCardStatus {
    if (findings.length === 0) {
      // 无问题：未跑过规则检查且用例合规 → IDLE；跑过通过 → PASS
      if (gate === 'passed' || gate === 'bypassed') return 'PASS'
      if (gate === 'timeout') return 'FAIL'
      if (!gate || gate === 'not_started') return 'IDLE'
      return 'PASS'
    }
    if (findings.some((f) => f.severity === 'critical' && isActiveFinding(f))) return 'FAIL'
    if (findings.some((f) => f.severity === 'major' && isActiveFinding(f))) return 'WARN'
    return 'WARN'
  }

  function deriveDesc(findings: CardFinding[], fallback: string): string {
    const activeFindings = findings.filter(isActiveFinding)
    if (activeFindings.length === 0) return fallback
    const labels = Array.from(new Set(activeFindings.map((f) => f.fieldLabel))).filter(Boolean)
    if (labels.length === 0) return `${activeFindings.length} 项待完善`
    if (labels.length === 1) return `${labels[0]}待完善`
    if (labels.length <= 2) return `${labels.join('、')}待完善`
    return `${labels.slice(0, 2).join('、')}等 ${labels.length} 项待完善`
  }

  return [
    {
      key: 'basic',
      title: '基础信息',
      desc: deriveDesc(byDim.basic, '标题与等级信息完整。'),
      icon: 'badge',
      accent: 'primary',
      status: deriveStatus(byDim.basic),
      findings: byDim.basic,
    },
    {
      key: 'conditions',
      title: '执行条件',
      desc: deriveDesc(byDim.conditions, '前置条件与后置条件已补充。'),
      icon: 'rule',
      accent: 'tertiary',
      status: deriveStatus(byDim.conditions),
      findings: byDim.conditions,
    },
    {
      key: 'steps',
      title: '执行步骤',
      desc: deriveDesc(byDim.steps, '执行步骤完整且具备可操作性。'),
      icon: 'list_alt',
      accent: 'secondary',
      status: deriveStatus(byDim.steps),
      findings: byDim.steps,
    },
  ]
})

function cardHasActiveFinding(card: AIGateCard) {
  return card.findings.some(isActiveFinding)
}

const aiProblemCards = computed(() => aiGateCards.value.filter(cardHasActiveFinding))

const aiGateEmptyTitle = computed(() => {
  const gate = currentItem.value?.ai_gate_status
  if (gate === 'timeout') return '规则门禁运行超时'
  if (!gate || gate === 'not_started') return '当前字段未发现静态问题'
  return '当前无待处理问题'
})

const aiGateEmptyDesc = computed(() => {
  const gate = currentItem.value?.ai_gate_status
  if (gate === 'timeout') return '请重新运行规则检查，确认基础信息、执行条件和执行步骤。'
  if (!gate || gate === 'not_started') return '规则门禁尚未运行，页面仅展示当前字段的即时检查结果。'
  return '基础信息、执行条件、执行步骤均无待处理问题。'
})

const activeFindingsByField = computed<Record<ReviewFieldKey, CardFinding[]>>(() => {
  const acc: Record<ReviewFieldKey, CardFinding[]> = {
    title: [],
    level: [],
    module: [],
    precondition: [],
    postcondition: [],
    steps: [],
    case: [],
  }
  for (const card of aiGateCards.value) {
    for (const finding of card.findings) {
      if (isActiveFinding(finding)) acc[finding.fieldKey].push(finding)
    }
  }
  return acc
})

function fieldIssueCount(field: ReviewFieldKey) {
  return activeFindingsByField.value[field].length
}

function fieldHasIssue(field: ReviewFieldKey) {
  return fieldIssueCount(field) > 0
}

const REVIEW_FIELD_TARGET_ID: Record<ReviewFieldKey, string> = {
  title: 'case-summary-title',
  level: 'case-field-level',
  module: 'case-field-module',
  precondition: 'case-field-precondition',
  postcondition: 'case-field-postcondition',
  steps: 'case-field-steps',
  case: 'case-summary-title',
}

function focusReviewField(field: ReviewFieldKey) {
  const target = document.getElementById(REVIEW_FIELD_TARGET_ID[field])
  if (!target) return
  activeReviewField.value = field === 'case' ? 'title' : field
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (activeReviewFieldTimer) window.clearTimeout(activeReviewFieldTimer)
  activeReviewFieldTimer = window.setTimeout(() => {
    activeReviewField.value = null
    activeReviewFieldTimer = undefined
  }, 1600)
}

const blockingFindingTotal = computed(
  () =>
    aiGateCards.value
      .flatMap((card) => card.findings)
      .filter(
        (finding) =>
          isActiveFinding(finding) &&
          (finding.severity === 'critical' || finding.severity === 'major'),
      ).length,
)
const sortedAuditRecords = computed(() =>
  [...records.value].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  ),
)
const latestRecord = computed(() => sortedAuditRecords.value[0] ?? null)
const auditTimelineRecords = computed(() => sortedAuditRecords.value.slice(0, 3))
const auditHiddenCount = computed(() =>
  Math.max(records.value.length - auditTimelineRecords.value.length, 0),
)

const DECISION_META: Record<
  ReviewDecision,
  { label: string; icon: string; submitLabel: string; hint: string }
> = {
  approved: {
    label: '通过',
    icon: 'check_circle',
    submitLabel: '提交通过结论',
    hint: '确认用例可进入后续流程。',
  },
  rejected: {
    label: '拒绝',
    icon: 'block',
    submitLabel: '提交拒绝结论',
    hint: '用于无法接受当前用例质量的场景。',
  },
  needs_update: {
    label: '打回修订',
    icon: 'edit_note',
    submitLabel: '提交修订要求',
    hint: '指出需要补齐或修改的字段。',
  },
}

const DECISION_OPTIONS = (
  Object.entries(DECISION_META) as Array<[ReviewDecision, (typeof DECISION_META)[ReviewDecision]]>
).map(([value, meta]) => ({ value, ...meta }))

function isReviewDecision(value?: string | null): value is ReviewDecision {
  return value === 'approved' || value === 'rejected' || value === 'needs_update'
}

function syncReviewDecisionFromItem(item: CaseReviewItem | null) {
  reviewDecision.value = isReviewDecision(item?.final_result) ? item.final_result : null
}

const currentDecisionMeta = computed(() =>
  reviewDecision.value ? DECISION_META[reviewDecision.value] : null,
)

const decisionCommentPlaceholder = computed(() => {
  if (!reviewDecision.value) return '请先选择评审结论，再填写补充意见。'
  if (reviewDecision.value === 'approved') {
    if (blockingFindingTotal.value > 0) {
      return '存在严重/主要问题，若仍通过，请说明放行理由和后续跟踪方式。'
    }
    return '可填写通过依据、覆盖范围或批准条件。'
  }
  if (reviewDecision.value === 'rejected') return '请说明拒绝原因，便于用例作者定位问题。'
  return '请写明需要修订的字段、期望补充内容和完成标准。'
})

function selectDecision(decision: ReviewDecision) {
  reviewDecision.value = decision
}

/** defect.status → 中文短文案 */
const DEFECT_STATUS_LABEL: Record<string, string> = {
  open: '待处理',
  resolved: '已处理',
  disputed: '有异议',
}

const FINDING_ACTION_TEXT: Record<string, string> = {
  标题必填: '请补充标题',
  标题过长: '请精简到 120 字以内',
  前置条件必填: '请补充执行前必须满足的条件',
  步骤必填: '请补充可执行步骤',
  步骤过于简略: '请补充操作和预期结果',
  后置条件建议补充: '建议补充清理或回滚要求',
  等级必填: '请选择用例等级',
  模块目录必填: '请绑定所属模块',
}

function findingDisplayText(finding: CardFinding) {
  return FINDING_ACTION_TEXT[finding.rule] || finding.title
}

function shouldShowFindingStatus(finding: CardFinding) {
  return finding.kind === 'defect' && finding.status !== 'open'
}

function findingStatusText(finding: CardFinding) {
  return DEFECT_STATUS_LABEL[finding.status] || finding.status
}

/** 上一条 / 下一条切换 */
function goPrev() {
  selectItemIndex(currentItemIndex.value - 1)
}
function goNext() {
  selectItemIndex(currentItemIndex.value + 1)
}
const canGoPrev = computed(() => currentItemIndex.value > 0)
const canGoNext = computed(() => currentItemIndex.value < items.value.length - 1)

/** 键盘快捷键：↑ 上一条，↓ 下一条 */
function onKeyNav(e: KeyboardEvent) {
  if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
  if (e.key === 'ArrowUp' || e.key === 'k') {
    e.preventDefault()
    goPrev()
  }
  if (e.key === 'ArrowDown' || e.key === 'j') {
    e.preventDefault()
    goNext()
  }
}

const REVIEW_EXECUTED_RESULTS = new Set<ReviewDecision>(['approved', 'rejected', 'needs_update'])

/** 当前评审项是否已经执行过评审操作 */
const isReviewActionExecuted = computed(() => {
  const finalResult = currentItem.value?.final_result
  return isReviewDecision(finalResult) && REVIEW_EXECUTED_RESULTS.has(finalResult)
})

const decisionStatusLabel = computed(() => {
  if (
    currentItem.value?.final_result === 'pending' &&
    (currentItem.value?.current_round_no ?? 1) > 1
  ) {
    return '待复审'
  }
  return isReviewActionExecuted.value ? '已执行' : '未执行'
})

const decisionStatusClass = computed(() => {
  if (
    currentItem.value?.final_result === 'pending' &&
    (currentItem.value?.current_round_no ?? 1) > 1
  ) {
    return 'resubmitted'
  }
  return isReviewActionExecuted.value ? 'executed' : 'not-executed'
})

type PriorityTone = 'critical' | 'high' | 'medium' | 'low' | 'default'

const PRIORITY_LABELS: Record<string, string> = {
  blocker: '阻塞',
  critical: '紧急',
  urgent: '紧急',
  high: '高',
  medium: '中',
  normal: '中',
  low: '低',
}

const caseLevelText = computed(() => currentTestCase.value?.level?.trim() || '未选择等级')
const casePriorityRaw = computed(() => currentTestCase.value?.priority?.trim() || '')
const casePriorityText = computed(() => {
  if (!casePriorityRaw.value) return '未设置'
  const key = casePriorityRaw.value.toLowerCase()
  return PRIORITY_LABELS[key] || casePriorityRaw.value
})
const casePriorityTone = computed<PriorityTone>(() => {
  const key = casePriorityRaw.value.toLowerCase()
  if (key === 'blocker' || key === 'critical' || key === 'urgent') return 'critical'
  if (key === 'high') return 'high'
  if (key === 'medium' || key === 'normal') return 'medium'
  if (key === 'low') return 'low'
  return 'default'
})
const caseModuleSegments = computed(() =>
  (currentTestCase.value?.module_path || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean),
)

/** 提交当前结论；存在严重/主要问题时，对"通过"增加二次确认，避免误放行。 */
async function submitCurrentDecision() {
  if (!reviewDecision.value) {
    ElMessage.warning('请先选择评审结论')
    return
  }
  if (reviewDecision.value === 'approved' && blockingFindingTotal.value > 0) {
    try {
      await ElMessageBox.confirm(
        `还有 ${blockingFindingTotal.value} 项严重/主要问题未处理，仍要通过？`,
        '存在未处理风险',
        {
          type: 'warning',
          confirmButtonText: '确认通过',
          cancelButtonText: '继续检查',
        },
      )
    } catch (err: unknown) {
      if (isElMessageBoxCancel(err)) return
      return
    }
  }
  await handleSubmitReview()
}

// 切换评审项时联动加载用例详情
watch(
  () => currentItem.value?.testcase_id,
  () => loadCurrentTestCase(),
  { immediate: true },
)

// ── 生命周期 ──
onMounted(() => {
  if (projectId.value && reviewId.value) {
    fetchReview()
    fetchItems()
    fetchUsers()
  }
  document.addEventListener('keydown', onKeyNav)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeyNav)
  if (activeReviewFieldTimer) window.clearTimeout(activeReviewFieldTimer)
  attachmentPreviewRunId++
  clearAttachmentPreviewUrls()
})

watch([projectId, reviewId], () => {
  if (projectId.value && reviewId.value) {
    fetchReview()
    fetchItems()
  }
})

watch(
  () => route.query.itemId,
  () => {
    restoreCurrentItemFromRoute()
  },
)

// 切换当前评审项时，自动拉取其历史记录、附件和规则门禁 defects
watch(
  () => currentItem.value?.id,
  (id) => {
    syncReviewDecisionFromItem(currentItem.value)
    if (id) {
      syncCurrentItemToRoute(id)
      loadCurrentItemRecords()
      loadAttachments()
      if (projectId.value && reviewId.value) {
        fetchAIDefects(projectId.value, reviewId.value, id)
      }
    } else {
      records.value = []
      attachments.value = []
      clearAttachmentPreviewUrls()
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="rv2">
    <main v-if="review" class="rv2-main">
      <!-- ══ 顶部上下文条 ══ -->
      <section class="rv2-summary">
        <div class="rv2-summary-l">
          <div id="case-summary-title" class="rv2-summary-title-row">
            <button
              type="button"
              class="rv2-back-btn"
              title="返回列表"
              aria-label="返回评审任务列表"
              @click="router.push('/case-reviews')"
            >
              <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <h1 class="rv2-summary-title">
              {{ currentItem?.title_snapshot || review.name }}
            </h1>
          </div>
          <p v-if="!currentItem" class="rv2-summary-desc">
            暂无评审用例，请先关联用例后再开始评审。
          </p>
        </div>
        <div class="rv2-summary-r">
          <div v-if="currentItem" class="rv2-nav-btns">
            <button
              type="button"
              class="rv2-nav-btn"
              :disabled="!canGoPrev"
              title="上一条 (↑)"
              aria-label="上一条评审用例"
              @click="goPrev"
            >
              <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <span class="rv2-nav-pos">{{ currentItemIndex + 1 }} / {{ items.length }}</span>
            <button
              type="button"
              class="rv2-nav-btn"
              :disabled="!canGoNext"
              title="下一条 (↓)"
              aria-label="下一条评审用例"
              @click="goNext"
            >
              <span class="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        </div>
      </section>

      <!-- ══ sidebar + 主内容 ══ -->
      <div v-if="currentItem" class="rv2-body">
        <!-- 70/30 主网格 -->
        <div class="rv2-grid">
          <!-- 左栏 70% -->
          <div class="rv2-left">
            <!-- 规则门禁 -->
            <section class="rv2-panel rv2-gate-panel">
              <h2 class="rv2-panel-title">
                <span class="material-symbols-outlined">security</span>
                规则门禁
                <div class="rv2-panel-actions">
                  <button
                    class="rv2-panel-btn rv2-panel-btn-primary"
                    :disabled="aiReviewRunning || !currentItem"
                    :title="aiReviewRunning ? '规则检查中…' : '运行当前评审项规则检查'"
                    @click="handleRunAIReview"
                  >
                    <span
                      class="material-symbols-outlined"
                      :class="{ 'rv2-spin': aiReviewRunning }"
                    >
                      auto_awesome
                    </span>
                    {{ aiReviewRunning ? '检查中…' : '规则检查' }}
                  </button>
                </div>
              </h2>
              <div v-if="aiProblemCards.length > 0" class="rv2-gate-grid">
                <div
                  v-for="g in aiProblemCards"
                  :key="g.key"
                  class="rv2-gate-card"
                  :class="[`accent-${g.accent}`, `status-${g.status.toLowerCase()}`]"
                >
                  <div class="rv2-gate-stripe"></div>
                  <div class="rv2-gate-blob"></div>
                  <div class="rv2-gate-head">
                    <span class="material-symbols-outlined rv2-gate-icon">{{ g.icon }}</span>
                  </div>
                  <div class="rv2-gate-card-title">{{ g.title }}</div>
                  <p class="rv2-gate-card-desc">{{ g.desc }}</p>

                  <!-- 本维度检出的 findings（后端 defect + 前端静态规则合并） -->
                  <ul v-if="g.findings.length > 0" class="rv2-findings">
                    <li
                      v-for="f in g.findings"
                      :key="f.key"
                      class="rv2-finding"
                      :class="[`sev-${f.severity}`, `kind-${f.kind}`]"
                    >
                      <button
                        type="button"
                        class="rv2-finding-main"
                        :title="`定位到${f.fieldLabel}`"
                        :aria-label="`定位到${f.fieldLabel}字段：${findingDisplayText(f)}`"
                        @click="focusReviewField(f.fieldKey)"
                      >
                        <span class="rv2-finding-field-name">{{ f.fieldLabel }}</span>
                        <span class="rv2-finding-text">{{ findingDisplayText(f) }}</span>
                      </button>
                      <div v-if="shouldShowFindingStatus(f)" class="rv2-finding-meta">
                        <span class="rv2-finding-status-pill">{{ findingStatusText(f) }}</span>
                      </div>
                      <p v-if="f.dispute_reason" class="rv2-finding-note">
                        异议：{{ f.dispute_reason }}
                      </p>
                    </li>
                  </ul>
                </div>
              </div>
              <div
                v-else
                class="rv2-gate-empty-state"
                :class="{
                  'is-idle':
                    !currentItem.ai_gate_status || currentItem.ai_gate_status === 'not_started',
                  'is-timeout': currentItem.ai_gate_status === 'timeout',
                }"
              >
                <span class="material-symbols-outlined">
                  {{ currentItem.ai_gate_status === 'timeout' ? 'error' : 'verified' }}
                </span>
                <div>
                  <strong>{{ aiGateEmptyTitle }}</strong>
                  <p>{{ aiGateEmptyDesc }}</p>
                </div>
              </div>
              <div v-if="aiDefectsLoading" class="rv2-findings-loading">规则问题加载中…</div>
            </section>

            <!-- 用例字段审阅 -->
            <section class="rv2-panel rv2-case-fields">
              <div class="rv2-case-fields-head">
                <h2 class="rv2-panel-title">
                  <span class="material-symbols-outlined">fact_check</span>
                  用例内容
                  <span v-if="testCaseLoading" class="rv2-loading">加载中…</span>
                </h2>
              </div>

              <section class="rv2-basic-fields" aria-label="基础信息">
                <article
                  id="case-field-level"
                  class="rv2-basic-field"
                  :class="{
                    'has-issue': fieldHasIssue('level'),
                    'is-field-focused': activeReviewField === 'level',
                  }"
                >
                  <div class="rv2-field-head">
                    <span class="material-symbols-outlined">signal_cellular_alt</span>
                    <strong>等级</strong>
                  </div>
                  <p class="rv2-field-value">
                    <span class="rv2-value-tag rv2-level-tag">{{ caseLevelText }}</span>
                  </p>
                </article>
                <article class="rv2-basic-field">
                  <div class="rv2-field-head">
                    <span class="material-symbols-outlined">flag</span>
                    <strong>优先级</strong>
                  </div>
                  <p class="rv2-field-value">
                    <span class="rv2-value-tag rv2-priority-tag" :class="`is-${casePriorityTone}`">
                      {{ casePriorityText }}
                    </span>
                  </p>
                </article>
                <article
                  id="case-field-module"
                  class="rv2-basic-field rv2-basic-module"
                  :class="{
                    'has-issue': fieldHasIssue('module'),
                    'is-field-focused': activeReviewField === 'module',
                  }"
                >
                  <div class="rv2-field-head">
                    <span class="material-symbols-outlined">account_tree</span>
                    <strong>模块</strong>
                  </div>
                  <div
                    v-if="caseModuleSegments.length"
                    class="rv2-module-path"
                    :title="caseModuleSegments.join(' / ')"
                  >
                    <template
                      v-for="(segment, index) in caseModuleSegments"
                      :key="`${segment}-${index}`"
                    >
                      <span
                        class="rv2-module-segment"
                        :class="{ 'is-leaf': index === caseModuleSegments.length - 1 }"
                      >
                        {{ segment }}
                      </span>
                      <span
                        v-if="index < caseModuleSegments.length - 1"
                        class="rv2-module-separator"
                      >
                        /
                      </span>
                    </template>
                  </div>
                  <p v-else class="rv2-field-value">未关联模块</p>
                </article>
              </section>

              <section class="rv2-conditions" aria-label="执行条件">
                <div
                  id="case-field-precondition"
                  class="rv2-cond-col"
                  :class="{
                    'has-issue': fieldHasIssue('precondition'),
                    'is-field-focused': activeReviewField === 'precondition',
                  }"
                >
                  <h3 class="rv2-cond-title">
                    <span class="material-symbols-outlined rv2-cond-title-icon st-accent-secondary">
                      login
                    </span>
                    前置条件
                  </h3>
                  <ul class="rv2-cond-list">
                    <li v-for="(c, i) in preconditionItems" :key="`pre-${i}`" class="rv2-cond-item">
                      <span class="material-symbols-outlined rv2-cond-check">check_circle</span>
                      <span>{{ c }}</span>
                    </li>
                    <li v-if="preconditionItems.length === 0" class="rv2-cond-item rv2-cond-empty">
                      <span class="material-symbols-outlined">pending</span>
                      <span>未填写前置条件</span>
                    </li>
                  </ul>
                </div>
                <div
                  id="case-field-postcondition"
                  class="rv2-cond-col"
                  :class="{
                    'has-issue': fieldHasIssue('postcondition'),
                    'is-field-focused': activeReviewField === 'postcondition',
                  }"
                >
                  <h3 class="rv2-cond-title">
                    <span class="material-symbols-outlined rv2-cond-title-icon st-accent-outline">
                      logout
                    </span>
                    后置条件
                  </h3>
                  <ul class="rv2-cond-list">
                    <li
                      v-for="(c, i) in postconditionItems"
                      :key="`post-${i}`"
                      class="rv2-cond-item rv2-cond-pending"
                    >
                      <span class="material-symbols-outlined rv2-cond-circle">
                        radio_button_unchecked
                      </span>
                      <span>{{ c }}</span>
                    </li>
                    <li v-if="postconditionItems.length === 0" class="rv2-cond-item rv2-cond-empty">
                      <span class="material-symbols-outlined">pending</span>
                      <span>未填写后置条件</span>
                    </li>
                  </ul>
                </div>
              </section>

              <section
                id="case-field-steps"
                class="rv2-steps-sec"
                :class="{
                  'has-issue': fieldHasIssue('steps'),
                  'is-field-focused': activeReviewField === 'steps',
                }"
                aria-label="执行步骤"
              >
                <h2 class="rv2-panel-title">
                  <span class="material-symbols-outlined">list_alt</span>
                  执行步骤
                </h2>
                <div v-if="realSteps.length === 0" class="rv2-empty-steps">
                  用例尚未填写执行步骤
                </div>
                <div v-else class="rv2-step-table-wrap">
                  <table class="rv2-step-table">
                    <thead>
                      <tr>
                        <th class="rv2-step-col-num">#</th>
                        <th class="rv2-step-col-desc">操作描述</th>
                        <th class="rv2-step-col-expect">预期结果</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="step in realSteps" :key="step.no" class="rv2-step-row">
                        <td class="rv2-step-num">{{ step.no }}</td>
                        <td class="rv2-step-text">{{ step.action || '—' }}</td>
                        <td class="rv2-step-text rv2-step-expected">
                          {{ step.expected || '—' }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </section>

            <!-- 附件与证据 -->
            <section class="rv2-panel" :class="{ 'rv2-panel-compact': attachments.length === 0 }">
              <h2 class="rv2-panel-title">
                <span class="material-symbols-outlined">attachment</span>
                附件与证据
              </h2>
              <input
                ref="attachmentInputRef"
                type="file"
                class="rv2-file-input"
                @change="onAttachmentFileChange"
              />
              <!-- 空态：单行 inline 提示 -->
              <div
                v-if="attachments.length === 0 && !attachmentsLoading"
                class="rv2-attach-empty-inline"
              >
                <button
                  class="rv2-attach-inline-btn"
                  :class="{ disabled: attachmentUploading || !currentItem }"
                  @click="triggerAttachmentUpload"
                >
                  <span class="material-symbols-outlined">
                    {{ attachmentUploading ? 'hourglass_empty' : 'add_circle' }}
                  </span>
                  {{ attachmentUploading ? '上传中…' : '暂无附件 · 点击上传' }}
                </button>
              </div>
              <!-- 有附件时展示网格 -->
              <div v-else v-loading="attachmentsLoading" class="rv2-attach-grid">
                <div
                  class="rv2-attach-drop"
                  :class="{ disabled: attachmentUploading || !currentItem }"
                  @click="triggerAttachmentUpload"
                >
                  <span class="material-symbols-outlined">
                    {{ attachmentUploading ? 'hourglass_empty' : 'add_circle' }}
                  </span>
                  <span>{{ attachmentUploading ? '上传中…' : '上传附件' }}</span>
                </div>
                <div
                  v-for="att in attachments"
                  :key="att.id"
                  class="rv2-attach-card"
                  :class="{ 'has-preview': isImageAttachment(att) }"
                >
                  <button
                    v-if="isImageAttachment(att)"
                    type="button"
                    class="rv2-attach-preview"
                    :disabled="!attachmentPreviewUrls[att.id]"
                    title="查看大图"
                    @click="openAttachmentPreview(att)"
                  >
                    <img
                      v-if="attachmentPreviewUrls[att.id]"
                      :src="attachmentPreviewUrls[att.id]"
                      :alt="att.file_name"
                      loading="lazy"
                      @error="removeAttachmentPreviewUrl(att.id)"
                    />
                    <span v-else class="material-symbols-outlined">image</span>
                  </button>
                  <div v-else class="rv2-attach-icon">
                    <span class="material-symbols-outlined">description</span>
                  </div>
                  <div class="rv2-attach-info">
                    <div class="rv2-attach-name" :title="att.file_name">{{ att.file_name }}</div>
                    <div class="rv2-attach-meta">
                      <span>{{ formatFileSize(att.file_size) }}</span>
                      <span v-if="att.uploader_name">· {{ att.uploader_name }}</span>
                    </div>
                  </div>
                  <div class="rv2-attach-actions">
                    <button
                      type="button"
                      class="rv2-attach-action"
                      title="下载附件"
                      aria-label="下载附件"
                      @click="handleDownloadAttachment(att)"
                    >
                      <span class="material-symbols-outlined">download</span>
                    </button>
                    <button
                      type="button"
                      class="rv2-attach-action danger"
                      title="删除附件"
                      aria-label="删除附件"
                      @click="handleDeleteAttachment(att)"
                    >
                      <span class="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <!-- 右栏 30% -->
          <aside class="rv2-right">
            <!-- 执行决策 -->
            <section class="rv2-panel rv2-decision">
              <h2 class="rv2-panel-title">
                <span class="material-symbols-outlined">gavel</span>
                执行决策
                <span v-if="currentItem" class="rv2-exec-status-badge" :class="decisionStatusClass">
                  {{ decisionStatusLabel }}
                </span>
              </h2>
              <div class="rv2-decision-options" role="radiogroup" aria-label="评审结论">
                <button
                  v-for="option in DECISION_OPTIONS"
                  :key="option.value"
                  type="button"
                  class="rv2-decision-option"
                  :class="[`decision-${option.value}`, { active: reviewDecision === option.value }]"
                  :aria-checked="reviewDecision === option.value"
                  role="radio"
                  @click="selectDecision(option.value)"
                >
                  <span class="material-symbols-outlined">{{ option.icon }}</span>
                  <span>
                    <strong>{{ option.label }}</strong>
                    <small>{{ option.hint }}</small>
                  </span>
                </button>
              </div>
              <textarea
                v-model="reviewComment"
                class="rv2-decision-input"
                :placeholder="decisionCommentPlaceholder"
              ></textarea>
              <button
                class="rv2-btn rv2-btn-submit"
                :class="`decision-${reviewDecision || 'unset'}`"
                :disabled="submitting || !currentItem || !reviewDecision"
                @click="submitCurrentDecision"
              >
                <span class="material-symbols-outlined">
                  {{ currentDecisionMeta?.icon || 'rule' }}
                </span>
                {{ submitting ? '提交中…' : currentDecisionMeta?.submitLabel || '请选择评审结论' }}
              </button>
            </section>

            <!-- 评审轨迹 -->
            <section class="rv2-panel rv2-audit">
              <h2 class="rv2-panel-title">
                <span class="material-symbols-outlined">history</span>
                评审轨迹
                <div class="rv2-panel-actions">
                  <button
                    v-if="currentItem && records.length > 0"
                    class="rv2-panel-btn"
                    title="在侧栏查看全部评审记录"
                    @click="openRecordDrawer(currentItem)"
                  >
                    <span class="material-symbols-outlined">expand_content</span>
                    全部 {{ records.length }}
                  </button>
                </div>
              </h2>
              <div v-if="records.length === 0 && !recordsLoading" class="rv2-audit-empty">
                <span class="material-symbols-outlined">forum</span>
                <strong>等待首次结论</strong>
                <span>提交通过、拒绝或打回修订后，这里会生成可追溯记录。</span>
              </div>
              <div v-else v-loading="recordsLoading" class="rv2-audit-content">
                <div
                  v-if="latestRecord"
                  class="rv2-audit-summary"
                  :class="`rv2-tl-${resultClass(latestRecord.result)}`"
                >
                  <span class="rv2-audit-summary-icon material-symbols-outlined">
                    {{ resultIcon(latestRecord.result) }}
                  </span>
                  <div class="rv2-audit-summary-main">
                    <span class="rv2-audit-kicker">最近结论</span>
                    <strong>{{ resultLabel(latestRecord.result) }}</strong>
                    <span class="rv2-audit-reviewer-line">
                      <img
                        class="rv2-audit-avatar"
                        :src="reviewerAvatarUrl(latestRecord)"
                        :alt="reviewerName(latestRecord)"
                        @error="onReviewerAvatarError($event, reviewerName(latestRecord))"
                      />
                      <span>{{ reviewerName(latestRecord) }}</span>
                    </span>
                  </div>
                  <time class="rv2-audit-time" :datetime="latestRecord.created_at">
                    {{ formatDate(latestRecord.created_at) }}
                  </time>
                </div>
                <ol class="rv2-audit-list">
                  <li
                    v-for="(rec, index) in auditTimelineRecords"
                    :key="rec.id"
                    class="rv2-audit-item"
                    :class="`rv2-tl-${resultClass(rec.result)}`"
                  >
                    <span class="rv2-audit-node" :aria-label="`第 ${index + 1} 条记录`">
                      <span class="material-symbols-outlined">{{ resultIcon(rec.result) }}</span>
                    </span>
                    <div class="rv2-audit-card">
                      <div class="rv2-audit-card-head">
                        <span class="rv2-drawer-result" :class="resultClass(rec.result)">
                          {{ resultLabel(rec.result) }}
                        </span>
                        <time class="rv2-audit-time" :datetime="rec.created_at">
                          {{ formatDate(rec.created_at) }}
                        </time>
                      </div>
                      <div class="rv2-audit-reviewer-line">
                        <img
                          class="rv2-audit-avatar"
                          :src="reviewerAvatarUrl(rec)"
                          :alt="reviewerName(rec)"
                          @error="onReviewerAvatarError($event, reviewerName(rec))"
                        />
                        <span>{{ reviewerName(rec) }}</span>
                      </div>
                      <p v-if="rec.comment" class="rv2-tl-desc">{{ rec.comment }}</p>
                      <p v-else class="rv2-tl-desc rv2-tl-muted">未填写评审意见</p>
                    </div>
                  </li>
                </ol>
                <button
                  v-if="currentItem && auditHiddenCount > 0"
                  class="rv2-audit-more"
                  @click="openRecordDrawer(currentItem)"
                >
                  去评审记录详情查看其余 {{ auditHiddenCount }} 条
                  <span class="material-symbols-outlined">arrow_forward</span>
                </button>
              </div>
            </section>
          </aside>
        </div>
        <!-- /rv2-grid -->
      </div>
      <!-- /rv2-body -->

      <!-- 无用例空态 -->
      <section v-else class="rv2-empty-state">
        <span class="material-symbols-outlined rv2-empty-icon">rate_review</span>
        <p>暂无评审用例，请先关联用例</p>
        <button v-if="isActive" class="rv2-link-btn" @click="openLinkDialog">
          <span class="material-symbols-outlined">add_link</span>
          关联用例
        </button>
      </section>
    </main>

    <!-- 关联用例对话框 -->
    <el-dialog v-model="linkDialogVisible" title="关联用例" width="560px" destroy-on-close>
      <el-select
        v-model="linkCases"
        multiple
        filterable
        placeholder="搜索并选择用例"
        style="width: 100%"
      >
        <el-option
          v-for="c in availableCases"
          :key="c.id"
          :label="`#${c.id} ${c.title}`"
          :value="c.id"
        />
      </el-select>
      <template #footer>
        <el-button @click="linkDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="linkLoading" @click="handleLink">确定关联</el-button>
      </template>
    </el-dialog>

    <!-- 评审记录侧栏（从顶栏历史按钮打开） -->
    <el-drawer
      v-model="recordDrawerVisible"
      direction="rtl"
      size="440px"
      class="rv2-record-drawer"
      :with-header="false"
      append-to-body
    >
      <div v-loading="recordsLoading" class="rv2-record-drawer-shell">
        <header class="rv2-record-drawer-header">
          <div class="rv2-record-drawer-title">
            <span class="material-symbols-outlined">history</span>
            <div>
              <strong>评审记录</strong>
              <span>{{ recordDrawerItem?.title_snapshot || '当前用例' }}</span>
            </div>
          </div>
          <button
            class="rv2-record-drawer-close"
            type="button"
            aria-label="关闭评审记录"
            @click="recordDrawerVisible = false"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
        </header>
        <div v-if="records.length === 0 && !recordsLoading" class="rv2-drawer-empty">
          <span class="material-symbols-outlined">history</span>
          <strong>暂无评审记录</strong>
          <p>提交评审结论后，这里会按时间倒序保留完整轨迹。</p>
        </div>
        <template v-else>
          <div class="rv2-record-drawer-meta">
            <span>{{ sortedAuditRecords.length }} 条记录</span>
            <span v-if="latestRecord">最近 {{ formatDate(latestRecord.created_at) }}</span>
          </div>
          <div class="rv2-drawer-list">
            <article
              v-for="rec in sortedAuditRecords"
              :key="rec.id"
              class="rv2-drawer-item"
              :class="`rv2-tl-${resultClass(rec.result)}`"
            >
              <span class="rv2-drawer-node">
                <span class="material-symbols-outlined">{{ resultIcon(rec.result) }}</span>
              </span>
              <div class="rv2-drawer-card">
                <div class="rv2-drawer-head">
                  <span class="rv2-drawer-result" :class="resultClass(rec.result)">
                    {{ resultLabel(rec.result) }}
                  </span>
                  <time class="rv2-drawer-time" :datetime="rec.created_at">
                    {{ formatDate(rec.created_at) }}
                  </time>
                </div>
                <div class="rv2-audit-reviewer-line rv2-drawer-reviewer">
                  <img
                    class="rv2-audit-avatar"
                    :src="reviewerAvatarUrl(rec)"
                    :alt="reviewerName(rec)"
                    @error="onReviewerAvatarError($event, reviewerName(rec))"
                  />
                  <span>{{ reviewerName(rec) }}</span>
                </div>
                <p v-if="rec.comment" class="rv2-drawer-comment">{{ rec.comment }}</p>
                <p v-else class="rv2-drawer-comment rv2-drawer-comment-muted">未填写评审意见</p>
              </div>
            </article>
          </div>
        </template>
      </div>
    </el-drawer>

    <el-dialog
      v-model="attachmentPreviewDialogVisible"
      :title="previewingAttachment?.file_name || '图片预览'"
      width="72vw"
      class="rv2-image-preview-dialog"
      destroy-on-close
    >
      <div class="rv2-image-preview-body">
        <img
          v-if="previewingAttachmentUrl"
          :src="previewingAttachmentUrl"
          :alt="previewingAttachment?.file_name || '附件图片'"
        />
      </div>
      <template #footer>
        <el-button
          v-if="previewingAttachment"
          @click="handleDownloadAttachment(previewingAttachment)"
        >
          下载原图
        </el-button>
        <el-button type="primary" @click="attachmentPreviewDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════ */
/*  用例评审详情页设计系统  */
/* ═══════════════════════════════════════════════════ */

/* ── Design Tokens ── */
.rv2 {
  --rv2-bg: var(--tp-surface-base);
  --rv2-surface: var(--tp-surface-base);
  --rv2-section: var(--tp-surface-elevated);
  --rv2-card: var(--tp-surface-card);
  --rv2-card-high: var(--tp-surface-elevated);
  --rv2-card-bright: var(--tp-surface-hover);
  --rv2-input: var(--tp-surface-input);

  --rv2-primary: var(--tp-primary);
  --rv2-primary-strong: var(--tp-primary-dark);
  --rv2-secondary: var(--tp-accent-info);
  --rv2-secondary-strong: var(--tp-accent-info);
  --rv2-tertiary: var(--tp-accent-warning);

  --rv2-fg: var(--tp-gray-900);
  --rv2-fg-muted: var(--tp-gray-700);
  --rv2-outline: var(--tp-gray-500);
  --rv2-outline-variant: var(--tp-border-strong);
  --rv2-border-hairline: var(--tp-border-subtle);
  --rv2-border-soft: var(--tp-border-subtle);
  --rv2-border-muted: var(--tp-border-strong);
  --rv2-muted-soft: var(--tp-gray-600);
  --rv2-muted-faint: var(--tp-gray-400);
  --rv2-hover-tint: var(--tp-surface-row-hover);

  --rv2-success: #10b981;
  --rv2-warning: #f59e0b;
  --rv2-error: #ef4444;

  --rv2-radius: 0.75rem; /* xl */
  --rv2-radius-sm: 0.5rem; /* lg */
  --rv2-shadow-panel: var(--tp-shadow-card);
  --rv2-focus-ring: 0 0 0 3px var(--tp-accent-primary-soft);

  background: var(--rv2-bg);
  background-image:
    radial-gradient(circle at 18% 0%, var(--tp-ambient-primary), transparent 30%),
    radial-gradient(circle at 82% 12%, var(--tp-ambient-info), transparent 28%);
  color: var(--rv2-fg);
  font-family:
    'Inter',
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
:deep(.el-loading-mask) {
  background: rgba(248, 250, 252, 0.72);
}

.rv2-panel-btn,
.rv2-finding-btn,
.rv2-attach-action,
.rv2-nav-btn,
.rv2-attach-inline-btn,
.rv2-btn {
  display: inline-flex;
  align-items: center;
}

.rv2-case-status,
.rv2-case-ai,
.rv2-gate-status,
.rv2-finding-sev,
.rv2-finding-field,
.rv2-finding-status,
.rv2-drawer-result {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
.rv2-panel-btn:focus-visible,
.rv2-finding-btn:focus-visible,
.rv2-attach-action:focus-visible,
.rv2-nav-btn:focus-visible,
.rv2-attach-inline-btn:focus-visible,
.rv2-btn:focus-visible,
.rv2-sidebar-filter:focus-visible,
.rv2-case-row:focus-visible,
.rv2-decision-option:focus-visible {
  outline: none;
  box-shadow: var(--rv2-focus-ring);
}

/* ── 面板标题内的操作按钮组 ── */
.rv2-panel-actions {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.rv2-panel-btn {
  gap: 6px;
  min-height: 34px;
  padding: 7px 12px;
  border-radius: var(--tp-btn-radius);
  background: transparent;
  color: var(--rv2-fg-muted);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: normal;
  text-transform: none;
  cursor: pointer;
  transition:
    background 0.16s,
    border-color 0.16s,
    color 0.16s,
    transform 0.16s;
}
.rv2-panel-btn:hover {
  color: var(--rv2-primary);
  border-color: var(--tp-accent-primary-border);
  background: var(--tp-surface-hover);
  transform: none;
}
.rv2-panel-btn .material-symbols-outlined {
  font-size: 16px;
}
.rv2-panel-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
.rv2-panel-btn-primary {
  background: var(--tp-btn-bg);
  border-color: var(--tp-btn-border);
  color: var(--tp-btn-text);
  box-shadow: var(--tp-btn-shadow);
}
.rv2-panel-btn-primary:hover:not(:disabled) {
  background: var(--tp-btn-bg-hover);
  border-color: var(--tp-btn-border);
  box-shadow: var(--tp-btn-shadow-hover);
}
.rv2-spin {
  animation: rv2-spin 0.8s linear infinite;
}
@keyframes rv2-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── 主内容区 ── */
.rv2-main {
  flex: 1;
  padding: clamp(16px, 1.4vw, 28px);
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: none;
  margin: 0;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

/* ── 返回列表按钮 ── */
.rv2-back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%; /* 圆形微背景 */
  background: transparent;
  color: var(--rv2-fg-muted);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
  padding: 0;
  flex-shrink: 0;
}
.rv2-back-btn:hover,
.rv2-back-btn:focus-visible {
  background: rgba(255, 255, 255, 0.08);
  color: var(--rv2-outline);
  outline: none;
}
.rv2-back-btn .material-symbols-outlined {
  font-size: 20px;
}

/* ── 顶部上下文条 ── */
.rv2-summary {
  position: relative;
  overflow: hidden;
  background:
    linear-gradient(135deg, rgba(210, 187, 255, 0.045), transparent 36%), var(--rv2-section);
  border: 1px solid var(--rv2-border-muted);
  border-radius: var(--rv2-radius);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: var(--rv2-shadow-panel);
}
.rv2-summary::after {
  position: absolute;
  right: 18px;
  bottom: 0;
  left: 18px;
  height: 1px;
  content: '';
  background: linear-gradient(90deg, transparent, rgba(210, 187, 255, 0.2), transparent);
  pointer-events: none;
}
@media (min-width: 900px) {
  .rv2-summary {
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
  }
}
.rv2-summary-l {
  flex: 1;
  min-width: 0;
}
.rv2-summary-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.rv2-tc-badge {
  padding: 3px 12px;
  border-radius: 4px;
  background: rgba(5, 102, 217, 0.16);
  color: var(--rv2-secondary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: normal;
  text-transform: uppercase;
  border: 1px solid rgba(173, 198, 255, 0.2);
}
.rv2-exec-status-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
}
.rv2-exec-status-badge.executed {
  background: rgba(16, 185, 129, 0.12);
  color: var(--rv2-success);
  border-color: rgba(16, 185, 129, 0.2);
}
.rv2-exec-status-badge.resubmitted {
  background: color-mix(in srgb, var(--rv2-warning) 12%, transparent);
  color: var(--rv2-warning);
  border-color: color-mix(in srgb, var(--rv2-warning) 24%, transparent);
}
.rv2-exec-status-badge.not-executed {
  background: rgba(148, 163, 184, 0.12);
  color: var(--rv2-fg-muted);
  border-color: rgba(148, 163, 184, 0.2);
}
.rv2-summary-title {
  margin: 0;
  font-size: clamp(18px, 1.05vw, 22px);
  font-weight: 720;
  color: var(--rv2-fg);
  letter-spacing: normal;
  line-height: 1.25;
}
.rv2-summary-desc {
  margin: 0;
  max-width: 640px;
  font-size: 13px;
  font-weight: 300;
  line-height: 1.7;
  color: var(--rv2-fg-muted);
  opacity: 0.85;
}
.rv2-summary-r {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.rv2-progress-compact {
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rv2-progress-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-size: 11px;
  font-weight: 700;
  color: var(--rv2-muted-soft);
}
.rv2-progress-copy strong {
  color: var(--rv2-primary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}
.rv2-progress-track {
  height: 5px;
  border-radius: 9999px;
  background: var(--tp-gray-200);
  overflow: hidden;
}
.rv2-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--rv2-primary-strong), var(--rv2-secondary-strong));
  border-radius: 9999px;
  transition: width 0.5s ease;
}
.rv2-nav-btns {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.rv2-nav-btn {
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: var(--rv2-radius-sm);
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent;
  color: var(--rv2-fg-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.rv2-nav-btn .material-symbols-outlined {
  font-size: 16px;
}
.rv2-nav-btn:hover:not(:disabled) {
  color: var(--rv2-primary);
  border-color: rgba(210, 187, 255, 0.4);
  background: var(--rv2-hover-tint);
}
.rv2-nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.rv2-nav-pos {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--rv2-fg-muted);
  opacity: 0.6;
  min-width: 48px;
  text-align: center;
}

/* ── body：左侧边栏 + 主内容 ── */
.rv2-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  width: 100%;
  min-width: 0;
}
@media (min-width: 1100px) {
  .rv2-body {
    align-items: flex-start;
  }
}

/* ── 左侧边栏：评审用例列表 ── */
.rv2-sidebar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(180deg, rgba(204, 195, 216, 0.025), transparent 34%), var(--rv2-section);
  border: 1px solid var(--rv2-border-muted);
  border-radius: var(--rv2-radius);
  overflow: hidden;
  box-shadow: var(--rv2-shadow-panel);
}
@media (min-width: 1100px) {
  .rv2-sidebar {
    width: 100%;
    height: calc(100vh - 112px);
    position: sticky;
    top: 88px;
    max-height: calc(100vh - 112px);
  }
}
.rv2-sidebar-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--rv2-fg-muted);
  letter-spacing: 0.02em;
  background: rgba(12, 14, 24, 0.24);
  border-bottom: 1px solid var(--rv2-border-soft);
}
.rv2-sidebar-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.rv2-sidebar-header .material-symbols-outlined {
  font-size: 16px;
  color: var(--rv2-primary);
  opacity: 0.7;
}
.rv2-sidebar-title {
  color: var(--rv2-fg);
  font-size: 12px;
  font-weight: 650;
}
.rv2-sidebar-counter {
  margin-left: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--rv2-fg-muted);
  opacity: 0.7;
}
.rv2-sidebar-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  width: 100%;
}
.rv2-sidebar-filter {
  min-width: 0;
  min-height: 28px;
  padding: 6px 8px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(74, 68, 85, 0.12);
  color: var(--rv2-muted-soft);
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
  white-space: nowrap;
}
.rv2-sidebar-filter:hover,
.rv2-sidebar-filter.active {
  color: var(--rv2-primary);
  background: rgba(124, 58, 237, 0.12);
  border-color: rgba(210, 187, 255, 0.26);
}
.rv2-sidebar-list {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex: 1;
}
.rv2-sidebar-list::-webkit-scrollbar {
  width: 4px;
}
.rv2-sidebar-list::-webkit-scrollbar-thumb {
  background: rgba(124, 58, 237, 0.2);
  border-radius: 4px;
}
.rv2-sidebar-empty {
  padding: 18px 14px;
  color: var(--rv2-muted-faint);
  font-size: 12px;
  text-align: center;
}

/* ── 主网格 ── */
.rv2-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  min-width: 0;
  width: 100%;
}
@media (min-width: 1180px) {
  .rv2-grid {
    grid-template-columns: minmax(0, 1fr) minmax(300px, 24vw);
    align-items: flex-start;
  }
}
@media (min-width: 1600px) {
  .rv2-grid {
    grid-template-columns: minmax(0, 1fr) minmax(340px, 22vw);
  }
}
.rv2-left {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.rv2-right {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
@media (min-width: 1180px) {
  .rv2-right {
    position: sticky;
    top: 88px;
    height: calc(100vh - 112px);
    max-height: calc(100vh - 112px);
  }
}
.rv2-audit {
  flex: 1;
  min-height: 180px;
}

/* ── 基础面板 ── */
.rv2-panel {
  background:
    linear-gradient(180deg, rgba(204, 195, 216, 0.025), transparent 38%), var(--rv2-section);
  border: 1px solid var(--rv2-border-muted);
  border-radius: var(--rv2-radius);
  padding: clamp(18px, 1.2vw, 24px);
  position: relative;
  box-shadow: var(--rv2-shadow-panel);
}
.rv2-panel-title {
  margin: 0 0 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 720;
  letter-spacing: 0.04em;
  text-transform: none;
  color: var(--rv2-fg-muted);
  opacity: 0.92;
}
.rv2-panel-title .material-symbols-outlined {
  font-size: 18px;
}
.rv2-panel-count {
  margin-left: auto;
  font-weight: 400;
  font-size: 12px;
  letter-spacing: normal;
  text-transform: none;
  color: var(--rv2-fg-muted);
  opacity: 0.5;
}
.rv2-loading {
  font-size: 11px;
  font-weight: 400;
  color: var(--rv2-fg-muted);
  opacity: 0.5;
  letter-spacing: normal;
  text-transform: none;
}

/* ── 规则门禁 三卡 ── */
.rv2-gate-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: 1fr;
}
@media (min-width: 720px) {
  .rv2-gate-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
.rv2-gate-card {
  position: relative;
  overflow: hidden;
  padding: 16px;
  background: var(--rv2-card);
  border: 1px solid var(--rv2-border-hairline);
  border-radius: var(--rv2-radius-sm);
  transition: background 0.2s;
  cursor: default;
  /* flex column 让 empty state / hint bar 可以占满剩余高度，3 张卡视觉更平衡 */
  display: flex;
  flex-direction: column;
}
.rv2-gate-card:hover {
  background: var(--rv2-card-bright);
}
.rv2-gate-stripe {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--accent-color, var(--rv2-secondary));
}
.rv2-gate-blob {
  position: absolute;
  right: -16px;
  top: -16px;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--accent-blob, rgba(173, 198, 255, 0.05));
  filter: blur(20px);
  transition: background 0.2s;
}
.rv2-gate-card:hover .rv2-gate-blob {
  background: var(--accent-blob-hover, rgba(173, 198, 255, 0.1));
}
.rv2-gate-card.accent-secondary {
  --accent-color: var(--rv2-secondary);
  --accent-blob: rgba(173, 198, 255, 0.05);
  --accent-blob-hover: rgba(173, 198, 255, 0.12);
}
.rv2-gate-card.accent-primary {
  --accent-color: var(--rv2-primary);
  --accent-blob: rgba(210, 187, 255, 0.05);
  --accent-blob-hover: rgba(210, 187, 255, 0.12);
}
.rv2-gate-card.accent-tertiary {
  --accent-color: var(--rv2-tertiary);
  --accent-blob: rgba(255, 183, 132, 0.05);
  --accent-blob-hover: rgba(255, 183, 132, 0.12);
}
.rv2-gate-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
  position: relative;
  z-index: 1;
}
.rv2-gate-icon {
  font-size: 22px;
  color: var(--accent-color);
  font-variation-settings: 'FILL' 1;
}
.rv2-gate-status {
  padding: 2px 8px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.rv2-gate-status.st-pass {
  background: rgba(16, 185, 129, 0.1);
  color: var(--rv2-success);
}
.rv2-gate-status.st-warn {
  background: rgba(245, 158, 11, 0.1);
  color: var(--rv2-warning);
}
.rv2-gate-status.st-fail {
  background: rgba(239, 68, 68, 0.1);
  color: var(--rv2-error);
}
.rv2-gate-status.st-idle {
  background: rgba(204, 195, 216, 0.08);
  color: var(--rv2-fg-muted);
}
.rv2-gate-card-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--rv2-fg);
  margin-bottom: 4px;
  position: relative;
  z-index: 1;
}
.rv2-gate-card-desc {
  margin: 0;
  font-size: 12px;
  font-weight: 300;
  line-height: 1.6;
  color: var(--rv2-fg-muted);
  opacity: 0.8;
  position: relative;
  z-index: 1;
}
.rv2-gate-empty-state {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border-radius: var(--rv2-radius-sm);
  background: rgba(16, 185, 129, 0.06);
  border: 1px solid rgba(16, 185, 129, 0.18);
}
.rv2-gate-empty-state > .material-symbols-outlined {
  flex-shrink: 0;
  font-size: 22px;
  color: var(--rv2-success);
  font-variation-settings: 'FILL' 1;
}
.rv2-gate-empty-state strong {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--rv2-fg);
  margin-bottom: 4px;
}
.rv2-gate-empty-state p {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--rv2-fg-muted);
  opacity: 0.8;
}
.rv2-gate-normal-strip {
  margin-top: 10px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  padding: 5px 9px;
  border-radius: 4px;
  background: rgba(16, 185, 129, 0.045);
  border: 1px solid rgba(16, 185, 129, 0.12);
  font-size: 11px;
  color: rgba(204, 195, 216, 0.62);
}
.rv2-gate-normal-strip > .material-symbols-outlined {
  font-size: 14px;
  color: rgba(52, 211, 153, 0.72);
}

/* ── 维度卡内嵌规则问题 ── */
.rv2-findings {
  list-style: none;
  padding: 0;
  margin: 14px 0 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  z-index: 1;
}
.rv2-finding {
  position: relative;
  overflow: hidden;
  padding: 10px 12px 10px 20px; /* 增加左边距，为悬浮 vertical pill 预留空间 */
  border-radius: 8px;
  background: rgba(12, 14, 24, 0.55);
  border: 1px solid var(--rv2-border-muted);
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.rv2-finding:hover {
  transform: translateX(2px);
  border-color: color-mix(in srgb, var(--rv2-primary) 30%, var(--rv2-border-muted));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
.rv2-finding.sev-critical::before,
.rv2-finding.sev-major::before,
.rv2-finding.sev-minor::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 10px;
  bottom: 10px;
  width: 4px;
  border-radius: 99px; /* 圆角胶囊形状 */
  transition: transform 0.2s ease;
}
.rv2-finding.sev-critical::before {
  background: var(--tp-accent-danger, #dc2626);
}
.rv2-finding.sev-major::before {
  background: var(--tp-accent-warning, #f59e0b);
}
.rv2-finding.sev-minor::before {
  background: var(--tp-accent-info, #6366f1);
}
.rv2-finding-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.rv2-finding-sev,
.rv2-finding-field,
.rv2-finding-status {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}
.rv2-finding-field {
  gap: 3px;
  color: rgba(204, 195, 216, 0.78);
  background: rgba(204, 195, 216, 0.08);
  border: none;
  cursor: pointer;
  font-family: inherit;
  transition:
    color 0.16s,
    background 0.16s;
}
.rv2-finding-field .material-symbols-outlined {
  font-size: 12px;
}
.rv2-finding-field:hover,
.rv2-finding-field:focus-visible {
  color: var(--rv2-primary);
  background: rgba(124, 58, 237, 0.14);
  outline: none;
}
.rv2-finding-sev.sev-critical {
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
}
.rv2-finding-sev.sev-major {
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
}
.rv2-finding-sev.sev-minor {
  background: rgba(173, 198, 255, 0.12);
  color: #adc6ff;
}
.rv2-finding-status.st-open {
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
}
.rv2-finding-status.st-resolved {
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
}
.rv2-finding-status.st-disputed {
  background: rgba(173, 198, 255, 0.12);
  color: #adc6ff;
}
.rv2-finding-status.st-pending {
  background: rgba(204, 195, 216, 0.08);
  color: rgba(204, 195, 216, 0.7);
}
/* static 类型整体色调弱化，与可操作的 defect 区分 */
.rv2-finding.kind-static {
  opacity: 0.95;
}
.rv2-finding.kind-static .rv2-finding-msg {
  color: rgba(225, 225, 242, 0.85);
}
.rv2-finding-msg {
  font-size: 12px;
  line-height: 1.55;
  color: var(--rv2-fg);
  word-break: break-word;
}
.rv2-finding-note {
  margin: 0;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  line-height: 1.5;
  color: rgba(204, 195, 216, 0.75);
  background: rgba(255, 255, 255, 0.03);
  border-left: 2px solid rgba(124, 58, 237, 0.3);
}
.rv2-finding-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.rv2-finding-btn {
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent;
  color: var(--rv2-fg-muted);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.rv2-finding-btn:hover {
  color: var(--rv2-primary);
  border-color: rgba(210, 187, 255, 0.35);
  background: var(--rv2-hover-tint);
}
.rv2-finding-btn .material-symbols-outlined {
  font-size: 13px;
}
.rv2-finding-btn-ok {
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.25);
}
.rv2-finding-btn-ok:hover {
  color: #10b981;
  border-color: rgba(16, 185, 129, 0.5);
  background: rgba(16, 185, 129, 0.08);
}
.rv2-findings-loading {
  margin-top: 12px;
  text-align: center;
  font-size: 11px;
  color: var(--rv2-muted-faint);
}

/* ── 用例字段审阅 ── */
.rv2-case-fields {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.rv2-case-fields-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.rv2-case-fields-head .rv2-panel-title {
  margin: 0;
}
.rv2-basic-fields {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
@media (min-width: 900px) {
  .rv2-basic-fields {
    grid-template-columns: minmax(120px, 0.7fr) minmax(120px, 0.7fr) minmax(180px, 1.2fr);
  }
}
.rv2-basic-field {
  min-width: 0;
  padding: 12px;
  border-radius: var(--rv2-radius-sm);
  background: rgba(12, 14, 24, 0.38);
  border: 1px solid rgba(74, 68, 85, 0.14);
}
.rv2-basic-field.has-issue {
  border-color: rgba(245, 158, 11, 0.36);
  background: rgba(245, 158, 11, 0.055);
}
.rv2-basic-field.is-field-focused,
.rv2-cond-col.is-field-focused,
.rv2-steps-sec.is-field-focused {
  outline: 2px solid rgba(210, 187, 255, 0.65);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.12);
}
.rv2-field-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
  color: rgba(204, 195, 216, 0.74);
}
.rv2-field-head .material-symbols-outlined {
  font-size: 15px;
  color: var(--rv2-secondary);
}
.rv2-field-head strong {
  font-size: 11px;
  font-weight: 700;
}
.rv2-basic-field p {
  margin: 0;
  color: var(--rv2-fg);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.65;
  word-break: break-word;
}
.rv2-field-value {
  display: flex;
  align-items: center;
  min-height: 26px;
}
.rv2-value-tag {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid rgba(204, 195, 216, 0.12);
  background: rgba(204, 195, 216, 0.06);
  color: var(--rv2-fg);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.25;
}
.rv2-level-tag {
  border-color: rgba(173, 198, 255, 0.2);
  background: rgba(5, 102, 217, 0.1);
  color: var(--rv2-secondary);
}
.rv2-priority-tag.is-critical,
.rv2-priority-tag.is-high {
  border-color: rgba(239, 68, 68, 0.22);
  background: rgba(239, 68, 68, 0.1);
  color: var(--rv2-error);
}
.rv2-priority-tag.is-medium {
  border-color: rgba(245, 158, 11, 0.22);
  background: rgba(245, 158, 11, 0.1);
  color: var(--rv2-warning);
}
.rv2-priority-tag.is-low {
  border-color: rgba(16, 185, 129, 0.2);
  background: rgba(16, 185, 129, 0.08);
  color: var(--rv2-success);
}
.rv2-basic-module p {
  color: rgba(225, 225, 242, 0.82);
}
.rv2-module-path {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  overflow: hidden;
  color: rgba(204, 195, 216, 0.68);
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
}
.rv2-module-segment {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rv2-module-segment.is-leaf {
  color: var(--rv2-fg);
  font-weight: 700;
}
.rv2-module-separator {
  flex-shrink: 0;
  color: rgba(204, 195, 216, 0.35);
}
.rv2-conditions {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr;
}
@media (min-width: 720px) {
  .rv2-conditions {
    grid-template-columns: 1fr 1fr;
  }
}
.rv2-cond-col {
  min-width: 0;
  padding: 12px;
  background: rgba(29, 31, 43, 0.42);
  border: 1px solid rgba(74, 68, 85, 0.13);
  border-radius: var(--rv2-radius-sm);
}
.rv2-cond-col.has-issue {
  border-color: rgba(245, 158, 11, 0.36);
  background: rgba(245, 158, 11, 0.055);
}
.rv2-cond-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
  color: rgba(204, 195, 216, 0.82);
}
.rv2-cond-title-icon {
  font-size: 16px;
}
.st-accent-secondary {
  color: var(--rv2-secondary);
}
.st-accent-outline {
  color: var(--rv2-outline);
}
.rv2-cond-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rv2-cond-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 8px 9px;
  border-radius: 4px;
  background: rgba(12, 14, 24, 0.34);
  border: 1px solid rgba(74, 68, 85, 0.12);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.55;
  color: rgba(225, 225, 242, 0.9);
  word-break: break-word;
}
.rv2-cond-check {
  flex-shrink: 0;
  font-size: 16px;
  color: var(--rv2-secondary);
}
.rv2-cond-circle {
  flex-shrink: 0;
  font-size: 16px;
  color: var(--rv2-outline);
}
.rv2-cond-pending {
  color: var(--rv2-fg-muted);
}
.rv2-cond-empty {
  color: var(--rv2-fg-muted);
  opacity: 0.5;
  font-style: italic;
}
.rv2-cond-empty .material-symbols-outlined {
  color: var(--rv2-fg-muted);
  opacity: 0.4;
}

/* ── 执行步骤列表 ── */
.rv2-steps-sec {
  padding-top: 16px;
  border-top: 1px solid rgba(74, 68, 85, 0.16);
}
.rv2-steps-sec.has-issue {
  border-top-color: rgba(245, 158, 11, 0.32);
}
.rv2-empty-steps {
  padding: 22px;
  text-align: center;
  font-size: 13px;
  color: var(--rv2-fg-muted);
  opacity: 0.58;
  border: 1px dashed rgba(74, 68, 85, 0.24);
  border-radius: var(--rv2-radius-sm);
}
.rv2-step-table-wrap {
  overflow: hidden;
  border: 1px solid rgba(74, 68, 85, 0.2);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.1);
}
.rv2-step-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}
.rv2-step-table th {
  padding: 12px 16px;
  text-align: left;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(74, 68, 85, 0.2);
  color: var(--rv2-outline);
  font-size: 12px;
  font-weight: 500;
}
/* 步骤表头添加列之间的竖线分割，使列与列之间视觉边界更清晰 */
.rv2-step-table th:not(:last-child) {
  border-right: 1px solid rgba(74, 68, 85, 0.15);
}
.rv2-step-row {
  border-bottom: 1px solid rgba(74, 68, 85, 0.1);
  transition: background 0.2s;
}
.rv2-step-row:last-child {
  border-bottom: none;
}
.rv2-step-row:hover {
  background: rgba(255, 255, 255, 0.02);
}
.rv2-step-table td {
  padding: 12px 16px;
  vertical-align: top;
}
/* 步骤内容单元格添加列之间的竖线分割，提升数据列之间的可读性 */
.rv2-step-table td:not(:last-child) {
  border-right: 1px solid rgba(74, 68, 85, 0.1);
}
.rv2-step-col-num {
  width: 80px;
}
.rv2-step-col-desc {
  width: 45%;
}
.rv2-step-col-expect {
  width: auto;
}
.rv2-step-num {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  color: var(--rv2-outline);
  font-size: 13px;
  font-weight: 600;
}
.rv2-step-text {
  color: var(--rv2-fg);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.65;
  word-break: break-word;
  overflow-wrap: break-word;
}
.rv2-step-expected {
  color: var(--rv2-muted-soft);
}
/* ── 评审用例列表（左侧边栏内） ── */
.rv2-case-row {
  display: flex;
  flex-shrink: 0;
  align-items: flex-start;
  gap: 10px;
  min-height: 64px;
  padding: 12px 14px;
  width: 100%;
  background: transparent;
  border: 1px solid transparent;
  border-bottom-color: rgba(74, 68, 85, 0.08);
  text-align: left;
  color: var(--rv2-fg-muted);
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}
.rv2-case-row:last-child {
  border-bottom-color: transparent;
}
.rv2-case-row:hover {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(210, 187, 255, 0.14);
  color: var(--rv2-fg);
}
.rv2-case-row.active {
  background: rgba(124, 58, 237, 0.13);
  border-color: rgba(210, 187, 255, 0.28);
  box-shadow: inset 0 0 0 1px rgba(210, 187, 255, 0.08);
  color: var(--rv2-fg);
}
.rv2-case-idx {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  color: rgba(204, 195, 216, 0.4);
  width: 24px;
  flex-shrink: 0;
  padding-top: 2px;
}
.rv2-case-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.rv2-case-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(225, 225, 242, 0.88);
  font-size: 13px;
  font-weight: 500;
}
.rv2-case-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.rv2-case-status,
.rv2-case-ai {
  min-height: 20px;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.25;
  background: rgba(204, 195, 216, 0.07);
  border: 1px solid rgba(204, 195, 216, 0.1);
  color: var(--rv2-muted-soft);
}
.rv2-case-status.approved {
  color: var(--rv2-success);
  background: rgba(16, 185, 129, 0.09);
  border-color: rgba(16, 185, 129, 0.18);
}
.rv2-case-status.rejected {
  color: var(--rv2-error);
  background: rgba(239, 68, 68, 0.09);
  border-color: rgba(239, 68, 68, 0.2);
}
.rv2-case-status.needs-update {
  color: var(--rv2-warning);
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.2);
}
.rv2-case-ai.passed {
  color: var(--rv2-success);
  border-color: rgba(16, 185, 129, 0.16);
}
.rv2-case-ai.failed {
  color: var(--rv2-warning);
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.24);
}
.rv2-case-ai.running {
  color: var(--rv2-secondary);
  border-color: rgba(173, 198, 255, 0.18);
}
.rv2-case-ai.idle {
  color: rgba(204, 195, 216, 0.5);
}

/* ── 附件与证据 ── */
.rv2-panel-compact {
  padding: 16px 24px;
}
.rv2-panel-compact .rv2-panel-title {
  margin-bottom: 10px;
}
.rv2-attach-empty-inline {
  display: flex;
  align-items: center;
}
.rv2-attach-inline-btn {
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--rv2-radius-sm);
  border: 1px dashed rgba(74, 68, 85, 0.3);
  background: transparent;
  color: var(--rv2-fg-muted);
  opacity: 0.5;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.rv2-attach-inline-btn .material-symbols-outlined {
  font-size: 16px;
}
.rv2-attach-inline-btn:hover {
  border-color: rgba(124, 58, 237, 0.4);
  color: var(--rv2-primary);
  opacity: 1;
}
.rv2-attach-inline-btn.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.rv2-file-input {
  display: none;
}
.rv2-attach-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
}
.rv2-attach-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 120px;
  padding: 16px;
  border: 1px dashed rgba(74, 68, 85, 0.3);
  border-radius: var(--rv2-radius-sm);
  color: var(--rv2-fg-muted);
  opacity: 0.4;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
}
.rv2-attach-drop:hover {
  border-color: rgba(124, 58, 237, 0.5);
  color: var(--rv2-primary);
  opacity: 1;
}
.rv2-attach-drop.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.rv2-attach-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 44px 12px 12px;
  min-height: 120px;
  background: var(--rv2-card);
  border: 1px solid var(--rv2-border-hairline);
  border-radius: var(--rv2-radius-sm);
  transition:
    border-color 0.16s,
    background 0.16s;
}
.rv2-attach-card:hover,
.rv2-attach-card:focus-within {
  background: var(--rv2-card-high);
  border-color: var(--rv2-border-muted);
}
.rv2-attach-card.has-preview {
  min-height: 120px;
}
.rv2-attach-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--rv2-radius-sm);
  background: rgba(124, 58, 237, 0.12);
  color: var(--rv2-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}
.rv2-attach-preview {
  flex-shrink: 0;
  width: 96px;
  height: 96px;
  min-height: 96px;
  padding: 0;
  border-radius: var(--rv2-radius-sm);
  overflow: hidden;
  background: rgba(12, 14, 24, 0.7);
  border: 1px solid var(--rv2-border-muted);
  color: rgba(204, 195, 216, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-in;
}
.rv2-attach-preview:disabled {
  cursor: wait;
}
.rv2-attach-preview:hover:not(:disabled),
.rv2-attach-preview:focus-visible {
  border-color: rgba(210, 187, 255, 0.42);
  outline: none;
}
.rv2-attach-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.rv2-attach-preview .material-symbols-outlined {
  font-size: 26px;
}
.rv2-attach-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rv2-attach-name {
  font-size: 13px;
  color: var(--rv2-fg);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rv2-attach-meta {
  font-size: 11px;
  color: var(--rv2-fg-muted);
  opacity: 0.7;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
}
.rv2-attach-meta span {
  display: inline-block;
  white-space: nowrap;
}
.rv2-attach-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 4px;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-2px);
  transition:
    opacity 0.16s,
    transform 0.16s;
}
.rv2-attach-card:hover .rv2-attach-actions,
.rv2-attach-card:focus-within .rv2-attach-actions {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
.rv2-attach-action {
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--rv2-muted-soft);
  cursor: pointer;
  transition:
    color 0.16s,
    background 0.16s,
    transform 0.16s;
}
.rv2-attach-action .material-symbols-outlined {
  font-size: 16px;
}
.rv2-attach-action:hover,
.rv2-attach-action:focus-visible {
  background: var(--rv2-hover-tint);
  color: var(--rv2-primary);
  outline: none;
  transform: translateY(-1px);
}
.rv2-attach-action.danger {
  color: var(--rv2-error);
}
.rv2-attach-action.danger:hover,
.rv2-attach-action.danger:focus-visible {
  background: rgba(239, 68, 68, 0.1);
  color: var(--rv2-error);
}
@media (hover: none) {
  .rv2-attach-actions {
    opacity: 1;
    pointer-events: auto;
    transform: none;
  }
}
.rv2-image-preview-body {
  display: flex;
  justify-content: center;
  align-items: center;
  max-height: 72vh;
  background: rgba(12, 14, 24, 0.82);
  border-radius: var(--rv2-radius-sm);
  overflow: hidden;
}
.rv2-image-preview-body img {
  max-width: 100%;
  max-height: 72vh;
  object-fit: contain;
  display: block;
}
:deep(.rv2-image-preview-dialog .el-dialog) {
  background: var(--rv2-section);
  border: 1px solid rgba(74, 68, 85, 0.26);
}
:deep(.rv2-image-preview-dialog .el-dialog__title) {
  color: var(--rv2-fg);
}

/* ── 右栏：执行决策 ── */
.rv2-decision {
  overflow: visible;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.rv2-decision-options {
  display: grid;
  gap: 8px;
}
.rv2-decision-option {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 11px;
  min-height: 58px;
  padding: 12px;
  border-radius: var(--rv2-radius-sm);
  border: 1px solid rgba(74, 68, 85, 0.2);
  background: rgba(255, 255, 255, 0.02);
  color: var(--rv2-fg-muted);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.16s,
    background 0.16s,
    color 0.16s,
    transform 0.16s;
}
.rv2-decision-option:hover {
  border-color: rgba(210, 187, 255, 0.28);
  background: rgba(124, 58, 237, 0.07);
  color: var(--rv2-fg);
  transform: translateY(-1px);
}
.rv2-decision-option.active {
  color: var(--rv2-fg);
  border-color: rgba(210, 187, 255, 0.48);
  background: rgba(124, 58, 237, 0.12);
  box-shadow: inset 0 0 0 1px rgba(210, 187, 255, 0.08);
}
.rv2-decision-option.decision-rejected.active {
  border-color: rgba(239, 68, 68, 0.42);
  background: rgba(239, 68, 68, 0.08);
  box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.1);
}
.rv2-decision-option.decision-needs_update.active {
  border-color: rgba(245, 158, 11, 0.42);
  background: rgba(245, 158, 11, 0.08);
  box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.12);
}
.rv2-decision-option .material-symbols-outlined {
  flex-shrink: 0;
  margin-top: 1px;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(204, 195, 216, 0.07);
  font-size: 18px;
}
.rv2-decision-option.active .material-symbols-outlined {
  background: rgba(210, 187, 255, 0.14);
  color: var(--rv2-primary);
}
.rv2-decision-option.decision-rejected.active .material-symbols-outlined {
  background: rgba(239, 68, 68, 0.14);
  color: var(--rv2-error);
}
.rv2-decision-option.decision-needs_update.active .material-symbols-outlined {
  background: rgba(245, 158, 11, 0.15);
  color: var(--rv2-warning);
}
.rv2-decision-option strong,
.rv2-decision-option small {
  display: block;
}
.rv2-decision-option strong {
  margin-bottom: 2px;
  font-size: 13px;
  font-weight: 650;
}
.rv2-decision-option small {
  color: rgba(204, 195, 216, 0.62);
  font-size: 11px;
  line-height: 1.45;
}
.rv2-decision-input {
  width: 100%;
  min-height: 96px;
  resize: vertical;
  padding: 12px 14px;
  background: var(--rv2-card);
  border: 1px solid rgba(74, 68, 85, 0.35);
  border-radius: var(--rv2-radius-sm);
  color: var(--rv2-fg);
  font-family: inherit;
  font-size: 13px;
  font-weight: 300;
  line-height: 1.6;
  outline: none;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2);
}
.rv2-decision-input::placeholder {
  color: var(--rv2-muted-faint);
}
.rv2-decision-input:focus {
  border-color: var(--rv2-primary);
  box-shadow:
    0 0 0 1px var(--rv2-primary),
    0 0 4px rgba(210, 187, 255, 0.3);
}
.rv2-btn {
  justify-content: center;
  gap: 6px;
  padding: 12px;
  border-radius: var(--rv2-radius-sm);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
  background: transparent;
}
.rv2-btn .material-symbols-outlined {
  font-size: 18px;
}
.rv2-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.rv2-btn-submit {
  width: 100%;
  background: var(--rv2-primary-strong);
  color: var(--rv2-fg);
  box-shadow: 0 4px 15px rgba(124, 58, 237, 0.3);
  position: relative;
  overflow: hidden;
}
.rv2-btn-submit:hover:not(:disabled) {
  filter: brightness(1.08);
  box-shadow: 0 6px 20px rgba(124, 58, 237, 0.45);
  transform: translateY(-1px);
}
.rv2-btn-submit.decision-rejected {
  background: rgba(239, 68, 68, 0.13);
  color: var(--rv2-error);
  border-color: rgba(239, 68, 68, 0.42);
  box-shadow: none;
}
.rv2-btn-submit.decision-rejected:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.2);
  border-color: var(--rv2-error);
  box-shadow: none;
  filter: none;
}
.rv2-btn-submit.decision-needs_update {
  background: rgba(245, 158, 11, 0.13);
  color: var(--rv2-warning);
  border-color: rgba(245, 158, 11, 0.42);
  box-shadow: none;
}
.rv2-btn-submit.decision-needs_update:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.2);
  border-color: var(--rv2-warning);
  box-shadow: none;
  filter: none;
}

/* ── 评审轨迹 ── */
.rv2-audit-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 210px;
  padding: 28px 18px;
  text-align: center;
  color: var(--rv2-fg-muted);
  border: 1px dashed var(--rv2-border-muted);
  border-radius: var(--rv2-radius-sm);
  background: rgba(12, 14, 24, 0.24);
}
.rv2-audit-empty .material-symbols-outlined {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(204, 195, 216, 0.08);
  color: var(--rv2-muted-soft);
  font-size: 22px;
}
.rv2-audit-empty strong {
  color: var(--rv2-fg);
  font-size: 13px;
  font-weight: 700;
}
.rv2-audit-empty span:not(.material-symbols-outlined) {
  max-width: 220px;
  font-size: 11px;
  line-height: 1.55;
  color: var(--rv2-muted-faint);
}
.rv2-audit-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.rv2-audit-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: var(--rv2-radius-sm);
  background: rgba(12, 14, 24, 0.46);
  border: 1px solid var(--rv2-border-soft);
}
.rv2-audit-summary.rv2-tl-approved {
  border-color: rgba(16, 185, 129, 0.22);
}
.rv2-audit-summary.rv2-tl-rejected {
  border-color: rgba(239, 68, 68, 0.24);
}
.rv2-audit-summary.rv2-tl-needs-update {
  border-color: rgba(245, 158, 11, 0.26);
}
.rv2-audit-summary-icon {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(149, 141, 161, 0.12);
  color: var(--rv2-outline);
  font-size: 17px;
}
.rv2-tl-approved .rv2-audit-summary-icon,
.rv2-tl-approved .rv2-audit-node {
  background: rgba(16, 185, 129, 0.12);
  color: var(--rv2-success);
}
.rv2-tl-rejected .rv2-audit-summary-icon,
.rv2-tl-rejected .rv2-audit-node {
  background: rgba(239, 68, 68, 0.12);
  color: var(--rv2-error);
}
.rv2-tl-needs-update .rv2-audit-summary-icon,
.rv2-tl-needs-update .rv2-audit-node {
  background: rgba(245, 158, 11, 0.13);
  color: var(--rv2-warning);
}
.rv2-audit-summary-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.rv2-audit-kicker {
  color: var(--rv2-muted-faint);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.rv2-audit-summary-main strong {
  color: var(--rv2-fg);
  font-size: 14px;
  line-height: 1.25;
}
.rv2-audit-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 11px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.rv2-audit-list::before {
  position: absolute;
  top: 14px;
  bottom: 14px;
  left: 13px;
  width: 1px;
  content: '';
  background: var(--rv2-border-muted);
}
.rv2-audit-item {
  position: relative;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 10px;
}
.rv2-audit-node {
  position: relative;
  z-index: 1;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(149, 141, 161, 0.18);
  border-radius: 999px;
  background: var(--rv2-section);
  color: var(--rv2-outline);
}
.rv2-audit-node .material-symbols-outlined {
  font-size: 15px;
}
.rv2-audit-card {
  min-width: 0;
  padding: 10px 11px;
  border: 1px solid var(--rv2-border-soft);
  border-radius: var(--rv2-radius-sm);
  background: rgba(17, 19, 30, 0.58);
}
.rv2-audit-card-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 7px;
}
.rv2-audit-time {
  margin-left: auto;
  color: var(--rv2-outline);
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  opacity: 0.72;
  white-space: nowrap;
}
.rv2-audit-reviewer-line {
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  margin-bottom: 4px;
  color: var(--rv2-fg);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.35;
}
.rv2-audit-summary-main .rv2-audit-reviewer-line {
  color: var(--rv2-muted-soft);
  font-size: 11px;
}
.rv2-audit-reviewer-line span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rv2-audit-avatar {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border: 1px solid rgba(204, 195, 216, 0.14);
  border-radius: 999px;
  background: var(--rv2-card-high);
  object-fit: cover;
}
.rv2-drawer-reviewer {
  margin-bottom: 8px;
}
.rv2-audit-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--rv2-border-soft);
  border-radius: var(--rv2-radius-sm);
  background: rgba(204, 195, 216, 0.05);
  color: var(--rv2-muted-soft);
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
  transition:
    border-color 0.16s,
    background 0.16s,
    color 0.16s;
}
.rv2-audit-more:hover,
.rv2-audit-more:focus-visible {
  border-color: var(--rv2-border-muted);
  background: var(--rv2-hover-tint);
  color: var(--rv2-primary);
  outline: none;
}
.rv2-audit-more .material-symbols-outlined {
  font-size: 15px;
}
.rv2-tl-desc {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--rv2-fg-muted);
  opacity: 0.85;
  white-space: pre-wrap;
  word-break: break-word;
}
.rv2-tl-muted {
  opacity: 0.45;
  font-style: italic;
}

/* ── 空态 & 抽屉 ── */
.rv2-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 96px 24px;
  text-align: center;
  color: var(--rv2-fg-muted);
}
.rv2-empty-icon {
  font-size: 48px;
  opacity: 0.25;
}
.rv2-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: var(--rv2-radius-sm);
  border: none;
  background: var(--rv2-primary-strong);
  color: #ede0ff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.rv2-link-btn:hover {
  filter: brightness(1.08);
}
:deep(.rv2-record-drawer) {
  background: var(--rv2-bg);
}
:deep(.rv2-record-drawer .el-drawer__body) {
  padding: 0;
  background: var(--rv2-bg);
  color: var(--rv2-fg);
}
.rv2-record-drawer-shell {
  min-height: 100%;
  padding: 18px 18px 24px;
}
.rv2-record-drawer-header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin: -18px -18px 18px;
  padding: 18px;
  background: rgba(17, 19, 30, 0.96);
  border-bottom: 1px solid var(--rv2-border-hairline);
}
.rv2-record-drawer-title {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.rv2-record-drawer-title > .material-symbols-outlined {
  margin-top: 1px;
  color: var(--rv2-muted-soft);
  font-size: 20px;
}
.rv2-record-drawer-title div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.rv2-record-drawer-title strong {
  color: var(--rv2-fg);
  font-size: 15px;
  font-weight: 760;
  line-height: 1.25;
}
.rv2-record-drawer-title span:not(.material-symbols-outlined) {
  overflow: hidden;
  max-width: 320px;
  color: var(--rv2-muted-soft);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rv2-record-drawer-close {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--rv2-border-soft);
  border-radius: 999px;
  background: rgba(204, 195, 216, 0.05);
  color: var(--rv2-muted-soft);
  cursor: pointer;
  transition:
    background 0.16s,
    border-color 0.16s,
    color 0.16s;
}
.rv2-record-drawer-close:hover,
.rv2-record-drawer-close:focus-visible {
  background: var(--rv2-hover-tint);
  border-color: var(--rv2-border-muted);
  color: var(--rv2-fg);
  outline: none;
}
.rv2-record-drawer-close .material-symbols-outlined {
  font-size: 18px;
}
.rv2-record-drawer-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
  padding: 9px 11px;
  border: 1px solid var(--rv2-border-hairline);
  border-radius: var(--rv2-radius-sm);
  background: rgba(204, 195, 216, 0.04);
  color: var(--rv2-muted-faint);
  font-size: 11px;
  font-weight: 650;
}
.rv2-drawer-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 260px;
  padding: 48px 22px;
  gap: 10px;
  text-align: center;
  color: var(--rv2-fg-muted);
  border: 1px dashed var(--rv2-border-muted);
  border-radius: var(--rv2-radius-sm);
  background: rgba(12, 14, 24, 0.28);
}
.rv2-drawer-empty .material-symbols-outlined {
  width: 46px;
  height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(204, 195, 216, 0.08);
  color: var(--rv2-muted-soft);
  font-size: 24px;
}
.rv2-drawer-empty strong {
  color: var(--rv2-fg);
  font-size: 14px;
  font-weight: 700;
}
.rv2-drawer-empty p {
  max-width: 260px;
  margin: 0;
  color: var(--rv2-muted-faint);
  font-size: 12px;
  line-height: 1.6;
}
.rv2-drawer-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rv2-drawer-list::before {
  position: absolute;
  top: 16px;
  bottom: 16px;
  left: 15px;
  width: 1px;
  content: '';
  background: var(--rv2-border-muted);
}
.rv2-drawer-item {
  position: relative;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 12px;
  padding: 0;
  border: 0;
  background: transparent;
}
.rv2-drawer-node {
  position: relative;
  z-index: 1;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(149, 141, 161, 0.18);
  border-radius: 999px;
  background: var(--rv2-section);
  color: var(--rv2-outline);
}
.rv2-drawer-node .material-symbols-outlined {
  font-size: 16px;
}
.rv2-tl-approved .rv2-drawer-node {
  background: rgba(16, 185, 129, 0.12);
  color: var(--rv2-success);
}
.rv2-tl-rejected .rv2-drawer-node {
  background: rgba(239, 68, 68, 0.12);
  color: var(--rv2-error);
}
.rv2-tl-needs-update .rv2-drawer-node {
  background: rgba(245, 158, 11, 0.13);
  color: var(--rv2-warning);
}
.rv2-drawer-card {
  min-width: 0;
  padding: 13px 14px;
  border-radius: var(--rv2-radius-sm);
  border: 1px solid var(--rv2-border-soft);
  background: rgba(17, 19, 30, 0.62);
}
.rv2-drawer-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 9px;
}
.rv2-drawer-result {
  padding: 4px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 750;
}
.rv2-drawer-result.approved {
  background: rgba(16, 185, 129, 0.12);
  color: var(--rv2-success);
}
.rv2-drawer-result.rejected {
  background: rgba(239, 68, 68, 0.12);
  color: var(--rv2-error);
}
.rv2-drawer-result.needs-update {
  background: rgba(245, 158, 11, 0.12);
  color: var(--rv2-warning);
}
.rv2-drawer-result.pending {
  background: rgba(149, 141, 161, 0.12);
  color: var(--rv2-outline);
}
.rv2-drawer-time {
  margin-left: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--rv2-outline);
  opacity: 0.72;
  white-space: nowrap;
}
.rv2-drawer-comment {
  margin: 0;
  padding: 9px 10px;
  border: 1px solid var(--rv2-border-hairline);
  border-radius: 7px;
  background: rgba(12, 14, 24, 0.42);
  font-size: 12px;
  line-height: 1.5;
  color: var(--rv2-fg-muted);
  white-space: pre-wrap;
  word-break: break-word;
}
.rv2-drawer-comment-muted {
  color: var(--rv2-muted-faint);
  font-style: italic;
}

.rv2 {
  --rv2-panel-border-strong: rgba(210, 187, 255, 0.18);
}

.rv2-main {
  gap: clamp(14px, 1.2vw, 20px);
}

.rv2-summary {
  border-color: var(--rv2-panel-border-strong);
}

.rv2-summary-r {
  justify-content: flex-end;
}

.rv2-progress-compact {
  padding: 10px 12px;
  border: 1px solid var(--rv2-border-soft);
  border-radius: var(--rv2-radius-sm);
  background: rgba(12, 14, 24, 0.34);
}

.rv2-nav-pos {
  min-width: 72px;
  padding: 0 10px;
  border: 1px solid var(--rv2-border-soft);
  border-radius: 999px;
  background: rgba(12, 14, 24, 0.32);
  font-variant-numeric: tabular-nums;
}

.rv2-body,
.rv2-grid {
  gap: clamp(14px, 1vw, 20px);
}

.rv2-sidebar,
.rv2-panel {
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.rv2-sidebar:hover,
.rv2-panel:hover {
  border-color: var(--rv2-panel-border-strong);
}

.rv2-sidebar-title {
  letter-spacing: 0.01em;
}

.rv2-sidebar-counter {
  padding: 2px 8px;
  border: 1px solid var(--rv2-border-soft);
  border-radius: 999px;
  background: rgba(12, 14, 24, 0.34);
}

.rv2-sidebar-filter {
  min-height: 32px;
}

.rv2-case-row {
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease,
    box-shadow 0.16s ease;
}

.rv2-case-row.active {
  box-shadow:
    inset 3px 0 0 var(--rv2-primary-strong),
    inset 0 0 0 1px rgba(210, 187, 255, 0.08);
}

.rv2-case-idx {
  text-align: center;
}

.rv2-panel-title {
  min-height: 34px;
}

.rv2-gate-card,
.rv2-basic-card,
.rv2-condition-box,
.rv2-step-table,
.rv2-decision-panel,
.rv2-audit-latest,
.rv2-attachments {
  border-color: var(--rv2-border-soft);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.018);
}

.rv2-decision-option {
  border-color: var(--rv2-border-soft);
}

.rv2-decision-option:active,
.rv2-panel-btn:active,
.rv2-btn:active,
.rv2-nav-btn:active {
  transform: scale(0.98);
}

.rv2-step-table {
  overflow: hidden;
}

.rv2-step-table th {
  background: rgba(12, 14, 24, 0.72);
}

.rv2-step-table tr:hover td {
  background: rgba(124, 58, 237, 0.035);
}

.rv2-record-drawer-shell {
  background-image:
    radial-gradient(circle at 18% 0%, rgba(124, 58, 237, 0.08), transparent 32%),
    radial-gradient(circle at 92% 14%, rgba(5, 102, 217, 0.06), transparent 26%);
}

.rv2-record-drawer-header {
  backdrop-filter: blur(14px);
}

.rv2-drawer-card {
  transition:
    border-color 0.18s ease,
    background 0.18s ease;
}

.rv2-drawer-item:hover .rv2-drawer-card {
  border-color: var(--rv2-panel-border-strong);
  background: rgba(17, 19, 30, 0.78);
}

.rv2-drawer-result {
  border: 1px solid currentColor;
}

@media (max-width: 1180px) {
  .rv2-summary-r {
    justify-content: flex-start;
    width: 100%;
  }

  .rv2-progress-compact {
    flex: 1;
  }
}

@media (max-width: 760px) {
  .rv2-main {
    padding: 14px;
  }

  .rv2-summary,
  .rv2-sidebar-header,
  .rv2-panel {
    padding-inline: 14px;
  }

  .rv2-summary-r,
  .rv2-nav-btns,
  .rv2-panel-title,
  .rv2-panel-actions {
    align-items: stretch;
    width: 100%;
  }

  .rv2-panel-title,
  .rv2-summary-r {
    flex-direction: column;
  }

  .rv2-panel-actions,
  .rv2-nav-btns {
    justify-content: flex-start;
  }

  .rv2-progress-compact,
  .rv2-panel-btn,
  .rv2-btn {
    width: 100%;
  }

  .rv2-case-row {
    min-height: 72px;
  }
}

.rv2 {
  --rv2-bg: var(--tp-surface-base);
  --rv2-surface: var(--tp-surface-base);
  --rv2-section: var(--tp-surface-card);
  --rv2-card: var(--tp-surface-card);
  --rv2-card-high: var(--tp-surface-elevated);
  --rv2-card-bright: var(--tp-surface-hover);
  --rv2-input: var(--tp-surface-input);
  --rv2-primary: var(--tp-primary);
  --rv2-primary-strong: var(--tp-primary);
  --rv2-secondary: var(--tp-accent-info);
  --rv2-secondary-strong: var(--tp-accent-info);
  --rv2-tertiary: var(--tp-accent-warning);
  --rv2-fg: var(--tp-gray-900);
  --rv2-fg-muted: var(--tp-gray-600);
  --rv2-outline: var(--tp-gray-400);
  --rv2-outline-variant: var(--tp-border-subtle);
  --rv2-border-hairline: var(--tp-border-subtle);
  --rv2-border-soft: var(--tp-border-subtle);
  --rv2-border-muted: var(--tp-border-subtle);
  --rv2-muted-soft: var(--tp-gray-600);
  --rv2-muted-faint: var(--tp-gray-400);
  --rv2-hover-tint: var(--tp-surface-hover);
  --rv2-success: var(--tp-accent-success);
  --rv2-warning: var(--tp-accent-warning);
  --rv2-error: var(--tp-accent-danger);
  --rv2-shadow-panel: var(--tp-shadow-card);
  --rv2-focus-ring: 0 0 0 3px var(--tp-accent-primary-soft);
  background:
    radial-gradient(circle at 18% 0%, var(--tp-ambient-primary), transparent 30%),
    radial-gradient(circle at 82% 12%, var(--tp-ambient-info), transparent 28%),
    var(--tp-surface-base);
  color: var(--tp-gray-900);
}

:deep(.el-loading-mask) {
  background: rgba(248, 250, 252, 0.72);
}

.rv2-summary,
.rv2-sidebar,
.rv2-panel,
.rv2-gate-card,
.rv2-attach-card,
.rv2-audit-summary,
.rv2-audit-card,
.rv2-drawer-card,
.rv2-record-drawer-meta,
.rv2-progress-compact {
  background: var(--tp-surface-card);
  border-color: var(--tp-border-subtle);
  box-shadow: var(--tp-shadow-card);
}

.rv2-basic-field,
.rv2-cond-col,
.rv2-cond-item,
.rv2-finding,
.rv2-step-table-wrap,
.rv2-decision-option,
.rv2-decision-input,
.rv2-drawer-comment,
.rv2-attach-preview,
.rv2-audit-empty,
.rv2-drawer-empty,
.rv2-record-drawer-close,
.rv2-sidebar-filter,
.rv2-nav-pos {
  background: var(--tp-surface-input);
  border-color: var(--tp-border-subtle);
  color: var(--tp-gray-700);
  box-shadow: none;
}

.rv2-summary-title,
.rv2-gate-card-title,
.rv2-gate-empty-state strong,
.rv2-basic-field p,
.rv2-module-segment.is-leaf,
.rv2-step-text,
.rv2-case-name,
.rv2-attach-name,
.rv2-decision-option strong,
.rv2-audit-summary-main strong,
.rv2-audit-reviewer-line,
.rv2-empty-state,
.rv2-record-drawer-title strong,
.rv2-drawer-empty strong {
  color: var(--tp-gray-900);
}

.rv2-summary-desc,
.rv2-progress-copy,
.rv2-nav-pos,
.rv2-sidebar-header,
.rv2-sidebar-counter,
.rv2-panel-title,
.rv2-panel-count,
.rv2-loading,
.rv2-gate-card-desc,
.rv2-field-head,
.rv2-module-path,
.rv2-cond-title,
.rv2-step-expected,
.rv2-case-row,
.rv2-attach-meta,
.rv2-decision-option,
.rv2-decision-option small,
.rv2-tl-desc,
.rv2-record-drawer-title span:not(.material-symbols-outlined),
.rv2-record-drawer-meta,
.rv2-drawer-comment,
.rv2-drawer-empty p {
  color: var(--tp-gray-600);
}

.rv2-sidebar-title,
.rv2-progress-copy strong,
.rv2-panel-btn:hover,
.rv2-nav-btn:hover:not(:disabled),
.rv2-sidebar-header .material-symbols-outlined,
.rv2-sidebar-filter:hover,
.rv2-sidebar-filter.active,
.rv2-finding-field:hover,
.rv2-finding-field:focus-visible,
.rv2-attach-inline-btn:hover,
.rv2-attach-drop:hover,
.rv2-attach-action:hover,
.rv2-attach-action:focus-visible,
.rv2-audit-more:hover,
.rv2-audit-more:focus-visible,
.rv2-link-btn,
.rv2-record-drawer-title > .material-symbols-outlined {
  color: var(--tp-primary);
}

.rv2-panel-btn,
.rv2-nav-btn,
.rv2-finding-btn,
.rv2-attach-inline-btn,
.rv2-attach-drop,
.rv2-audit-more {
  background: var(--tp-surface-card);
  border-color: var(--tp-border-subtle);
  color: var(--tp-gray-600);
}

.rv2-panel-btn:hover,
.rv2-nav-btn:hover:not(:disabled),
.rv2-finding-btn:hover,
.rv2-attach-inline-btn:hover,
.rv2-attach-drop:hover,
.rv2-audit-more:hover,
.rv2-record-drawer-close:hover,
.rv2-record-drawer-close:focus-visible {
  background: var(--tp-surface-hover);
  border-color: var(--tp-border-strong);
  transform: none;
}

.rv2-panel-btn-primary,
.rv2-sidebar-filter.active,
.rv2-case-row.active,
.rv2-decision-option.active,
.rv2-finding-field:hover,
.rv2-finding-field:focus-visible {
  background: var(--tp-accent-primary-soft);
  border-color: var(--tp-accent-primary-border);
  color: var(--tp-primary);
}

.rv2-panel-btn-primary {
  background: var(--tp-btn-bg);
  border-color: var(--tp-btn-border);
  color: var(--tp-btn-text);
  box-shadow: var(--tp-btn-shadow);
}

.rv2-panel-btn-primary:hover:not(:disabled) {
  background: var(--tp-btn-bg-hover);
  border-color: var(--tp-btn-border);
  color: var(--tp-btn-text);
  box-shadow: var(--tp-btn-shadow-hover);
}

.rv2-case-row:hover,
.rv2-gate-card:hover,
.rv2-attach-card:hover,
.rv2-attach-card:focus-within,
.rv2-step-row:hover,
.rv2-drawer-item:hover .rv2-drawer-card {
  background: var(--tp-surface-hover);
  border-color: var(--tp-border-strong);
}

.rv2-progress-track,
.rv2-step-table th,
.rv2-record-drawer-header,
.rv2-sidebar-header {
  background: var(--tp-surface-header);
  border-color: var(--tp-border-subtle);
}

.rv2-step-table td,
.rv2-step-row,
.rv2-steps-sec,
.rv2-case-row,
.rv2-summary::after,
.rv2-audit-list::before,
.rv2-drawer-list::before {
  border-color: var(--tp-border-subtle);
}

.rv2-step-table tr:hover td {
  background: var(--tp-surface-row-hover);
}

.rv2-finding-msg,
.rv2-finding.kind-static .rv2-finding-msg {
  color: var(--tp-gray-800);
}

.rv2-finding-note {
  background: var(--tp-surface-muted);
  border-left-color: var(--tp-primary);
  color: var(--tp-gray-600);
}

.rv2-value-tag,
.rv2-case-status,
.rv2-case-ai,
.rv2-gate-status.st-idle,
.rv2-drawer-result.pending {
  background: var(--tp-surface-muted);
  border-color: var(--tp-border-subtle);
  color: var(--tp-gray-600);
}

.rv2-level-tag,
.rv2-tc-badge,
.rv2-case-ai.running,
.rv2-finding-sev.sev-minor,
.rv2-finding-status.st-disputed {
  background: var(--tp-accent-info-soft);
  border-color: var(--tp-accent-info-border);
  color: var(--tp-accent-info);
}

.rv2-gate-status.st-pass,
.rv2-gate-empty-state,
.rv2-gate-normal-strip,
.rv2-case-status.approved,
.rv2-case-ai.passed,
.rv2-finding-status.st-resolved,
.rv2-finding-btn-ok,
.rv2-drawer-result.approved,
.rv2-tl-approved .rv2-audit-summary-icon,
.rv2-tl-approved .rv2-audit-node,
.rv2-tl-approved .rv2-drawer-node {
  background: var(--tp-accent-success-soft);
  border-color: var(--tp-accent-success-border);
  color: var(--tp-accent-success);
}

.rv2-gate-status.st-warn,
.rv2-priority-tag.is-medium,
.rv2-case-status.needs-update,
.rv2-case-ai.failed,
.rv2-finding-sev.sev-major,
.rv2-finding-status.st-open,
.rv2-btn-submit.decision-needs_update,
.rv2-drawer-result.needs-update,
.rv2-tl-needs-update .rv2-audit-summary-icon,
.rv2-tl-needs-update .rv2-audit-node,
.rv2-tl-needs-update .rv2-drawer-node {
  background: var(--tp-accent-warning-soft);
  border-color: var(--tp-accent-warning-border);
  color: var(--tp-accent-warning);
}

.rv2-gate-status.st-fail,
.rv2-priority-tag.is-critical,
.rv2-priority-tag.is-high,
.rv2-case-status.rejected,
.rv2-finding-sev.sev-critical,
.rv2-btn-submit.decision-rejected,
.rv2-drawer-result.rejected,
.rv2-tl-rejected .rv2-audit-summary-icon,
.rv2-tl-rejected .rv2-audit-node,
.rv2-tl-rejected .rv2-drawer-node {
  background: var(--tp-accent-danger-soft);
  border-color: var(--tp-accent-danger-border);
  color: var(--tp-accent-danger);
}

.rv2-btn-submit {
  background: var(--tp-btn-bg);
  color: var(--tp-btn-text);
  box-shadow: var(--tp-btn-shadow);
}

.rv2-link-btn:hover {
  filter: none;
  transform: none;
  box-shadow: none;
}

.rv2-btn-submit:hover:not(:disabled) {
  background: var(--tp-btn-bg-hover);
  filter: none;
  transform: none;
  box-shadow: var(--tp-btn-shadow-hover);
}

.rv2-decision-input:focus {
  border-color: var(--tp-primary);
  box-shadow: 0 0 0 3px var(--tp-accent-primary-soft);
}

.rv2-attach-preview,
.rv2-image-preview-body,
:deep(.rv2-image-preview-dialog .el-dialog),
:deep(.rv2-record-drawer),
:deep(.rv2-record-drawer .el-drawer__body),
.rv2-record-drawer-shell {
  background: var(--tp-surface-card);
  color: var(--tp-gray-900);
}

.rv2-record-drawer-shell {
  background-image:
    radial-gradient(circle at 18% 0%, var(--tp-ambient-primary), transparent 32%),
    radial-gradient(circle at 92% 14%, var(--tp-ambient-info), transparent 26%);
}

.rv2-record-drawer-header {
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(14px);
}

.rv2-audit-node,
.rv2-drawer-node,
.rv2-audit-avatar {
  background: var(--tp-surface-card);
  border-color: var(--tp-border-subtle);
  color: var(--tp-gray-500);
}

.rv2-audit-card,
.rv2-drawer-card {
  background: var(--tp-surface-card);
}

.rv2-drawer-result {
  border-color: currentColor;
}

.rv2-panel-btn,
.rv2-nav-btn,
.rv2-finding-btn,
.rv2-attach-action,
.rv2-attach-inline-btn {
  background: var(--tp-surface-input);
  border-color: var(--rv2-border-soft);
  color: var(--rv2-fg-muted);
}

.rv2-case-row.active {
  box-shadow: inset 0 0 0 1px var(--tp-accent-primary-border);
}

.rv2-gate-card,
.rv2-basic-card,
.rv2-condition-box,
.rv2-step-table,
.rv2-decision-panel,
.rv2-audit-latest,
.rv2-attachments {
  box-shadow: var(--tp-shadow-sm);
}

.rv2-step-table th {
  background: var(--tp-surface-header);
  color: var(--tp-gray-500);
}

.rv2-step-table tr:hover td,
.rv2-case-row:hover,
.rv2-drawer-item:hover .rv2-drawer-card {
  background: var(--tp-surface-row-hover);
}

.rv2-finding-suggestion {
  background: var(--tp-surface-muted);
  border: 1px solid var(--tp-accent-primary-border);
}

.rv2-summary-title,
.rv2-panel-title,
.rv2-sidebar-title,
.rv2-record-drawer-title strong {
  font-weight: var(--tp-font-bold);
  letter-spacing: 0;
}

.rv2-summary-desc,
.rv2-gate-card-desc,
.rv2-decision-input,
.rv2-drawer-comment {
  font-weight: var(--tp-font-regular);
  line-height: var(--tp-line-body);
}

.rv2-step-table th,
.rv2-value-tag,
.rv2-level-tag,
.rv2-tc-badge,
.rv2-case-status,
.rv2-case-ai,
.rv2-gate-status,
.rv2-priority-tag,
.rv2-drawer-result {
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-tight);
  text-transform: none;
  letter-spacing: 0;
}

.rv2-step-table td,
.rv2-case-name,
.rv2-step-text,
.rv2-finding-msg,
.rv2-audit-reviewer-line {
  font-size: var(--tp-text-sm);
  line-height: var(--tp-line-ui);
}

.rv2-audit-time,
.rv2-drawer-time,
.rv2-case-idx,
.rv2-sidebar-counter,
.rv2-nav-pos {
  font-size: var(--tp-text-xs);
  color: var(--tp-text-muted);
  opacity: 1;
}

.rv2 {
  min-height: calc(100vh - 56px - 16px);
}

.rv2-main {
  gap: 4px;
  padding: 8px;
}

.rv2-summary {
  gap: 8px !important;
  margin-bottom: 0 !important;
  padding: 8px 10px !important;
  border-radius: 12px;
  box-shadow: var(--tp-shadow-sm);
}

.rv2-summary-title-row {
  gap: 7px;
  margin-bottom: 5px;
}

/* ── 返回列表按钮主题适配 ── */
.rv2-back-btn {
  color: var(--tp-text-secondary);
}
.rv2-back-btn:hover,
.rv2-back-btn:focus-visible {
  background: var(--tp-surface-hover);
  color: var(--tp-primary);
}

.rv2-summary-title {
  font-size: 16px;
  line-height: var(--tp-line-tight);
}

.rv2-summary-desc {
  max-width: 560px;
  font-size: 12px;
  line-height: var(--tp-line-ui);
}

.rv2-tc-badge {
  min-height: 20px;
  padding: 2px 8px;
  border-radius: 999px;
}

.rv2-summary-r {
  gap: 9px;
}

.rv2-progress-compact {
  min-width: 190px;
  gap: 5px;
}

.rv2-progress-copy {
  gap: 10px;
}

.rv2-progress-track {
  height: 4px;
}

.rv2-nav-btns {
  gap: 6px;
}

.rv2-nav-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
}

.rv2-body {
  gap: 8px;
}

@media (min-width: 1100px) {
  .rv2-sidebar {
    height: calc(100vh - 56px - 48px);
    max-height: calc(100vh - 56px - 48px);
    top: 12px;
  }
}

.rv2-sidebar,
.rv2-panel,
.rv2-gate-card,
.rv2-basic-card,
.rv2-condition-box,
.rv2-step-table,
.rv2-decision-panel,
.rv2-audit-latest,
.rv2-attachments {
  border-radius: 12px;
  box-shadow: var(--tp-shadow-sm);
}

.rv2-sidebar-header {
  gap: 7px;
  padding: 8px 10px;
}

.rv2-sidebar-stats {
  gap: 5px;
}

.rv2-sidebar-filter {
  min-height: 24px;
  padding: 4px 6px;
  border-radius: 7px;
  font-size: 10px;
}

.rv2-case-row {
  min-height: 48px;
  gap: 8px;
  padding: 8px 10px;
}

.rv2-case-idx {
  width: 20px;
  padding-top: 1px;
}

.rv2-case-main {
  gap: 5px;
}

.rv2-case-name {
  font-size: 12px;
  line-height: var(--tp-line-ui);
}

.rv2-case-meta {
  gap: 4px;
}

.rv2-case-status,
.rv2-case-ai,
.rv2-gate-status,
.rv2-value-tag,
.rv2-level-tag,
.rv2-priority-tag,
.rv2-finding-sev,
.rv2-finding-field,
.rv2-finding-status,
.rv2-drawer-result {
  min-height: 20px;
  padding: 2px 7px;
  border-radius: 999px;
}

.rv2-panel {
  padding: 12px;
}

.rv2-grid,
.rv2-left,
.rv2-right {
  gap: 8px;
}

.rv2-panel-title {
  gap: 6px;
  margin-bottom: 10px;
  font-size: 12px;
  line-height: var(--tp-line-ui);
}

.rv2-panel-title .material-symbols-outlined {
  font-size: 16px;
}

.rv2-panel-actions {
  gap: 6px;
}

.rv2-panel-btn,
.rv2-attach-inline-btn {
  min-height: 30px;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 12px;
}

.rv2-panel-btn .material-symbols-outlined,
.rv2-attach-inline-btn .material-symbols-outlined {
  font-size: 15px;
}

.rv2-gate-grid {
  gap: 8px;
}

.rv2-gate-card {
  padding: 10px;
}

.rv2-gate-head {
  margin-bottom: 6px;
}

.rv2-gate-icon {
  font-size: 18px;
}

.rv2-gate-card-title {
  font-size: 13px;
  line-height: var(--tp-line-ui);
}

.rv2-gate-card-desc {
  font-size: 11px;
  line-height: var(--tp-line-ui);
}

.rv2-findings {
  gap: 6px;
  margin-top: 8px;
}

.rv2-finding {
  gap: 5px;
  padding: 8px 9px;
  border-radius: 8px;
}

.rv2-finding-msg {
  font-size: 12px;
  line-height: var(--tp-line-ui);
}

.rv2-finding-note {
  padding: 5px 7px;
  font-size: 10px;
}

.rv2-finding-actions {
  gap: 5px;
}

.rv2-finding-btn {
  padding: 3px 7px;
  border-radius: 7px;
}

.rv2-case-fields {
  gap: 10px;
  padding: 12px;
}

.rv2-case-fields-head {
  gap: 10px;
}

.rv2-basic-fields {
  gap: 8px;
}

.rv2-basic-field {
  padding: 9px;
  border-radius: 10px;
}

.rv2-field-head {
  margin-bottom: 5px;
}

.rv2-basic-field p {
  font-size: 12px;
  line-height: var(--tp-line-body);
}

.rv2-panel-compact {
  padding: 10px 12px;
}

.rv2-attach-grid {
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

.rv2-attach-drop {
  height: 88px;
  gap: 6px;
  padding: 12px;
  border-radius: 10px;
}

.rv2-attach-card {
  min-height: 86px;
  gap: 9px;
  padding: 9px 36px 9px 9px;
  border-radius: 10px;
}

.rv2-attach-card.has-preview {
  min-height: 96px;
}

.rv2-attach-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
}

.rv2-attach-preview {
  width: 88px;
  min-height: 78px;
  border-radius: 8px;
}

.rv2-attach-name {
  font-size: 12px;
}

.rv2-attach-action {
  width: 24px;
  height: 24px;
}

.rv2-decision {
  gap: 10px;
}

.rv2-decision-options {
  gap: 6px;
}

.rv2-decision-option {
  min-height: 48px;
  gap: 9px;
  padding: 9px;
  border-radius: 10px;
}

.rv2-decision-option .material-symbols-outlined {
  width: 24px;
  height: 24px;
  font-size: 16px;
}

.rv2-decision-option strong {
  font-size: 12px;
}

.rv2-decision-option small {
  font-size: 10px;
  line-height: var(--tp-line-ui);
}

.rv2-decision-input {
  min-height: 78px;
  padding: 9px 10px;
  border-radius: 10px;
  font-size: 12px;
  line-height: var(--tp-line-body);
}

.rv2-btn {
  min-height: 32px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
}

.rv2-btn .material-symbols-outlined {
  font-size: 16px;
}

.rv2 {
  background: var(--tp-surface-base);
  background-image: none;
}

.rv2-summary,
.rv2-record-drawer-shell {
  background-image: none;
}

.rv2-record-drawer-header {
  background: var(--tp-surface-card);
  backdrop-filter: none;
}

.rv2-gate-blob {
  display: none;
  filter: none;
}

.rv2-gate-card:hover .rv2-gate-blob {
  background: transparent;
}

.rv2-attach-actions,
.rv2-attach-card:hover .rv2-attach-actions,
.rv2-attach-card:focus-within .rv2-attach-actions,
.rv2-attach-action:hover,
.rv2-attach-action:focus-visible,
.rv2-decision-option:hover,
.rv2-btn-submit:hover:not(:disabled) {
  transform: none;
}

.rv2-decision-option {
  background: var(--tp-surface-input);
  border-color: var(--tp-border-subtle);
}

.rv2-decision-option:hover {
  background: var(--tp-surface-hover);
  border-color: var(--tp-border-strong);
}

.rv2-btn-submit,
.rv2-btn-submit:hover:not(:disabled) {
  box-shadow: var(--tp-btn-shadow);
}

.rv2-panel,
.rv2-sidebar,
.rv2-summary,
.rv2-gate-card,
.rv2-basic-card,
.rv2-condition-box,
.rv2-step-table,
.rv2-audit-latest,
.rv2-attachments,
.rv2-record-drawer-shell {
  box-shadow: var(--tp-shadow-sm);
}

/* 详情页收缩左侧栏，仅显示序号和状态徽章，极简排版并为右侧主体内容释放更多空间 */
@media (min-width: 1180px) {
  .rv2-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .rv2-right {
    position: static;
    align-self: start;
    height: auto;
    max-height: none;
  }

  .rv2-audit {
    flex: 0 0 auto;
    min-height: 0;
  }
}

@media (min-width: 1440px) {
  .rv2-grid {
    grid-template-columns: minmax(0, 1fr) minmax(300px, 20vw);
  }

  .rv2-right {
    position: sticky;
    top: 88px;
  }
}

.rv2-case-row {
  min-height: 38px;
  padding: 8px var(--tp-space-3);
  display: flex;
  align-items: center;
}

.rv2-case-meta {
  margin-left: auto; /* 徽章右对齐 */
  display: flex;
  align-items: center;
  gap: 4px;
}

.rv2-sidebar-list {
  padding: var(--tp-space-2) 0; /* 在顶部和底部留出少许内边距，使列表不贴边 */
}

.rv2-gate-empty-state {
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--tp-accent-success-soft);
  border-color: var(--tp-accent-success-border);
}

.rv2-gate-empty-state.is-idle {
  background: var(--tp-accent-info-soft);
  border-color: var(--tp-accent-info-border);
}

.rv2-gate-empty-state.is-timeout {
  background: var(--tp-accent-danger-soft);
  border-color: var(--tp-accent-danger-border);
}

.rv2-gate-empty-state > .material-symbols-outlined {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 14%, transparent);
  font-size: 16px;
}

.rv2-gate-empty-state.is-idle > .material-symbols-outlined {
  color: var(--tp-accent-info);
}

.rv2-gate-empty-state.is-timeout > .material-symbols-outlined {
  color: var(--tp-accent-danger);
}

.rv2-gate-empty-state > div {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.rv2-gate-empty-state strong {
  margin: 0;
  font-size: 12px;
}

.rv2-gate-empty-state p {
  margin: 0;
  font-size: 11px;
  line-height: var(--tp-line-ui);
}

.rv2-audit-empty {
  min-height: 96px;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  column-gap: 10px;
  row-gap: 2px;
  padding: 14px;
  text-align: left;
}

.rv2-audit-empty .material-symbols-outlined {
  grid-row: 1 / span 2;
  width: 30px;
  height: 30px;
  font-size: 17px;
}

.rv2-audit-empty span:not(.material-symbols-outlined) {
  max-width: none;
}

/* 详情页二次收敛：把检查结果与基础信息降为轻量信息条，减少卡片套卡片。 */
.rv2-panel {
  background: var(--tp-surface-card);
  border-color: var(--tp-border-subtle);
  box-shadow: none;
}

.rv2-panel:hover {
  border-color: var(--tp-border-strong);
  box-shadow: none;
}

.rv2 .rv2-panel,
.rv2 .rv2-gate-card,
.rv2 .rv2-cond-col,
.rv2 .rv2-step-table-wrap {
  box-shadow: none !important;
}

.rv2 .rv2-panel {
  background: var(--tp-surface-card) !important;
}

.rv2 .rv2-gate-card {
  background: var(--tp-surface-input) !important;
}

.rv2 .rv2-gate-card:hover {
  background: var(--tp-surface-hover) !important;
}

.rv2-panel-title {
  min-height: 28px;
  margin-bottom: var(--tp-space-3);
}

.rv2-gate-panel {
  padding: var(--tp-space-3) var(--tp-space-4) var(--tp-space-4);
}

.rv2-gate-panel .rv2-panel-title {
  margin-bottom: var(--tp-space-2);
}

.rv2-gate-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
  gap: var(--tp-space-2);
}

.rv2-gate-card {
  min-height: 0;
  padding: var(--tp-space-3) var(--tp-space-3) var(--tp-space-3) var(--tp-space-4);
  background: var(--tp-surface-input);
  border-color: var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  box-shadow: none;
}

.rv2-gate-card:hover {
  background: var(--tp-surface-hover);
}

.rv2-gate-stripe {
  width: 2px;
  opacity: 0.78;
}

.rv2-gate-blob {
  display: none;
}

.rv2-gate-head {
  align-items: center;
  margin-bottom: var(--tp-space-2);
}

.rv2-gate-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-color) 14%, transparent);
  font-size: 16px;
}

.rv2-gate-status {
  border: 1px solid currentColor;
  border-radius: 999px;
}

.rv2-gate-card-title {
  margin-bottom: 2px;
  font-size: var(--tp-text-sm);
  font-weight: var(--tp-font-semibold);
}

.rv2-gate-card-desc {
  line-height: var(--tp-line-body);
}

.rv2-gate-card .rv2-findings {
  margin-top: var(--tp-space-2);
  gap: 6px;
}

.rv2-gate-card .rv2-finding {
  padding: 10px 12px 10px 20px; /* 增加左侧内边距，留给悬浮的 severity 条 */
  background: var(--tp-surface-card);
  border-color: var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  box-shadow: var(--tp-shadow-sm);
  gap: 5px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.rv2-gate-card .rv2-finding:hover {
  transform: translateX(3px); /* 悬浮时向右微移，增强交互感 */
  border-color: color-mix(in srgb, var(--tp-primary) 35%, var(--tp-border-subtle));
  box-shadow: var(--tp-shadow-md);
  background: var(--tp-surface-hover);
}

.rv2-finding-main {
  display: flex;
  align-items: center; /* 垂直居中对齐，使标签和文字更加整齐 */
  gap: var(--tp-space-2);
  width: 100%;
  min-height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--tp-radius-sm);
  background: transparent;
  color: var(--tp-text-primary);
  font-family: inherit;
  font-size: var(--tp-text-sm);
  line-height: var(--tp-line-body);
  text-align: left;
  cursor: pointer;
  transition:
    color 0.16s ease,
    box-shadow 0.16s ease;
}

.rv2-finding-main:hover {
  color: var(--tp-primary);
}

.rv2-finding-main:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tp-primary) 28%, transparent);
}

.rv2-finding-field-name {
  flex: 0 0 auto;
  max-width: 96px;
  padding: 3px 8px; /* 增加内边距，呈现更圆润丰满的胶囊效果 */
  border-radius: var(--tp-radius-sm);
  background: color-mix(in srgb, var(--tp-primary) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--tp-primary) 15%, transparent); /* 细边框提升精致感 */
  color: var(--tp-primary); /* 使用品牌主色增强一致性 */
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-semibold);
  line-height: var(--tp-line-ui);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rv2-finding-text {
  flex: 1;
  min-width: 0;
  color: var(--tp-text-primary);
  font-weight: var(--tp-font-medium);
  word-break: break-word;
  transition: color 0.16s ease; /* 微交互过渡效果 */
}

.rv2-finding-main:hover .rv2-finding-text {
  color: var(--tp-primary); /* 悬浮时文本颜色同步过渡 */
}

.rv2-finding-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  color: var(--tp-text-muted);
  font-size: var(--tp-text-xs);
  line-height: 1.45;
}

.rv2-finding-status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--tp-surface-input);
  color: var(--tp-text-muted);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-medium);
}

.rv2-finding-note {
  margin-top: 2px;
  padding: 4px var(--tp-space-2);
  font-family: inherit;
  background: var(--tp-surface-input);
  border-left-color: var(--tp-primary);
}

.rv2-finding-actions {
  margin-top: 2px;
  gap: var(--tp-space-3);
}

.rv2-finding-btn,
.rv2-finding-btn-ok {
  min-height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--tp-text-muted);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-medium);
}

.rv2-finding-btn:hover,
.rv2-finding-btn-ok:hover {
  color: var(--tp-primary);
  background: transparent;
  border-color: transparent;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.rv2-finding-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tp-primary) 28%, transparent);
}

.rv2-gate-normal-strip {
  margin-top: var(--tp-space-2);
  padding: 4px var(--tp-space-2);
  border-radius: 999px;
  background: var(--tp-surface-input);
  border-color: var(--tp-border-subtle);
  color: var(--tp-text-muted);
}

.rv2-case-fields {
  padding: var(--tp-space-4);
  gap: var(--tp-space-3);
}

.rv2-basic-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--tp-space-2) var(--tp-space-3);
  padding: 0 0 var(--tp-space-3) 0; /* 移除灰底边框，采用极简无背景底线布局，减少视觉嵌套感 */
  border: none;
  background: transparent;
}

.rv2-basic-field {
  display: inline-flex;
  align-items: center;
  gap: var(--tp-space-2);
  min-width: 0;
  min-height: 30px;
  padding: 0 var(--tp-space-3) 0 0;
  background: transparent;
  border: 0;
  border-right: 1px solid var(--tp-border-subtle);
  border-radius: 0;
}

.rv2-basic-field:last-child {
  padding-right: 0;
  border-right: 0;
}

.rv2-basic-module {
  flex: 1 1 260px;
}

.rv2-basic-field.has-issue {
  padding-left: var(--tp-space-2);
  background: var(--tp-accent-warning-soft);
  border: 1px solid var(--tp-accent-warning-border);
  border-radius: 999px;
}

.rv2-field-head {
  flex-shrink: 0;
  gap: 5px;
  margin: 0;
  color: var(--tp-text-muted);
}

.rv2-field-head .material-symbols-outlined {
  color: var(--tp-text-subtle);
  font-size: 14px;
}

.rv2-field-head strong {
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-semibold);
  white-space: nowrap;
}

.rv2-field-value {
  min-height: 0;
}

.rv2-value-tag {
  min-height: 22px;
  padding: 2px var(--tp-space-2);
  background: var(--tp-surface-card);
  font-size: var(--tp-text-xs);
}

.rv2-module-path {
  min-height: 0;
}

/* 前后置条件区域等高对齐及卡片质感美化 */
.rv2-conditions {
  align-items: stretch !important; /* 强制网格内卡片等高对齐 */
}

.rv2-cond-col {
  display: flex;
  flex-direction: column;
  padding: var(--tp-space-3);
  background: var(--tp-surface-card); /* 采用纯白卡片底色，比原本的灰色输入底色更显通透干净 */
  border-color: var(--tp-border-subtle);
}

.rv2-cond-title {
  margin-bottom: var(--tp-space-2);
}

.rv2-cond-list {
  flex: 1; /* 占据可用高度，利于内容对齐 */
}

.rv2-cond-item {
  padding: 7px var(--tp-space-2);
  background: var(--tp-surface-input); /* 列表项采用微灰背景底色形成对比 */
  border-color: var(--tp-border-subtle);
}

.rv2-steps-sec {
  padding-top: var(--tp-space-3);
}

/* 步骤表格容器与表头卡片化美化 */
.rv2-step-table-wrap {
  background: var(--tp-surface-card); /* 用例步骤表格同样改用卡片白底色 */
  border-color: var(--tp-border-subtle);
}

.rv2-step-table th {
  padding: 10px var(--tp-space-4);
  background: var(--tp-surface-input); /* 表头使用偏亮灰色背景，更现代美观 */
  font-weight: var(--tp-font-semibold);
  color: var(--tp-text-secondary);
}

.rv2-step-table td {
  padding: 10px var(--tp-space-4);
}

.rv2-step-col-num {
  width: 80px;
}

.rv2,
:global(.rv2-record-drawer) {
  --rv2-audit-surface: var(--tp-surface-card);
  --rv2-audit-surface-card: color-mix(
    in srgb,
    var(--tp-surface-muted) 78%,
    var(--tp-surface-card) 22%
  );
  --rv2-audit-surface-strong: var(--tp-surface-card);
  --rv2-audit-surface-muted: color-mix(
    in srgb,
    var(--tp-surface-input) 88%,
    var(--tp-surface-card) 12%
  );
  --rv2-audit-line: color-mix(in srgb, var(--tp-border-subtle) 92%, transparent);
  --rv2-audit-shadow: none;
}

:global(html[data-theme='genart'] .rv2),
:global(html[data-theme='genart'] .rv2-record-drawer) {
  --rv2-audit-surface: color-mix(in srgb, var(--tp-surface-base) 97%, var(--tp-text-primary) 3%);
  --rv2-audit-surface-card: color-mix(
    in srgb,
    var(--tp-surface-base) 93%,
    var(--tp-text-primary) 7%
  );
  --rv2-audit-surface-strong: color-mix(
    in srgb,
    var(--tp-surface-base) 90%,
    var(--tp-text-primary) 10%
  );
  --rv2-audit-surface-muted: color-mix(
    in srgb,
    var(--tp-surface-base) 91%,
    var(--tp-text-primary) 9%
  );
  --rv2-audit-line: color-mix(in srgb, var(--tp-border-subtle) 76%, transparent);
  --rv2-audit-shadow: none;
}

.rv2-audit-summary,
.rv2-audit-card,
.rv2-audit-empty,
.rv2-audit-more,
.rv2-record-drawer-meta,
.rv2-drawer-empty,
.rv2-drawer-card {
  background: var(--rv2-audit-surface-card) !important;
  border-color: var(--rv2-audit-line) !important;
  color: var(--tp-text-primary);
}

.rv2-audit-summary {
  background: color-mix(in srgb, var(--rv2-audit-surface-card) 72%, transparent) !important;
}

.rv2-audit-empty,
.rv2-drawer-empty {
  border-style: solid !important;
  background: var(--rv2-audit-surface-muted) !important;
  box-shadow: none !important;
}

.rv2-audit-empty {
  min-height: 82px;
  padding: 14px 12px;
}

.rv2-drawer-empty {
  min-height: 180px;
}

.rv2-audit-empty .material-symbols-outlined,
.rv2-drawer-empty .material-symbols-outlined {
  background: var(--rv2-audit-surface-strong) !important;
  border: 1px solid var(--rv2-audit-line);
  color: var(--tp-text-muted) !important;
}

.rv2-audit-node,
.rv2-drawer-node,
.rv2-audit-avatar {
  background: var(--rv2-audit-surface-strong);
  border-color: var(--tp-border-subtle);
}

.rv2-audit-list::before,
.rv2-drawer-list::before {
  background: var(--rv2-audit-line);
}

.rv2-audit-time,
.rv2-drawer-time,
.rv2-record-drawer-meta,
.rv2-audit-empty span:not(.material-symbols-outlined),
.rv2-drawer-empty p,
.rv2-record-drawer-title span:not(.material-symbols-outlined) {
  color: var(--tp-text-muted) !important;
  opacity: 1;
}

.rv2-audit-reviewer-line,
.rv2-record-drawer-title strong,
.rv2-drawer-empty strong,
.rv2-audit-empty strong,
.rv2-audit-summary-main strong {
  color: var(--tp-text-primary) !important;
}

.rv2-tl-desc,
.rv2-drawer-comment {
  color: var(--tp-text-secondary) !important;
  opacity: 1;
}

.rv2-audit-summary,
.rv2-audit-card,
.rv2-audit-empty,
.rv2-audit-more,
.rv2-record-drawer-meta,
.rv2-drawer-empty,
.rv2-drawer-card {
  box-shadow: var(--rv2-audit-shadow) !important;
}

.rv2-record-drawer-meta {
  gap: 12px;
  margin: 0 -18px 14px;
  padding: 10px 18px;
  border: 0 !important;
  border-bottom: 1px solid var(--rv2-audit-line) !important;
  border-radius: 0;
  background: var(--rv2-audit-surface-muted) !important;
  box-shadow: none !important;
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-semibold);
  line-height: var(--tp-line-ui);
}

.rv2-drawer-comment {
  padding: 0;
  border: 0;
  background: transparent !important;
  color: var(--tp-text-muted) !important;
}

:global(.rv2-record-drawer) {
  background: var(--rv2-audit-surface) !important;
  border-left: 1px solid var(--tp-border-subtle);
  color: var(--tp-text-primary) !important;
}

:global(.rv2-record-drawer .el-drawer__body),
.rv2-record-drawer-shell {
  background: var(--rv2-audit-surface) !important;
  color: var(--tp-text-primary) !important;
}

.rv2-record-drawer-shell {
  padding: 0 18px 24px !important;
  background-image: none !important;
  box-shadow: none !important;
}

.rv2-record-drawer-header {
  margin: 0 -18px;
  padding: 18px;
  background: var(--rv2-audit-surface) !important;
  border-bottom: 1px solid var(--rv2-audit-line) !important;
  box-shadow: none !important;
}

.rv2-record-drawer-title {
  align-items: center;
}

.rv2-record-drawer-title > .material-symbols-outlined {
  width: 32px;
  min-width: 32px;
  height: 32px;
  flex: 0 0 32px;
  margin-top: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--rv2-audit-line);
  border-radius: 999px;
  background: var(--tp-accent-primary-soft);
  color: var(--tp-primary);
  font-size: 18px;
}

.rv2-record-drawer-title div {
  gap: 3px;
}

.rv2-record-drawer-title strong {
  font-size: var(--tp-text-md);
  line-height: var(--tp-line-ui);
}

.rv2-record-drawer-close {
  width: 34px;
  height: 34px;
  background: color-mix(in srgb, var(--tp-text-primary) 7%, transparent);
  border-color: var(--rv2-audit-line);
  color: var(--tp-text-secondary);
}

.rv2-record-drawer-close:hover,
.rv2-record-drawer-close:focus-visible {
  background: var(--tp-surface-hover);
  border-color: var(--tp-border-strong);
  color: var(--tp-text-primary);
}

@media (max-width: 720px) {
  .rv2-basic-fields {
    align-items: stretch;
  }

  .rv2-basic-field,
  .rv2-basic-field:last-child {
    width: 100%;
    padding-right: 0;
    border-right: 0;
  }

  .rv2-audit-empty {
    grid-template-columns: 1fr;
    justify-items: center;
    text-align: center;
  }

  .rv2-audit-empty .material-symbols-outlined {
    grid-row: auto;
  }
}
/* 设计稿 V2 样式结束。旧 .rd-* 类已全部迁移为 .rv2-*。 */
</style>
