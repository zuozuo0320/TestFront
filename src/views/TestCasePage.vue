<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox, ElImageViewer } from 'element-plus'
import {
  CopyDocument,
  Delete,
  Edit,
  Search,
  Grid,
  List,
} from '@element-plus/icons-vue'
import StatusBadge from '../components/StatusBadge.vue'
import LevelBadge from '../components/LevelBadge.vue'

import FileUploader from '../components/FileUploader.vue'
import {
  globalModuleTree,
  globalModuleCaseCount,
  globalUnplannedCount,
  globalSelectedModulePath,
  globalTreeExpanded,
  globalTreeActions,
} from '../composables/useTestCaseTree'

import { useProjectStore } from '../stores/project'
import {
  listTestCases,
  createTestCase,
  updateTestCase,
  deleteTestCase,
  batchDeleteTestCases,
  batchUpdateLevel,
  batchMoveTestCases,
  cloneTestCase,
  listCaseHistory,
} from '../api/testcase'
import { apiClient } from '../api/client'
import { uploadAttachment, listAttachments, deleteAttachment } from '../api/attachment'
import { importTestCases } from '../api/xlsx'
import type { TestCase, CaseAttachment } from '../api/types'

// ── Types ──

type TableRow = {
  id: number
  title: string
  level: string
  reviewResult: string
  execResult: string
  moduleId: number
  modulePath: string
  tags: string
  precondition: string
  steps: string
  remark: string
  updatedBy: number
  updatedByName: string
  updatedAt: string
  createdBy: number
  createdByName: string
  createdAt: string
  priority: string
}

type StepRow = { action: string; expected: string }

type ModuleTreeNode = { name: string; path: string; children: ModuleTreeNode[] }

// ── State ──

const projectStore = useProjectStore()

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
function collectModulePaths(nodes: ModuleTreeNode[], paths: string[] = []): string[] {
  for (const n of nodes) {
    paths.push(n.path)
    if (n.children?.length) collectModulePaths(n.children, paths)
  }
  return paths
}
const flatModules = computed(() => collectModulePaths(moduleTree.value))

// Batch move
const batchMoveVisible = ref(false)
const batchMoveTarget = ref('/未规划用例')

// Inline dropdown menu handler (MeterSphere style)
async function onNodeMenuCommand(cmd: string, path: string, name: string) {
  if (cmd === 'rename') {
    const result = await ElMessageBox.prompt('请输入新目录名称', '目录重命名', {
      inputValue: name,
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    }).catch(() => null)
    if (!result || !result.value?.trim()) return
    const oldPath = path
    const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'))
    const newPath = normalizeDirectoryPath(`${parentPath}/${result.value.trim()}`)
    customModulePaths.value = customModulePaths.value.map((p) => {
      if (p === oldPath) return newPath
      if (p.startsWith(`${oldPath}/`)) return newPath + p.substring(oldPath.length)
      return p
    })
    if (selectedProject.value) {
      for (const r of rows.value) {
        const rp = normalizeCaseModulePath(r.modulePath || '/未规划用例')
        if (rp === oldPath || rp.startsWith(`${oldPath}/`)) {
          const newModPath = newPath + rp.substring(oldPath.length)
          try {
            await updateTestCase(selectedProject.value, r.id, { module_path: newModPath })
          } catch {
            /* skip */
          }
        }
      }
      await loadCases()
    }
    ElMessage.success('重命名成功')
  } else if (cmd === 'delete') {
    removeDirectory(path)
  }
}

// Batch selection
const selectedIds = ref<number[]>([])
const selectAll = ref(false)
const customModulePaths = ref<string[]>([])
const treeExpanded = ref(true)

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
const editingId = ref<number | null>(null)
const saving = ref(false)
const stepRows = ref<StepRow[]>([{ action: '', expected: '' }])
const draggingStepIndex = ref<number | null>(null)
const directoryDialogVisible = ref(false)
const pageSizeOptions = [10, 20, 50]

const caseForm = reactive({
  title: '',
  level: 'P1',
  reviewResult: '未评审',
  execResult: '未执行',
  modulePath: '/未规划用例',
  tags: '',
  precondition: '',
  steps: '',
  remark: '',
  priority: 'medium',
})

// Attachments
const caseAttachments = ref<CaseAttachment[]>([])
const caseHistory = ref<any[]>([])

const directoryForm = reactive({ parentPath: '/', name: '' })

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

function normalizeDirectoryPath(path: string) {
  const cleaned = path.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (!cleaned) return '/'
  return `/${cleaned}`
}

function normalizeCaseModulePath(path: string) {
  const normalized = normalizeDirectoryPath(path)
  return normalized === '/' ? '/未规划用例' : normalized
}

function calcModuleDepth(path: string) {
  const normalized = normalizeDirectoryPath(path)
  if (normalized === '/') return 0
  return normalized.split('/').filter(Boolean).length
}

