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

const reviewDecision = ref<'approved' | 'rejected' | 'needs_update'>('approved')
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
function formatDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
}

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
  if (!currentItem.value) return
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

// ── 设计稿派生数据：AI 置信度、3 张校验网关卡、条件 checklist ──

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

/**
 * AI 置信度：按当前用例 ai_gate_status 映射成百分比。
 * Layer 1 目前未输出数值分，passed 视作 100%；failed 给 60% 代表"有 finding 但已跑过"；
 * bypassed 也算 100%（人工确认无问题）；尚未运行则返回 null，由 UI 显示 "--"。
 */
const aiConfidence = computed<number | null>(() => {
  const s = currentItem.value?.ai_gate_status
  if (s === 'passed' || s === 'bypassed') return 100
  if (s === 'failed') return 60
  if (s === 'timeout') return 0
  return null
})

const aiConfidenceLabel = computed(() => {
  const v = aiConfidence.value
  return v === null || v === undefined ? '--' : v.toFixed(1)
})

/** 设计稿 3 张 AI 校验网关卡：覆盖深度 / 数据完整性 / 性能风险 */
type AIGateCardStatus = 'PASS' | 'WARN' | 'FAIL' | 'IDLE'
type DimensionKey = 'coverage' | 'integrity' | 'performance'

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
 * 若后端扩展新规则尚未同步到前端，兜底到 integrity（最大概率的分类）。
 */
