<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
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
import { extractErrorMessage, isElMessageBoxCancel } from '@/utils/error'

const route = useRoute()
const projectStore = useProjectStore()

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

type SidebarFilter = 'all' | 'pending' | 'ai_failed'
type ReviewDecision = 'approved' | 'rejected' | 'needs_update'

const sidebarFilter = ref<SidebarFilter>('all')
const reviewDecision = ref<ReviewDecision | null>(null)
const reviewComment = ref('')

const isActive = computed(
  () => review.value?.status === 'in_progress' || review.value?.status === 'not_started',
)

// 用户列表
const allUsers = ref<{ id: number; name: string }[]>([])
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

// ── v0.2 单条 AI 评审（计划级批量已移到列表页） ──
const aiReviewRunning = ref(false)

/** 点击"AI 评审本条"按钮：对当前评审项跑规则引擎；
 *  计划级批量 AI 评审入口已挪到列表页每行操作区，避免详情页误伤他人正在处理的条目。 */
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
      ElMessage.success('AI 评审本条通过')
    } else {
      const parts: string[] = []
      if (report.critical_count) parts.push(`${report.critical_count} 项严重`)
      if (report.major_count) parts.push(`${report.major_count} 项主要`)
      if (report.minor_count) parts.push(`${report.minor_count} 项提示`)
      ElMessage.warning(`AI 评审未通过：${parts.join(' · ')}`)
    }
  } catch (e) {
    ElMessage.error(extractErrorMessage(e, 'AI 评审失败'))
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
  } catch {
    /* ignore */
  } finally {
    loading.value = false
  }
}

async function fetchUsers() {
  try {
    const { data } = await apiClient.get<{ items: { id: number; name: string }[] }>('/users', {
      params: { page: 1, pageSize: 200 },
    })
    allUsers.value = data.items || []
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
    needs_update: '需修改',
  }
  return map[result] || result
}
function aiGateClass(status?: string) {
  if (status === 'passed' || status === 'bypassed') return 'passed'
  if (status === 'failed' || status === 'timeout') return 'failed'
  if (status === 'running') return 'running'
  return 'idle'
}
function aiGateLabel(status?: string) {
  const map: Record<string, string> = {
    not_started: 'AI 未运行',
    running: 'AI 运行中',
    passed: 'AI 通过',
    failed: 'AI 未过',
    timeout: 'AI 超时',
    bypassed: 'AI 放行',
  }
  return map[status || 'not_started'] || 'AI 未运行'
}
function formatDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
}

const sidebarPendingCount = computed(
  () => items.value.filter((item) => resultClass(item.final_result) === 'pending').length,
)
const sidebarAIFailedCount = computed(
  () => items.value.filter((item) => aiGateClass(item.ai_gate_status) === 'failed').length,
)
const sidebarCaseRows = computed(() =>
  items.value
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      if (sidebarFilter.value === 'pending') return resultClass(item.final_result) === 'pending'
      if (sidebarFilter.value === 'ai_failed') return aiGateClass(item.ai_gate_status) === 'failed'
      return true
    }),
)

