<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox, ElImageViewer } from 'element-plus'
import { CopyDocument, Delete, Edit, Search, Grid, List } from '@element-plus/icons-vue'
import StatusBadge from '../components/StatusBadge.vue'
import LevelBadge from '../components/LevelBadge.vue'

import FileUploader from '../components/FileUploader.vue'
import {
  globalModuleTree,
  globalModuleCaseCount,
  globalUnplannedCount,
  globalTotalCaseCount,
  globalSelectedModulePath,
  globalSelectedModuleId,
  globalTreeActions,
} from '../composables/useTestCaseTree'

import { useProjectStore } from '../stores/project'
import { useAuthStore } from '../stores/auth'
import {
  listTestCases,
  createTestCase,
  updateTestCase,
  deleteTestCase,
  batchDeleteTestCases,
  batchUpdateLevel,
  batchMoveTestCases,
  batchTagTestCases,
  cloneTestCase,
  listCaseHistory,
  listCaseActivities,
  discardTestCase,
  recoverTestCase,
  analyzeTestCase,
} from '../api/testcase'
import type { CaseActivity, AIAnalyzeResult } from '../api/testcase'
import { apiClient } from '../api/client'
import { uploadAttachment, listAttachments, deleteAttachment } from '../api/attachment'
import {
  listReviewAttachmentsByTestCase,
  downloadReviewAttachment,
  type CaseReviewAttachment,
} from '../api/caseReviewAttachment'
import { importTestCases, exportReport } from '../api/xlsx'
import { listTagOptions } from '../api/tag'
import type { TagBrief } from '../api/tag'
import { getModuleTree, createModule, renameModule, deleteModule } from '../api/module'
import type {
  TestCase,
  CaseAttachment,
  ModuleTreeNode as APIModuleTreeNode,
  CaseHistory,
} from '../api/types'
import type { ModuleTreeNodeWithPath } from '../composables/useTestCaseTree'
import { extractErrorMessage, isElMessageBoxCancel } from '../utils/error'

// ── Types ──

type TableRow = {
  id: number
  title: string
  level: string
  reviewResult: string
  inReview: boolean
  currentReviewId?: number
  currentReviewName?: string
  relatedReviewCount: number
  execResult: string
  moduleId: number
  modulePath: string
  tags: string
  precondition: string
  postcondition: string
  steps: string
  remark: string
  updatedBy: number
  updatedByName: string
  updatedByAvatar: string
  updatedAt: string
  createdBy: number
  createdByName: string
  createdByAvatar: string
  createdAt: string
  priority: string
  status: 'draft' | 'pending' | 'active' | 'discarded'
  version: string
  tagList: { id: number; name: string; color: string }[]
}

type StepRow = { action: string; expected: string }

// ── State ──

const projectStore = useProjectStore()
const authStore = useAuthStore()

const isAdminOrManager = computed(() => {
  const role = authStore.user?.role
  return role === 'admin' || role === 'owner' || role === 'manager'
})

const selectedProject = computed(() => projectStore.selectedProjectId)
const rows = ref<TableRow[]>([])
const treeRows = ref<TableRow[]>([]) // 独立的全量数据源，用于构建目录树（不受 module_path 过滤影响）
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const keyword = ref('')
const levelFilter = ref('')
const reviewFilter = ref('')
const execFilter = ref('')
const moduleIdFilter = ref<number | ''>('')
const tagsFilter = ref('')
const creatorFilter = ref('')
const updaterFilter = ref('')
const createdAfter = ref('')
const createdBefore = ref('')
const updatedAfter = ref('')
const updatedBefore = ref('')
const sortBy = ref<'id' | 'created_at' | 'updated_at'>('updated_at')
const sortOrder = ref<'asc' | 'desc'>('desc')
const appLoading = ref(false)
const loadError = ref('')
const filterPanelVisible = ref(false)

// View mode toggle: 'table' | 'kanban'
const viewMode = ref<'table' | 'kanban'>('table')

// Metric cards — computed from loaded data
const metricTotal = computed(() => total.value)
const isExecPass = (v: string) => ['已通过', '通过', '成功'].includes(v)
const isExecFail = (v: string) => ['不通过', '失败'].includes(v)
const isReviewPass = (v: string) => ['已通过', '通过'].includes(v)
const metricPassRate = computed(() => {
  if (rows.value.length === 0) return 0
  const passed = rows.value.filter((r) => isExecPass(r.execResult)).length
  return Math.round((passed / rows.value.length) * 100)
})

// Kanban grouped data
const kanbanColumns = computed(() => [
  {
    key: 'pending',
    label: '待评审',
    color: '#94a3b8',
    items: rows.value.filter((r) => !r.reviewResult || r.reviewResult === '未评审'),
  },
  {
    key: 'running',
    label: '进行中',
    color: '#06b6d4',
    items: rows.value.filter(
      (r) => isReviewPass(r.reviewResult) && (!r.execResult || r.execResult === '未执行'),
    ),
  },
  {
    key: 'passed',
    label: '已通过',
    color: '#10b981',
    items: rows.value.filter((r) => isExecPass(r.execResult)),
  },
  {
    key: 'failed',
    label: '已失败',
    color: '#ef4444',
    items: rows.value.filter((r) => isExecFail(r.execResult)),
  },
])

// Flat module paths for filter dropdown
type FlatModule = { id: number; name: string; path: string }
type CaseModuleSelectNode = {
  id: number
  label: string
  path: string
  depth: number
  caseCount: number
}
function collectModulePaths(
  nodes: APIModuleTreeNode[],
  paths: FlatModule[] = [],
  parentPath = '',
): FlatModule[] {
  for (const n of nodes) {
    const currentPath = parentPath + '/' + n.name
    paths.push({ id: n.id, name: n.name, path: currentPath })
    if (n.children?.length) collectModulePaths(n.children, paths, currentPath)
  }
  return paths
}
const flatModules = computed(() => collectModulePaths(moduleTreeRaw.value))

// Batch move
const batchMoveVisible = ref(false)
const batchMoveTargetId = ref<number>(0) // 0 表示“未规划用例”或“根目录”
const batchMoveTargetPath = ref('/未规划用例')

// Inline dropdown menu handler (Real API)
async function onNodeMenuCommand(cmd: string, path: string, name: string, id?: number) {
  if (!selectedProject.value) return

  if (cmd === 'rename' && id) {
    const result = await ElMessageBox.prompt('请输入新目录名称', '目录重命名', {
      inputValue: name,
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    }).catch(() => null)
    if (!result || !result.value?.trim()) return

    try {
      await renameModule(selectedProject.value, id, result.value.trim())
      ElMessage.success('重命名成功')
      await loadTreeData()
      await loadCases({ skipTree: true })
    } catch (e: unknown) {
      ElMessage.error(extractErrorMessage(e, '重命名失败'))
    }
  } else if (cmd === 'delete' && id) {
    try {
      await ElMessageBox.confirm('确认删除该目录？(仅限空目录)', '提示', { type: 'warning' })
      await deleteModule(selectedProject.value, id)
      ElMessage.success('删除成功')
      if (selectedModulePath.value === path) {
        selectedModulePath.value = ''
      }
      await loadTreeData()
      await loadCases({ skipTree: true })
    } catch (e: unknown) {
      if (isElMessageBoxCancel(e)) return
      ElMessage.error(extractErrorMessage(e, '删除失败'))
    }
  }
}

// Batch selection
const selectedIds = ref<number[]>([])
const selectAll = ref(false)
const moduleTreeRaw = ref<APIModuleTreeNode[]>([]) // 存储从 API 获取的原始树

const selectedModulePath = ref(
  (() => {
    try {
      const saved = localStorage.getItem(`tp-module-path-${selectedProject.value}`)
      return saved ?? ''
    } catch {
      return ''
    }
  })(),
) // '' = 全部, '/未规划用例' = 未规划, '/xxx' = 特定目录

const dialogVisible = ref(false)
const caseDrawerHydrated = ref(false)
const editingId = ref<number | null>(null)
const editingCaseRow = ref<TableRow | null>(null)
const saving = ref(false)
const stepRows = ref<StepRow[]>([{ action: '', expected: '' }])
const draggingStepIndex = ref<number | null>(null)
const directoryDialogVisible = ref(false)
const pageSizeOptions = [10, 20, 50]
const paginationStart = computed(() =>
  total.value === 0 ? 0 : (page.value - 1) * pageSize.value + 1,
)
const paginationEnd = computed(() => Math.min(page.value * pageSize.value, total.value))

// ── Priority Level Picker ──
const levelPickerOpen = ref(false)
const levelLabels: Record<string, string> = { P0: '核心', P1: '重点', P2: '一般', P3: '边界' }
const levelKeys = ['P0', 'P1', 'P2', 'P3'] as const
const modulePickerOpen = ref(false)
const modulePickerKeyword = ref('')
const modulePickerActiveIndex = ref(0)
const modulePickerSearchInput = ref<HTMLInputElement | null>(null)

const caseForm = reactive({
  title: '',
  level: 'P1',
  execResult: '未执行',
  modulePath: '/未规划用例',
  moduleId: 0,
  tags: '',
  precondition: '',
  postcondition: '',
  steps: '',
  remark: '',
  priority: 'medium',
})

// Attachments
const caseAttachments = ref<CaseAttachment[]>([])
const pendingAttachmentFiles = ref<File[]>([])
const reviewAttachments = ref<CaseReviewAttachment[]>([])
const reviewAttachmentsLoading = ref(false)
const caseHistory = ref<CaseHistory[]>([])
const caseActivities = ref<CaseActivity[]>([])
let caseDrawerHydrationTimer: ReturnType<typeof window.setTimeout> | null = null
let caseDrawerLoadSeq = 0

// ── AI Analyze ──
const aiAnalyzing = ref(false)
const aiResult = ref<AIAnalyzeResult | null>(null)
const aiError = ref('')

async function runAIAnalyze() {
  if (!selectedProject.value || !editingId.value) return
  aiAnalyzing.value = true
  aiResult.value = null
  aiError.value = ''
  try {
    aiResult.value = await analyzeTestCase(selectedProject.value, editingId.value)
  } catch (e: unknown) {
    aiError.value = extractErrorMessage(e, 'AI 分析失败，请稍后重试')
  } finally {
    aiAnalyzing.value = false
  }
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#4caf50'
  if (score >= 60) return '#ff9800'
  return '#f44336'
}

function formatCaseLifecycleStatus(status?: string): string {
  const statusMap: Record<string, string> = {
    draft: '草稿',
    pending: '待评审',
    active: '已生效',
    discarded: '已废弃',
  }
  return statusMap[status || 'draft'] || status || '草稿'
}

const currentUserDisplayName = computed(() => authStore.user?.name?.trim() || '当前用户')

function getMetaUserName(name?: string): string {
  const trimmed = (name || '').trim()
  if (trimmed && trimmed !== '-' && trimmed !== '?') return trimmed
  return currentUserDisplayName.value
}

function getMetaUserAvatarUrl(avatar?: string, name?: string): string {
  const raw = (avatar || '').trim()
  if (raw) return authStore.resolveAvatarUrl(raw, name)
  if (authStore.user?.avatar)
    return authStore.resolveAvatarUrl(authStore.user.avatar, currentUserDisplayName.value)
  const trimmed = (name || '').trim()
  if (trimmed && trimmed !== '-' && trimmed !== '?') return authStore.fallbackAvatarUrl(trimmed)
  return authStore.avatarUrl
}

// ── Tags ──
const projectTagOptions = ref<TagBrief[]>([])
const selectedTagIds = ref<number[]>([])
async function loadTagOptions() {
  if (!selectedProject.value) {
    projectTagOptions.value = []
    return
  }
  try {
    const resp = await listTagOptions(selectedProject.value)
    projectTagOptions.value = Array.isArray(resp) ? resp : []
  } catch {
    projectTagOptions.value = []
  }
}

const directoryForm = reactive({ parentPath: '/', parentId: 0, name: '' })

// ── Computed ──

const activeFilterChips = computed(() => {
  const chips: Array<{
    key: 'keyword' | 'level' | 'review' | 'exec'
    label: string
    value: string
  }> = []
  if (keyword.value.trim())
    chips.push({ key: 'keyword', label: '关键字', value: keyword.value.trim() })
  if (levelFilter.value) chips.push({ key: 'level', label: '等级', value: levelFilter.value })
  if (reviewFilter.value) chips.push({ key: 'review', label: '评审', value: reviewFilter.value })
  if (execFilter.value) chips.push({ key: 'exec', label: '执行', value: execFilter.value })
  return chips
})

// 辅助函数：递归处理 API 返回的树节点，为其补全 path 字段并收集计数
function processApiTree(
  nodes: APIModuleTreeNode[] | null | undefined,
  parentPath = '',
): ModuleTreeNodeWithPath[] {
  if (!nodes || !Array.isArray(nodes)) return []
  return nodes.map<ModuleTreeNodeWithPath>((n) => ({
    ...n,
    path: parentPath + '/' + n.name,
    children: n.children ? processApiTree(n.children, parentPath + '/' + n.name) : [],
  }))
}

const moduleTree = computed(() => processApiTree(moduleTreeRaw.value))

function buildCaseModuleSelectOptions(
  nodes: ModuleTreeNodeWithPath[],
  options: CaseModuleSelectNode[] = [],
  depth = 0,
): CaseModuleSelectNode[] {
  for (const node of nodes) {
    options.push({
      id: node.id,
      label: node.name,
      path: node.path,
      depth,
      caseCount: node.case_count || 0,
    })
    if (node.children?.length) buildCaseModuleSelectOptions(node.children, options, depth + 1)
  }
  return options
}

const caseModuleSelectOptions = computed<CaseModuleSelectNode[]>(() => [
  {
    id: 0,
    label: '未规划用例',
    path: '/未规划用例',
    depth: 0,
    caseCount: unplannedCount.value,
  },
  ...buildCaseModuleSelectOptions(moduleTree.value),
])

const selectedCaseModuleOption = computed<CaseModuleSelectNode>(() => {
  const found = caseModuleSelectOptions.value.find((option) => option.id === caseForm.moduleId)
  return (
    found ?? {
      id: 0,
      label: '未规划用例',
      path: '/未规划用例',
      depth: 0,
      caseCount: unplannedCount.value,
    }
  )
})

const filteredCaseModuleOptions = computed(() => {
  const keyword = modulePickerKeyword.value.trim().toLowerCase()
  if (!keyword) return caseModuleSelectOptions.value
  return caseModuleSelectOptions.value.filter((option) => {
    return `${option.label} ${option.path}`.toLowerCase().includes(keyword)
  })
})