const RULE_DIMENSION_MAP: Record<string, DimensionKey> = {
  标题必填: 'integrity',
  标题过长: 'integrity',
  前置条件必填: 'integrity',
  步骤必填: 'coverage',
  步骤过于简略: 'coverage',
  后置条件建议补充: 'integrity',
  等级必填: 'integrity',
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
    dimension: 'integrity',
    predicate: (tc) => ({ fail: !tc?.title?.trim(), message: '用例标题为空' }),
  },
  {
    key: 'RULE_TITLE_LEN_MAX',
    rule: '标题过长',
    severity: 'minor',
    dimension: 'integrity',
    predicate: (tc) => {
      const t = tc?.title?.trim() ?? ''
      return { fail: [...t].length > 120, message: '标题字符数超过 120，建议精简' }
    },
  },
  {
    key: 'RULE_PRECONDITION_REQUIRED',
    rule: '前置条件必填',
    severity: 'major',
    dimension: 'integrity',
    predicate: (tc) => ({
      fail: !tc?.precondition?.trim(),
      message: '用例前置条件为空，评审人无法判断执行前提',
    }),
  },
  {
    key: 'RULE_STEPS_REQUIRED',
    rule: '步骤必填',
    severity: 'critical',
    dimension: 'coverage',
    predicate: (tc) => ({ fail: !tc?.steps?.trim(), message: '用例步骤为空' }),
  },
  {
    key: 'RULE_STEPS_MIN_LEN',
    rule: '步骤过于简略',
    severity: 'major',
    dimension: 'coverage',
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
    dimension: 'integrity',
    predicate: (tc) => ({
      fail: !tc?.postcondition?.trim(),
      message: '后置条件为空，建议补充清理/回滚逻辑',
    }),
  },
  {
    key: 'RULE_LEVEL_REQUIRED',
    rule: '等级必填',
    severity: 'major',
    dimension: 'integrity',
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
    coverage: [],
    integrity: [],
    performance: [],
  }
  const handledRules = new Set<string>()

  // 3) 静态命中的规则：优先用后端 defect 展示（有 id + 可处理）；否则降级为静态提示
  for (const { r, res } of staticHits) {
    handledRules.add(r.rule)
    const backend = defectByRule.get(r.rule)
    if (backend && backend.status !== DEFECT_STATUS.Resolved) {
      // 后端有活跃 defect（open / disputed）：用它
      byDim[r.dimension].push({
        kind: 'defect',
        key: `defect-${backend.id}`,
        rule: r.rule,
        title: backend.title,
        severity: backend.severity,
        status: backend.status,
        dispute_reason: backend.dispute_reason,
        resolve_note: backend.resolve_note,
        defect: backend,
      })
    } else {
      // 无后端 defect，或 defect 已 resolved 但字段仍空 → 用静态展示（提示用户重新运行 AI）
      byDim[r.dimension].push({
        kind: 'static',
        key: `static-${r.key}`,
        rule: r.rule,
        title: `${r.rule}：${res.message}`,
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
    const dim = RULE_DIMENSION_MAP[rule] ?? 'integrity'
    byDim[dim].push({
      kind: 'defect',
      key: `defect-${d.id}`,
      rule,
      title: d.title,
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
    const activeStatuses: CardFindingStatus[] = ['open', 'pending', 'disputed']
    if (findings.some((f) => f.severity === 'critical' && activeStatuses.includes(f.status)))
      return 'FAIL'
    if (findings.some((f) => f.severity === 'major' && activeStatuses.includes(f.status)))
      return 'WARN'
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
      key: 'coverage',
      title: '覆盖深度',
      desc: deriveDesc(byDim.coverage, '用例步骤完整，覆盖深度符合标准。'),
      icon: 'policy',
      accent: 'secondary',
      status: deriveStatus(byDim.coverage),
      findings: byDim.coverage,
    },
    {
      key: 'integrity',
      title: '数据完整性',
      desc: deriveDesc(byDim.integrity, '必填字段齐全，数据完整度达标。'),
      icon: 'data_object',
      accent: 'primary',
      status: deriveStatus(byDim.integrity),
      findings: byDim.integrity,
    },
    {
      key: 'performance',
      title: '性能风险',
      desc: deriveDesc(byDim.performance, '未检测到性能相关风险项。'),
      icon: deriveStatus(byDim.performance) === 'PASS' ? 'check_circle' : 'warning',
      accent: deriveStatus(byDim.performance) === 'PASS' ? 'secondary' : 'tertiary',
      status: deriveStatus(byDim.performance),
      findings: byDim.performance,
    },
  ]
})

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

/** 当前用例是否已命中 AI 风险，用于在执行步骤尾部显示"AI 标记分析"警告条 */
const aiFlaggedRisk = computed(() => currentItem.value?.ai_gate_status === 'failed')

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

/** 执行决策：合并"打回"到下拉菜单，默认 2 按钮（拒绝/通过）符合设计稿 */
function decideAndSubmit(decision: 'approved' | 'rejected' | 'needs_update') {
  reviewDecision.value = decision
  handleSubmitReview()
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
    if (id) {
      loadCurrentItemRecords()
      loadAttachments()
      if (projectId.value && reviewId.value) {
        fetchAIDefects(projectId.value, reviewId.value, id)
      }
    } else {
      records.value = []
      attachments.value = []
    }
  },
)
</script>

<template>
  <div class="rv2">
    <main v-if="review" class="rv2-main">
      <!-- ══ 摘要卡（顶部） ══ -->
      <section class="rv2-summary">
        <div class="rv2-summary-stripe"></div>
        <div class="rv2-summary-l">
          <div class="rv2-summary-title-row">
            <span class="rv2-tc-badge">{{ currentTestCaseTag }}</span>
            <h1 class="rv2-summary-title">
              {{ currentItem?.title_snapshot || review.name }}
            </h1>
          </div>
          <div class="rv2-summary-meta">
            <p class="rv2-summary-desc">
              <template v-if="currentItem">
                评审轮次 R{{ currentItem.current_round_no || 1 }} · 用例版本
                {{ currentItem.testcase_version || 'V1' }}，请仔细阅读执行步骤并提交评审意见。
              </template>
              <template v-else>暂无评审用例，请先关联用例后再开始评审。</template>
            </p>
            <div v-if="currentItem" class="rv2-nav-btns">
              <button class="rv2-nav-btn" :disabled="!canGoPrev" title="上一条 (↑)" @click="goPrev">
                <span class="material-symbols-outlined">arrow_back</span>
                上一条
              </button>
              <span class="rv2-nav-pos">{{ currentItemIndex + 1 }} / {{ items.length }}</span>
              <button class="rv2-nav-btn" :disabled="!canGoNext" title="下一条 (↓)" @click="goNext">
                下一条
                <span class="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
        <div class="rv2-summary-r">
          <!-- 评审进度（合并到摘要卡，不再独立占位） -->
          <div class="rv2-summary-metric">
            <div class="rv2-metric-label">评审进度</div>
            <div class="rv2-metric-value">
              <span class="rv2-metric-num">
                {{ review.approved_count + review.rejected_count + review.needs_update_count }}
              </span>
              <span class="rv2-metric-unit">/ {{ review.case_total_count }}</span>
            </div>
            <div class="rv2-metric-track">
              <div
                class="rv2-metric-fill"
                :style="{
                  width:
                    review.case_total_count > 0
                      ? ((review.approved_count +
                          review.rejected_count +
                          review.needs_update_count) /
                          review.case_total_count) *
                          100 +
                        '%'
                      : '0%',
                }"
              ></div>
            </div>
          </div>
          <!-- AI 验证置信度 -->
          <div class="rv2-summary-metric rv2-summary-metric-conf">
            <div class="rv2-metric-label">AI 验证置信度</div>
            <div class="rv2-metric-value">
              <span class="rv2-conf-num">{{ aiConfidenceLabel }}</span>
              <span class="rv2-conf-unit">%</span>
            </div>
            <div class="rv2-conf-ring">
              <svg class="rv2-conf-svg" viewBox="0 0 36 36">
                <path
                  class="rv2-ring-bg"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  class="rv2-ring-fg"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  :stroke-dasharray="`${aiConfidence ?? 0}, 100`"
                />
              </svg>
              <span class="material-symbols-outlined rv2-ring-icon">verified</span>
            </div>
          </div>
        </div>
      </section>

      <!-- ══ sidebar + 主内容 ══ -->
      <div v-if="currentItem" class="rv2-body">
        <!-- 左侧：评审用例列表 -->
        <aside class="rv2-sidebar">
          <div class="rv2-sidebar-header">
            <span class="material-symbols-outlined">folder_open</span>
            <span class="rv2-sidebar-counter">{{ currentItemIndex + 1 }}/{{ items.length }}</span>
          </div>
          <div class="rv2-sidebar-list">
            <button
              v-for="(item, idx) in items"
              :key="item.id"
              type="button"
              class="rv2-case-row"
              :class="{ active: idx === currentItemIndex }"
              @click="currentItemIndex = idx"
            >
              <span class="rv2-case-idx">{{ String(idx + 1).padStart(2, '0') }}</span>
              <span class="rv2-case-name">{{ item.title_snapshot }}</span>
              <span class="rv2-case-dot" :class="resultClass(item.final_result)"></span>
            </button>
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
              <div class="rv2-gate-grid">
                <div
                  v-for="g in aiGateCards"
                  :key="g.key"
                  class="rv2-gate-card"
                  :class="[`accent-${g.accent}`, `status-${g.status.toLowerCase()}`]"
                >
                  <div class="rv2-gate-stripe"></div>
                  <div class="rv2-gate-blob"></div>
                  <div class="rv2-gate-head">
                    <span class="material-symbols-outlined rv2-gate-icon">{{ g.icon }}</span>
                    <span class="rv2-gate-status" :class="`st-${g.status.toLowerCase()}`">
                      {{ g.status }}
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
                        <!-- static 类型由卡底 hint bar 统一说明"待运行 AI"，此处不再重复 chip -->
                        <span
                          v-if="f.kind === 'defect'"
                          class="rv2-finding-status"
                          :class="`st-${f.status}`"
                        >
                          {{ DEFECT_STATUS_LABEL[f.status] || f.status }}
                        </span>
                      </div>
                      <div class="rv2-finding-msg">{{ f.title }}</div>
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
                            已处理
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
                  <!-- static finding 提示：顶部已有 AI 评审按钮，此处仅文字提示 -->
                  <div
                    v-if="g.findings.some((x) => x.kind === 'static')"
                    class="rv2-findings-hint-bar"
                  >
                    <span class="material-symbols-outlined">info</span>
                    <span class="rv2-findings-hint-text">
                      以上为静态检查项，运行 AI 评审后可进一步处理
                    </span>
                  </div>
                  <div
                    v-else-if="g.findings.length === 0 && g.status === 'PASS'"
                    class="rv2-findings-empty"
                  >
                    <span class="material-symbols-outlined">check_circle</span>
                    本维度无异常
                  </div>
                  <div
                    v-else-if="g.findings.length === 0 && g.status === 'IDLE'"
                    class="rv2-findings-empty rv2-findings-idle"
                  >
                    <span class="material-symbols-outlined">hourglass_empty</span>
                    AI 门禁未运行
                  </div>
                </div>
              </div>
              <div v-if="aiDefectsLoading" class="rv2-findings-loading">AI Findings 加载中…</div>
            </section>

            <!-- 条件 + 步骤（合并大卡） -->
            <div class="rv2-panel rv2-panel-flush">
              <!-- 条件 checklist -->
              <section class="rv2-conditions">
                <div class="rv2-cond-col">
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
                <div class="rv2-cond-col">
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

              <!-- 执行步骤时间轴 -->
              <section class="rv2-steps-sec">
                <h2 class="rv2-panel-title">
                  <span class="material-symbols-outlined">list_alt</span>
                  执行步骤
                  <span v-if="testCaseLoading" class="rv2-loading">加载中…</span>
                </h2>
                <div v-if="realSteps.length === 0" class="rv2-empty-steps">
                  用例尚未填写执行步骤
                </div>
                <div v-else class="rv2-timeline-steps">
                  <div
                    v-for="(step, idx) in realSteps"
                    :key="step.no"
                    class="rv2-step"
                    :class="{ 'is-warn': aiFlaggedRisk && idx === realSteps.length - 1 }"
                  >
                    <div class="rv2-step-marker">{{ step.no }}</div>
                    <div class="rv2-step-card">
                      <p class="rv2-step-desc">{{ step.action }}</p>
                      <!-- 期望结果：把用例 postcondition 作为最后一步 EXPECTED 兜底展示 -->
                      <div
                        v-if="idx === realSteps.length - 1 && realPostcondition"
                        class="rv2-step-mock"
                      >
                        <div class="rv2-mock-label rv2-mock-expected">
                          <span class="material-symbols-outlined">task_alt</span>
                          EXPECTED
                        </div>
                        <div class="rv2-mock-val">{{ realPostcondition }}</div>
                      </div>
                      <!-- AI 标记分析（AI 门禁 failed 时在最后一步显示） -->
                      <div
                        v-if="aiFlaggedRisk && idx === realSteps.length - 1"
                        class="rv2-step-flag"
                      >
                        <span class="material-symbols-outlined">warning</span>
                        <div>
                          <div class="rv2-step-flag-title">AI 标记分析</div>
                          <p class="rv2-step-flag-desc">
                            AI 门禁在本用例中识别到风险项，请在下方 Action Items 中查看详情。
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

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
                <div v-for="att in attachments" :key="att.id" class="rv2-attach-card">
                  <div class="rv2-attach-icon">
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
              <div class="rv2-decision-blob"></div>
              <h2 class="rv2-panel-title">
                <span class="material-symbols-outlined">gavel</span>
                执行决策
              </h2>
              <textarea
                v-model="reviewComment"
                class="rv2-decision-input"
                placeholder="输入评审意见或批准条件..."
              ></textarea>
              <div class="rv2-decision-btns">
                <button
                  class="rv2-btn rv2-btn-reject"
                  :disabled="submitting || !currentItem"
                  @click="decideAndSubmit('rejected')"
                >
                  <span class="material-symbols-outlined">block</span>
                  拒绝
                </button>
                <button
                  class="rv2-btn rv2-btn-approve"
                  :disabled="submitting || !currentItem"
                  @click="decideAndSubmit('approved')"
                >
                  <span class="material-symbols-outlined">check_circle</span>
                  通过
                </button>
              </div>
              <button
                class="rv2-btn rv2-btn-rework"
                :disabled="submitting || !currentItem"
                @click="decideAndSubmit('needs_update')"
              >
                <span class="material-symbols-outlined">edit_note</span>
                打回，要求修订
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
                    查看全部
                  </button>
                </div>
              </h2>
              <div v-if="records.length === 0 && !recordsLoading" class="rv2-audit-empty">
                <span class="material-symbols-outlined">forum</span>
                <span>在左侧填写评审意见并点击「通过」或「拒绝」，记录将在这里展示</span>
              </div>
              <div v-else v-loading="recordsLoading" class="rv2-timeline">
                <div
                  v-for="rec in records"
                  :key="rec.id"
                  class="rv2-timeline-item"
                  :class="`rv2-tl-${resultClass(rec.result)}`"
                >
                  <div class="rv2-tl-dot">
                    <span class="material-symbols-outlined">
                      {{
                        rec.result === 'approved'
                          ? 'check_circle'
                          : rec.result === 'rejected'
                            ? 'block'
                            : rec.result === 'needs_update'
                              ? 'edit_note'
                              : 'schedule'
                      }}
                    </span>
                  </div>
                  <div class="rv2-tl-card">
                    <div class="rv2-tl-head">
                      <span class="rv2-tl-title">
                        {{ rec.reviewer_name || `评审人 #${rec.reviewer_id}` }} ·
                        {{ resultLabel(rec.result) }}
                      </span>
                      <span class="rv2-tl-time">{{ formatDate(rec.created_at) }}</span>
                    </div>
                    <p v-if="rec.comment" class="rv2-tl-desc">{{ rec.comment }}</p>
                    <p v-else class="rv2-tl-desc rv2-tl-muted">（无评审意见）</p>
                  </div>
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
  </div>