// ── 导航 ──
function goNextItem() {
  if (currentItemIndex.value < items.value.length - 1) currentItemIndex.value++
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

/** 把 steps 字符串切成结构化行：优先按换行切，其次按 `；` 或 `;`，最后兜底整段。 */
function parseSteps(raw?: string): Array<{ no: string; action: string }> {
  const text = (raw ?? '').trim()
  if (!text) return []
  // 先按换行切；若只有一行再用中英文分号切分
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
  return parts.map((action, i) => ({
    no: String(i + 1).padStart(2, '0'),
    action,
  }))
}

const realSteps = computed(() => parseSteps(currentTestCase.value?.steps))
const realPrecondition = computed(() => currentTestCase.value?.precondition?.trim() ?? '')
const realPostcondition = computed(() => currentTestCase.value?.postcondition?.trim() ?? '')

// ── 设计稿派生数据：AI 校验网关卡、条件 checklist ──

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

/** 设计稿 3 张 AI 校验网关卡：基础信息 / 执行条件 / 执行步骤 */
type AIGateCardStatus = 'PASS' | 'WARN' | 'FAIL' | 'IDLE'
type DimensionKey = 'basic' | 'conditions' | 'steps'
type ReviewFieldKey = 'title' | 'level' | 'precondition' | 'postcondition' | 'steps' | 'case'

const AI_GATE_CARD_STATUS_LABEL: Record<AIGateCardStatus, string> = {
  PASS: '正常',
  WARN: '关注',
  FAIL: '未通过',
  IDLE: '未运行',
}

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
 * Layer 1 规则引擎产出的 7 条规则到 3 个维度的映射。
 * 规则名与后端 `reviewrule/engine.go` 的 Rule 字段严格对齐（defect.title 形如 "<规则名>：<message>"）。
 * 若后端扩展新规则尚未同步到前端，兜底到 basic，避免落入不存在的维度。
 */
const RULE_DIMENSION_MAP: Record<string, DimensionKey> = {
  标题必填: 'basic',
  标题过长: 'basic',
  前置条件必填: 'conditions',
  步骤必填: 'steps',
  步骤过于简略: 'steps',
  后置条件建议补充: 'conditions',
  等级必填: 'basic',
}

const RULE_FIELD_MAP: Record<string, ReviewFieldKey> = {
  标题必填: 'title',
  标题过长: 'title',
  前置条件必填: 'precondition',
  步骤必填: 'steps',
  步骤过于简略: 'steps',
  后置条件建议补充: 'postcondition',
  等级必填: 'level',
}

const REVIEW_FIELD_LABEL: Record<ReviewFieldKey, string> = {
  title: '标题',
  level: '等级',
  precondition: '前置条件',
  postcondition: '后置条件',
  steps: '执行步骤',
  case: '用例信息',
}

function ruleFieldKey(rule: string): ReviewFieldKey {
  return RULE_FIELD_MAP[rule] ?? 'case'
}

/**
 * 前端静态规则表：mirror 后端 `reviewrule.Evaluate`，用于在 AI 门禁**未运行**或
 * **已处理但字段仍空**的情况下，立即把用例的合规问题反馈到维度卡上，避免出现
 * "用例字段空但维度卡显示 PASS" 的误导。
 *
 * 与后端保持同步的规则：
 *   - title 必填 / 过长、precondition 必填、steps 必填 / 过短、postcondition 建议、level 必填
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

/** 接入 AI 门禁 defects（按 item 切换自动刷新） */
const {
  defects: aiDefects,
  loading: aiDefectsLoading,
  fetchDefects: fetchAIDefects,
  resolve: resolveDefect,
  dispute: disputeDefect,
  reopen: reopenDefect,
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
      // 无后端 defect，或 defect 已 resolved 但字段仍空 → 用静态展示（提示用户重新运行 AI）
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
      // 无问题：未跑过 AI 且用例合规 → IDLE；跑过通过 → PASS
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
    if (findings.length === 0) return fallback
    // 统计概述：按严重度聚合，与下方 finding 清单形成"摘要 / 详情"分层
    const c = findings.filter((f) => f.severity === 'critical').length
    const m = findings.filter((f) => f.severity === 'major').length
    const n = findings.filter((f) => f.severity === 'minor').length
    const parts: string[] = []
    if (c) parts.push(`${c} 项严重`)
    if (m) parts.push(`${m} 项主要`)
    if (n) parts.push(`${n} 项提示`)
    return parts.join(' · ')
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
const aiNormalCards = computed(() =>
  aiGateCards.value.filter((card) => !cardHasActiveFinding(card)),
)

const aiNormalSummaryText = computed(() => {
  const count = aiNormalCards.value.length
  return count > 0 ? `其余 ${count} 项正常` : ''
})

const showAIGateNormalStrip = computed(
  () =>
    aiProblemCards.value.length > 0 &&
    aiNormalCards.value.length > 0 &&
    currentItem.value?.ai_gate_status !== 'timeout',
)

const aiGateEmptyTitle = computed(() => {
  const gate = currentItem.value?.ai_gate_status
  if (gate === 'timeout') return 'AI 门禁运行超时'
  if (!gate || gate === 'not_started') return '当前字段未发现静态问题'
  return '当前无待处理问题'
})

const aiGateEmptyDesc = computed(() => {
  const gate = currentItem.value?.ai_gate_status
  if (gate === 'timeout') return '请重新运行本条 AI 评审，确认基础信息、执行条件和执行步骤。'
  if (!gate || gate === 'not_started') return 'AI 门禁尚未运行，页面仅展示当前字段的即时检查结果。'
  return '基础信息、执行条件、执行步骤均无待处理问题。'
})

const activeFindingsByField = computed<Record<ReviewFieldKey, CardFinding[]>>(() => {
  const acc: Record<ReviewFieldKey, CardFinding[]> = {
    title: [],
    level: [],
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
  title: 'case-field-title',
  level: 'case-field-level',
  precondition: 'case-field-precondition',
  postcondition: 'case-field-postcondition',
  steps: 'case-field-steps',
  case: 'case-field-title',
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
const latestRecord = computed(() => records.value[0] ?? null)

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

/** severity → 中文短文案 + 色调 class */
const SEVERITY_LABEL: Record<ReviewSeverity, string> = {
  critical: '严重',
  major: '主要',
  minor: '提示',
}

/** defect.status → 中文短文案 */
const DEFECT_STATUS_LABEL: Record<string, string> = {
  open: '待处理',
  resolved: '已处理',
  disputed: '有异议',
}

const FINDING_SHORT_MESSAGE: Record<string, string> = {
  标题必填: '未填写标题',
  标题过长: '标题超过 120 字',
  前置条件必填: '未填写前置条件',
  步骤必填: '未填写执行步骤',
  步骤过于简略: '执行步骤过短',
  后置条件建议补充: '未填写后置条件',
  等级必填: '未选择等级',
}

function findingDisplayText(finding: CardFinding) {
  return FINDING_SHORT_MESSAGE[finding.rule] || finding.title
}

/** 标记已处理：弹 prompt 输入可选备注 */
async function handleResolveDefect(d: CaseReviewDefect) {
  try {
    const { value } = await ElMessageBox.prompt('请填写处理说明（可选）', '标记为已处理', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      inputType: 'textarea',
      inputValue: '',
    })
    const ok = await resolveDefect(projectId.value, d.id, value ?? '')
    if (ok && currentItem.value) {
      await fetchAIDefects(projectId.value, reviewId.value, currentItem.value.id)
    }
  } catch {
    /* 用户取消 */
  }
}

/** 提异议：理由必填 */
async function handleDisputeDefect(d: CaseReviewDefect) {
  try {
    const { value } = await ElMessageBox.prompt('请填写异议理由', '提出异议', {
      confirmButtonText: '提交',
      cancelButtonText: '取消',
      inputType: 'textarea',
      inputValidator: (v) => (v && v.trim() ? true : '请填写异议理由'),
    })
    const ok = await disputeDefect(projectId.value, d.id, value ?? '')
    if (ok && currentItem.value) {
      await fetchAIDefects(projectId.value, reviewId.value, currentItem.value.id)
    }
  } catch {
    /* 用户取消 */
  }
}

/** Moderator 重开已处理的缺陷（Phase 1 简化：任何用户都能触发） */
async function handleReopenDefect(d: CaseReviewDefect) {
  try {
    await ElMessageBox.confirm('确定要重新开启该 Action Item 吗？', '重开', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
    })
    const ok = await reopenDefect(projectId.value, d.id)
    if (ok && currentItem.value) {
      await fetchAIDefects(projectId.value, reviewId.value, currentItem.value.id)
    }
  } catch {
    /* 用户取消 */
  }
}

/** 上一条 / 下一条切换 */
function goPrev() {
  if (currentItemIndex.value > 0) currentItemIndex.value--
}
function goNext() {
  if (currentItemIndex.value < items.value.length - 1) currentItemIndex.value++
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

/** 评审项徽章文本（用于顶部 TC-xxxx 卡片） */
const currentTestCaseTag = computed(() => {
  const id = currentItem.value?.testcase_id
  return id ? `TC-${id}` : 'TC-—'
})

const reviewedCaseCount = computed(
  () =>
    (review.value?.approved_count ?? 0) +
    (review.value?.rejected_count ?? 0) +
    (review.value?.needs_update_count ?? 0),
)

const reviewProgressPercent = computed(() => {
  const total = review.value?.case_total_count ?? 0
  if (total <= 0) return 0
  return Math.min(100, Math.round((reviewedCaseCount.value / total) * 1000) / 10)
})

const currentRoundLabel = computed(() => `R${currentItem.value?.current_round_no || 1}`)
const currentVersionLabel = computed(() => currentItem.value?.testcase_version || 'V1')
const caseTitleText = computed(
  () =>
    currentTestCase.value?.title?.trim() ||
    currentItem.value?.title_snapshot?.trim() ||
    '未填写标题',
)
const caseLevelText = computed(() => currentTestCase.value?.level?.trim() || '未选择等级')
const casePriorityText = computed(() => currentTestCase.value?.priority?.trim() || '未设置优先级')
const caseModuleText = computed(() => currentTestCase.value?.module_path?.trim() || '未关联模块')

/** 提交当前结论；存在严重/主要问题时，对"通过"增加二次确认，避免误放行。 */
async function submitCurrentDecision() {
  if (!reviewDecision.value) {
    ElMessage.warning('请先选择评审结论')
    return
  }
  if (reviewDecision.value === 'approved' && blockingFindingTotal.value > 0) {
    try {
      await ElMessageBox.confirm(
        `当前仍有 ${blockingFindingTotal.value} 项严重/主要问题未处理，确认要提交通过结论吗？`,
        '确认通过存在风险的用例',
        {
          type: 'warning',
          confirmButtonText: '仍然通过',
          cancelButtonText: '返回检查',
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

// 切换当前评审项时，自动拉取其历史记录、附件和 AI 门禁 defects
watch(
  () => currentItem.value?.id,
  (id) => {
    syncReviewDecisionFromItem(currentItem.value)
    if (id) {
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
)
</script>

<template>
  <div class="rv2">
    <main v-if="review" class="rv2-main">
      <!-- ══ 顶部上下文条 ══ -->
      <section class="rv2-summary">
        <div class="rv2-summary-l">
          <div class="rv2-summary-title-row">
            <span class="rv2-tc-badge">{{ currentTestCaseTag }}</span>
            <h1 class="rv2-summary-title">
              {{ currentItem?.title_snapshot || review.name }}
            </h1>
          </div>
          <div v-if="currentItem" class="rv2-summary-meta" aria-label="当前评审上下文">
            <span class="rv2-context-chip">{{ currentRoundLabel }}</span>
            <span class="rv2-context-chip">{{ currentVersionLabel }}</span>
            <span class="rv2-context-chip" :class="resultClass(currentItem.final_result)">
              {{ resultLabel(currentItem.final_result) }}
            </span>
            <span class="rv2-context-chip" :class="aiGateClass(currentItem.ai_gate_status)">
              {{ aiGateLabel(currentItem.ai_gate_status) }}
            </span>
          </div>
          <p v-else class="rv2-summary-desc">暂无评审用例，请先关联用例后再开始评审。</p>
        </div>
        <div class="rv2-summary-r">
          <div class="rv2-progress-compact" aria-label="评审进度">
            <div class="rv2-progress-copy">
              <span>评审进度</span>
              <strong>{{ reviewedCaseCount }}/{{ review.case_total_count }}</strong>
            </div>
            <div class="rv2-progress-track">
              <div class="rv2-progress-fill" :style="{ width: `${reviewProgressPercent}%` }"></div>
            </div>
          </div>
          <div v-if="currentItem" class="rv2-nav-btns">
            <button
              type="button"
              class="rv2-nav-btn"
              :disabled="!canGoPrev"
              title="上一条 (↑)"
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
              @click="goNext"
            >
              <span class="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        </div>
      </section>

      <!-- ══ sidebar + 主内容 ══ -->
      <div v-if="currentItem" class="rv2-body">
        <!-- 左侧：评审用例列表 -->
        <aside class="rv2-sidebar">
          <div class="rv2-sidebar-header">
            <div class="rv2-sidebar-title-row">
              <span class="material-symbols-outlined">folder_open</span>
              <span class="rv2-sidebar-title">评审用例</span>
              <span class="rv2-sidebar-counter">{{ currentItemIndex + 1 }}/{{ items.length }}</span>
            </div>
            <div class="rv2-sidebar-stats">
              <button
                type="button"
                class="rv2-sidebar-filter"
                :class="{ active: sidebarFilter === 'all' }"
                @click="sidebarFilter = 'all'"
              >
                全部 {{ items.length }}
              </button>
              <button
                type="button"
                class="rv2-sidebar-filter"
                :class="{ active: sidebarFilter === 'pending' }"
                @click="sidebarFilter = 'pending'"
              >
                待评审 {{ sidebarPendingCount }}
              </button>
              <button
                type="button"
                class="rv2-sidebar-filter"
                :class="{ active: sidebarFilter === 'ai_failed' }"
                @click="sidebarFilter = 'ai_failed'"
              >
                AI 异常 {{ sidebarAIFailedCount }}
              </button>
            </div>
          </div>
          <div class="rv2-sidebar-list">
            <button
              v-for="{ item, index } in sidebarCaseRows"
              :key="item.id"
              type="button"
              class="rv2-case-row"
              :class="{ active: index === currentItemIndex }"
              @click="currentItemIndex = index"
            >
              <span class="rv2-case-idx">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="rv2-case-main">
                <span class="rv2-case-name" :title="item.title_snapshot">
                  {{ item.title_snapshot }}
                </span>
                <span class="rv2-case-meta">
                  <span class="rv2-case-status" :class="resultClass(item.final_result)">
                    {{ resultLabel(item.final_result) }}
                  </span>
                  <span class="rv2-case-ai" :class="aiGateClass(item.ai_gate_status)">
                    {{ aiGateLabel(item.ai_gate_status) }}
                  </span>
                </span>
              </span>
            </button>
            <div v-if="sidebarCaseRows.length === 0" class="rv2-sidebar-empty">无匹配用例</div>
          </div>
        </aside>

        <!-- 70/30 主网格 -->
        <div class="rv2-grid">
          <!-- 左栏 70% -->
          <div class="rv2-left">
            <!-- AI 校验网关 -->
            <section class="rv2-panel">
              <h2 class="rv2-panel-title">
                <span class="material-symbols-outlined">security</span>
                AI 校验网关
                <div class="rv2-panel-actions">
                  <button
                    class="rv2-panel-btn rv2-panel-btn-primary"
                    :disabled="aiReviewRunning || !currentItem"
                    :title="
                      aiReviewRunning ? 'AI 评审中…' : '对当前评审项运行 AI 评审（批量请到列表页）'
                    "
                    @click="handleRunAIReview"
                  >
                    <span
                      class="material-symbols-outlined"
                      :class="{ 'rv2-spin': aiReviewRunning }"
                    >
                      auto_awesome
                    </span>
                    {{ aiReviewRunning ? '评审中…' : 'AI 评审本条' }}
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
                    <span class="rv2-gate-status" :class="`st-${g.status.toLowerCase()}`">
                      {{ AI_GATE_CARD_STATUS_LABEL[g.status] }}
                    </span>
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
                      <div class="rv2-finding-head">
                        <span class="rv2-finding-sev" :class="`sev-${f.severity}`">
                          {{ SEVERITY_LABEL[f.severity] }}
                        </span>
                        <button
                          type="button"
                          class="rv2-finding-field"
                          title="定位到对应字段"
                          @click="focusReviewField(f.fieldKey)"
                        >
                          <span class="material-symbols-outlined">location_on</span>
                          {{ f.fieldLabel }}
                        </button>
                        <span
                          v-if="f.kind === 'defect'"
                          class="rv2-finding-status"
                          :class="`st-${f.status}`"
                        >
                          {{ DEFECT_STATUS_LABEL[f.status] || f.status }}
                        </span>
                      </div>
                      <div class="rv2-finding-msg">{{ findingDisplayText(f) }}</div>
                      <p v-if="f.dispute_reason" class="rv2-finding-note">
                        异议：{{ f.dispute_reason }}
                      </p>
                      <div v-if="f.kind === 'defect' && f.defect" class="rv2-finding-actions">
                        <template v-if="f.status === 'open'">
                          <button
                            class="rv2-finding-btn rv2-finding-btn-ok"
                            title="标记为已处理"
                            @click="handleResolveDefect(f.defect)"
                          >
                            <span class="material-symbols-outlined">check</span>
                            标记已处理
                          </button>
                          <button
                            class="rv2-finding-btn"
                            title="提出异议"
                            @click="handleDisputeDefect(f.defect)"
                          >
                            <span class="material-symbols-outlined">gavel</span>
                            提异议
                          </button>
                        </template>
                        <template v-else-if="f.status === 'disputed' || f.status === 'resolved'">
                          <button
                            class="rv2-finding-btn"
                            title="重新开启"
                            @click="handleReopenDefect(f.defect)"
                          >
                            <span class="material-symbols-outlined">undo</span>
                            重开
                          </button>
                        </template>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
              <div v-else class="rv2-gate-empty-state">
                <span class="material-symbols-outlined">
                  {{ currentItem.ai_gate_status === 'timeout' ? 'error' : 'verified' }}
                </span>
                <div>
                  <strong>{{ aiGateEmptyTitle }}</strong>
                  <p>{{ aiGateEmptyDesc }}</p>
                </div>
              </div>
              <div v-if="showAIGateNormalStrip" class="rv2-gate-normal-strip">
                <span class="material-symbols-outlined">check_circle</span>
                <span>{{ aiNormalSummaryText }}</span>
              </div>
              <div v-if="aiDefectsLoading" class="rv2-findings-loading">AI 问题加载中…</div>
            </section>

            <!-- 用例字段审阅 -->
            <section class="rv2-panel rv2-case-fields">
              <div class="rv2-case-fields-head">
                <h2 class="rv2-panel-title">
                  <span class="material-symbols-outlined">fact_check</span>
                  用例内容
                  <span v-if="testCaseLoading" class="rv2-loading">加载中…</span>
                </h2>
                <div class="rv2-field-stats" aria-label="用例字段数量">
                  <span>前置 {{ preconditionItems.length }}</span>
                  <span>后置 {{ postconditionItems.length }}</span>
                  <span>步骤 {{ realSteps.length }}</span>
                </div>
              </div>

              <section class="rv2-basic-fields" aria-label="基础信息">
                <article
                  id="case-field-title"
                  class="rv2-basic-field rv2-basic-title"
                  :class="{
                    'has-issue': fieldHasIssue('title'),
                    'is-field-focused': activeReviewField === 'title',
                  }"
                >
                  <div class="rv2-field-head">
                    <span class="material-symbols-outlined">title</span>
                    <strong>标题</strong>
                    <span v-if="fieldIssueCount('title')" class="rv2-field-issue">
                      问题 {{ fieldIssueCount('title') }}
                    </span>
                  </div>
                  <p>{{ caseTitleText }}</p>
                </article>
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
                    <span v-if="fieldIssueCount('level')" class="rv2-field-issue">
                      问题 {{ fieldIssueCount('level') }}
                    </span>
                  </div>
                  <p>{{ caseLevelText }}</p>
                </article>
                <article class="rv2-basic-field">
                  <div class="rv2-field-head">
                    <span class="material-symbols-outlined">priority_high</span>
                    <strong>优先级</strong>
                  </div>
                  <p>{{ casePriorityText }}</p>
                </article>
                <article class="rv2-basic-field rv2-basic-module">
                  <div class="rv2-field-head">
                    <span class="material-symbols-outlined">account_tree</span>
                    <strong>模块</strong>
                  </div>
                  <p>{{ caseModuleText }}</p>
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
                    <span v-if="fieldIssueCount('precondition')" class="rv2-field-issue">
                      问题 {{ fieldIssueCount('precondition') }}
                    </span>
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
                    <span v-if="fieldIssueCount('postcondition')" class="rv2-field-issue">
                      问题 {{ fieldIssueCount('postcondition') }}
                    </span>
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
                  <span class="rv2-panel-count">{{ realSteps.length }}</span>
                  <span v-if="fieldIssueCount('steps')" class="rv2-field-issue">
                    问题 {{ fieldIssueCount('steps') }}
                  </span>
                </h2>
                <div v-if="realSteps.length === 0" class="rv2-empty-steps">
                  用例尚未填写执行步骤
                </div>
                <ol v-else class="rv2-step-list">
                  <li v-for="step in realSteps" :key="step.no" class="rv2-step">
                    <span class="rv2-step-marker">{{ step.no }}</span>
                    <p class="rv2-step-desc">{{ step.action }}</p>
                  </li>
                </ol>
              </section>
            </section>

            <!-- 附件与证据 -->
            <section class="rv2-panel" :class="{ 'rv2-panel-compact': attachments.length === 0 }">
              <h2 class="rv2-panel-title">
                <span class="material-symbols-outlined">attachment</span>
                附件与证据
                <span class="rv2-panel-count">{{ attachments.length }}</span>
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
                    <div class="rv2-attach-actions">
                      <button class="rv2-mini-btn" @click="handleDownloadAttachment(att)">
                        <span class="material-symbols-outlined">download</span>
                        下载
                      </button>
                      <button class="rv2-mini-btn danger" @click="handleDeleteAttachment(att)">
                        <span class="material-symbols-outlined">delete</span>
                        删除
                      </button>
                    </div>
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

            <!-- 审计轨迹 -->
            <section class="rv2-panel rv2-audit">
              <h2 class="rv2-panel-title">
                <span class="material-symbols-outlined">history</span>
                审计轨迹
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
                <span>暂无评审记录</span>
              </div>
              <div v-else v-loading="recordsLoading">
                <div
                  v-if="latestRecord"
                  class="rv2-audit-latest"
                  :class="`rv2-tl-${resultClass(latestRecord.result)}`"
                >
                  <div class="rv2-audit-latest-top">
                    <span class="rv2-drawer-result" :class="resultClass(latestRecord.result)">
                      {{ resultLabel(latestRecord.result) }}
                    </span>
                    <span class="rv2-tl-time">{{ formatDate(latestRecord.created_at) }}</span>
                  </div>
                  <div class="rv2-audit-latest-reviewer">
                    {{ latestRecord.reviewer_name || `评审人 #${latestRecord.reviewer_id}` }}
                  </div>
                  <p v-if="latestRecord.comment" class="rv2-tl-desc">
                    {{ latestRecord.comment }}
                  </p>
                  <p v-else class="rv2-tl-desc rv2-tl-muted">（无评审意见）</p>
                </div>
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
      :title="`评审记录 - ${recordDrawerItem?.title_snapshot || ''}`"
      direction="rtl"
      size="420px"
    >
      <div v-loading="recordsLoading">
        <div v-if="records.length === 0 && !recordsLoading" class="rv2-drawer-empty">
          <span class="material-symbols-outlined">history</span>
          <p>暂无评审记录</p>
        </div>
        <div v-else class="rv2-drawer-list">
          <div v-for="rec in records" :key="rec.id" class="rv2-drawer-item">
            <div class="rv2-drawer-head">
              <span class="rv2-drawer-result" :class="resultClass(rec.result)">
                {{ resultLabel(rec.result) }}
              </span>
              <span class="rv2-drawer-round">R{{ rec.round_no }}</span>
              <span class="rv2-drawer-time">{{ formatDate(rec.created_at) }}</span>
            </div>
            <div v-if="rec.comment" class="rv2-drawer-comment">{{ rec.comment }}</div>
          </div>
        </div>
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
  --rv2-bg: #11131e;
  --rv2-surface: #11131e;
  --rv2-section: #191b26; /* surface-container-low */
  --rv2-card: #1d1f2b; /* surface-container */
  --rv2-card-high: #272935; /* surface-container-high */
  --rv2-card-bright: #373845;
  --rv2-input: #0c0e18; /* surface-container-lowest */

  --rv2-primary: #d2bbff;
  --rv2-primary-strong: #7c3aed; /* primary-container */
  --rv2-secondary: #adc6ff;
  --rv2-secondary-strong: #0566d9;
  --rv2-tertiary: #ffb784; /* 预警橙 */

  --rv2-fg: #e1e1f2;
  --rv2-fg-muted: #ccc3d8;
  --rv2-outline: #958da1;
  --rv2-outline-variant: #4a4455;
  --rv2-border-hairline: rgba(74, 68, 85, 0.1);
  --rv2-border-soft: rgba(74, 68, 85, 0.15);
  --rv2-border-muted: rgba(74, 68, 85, 0.22);
  --rv2-muted-soft: rgba(204, 195, 216, 0.72);
  --rv2-muted-faint: rgba(204, 195, 216, 0.45);
  --rv2-hover-tint: rgba(124, 58, 237, 0.08);

  --rv2-success: #10b981;
  --rv2-warning: #f59e0b;
  --rv2-error: #ef4444;

  --rv2-radius: 0.75rem; /* xl */
  --rv2-radius-sm: 0.5rem; /* lg */

  background: var(--rv2-bg);
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
  background: rgba(17, 19, 30, 0.6);
}

.rv2-panel-btn,
.rv2-finding-btn,
.rv2-mini-btn,
.rv2-nav-btn,
.rv2-attach-inline-btn,
.rv2-btn {
  display: inline-flex;
  align-items: center;
}

.rv2-context-chip,
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

/* ── 面板标题内的操作按钮组 ── */
.rv2-panel-actions {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.rv2-panel-btn {
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--rv2-radius-sm);
  background: transparent;
  color: var(--rv2-fg-muted);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: normal;
  text-transform: none;
  cursor: pointer;
  transition: all 0.15s;
}
.rv2-panel-btn:hover {
  color: var(--rv2-primary);
  border-color: rgba(210, 187, 255, 0.4);
  background: rgba(255, 255, 255, 0.03);
}
.rv2-panel-btn .material-symbols-outlined {
  font-size: 16px;
}
.rv2-panel-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
.rv2-panel-btn-primary {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.18), rgba(5, 102, 217, 0.18));
  border-color: rgba(124, 58, 237, 0.45);
  color: var(--rv2-primary);
}
.rv2-panel-btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.3), rgba(5, 102, 217, 0.3));
  border-color: var(--rv2-primary);
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
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 1900px;
  margin: 0 auto;
  width: 100%;
}

/* ── 顶部上下文条 ── */
.rv2-summary {
  position: relative;
  background: var(--rv2-section);
  border: 1px solid var(--rv2-border-soft);
  border-radius: var(--rv2-radius);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
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
.rv2-summary-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--rv2-fg);
  letter-spacing: normal;
  line-height: 1.25;
}
.rv2-summary-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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
.rv2-context-chip {
  min-height: 22px;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(204, 195, 216, 0.07);
  border: 1px solid rgba(204, 195, 216, 0.1);
  color: rgba(204, 195, 216, 0.76);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.25;
}
.rv2-context-chip.approved,
.rv2-context-chip.passed {
  color: var(--rv2-success);
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.18);
}
.rv2-context-chip.rejected {
  color: var(--rv2-error);
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.2);
}
.rv2-context-chip.needs-update,
.rv2-context-chip.failed {
  color: var(--rv2-warning);
  background: rgba(245, 158, 11, 0.09);
  border-color: rgba(245, 158, 11, 0.2);
}
.rv2-context-chip.running {
  color: var(--rv2-secondary);
  background: rgba(5, 102, 217, 0.1);
  border-color: rgba(173, 198, 255, 0.18);
}
.rv2-context-chip.pending,
.rv2-context-chip.idle {
  color: rgba(204, 195, 216, 0.58);
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
  height: 4px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.05);
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
  width: 32px;
  height: 32px;
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
  display: flex;
  flex-direction: column;
  gap: 24px;
}
@media (min-width: 1100px) {
  .rv2-body {
    flex-direction: row;
    align-items: flex-start;
  }
}