const modulePaths = computed(() => {
  const set = new Set<string>()
  treeRows.value.forEach((r) => {
    const normalized = normalizeCaseModulePath((r.modulePath || '').trim())
    if (normalized !== '/未规划用例') set.add(normalized)
  })
  customModulePaths.value.forEach((p) => {
    const normalized = normalizeDirectoryPath(p)
    if (normalized !== '/') set.add(normalized)
  })
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'))
})

const moduleTree = computed<ModuleTreeNode[]>(() => {
  const rootMap = new Map<string, ModuleTreeNode>()
  const ensureChild = (nodes: ModuleTreeNode[], path: string, name: string) => {
    let node = nodes.find((n) => n.path === path)
    if (!node) {
      node = { name, path, children: [] }
      nodes.push(node)
      nodes.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    }
    return node
  }
  for (const p of modulePaths.value) {
    const parts = p.split('/').filter(Boolean)
    let currentPath = ''
    let cursor: ModuleTreeNode[] = Array.from(rootMap.values())
    for (const part of parts) {
      currentPath += `/${part}`
      if (!rootMap.has(currentPath) && currentPath.split('/').filter(Boolean).length === 1) {
        rootMap.set(currentPath, { name: part, path: currentPath, children: [] })
      }
      let node: ModuleTreeNode
      if (currentPath.split('/').filter(Boolean).length === 1) {
        node = rootMap.get(currentPath)!
      } else {
        node = ensureChild(cursor, currentPath, part)
      }
      cursor = node.children
    }
  }
  return Array.from(rootMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
})

// 各目录用例计数（包含子目录）— 基于全量 treeRows 计算
const moduleCaseCount = computed(() => {
  const countMap: Record<string, number> = {}
  for (const r of treeRows.value) {
    const mp = normalizeCaseModulePath((r.modulePath || '').trim())
    // 累加到自身及所有父目录
    const parts = mp.split('/').filter(Boolean)
    let current = ''
    for (const part of parts) {
      current += `/${part}`
      countMap[current] = (countMap[current] || 0) + 1
    }
  }
  return countMap
})

const unplannedCount = computed(() => {
  return treeRows.value.filter((r) => {
    const mp = normalizeCaseModulePath((r.modulePath || '').trim())
    return mp === '/未规划用例'
  }).length
})

function onModuleClick(path: string) {
  selectedModulePath.value = selectedModulePath.value === path ? '' : path
  try {
    localStorage.setItem(`tp-module-path-${selectedProject.value}`, selectedModulePath.value)
  } catch {}
  page.value = 1
  loadCases({ skipTree: true }) // 目录切换只刷新表格，不重载树
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

watch(
  selectedModulePath,
  (val) => {
    globalSelectedModulePath.value = val
  },
  { immediate: true },
)

watch(
  treeExpanded,
  (val) => {
    globalTreeExpanded.value = val
  },
  { immediate: true },
)

globalTreeActions.onModuleClick = onModuleClick
globalTreeActions.openCreateDirectory = () => {
  directoryForm.parentPath = '/'
  directoryForm.name = ''
  directoryDialogVisible.value = true
}
globalTreeActions.openRenameDialog = (path, name) => {
  onNodeMenuCommand('rename', path, name)
}
globalTreeActions.deleteDirectory = (path) => {
  removeDirectory(path)
}
globalTreeActions.onNodeMenuCommand = (cmd, path, name) => {
  if (cmd === 'add') {
    directoryForm.parentPath = path
    directoryForm.name = ''
    directoryDialogVisible.value = true
  } else {
    onNodeMenuCommand(cmd, path, name)
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

function toRow(tc: TestCase): TableRow {
  return {
    id: tc.id,
    title: tc.title,
    level: tc.level,
    reviewResult: tc.review_result,
    execResult: tc.exec_result,
    moduleId: tc.module_id,
    modulePath: tc.module_path,
    tags: tc.tags,
    precondition: tc.precondition || '',
    steps: tc.steps,
    remark: tc.remark || '',
    updatedBy: tc.updated_by,
    updatedByName: tc.updated_by_name || '-',
    updatedAt: formatTime(tc.updated_at),
    createdBy: tc.created_by,
    createdByName: tc.created_by_name || '-',
    createdAt: formatTime(tc.created_at),
    priority: tc.priority,
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

function isPathEqualOrChild(path: string, target: string) {
  const normalizedPath = normalizeCaseModulePath(path)
  const normalizedTarget = normalizeDirectoryPath(target)
  if (normalizedTarget === '/') return true
  return normalizedPath === normalizedTarget || normalizedPath.startsWith(`${normalizedTarget}/`)
}

// ── Data Loading ──

/** 加载全量用例数据用于构建目录树（不带 module_path 过滤） */
async function loadTreeData() {
  if (!selectedProject.value) {
    treeRows.value = []
    return
  }
  try {
    const data = await listTestCases(selectedProject.value, {
      page: 1,
      pageSize: 9999,
    })
    const items = Array.isArray((data as any).items) ? (data as any).items : []
    treeRows.value = items.map(toRow)
  } catch {
    // 树数据加载失败不影响主流程
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
      module_path: selectedModulePath.value || undefined,
    })
    const items = Array.isArray((data as any).items) ? (data as any).items : []
    rows.value = items.map(toRow)
    total.value = Number((data as any).total) || 0
    page.value = Number((data as any).page) || 1
    selectedIds.value = []
    selectAll.value = false
    pageSize.value = Number((data as any).pageSize) || pageSize.value
    // 仅在非纯目录切换时刷新树数据
    if (!opts?.skipTree) {
      await loadTreeData()
    }
  } catch (e: any) {
    loadError.value = e?.response?.data?.error || '加载用例失败，请重试'
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

function openCreate() {
  editingId.value = null
  Object.assign(caseForm, {
    title: '',
    level: 'P1',
    reviewResult: '未评审',
    execResult: '未执行',
    modulePath: '/未规划用例',
    tags: '',
    precondition: '',
    steps: '',
    remark: '',
    priority: 'medium',
  })
  stepRows.value = [{ action: '', expected: '' }]
  caseAttachments.value = []
  dialogVisible.value = true
}

async function openEdit(row: TableRow) {
  editingId.value = row.id
  Object.assign(caseForm, {
    title: row.title,
    level: row.level || 'P1',
    reviewResult: row.reviewResult || '未评审',
    execResult: row.execResult || '未执行',
    modulePath: row.modulePath || '/未规划用例',
    tags: row.tags || '',
    precondition: row.precondition || '',
    steps: row.steps,
    remark: row.remark || '',
    priority: row.priority || 'medium',
  })
  stepRows.value = parseStepsToRows(row.steps)
  // Load attachments
  if (selectedProject.value && row.id) {
    try {
      const resp = await listAttachments(selectedProject.value, row.id)
      caseAttachments.value = Array.isArray(resp) ? resp : []
    } catch {
      caseAttachments.value = []
    }
    // Load history
    try {
      const resp = await listCaseHistory(selectedProject.value, row.id)
      const items = (resp as any)?.items || resp
      caseHistory.value = Array.isArray(items) ? items : []
    } catch {
      caseHistory.value = []
    }
  } else {
    caseAttachments.value = []
    caseHistory.value = []
  }
  dialogVisible.value = true
}

async function submitCase() {
  if (!selectedProject.value) return
  if (!caseForm.title.trim()) {
    ElMessage.warning('用例名称不能为空')
    return
  }
  saving.value = true
  try {
    const stepsText = rowsToStepsText(stepRows.value)
    const payload = {
      title: caseForm.title.trim(),
      level: caseForm.level,
      review_result: caseForm.reviewResult,
      exec_result: caseForm.execResult,
      module_path: caseForm.modulePath.trim(),
      tags: caseForm.tags.trim(),
      precondition: caseForm.precondition,
      steps: stepsText,
      remark: caseForm.remark,
      priority: caseForm.priority,
    }
    if (editingId.value) {
      await updateTestCase(selectedProject.value, editingId.value, payload)
      ElMessage.success('修改成功')
    } else {
      await createTestCase(selectedProject.value, payload)
      ElMessage.success('新增成功')
      page.value = 1
    }
    dialogVisible.value = false
    await loadCases()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '保存失败')
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
  try {
    await ElMessageBox.confirm(`确认批量删除 ${selectedIds.value.length} 条用例？`, '批量删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await batchDeleteTestCases(selectedProject.value, selectedIds.value)
    ElMessage.success(`已删除 ${selectedIds.value.length} 条用例`)
    selectedIds.value = []
    selectAll.value = false
    await loadCases()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '批量删除失败')
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
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '批量修改失败')
  }
}

async function onBatchMove() {
  if (!selectedProject.value || selectedIds.value.length === 0) return
  try {
    await batchMoveTestCases(selectedProject.value, selectedIds.value, 0, batchMoveTarget.value)
    ElMessage.success(`已移动 ${selectedIds.value.length} 条用例到 ${batchMoveTarget.value}`)
    selectedIds.value = []
    selectAll.value = false
    batchMoveVisible.value = false
    await loadCases()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '批量移动失败')
  }
}

async function onCloneCase(row: TableRow) {
  if (!selectedProject.value) return
  try {
    await cloneTestCase(selectedProject.value, row.id)
    ElMessage.success('复制成功')
    await loadCases()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '复制失败')
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

// ── Attachments ──

const apiBaseUrl = apiClient.defaults.baseURL || 'http://localhost:8080/api/v1'
const serverUrl = apiBaseUrl.replace(/\/api\/v1\/?$/, '')

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

async function onUploadAttachment(file: File) {
  if (!selectedProject.value || !editingId.value) {
    ElMessage.warning('请先保存用例后再上传附件')
    return
  }
  try {
    const att = await uploadAttachment(selectedProject.value, editingId.value, file)
    if (att) caseAttachments.value.push(att as any)
    ElMessage.success('附件上传成功')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '上传失败')
  }
}

async function onRemoveAttachment(id: number) {
  if (!selectedProject.value) return
  try {
    await deleteAttachment(selectedProject.value, id)
    caseAttachments.value = caseAttachments.value.filter((a) => a.id !== id)
    ElMessage.success('附件已删除')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '删除附件失败')
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

// ── Import / Export ──

async function onImportXlsx(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length || !selectedProject.value) return
  const file = input.files[0]
  if (!file) return
  input.value = ''
  try {
    appLoading.value = true
    const resp = await importTestCases(selectedProject.value, file)
    const created = (resp as any)?.created || 0
    const skipped = (resp as any)?.skipped || 0
    ElMessage.success(`导入完成：成功 ${created} 条，跳过 ${skipped} 条`)
    await loadCases()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '导入失败')
  } finally {
    appLoading.value = false
  }
}

async function onDelete(row: TableRow) {
  if (!selectedProject.value) return
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
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '删除失败')
  }
}

// ── Directory ──

function submitDirectory() {
  const parent = normalizeDirectoryPath(directoryForm.parentPath || '/')
  const name = directoryForm.name.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (!name) {
    ElMessage.warning('目录名称不能为空')
    return
  }
  if (!/^[\u4e00-\u9fa5A-Za-z0-9_-]+$/.test(name)) {
    ElMessage.warning('目录名称仅支持中文、英文、数字、下划线、中划线')
    return
  }
  const nextPath = normalizeDirectoryPath(`${parent}/${name}`)
  if (calcModuleDepth(nextPath) > 5) {
    ElMessage.warning('目录最多支持 5 层')
    return
  }
  if (modulePaths.value.includes(nextPath)) {
    ElMessage.warning('目录已存在')
    return
  }
  customModulePaths.value.push(nextPath)
  caseForm.modulePath = nextPath
  directoryDialogVisible.value = false
  ElMessage.success('创建成功')
}

async function removeDirectory(path: string) {
  const target = normalizeDirectoryPath(path)
  if (target === '/') {
    ElMessage.warning('根目录不可删除')
    return
  }
  if (!selectedProject.value) {
    ElMessage.warning('请先选择项目')
    return
  }
  const childDirs = modulePaths.value.filter((p) => p !== target && p.startsWith(`${target}/`))
  if (childDirs.length > 0) {
    ElMessage.warning('仅支持从最下级目录开始删除，请先删除子目录')
    return
  }
  const boundCases = rows.value.filter((r) =>
    isPathEqualOrChild(r.modulePath || '/未规划用例', target),
  )
  try {
    await ElMessageBox.confirm(
      `确认删除目录 ${target}（含 ${boundCases.length} 条用例）？`,
      '删除确认',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    for (const tc of boundCases) await deleteTestCase(selectedProject.value, tc.id)
    customModulePaths.value = customModulePaths.value.filter((p) => !isPathEqualOrChild(p, target))
    if (isPathEqualOrChild(caseForm.modulePath || '/未规划用例', target))
      caseForm.modulePath = '/未规划用例'
    const maxAfterDelete = Math.max(
      1,
      Math.ceil((total.value - boundCases.length) / pageSize.value),
    )
    if (page.value > maxAfterDelete) page.value = maxAfterDelete
    await loadCases()
    ElMessage.success(`删除成功（${boundCases.length} 条）`)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '删除目录失败')
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
            <h2 class="insights-title">智能洞察 (Intelligent Insights)</h2>
            <p class="insights-desc">实时监控项目质量指标与测试进度。</p>
          </div>
          <div class="insights-actions">
            <button class="insights-btn-secondary">
              <span class="material-symbols-outlined shrink-0" style="font-size: 18px">
                calendar_today
              </span>
              最近 7 天
            </button>
            <button class="insights-btn-primary">
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
              accept=".xlsx"
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
                <div class="bar" style="height: 40%; background: #a78bfa"></div>
                <div class="bar" style="height: 60%; background: #8b5cf6"></div>
                <div class="bar" style="height: 80%; background: #7c3aed"></div>
                <div class="bar" style="height: 50%; background: #6d28d9"></div>
                <div class="bar" style="height: 100%; background: #c4b5fd"></div>
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
                <div class="bar" style="height: 30%; background: #60a5fa"></div>
                <div class="bar" style="height: 50%; background: #3b82f6"></div>
                <div class="bar" style="height: 90%; background: #2563eb"></div>
                <div class="bar" style="height: 70%; background: #93c5fd"></div>
                <div class="bar" style="height: 60%; background: #1d4ed8"></div>
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
                <div class="bar" style="height: 80%; background: #f87171"></div>
                <div class="bar" style="height: 40%; background: #ef4444"></div>
                <div class="bar" style="height: 60%; background: #b91c1c"></div>
                <div class="bar" style="height: 30%; background: #fca5a5"></div>
                <div class="bar" style="height: 50%; background: #dc2626"></div>
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
                <div class="bar" style="height: 100%; background: #fb923c"></div>
                <div class="bar" style="height: 80%; background: #f97316"></div>
                <div class="bar" style="height: 60%; background: #fdba74"></div>
                <div class="bar" style="height: 40%; background: #ea580c"></div>
                <div class="bar" style="height: 30%; background: #c2410c"></div>
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
          <el-select
            v-model="reviewFilter"
            placeholder="所属模块"
            clearable
            size="default"
            class="filter-dropdown"
            @change="onSearch"
          >
            <el-option v-for="m in flatModules" :key="m" :label="m" :value="m" />
          </el-select>
          <button class="filter-icon-btn" title="高级筛选" @click="filterPanelVisible = true">
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
                  <span class="material-symbols-outlined" style="color: #60a5fa">play_circle</span>
                  <span>批量执行</span>
                </button>
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
                <button class="batch-action-item">
                  <span class="material-symbols-outlined" style="color: #34d399">label</span>
                  <span>打标签</span>
                </button>
                <button class="batch-action-item" @click="batchMoveVisible = true">
                  <span class="material-symbols-outlined" style="color: #94a3b8">drive_file_move</span>
                  <span>批量移动</span>
                </button>
                <button class="batch-action-item batch-action-danger" @click="onBatchDelete">
                  <span class="material-symbols-outlined">delete</span>
                  <span>批量删除</span>
                </button>
                <div class="batch-divider"></div>
                <button class="batch-close" @click="selectedIds = []; selectAll = false">
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
                  :checked="selectAll"
                  @change="selectAll = !selectAll; toggleSelectAll()"
                />
              </th>
              <th style="width: 80px" class="sortable" @click="toggleSort('id')">
                ID
                <span class="sort-flag" :class="{ active: sortBy === 'id' }">
                  {{ sortBy === 'id' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}
                </span>
              </th>
              <th>用例名称</th>
              <th style="width: 80px">优先级</th>
              <th style="width: 140px">所属模块</th>
              <th style="width: 80px">评审结果</th>
              <th style="width: 80px">状态</th>
              <th style="width: 120px">标签</th>
              <th style="width: 110px">负责人</th>
              <th style="width: 100px" class="sortable" @click="toggleSort('updated_at')">
                更新时间
                <span class="sort-flag" :class="{ active: sortBy === 'updated_at' }">
                  {{ sortBy === 'updated_at' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}
                </span>
              </th>
              <th style="width: 110px">创建人</th>
              <th style="width: 100px" class="sortable" @click="toggleSort('created_at')">
                创建时间
                <span class="sort-flag" :class="{ active: sortBy === 'created_at' }">
                  {{ sortBy === 'created_at' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}
                </span>
              </th>
              <th style="width: 140px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loadError">
              <td colspan="13" class="empty-td">
                {{ loadError }}
                <el-button size="small" style="margin-left: 10px" @click="loadCases">
                  重试
                </el-button>
              </td>
            </tr>
            <tr v-else-if="rows.length === 0">
              <td colspan="13" class="empty-td testcase-empty-cell">
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
                  :checked="selectedIds.includes(r.id)"
                  @change="toggleSelectRow(r.id)"
                />
              </td>
              <td
                class="id"
                style="cursor: pointer"
                title="点击复制 ID"
                @click="copyIdToClipboard(r.id)"
              >
                {{ r.id }}
              </td>
              <td class="name" :title="r.title">
                <strong>{{ r.title }}</strong>
              </td>
              <td><LevelBadge :level="r.level" /></td>
              <td>
                {{ (r.modulePath || '').split('/').filter(Boolean).pop() || '未分类' }}
              </td>
              <td><StatusBadge :value="r.reviewResult" /></td>
              <td><StatusBadge :value="r.execResult" /></td>
              <td :title="r.tags || '-'">
                <div v-if="r.tags" style="display: flex; gap: 4px; flex-wrap: wrap">
                  <span v-for="t in r.tags.split(',')" :key="t" class="table-tag">
                    {{ t.trim() }}
                  </span>
                </div>
                <span v-else style="color: var(--tp-gray-500)">-</span>
              </td>
              <td>
                <div class="table-user">
                  <div class="table-user-avatar">
                    {{ r.updatedByName ? r.updatedByName.substring(0, 1).toUpperCase() : 'U' }}
                  </div>
                  <span class="table-user-name">{{ r.updatedByName }}</span>
                </div>
              </td>
              <td>
                <span style="color: var(--tp-gray-500); font-size: 12px">
                  {{ formatRelativeTime(r.updatedAt) }}
                </span>
              </td>
              <td>
                <div class="table-user">
                  <div class="table-user-avatar">
                    {{ r.createdByName ? r.createdByName.substring(0, 1).toUpperCase() : 'C' }}
                  </div>
                  <span class="table-user-name">{{ r.createdByName }}</span>
                </div>
              </td>
              <td>
                <span style="color: var(--tp-gray-500); font-size: 12px">
                  {{ formatRelativeTime(r.createdAt) }}
                </span>
              </td>
              <td>
                <div class="action-group">
                  <button class="action-btn action-edit icon-only" @click="openEdit(r)">
                    <el-icon class="btn-icon"><Edit /></el-icon>
                    <span>编辑</span>
                  </button>
                  <button class="action-btn action-clone icon-only" @click="onCloneCase(r)">
                    <el-icon class="btn-icon"><CopyDocument /></el-icon>
                    <span>复制</span>
                  </button>
                  <button class="action-btn action-delete icon-only" @click="onDelete(r)">
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
        <el-pagination
          background
          size="small"
          :current-page="page"
          :page-size="pageSize"
          :page-sizes="pageSizeOptions"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
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
            <div style="display: flex; gap: 8px; align-items: center">
              <el-date-picker
                v-model="createdAfter"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="开始日期"
                clearable
                style="flex: 1"
              />
              <span style="color: rgba(255, 255, 255, 0.3)">~</span>
              <el-date-picker
                v-model="createdBefore"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="结束日期"
                clearable
                style="flex: 1"
              />
            </div>
          </el-form-item>
          <el-form-item label="更新时间">
            <div style="display: flex; gap: 8px; align-items: center">
              <el-date-picker
                v-model="updatedAfter"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="开始日期"
                clearable
                style="flex: 1"
              />
              <span style="color: rgba(255, 255, 255, 0.3)">~</span>
              <el-date-picker
                v-model="updatedBefore"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="结束日期"
                clearable
                style="flex: 1"
              />
            </div>
          </el-form-item>
        </el-form>
        <div class="advanced-filter-actions">
          <el-button @click="filterPanelVisible = false">取消</el-button>
          <el-button class="btn-reset" @click="onResetSearch">重置</el-button>
          <el-button class="btn-query" @click="applyAdvancedFilters">应用筛选</el-button>
        </div>
      </div>
    </el-drawer>

    <!-- Batch move dialog -->
    <el-dialog v-model="batchMoveVisible" title="批量移动" width="400px" :append-to-body="true">
      <el-form label-position="top">
        <el-form-item label="目标目录">
          <el-select v-model="batchMoveTarget" style="width: 100%">
            <el-option label="/未规划用例" value="/未规划用例" />
            <el-option v-for="p in modulePaths" :key="p" :label="p" :value="p" />
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

    <!-- Case editor drawer (Stitch Redesign) -->
    <el-drawer
      v-model="dialogVisible"
      :with-header="false"
      size="92%"
      direction="rtl"
      class="stitch-case-drawer"
    >
      <div class="stitch-drawer-wrapper">
        <!-- Header / Breadcrumbs -->
        <div class="stitch-header">
          <div class="stitch-header-left">
            <nav class="stitch-breadcrumb">
              <a href="#">项目管理</a>
              <span class="material-symbols-outlined breadcrumb-icon">chevron_right</span>
              <a href="#">
                {{
                  projectStore.projects.find((p) => p.id === selectedProject)?.name || '未知项目'
                }}
              </a>
              <span class="material-symbols-outlined breadcrumb-icon">chevron_right</span>
              <template v-if="caseForm.modulePath && caseForm.modulePath !== '/未规划用例'">
                <a href="#">{{ caseForm.modulePath }}</a>
                <span class="material-symbols-outlined breadcrumb-icon">chevron_right</span>
              </template>
              <span class="breadcrumb-active">
                {{ editingId ? '编辑测试用例' : '新建测试用例' }}
              </span>
            </nav>
            <h1 class="stitch-title">
              <template v-if="editingId">
                {{ caseForm.title || '' }}
              </template>
              <template v-else>新建测试用例</template>
            </h1>
          </div>
          <div class="stitch-header-right">
            <button class="stitch-btn-cancel" @click="dialogVisible = false">取消</button>
            <button class="stitch-btn-save" :class="{ 'is-loading': saving }" @click="submitCase">
              保存用例
            </button>
          </div>
        </div>

        <!-- Main Layout: Bento Style -->
        <div class="stitch-grid">
          <!-- Left Column: Core Editor -->
          <div class="stitch-col-left">
            <!-- Section 1: Basic Information -->
            <section class="stitch-panel relative stitch-panel-accent overflow-hidden">
              <div class="stitch-panel-accent-bar"></div>
              <h3 class="stitch-panel-title">
                <span class="material-symbols-outlined">info</span>
                基本信息
              </h3>

              <div class="stitch-form-grid">
                <!-- Use Case Name -->
                <div class="stitch-form-item col-span-full">
                  <label>用例名称</label>
                  <input
                    v-model="caseForm.title"
                    type="text"
                    class="stitch-input"
                    placeholder="请输入用例名称"
                  />
                </div>

                <!-- Priority / Level -->
                <div class="stitch-form-item">
                  <label>优先级</label>
                  <div class="stitch-select-wrapper">
                    <select v-model="caseForm.level" class="stitch-select">
                      <option value="P0">P0 - 紧急</option>
                      <option value="P1">P1 - 高</option>
                      <option value="P2">P2 - 中</option>
                      <option value="P3">P3 - 低</option>
                    </select>
                    <span class="material-symbols-outlined select-icon">expand_more</span>
                  </div>
                </div>

                <!-- Module Path -->
                <div class="stitch-form-item">
                  <label>所属模块</label>
                  <div class="stitch-select-wrapper">
                    <select v-model="caseForm.modulePath" class="stitch-select">
                      <option value="/未规划用例">/未规划用例</option>
                      <option v-for="p in modulePaths" :key="p" :value="p">{{ p }}</option>
                    </select>
                    <span class="material-symbols-outlined select-icon">account_tree</span>
                  </div>
                </div>

                <!-- Review Status -->
                <div class="stitch-form-item">
                  <label>评审状态</label>
                  <div class="stitch-select-wrapper">
                    <select v-model="caseForm.reviewResult" class="stitch-select">
                      <option value="未评审">未评审</option>
                      <option value="已通过">已通过</option>
                      <option value="不通过">不通过</option>
                      <option value="重新提审">重新提审</option>
                    </select>
                    <span class="material-symbols-outlined select-icon">expand_more</span>
                  </div>
                </div>

                <!-- Exec Status -->
                <div class="stitch-form-item">
                  <label>执行状态</label>
                  <div class="stitch-select-wrapper">
                    <select v-model="caseForm.execResult" class="stitch-select">
                      <option value="未执行">未执行</option>
                      <option value="成功">成功</option>
                      <option value="失败">失败</option>
                      <option value="阻塞">阻塞</option>
                    </select>
                    <span class="material-symbols-outlined select-icon">expand_more</span>
                  </div>
                </div>

                <!-- Tags -->
                <div class="stitch-form-item col-span-full">
                  <label>标签</label>
                  <input
                    v-model="caseForm.tags"
                    type="text"
                    class="stitch-input"
                    placeholder="多个标签以逗号分隔，如: smoke, core"
                  />
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
                ></textarea>
              </section>
              <section class="stitch-panel">
                <h3 class="stitch-panel-title">
                  <span class="material-symbols-outlined">logout</span>
                  后置条件
                </h3>
                <textarea
                  class="stitch-textarea"
                  rows="3"
                  disabled
                  placeholder="后端暂不支持后置条件，展示占位用。"
                >
1. 跳转至首页仪表盘
2. 本地 Token 已持久化存储</textarea
                >
              </section>
            </div>

            <!-- Section 3: Test Steps -->
            <section class="stitch-panel stitch-steps-panel">
              <div class="stitch-steps-header">
                <h3 class="stitch-panel-title m-0">
                  <span class="material-symbols-outlined">list_alt</span>
                  测试步骤
                </h3>
                <button class="stitch-btn-text" @click="addStepRow">
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
                        ></textarea>
                      </td>
                      <td class="col-expect">
                        <textarea
                          v-model="st.expected"
                          class="stitch-table-input"
                          rows="1"
                          placeholder="输入预期结果..."
                        ></textarea>
                      </td>
                      <td class="col-op text-center">
                        <button class="stitch-btn-del" @click="removeStepRow(idx)">
                          <span class="material-symbols-outlined">delete</span>
                        </button>
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
                <div class="stitch-textarea-toolbar">
                  <button class="format-btn">
                    <span class="material-symbols-outlined">format_quote</span>
                  </button>
                  <button class="format-btn">
                    <span class="material-symbols-outlined">code</span>
                  </button>
                  <button class="format-btn">
                    <span class="material-symbols-outlined">attachment</span>
                  </button>
                </div>
                <!-- Binding remark here -->
                <textarea
                  v-model="caseForm.remark"
                  class="stitch-textarea no-border"
                  rows="4"
                  placeholder="添加补充备注信息，如测试账号、特定设备说明等..."
                ></textarea>
              </div>
            </section>
          </div>

          <!-- Right Column: Sidebar Metadata -->
          <div class="stitch-col-right">
            <!-- Version Metadata -->
            <section class="stitch-panel">
              <h3 class="stitch-subtitle">版本追踪</h3>
              <div class="stitch-meta-list">
                <div class="stitch-meta-row flex-between">
                  <span class="meta-label">当前版本</span>
                  <span class="meta-value bold primary">v1.4.2</span>
                </div>
                <div class="stitch-meta-row flex-between">
                  <span class="meta-label">维护者</span>
                  <div class="meta-user">
                    <div class="meta-avatar">{{ caseForm.title ? 'L' : '管' }}</div>
                    <span>林语</span>
                  </div>
                </div>
                <div class="stitch-meta-row flex-between">
                  <span class="meta-label">更新于</span>
                  <span class="meta-value">2023-10-24 14:30</span>
                </div>

                <div class="stitch-meta-divider"></div>

                <div class="stitch-meta-row">
                  <div class="meta-label" style="font-size: 10px; text-transform: uppercase">
                    历史缺陷关联
                  </div>
                  <div class="meta-tags-wrap mt-2">
                    <span class="meta-tag tag-error">BUG-4012</span>
                    <span class="meta-tag tag-secondary">BUG-3921</span>
                  </div>
                </div>
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
                    <button class="icon-only" title="预览图片" @click="openImagePreview(att)">
                      <span class="material-symbols-outlined" style="color: white; font-size: 20px">
                        visibility
                      </span>
                    </button>
                    <button
                      class="icon-only"
                      title="下载"
                      style="margin-left: 8px"
                      @click="downloadAttachment(att)"
                    >
                      <span class="material-symbols-outlined" style="color: white; font-size: 20px">
                        download
                      </span>
                    </button>
                    <button
                      class="icon-only"
                      title="删除"
                      style="margin-left: 8px"
                      @click.stop="onRemoveAttachment(att.id)"
                    >
                      <span
                        class="material-symbols-outlined"
                        style="color: #ff5252; font-size: 20px"
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
                    <button class="icon-only" title="下载" @click="downloadAttachment(att)">
                      <span class="material-symbols-outlined" style="color: white; font-size: 20px">
                        download
                      </span>
                    </button>
                    <button
                      class="icon-only"
                      title="删除"
                      style="margin-left: 8px"
                      @click.stop="onRemoveAttachment(att.id)"
                    >
                      <span
                        class="material-symbols-outlined"
                        style="color: #ff5252; font-size: 20px"
                      >
                        delete
                      </span>
                    </button>
                  </div>
                </div>

                <div class="upload-area col-span-full mt-1">
                  <!-- FileUploader replaces the click area but keeps original functionality. We pass [] to hide its internal list -->
                  <FileUploader
                    :files="[]"
                    :project-id="selectedProject ?? undefined"
                    @upload="onUploadAttachment"
                  />
                  <!-- fallback text just in case -->
                  <div
                    v-if="!editingId"
                    style="
                      font-size: 10px;
                      color: rgba(255, 255, 255, 0.4);
                      text-align: center;
                      padding: 10px;
                    "
                  >
                    请先保存用例后再上传附件
                  </div>
                </div>
              </div>
            </section>

            <!-- Recent Activity -->
            <section class="stitch-panel">
              <h3 class="stitch-subtitle">最新动态</h3>
              <div class="stitch-timeline">
                <div class="timeline-line"></div>

                <div class="timeline-item flex gap-4 relative">
                  <div class="timeline-icon bg-secondary z-10 shrink-0">
                    <span class="material-symbols-outlined text-white text-sm">edit</span>
                  </div>
                  <div class="timeline-content flex-1">
                    <p class="text-xs leading-tight">
                      <span class="font-bold text-secondary">李薇</span>
                      更新了预期结果
                    </p>
                    <p class="time italic">10 分钟前</p>
                  </div>
                </div>

                <div class="timeline-item flex gap-4 relative">
                  <div class="timeline-icon bg-normal border-outline z-10 shrink-0">
                    <span class="material-symbols-outlined text-outline text-sm">add</span>
                  </div>
                  <div class="timeline-content flex-1">
                    <p class="text-xs leading-tight">
                      <span class="font-bold text-white">张强</span>
                      添加了视觉辅助截图
                    </p>
                    <p class="time italic">1 小时前</p>
                  </div>
                </div>

                <div class="timeline-item flex gap-4 relative">
                  <div class="timeline-icon bg-primary z-10 shrink-0">
                    <span class="material-symbols-outlined text-white text-sm">history</span>
                  </div>
                  <div class="timeline-content flex-1">
                    <p class="text-xs leading-tight">
                      版本自
                      <span class="font-mono bg-white-5">v1.4.1</span>
                      升至
                      <span class="font-mono bg-white-5">v1.4.2</span>
                    </p>
                    <p class="time italic">昨天 16:45</p>
                  </div>
                </div>
              </div>
              <button class="stitch-btn-link w-full mt-6 text-center text-outline">
                查看完整审计日志
              </button>
            </section>

            <!-- AI Bot -->
            <section class="stitch-ai-panel rounded-xl p-6 relative">
              <div class="ai-header flex items-center gap-3 mb-4">
                <div
                  class="ai-icon w-8 h-8 rounded-full bg-primary flex items-center justify-center"
                >
                  <span class="material-symbols-outlined text-white text-sm">smart_toy</span>
                </div>
                <div>
                  <h4 class="text-sm font-bold text-white leading-none">AI 智检助手</h4>
                  <span class="text-xs text-primary-dim uppercase tracking-wider">
                    智能审计可用
                  </span>
                </div>
              </div>
              <p class="text-xs text-variant leading-relaxed mb-4">
                我已分析您的测试步骤。发现步骤 02
                可能存在冗余，是否需要自动优化步骤逻辑以提高执行效率？
              </p>
              <button
                class="ai-btn w-full py-2 bg-white-10 hover:bg-white-20 text-xs font-bold text-primary-dim rounded-lg transition-all border border-white-10"
              >
                执行智能优化
              </button>
            </section>
          </div>
        </div>

        <div style="height: 48px"></div>
      </div>
    </el-drawer>

    <!-- Directory dialog -->
    <el-dialog v-model="directoryDialogVisible" title="新建目录" width="520px">
      <el-form label-position="top">
        <el-form-item label="父级目录">
          <el-select v-model="directoryForm.parentPath" placeholder="请选择父级目录">
            <el-option label="全部用例（根目录）" value="/" />
            <el-option v-for="p in modulePaths" :key="p" :label="p" :value="p" />
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
</style>