</template>

<style scoped>
/* ═══════════════════════════════════════════════════ */
/*  Case Review Detail V2 – "Digital Cockpit" 设计系统  */
/*  参考 stitch DESIGN.md + code.html（结算流程边缘场景） */
/* ═══════════════════════════════════════════════════ */

/* ── Design Tokens（来自 DESIGN.md §2 / §4） ── */
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
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
:deep(.el-loading-mask) {
  background: rgba(17, 19, 30, 0.6);
}

/* ── 面板标题内的操作按钮组 ── */
.rv2-panel-actions {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.rv2-panel-btn {
  display: inline-flex;
  align-items: center;
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

/* ── 摘要卡 ── */
.rv2-summary {
  position: relative;
  overflow: hidden;
  background: var(--rv2-section);
  border: 1px solid rgba(74, 68, 85, 0.15);
  border-radius: var(--rv2-radius);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
@media (min-width: 900px) {
  .rv2-summary {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }
}
.rv2-summary-stripe {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--rv2-secondary);
}
.rv2-summary-l {
  flex: 1;
  min-width: 0;
}
.rv2-summary-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.rv2-tc-badge {
  padding: 3px 12px;
  border-radius: 9999px;
  background: rgba(5, 102, 217, 0.2);
  color: var(--rv2-secondary);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border: 1px solid rgba(173, 198, 255, 0.2);
}
.rv2-summary-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--rv2-fg);
  letter-spacing: -0.02em;
  line-height: 1.25;
}
.rv2-summary-meta {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
/* #6 上一条 / 下一条导航 */
.rv2-nav-btns {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.rv2-nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: var(--rv2-radius-sm);
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent;
  color: var(--rv2-fg-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.rv2-nav-btn .material-symbols-outlined {
  font-size: 14px;
}
.rv2-nav-btn:hover:not(:disabled) {
  color: var(--rv2-primary);
  border-color: rgba(210, 187, 255, 0.4);
  background: rgba(124, 58, 237, 0.08);
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
.rv2-summary-r {
  display: flex;
  align-items: stretch;
  gap: 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
/* 摘要卡右侧 2 个 mini 指标块（进度 / 置信度） */
.rv2-summary-metric {
  min-width: 180px;
  padding: 14px 16px;
  background: var(--rv2-card);
  border: 1px solid rgba(74, 68, 85, 0.2);
  border-radius: var(--rv2-radius-sm);
  box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
}
.rv2-metric-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--rv2-fg-muted);
  opacity: 0.65;
}
.rv2-metric-value {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.rv2-metric-num {
  font-size: 26px;
  font-weight: 700;
  color: var(--rv2-primary);
  letter-spacing: -0.02em;
  line-height: 1;
}
.rv2-metric-unit {
  font-size: 13px;
  color: var(--rv2-fg-muted);
  opacity: 0.55;
}
.rv2-metric-track {
  margin-top: auto;
  height: 4px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.04);
  overflow: hidden;
}
.rv2-metric-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--rv2-primary-strong), var(--rv2-secondary-strong));
  border-radius: 9999px;
  transition: width 0.5s ease;
  box-shadow: 0 0 8px rgba(124, 58, 237, 0.4);
}
/* 置信度 mini 块：右下角放小圆环 */
.rv2-summary-metric-conf {
  padding-right: 72px;
}
.rv2-conf-num {
  font-size: 26px;
  font-weight: 700;
  color: var(--rv2-primary);
  letter-spacing: -0.02em;
  line-height: 1;
}
.rv2-conf-unit {
  font-size: 13px;
  color: var(--rv2-primary);
  opacity: 0.6;
}
.rv2-conf-ring {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 3px solid var(--rv2-card-high);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.5);
}
.rv2-conf-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.rv2-ring-bg {
  stroke: var(--rv2-card-bright);
  stroke-width: 3;
  fill: none;
  stroke-dasharray: 100, 100;
}
.rv2-ring-fg {
  stroke: var(--rv2-primary-strong);
  stroke-width: 3;
  fill: none;
  transition: stroke-dasharray 0.6s ease;
  filter: drop-shadow(0 0 4px rgba(124, 58, 237, 0.8));
}
.rv2-ring-icon {
  position: relative;
  z-index: 1;
  color: var(--rv2-primary);
  font-size: 20px;
  font-variation-settings: 'FILL' 1;
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
  border: 1px solid rgba(74, 68, 85, 0.15);
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
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--rv2-fg-muted);
  letter-spacing: 0.02em;
  border-bottom: 1px solid rgba(74, 68, 85, 0.15);
}
.rv2-sidebar-header .material-symbols-outlined {
  font-size: 16px;
  color: var(--rv2-primary);
  opacity: 0.7;
}
.rv2-sidebar-counter {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--rv2-fg-muted);
  opacity: 0.7;
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
  border: 1px solid rgba(74, 68, 85, 0.15);
  border-radius: var(--rv2-radius);
  padding: 24px;
  position: relative;
}
.rv2-panel-flush {
  padding: 0;
  overflow: hidden;
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
  border: 1px solid rgba(74, 68, 85, 0.1);
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

/* ── 维度卡内嵌 AI Findings ── */
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
  border: 1px solid rgba(74, 68, 85, 0.22);
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
.rv2-finding-status {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
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
/* 卡底部统一 hint bar（仅在本卡存在 static finding 时显示） */
.rv2-findings-hint-bar {
  /* margin-top: auto 把 hint bar 推到卡底部，多张卡 findings 数量不同时底部对齐 */
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  padding-left: 0;
  padding-right: 0;
  padding-bottom: 0;
  border-top: 1px dashed rgba(74, 68, 85, 0.25);
  position: relative;
  z-index: 1;
  margin-bottom: -4px;
}
.rv2-findings-hint-bar > .material-symbols-outlined {
  font-size: 14px;
  color: var(--rv2-primary);
  opacity: 0.7;
  flex-shrink: 0;
}
.rv2-findings-hint-text {
  flex: 1;
  font-size: 11px;
  color: rgba(204, 195, 216, 0.6);
}
/* hint bar 内的立即运行按钮：不跳出面板即可触发 AI 评审 */
.rv2-findings-hint-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--rv2-primary);
  background: rgba(124, 58, 237, 0.1);
  border: 1px solid rgba(124, 58, 237, 0.25);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}