/* ── 左侧边栏：评审用例列表 ── */
.rv2-sidebar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--rv2-section);
  border: 1px solid var(--rv2-border-soft);
  border-radius: var(--rv2-radius);
  overflow: hidden;
}
@media (min-width: 1100px) {
  .rv2-sidebar {
    width: 260px;
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
  padding: 5px 8px;
  border-radius: 4px;
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

/* ── 70/30 主网格 ── */
.rv2-grid {
  display: flex;
  flex-direction: column;
  gap: 24px;
  flex: 1;
  min-width: 0;
}
@media (min-width: 1100px) {
  .rv2-grid {
    flex-direction: row;
    align-items: flex-start;
  }
}
.rv2-left {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
}
.rv2-right {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
}
@media (min-width: 1100px) {
  .rv2-left {
    width: 70%;
  }
  .rv2-right {
    width: 30%;
    position: sticky;
    top: 88px;
  }
}

/* ── 基础面板 ── */
.rv2-panel {
  background: var(--rv2-section);
  border: 1px solid var(--rv2-border-soft);
  border-radius: var(--rv2-radius);
  padding: 24px;
  position: relative;
}
.rv2-panel-title {
  margin: 0 0 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--rv2-fg-muted);
  opacity: 0.85;
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

/* ── AI 校验网关 三卡 ── */
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

/* ── 维度卡内嵌 AI 问题 ── */
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
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(12, 14, 24, 0.55);
  border: 1px solid var(--rv2-border-muted);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rv2-finding.sev-critical::before,
.rv2-finding.sev-major::before,
.rv2-finding.sev-minor::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
}
.rv2-finding.sev-critical::before {
  background: rgba(239, 68, 68, 0.8);
}
.rv2-finding.sev-major::before {
  background: rgba(245, 158, 11, 0.8);
}
.rv2-finding.sev-minor::before {
  background: rgba(173, 198, 255, 0.6);
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
.rv2-field-stats {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.rv2-field-stats span {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(204, 195, 216, 0.06);
  border: 1px solid rgba(204, 195, 216, 0.1);
  color: rgba(204, 195, 216, 0.68);
  font-size: 11px;
  font-weight: 700;
}
.rv2-basic-fields {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
@media (min-width: 900px) {
  .rv2-basic-fields {
    grid-template-columns: minmax(0, 1.6fr) minmax(120px, 0.55fr) minmax(120px, 0.55fr) minmax(
        160px,
        0.9fr
      );
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
.rv2-basic-title p {
  font-size: 14px;
}
.rv2-basic-module p {
  color: rgba(225, 225, 242, 0.82);
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
.rv2-field-issue {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(245, 158, 11, 0.12);
  color: var(--rv2-warning);
  border: 1px solid rgba(245, 158, 11, 0.22);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
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
.rv2-step-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rv2-step {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 12px;
  align-items: flex-start;
  padding: 12px;
  border-radius: var(--rv2-radius-sm);
  background: rgba(12, 14, 24, 0.38);
  border: 1px solid rgba(74, 68, 85, 0.14);
}
.rv2-step-marker {
  width: 32px;
  height: 26px;
  border-radius: 4px;
  background: var(--rv2-card-high);
  border: 1px solid rgba(74, 68, 85, 0.26);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 700;
  color: var(--rv2-muted-soft);
}
.rv2-step-desc {
  margin: 0;
  font-size: 13px;
  font-weight: 450;
  line-height: 1.65;
  color: var(--rv2-fg);
  word-break: break-word;
  overflow-wrap: break-word;
}
/* ── 评审用例列表（左侧边栏内） ── */
.rv2-case-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 14px;
  width: 100%;
  background: transparent;
  border: none;
  text-align: left;
  color: var(--rv2-fg-muted);
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
  border-bottom: 1px solid rgba(74, 68, 85, 0.08);
}
.rv2-case-row:last-child {
  border-bottom: none;
}
.rv2-case-row:hover {
  background: rgba(255, 255, 255, 0.03);
  color: var(--rv2-fg);
}
.rv2-case-row.active {
  background: linear-gradient(90deg, rgba(124, 58, 237, 0.16), rgba(124, 58, 237, 0.045));
  box-shadow: inset 3px 0 0 var(--rv2-primary-strong);
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
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
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
  display: flex;
  align-items: stretch;
  gap: 12px;
  padding: 12px;
  min-height: 120px;
  background: var(--rv2-card);
  border: 1px solid var(--rv2-border-hairline);
  border-radius: var(--rv2-radius-sm);
}
.rv2-attach-card.has-preview {
  min-height: 132px;
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
  width: 108px;
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
  gap: 4px;
}
.rv2-attach-actions {
  margin-top: auto;
  display: flex;
  gap: 8px;
}
.rv2-mini-btn {
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--rv2-primary);
  font-size: 11px;
  cursor: pointer;
  transition: background 0.2s;
}
.rv2-mini-btn .material-symbols-outlined {
  font-size: 13px;
}
.rv2-mini-btn:hover {
  background: rgba(124, 58, 237, 0.2);
}
.rv2-mini-btn.danger {
  color: var(--rv2-error);
}
.rv2-mini-btn.danger:hover {
  background: rgba(239, 68, 68, 0.2);
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
  gap: 9px;
  padding: 10px 11px;
  border-radius: var(--rv2-radius-sm);
  border: 1px solid rgba(74, 68, 85, 0.2);
  background: rgba(255, 255, 255, 0.02);
  color: var(--rv2-fg-muted);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.16s,
    background 0.16s,
    color 0.16s;
}
.rv2-decision-option:hover {
  border-color: rgba(210, 187, 255, 0.28);
  background: rgba(124, 58, 237, 0.07);
  color: var(--rv2-fg);
}
.rv2-decision-option.active {
  color: var(--rv2-fg);
  border-color: rgba(210, 187, 255, 0.48);
  background: rgba(124, 58, 237, 0.12);
  box-shadow: inset 3px 0 0 var(--rv2-primary-strong);
}
.rv2-decision-option.decision-rejected.active {
  border-color: rgba(239, 68, 68, 0.42);
  background: rgba(239, 68, 68, 0.08);
  box-shadow: inset 3px 0 0 var(--rv2-error);
}
.rv2-decision-option.decision-needs_update.active {
  border-color: rgba(245, 158, 11, 0.42);
  background: rgba(245, 158, 11, 0.08);
  box-shadow: inset 3px 0 0 var(--rv2-warning);
}
.rv2-decision-option .material-symbols-outlined {
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 18px;
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

/* ── 审计轨迹 ── */
.rv2-audit-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px;
  color: var(--rv2-fg-muted);
  opacity: 0.5;
  font-size: 12px;
}
.rv2-audit-empty .material-symbols-outlined {
  font-size: 32px;
  opacity: 0.4;
}
.rv2-audit-latest {
  padding: 12px;
  border-radius: var(--rv2-radius-sm);
  background: rgba(12, 14, 24, 0.42);
  border: 1px solid rgba(74, 68, 85, 0.16);
}
.rv2-audit-latest.rv2-tl-approved {
  border-color: rgba(16, 185, 129, 0.2);
}
.rv2-audit-latest.rv2-tl-rejected {
  border-color: rgba(239, 68, 68, 0.2);
}
.rv2-audit-latest.rv2-tl-needs-update {
  border-color: rgba(245, 158, 11, 0.24);
}
.rv2-audit-latest-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.rv2-audit-latest-reviewer {
  margin-bottom: 5px;
  color: var(--rv2-fg);
  font-size: 12px;
  font-weight: 650;
}
.rv2-tl-time {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--rv2-outline);
  opacity: 0.7;
  flex-shrink: 0;
  margin-left: 8px;
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
.rv2-drawer-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 0;
  gap: 8px;
  color: var(--rv2-fg-muted);
  opacity: 0.5;
}
.rv2-drawer-empty .material-symbols-outlined {
  font-size: 40px;
  opacity: 0.4;
}
.rv2-drawer-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rv2-drawer-item {
  padding: 12px 14px;
  border-radius: var(--rv2-radius-sm);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--rv2-border-soft);
}
.rv2-drawer-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.rv2-drawer-result {
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
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
.rv2-drawer-round {
  font-size: 11px;
  color: var(--rv2-fg-muted);
  opacity: 0.6;
  font-weight: 600;
}
.rv2-drawer-time {
  margin-left: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--rv2-outline);
  opacity: 0.5;
}
.rv2-drawer-comment {
  font-size: 12px;
  line-height: 1.5;
  color: var(--rv2-fg-muted);
  white-space: pre-wrap;
  word-break: break-word;
}
/* 设计稿 V2 样式结束。旧 .rd-* 类已全部迁移为 .rv2-*。 */
</style>