function formatModuleDisplayPath(path: string) {
  const normalized = path.replace(/^\/+/, '').replace(/\//g, ' / ')
  return normalized || '未规划用例'
}

function formatModuleParentPath(path: string) {
  const segments = path.split('/').filter(Boolean)
  if (segments.length <= 1) return '根目录'
  return segments.slice(0, -1).join(' / ')
}

function formatModuleTriggerMeta(option: CaseModuleSelectNode) {
  if (option.id === 0) return '系统默认目录'
  return `路径：${formatModuleDisplayPath(option.path)}`
}

function formatModuleOptionMeta(option: CaseModuleSelectNode) {
  if (option.id === 0) return '系统默认目录'
  return `上级：${formatModuleParentPath(option.path)}`
}

watch(modulePickerKeyword, () => {
  modulePickerActiveIndex.value = 0
})

function openModulePicker() {
  levelPickerOpen.value = false
  modulePickerOpen.value = true
  modulePickerKeyword.value = ''
  const selectedIndex = caseModuleSelectOptions.value.findIndex(
    (option) => option.id === caseForm.moduleId,
  )
  modulePickerActiveIndex.value = Math.max(selectedIndex, 0)
  nextTick(() => {
    modulePickerSearchInput.value?.focus()
    document.querySelector('.module-picker-option.is-active')?.scrollIntoView({ block: 'nearest' })
  })
}

function closeModulePicker() {
  modulePickerOpen.value = false
  modulePickerKeyword.value = ''
  modulePickerActiveIndex.value = 0
}

function selectCaseModuleOption(option: CaseModuleSelectNode) {
  caseForm.moduleId = option.id
  caseForm.modulePath = option.path
  closeModulePicker()
}

function moveModulePickerActive(step: number) {
  const optionCount = filteredCaseModuleOptions.value.length
  if (optionCount === 0) return
  modulePickerActiveIndex.value = (modulePickerActiveIndex.value + step + optionCount) % optionCount
  nextTick(() => {
    document.querySelector('.module-picker-option.is-active')?.scrollIntoView({ block: 'nearest' })
  })
}

function selectActiveCaseModuleOption() {
  const option = filteredCaseModuleOptions.value[modulePickerActiveIndex.value]
  if (option) selectCaseModuleOption(option)
}

const moduleCaseCount = computed(() => {
  const counts: Record<string, number> = {}
  const traverse = (nodes: ModuleTreeNodeWithPath[]) => {
    for (const n of nodes) {
      counts[n.path] = n.case_count
      if (n.children) traverse(n.children)
    }
  }
  traverse(moduleTree.value)
  return counts
})

const unplannedCount = ref(0)

function onModuleClick(path: string, id: number = 0) {
  if (globalSelectedModulePath.value === path) {
    globalSelectedModulePath.value = ''
    globalSelectedModuleId.value = 0
  } else {
    globalSelectedModulePath.value = path
    globalSelectedModuleId.value = id
  }
  try {
    localStorage.setItem(`tp-module-path-${selectedProject.value}`, globalSelectedModulePath.value)
  } catch {}
  page.value = 1
}

// Bind to global test case tree state
watch(
  moduleTree,
  (val) => {
    globalModuleTree.value = val
  },
  { immediate: true },
)

watch(
  moduleCaseCount,
  (val) => {
    globalModuleCaseCount.value = val
  },
  { immediate: true },
)

watch(
  unplannedCount,
  (val) => {
    globalUnplannedCount.value = val
  },
  { immediate: true },
)

watch(globalSelectedModulePath, () => {
  page.value = 1
  loadCases({ skipTree: true })
})

/** 监听批量移动的目标目录 ID，同步更新路径名 */
watch(batchMoveTargetId, (newId) => {
  if (newId === 0) {
    batchMoveTargetPath.value = '/未规划用例'
  } else {
    const found = flatModules.value.find((m) => m.id === newId)
    if (found) {
      batchMoveTargetPath.value = found.path
    }
  }
})

globalTreeActions.onModuleClick = (path: string, id?: number) => onModuleClick(path, id || 0)
globalTreeActions.openCreateDirectory = () => {
  directoryForm.parentId = 0
  directoryForm.name = ''
  directoryDialogVisible.value = true
}
globalTreeActions.onAddRootModule = () => {
  directoryForm.parentId = 0
  directoryForm.name = ''
  directoryDialogVisible.value = true
}
globalTreeActions.onNodeMenuCommand = (cmd, path, name, id) => {
  if (cmd === 'add') {
    directoryForm.parentId = id || 0
    directoryForm.name = ''
    directoryDialogVisible.value = true
  } else {
    onNodeMenuCommand(cmd, path, name, id)
  }
}

// ── Helpers ──

function formatTime(value?: string) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function normalizeReviewResult(tc: TestCase) {
  const result = tc.review_result || '未评审'
  if ((tc.in_review || tc.current_review_id) && result === '未评审') return '待评审'
  return result
}

function toRow(tc: TestCase): TableRow {
  return {
    id: tc.id,
    title: tc.title,
    level: tc.level,
    reviewResult: normalizeReviewResult(tc),
    inReview: tc.in_review || false,
    currentReviewId: tc.current_review_id || undefined,
    currentReviewName: tc.current_review_name || '',
    relatedReviewCount: tc.related_review_count || 0,
    execResult: tc.exec_result,
    moduleId: tc.module_id,
    modulePath: tc.module_path,
    tags: tc.tags,
    precondition: tc.precondition || '',
    postcondition: tc.postcondition || '',
    steps: tc.steps,
    remark: tc.remark || '',
    updatedBy: tc.updated_by,
    updatedByName: tc.updated_by_name || '-',
    updatedByAvatar: tc.updated_by_avatar || '',
    updatedAt: formatTime(tc.updated_at),
    createdBy: tc.created_by,
    createdByName: tc.created_by_name || '-',
    createdByAvatar: tc.created_by_avatar || '',
    createdAt: formatTime(tc.created_at),
    priority: tc.priority,
    status: tc.status || 'draft',
    version: tc.version || 'V1',
    tagList: tc.tag_list || [],
  }
}

function parseStepsToRows(text: string): StepRow[] {
  const raw = (text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  if (raw.length === 0) return [{ action: '', expected: '' }]
  const result = raw.map((line) => {
    const parts = line.split('|')
    if (parts.length >= 2)
      return { action: (parts[0] ?? '').trim(), expected: parts.slice(1).join('|').trim() }
    return { action: line, expected: '' }
  })
  return result.length > 0 ? result : [{ action: '', expected: '' }]
}

function rowsToStepsText(rows: StepRow[]): string {
  return rows
    .map((r) => ({ action: (r.action || '').trim(), expected: (r.expected || '').trim() }))
    .filter((r) => r.action || r.expected)
    .map((r) => `${r.action} | ${r.expected}`)
    .join('\n')
}

// ── Data Loading ──

/** 加载树结构数据（正式 API 驱动） */
async function loadTreeData() {
  if (!selectedProject.value) {
    moduleTreeRaw.value = []
    return
  }
  try {
    const res = await getModuleTree(selectedProject.value)

    // 兼容逻辑：后端 / interceptor 可能返回以下三种形态之一：
    //   - 纯数组：直接是 ModuleTreeNode[]
    //   - 对象带 tree 字段：{ tree: [...], counts, unplannedCount }
    //   - 对象带 data 字段：{ data: [...], counts, unplannedCount }（旧版 API 声明形态）
    type TreeResponseShape = {
      tree?: APIModuleTreeNode[]
      data?: APIModuleTreeNode[]
      counts?: Record<string, number>
      unplannedCount?: number
    }
    const resp = res as TreeResponseShape | APIModuleTreeNode[] | undefined
    const rawData: APIModuleTreeNode[] = Array.isArray(resp)
      ? resp
      : Array.isArray(resp?.tree)
        ? resp.tree
        : Array.isArray(resp?.data)
          ? resp.data
          : []
    const counts: Record<string, number> = resp && !Array.isArray(resp) ? resp.counts || {} : {}
    const unplanned: number = resp && !Array.isArray(resp) ? resp.unplannedCount || 0 : 0
    moduleTreeRaw.value = rawData

    // 同步到全局状态供 Sidebar 使用
    globalModuleTree.value = processApiTree(rawData)
    globalModuleCaseCount.value = counts
    globalUnplannedCount.value = unplanned
    // 计算全部用例总数：顶层目录累计 + 未规划
    const rootTotal = globalModuleTree.value.reduce((sum, node) => sum + (node.case_count || 0), 0)
    globalTotalCaseCount.value = rootTotal + unplanned
  } catch (e) {
    console.error('Failed to load tree:', e)
  }
}

async function loadCases(opts?: { skipTree?: boolean }) {
  loadError.value = ''
  if (!selectedProject.value) {
    rows.value = []
    total.value = 0
    page.value = 1
    treeRows.value = []
    return
  }
  appLoading.value = true
  try {
    // 中文注释：目录树点击使用 module_path 做前缀筛选，父目录需要能覆盖全部子目录用例；
    // 顶部“所属模块”下拉仍保留 module_id 精确筛选能力，两者并存时以下拉精确筛选优先。
    const exactModuleId = moduleIdFilter.value || undefined
    const treeModulePath = globalSelectedModulePath.value || undefined
    const data = await listTestCases(selectedProject.value, {
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
      level: levelFilter.value || undefined,
      review_result: reviewFilter.value || undefined,
      exec_result: execFilter.value || undefined,
      tags: tagsFilter.value || undefined,
      created_by: creatorFilter.value ? Number(creatorFilter.value) : undefined,
      updated_by: updaterFilter.value ? Number(updaterFilter.value) : undefined,
      created_after: createdAfter.value || undefined,
      created_before: createdBefore.value || undefined,
      updated_after: updatedAfter.value || undefined,
      updated_before: updatedBefore.value || undefined,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      module_id: exactModuleId,
      module_path: exactModuleId ? undefined : treeModulePath,
    })
    const items = Array.isArray(data.items) ? data.items : []
    rows.value = items.map(toRow)
    total.value = Number(data.total) || 0
    page.value = Number(data.page) || 1
    selectedIds.value = []
    selectAll.value = false
    pageSize.value = Number(data.pageSize) || pageSize.value
    // 仅在非纯目录切换时刷新树数据
    if (!opts?.skipTree) {
      await loadTreeData()
    }
  } catch (e: unknown) {
    loadError.value = extractErrorMessage(e, '加载用例失败，请重试')
    ElMessage.error(loadError.value)
  } finally {
    appLoading.value = false
  }
}

// ── Filters & Pagination ──

function onSearch() {
  page.value = 1
  loadCases()
}
function onResetSearch() {
  keyword.value = ''
  levelFilter.value = ''
  reviewFilter.value = ''
  execFilter.value = ''
  tagsFilter.value = ''
  creatorFilter.value = ''
  updaterFilter.value = ''
  createdAfter.value = ''
  createdBefore.value = ''
  updatedAfter.value = ''
  updatedBefore.value = ''
  page.value = 1
  loadCases()
}
function onPaginationSizeChange(size: number) {
  pageSize.value = size
  page.value = 1
  loadCases()
}
function onPaginationCurrentChange(current: number) {
  page.value = current
  loadCases()
}
function toggleSort(field: 'id' | 'created_at' | 'updated_at') {
  if (sortBy.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = field
    sortOrder.value = 'desc'
  }
  page.value = 1
  loadCases()
}
function clearOneFilter(kind: 'keyword' | 'level' | 'review' | 'exec') {
  if (kind === 'keyword') keyword.value = ''
  if (kind === 'level') levelFilter.value = ''
  if (kind === 'review') reviewFilter.value = ''
  if (kind === 'exec') execFilter.value = ''
  page.value = 1
  loadCases()
}
function applyAdvancedFilters() {
  filterPanelVisible.value = false
  page.value = 1
  loadCases()
}

// ── CRUD ──

function cancelCaseDrawerHydration() {
  if (caseDrawerHydrationTimer !== null) {
    window.clearTimeout(caseDrawerHydrationTimer)
    caseDrawerHydrationTimer = null
  }
}

function scheduleCaseDrawerHydration(options: { loadTags: boolean }) {
  cancelCaseDrawerHydration()
  caseDrawerHydrated.value = false
  caseDrawerHydrationTimer = window.setTimeout(() => {
    caseDrawerHydrated.value = true
    if (options.loadTags) {
      void loadTagOptions()
    }
    caseDrawerHydrationTimer = null
  }, 160)
}

function onCaseDrawerClosed() {
  cancelCaseDrawerHydration()
  caseDrawerHydrated.value = false
  pendingAttachmentFiles.value = []
  levelPickerOpen.value = false
  closeModulePicker()
}

function isCurrentCaseDrawerLoad(seq: number, caseId: number) {
  return seq === caseDrawerLoadSeq && dialogVisible.value && editingId.value === caseId
}

function openCreate() {
  caseDrawerLoadSeq += 1
  editingId.value = null
  editingCaseRow.value = null
  aiResult.value = null
  aiError.value = ''
  aiAnalyzing.value = false
  Object.assign(caseForm, {
    title: '',
    level: 'P1',
    execResult: '未执行',
    modulePath: '/未规划用例',
    moduleId: 0,
    tags: '',
    precondition: '',
    postcondition: '',
    steps: '',
    remark: '',
    priority: 'medium',
  })
  stepRows.value = [{ action: '', expected: '' }]
  caseAttachments.value = []
  pendingAttachmentFiles.value = []
  reviewAttachments.value = []
  caseActivities.value = []
  selectedTagIds.value = []
  dialogVisible.value = true
  scheduleCaseDrawerHydration({ loadTags: true })
}

async function openEdit(row: TableRow) {
  const loadSeq = caseDrawerLoadSeq + 1
  caseDrawerLoadSeq = loadSeq
  editingId.value = row.id
  editingCaseRow.value = row
  aiResult.value = null
  aiError.value = ''
  aiAnalyzing.value = false
  Object.assign(caseForm, {
    title: row.title,
    level: row.level || 'P1',
    execResult: row.execResult || '未执行',
    modulePath: row.modulePath || '/未规划用例',
    moduleId: row.moduleId || 0,
    tags: row.tags || '',
    precondition: row.precondition || '',
    postcondition: row.postcondition || '',
    steps: row.steps,
    remark: row.remark || '',
    priority: row.priority || 'medium',
  })
  stepRows.value = parseStepsToRows(row.steps)
  selectedTagIds.value = row.tagList.map((t) => t.id)
  caseAttachments.value = []
  pendingAttachmentFiles.value = []
  reviewAttachments.value = []
  caseHistory.value = []
  caseActivities.value = []
  dialogVisible.value = true
  scheduleCaseDrawerHydration({ loadTags: true })
  if (selectedProject.value && row.id) {
    try {
      const resp = await listAttachments(selectedProject.value, row.id)
      if (!isCurrentCaseDrawerLoad(loadSeq, row.id)) return
      caseAttachments.value = Array.isArray(resp) ? resp : []
    } catch {
      if (!isCurrentCaseDrawerLoad(loadSeq, row.id)) return
      caseAttachments.value = []
    }
    // Load review attachments (read-only evidences)
    reviewAttachmentsLoading.value = true
    try {
      reviewAttachments.value = await listReviewAttachmentsByTestCase(selectedProject.value, row.id)
    } catch {
      if (!isCurrentCaseDrawerLoad(loadSeq, row.id)) return
      reviewAttachments.value = []
    } finally {
      if (isCurrentCaseDrawerLoad(loadSeq, row.id)) {
        reviewAttachmentsLoading.value = false
      }
    }
    // Load history
    try {
      const resp = await listCaseHistory(selectedProject.value, row.id)
      if (!isCurrentCaseDrawerLoad(loadSeq, row.id)) return
      const typedResp = resp as { items?: CaseHistory[] } | CaseHistory[] | undefined
      const items = Array.isArray(typedResp) ? typedResp : typedResp?.items || []
      caseHistory.value = items
    } catch {
      if (!isCurrentCaseDrawerLoad(loadSeq, row.id)) return
      caseHistory.value = []
    }
    // Load activities
    try {
      caseActivities.value = await listCaseActivities(selectedProject.value, row.id)
    } catch {
      if (!isCurrentCaseDrawerLoad(loadSeq, row.id)) return
      caseActivities.value = []
    }
  }
}

async function submitCase() {
  if (!selectedProject.value) return
  if (!caseForm.title.trim()) {
    ElMessage.warning('用例名称不能为空')
    return
  }
  saving.value = true
  try {
    const projectId = selectedProject.value
    const wasEditing = Boolean(editingId.value)
    let savedCaseId = editingId.value
    const stepsText = rowsToStepsText(stepRows.value)
    const payload = {
      title: caseForm.title.trim(),
      level: caseForm.level,
      exec_result: caseForm.execResult,
      module_path: caseForm.modulePath.trim(),
      module_id: caseForm.moduleId || 0,
      tags: caseForm.tags.trim(),
      tag_ids: selectedTagIds.value,
      precondition: caseForm.precondition,
      postcondition: caseForm.postcondition,
      steps: stepsText,
      remark: caseForm.remark,
      priority: caseForm.priority,
    }
    if (savedCaseId) {
      await updateTestCase(projectId, savedCaseId, payload)
    } else {
      const created = await createTestCase(projectId, payload)
      savedCaseId = created.id
      editingId.value = created.id
      page.value = 1
    }
    if (savedCaseId) {
      const uploadResult = await uploadPendingAttachments(projectId, savedCaseId)
      if (uploadResult.failed > 0) {
        ElMessage.warning(`用例已保存，${uploadResult.failed} 个附件上传失败，可在当前页面重试`)
        await loadCases()
        return
      }
      const uploadText = uploadResult.uploaded > 0 ? `，已上传 ${uploadResult.uploaded} 个附件` : ''
      ElMessage.success(`${wasEditing ? '修改成功' : '新增成功'}${uploadText}`)
    }
    dialogVisible.value = false
    await loadCases()
  } catch (e: unknown) {
    ElMessage.error(extractErrorMessage(e, '保存失败'))
  } finally {
    saving.value = false
  }
}

// ── Batch Operations ──

function toggleSelectAll() {
  if (selectAll.value) {
    selectedIds.value = rows.value.map((r) => r.id)
  } else {
    selectedIds.value = []
  }
}

function toggleSelectRow(id: number) {
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
  selectAll.value = selectedIds.value.length === rows.value.length
}

async function onBatchDelete() {
  if (!selectedProject.value || selectedIds.value.length === 0) return
  const nonDraftCount = rows.value.filter(
    (r) => selectedIds.value.includes(r.id) && r.status !== 'draft',
  ).length
  const draftCount = selectedIds.value.length - nonDraftCount
  if (draftCount === 0) {
    ElMessage.warning(`选中的 ${selectedIds.value.length} 条用例均为非草稿状态，无法删除`)
    return
  }
  const msg =
    nonDraftCount > 0
      ? `选中 ${selectedIds.value.length} 条用例，其中 ${nonDraftCount} 条为非草稿状态将被跳过，实际删除 ${draftCount} 条。确认继续？`
      : `确认批量删除 ${draftCount} 条用例？`
  try {
    await ElMessageBox.confirm(msg, '批量删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    const res = await batchDeleteTestCases(selectedProject.value, selectedIds.value)
    const deleted = res?.deleted ?? 0
    const skipped = res?.skipped ?? 0
    if (skipped > 0) {
      ElMessage.success(`已删除 ${deleted} 条，${skipped} 条非草稿用例已跳过`)
    } else {
      ElMessage.success(`已删除 ${deleted} 条用例`)
    }
    selectedIds.value = []
    selectAll.value = false
    await loadCases()
  } catch (e: unknown) {
    ElMessage.error(extractErrorMessage(e, '批量删除失败'))
  }
}

async function onBatchUpdateLevel(level: string) {
  if (!selectedProject.value || selectedIds.value.length === 0) return
  try {
    await batchUpdateLevel(selectedProject.value, selectedIds.value, level)
    ElMessage.success(`已修改 ${selectedIds.value.length} 条用例等级为 ${level}`)
    selectedIds.value = []
    selectAll.value = false
    await loadCases()
  } catch (e: unknown) {
    ElMessage.error(extractErrorMessage(e, '批量修改失败'))
  }
}

async function onBatchMove() {
  if (!selectedProject.value || selectedIds.value.length === 0) return
  try {
    await batchMoveTestCases(
      selectedProject.value,
      selectedIds.value,
      batchMoveTargetId.value,
      batchMoveTargetPath.value,
    )
    ElMessage.success(`已移动 ${selectedIds.value.length} 条用例`)
    selectedIds.value = []
    selectAll.value = false
    batchMoveVisible.value = false
    await loadCases()
  } catch (e: unknown) {
    ElMessage.error(extractErrorMessage(e, '批量移动失败'))
  }
}

function openBatchMoveDialog() {
  batchMoveTargetId.value = 0
  batchMoveTargetPath.value = '/未规划用例'
  batchMoveVisible.value = true
}

function clearBatchSelection() {
  selectedIds.value = []
  selectAll.value = false
}

// ── 批量打标签 ──
const batchTagVisible = ref(false)
const batchTagSelectedIds = ref<number[]>([])

function openBatchTagDialog() {
  batchTagSelectedIds.value = []
  loadTagOptions()
  batchTagVisible.value = true
}

async function onBatchTagConfirm() {
  if (!selectedProject.value || selectedIds.value.length === 0) return
  if (batchTagSelectedIds.value.length === 0) {
    ElMessage.warning('请至少选择一个标签')
    return
  }
  try {
    await batchTagTestCases(selectedProject.value, selectedIds.value, batchTagSelectedIds.value)
    ElMessage.success(`已为 ${selectedIds.value.length} 条用例打标签`)
    batchTagVisible.value = false
    clearBatchSelection()
    loadCases()
  } catch (e: unknown) {
    ElMessage.error(extractErrorMessage(e, '批量打标签失败'))
  }
}

function handleToggleSelectAll() {
  selectAll.value = !selectAll.value
  toggleSelectAll()
}

function selectCaseLevel(level: string) {
  caseForm.level = level
  levelPickerOpen.value = false
  closeModulePicker()
}

async function onCloneCase(row: TableRow) {
  if (!selectedProject.value) return
  try {
    await cloneTestCase(selectedProject.value, row.id)
    ElMessage.success('复制成功')
    await loadCases()
  } catch (e: unknown) {
    ElMessage.error(extractErrorMessage(e, '复制失败'))
  }
}

async function onDiscard(row: TableRow) {
  if (!selectedProject.value) return
  try {
    await ElMessageBox.confirm(`确认废弃用例【${row.title}】？废弃后将不可直接编辑。`, '废弃确认', {
      confirmButtonText: '废弃',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await discardTestCase(selectedProject.value, row.id)
    ElMessage.success('已废弃')
    await loadCases()
  } catch (e: unknown) {
    if (isElMessageBoxCancel(e)) return
    ElMessage.error(extractErrorMessage(e, '操作失败'))
  }
}

async function onRecover(row: TableRow) {
  if (!selectedProject.value) return
  try {
    await recoverTestCase(selectedProject.value, row.id)
    ElMessage.success('已恢复为草稿')
    await loadCases()
  } catch (e: unknown) {
    ElMessage.error(extractErrorMessage(e, '恢复失败'))
  }
}

function copyIdToClipboard(id: number) {
  navigator.clipboard.writeText(String(id))
  ElMessage.success(`ID ${id} 已复制`)
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin}分钟前`
  if (diffHr < 24) return `${diffHr}小时前`
  if (diffDay < 7) return `${diffDay}天前`
  return dateStr.substring(0, 10)
}

function formatAbsoluteTime(dateStr: string): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// ── Attachments ──

const apiBaseUrl = apiClient.defaults.baseURL || '/api/v1'
const serverUrl = apiBaseUrl.replace(/\/api\/v1\/?$/, '')

function onAvatarLoadError(event: Event, name?: string) {
  authStore.handleAvatarError(event, name)
}

function getAttachmentUrl(file: CaseAttachment) {
  let path = (file.file_path || '').replace(/\\/g, '/')
  if (!path.startsWith('/')) {
    path = '/' + path
  }
  if (!path.startsWith('/uploads/')) {
    path = '/uploads' + path
  }
  return `${serverUrl}${path}`
}

function isImageAttachment(file: CaseAttachment) {
  if (file.mime_type && file.mime_type.startsWith('image/')) return true
  const ext = (file.file_name || '').split('.').pop()?.toLowerCase() || ''
  return ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)
}

function getFileIconName(filename: string) {
  const ext = (filename || '').split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    pdf: 'picture_as_pdf',
    doc: 'description',
    docx: 'description',
    txt: 'description',
    md: 'description',
    xls: 'table_view',
    xlsx: 'table_view',
    csv: 'table_view',
    zip: 'folder_zip',
    rar: 'folder_zip',
    '7z': 'folder_zip',
  }
  return map[ext] || 'draft'
}

function getPendingFilePreviewUrl(file: File) {
  return URL.createObjectURL(file)
}

async function onUploadAttachment(file: File) {
  if (!selectedProject.value) {
    return
  }
  if (!editingId.value) {
    pendingAttachmentFiles.value.push(file)
    ElMessage.success('已添加到待上传列表，保存用例后自动上传')
    return
  }
  try {
    const att = await uploadAttachment(selectedProject.value, editingId.value, file)
    if (att) caseAttachments.value.push(att)
    ElMessage.success('附件上传成功')
  } catch (e: unknown) {
    ElMessage.error(extractErrorMessage(e, '上传失败'))
  }
}

function onRemovePendingAttachment(file: File) {
  const index = pendingAttachmentFiles.value.indexOf(file)
  if (index < 0) return
  pendingAttachmentFiles.value.splice(index, 1)
}

async function uploadPendingAttachments(projectId: number, testcaseId: number) {
  const files = [...pendingAttachmentFiles.value]
  let uploaded = 0
  let failed = 0
  for (const file of files) {
    try {
      const att = await uploadAttachment(projectId, testcaseId, file)
      if (att) {
        caseAttachments.value.push(att)
        uploaded += 1
        onRemovePendingAttachment(file)
      }
    } catch {
      failed += 1
    }
  }
  return { uploaded, failed }
}

async function onRemoveAttachment(id: number) {
  if (!selectedProject.value) return
  try {
    await deleteAttachment(selectedProject.value, id)
    caseAttachments.value = caseAttachments.value.filter((a) => a.id !== id)
    ElMessage.success('附件已删除')
  } catch (e: unknown) {
    ElMessage.error(extractErrorMessage(e, '删除附件失败'))
  }
}

// ── Image Preview ──

const showImageViewer = ref(false)
const previewImages = ref<string[]>([])
const previewIndex = ref(0)

function openImagePreview(att: CaseAttachment) {
  const imageAttachments = caseAttachments.value.filter((a) => isImageAttachment(a))
  previewImages.value = imageAttachments.map((a) => getAttachmentUrl(a))
  const idx = imageAttachments.findIndex((a) => a.id === att.id)
  previewIndex.value = idx >= 0 ? idx : 0
  showImageViewer.value = true
}

async function downloadAttachment(file: CaseAttachment) {
  if (!selectedProject.value || !file.id) return
  try {
    const resp = await apiClient.get(
      `/projects/${selectedProject.value}/attachments/${file.id}/download`,
      { responseType: 'blob' },
    )
    const blob = new Blob([resp.data])
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.file_name || 'download'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error('下载失败')
  }
}

// ── Review attachments (read-only evidences) ──

function formatReviewAttSize(size: number) {
  if (!size) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

function formatReviewAttDate(dateStr?: string) {
  if (!dateStr) return ''
  return dateStr.replace('T', ' ').substring(0, 16)
}

async function downloadReviewAtt(att: CaseReviewAttachment) {
  if (!selectedProject.value) return
  try {
    const blob = await downloadReviewAttachment(selectedProject.value, att.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = att.file_name || 'download'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error('下载失败')
  }
}

// ── Import / Export ──

async function onExportReport() {
  if (!selectedProject.value) {
    ElMessage.warning('请先选择项目')
    return
  }
  try {
    appLoading.value = true
    const exactModuleId = moduleIdFilter.value || undefined
    const treeModulePath = globalSelectedModulePath.value || undefined
    await exportReport(selectedProject.value, {
      keyword: keyword.value.trim() || undefined,
      level: levelFilter.value || undefined,
      review_result: reviewFilter.value || undefined,
      exec_result: execFilter.value || undefined,
      tags: tagsFilter.value || undefined,
      created_by: creatorFilter.value ? Number(creatorFilter.value) : undefined,
      updated_by: updaterFilter.value ? Number(updaterFilter.value) : undefined,
      created_after: createdAfter.value || undefined,
      created_before: createdBefore.value || undefined,
      updated_after: updatedAfter.value || undefined,
      updated_before: updatedBefore.value || undefined,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      module_id: exactModuleId,
      module_path: exactModuleId ? undefined : treeModulePath,
    })
    ElMessage.success('导出成功')
  } catch (e: unknown) {
    ElMessage.error(extractErrorMessage(e, '导出报表失败'))
  } finally {
    appLoading.value = false
  }
}

async function onImportXlsx(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length || !selectedProject.value) return
  const file = input.files[0]
  if (!file) return
  input.value = ''
  try {
    appLoading.value = true
    const resp = await importTestCases(selectedProject.value, file)
    const typedResp = resp as { created?: number; skipped?: number } | undefined
    const created = typedResp?.created || 0
    const skipped = typedResp?.skipped || 0
    ElMessage.success(`导入完成：成功 ${created} 条，跳过 ${skipped} 条`)
    await loadCases()
  } catch (e: unknown) {
    ElMessage.error(extractErrorMessage(e, '导入失败'))
  } finally {
    appLoading.value = false
  }
}

async function onDelete(row: TableRow) {
  if (!selectedProject.value) return
  if (row.status !== 'draft') {
    ElMessage.warning('仅草稿状态的用例可以删除')
    return
  }
  try {
    await ElMessageBox.confirm(`确认删除用例【${row.title}】？`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await deleteTestCase(selectedProject.value, row.id)
    ElMessage.success('删除成功')
    const maxAfterDelete = Math.max(1, Math.ceil((total.value - 1) / pageSize.value))
    if (page.value > maxAfterDelete) page.value = maxAfterDelete
    await loadCases()
  } catch (e: unknown) {
    ElMessage.error(extractErrorMessage(e, '删除失败'))
  }
}

// ── Directory ──

async function submitDirectory() {
  if (!selectedProject.value) return
  const name = directoryForm.name.trim()
  if (!name) {
    ElMessage.warning('目录名称不能为空')
    return
  }
  if (!/^[\u4e00-\u9fa5A-Za-z0-9_-]+$/.test(name)) {
    ElMessage.warning('目录名称仅支持中文、英文、数字、下划线、中划线')
    return
  }

  try {
    await createModule(selectedProject.value, directoryForm.parentId, name)
    ElMessage.success('创建成功')
    directoryDialogVisible.value = false
    await loadTreeData()
  } catch (e: unknown) {
    ElMessage.error(extractErrorMessage(e, '创建失败'))
  }
}

// ── Steps ──

function addStepRow() {
  stepRows.value.push({ action: '', expected: '' })
}
function removeStepRow(index: number) {
  if (stepRows.value.length <= 1) {
    stepRows.value = [{ action: '', expected: '' }]
    return
  }
  stepRows.value.splice(index, 1)
}
function copyStepRow(index: number) {
  const src = stepRows.value[index]
  if (!src) return
  stepRows.value.splice(index + 1, 0, { action: src.action, expected: src.expected })
}
function insertStepAbove(index: number) {
  stepRows.value.splice(index, 0, { action: '', expected: '' })
}
function insertStepBelow(index: number) {
  stepRows.value.splice(index + 1, 0, { action: '', expected: '' })
}
function onStepMenuCommand(cmd: string, index: number) {
  switch (cmd) {
    case 'copy':
      copyStepRow(index)
      break
    case 'insertAbove':
      insertStepAbove(index)
      break
    case 'insertBelow':
      insertStepBelow(index)
      break
    case 'delete':
      removeStepRow(index)
      break
  }
}

function onStepDragStart(index: number) {
  draggingStepIndex.value = index
}
function onStepDrop(targetIndex: number) {
  const from = draggingStepIndex.value
  if (from === null || from === targetIndex) {
    draggingStepIndex.value = null
    return
  }
  const arr = stepRows.value
  const item = arr[from]
  if (!item) {
    draggingStepIndex.value = null
    return
  }
  arr.splice(from, 1)
  const insertAt = from < targetIndex ? targetIndex - 1 : targetIndex
  arr.splice(insertAt, 0, item)
  draggingStepIndex.value = null
}
function onStepDragEnd() {
  draggingStepIndex.value = null
}

// ── Init ──

onMounted(async () => {
  await projectStore.fetchProjects()
  if (selectedProject.value) await loadCases()
  // 关闭优先级面板的全局点击监听
  document.addEventListener('click', closeLevelPicker)
})

function closeLevelPicker() {
  levelPickerOpen.value = false
  closeModulePicker()
}

onUnmounted(() => {
  document.removeEventListener('click', closeLevelPicker)
  cancelCaseDrawerHydration()
})

watch(selectedProject, (newId) => {
  page.value = 1
  try {
    selectedModulePath.value = localStorage.getItem(`tp-module-path-${newId}`) ?? ''
  } catch {
    selectedModulePath.value = ''
  }
  loadCases()
})
</script>

<template>
  <div class="case-page">
    <!-- The left-tree has been migrated to AppSidebar.vue to be globally accessible under the Navigation -->

    <div class="right-table">
      <!-- Intelligent Insights Layout -->
      <div class="insights-section">
        <div class="insights-header">
          <div class="insights-title-area">
            <h2 class="insights-title">测试用例中心</h2>
          </div>
          <div class="insights-actions">
            <button class="insights-btn-primary" @click="onExportReport">
              <span class="material-symbols-outlined shrink-0">download</span>
              <span>导出报告</span>
            </button>
            <button class="insights-btn-primary" @click="openCreate">
              <span class="material-symbols-outlined shrink-0">add</span>
              <span>新建用例</span>
            </button>
            <input
              ref="importInput"
              type="file"
              accept=".xlsx,.xls"
              style="display: none"
              @change="onImportXlsx"
            />
          </div>
        </div>

        <div class="insights-cards">
          <!-- Card 1: 总用例数 -->
          <div class="insight-card">
            <div class="insight-left">
              <div class="insight-icon-wrap icon-purple">
                <span class="material-symbols-outlined">inventory_2</span>
              </div>
              <div class="insight-trend trend-grey">+24 本周</div>
            </div>
            <div class="insight-right">
              <div class="insight-label">总用例数</div>
              <div class="insight-value">{{ metricTotal }}</div>
              <div class="insight-chart">
                <div
                  class="bar"
                  style="height: 40%; background: var(--tp-accent-primary-soft)"
                ></div>
                <div class="bar" style="height: 60%; background: var(--tp-accent-info-soft)"></div>
                <div class="bar" style="height: 80%; background: var(--tp-primary)"></div>
                <div class="bar" style="height: 50%; background: var(--tp-primary-dark)"></div>
                <div
                  class="bar"
                  style="height: 100%; background: var(--tp-accent-primary-border)"
                ></div>
              </div>
            </div>
          </div>

          <!-- Card 2: 通过率 -->
          <div class="insight-card">
            <div class="insight-left">
              <div class="insight-icon-wrap icon-blue">
                <span class="material-symbols-outlined">verified</span>
              </div>
              <div class="insight-trend trend-green">↑ 1.2% 较上周</div>
            </div>
            <div class="insight-right">
              <div class="insight-label">通过率</div>
              <div class="insight-value">
                {{ metricPassRate }}
                <span style="font-size: 16px; font-weight: 500; margin-left: 2px">%</span>
              </div>
              <div class="insight-chart">
                <div class="bar" style="height: 30%; background: var(--tp-accent-info-soft)"></div>
                <div
                  class="bar"
                  style="height: 50%; background: var(--tp-accent-info-border)"
                ></div>
                <div class="bar" style="height: 90%; background: var(--tp-accent-info)"></div>
                <div class="bar" style="height: 70%; background: var(--tp-primary-light)"></div>
                <div class="bar" style="height: 60%; background: var(--tp-primary)"></div>
              </div>
            </div>
          </div>

          <!-- Card 3: 活动缺陷 -->
          <div class="insight-card">
            <div class="insight-left">
              <div class="insight-icon-wrap icon-red">
                <span class="material-symbols-outlined">bug_report</span>
              </div>
              <div class="insight-trend trend-red">↓ 3 待修复</div>
            </div>
            <div class="insight-right">
              <div class="insight-label">活动缺陷</div>
              <div class="insight-value">12</div>
              <div class="insight-chart">
                <div
                  class="bar"
                  style="height: 80%; background: var(--tp-accent-danger-border)"
                ></div>
                <div class="bar" style="height: 40%; background: var(--tp-accent-danger)"></div>
                <div class="bar" style="height: 60%; background: var(--tp-danger)"></div>
                <div
                  class="bar"
                  style="height: 30%; background: var(--tp-accent-danger-soft)"
                ></div>
                <div class="bar" style="height: 50%; background: var(--tp-accent-danger)"></div>
              </div>
            </div>
          </div>

          <!-- Card 4: 平均执行时间 -->
          <div class="insight-card">
            <div class="insight-left">
              <div class="insight-icon-wrap icon-orange">
                <span class="material-symbols-outlined">timer</span>
              </div>
              <div class="insight-trend trend-grey">稳步下降中</div>
            </div>
            <div class="insight-right">
              <div class="insight-label">平均执行时间</div>
              <div class="insight-value">
                14
                <span style="font-size: 16px; font-weight: 500; margin-left: 2px">m</span>
              </div>
              <div class="insight-chart">
                <div class="bar" style="height: 100%; background: var(--tp-accent-warning)"></div>
                <div class="bar" style="height: 80%; background: var(--tp-warning)"></div>
                <div
                  class="bar"
                  style="height: 60%; background: var(--tp-accent-warning-border)"
                ></div>
                <div class="bar" style="height: 40%; background: var(--tp-accent-warning)"></div>
                <div
                  class="bar"
                  style="height: 30%; background: var(--tp-accent-warning-soft)"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Search & Filter Bar (Style B — exact match) -->
      <div class="filter-bar">
        <div class="filter-bar-search">
          <el-input
            v-model="keyword"
            class="filter-search-input"
            placeholder="搜索 ID、用例名称或关键词..."
            clearable
            :prefix-icon="Search"
            @keyup.enter="onSearch"
          />
        </div>
        <div class="filter-bar-selects">
          <el-select
            v-model="levelFilter"
            placeholder="优先级"
            clearable
            size="default"
            class="filter-dropdown"
            @change="onSearch"
          >
            <el-option label="P0" value="P0" />
            <el-option label="P1" value="P1" />
            <el-option label="P2" value="P2" />
            <el-option label="P3" value="P3" />
          </el-select>
          <el-select
            v-model="execFilter"
            placeholder="状态"
            clearable
            size="default"
            class="filter-dropdown"
            @change="onSearch"
          >
            <el-option label="未执行" value="未执行" />
            <el-option label="已通过" value="已通过" />
            <el-option label="已失败" value="已失败" />
          </el-select>
          <button
            type="button"
            class="filter-icon-btn"
            title="高级筛选"
            aria-label="打开高级筛选"
            @click="filterPanelVisible = true"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <line
                x1="2"
                y1="4"
                x2="14"
                y2="4"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
              <line
                x1="4"
                y1="8"
                x2="12"
                y2="8"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
              <line
                x1="6"
                y1="12"
                x2="10"
                y2="12"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <!-- View Toggle (kept from Style C, positioned in filter bar) -->
      <div class="view-toggle" style="position: absolute; right: 0; top: 0; display: none">
        <button
          class="view-toggle-btn"
          :class="{ active: viewMode === 'table' }"
          title="表格视图"
          @click="viewMode = 'table'"
        >
          <el-icon :size="16"><List /></el-icon>
        </button>
        <button
          class="view-toggle-btn"
          :class="{ active: viewMode === 'kanban' }"
          title="看板视图"
          @click="viewMode = 'kanban'"
        >
          <el-icon :size="16"><Grid /></el-icon>
        </button>
      </div>

      <!-- Floating batch action bar (Stitch design) -->
      <Teleport to="body">
        <Transition name="batch-slide">
          <div v-if="selectedIds.length > 0" class="batch-float-overlay">
            <div class="batch-float-bar">
              <div class="batch-left">
                <div class="batch-count-badge">{{ selectedIds.length }}</div>
                <div class="batch-text">
                  <div class="batch-text-title">已选 {{ selectedIds.length }} 项用例</div>
                  <div class="batch-text-sub">批量操作模式已启用</div>
                </div>
              </div>
              <div class="batch-actions">
                <button class="batch-action-item">
                  <span class="material-symbols-outlined" style="color: #a78bfa">person_add</span>
                  <span>分配负责人</span>
                </button>
                <el-dropdown trigger="click" @command="onBatchUpdateLevel">
                  <button class="batch-action-item">
                    <span class="material-symbols-outlined" style="color: #fcd34d">checklist</span>
                    <span>修改优先级</span>
                  </button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="P0">P0</el-dropdown-item>
                      <el-dropdown-item command="P1">P1</el-dropdown-item>
                      <el-dropdown-item command="P2">P2</el-dropdown-item>
                      <el-dropdown-item command="P3">P3</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
                <button class="batch-action-item" @click="openBatchTagDialog">
                  <span class="material-symbols-outlined" style="color: #34d399">label</span>
                  <span>打标签</span>
                </button>
                <button class="batch-action-item" @click="openBatchMoveDialog">
                  <span class="material-symbols-outlined" style="color: #94a3b8">
                    drive_file_move
                  </span>
                  <span>批量移动</span>
                </button>
                <button class="batch-action-item batch-action-danger" @click="onBatchDelete">
                  <span class="material-symbols-outlined">delete</span>
                  <span>批量删除</span>
                </button>
                <div class="batch-divider"></div>
                <button class="batch-close" @click="clearBatchSelection">
                  <span class="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <div v-if="activeFilterChips.length > 0" class="filter-chips">
        <div v-for="f in activeFilterChips" :key="f.key" class="chip">
          <span>{{ f.label }}: {{ f.value }}</span>
          <button class="chip-close" @click="clearOneFilter(f.key)">×</button>
        </div>
        <button class="chip-clear-all" @click="onResetSearch">清空筛选</button>
      </div>

      <div v-if="viewMode === 'table'" v-loading="appLoading" class="table-shell">
        <div v-if="appLoading" class="table-skeleton">
          <div v-for="i in 8" :key="i" class="skeleton-row">
            <span class="sk sk-id"></span>
            <span class="sk sk-name"></span>
            <span class="sk"></span>
            <span class="sk"></span>
            <span class="sk"></span>
            <span class="sk"></span>
            <span class="sk"></span>
            <span class="sk"></span>
            <span class="sk sk-op"></span>
          </div>
        </div>

        <table v-else>
          <thead>
            <tr>
              <th style="width: 40px">
                <input
                  type="checkbox"
                  aria-label="选择当前页全部用例"
                  :checked="selectAll"
                  @change="handleToggleSelectAll"
                />
              </th>
              <th style="width: 80px" class="sortable" @click="toggleSort('id')">
                ID
                <span class="sort-flag" :class="{ active: sortBy === 'id' }">
                  {{ sortBy === 'id' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}
                </span>
              </th>
              <th>用例名称</th>
              <th style="width: 70px">优先级</th>
              <th style="width: 120px">所属模块</th>
              <th style="width: 80px">评审结果</th>
              <th style="width: 70px">状态</th>
              <th style="width: 160px">标签</th>
              <th style="width: 200px" class="sortable" @click="toggleSort('updated_at')">
                最后更新
                <span class="sort-flag" :class="{ active: sortBy === 'updated_at' }">
                  {{ sortBy === 'updated_at' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}
                </span>
              </th>
              <th style="width: 130px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loadError">
              <td colspan="10" class="empty-td">
                {{ loadError }}
                <el-button size="small" style="margin-left: 10px" @click="loadCases">
                  重试
                </el-button>
              </td>
            </tr>
            <tr v-else-if="rows.length === 0">
              <td colspan="10" class="empty-td testcase-empty-cell">
                <div class="testcase-empty-wrap">
                  <el-empty description="暂无数据" :image-size="140">
                    <el-button type="primary" plain @click="openCreate">去新建</el-button>
                  </el-empty>
                </div>
              </td>
            </tr>
            <tr
              v-for="r in rows"
              v-else
              :key="r.id"
              :class="{ 'row-selected': selectedIds.includes(r.id) }"
            >
              <td>
                <input
                  type="checkbox"
                  :aria-label="`选择用例 ${r.title}`"
                  :checked="selectedIds.includes(r.id)"
                  @change="toggleSelectRow(r.id)"
                />
              </td>
              <td
                class="id copy-id-cell"
                title="点击复制 ID"
                tabindex="0"
                @click="copyIdToClipboard(r.id)"
                @keydown.enter.prevent="copyIdToClipboard(r.id)"
                @keydown.space.prevent="copyIdToClipboard(r.id)"
              >
                {{ r.id }}
              </td>
              <td class="name case-title-cell" :title="r.title" @click="openEdit(r)">
                <div class="case-title-wrap">
                  <strong class="case-title-link">{{ r.title }}</strong>
                  <span v-if="r.status === 'discarded'" class="case-discarded-badge">已废弃</span>
                </div>
              </td>
              <td><LevelBadge :level="r.level" /></td>
              <td class="case-module-cell" :title="r.modulePath || '未分类'">
                {{ (r.modulePath || '').split('/').filter(Boolean).pop() || '未分类' }}
              </td>
              <td>
                <StatusBadge :value="r.reviewResult" />
              </td>
              <td>
                <el-tag
                  size="small"
                  :type="
                    r.status === 'active'
                      ? 'success'
                      : r.status === 'pending'
                        ? 'warning'
                        : r.status === 'discarded'
                          ? 'danger'
                          : 'info'
                  "
                  effect="plain"
                >
                  {{
                    r.status === 'active'
                      ? '已生效'
                      : r.status === 'pending'
                        ? '待评审'
                        : r.status === 'discarded'
                          ? '已废弃'
                          : '草稿'
                  }}
                </el-tag>
              </td>
              <td>
                <div v-if="r.tagList.length > 0" class="table-tags">
                  <span
                    v-for="t in r.tagList.slice(0, 3)"
                    :key="t.id"
                    class="table-tag"
                    :style="{
                      backgroundColor: t.color + '20',
                      color: 'var(--tp-gray-800)',
                      borderColor: t.color + '40',
                    }"
                  >
                    {{ t.name }}
                  </span>
                  <span
                    v-if="r.tagList.length > 3"
                    class="table-tag table-tag-more"
                    :title="
                      r.tagList
                        .slice(3)
                        .map((t) => t.name)
                        .join(', ')
                    "
                  >
                    +{{ r.tagList.length - 3 }}
                  </span>
                </div>
                <span v-else class="table-empty-value">-</span>
              </td>
              <td>
                <div
                  class="table-meta-cell"
                  :title="`更新人：${r.updatedByName}\n更新于：${formatAbsoluteTime(r.updatedAt)}\n创建人：${r.createdByName}\n创建于：${formatAbsoluteTime(r.createdAt)}`"
                >
                  <img
                    v-if="r.updatedByAvatar"
                    class="table-user-avatar-img"
                    :src="serverUrl + r.updatedByAvatar"
                    :alt="r.updatedByName"
                    @error="onAvatarLoadError($event, r.updatedByName)"
                  />
                  <div v-else class="table-user-avatar">
                    {{ r.updatedByName ? r.updatedByName.substring(0, 1).toUpperCase() : 'U' }}
                  </div>
                  <div class="table-meta-text">
                    <span class="table-meta-name">{{ r.updatedByName }}</span>
                    <span class="table-meta-time">{{ formatRelativeTime(r.updatedAt) }}</span>
                  </div>
                </div>
              </td>
              <td>
                <div class="action-group">
                  <button
                    v-if="r.status === 'active' && isAdminOrManager"
                    type="button"
                    class="action-btn action-discard icon-only"
                    title="废弃用例"
                    aria-label="废弃用例"
                    @click="onDiscard(r)"
                  >
                    <span class="material-symbols-outlined" style="font-size: 18px">block</span>
                    <span>废弃</span>
                  </button>
                  <button
                    v-if="r.status === 'discarded' && isAdminOrManager"
                    type="button"
                    class="action-btn action-recover icon-only"
                    title="恢复用例"
                    aria-label="恢复用例"
                    @click="onRecover(r)"
                  >
                    <span class="material-symbols-outlined" style="font-size: 18px">
                      settings_backup_restore
                    </span>
                    <span>恢复</span>
                  </button>

                  <button
                    v-if="r.status !== 'discarded'"
                    type="button"
                    class="action-btn action-edit icon-only"
                    title="编辑用例"
                    aria-label="编辑用例"
                    @click="openEdit(r)"
                  >
                    <el-icon class="btn-icon"><Edit /></el-icon>
                    <span>编辑</span>
                  </button>
                  <button
                    type="button"
                    class="action-btn action-clone icon-only"
                    title="复制用例"
                    aria-label="复制用例"
                    @click="onCloneCase(r)"
                  >
                    <el-icon class="btn-icon"><CopyDocument /></el-icon>
                    <span>复制</span>
                  </button>
                  <button
                    type="button"
                    class="action-btn action-delete icon-only"
                    title="删除用例"
                    aria-label="删除用例"
                    @click="onDelete(r)"
                  >
                    <el-icon class="btn-icon"><Delete /></el-icon>
                    <span>删除</span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="viewMode === 'table'" class="pager">
        <span class="pagination-info">
          显示 {{ paginationStart }}-{{ paginationEnd }} / 共 {{ total }} 条用例
        </span>
        <el-pagination
          background
          size="small"
          :current-page="page"
          :page-size="pageSize"
          :page-sizes="pageSizeOptions"
          :total="total"
          layout="sizes, prev, pager, next, jumper"
          @size-change="onPaginationSizeChange"
          @current-change="onPaginationCurrentChange"
        />
      </div>

      <!-- Kanban View (Style C) -->
      <div v-if="viewMode === 'kanban'" class="kanban-board">
        <div v-for="col in kanbanColumns" :key="col.key" class="kanban-column">
          <div class="kanban-column-header">
            <span class="kanban-dot" :style="{ background: col.color }"></span>
            <span class="kanban-col-title">{{ col.label }}</span>
            <span class="kanban-count">{{ col.items.length }}</span>
          </div>
          <div class="kanban-cards">
            <div v-if="col.items.length === 0" class="kanban-empty">暂无用例</div>
            <div
              v-for="item in col.items"
              :key="item.id"
              class="kanban-card"
              @click="openEdit(item)"
            >
              <div class="kanban-card-top">
                <LevelBadge :level="item.level" />
                <span class="kanban-card-id">TC-{{ item.id }}</span>
              </div>
              <div class="kanban-card-title">{{ item.title }}</div>
              <div class="kanban-card-meta">
                <span class="kanban-card-module">📁 {{ item.modulePath || '未分类' }}</span>
              </div>
              <div v-if="item.tags" class="kanban-card-tags">
                <span v-for="t in item.tags.split(',').slice(0, 3)" :key="t" class="kanban-tag">
                  {{ t.trim() }}
                </span>
              </div>
              <div class="kanban-card-footer">
                <span class="kanban-card-avatar">{{ (item.updatedByName || 'U').charAt(0) }}</span>
                <span class="kanban-card-time">{{ item.updatedAt?.substring(5, 16) || '-' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Advanced filter drawer -->
    <el-drawer
      v-model="filterPanelVisible"
      title="高级筛选"
      size="360px"
      direction="rtl"
      class="advanced-filter-drawer"
      modal-class="advanced-filter-overlay"
      append-to-body
    >
      <div class="advanced-filter-form">
        <el-form label-position="top">
          <el-form-item label="用例等级">
            <el-select v-model="levelFilter" placeholder="全部" clearable>
              <el-option label="全部" value="" />
              <el-option label="P0" value="P0" />
              <el-option label="P1" value="P1" />
              <el-option label="P2" value="P2" />
              <el-option label="P3" value="P3" />
            </el-select>
          </el-form-item>
          <el-form-item label="评审结果">
            <el-select v-model="reviewFilter" placeholder="全部" clearable>
              <el-option label="全部" value="" />
              <el-option label="未评审" value="未评审" />
              <el-option label="已通过" value="已通过" />
              <el-option label="不通过" value="不通过" />
              <el-option label="重新提审" value="重新提审" />
            </el-select>
          </el-form-item>
          <el-form-item label="执行结果">
            <el-select v-model="execFilter" placeholder="全部" clearable>
              <el-option label="全部" value="" />
              <el-option label="未执行" value="未执行" />
              <el-option label="成功" value="成功" />
              <el-option label="失败" value="失败" />
              <el-option label="阻塞" value="阻塞" />
            </el-select>
          </el-form-item>
          <el-form-item label="标签">
            <el-input v-model="tagsFilter" placeholder="输入标签搜索" clearable />
          </el-form-item>
          <el-form-item label="创建人">
            <el-input v-model="creatorFilter" placeholder="输入创建人ID" clearable />
          </el-form-item>
          <el-form-item label="更新人">
            <el-input v-model="updaterFilter" placeholder="输入更新人ID" clearable />
          </el-form-item>
          <el-form-item label="创建时间">
            <div style="display: flex; gap: 8px; align-items: center; width: 100%">
              <el-date-picker
                v-model="createdAfter"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="开始日期"
                clearable
                style="flex: 1; width: 100%"
              />
              <span style="color: var(--tp-text-muted); font-size: 13px">-</span>
              <el-date-picker
                v-model="createdBefore"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="结束日期"
                clearable
                style="flex: 1; width: 100%"
              />
            </div>
          </el-form-item>
          <el-form-item label="更新时间">
            <div style="display: flex; gap: 8px; align-items: center; width: 100%">
              <el-date-picker
                v-model="updatedAfter"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="开始日期"
                clearable
                style="flex: 1; width: 100%"
              />
              <span style="color: var(--tp-text-muted); font-size: 13px">-</span>
              <el-date-picker
                v-model="updatedBefore"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="结束日期"
                clearable
                style="flex: 1; width: 100%"
              />
            </div>
          </el-form-item>
        </el-form>
        <div class="advanced-filter-actions">
          <el-button class="btn-cancel" @click="filterPanelVisible = false">取消</el-button>
          <el-button class="btn-reset" @click="onResetSearch">重置</el-button>
          <el-button class="btn-query" @click="applyAdvancedFilters">应用筛选</el-button>
        </div>
      </div>
    </el-drawer>

    <!-- Batch move dialog -->
    <el-dialog v-model="batchMoveVisible" title="批量移动" width="400px" :append-to-body="true">
      <el-form label-position="top">
        <el-form-item label="目标目录">
          <el-select v-model="batchMoveTargetId" style="width: 100%">
            <el-option label="/未规划用例" :value="0" />
            <el-option v-for="n in flatModules" :key="n.id" :label="n.path" :value="n.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchMoveVisible = false">取消</el-button>
        <el-button type="primary" @click="onBatchMove">
          确认移动 ({{ selectedIds.length }} 条)
        </el-button>
      </template>
    </el-dialog>

    <!-- Batch Tag Dialog -->
    <el-dialog
      v-model="batchTagVisible"
      title="批量打标签"
      width="480px"
      :close-on-click-modal="false"
    >
      <p style="margin-bottom: 12px; color: var(--tp-gray-600); font-size: 13px">
        为已选的 {{ selectedIds.length }} 条用例设置标签（将替换原有标签）
      </p>
      <el-select
        v-model="batchTagSelectedIds"
        multiple
        filterable
        placeholder="搜索或选择标签..."
        style="width: 100%"
        :reserve-keyword="true"
        no-data-text="无匹配标签"
      >
        <el-option v-for="opt in projectTagOptions" :key="opt.id" :label="opt.name" :value="opt.id">
          <span
            :style="{
              display: 'inline-block',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: opt.color,
              marginRight: '8px',
            }"
          ></span>
          {{ opt.name }}
        </el-option>
      </el-select>
      <template #footer>
        <el-button @click="batchTagVisible = false">取消</el-button>
        <el-button type="primary" @click="onBatchTagConfirm">
          确认 ({{ selectedIds.length }} 条)
        </el-button>
      </template>
    </el-dialog>

    <!-- Case editor drawer (Stitch Redesign) -->
    <el-drawer
      v-model="dialogVisible"
      :with-header="false"
      size="min(100vw, 1320px)"
      direction="rtl"
      class="stitch-case-drawer"
      modal-class="advanced-filter-overlay"
      append-to-body
      @closed="onCaseDrawerClosed"
    >
      <div class="stitch-drawer-wrapper" :class="{ 'is-hydrated': caseDrawerHydrated }">
        <!-- Header / Breadcrumbs -->
        <div class="stitch-header">
          <div class="stitch-header-left">
            <h1 class="stitch-title">
              <template v-if="editingId">
                {{ caseForm.title || '' }}
              </template>
              <template v-else>新建测试用例</template>
            </h1>
          </div>
          <div class="stitch-header-right">
            <button type="button" class="stitch-btn-cancel" @click="dialogVisible = false">
              取消
            </button>
            <button
              type="button"
              class="stitch-btn-save"
              :class="{ 'is-loading': saving }"
              :disabled="saving"
              @click="submitCase"
            >
              {{ saving ? '保存中...' : '保存用例' }}
            </button>
          </div>
        </div>

        <!-- Main Layout: Bento Style -->
        <div class="stitch-grid">
          <!-- Left Column: Core Editor -->
          <div class="stitch-col-left">
            <!-- Section 1: Basic Information -->
            <section class="stitch-panel relative stitch-panel-accent case-basic-panel">
              <div class="stitch-panel-accent-bar"></div>
              <h3 class="stitch-panel-title">
                <span class="material-symbols-outlined">info</span>
                基本信息
              </h3>

              <div class="stitch-form-grid">
                <!-- Use Case Name -->
                <div class="stitch-form-item col-span-full">
                  <label for="case-title-input">用例名称</label>
                  <input
                    id="case-title-input"
                    v-model="caseForm.title"
                    type="text"
                    class="stitch-input"
                    placeholder="请输入用例名称"
                    aria-required="true"
                  />
                </div>

                <!-- Priority / Level -->
                <div class="stitch-form-item">
                  <label id="case-level-label">优先级</label>
                  <div
                    class="stitch-level-picker"
                    role="button"
                    tabindex="0"
                    aria-haspopup="listbox"
                    :aria-expanded="levelPickerOpen"
                    aria-labelledby="case-level-label"
                    @click.stop="levelPickerOpen = !levelPickerOpen"
                    @keydown.enter.prevent="levelPickerOpen = !levelPickerOpen"
                    @keydown.space.prevent="levelPickerOpen = !levelPickerOpen"
                  >
                    <span class="level-badge" :class="caseForm.level.toLowerCase()">
                      {{ caseForm.level }}
                    </span>
                    <span class="level-desc">{{ levelLabels[caseForm.level] }}</span>
                    <span
                      class="material-symbols-outlined level-arrow"
                      :class="{ open: levelPickerOpen }"
                    >
                      expand_more
                    </span>
                    <Transition name="level-fade">
                      <div v-if="levelPickerOpen" class="level-dropdown-panel" role="listbox">
                        <div
                          v-for="lv in levelKeys"
                          :key="lv"
                          class="level-dropdown-item"
                          :class="{ active: caseForm.level === lv }"
                          role="option"
                          :aria-selected="caseForm.level === lv"
                          @click.stop="selectCaseLevel(lv)"
                        >
                          <span class="level-badge" :class="lv.toLowerCase()">{{ lv }}</span>
                          <span class="level-item-label">{{ levelLabels[lv] }}</span>
                          <span
                            v-if="caseForm.level === lv"
                            class="material-symbols-outlined level-check"
                          >
                            check
                          </span>
                        </div>
                      </div>
                    </Transition>
                  </div>
                </div>

                <!-- Module Path -->
                <div class="stitch-form-item">
                  <label for="case-module-select">所属模块</label>
                  <div class="module-picker" :class="{ 'is-open': modulePickerOpen }" @click.stop>
                    <button
                      id="case-module-select"
                      class="module-picker-trigger"
                      type="button"
                      role="combobox"
                      aria-haspopup="listbox"
                      :aria-expanded="modulePickerOpen"
                      aria-controls="case-module-options"
                      @click="modulePickerOpen ? closeModulePicker() : openModulePicker()"
                      @keydown.enter.prevent="openModulePicker"
                      @keydown.space.prevent="openModulePicker"
                      @keydown.arrow-down.prevent="openModulePicker"
                    >
                      <span class="module-picker-trigger-icon material-symbols-outlined">
                        {{ selectedCaseModuleOption.id === 0 ? 'inventory_2' : 'folder' }}
                      </span>
                      <span class="module-picker-trigger-main">
                        <span
                          class="module-picker-trigger-label"
                          :title="formatModuleDisplayPath(selectedCaseModuleOption.path)"
                        >
                          {{ selectedCaseModuleOption.label }}
                        </span>
                        <span class="module-picker-trigger-path">
                          {{ formatModuleTriggerMeta(selectedCaseModuleOption) }}
                        </span>
                      </span>
                      <span
                        v-if="selectedCaseModuleOption.caseCount > 0"
                        class="module-picker-trigger-count"
                      >
                        {{ selectedCaseModuleOption.caseCount }}
                      </span>
                      <span
                        class="module-picker-trigger-arrow material-symbols-outlined"
                        :class="{ 'is-open': modulePickerOpen }"
                      >
                        expand_more
                      </span>
                    </button>
                    <Transition name="level-fade">
                      <div v-if="modulePickerOpen" class="module-picker-panel">
                        <div class="module-picker-search">
                          <span class="material-symbols-outlined">search</span>
                          <input
                            ref="modulePickerSearchInput"
                            v-model="modulePickerKeyword"
                            type="text"
                            placeholder="搜索目录名称或路径"
                            @keydown.down.prevent="moveModulePickerActive(1)"
                            @keydown.up.prevent="moveModulePickerActive(-1)"
                            @keydown.enter.prevent="selectActiveCaseModuleOption"
                            @keydown.esc.prevent="closeModulePicker"
                          />
                        </div>
                        <div id="case-module-options" class="module-picker-list" role="listbox">
                          <button
                            v-for="(item, index) in filteredCaseModuleOptions"
                            :key="item.id"
                            class="module-picker-option"
                            :class="{
                              'is-selected': item.id === caseForm.moduleId,
                              'is-active': index === modulePickerActiveIndex,
                              'is-unplanned': item.id === 0,
                            }"
                            :style="{ '--module-indent': `${item.depth * 14}px` }"
                            type="button"
                            role="option"
                            :aria-selected="item.id === caseForm.moduleId"
                            :title="formatModuleDisplayPath(item.path)"
                            @mouseenter="modulePickerActiveIndex = index"
                            @click="selectCaseModuleOption(item)"
                          >
                            <span v-if="item.depth > 0" class="module-picker-option-branch"></span>
                            <span class="module-picker-option-icon material-symbols-outlined">
                              {{ item.id === 0 ? 'inventory_2' : 'folder' }}
                            </span>
                            <span class="module-picker-option-main">
                              <span class="module-picker-option-label">
                                {{ item.label }}
                              </span>
                              <span class="module-picker-option-path">
                                {{ formatModuleOptionMeta(item) }}
                              </span>
                            </span>
                            <span v-if="item.caseCount > 0" class="module-picker-option-count">
                              {{ item.caseCount }}
                            </span>
                            <span
                              v-if="item.id === caseForm.moduleId"
                              class="module-picker-option-check material-symbols-outlined"
                            >
                              check
                            </span>
                          </button>
                          <div
                            v-if="filteredCaseModuleOptions.length === 0"
                            class="module-picker-empty"
                          >
                            没有匹配的目录
                          </div>
                        </div>
                        <div class="module-picker-footer">
                          <span>{{ filteredCaseModuleOptions.length }} 个可选目录</span>
                          <span v-if="filteredCaseModuleOptions.length > 6">滚动查看更多</span>
                        </div>
                      </div>
                    </Transition>
                  </div>
                </div>

                <!-- Review Summary -->
                <div class="stitch-form-item">
                  <label>评审信息</label>
                  <div class="review-readonly-card">
                    <div class="review-readonly-main">
                      <StatusBadge :value="editingCaseRow?.reviewResult || '未评审'" />
                      <span v-if="editingCaseRow" class="review-readonly-text">
                        {{
                          editingCaseRow?.inReview
                            ? `当前正在评审：${editingCaseRow.currentReviewName || '未命名评审计划'}`
                            : editingCaseRow.relatedReviewCount > 0
                              ? `历史已关联 ${editingCaseRow.relatedReviewCount} 个评审计划`
                              : '当前暂无关联评审计划'
                        }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Exec Status -->
                <div class="stitch-form-item">
                  <label for="case-exec-select">执行状态</label>
                  <el-select
                    id="case-exec-select"
                    v-model="caseForm.execResult"
                    class="exec-status-select"
                    popper-class="case-exec-dropdown"
                    teleported
                  >
                    <el-option label="未执行" value="未执行" />
                    <el-option label="成功" value="成功" />
                    <el-option label="失败" value="失败" />
                    <el-option label="阻塞" value="阻塞" />
                  </el-select>
                </div>

                <!-- Tags -->
                <div class="stitch-form-item case-tags-field">
                  <label id="case-tags-label">标签</label>
                  <el-select
                    v-model="selectedTagIds"
                    multiple
                    filterable
                    collapse-tags
                    :collapse-tags-tooltip="false"
                    :max-collapse-tags="99"
                    :fit-input-width="false"
                    placeholder="搜索或选择标签..."
                    class="tag-selector"
                    popper-class="tag-selector-dropdown"
                    aria-labelledby="case-tags-label"
                    :reserve-keyword="true"
                    no-data-text="无匹配标签"
                  >
                    <template #tag="{ data, deleteTag, selectDisabled }">
                      <span
                        v-for="item in data"
                        :key="item.value"
                        class="tag-selected-item"
                        :style="{
                          backgroundColor:
                            (projectTagOptions.find((t) => t.id === item.value)?.color ||
                              '#3B82F6') + '20',
                          color:
                            projectTagOptions.find((t) => t.id === item.value)?.color || '#3B82F6',
                          borderColor:
                            (projectTagOptions.find((t) => t.id === item.value)?.color ||
                              '#3B82F6') + '40',
                        }"
                      >
                        {{
                          projectTagOptions.find((t) => t.id === item.value)?.name ||
                          item.currentLabel
                        }}
                        <button
                          v-if="!selectDisabled && !item.isDisabled"
                          type="button"
                          class="tag-remove-btn"
                          @click.stop="deleteTag($event, item)"
                        >
                          &times;
                        </button>
                      </span>
                    </template>
                    <el-option
                      v-for="opt in projectTagOptions"
                      :key="opt.id"
                      :label="opt.name"
                      :value="opt.id"
                    >
                      <span class="tag-option-dot" :style="{ backgroundColor: opt.color }"></span>
                      <span>{{ opt.name }}</span>
                    </el-option>
                  </el-select>
                </div>

                <!-- Rich text for condition (Actually precondition) -->
                <!-- The mock had Description at the end of basic info, we will omit in favor of precond further down if no desc -->
              </div>
            </section>

            <!-- Section 2: Pre/Post Conditions -->
            <div class="stitch-conditions-grid">
              <section class="stitch-panel">
                <h3 class="stitch-panel-title">
                  <span class="material-symbols-outlined">login</span>
                  前置条件
                </h3>
                <textarea
                  v-model="caseForm.precondition"
                  class="stitch-textarea"
                  rows="3"
                  placeholder="请输入前置条件..."
                  aria-label="前置条件"
                ></textarea>
              </section>
              <section class="stitch-panel">
                <h3 class="stitch-panel-title">
                  <span class="material-symbols-outlined">logout</span>
                  后置条件
                </h3>
                <textarea
                  v-model="caseForm.postcondition"
                  class="stitch-textarea"
                  rows="3"
                  placeholder="请输入后置条件..."
                  aria-label="后置条件"
                ></textarea>
              </section>
            </div>

            <!-- Section 3: Test Steps -->
            <section class="stitch-panel stitch-steps-panel">
              <div class="stitch-steps-header">
                <h3 class="stitch-panel-title m-0">
                  <span class="material-symbols-outlined">list_alt</span>
                  测试步骤
                </h3>
                <button type="button" class="stitch-btn-text" @click="addStepRow">
                  <span class="material-symbols-outlined">add_circle</span>
                  添加步骤
                </button>
              </div>

              <div class="stitch-steps-body">
                <table class="stitch-table">
                  <thead>
                    <tr>
                      <th class="w-num">#</th>
                      <th class="w-desc">操作描述</th>
                      <th class="w-expect">预期结果</th>
                      <th class="w-op text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(st, idx) in stepRows"
                      :key="idx"
                      class="stitch-step-row group"
                      draggable="true"
                      @dragstart="onStepDragStart(idx)"
                      @dragover.prevent
                      @drop="onStepDrop(idx)"
                      @dragend="onStepDragEnd"
                    >
                      <td class="col-num relative">
                        <span class="material-symbols-outlined drag-handle">drag_indicator</span>
                        {{ (idx + 1).toString().padStart(2, '0') }}
                      </td>
                      <td class="col-desc">
                        <textarea
                          v-model="st.action"
                          class="stitch-table-input"
                          rows="1"
                          placeholder="输入操作描述..."
                          :aria-label="`第 ${idx + 1} 步操作描述`"
                        ></textarea>
                      </td>
                      <td class="col-expect">
                        <textarea
                          v-model="st.expected"
                          class="stitch-table-input"
                          rows="1"
                          placeholder="输入预期结果..."
                          :aria-label="`第 ${idx + 1} 步预期结果`"
                        ></textarea>
                      </td>
                      <td class="col-op text-center">
                        <el-dropdown
                          trigger="click"
                          placement="bottom-end"
                          popper-class="step-icon-dropdown"
                          @command="(cmd: string) => onStepMenuCommand(cmd, idx)"
                        >
                          <button
                            type="button"
                            class="stitch-btn-step-menu"
                            title="更多操作"
                            aria-label="更多步骤操作"
                          >
                            <span class="material-symbols-outlined" style="font-size: 18px">
                              more_vert
                            </span>
                          </button>
                          <template #dropdown>
                            <el-dropdown-menu class="step-icon-menu">
                              <el-dropdown-item command="insertAbove" title="在上方插入">
                                <span class="material-symbols-outlined">arrow_upward</span>
                              </el-dropdown-item>
                              <el-dropdown-item command="insertBelow" title="在下方插入">
                                <span class="material-symbols-outlined">arrow_downward</span>
                              </el-dropdown-item>
                              <el-dropdown-item command="copy" title="复制步骤">
                                <span class="material-symbols-outlined">content_copy</span>
                              </el-dropdown-item>
                              <el-dropdown-item
                                command="delete"
                                class="danger-item"
                                title="删除步骤"
                              >
                                <span class="material-symbols-outlined">delete</span>
                              </el-dropdown-item>
                            </el-dropdown-menu>
                          </template>
                        </el-dropdown>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <!-- Section 4: Notes -->
            <section class="stitch-panel">
              <h3 class="stitch-panel-title">
                <span class="material-symbols-outlined">description</span>
                备注
              </h3>
              <div class="stitch-textarea-wrap">
                <!-- Binding remark here -->
                <textarea
                  v-model="caseForm.remark"
                  class="stitch-textarea no-border"
                  rows="4"
                  placeholder="添加补充备注信息，如测试账号、特定设备说明等..."
                  aria-label="备注"
                ></textarea>
              </div>
            </section>
          </div>

          <!-- Right Column: Sidebar Metadata -->
          <div v-if="caseDrawerHydrated" class="stitch-col-right">
            <!-- Version Metadata -->
            <section class="stitch-panel">
              <h3 class="stitch-subtitle">版本追踪</h3>
              <div class="stitch-meta-list">
                <div class="stitch-meta-row flex-between">
                  <span class="meta-label">当前版本</span>
                  <span class="meta-value bold primary">{{ editingCaseRow?.version || 'V1' }}</span>
                </div>
                <div class="stitch-meta-row flex-between">
                  <span class="meta-label">状态</span>
                  <StatusBadge :value="formatCaseLifecycleStatus(editingCaseRow?.status)" />
                </div>
                <div class="stitch-meta-row flex-between">
                  <span class="meta-label">维护者</span>
                  <div class="meta-user">
                    <img
                      class="meta-avatar-img"
                      :src="
                        getMetaUserAvatarUrl(
                          editingCaseRow?.updatedByAvatar,
                          editingCaseRow?.updatedByName,
                        )
                      "
                      :alt="getMetaUserName(editingCaseRow?.updatedByName)"
                      @error="
                        onAvatarLoadError($event, getMetaUserName(editingCaseRow?.updatedByName))
                      "
                    />
                    <span>{{ getMetaUserName(editingCaseRow?.updatedByName) }}</span>
                  </div>
                </div>
                <div class="stitch-meta-row flex-between">
                  <span class="meta-label">更新于</span>
                  <span class="meta-value">{{ editingCaseRow?.updatedAt || '-' }}</span>
                </div>
                <div class="stitch-meta-row flex-between">
                  <span class="meta-label">创建人</span>
                  <div class="meta-user">
                    <img
                      class="meta-avatar-img"
                      :src="
                        getMetaUserAvatarUrl(
                          editingCaseRow?.createdByAvatar,
                          editingCaseRow?.createdByName,
                        )
                      "
                      :alt="getMetaUserName(editingCaseRow?.createdByName)"
                      @error="
                        onAvatarLoadError($event, getMetaUserName(editingCaseRow?.createdByName))
                      "
                    />
                    <span>{{ getMetaUserName(editingCaseRow?.createdByName) }}</span>
                  </div>
                </div>
                <div class="stitch-meta-row flex-between">
                  <span class="meta-label">创建于</span>
                  <span class="meta-value">{{ editingCaseRow?.createdAt || '-' }}</span>
                </div>

                <template v-if="caseHistory.length > 0">
                  <div class="stitch-meta-divider"></div>
                  <div class="stitch-meta-row">
                    <div class="meta-label" style="font-size: 12px">
                      版本历史 ({{ caseHistory.length }})
                    </div>
                    <div class="meta-tags-wrap mt-2">
                      <span
                        v-for="h in caseHistory.slice(0, 5)"
                        :key="h.id"
                        class="meta-tag tag-secondary"
                        :title="h.old_value"
                      >
                        {{ h.new_value || h.action }}
                      </span>
                    </div>
                  </div>
                </template>
              </div>
            </section>

            <!-- Assets -->
            <section class="stitch-panel">
              <h3 class="stitch-subtitle">视觉辅助/附件</h3>
              <div class="stitch-assets-grid">
                <!-- Dynamic Image Previews -->
                <div
                  v-for="att in caseAttachments.filter((a) => isImageAttachment(a))"
                  :key="att.id"
                  class="asset-item image-preview group"
                >
                  <img :src="getAttachmentUrl(att)" :alt="att.file_name" />
                  <div class="asset-overlay">
                    <button
                      type="button"
                      class="icon-only"
                      title="预览图片"
                      aria-label="预览图片"
                      @click="openImagePreview(att)"
                    >
                      <span class="material-symbols-outlined" style="color: white; font-size: 20px">
                        visibility
                      </span>
                    </button>
                    <button
                      type="button"
                      class="icon-only"
                      title="下载"
                      aria-label="下载附件"
                      style="margin-left: 8px"
                      @click="downloadAttachment(att)"
                    >
                      <span class="material-symbols-outlined" style="color: white; font-size: 20px">
                        download
                      </span>
                    </button>
                    <button
                      type="button"
                      class="icon-only"
                      title="删除"
                      aria-label="删除附件"
                      style="margin-left: 8px"
                      @click.stop="onRemoveAttachment(att.id)"
                    >
                      <span
                        class="material-symbols-outlined"
                        style="color: var(--tp-accent-danger); font-size: 20px"
                      >
                        delete
                      </span>
                    </button>
                  </div>
                </div>

                <!-- Pending Image Previews -->
                <div
                  v-for="file in pendingAttachmentFiles.filter((item) =>
                    item.type.startsWith('image/'),
                  )"
                  :key="`pending-image-${file.name}-${file.size}-${file.lastModified}`"
                  class="asset-item image-preview pending-asset pending-image-asset group"
                >
                  <div class="pending-image-thumb">
                    <img :src="getPendingFilePreviewUrl(file)" :alt="file.name" />
                  </div>
                  <div class="pending-asset-footer">待保存后上传</div>
                  <div class="asset-overlay">
                    <button
                      type="button"
                      class="icon-only"
                      title="移除待上传文件"
                      aria-label="移除待上传文件"
                      @click.stop="onRemovePendingAttachment(file)"
                    >
                      <span
                        class="material-symbols-outlined"
                        style="color: var(--tp-accent-danger); font-size: 20px"
                      >
                        delete
                      </span>
                    </button>
                  </div>
                </div>

                <!-- Dynamic File Previews -->
                <div
                  v-for="att in caseAttachments.filter((a) => !isImageAttachment(a))"
                  :key="att.id"
                  class="asset-item file-preview group"
                >
                  <span
                    class="material-symbols-outlined text-outline"
                    style="font-size: 32px; margin-bottom: 8px"
                  >
                    {{ getFileIconName(att.file_name) }}
                  </span>
                  <span
                    class="file-name text-center w-full truncate"
                    :title="att.file_name"
                    style="font-size: 12px"
                  >
                    {{ att.file_name }}
                  </span>
                  <div class="asset-overlay">
                    <button
                      type="button"
                      class="icon-only"
                      title="下载"
                      aria-label="下载附件"
                      @click="downloadAttachment(att)"
                    >
                      <span class="material-symbols-outlined" style="color: white; font-size: 20px">
                        download
                      </span>
                    </button>
                    <button
                      type="button"
                      class="icon-only"
                      title="删除"
                      aria-label="删除附件"
                      style="margin-left: 8px"
                      @click.stop="onRemoveAttachment(att.id)"
                    >
                      <span
                        class="material-symbols-outlined"
                        style="color: var(--tp-accent-danger); font-size: 20px"
                      >
                        delete
                      </span>
                    </button>
                  </div>
                </div>

                <!-- Pending File Previews -->
                <div
                  v-for="file in pendingAttachmentFiles.filter(
                    (item) => !item.type.startsWith('image/'),
                  )"
                  :key="`pending-file-${file.name}-${file.size}-${file.lastModified}`"
                  class="asset-item file-preview pending-asset group"
                >
                  <span
                    class="material-symbols-outlined text-outline"
                    style="font-size: 28px; margin-bottom: 6px"
                  >
                    {{ getFileIconName(file.name) }}
                  </span>
                  <span
                    class="file-name text-center w-full truncate"
                    :title="file.name"
                    style="font-size: 12px"
                  >
                    {{ file.name }}
                  </span>
                  <small class="pending-asset-meta">待保存后上传</small>
                  <div class="asset-overlay">
                    <button
                      type="button"
                      class="icon-only"
                      title="移除待上传文件"
                      aria-label="移除待上传文件"
                      @click.stop="onRemovePendingAttachment(file)"
                    >
                      <span
                        class="material-symbols-outlined"
                        style="color: var(--tp-accent-danger); font-size: 20px"
                      >
                        delete
                      </span>
                    </button>
                  </div>
                </div>

                <div
                  v-if="
                    caseAttachments.length === 0 && pendingAttachmentFiles.length === 0 && editingId
                  "
                  class="asset-empty-card col-span-full"
                >
                  <span class="material-symbols-outlined">perm_media</span>
                  <strong>暂无附件</strong>
                  <small>
                    {{
                      editingId
                        ? '可上传截图、日志或补充说明文件'
                        : '保存用例后可上传截图、日志或补充说明文件'
                    }}
                  </small>
                </div>
                <div class="upload-area col-span-full mt-1">
                  <FileUploader
                    :files="[]"
                    :project-id="selectedProject ?? undefined"
                    @upload="onUploadAttachment"
                  />
                </div>
              </div>
            </section>

            <!-- Review Attachments (read-only) -->
            <section v-if="editingId" class="stitch-panel">
              <h3 class="stitch-subtitle">
                来自评审的证据
                <span class="review-att-count">({{ reviewAttachments.length }})</span>
                <span class="review-att-hint">在评审任务中上传的附件，仅可查看与下载</span>
              </h3>
              <div v-if="reviewAttachmentsLoading" class="review-att-empty">加载中…</div>
              <div v-else-if="reviewAttachments.length === 0" class="review-att-empty">
                <span class="material-symbols-outlined">fact_check</span>
                <span>暂无评审证据</span>
              </div>
              <div v-else class="review-att-list">
                <div v-for="att in reviewAttachments" :key="att.id" class="review-att-item">
                  <div class="review-att-icon">
                    <span class="material-symbols-outlined">description</span>
                  </div>
                  <div class="review-att-main">
                    <div class="review-att-title" :title="att.file_name">
                      {{ att.file_name }}
                      <span class="review-att-badge">评审</span>
                    </div>
                    <div class="review-att-meta">
                      <span>{{ formatReviewAttSize(att.file_size) }}</span>
                      <span v-if="att.uploader_name">· {{ att.uploader_name }}</span>
                      <span v-if="att.review_name">· {{ att.review_name }}</span>
                      <span v-if="att.round_no">· 第 {{ att.round_no }} 轮</span>
                      <span v-if="att.created_at">· {{ formatReviewAttDate(att.created_at) }}</span>
                    </div>
                  </div>
                  <button class="review-att-btn" title="下载" @click="downloadReviewAtt(att)">
                    <span class="material-symbols-outlined">download</span>
                  </button>
                </div>
              </div>
            </section>

            <!-- Recent Activity -->
            <section v-if="editingId" class="stitch-panel">
              <h3 class="stitch-subtitle">最新动态</h3>
              <div v-if="caseActivities.length === 0" class="stitch-empty-state">
                <span class="material-symbols-outlined">history</span>
                <span>暂无动态记录</span>
                <span class="stitch-empty-state-sub">编辑或执行后将在此显示</span>
              </div>
              <div v-else class="stitch-timeline">
                <div class="timeline-line"></div>
                <div
                  v-for="act in caseActivities"
                  :key="act.id"
                  class="timeline-item flex gap-4 relative"
                >
                  <div class="timeline-icon bg-secondary z-10 shrink-0">
                    <span class="material-symbols-outlined text-white text-sm">{{ act.icon }}</span>
                  </div>
                  <div class="timeline-content flex-1">
                    <p class="text-xs leading-tight">
                      <span class="font-bold text-secondary">{{ act.actor_name }}</span>
                      {{ act.action }}
                      <span v-if="act.detail" class="font-mono bg-white-5">{{ act.detail }}</span>
                    </p>
                    <p class="time italic">{{ formatRelativeTime(act.created_at) }}</p>
                  </div>
                </div>
              </div>
            </section>

            <!-- AI Bot -->
            <section
              class="stitch-ai-panel rounded-xl p-6 relative"
              :class="{ 'is-ai-locked': !editingId && !aiAnalyzing && !aiError && !aiResult }"
            >
              <div class="ai-header flex items-center gap-3 mb-4">
                <div
                  class="ai-icon w-8 h-8 rounded-full bg-primary flex items-center justify-center"
                >
                  <span class="material-symbols-outlined text-white text-sm">smart_toy</span>
                </div>
                <div>
                  <h4 class="text-sm font-bold text-white leading-none">AI 智检助手</h4>
                  <span class="text-xs text-primary-dim uppercase tracking-wider">
                    {{ aiAnalyzing ? '分析中...' : aiResult ? '分析完成' : '智能审计可用' }}
                  </span>
                </div>
              </div>

              <!-- Loading -->
              <div v-if="aiAnalyzing" style="text-align: center; padding: 16px 0">
                <div class="ai-spinner"></div>
                <p class="text-xs text-variant" style="margin-top: 8px">
                  正在进行 AI 质量分析，请稍候...
                </p>
              </div>

              <!-- Error -->
              <div v-else-if="aiError" style="margin-bottom: 12px">
                <p class="text-xs" style="color: #f44336; margin-bottom: 8px">{{ aiError }}</p>
                <button
                  type="button"
                  class="ai-btn w-full py-2 bg-white-10 hover:bg-white-20 text-xs font-bold text-primary-dim rounded-lg transition-all border border-white-10"
                  @click="runAIAnalyze"
                >
                  重新检测
                </button>
              </div>

              <!-- Result -->
              <div v-else-if="aiResult">
                <div style="display: flex; gap: 8px; margin-bottom: 12px">
                  <div
                    v-for="dim in [
                      { label: '覆盖率', score: aiResult.coverage.score },
                      { label: '边界值', score: aiResult.boundary.score },
                      { label: '质量', score: aiResult.quality.score },
                    ]"
                    :key="dim.label"
                    style="
                      flex: 1;
                      text-align: center;
                      padding: 8px 4px;
                      border-radius: 8px;
                      background: var(--tp-surface-muted);
                    "
                  >
                    <div class="text-xs text-variant" style="margin-bottom: 4px">
                      {{ dim.label }}
                    </div>
                    <div
                      style="font-size: 18px; font-weight: 700"
                      :style="{ color: getScoreColor(dim.score) }"
                    >
                      {{ dim.score }}
                    </div>
                  </div>
                </div>

                <p
                  v-if="aiResult.summary"
                  class="text-xs text-variant"
                  style="margin-bottom: 8px; line-height: 1.5"
                >
                  {{ aiResult.summary }}
                </p>

                <div
                  v-if="
                    aiResult.coverage.issues.length ||
                    aiResult.boundary.issues.length ||
                    aiResult.quality.suggestions.length
                  "
                  style="margin-bottom: 12px"
                >
                  <div
                    v-for="issue in [
                      ...aiResult.coverage.issues.map((i) => ({ text: i, type: 'coverage' })),
                      ...aiResult.boundary.issues.map((i) => ({ text: i, type: 'boundary' })),
                      ...aiResult.quality.suggestions.map((i) => ({ text: i, type: 'quality' })),
                    ]"
                    :key="issue.text"
                    class="text-xs"
                    style="padding: 3px 0; color: var(--tp-gray-600); line-height: 1.4"
                  >
                    <span class="material-symbols-outlined ai-issue-icon">
                      {{
                        issue.type === 'coverage'
                          ? 'checklist'
                          : issue.type === 'boundary'
                            ? 'warning'
                            : 'tips_and_updates'
                      }}
                    </span>
                    {{ issue.text }}
                  </div>
                </div>

                <button
                  type="button"
                  class="ai-btn w-full py-2 bg-white-10 hover:bg-white-20 text-xs font-bold text-primary-dim rounded-lg transition-all border border-white-10"
                  @click="runAIAnalyze"
                >
                  重新检测
                </button>
              </div>

              <!-- Initial state -->
              <div v-else>
                <p class="text-xs text-variant leading-relaxed mb-4">
                  基于当前用例内容，AI
                  将从覆盖率、边界值、综合质量三个维度进行分析，给出评分和改进建议。
                </p>
                <button
                  type="button"
                  class="ai-btn w-full py-2 bg-white-10 hover:bg-white-20 text-xs font-bold text-primary-dim rounded-lg transition-all border border-white-10"
                  :disabled="!editingId"
                  @click="runAIAnalyze"
                >
                  {{ editingId ? '开始检测' : '保存后可检测' }}
                </button>
              </div>
            </section>
          </div>
          <div v-else class="stitch-col-right stitch-col-right-skeleton" aria-hidden="true">
            <div class="stitch-panel skeleton-panel skeleton-panel-sm"></div>
            <div class="stitch-panel skeleton-panel skeleton-panel-lg"></div>
            <div class="stitch-panel skeleton-panel skeleton-panel-md"></div>
          </div>
        </div>

        <div style="height: 48px"></div>
      </div>
    </el-drawer>

    <!-- Directory dialog -->
    <el-dialog v-model="directoryDialogVisible" title="新建目录" width="520px">
      <el-form label-position="top">
        <el-form-item label="父级目录">
          <el-select v-model="directoryForm.parentId" placeholder="请选择父级目录">
            <el-option label="全部用例（根目录）" :value="0" />
            <el-option v-for="n in flatModules" :key="n.id" :label="n.path" :value="n.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="目录名称">
          <el-input v-model="directoryForm.name" maxlength="40" placeholder="例如：登录" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="directoryDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitDirectory">创建并使用</el-button>
      </template>
    </el-dialog>

    <!-- Image Viewer Modal -->
    <ElImageViewer
      v-if="showImageViewer"
      :url-list="previewImages"
      :initial-index="previewIndex"
      hide-on-click-modal
      @close="showImageViewer = false"
    />
  </div>
</template>

<style scoped>
@import '../styles/testcase-drawer.css';

.review-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}

.review-meta {
  font-size: 12px;
  line-height: 1.4;
  color: var(--tp-gray-500);
}

.review-meta.active {
  color: var(--tp-warning);
}

.review-link-btn {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--tp-primary);
  font-size: 12px;
  cursor: pointer;
}

.review-link-btn:hover {
  color: var(--tp-primary-dark);
  text-decoration: underline;
}

.review-readonly-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--tp-gray-200);
  border-radius: 10px;
  background: var(--tp-surface-elevated);
}

.review-readonly-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.review-readonly-text {
  font-size: 12px;
  line-height: 1.5;
  color: var(--tp-gray-600);
}

.review-readonly-link {
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--tp-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.review-readonly-link:hover {
  color: var(--tp-primary-dark);
  text-decoration: underline;
}

.tag-selected-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 22px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid;
  line-height: 1;
}

.tag-remove-btn {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
  opacity: 0.6;
}

.tag-remove-btn:hover {
  opacity: 1;
}

.tag-option-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 10px;
  box-shadow: 0 0 0 3px var(--tp-primary-lighter);
  vertical-align: middle;
}

/* tag-selector 内部微调：让自定义 chip 在输入框内更紧凑 */
.tag-selector :deep(.el-select__selection) {
  gap: 5px;
}
.tag-selector :deep(.el-select__input) {
  min-width: 80px;
}

/* 列表表格「最后更新」合并单元格 */
.table-meta-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.table-meta-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.35;
}
.table-meta-name {
  color: var(--tp-gray-800);
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}
.table-meta-time {
  color: var(--tp-gray-600);
  font-size: 12px;
  font-weight: 500;
}

/* ── Review attachments (read-only evidences) ── */
.review-att-count {
  margin-left: 8px;
  color: var(--tp-gray-500);
  font-weight: 400;
}
.review-att-hint {
  margin-left: 8px;
  font-size: 11px;
  font-weight: 400;
  color: var(--tp-gray-500);
}
.review-att-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 16px;
  color: var(--tp-gray-500);
  font-size: 12px;
}
.review-att-empty .material-symbols-outlined {
  font-size: 28px;
  opacity: 0.5;
}
.review-att-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
}
.review-att-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--tp-surface-muted);
  border: 1px solid var(--tp-border-subtle);
}
.review-att-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--tp-accent-primary-soft);
  color: var(--tp-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}
.review-att-icon .material-symbols-outlined {
  font-size: 18px;
}
.review-att-main {
  flex: 1;
  min-width: 0;
}
.review-att-title {
  font-size: 13px;
  color: var(--tp-gray-900);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 6px;
}
.review-att-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
  background: var(--tp-accent-primary-soft);
  color: var(--tp-primary);
  flex-shrink: 0;
}
.review-att-meta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--tp-gray-500);
  display: flex;
  flex-wrap: wrap;
  gap: 2px 6px;
}
.review-att-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--tp-surface-input);
  color: var(--tp-primary);
  border: 1px solid var(--tp-border-subtle);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}
.review-att-btn:hover {
  background: var(--tp-surface-hover);
}
.review-att-btn .material-symbols-outlined {
  font-size: 16px;
}

/* 用例名称可点击样式 */
.case-title-link {
  transition: color 0.2s;
}
.case-title-link:hover {
  color: var(--tp-primary);
  text-decoration: underline;
}

.review-att-count,
.review-att-hint,
.review-att-empty,
.review-att-meta {
  color: var(--tp-gray-500);
}

.review-att-item {
  background: var(--tp-surface-muted);
  border-color: var(--tp-border-subtle);
}

.review-att-icon,
.review-att-badge {
  background: var(--tp-accent-primary-soft);
  color: var(--tp-primary);
}

.review-att-title {
  color: var(--tp-gray-900);
}

.review-att-btn {
  background: var(--tp-surface-input);
  color: var(--tp-primary);
  border: 1px solid var(--tp-border-subtle);
}

.review-att-btn:hover {
  background: var(--tp-surface-hover);
}

.case-title-link:hover {
  color: var(--tp-primary);
}

.case-page .insight-card {
  background:
    linear-gradient(180deg, var(--tp-surface-sheen), transparent 40%), var(--tp-surface-card) !important;
  border-color: var(--tp-border-subtle) !important;
  box-shadow: var(--tp-shadow-card) !important;
}

.case-page .insight-card::before {
  background: radial-gradient(circle, var(--tp-ambient-primary) 0%, transparent 68%);
  opacity: 0.72;
}

.case-page .insight-card:hover {
  transform: none;
  border-color: var(--tp-border-strong) !important;
  box-shadow: var(--tp-shadow-card) !important;
}

.case-page .insight-label,
.case-page .trend-grey {
  color: var(--tp-gray-600) !important;
}

.case-page .insight-value,
.case-page .insights-title,
.case-page .case-title-link,
.case-page .table-meta-name {
  color: var(--tp-gray-900) !important;
}

.case-page .insights-desc,
.case-page .table-meta-time {
  color: var(--tp-gray-500) !important;
}

.case-page .trend-grey {
  background: var(--tp-surface-muted);
  border-color: var(--tp-border-subtle);
}

.case-page .trend-green {
  background: var(--tp-accent-success-soft);
  border-color: var(--tp-accent-success-border);
  color: var(--tp-accent-success) !important;
}

.case-page .trend-red {
  background: var(--tp-accent-danger-soft);
  border-color: var(--tp-accent-danger-border);
  color: var(--tp-accent-danger) !important;
}

.case-page .insight-icon-wrap {
  box-shadow: none !important;
}

.case-page .icon-purple {
  background: var(--tp-accent-primary-soft);
  color: var(--tp-primary);
}

.case-page .icon-blue {
  background: var(--tp-accent-info-soft);
  color: var(--tp-accent-info);
}

.case-page .icon-red {
  background: var(--tp-accent-danger-soft);
  color: var(--tp-accent-danger);
}

.case-page .icon-orange {
  background: var(--tp-accent-warning-soft);
  color: var(--tp-accent-warning);
}

.case-page .filter-search-input :deep(.el-input__wrapper),
.case-page .filter-dropdown :deep(.el-select__wrapper) {
  background: var(--tp-surface-input) !important;
  border-color: var(--tp-border-subtle) !important;
  box-shadow: none !important;
}

.case-page .filter-search-input :deep(.el-input__inner),
.case-page .filter-dropdown :deep(.el-select__selected-item) {
  color: var(--tp-gray-900) !important;
}

.case-page .filter-search-input :deep(.el-input__inner::placeholder),
.case-page .filter-dropdown :deep(.el-select__placeholder) {
  color: var(--tp-gray-400) !important;
}

.case-page .table-shell table {
  border-spacing: 0 8px;
}

.case-page .table-shell th {
  background: var(--tp-surface-header) !important;
  color: var(--tp-gray-600) !important;
}

.case-page .table-shell tbody tr,
.case-page .table-shell tbody tr.row-selected,
.case-page .table-shell tbody tr .sticky-action {
  background: var(--tp-surface-card) !important;
  box-shadow: var(--tp-shadow-sm);
}

.case-page .table-shell tbody tr:hover,
.case-page .table-shell tbody tr:hover .sticky-action {
  background: var(--tp-surface-row-hover) !important;
  box-shadow: var(--tp-shadow-sm);
}

.case-page .table-shell tbody td {
  background: transparent !important;
  border-top: 1px solid var(--tp-border-subtle) !important;
  border-bottom: 1px solid var(--tp-border-subtle) !important;
  color: var(--tp-gray-700) !important;
}

.case-page .table-shell tbody td:first-child {
  border-left: 1px solid var(--tp-border-subtle) !important;
}

.case-page .table-shell tbody td:last-child {
  border-right: 1px solid var(--tp-border-subtle) !important;
}

.case-page .table-shell tbody tr:hover td {
  color: var(--tp-gray-900) !important;
}

.case-page .table-shell .id {
  color: var(--tp-gray-500) !important;
}

.case-page .table-user-avatar {
  background: var(--tp-accent-primary-soft);
  color: var(--tp-primary);
}

.case-page .action-btn:hover {
  background: var(--tp-surface-hover);
  color: var(--tp-primary);
}

.case-page .right-table {
  background: var(--tp-surface-base) !important;
  padding: 16px 20px 20px !important;
}

.case-page .insights-header {
  margin-bottom: 12px !important;
}

.case-page .insights-title {
  font-size: 16px !important;
  line-height: 1.35;
  letter-spacing: -0.01em;
}

.case-page .insights-desc {
  margin-top: 2px;
  line-height: 1.55;
}

.case-page .insights-cards {
  gap: 16px !important;
}

.case-page .insight-card {
  min-height: 106px !important;
  padding: 16px 18px !important;
  border-radius: var(--tp-radius-lg) !important;
  background:
    linear-gradient(180deg, var(--tp-surface-sheen), transparent 44%), var(--tp-surface-card) !important;
}

.case-page .insight-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--tp-shadow-card-hover) !important;
}

.case-page .insight-label {
  font-weight: 650;
  line-height: 1.4;
}

.case-page .insight-value {
  margin: 8px 0 !important;
  font-size: 28px !important;
  letter-spacing: -0.03em;
}

.case-page .insight-trend {
  margin-top: 14px !important;
}

.case-page .filter-bar {
  margin-bottom: 12px !important;
}

.case-page .filter-icon-btn {
  background: var(--tp-surface-card) !important;
  border: 1px solid var(--tp-border-subtle) !important;
  color: var(--tp-gray-600) !important;
  box-shadow: none !important;
}

.case-page .filter-icon-btn:hover {
  background: var(--tp-surface-hover) !important;
  border-color: var(--tp-border-strong) !important;
  color: var(--tp-primary) !important;
}

.case-page .table-shell {
  margin-top: 12px !important;
  overflow: auto;
  background: var(--tp-surface-card) !important;
  border: 1px solid var(--tp-border-subtle) !important;
  border-radius: var(--tp-radius-lg) !important;
  box-shadow: var(--tp-shadow-card);
}

.case-page .table-shell table {
  border-spacing: 0 !important;
}

.case-page .table-shell thead tr {
  background: var(--tp-surface-header) !important;
}

.case-page .table-shell th {
  padding: 13px 14px !important;
  border-bottom: 1px solid var(--tp-border-subtle) !important;
  font-size: 12px !important;
  font-weight: 700 !important;
}

.case-page .table-shell tbody tr,
.case-page .table-shell tbody tr:hover,
.case-page .table-shell tbody tr.row-selected,
.case-page .table-shell tbody tr .sticky-action,
.case-page .table-shell tbody tr:hover .sticky-action {
  box-shadow: none !important;
}

.case-page .table-shell tbody td {
  padding: 15px 14px !important;
  border-top: 0 !important;
  border-bottom: 1px solid var(--tp-border-subtle) !important;
}

.case-page .table-shell tbody td:first-child {
  border-left: 0 !important;
  border-top-left-radius: 0 !important;
  border-bottom-left-radius: 0 !important;
}

.case-page .table-shell tbody td:last-child {
  border-right: 0 !important;
  border-top-right-radius: 0 !important;
  border-bottom-right-radius: 0 !important;
}

.case-page .table-shell tbody tr:last-child td {
  border-bottom: 0 !important;
}

.case-page .table-shell tbody tr:hover {
  background: var(--tp-surface-row-hover) !important;
}

.case-page .table-shell input[type='checkbox'] {
  accent-color: var(--tp-primary);
}

.case-page .case-title-link {
  font-weight: 700;
  letter-spacing: -0.01em;
}

.case-page .table-tag {
  min-height: 24px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 760;
  line-height: 1;
  color: var(--tp-gray-800) !important;
  background-color: var(--tp-surface-muted) !important;
  border-color: var(--tp-border-strong) !important;
}

.case-page .table-shell :deep(.el-tag) {
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 760;
  line-height: 1;
}

.case-page .table-shell :deep(.el-tag--warning) {
  color: color-mix(in srgb, var(--tp-accent-warning) 62%, var(--tp-gray-900));
  background: var(--tp-accent-warning-soft);
  border-color: var(--tp-accent-warning-border);
}

.case-page .table-shell :deep(.el-tag--success) {
  color: color-mix(in srgb, var(--tp-accent-success) 72%, var(--tp-gray-900));
  background: var(--tp-accent-success-soft);
  border-color: var(--tp-accent-success-border);
}

.case-page .table-shell :deep(.el-tag--danger) {
  color: color-mix(in srgb, var(--tp-accent-danger) 82%, var(--tp-gray-900));
  background: var(--tp-accent-danger-soft);
  border-color: var(--tp-accent-danger-border);
}

.case-page .table-shell :deep(.el-tag--info) {
  color: var(--tp-gray-700);
  background: var(--tp-surface-muted);
  border-color: var(--tp-border-strong);
}

.case-page .pager {
  margin-top: 10px;
  padding: 10px 0 0;
}

.case-page .pager :deep(.el-pagination.is-background .el-pager li.is-active) {
  background: var(--tp-primary);
}

.case-page {
  background: var(--tp-surface-base);
}

.case-page .right-table {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 22px 22px !important;
}

.case-page .insights-section {
  padding: 14px;
  border: 1px solid var(--tp-border-subtle);
  border-radius: 18px;
  background:
    linear-gradient(180deg, var(--tp-surface-sheen), transparent 46%), var(--tp-surface-card);
  box-shadow: var(--tp-shadow-card);
}

.case-page .insights-header {
  align-items: center;
  margin-bottom: 14px !important;
  padding: 2px 2px 0;
}

.case-page .insights-title {
  font-size: 17px !important;
  font-weight: 760;
  letter-spacing: -0.02em;
}

.case-page .insights-desc {
  margin-top: 4px;
  color: var(--tp-gray-600) !important;
  font-size: 12px;
}

.case-page .insights-actions {
  display: inline-flex;
  gap: 8px;
}

.case-page .insights-btn-primary {
  min-height: 34px;
  border-radius: var(--tp-btn-radius);
  transition:
    background var(--tp-transition),
    border-color var(--tp-transition),
    color var(--tp-transition),
    box-shadow var(--tp-transition);
}

.case-page .insights-btn-primary:first-child {
  background: var(--tp-btn-plain-bg);
  border: 1px solid var(--tp-btn-plain-border);
  color: var(--tp-gray-700);
}

.case-page .insights-btn-primary:first-child:hover {
  background: var(--tp-surface-hover);
  border-color: var(--tp-accent-primary-border);
  color: var(--tp-primary);
}

.case-page .insights-btn-primary:last-child {
  background: var(--tp-btn-bg);
  border: 1px solid var(--tp-btn-border);
  color: var(--tp-btn-text);
  box-shadow: var(--tp-btn-shadow);
}

.case-page .insights-btn-primary:last-child:hover {
  background: var(--tp-btn-bg-hover);
  box-shadow: var(--tp-btn-shadow-hover);
}

.case-page .insights-cards {
  gap: 10px !important;
}

.case-page .insight-card {
  min-height: 92px !important;
  padding: 13px 14px !important;
  border-color: var(--tp-border-subtle) !important;
  border-radius: 14px !important;
  box-shadow: none !important;
}

.case-page .insight-card:hover {
  transform: none;
  border-color: var(--tp-border-strong) !important;
  box-shadow: var(--tp-shadow-sm) !important;
}

.case-page .insight-card::before {
  opacity: 0.55;
}

.case-page .insight-icon-wrap {
  width: 34px !important;
  height: 34px !important;
  border-radius: 10px;
}

.case-page .insight-trend {
  margin-top: 12px !important;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11px !important;
}

.case-page .insight-label {
  font-size: 12px;
}

.case-page .insight-value {
  margin: 6px 0 !important;
  font-size: 26px !important;
  font-weight: 780;
}

.case-page .insight-chart {
  height: 18px;
  gap: 3px;
}

.case-page .bar {
  width: 4px;
  border-radius: 999px;
}

.case-page .filter-bar {
  margin-bottom: 0 !important;
  padding: 10px;
  border: 1px solid var(--tp-border-subtle);
  border-radius: 14px;
  background: var(--tp-surface-card);
  box-shadow: var(--tp-shadow-sm);
}

.case-page .filter-search-input :deep(.el-input__wrapper),
.case-page .filter-dropdown :deep(.el-select__wrapper),
.case-page .filter-icon-btn {
  min-height: 34px;
  border-radius: 10px !important;
}

.case-page .filter-bar-search {
  max-width: none;
}

.case-page .filter-bar-selects {
  gap: 8px;
}

.case-page .table-shell {
  margin-top: 0 !important;
  border-color: var(--tp-border-strong) !important;
  border-radius: 16px !important;
}

.case-page .table-shell table {
  min-width: 1120px;
}

.case-page .table-shell th {
  height: 38px;
  padding: 10px 14px !important;
  color: var(--tp-gray-600) !important;
  font-size: 11px !important;
  letter-spacing: 0.04em;
}

.case-page .table-shell tbody td {
  padding: 13px 14px !important;
}

.case-page .table-shell tbody tr {
  transition:
    background var(--tp-transition),
    color var(--tp-transition);
}

.case-page .table-shell tbody tr:nth-child(even) {
  background: var(--tp-gray-50) !important;
}

.case-page .table-shell tbody tr:hover {
  background: var(--tp-accent-primary-soft) !important;
}

.case-page .case-title-link {
  font-size: 13px;
  line-height: 1.45;
}

.case-page .table-meta-cell {
  gap: 9px;
}

.case-page .table-user-avatar,
.case-page .table-user-avatar-img {
  width: 24px;
  height: 24px;
}

.case-page .table-meta-name {
  color: var(--tp-gray-800) !important;
  font-size: 12px;
}

.case-page .table-meta-time {
  font-size: 11px;
}

.case-page .insight-label,
.case-page .insight-trend,
.case-page .table-meta-time,
.review-att-badge,
.review-att-hint,
.review-att-meta {
  font-size: var(--tp-text-xs) !important;
  line-height: var(--tp-line-ui);
}

.case-page .insight-label,
.case-page .table-tag,
.review-att-badge,
.case-page .table-shell :deep(.el-tag) {
  font-weight: var(--tp-font-bold);
  letter-spacing: 0;
}

.case-page .insights-title,
.case-page .insight-value {
  font-weight: var(--tp-font-bold);
}

.case-page .table-shell th {
  font-size: var(--tp-text-xs) !important;
  line-height: var(--tp-line-ui);
  letter-spacing: 0;
  text-transform: none;
}

.case-page .table-shell tbody td {
  font-size: var(--tp-text-sm);
  line-height: var(--tp-line-ui);
}

.case-page .table-meta-time,
.review-att-hint,
.review-att-meta {
  color: var(--tp-text-muted) !important;
}

.case-page .action-group {
  gap: 2px;
}

.case-page .action-btn.icon-only {
  width: 30px;
  height: 30px;
  border-radius: 8px;
}

.case-page .pager {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 48px;
  margin-top: 0;
  padding: 10px 16px;
  border-top: 1px solid var(--tp-border-subtle);
  background: linear-gradient(180deg, var(--tp-surface-header), var(--tp-surface-card));
}

.case-page .pagination-info,
.case-page .pager :deep(.el-pagination__total),
.case-page .pager :deep(.el-pagination__jump) {
  color: var(--tp-text-muted);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-medium);
  line-height: var(--tp-line-ui);
}

.case-page .pager :deep(.el-pagination) {
  gap: 6px;
}

.case-page .pager :deep(.el-pagination button),
.case-page .pager :deep(.el-pager li) {
  min-width: 32px;
  height: 32px;
  border: 1px solid var(--tp-border-subtle);
  border-radius: 9px;
  background: var(--tp-surface-card);
  color: var(--tp-text-secondary);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-semibold);
}

.case-page .pager :deep(.el-pagination button:hover),
.case-page .pager :deep(.el-pager li:hover) {
  border-color: var(--tp-accent-primary-border);
  background: var(--tp-surface-hover);
  color: var(--tp-primary);
}

.case-page .pager :deep(.el-pagination.is-background .el-pager li.is-active) {
  background: var(--tp-btn-bg) !important;
  border-color: var(--tp-btn-border) !important;
  color: var(--tp-btn-text) !important;
  box-shadow: var(--tp-btn-shadow);
}

.case-page .right-table {
  gap: 12px;
  background:
    linear-gradient(180deg, rgba(99, 102, 241, 0.018), transparent 260px), var(--tp-surface-base) !important;
}

.case-page .insights-section {
  padding: 12px !important;
  border-radius: 16px !important;
  box-shadow: var(--tp-shadow-sm) !important;
}

.case-page .insights-header {
  margin-bottom: 10px !important;
}

.case-page .insights-title {
  font-size: var(--tp-text-lg) !important;
  line-height: var(--tp-line-tight);
}

.case-page .insights-desc {
  font-size: var(--tp-text-xs);
  line-height: var(--tp-line-body);
}

.case-page .insight-card {
  min-height: 84px !important;
  padding: 12px !important;
  border-radius: 12px !important;
}

.case-page .insight-value {
  font-size: 23px !important;
}

.case-page .filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 50px;
  padding: 8px 10px !important;
  border-radius: 10px !important;
  box-shadow: none !important;
  background: var(--tp-surface-card) !important;
  border: 1px solid var(--tp-border-subtle) !important;
}

.case-page .filter-search-input :deep(.el-input__wrapper) {
  min-height: 36px;
  border-radius: 8px !important;
  box-shadow: 0 0 0 1px transparent inset !important;
  background: var(--tp-surface-base, #f8f9fa) !important;
  transition: all 0.15s ease;
  padding: 0 10px !important;
}

.case-page .filter-search-input :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--tp-border-strong) inset !important;
  background: var(--tp-surface-card) !important;
}

.case-page .filter-search-input :deep(.el-input__wrapper.is-focus) {
  background: #fff !important;
  box-shadow:
    0 0 0 1px var(--tp-accent-primary-border) inset,
    0 0 0 2px var(--tp-accent-primary-soft) !important;
}

.case-page .filter-dropdown :deep(.el-select__wrapper) {
  min-height: 36px;
  border-radius: 8px !important;
  box-shadow: 0 0 0 1px var(--tp-border-subtle) inset !important;
  background: transparent !important;
  border: none !important;
  transition: all 0.15s ease;
  padding: 0 10px !important;
}

.case-page .filter-dropdown :deep(.el-select__wrapper.is-hovering:not(.is-focused)) {
  box-shadow: 0 0 0 1px var(--tp-border-strong) inset !important;
  background: var(--tp-surface-base, #f8f9fa) !important;
}

.case-page .filter-dropdown :deep(.el-select__wrapper.is-focused) {
  box-shadow:
    0 0 0 1px var(--tp-accent-primary-border) inset,
    0 0 0 2px var(--tp-accent-primary-soft) !important;
  background: #fff !important;
}

.case-page .filter-dropdown :deep(.el-select__suffix) {
  color: var(--tp-text-muted) !important;
}

.case-page .filter-icon-btn {
  min-height: 36px;
  width: 36px;
  height: 36px;
  border-radius: 8px !important;
  box-shadow: none !important;
  border: 1px solid var(--tp-border-subtle) !important;
  background: transparent !important;
  transition: all 0.15s ease;
  color: var(--tp-text-muted);
}

.case-page .filter-icon-btn:hover {
  border-color: var(--tp-border-strong) !important;
  color: var(--tp-text-primary) !important;
  background: var(--tp-surface-base, #f8f9fa) !important;
}

.case-page .filter-search-input :deep(.el-input__prefix .el-icon) {
  color: var(--tp-text-muted) !important;
  font-size: 15px !important;
  transition: color 0.15s ease;
}

.case-page .filter-search-input :deep(.el-input__wrapper.is-focus .el-input__prefix .el-icon) {
  color: var(--tp-primary) !important;
}

.case-page .filter-bar-selects {
  align-items: center;
}

.case-page .table-shell {
  min-height: 0 !important;
  overflow: auto;
  border-color: var(--tp-border-subtle) !important;
  border-radius: 14px !important;
  background: var(--tp-surface-card) !important;
  box-shadow: none !important;
}

.case-page .table-shell table {
  min-width: 1080px;
}

.case-page .table-shell thead {
  position: sticky;
  top: 0;
  z-index: 2;
}

.case-page .table-shell thead tr {
  background: var(--tp-surface-header) !important;
}

.case-page .table-shell th {
  height: 40px;
  padding: 9px 12px !important;
  border-bottom: 1px solid var(--tp-border-subtle) !important;
  color: var(--tp-text-muted) !important;
  font-weight: var(--tp-font-semibold) !important;
}

.case-page .table-shell tbody tr,
.case-page .table-shell tbody tr:nth-child(even) {
  background: var(--tp-surface-card) !important;
}

.case-page .table-shell tbody tr.row-selected {
  background: var(--tp-accent-primary-soft) !important;
}

.case-page .table-shell tbody tr:hover {
  background: var(--tp-surface-row-hover) !important;
}

.case-page .table-shell tbody td {
  height: 52px;
  padding: 10px 12px !important;
  border-bottom: 1px solid var(--tp-border-subtle) !important;
  color: var(--tp-text-secondary) !important;
  vertical-align: middle;
}

.case-page .table-shell tbody tr:last-child td {
  border-bottom: 0 !important;
}

.case-page .table-shell input[type='checkbox'] {
  width: 15px;
  height: 15px;
  cursor: pointer;
}

.case-page .copy-id-cell {
  cursor: copy;
  color: var(--tp-text-subtle) !important;
  font-family: var(--tp-font-family-mono);
  font-size: var(--tp-text-xs) !important;
  font-variant-numeric: tabular-nums;
}

.case-page .copy-id-cell:focus-visible {
  outline: 2px solid var(--tp-accent-primary-border);
  outline-offset: -2px;
}

.case-page .case-title-cell {
  cursor: pointer;
}

.case-page .case-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.case-page .case-title-link {
  overflow: hidden;
  color: var(--tp-text-primary) !important;
  font-size: var(--tp-text-sm);
  font-weight: var(--tp-font-semibold);
  line-height: var(--tp-line-body);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.case-page .case-title-link:hover {
  text-decoration: none;
}

.case-page .case-discarded-badge {
  flex: 0 0 auto;
  padding: 2px 6px;
  border: 1px solid var(--tp-accent-danger-border);
  border-radius: 999px;
  background: var(--tp-accent-danger-soft);
  color: var(--tp-accent-danger);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-semibold);
  line-height: var(--tp-line-ui);
}

.case-page .case-module-cell {
  overflow: hidden;
  color: var(--tp-text-muted) !important;
  max-width: 120px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.case-page .table-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  max-height: 50px;
  overflow: hidden;
}

.case-page .table-tag {
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-semibold);
  line-height: 20px;
}

.case-page .table-tag-more {
  background: var(--tp-surface-muted) !important;
  border-color: var(--tp-border-subtle) !important;
  color: var(--tp-text-muted) !important;
}

.case-page .table-empty-value {
  color: var(--tp-text-subtle);
}

.case-page .table-meta-cell {
  min-width: 0;
}

.case-page .table-meta-name {
  overflow: hidden;
  max-width: 92px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.case-page .action-group {
  display: inline-flex;
  gap: 4px;
}

.case-page .action-btn.icon-only {
  width: 30px;
  height: 30px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--tp-text-muted);
}

.case-page .action-btn.icon-only:hover {
  background: var(--tp-surface-hover);
  border-color: var(--tp-border-subtle);
  color: var(--tp-primary);
}

.case-page .action-delete:hover,
.case-page .action-discard:hover {
  background: var(--tp-accent-danger-soft);
  border-color: var(--tp-accent-danger-border);
  color: var(--tp-accent-danger);
}

.case-page .action-recover:hover {
  background: var(--tp-accent-success-soft);
  border-color: var(--tp-accent-success-border);
  color: var(--tp-accent-success);
}

.case-page .pager {
  min-height: 50px;
  border: 1px solid var(--tp-border-subtle);
  border-top: 0;
  border-radius: 0 0 14px 14px;
  background: var(--tp-surface-card);
}

.case-page {
  min-height: calc(100vh - 56px - 8px);
}

.case-page .right-table {
  gap: 4px !important;
  min-width: 0;
  min-height: calc(100vh - 56px - 8px);
  padding: 4px !important;
  border: none;
  border-radius: 0;
  background: transparent !important;
  box-shadow: none;
}

.case-page .insights-section {
  padding: 0 !important;
  border: none !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.case-page .insights-header {
  margin-bottom: 6px !important;
  padding: 0;
}

.case-page .insights-title {
  font-family: var(--tp-font-family-sans) !important;
  font-size: 18px !important;
  font-weight: var(--tp-font-bold) !important;
  line-height: var(--tp-line-tight) !important;
  letter-spacing: -0.01em !important;
  color: var(--tp-text-primary) !important;
}

.case-page .insights-desc {
  margin-top: 2px;
  font-family: var(--tp-font-family-sans) !important;
  font-size: 12px !important;
  font-weight: 400 !important;
  line-height: var(--tp-line-ui) !important;
  color: var(--tp-text-muted) !important;
}

.case-page .insights-actions {
  gap: 6px;
}

.case-page .insights-btn-primary {
  min-height: 30px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: var(--tp-font-semibold);
}

.case-page .insights-btn-primary .material-symbols-outlined {
  font-size: 16px;
}

.case-page .insights-cards {
  gap: 6px !important;
}

.case-page .insight-card {
  min-height: 68px !important;
  padding: 8px 10px !important;
  border-radius: 11px !important;
}

.case-page .insight-icon-wrap {
  width: 28px !important;
  height: 28px !important;
  border-radius: 8px;
}

.case-page .insight-icon-wrap .material-symbols-outlined {
  font-size: 17px;
}

.case-page .insight-label {
  font-size: 11px;
  line-height: var(--tp-line-ui);
}

.case-page .insight-value {
  margin: 3px 0 !important;
  font-size: 21px !important;
  line-height: 1;
}

.case-page .insight-value span {
  font-size: 12px !important;
}

.case-page .insight-trend {
  margin-top: 8px !important;
  padding: 1px 6px;
  font-size: 10px !important;
}

.case-page .insight-chart {
  height: 14px;
  gap: 2px;
}

.case-page .bar {
  width: 3px;
}

.case-page .filter-search-input :deep(.el-input__inner),
.case-page .filter-dropdown :deep(.el-select__placeholder),
.case-page .filter-dropdown :deep(.el-select__selected-item) {
  font-size: 13px;
}

.case-page .filter-dropdown {
  width: 120px;
}

.case-page .filter-dropdown:nth-child(3) {
  width: 140px;
}

.case-page .filter-chips {
  gap: 6px;
  margin-top: -2px;
}

.case-page .chip,
.case-page .chip-clear-all {
  min-height: 24px;
  padding: 3px 8px;
  font-size: 11px;
}

.case-page .table-shell {
  flex: 1 1 auto;
  border-radius: 12px 12px 0 0 !important;
}

.case-page .table-shell table {
  min-width: 1040px;
}

.case-page .table-shell th {
  height: 34px;
  padding: 7px 10px !important;
  font-size: 11px !important;
}

.case-page .table-shell tbody td {
  height: 42px;
  padding: 7px 10px !important;
  font-size: 12px;
}

.case-page .case-title-link {
  font-size: 12px;
  line-height: var(--tp-line-ui);
}

.case-page .table-shell :deep(.el-tag),
.case-page .table-tag {
  min-height: 20px;
  padding: 0 7px;
  font-size: 11px;
  line-height: 18px;
}

.case-page .table-tags {
  gap: 4px;
  max-height: 42px;
}

.case-page .table-meta-cell {
  gap: 7px;
}

.case-page .table-user-avatar,
.case-page .table-user-avatar-img {
  width: 22px;
  height: 22px;
}

.case-page .table-meta-name {
  max-width: 84px;
  font-size: 11px;
}

.case-page .table-meta-time {
  font-size: 10px;
}

.case-page .action-group {
  gap: 2px;
}

.case-page .action-btn.icon-only {
  width: 26px;
  height: 26px;
  border-radius: 7px;
}

.case-page .action-btn.icon-only .material-symbols-outlined,
.case-page .action-btn.icon-only .btn-icon {
  font-size: 15px !important;
}

.case-page .pager {
  min-height: 42px;
  padding: 6px 12px;
}

.case-page .pager :deep(.el-pagination button),
.case-page .pager :deep(.el-pager li) {
  min-width: 28px;
  height: 28px;
  border-radius: 8px;
}

@media (max-width: 1280px) {
  .case-page .insights-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
}

@media (max-width: 900px) {
  .case-page .filter-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .case-page .filter-bar-selects {
    flex-wrap: wrap;
  }
}
</style>