.rv2-findings-hint-btn:hover:not(:disabled) {
  color: #ffffff;
  background: rgba(124, 58, 237, 0.35);
  border-color: rgba(124, 58, 237, 0.6);
}
.rv2-findings-hint-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}
.rv2-findings-hint-btn .material-symbols-outlined {
  font-size: 13px;
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
  display: inline-flex;
  align-items: center;
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
  background: rgba(124, 58, 237, 0.08);
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
.rv2-findings-empty {
  /* 空卡 empty state：甲驱到底部、收敛到内容宽，不再用大片绿色主宰整张卡 */
  align-self: flex-start;
  margin-top: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  color: rgba(52, 211, 153, 0.7);
  background: rgba(16, 185, 129, 0.04);
  border: 1px solid rgba(16, 185, 129, 0.14);
  position: relative;
  z-index: 1;
}
.rv2-findings-empty .material-symbols-outlined {
  font-size: 14px;
}
.rv2-findings-empty.rv2-findings-idle {
  color: rgba(204, 195, 216, 0.5);
  background: rgba(255, 255, 255, 0.02);
  border-color: rgba(74, 68, 85, 0.22);
}
.rv2-findings-loading {
  margin-top: 12px;
  text-align: center;
  font-size: 11px;
  color: rgba(204, 195, 216, 0.45);
}

/* ── 条件 checklist ── */
.rv2-conditions {
  display: grid;
  gap: 14px;
  grid-template-columns: 1fr;
  padding: 16px;
  background: rgba(12, 14, 24, 0.5);
  border-bottom: 1px solid rgba(74, 68, 85, 0.15);
}
@media (min-width: 720px) {
  .rv2-conditions {
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
}
.rv2-cond-col {
  padding: 12px;
  background: rgba(29, 31, 43, 0.5);
  border: 1px solid rgba(74, 68, 85, 0.1);
  border-radius: var(--rv2-radius-sm);
  box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.2);
}
.rv2-cond-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--rv2-fg-muted);
  opacity: 0.85;
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
  gap: 10px;
}
.rv2-cond-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 4px;
  background: rgba(50, 52, 64, 0.3);
  border: 1px solid rgba(74, 68, 85, 0.1);
  font-size: 13px;
  font-weight: 300;
  color: rgba(225, 225, 242, 0.9);
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

/* ── 执行步骤时间轴 ── */
.rv2-steps-sec {
  padding: 24px;
  background: var(--rv2-input);
}
.rv2-empty-steps {
  padding: 32px;
  text-align: center;
  font-size: 13px;
  color: var(--rv2-fg-muted);
  opacity: 0.5;
  border: 1px dashed rgba(74, 68, 85, 0.2);
  border-radius: var(--rv2-radius-sm);
}
.rv2-timeline-steps {
  padding-left: 16px;
  margin-left: 16px;
  border-left: 2px solid var(--rv2-card-high);
  display: flex;
  flex-direction: column;
  gap: 32px;
}
.rv2-step {
  position: relative;
}
.rv2-step-marker {
  position: absolute;
  left: -37px;
  top: 4px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--rv2-card-high);
  border: 2px solid var(--rv2-input);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 700;
  color: var(--rv2-fg-muted);
  z-index: 2;
}
.rv2-step.is-warn .rv2-step-marker {
  background: var(--rv2-primary-strong);
  color: #ede0ff;
  box-shadow: 0 0 15px rgba(124, 58, 237, 0.4);
}
.rv2-step-card {
  padding: 20px;
  background: var(--rv2-card);
  border: 1px solid rgba(74, 68, 85, 0.1);
  border-radius: var(--rv2-radius-sm);
  transition: border-color 0.2s;
  position: relative;
  overflow: hidden;
}
.rv2-step-card:hover {
  border-color: rgba(74, 68, 85, 0.3);
}
.rv2-step.is-warn .rv2-step-card {
  border-color: rgba(210, 187, 255, 0.3);
  box-shadow: 0 4px 20px rgba(124, 58, 237, 0.1);
}
.rv2-step.is-warn .rv2-step-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: linear-gradient(to bottom, var(--rv2-primary), var(--rv2-primary-strong));
}
.rv2-step-desc {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.7;
  color: var(--rv2-fg);
  word-break: break-word;
  overflow-wrap: break-word;
}
.rv2-step.is-warn .rv2-step-desc {
  font-weight: 600;
}
.rv2-step-mock {
  background: #0c0e18;
  border: 1px solid rgba(74, 68, 85, 0.15);
  border-radius: 4px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
}
.rv2-mock-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.rv2-mock-label .material-symbols-outlined {
  font-size: 13px;
}
.rv2-mock-expected {
  color: var(--rv2-secondary);
}
.rv2-mock-val {
  color: var(--rv2-fg-muted);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.rv2-step-flag {
  margin-top: 12px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 4px;
}
.rv2-step-flag .material-symbols-outlined {
  flex-shrink: 0;
  font-size: 18px;
  color: var(--rv2-error);
  margin-top: 2px;
}
.rv2-step-flag-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--rv2-error);
  margin-bottom: 4px;
}
.rv2-step-flag-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(239, 68, 68, 0.85);
}

/* ── 评审用例列表（左侧边栏内） ── */
.rv2-case-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
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
  background: linear-gradient(90deg, rgba(124, 58, 237, 0.14), rgba(124, 58, 237, 0.04));
  box-shadow: inset 3px 0 0 var(--rv2-primary-strong);
  color: var(--rv2-fg);
}
.rv2-case-idx {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  color: rgba(204, 195, 216, 0.4);
  min-width: 24px;
}
.rv2-case-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rv2-case-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--rv2-outline);
}
.rv2-case-dot.approved {
  background: var(--rv2-success);
}
.rv2-case-dot.rejected {
  background: var(--rv2-error);
}
.rv2-case-dot.needs-update {
  background: var(--rv2-warning);
}
.rv2-case-dot.pending {
  background: var(--rv2-outline);
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
  display: inline-flex;
  align-items: center;
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
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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
  gap: 12px;
  padding: 12px;
  height: 120px;
  background: var(--rv2-card);
  border: 1px solid rgba(74, 68, 85, 0.1);
  border-radius: var(--rv2-radius-sm);
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
  display: inline-flex;
  align-items: center;
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

/* ── 右栏：执行决策 ── */
.rv2-decision {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.rv2-decision-blob {
  position: absolute;
  top: 0;
  right: 0;
  width: 128px;
  height: 128px;
  background: rgba(124, 58, 237, 0.05);
  border-radius: 50%;
  filter: blur(40px);
  pointer-events: none;
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
  color: rgba(204, 195, 216, 0.45);
}
.rv2-decision-input:focus {
  border-color: var(--rv2-primary);
  box-shadow:
    0 0 0 1px var(--rv2-primary),
    0 0 4px rgba(210, 187, 255, 0.3);
}
.rv2-decision-btns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.rv2-btn {
  display: inline-flex;
  align-items: center;
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
.rv2-btn-reject {
  background: var(--rv2-card);
  color: var(--rv2-error);
  border-color: rgba(239, 68, 68, 0.3);
}
.rv2-btn-reject:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
  border-color: var(--rv2-error);
}
.rv2-btn-approve {
  background: var(--rv2-primary-strong);
  color: #ede0ff;
  box-shadow: 0 4px 15px rgba(124, 58, 237, 0.3);
  position: relative;
  overflow: hidden;
}
.rv2-btn-approve:hover:not(:disabled) {
  background: #6d28d9;
  box-shadow: 0 6px 20px rgba(124, 58, 237, 0.45);
  transform: translateY(-1px);
}
.rv2-btn-rework {
  width: 100%;
  background: transparent;
  color: var(--rv2-warning);
  border-color: rgba(245, 158, 11, 0.3);
  font-size: 13px;
}
.rv2-btn-rework:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.08);
  border-color: var(--rv2-warning);
}

/* ── 评审进度（右栏） ── */
.rv2-progress-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rv2-progress-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}
.rv2-progress-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--rv2-fg);
}
.rv2-progress-nums {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
}
.rv2-progress-big {
  font-size: 24px;
  font-weight: 700;
  color: var(--rv2-primary);
  letter-spacing: -0.02em;
}
.rv2-progress-small {
  font-size: 13px;
  color: var(--rv2-fg-muted);
  opacity: 0.5;
}
.rv2-progress-track {
  height: 6px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
}
.rv2-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--rv2-primary-strong), var(--rv2-secondary-strong));
  border-radius: 9999px;
  box-shadow: 0 0 10px rgba(124, 58, 237, 0.4);
  transition: width 0.5s ease;
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
.rv2-timeline {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-left: 32px;
}
.rv2-timeline::before {
  content: '';
  position: absolute;
  left: 19px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: linear-gradient(to bottom, transparent, rgba(74, 68, 85, 0.3), transparent);
}
.rv2-timeline-item {
  position: relative;
  display: flex;
  gap: 12px;
}
.rv2-tl-dot {
  position: absolute;
  left: -32px;
  top: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--rv2-card-high);
  border: 2px solid var(--rv2-section);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--rv2-fg-muted);
  z-index: 1;
}
.rv2-tl-dot .material-symbols-outlined {
  font-size: 14px;
}
.rv2-tl-approved .rv2-tl-dot {
  color: var(--rv2-success);
  border-color: rgba(16, 185, 129, 0.3);
}
.rv2-tl-rejected .rv2-tl-dot {
  color: var(--rv2-error);
  border-color: rgba(239, 68, 68, 0.3);
}
.rv2-tl-needs-update .rv2-tl-dot {
  color: var(--rv2-warning);
  border-color: rgba(245, 158, 11, 0.3);
}
.rv2-tl-card {
  flex: 1;
  padding: 10px 12px;
  background: var(--rv2-card);
  border: 1px solid rgba(74, 68, 85, 0.1);
  border-radius: var(--rv2-radius-sm);
}
.rv2-tl-approved .rv2-tl-card {
  border-color: rgba(16, 185, 129, 0.2);
}
.rv2-tl-rejected .rv2-tl-card {
  border-color: rgba(239, 68, 68, 0.2);
}
.rv2-tl-needs-update .rv2-tl-card {
  border-color: rgba(245, 158, 11, 0.2);
}
.rv2-tl-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.rv2-tl-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--rv2-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  border: 1px solid rgba(74, 68, 85, 0.15);
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
