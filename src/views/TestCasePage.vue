<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CaretBottom,
  CaretRight,
  CaretTop,
  CopyDocument,
  Delete,
  Document,
  Edit,
  FolderAdd,
  Folder,
  FolderOpened,
  CircleCheck,
  MoreFilled,
  Sort,
  Search,
  Grid,
  List,
  Plus,
} from '@element-plus/icons-vue'
import StatusBadge from '../components/StatusBadge.vue'
import LevelBadge from '../components/LevelBadge.vue'
import RichTextEditor from '../components/RichTextEditor.vue'
import FileUploader from '../components/FileUploader.vue'
import { Atom as LuAtom } from 'lucide-vue-next'
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
import { uploadAttachment, listAttachments, deleteAttachment } from '../api/attachment'
import { importTestCases } from '../api/xlsx'
import type { Project, TestCase, CaseAttachment } from '../api/types'

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
const projects = computed(() => projectStore.projects)
const selectedProject = computed(() => projectStore.selectedProjectId)
const rows = ref<TableRow[]>([])
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
  const passed = rows.value.filter(r => isExecPass(r.execResult)).length
  return Math.round((passed / rows.value.length) * 100)
})
const metricCoverage = computed(() => {
  if (rows.value.length === 0) return 0
  const executed = rows.value.filter(r => r.execResult && r.execResult !== '未执行').length
  return Math.round((executed / rows.value.length) * 100)
})
const metricWeeklyNew = computed(() => {
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
  return rows.value.filter(r => {
    if (!r.createdAt) return false
    return new Date(r.createdAt) >= oneWeekAgo
  }).length
})

// Kanban grouped data
const kanbanColumns = computed(() => [
  { key: 'pending', label: '待评审', color: '#94a3b8', items: rows.value.filter(r => !r.reviewResult || r.reviewResult === '未评审') },
  { key: 'running', label: '进行中', color: '#06b6d4', items: rows.value.filter(r => isReviewPass(r.reviewResult) && (!r.execResult || r.execResult === '未执行')) },
  { key: 'passed', label: '已通过', color: '#10b981', items: rows.value.filter(r => isExecPass(r.execResult)) },
  { key: 'failed', label: '已失败', color: '#ef4444', items: rows.value.filter(r => isExecFail(r.execResult)) },
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

// Directory context menu
const ctxMenu = reactive({ visible: false, x: 0, y: 0, path: '', name: '' })
function closeCtxMenu() { ctxMenu.visible = false }

// Inline dropdown menu handler (MeterSphere style)
async function onNodeMenuCommand(cmd: string, path: string, name: string) {
  if (cmd === 'rename') {
    const result = await ElMessageBox.prompt('请输入新目录名称', '目录重命名', {
      inputValue: name, confirmButtonText: '确定', cancelButtonText: '取消',
    }).catch(() => null)
    if (!result || !result.value?.trim()) return
    const oldPath = path
    const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'))
    const newPath = normalizeDirectoryPath(`${parentPath}/${result.value.trim()}`)
    customModulePaths.value = customModulePaths.value.map(p => {
      if (p === oldPath) return newPath
      if (p.startsWith(`${oldPath}/`)) return newPath + p.substring(oldPath.length)
      return p
    })
    if (selectedProject.value) {
      for (const r of rows.value) {
        const rp = normalizeCaseModulePath(r.modulePath || '/未规划用例')
        if (rp === oldPath || rp.startsWith(`${oldPath}/`)) {
          const newModPath = newPath + rp.substring(oldPath.length)
          try { await updateTestCase(selectedProject.value, r.id, { module_path: newModPath }) } catch { /* skip */ }
        }
      }
      await loadCases()
    }
    ElMessage.success('重命名成功')
  } else if (cmd === 'delete') {
    removeDirectory(path)
  }
}
async function ctxAddSubDir() {
  closeCtxMenu()
  directoryForm.parentPath = ctxMenu.path
  directoryForm.name = ''
  directoryDialogVisible.value = true
}
async function ctxRename() {
  closeCtxMenu()
  const result = await ElMessageBox.prompt('请输入新目录名称', '目录重命名', {
    inputValue: ctxMenu.name, confirmButtonText: '确定', cancelButtonText: '取消',
  }).catch(() => null)
  if (!result || !result.value?.trim()) return
  const oldPath = ctxMenu.path
  const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'))
  const newPath = normalizeDirectoryPath(`${parentPath}/${result.value.trim()}`)
  // rename in customModulePaths
  customModulePaths.value = customModulePaths.value.map(p => {
    if (p === oldPath) return newPath
    if (p.startsWith(`${oldPath}/`)) return newPath + p.substring(oldPath.length)
    return p
  })
  // rename in case module paths via API
  if (selectedProject.value) {
    for (const r of rows.value) {
      const rp = normalizeCaseModulePath(r.modulePath || '/未规划用例')
      if (rp === oldPath || rp.startsWith(`${oldPath}/`)) {
        const newModPath = newPath + rp.substring(oldPath.length)
        try { await updateTestCase(selectedProject.value, r.id, { module_path: newModPath }) } catch { /* skip */ }
      }
    }
    await loadCases()
  }
  ElMessage.success('重命名成功')
}
function ctxDelete() {
  closeCtxMenu()
  removeDirectory(ctxMenu.path)
}

// Batch selection
const selectedIds = ref<number[]>([])
const selectAll = ref(false)
const customModulePaths = ref<string[]>([])
const treeExpanded = ref(true)
const treePanelOpen = ref(true)
const projectDropdownOpen = ref(false)
const selectedProjectMeta = computed(() => {
  return projects.value.find(proj => proj.id === selectedProject.value) || null
})
const selectedProjectArchived = computed(() => selectedProjectMeta.value?.status === 'archived')
const currentProjectName = computed(() => {
  return selectedProjectMeta.value?.name || '选择项目'
})
const selectedModulePath = ref((() => {
  try {
    const saved = localStorage.getItem(`tp-module-path-${selectedProject.value}`)
    return saved ?? ''
  } catch { return '' }
})())  // '' = 全部, '/未规划用例' = 未规划, '/xxx' = 特定目录

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
const historyExpanded = ref(false)

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
  rows.value.forEach((r) => {
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

// 各目录用例计数（包含子目录）
const moduleCaseCount = computed(() => {
  const countMap: Record<string, number> = {}
  for (const r of rows.value) {
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
  return rows.value.filter(r => {
    const mp = normalizeCaseModulePath((r.modulePath || '').trim())
    return mp === '/未规划用例'
  }).length
})

function onModuleClick(path: string) {
  selectedModulePath.value = selectedModulePath.value === path ? '' : path
  try { localStorage.setItem(`tp-module-path-${selectedProject.value}`, selectedModulePath.value) } catch {}
  page.value = 1
  loadCases()
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
  const raw = (text || '').split('\n').map((s) => s.trim()).filter(Boolean)
  if (raw.length === 0) return [{ action: '', expected: '' }]
  const result = raw.map((line) => {
    const parts = line.split('|')
    if (parts.length >= 2) return { action: (parts[0] ?? '').trim(), expected: parts.slice(1).join('|').trim() }
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

async function loadCases() {
  loadError.value = ''
  if (!selectedProject.value) {
    rows.value = []
    total.value = 0
    page.value = 1
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
  } catch (e: any) {
    loadError.value = e?.response?.data?.error || '加载用例失败，请重试'
    ElMessage.error(loadError.value)
  } finally {
    appLoading.value = false
  }
}

// ── Filters & Pagination ──

function onSearch() { page.value = 1; loadCases() }
function onResetSearch() { keyword.value = ''; levelFilter.value = ''; reviewFilter.value = ''; execFilter.value = ''; tagsFilter.value = ''; creatorFilter.value = ''; updaterFilter.value = ''; createdAfter.value = ''; createdBefore.value = ''; updatedAfter.value = ''; updatedBefore.value = ''; page.value = 1; loadCases() }
function onPaginationSizeChange(size: number) { pageSize.value = size; page.value = 1; loadCases() }
function onPaginationCurrentChange(current: number) { page.value = current; loadCases() }
function toggleSort(field: 'id' | 'created_at' | 'updated_at') {
  if (sortBy.value === field) { sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc' }
  else { sortBy.value = field; sortOrder.value = 'desc' }
  page.value = 1; loadCases()
}
function clearOneFilter(kind: 'keyword' | 'level' | 'review' | 'exec') {
  if (kind === 'keyword') keyword.value = ''
  if (kind === 'level') levelFilter.value = ''
  if (kind === 'review') reviewFilter.value = ''
  if (kind === 'exec') execFilter.value = ''
  page.value = 1; loadCases()
}
function applyAdvancedFilters() { filterPanelVisible.value = false; page.value = 1; loadCases() }

// ── CRUD ──

function openCreate() {
  editingId.value = null
  Object.assign(caseForm, { title: '', level: 'P1', reviewResult: '未评审', execResult: '未执行', modulePath: '/未规划用例', tags: '', precondition: '', steps: '', remark: '', priority: 'medium' })
  stepRows.value = [{ action: '', expected: '' }]
  caseAttachments.value = []
  dialogVisible.value = true
}

async function openEdit(row: TableRow) {
  editingId.value = row.id
  Object.assign(caseForm, { title: row.title, level: row.level || 'P1', reviewResult: row.reviewResult || '未评审', execResult: row.execResult || '未执行', modulePath: row.modulePath || '/未规划用例', tags: row.tags || '', precondition: row.precondition || '', steps: row.steps, remark: row.remark || '', priority: row.priority || 'medium' })
  stepRows.value = parseStepsToRows(row.steps)
  // Load attachments
  if (selectedProject.value && row.id) {
    try {
      const resp = await listAttachments(selectedProject.value, row.id)
      caseAttachments.value = Array.isArray(resp) ? resp : []
    } catch { caseAttachments.value = [] }
    // Load history
    try {
      const resp = await listCaseHistory(selectedProject.value, row.id)
      const items = (resp as any)?.items || resp
      caseHistory.value = Array.isArray(items) ? items : []
    } catch { caseHistory.value = [] }
  } else {
    caseAttachments.value = []
    caseHistory.value = []
  }
  dialogVisible.value = true
}

async function submitCase() {
  if (!selectedProject.value) return
  if (!caseForm.title.trim()) { ElMessage.warning('用例名称不能为空'); return }
  saving.value = true
  try {
    const stepsText = rowsToStepsText(stepRows.value)
    const payload = { title: caseForm.title.trim(), level: caseForm.level, review_result: caseForm.reviewResult, exec_result: caseForm.execResult, module_path: caseForm.modulePath.trim(), tags: caseForm.tags.trim(), precondition: caseForm.precondition, steps: stepsText, remark: caseForm.remark, priority: caseForm.priority }
    if (editingId.value) { await updateTestCase(selectedProject.value, editingId.value, payload); ElMessage.success('修改成功') }
    else { await createTestCase(selectedProject.value, payload); ElMessage.success('新增成功'); page.value = 1 }
    dialogVisible.value = false
    await loadCases()
  } catch (e: any) { ElMessage.error(e?.response?.data?.error || '保存失败') }
  finally { saving.value = false }
}

// ── Batch Operations ──

function toggleSelectAll() {
  if (selectAll.value) {
    selectedIds.value = rows.value.map(r => r.id)
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
    await ElMessageBox.confirm(`确认批量删除 ${selectedIds.value.length} 条用例？`, '批量删除', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
  } catch { return }
  try {
    await batchDeleteTestCases(selectedProject.value, selectedIds.value)
    ElMessage.success(`已删除 ${selectedIds.value.length} 条用例`)
    selectedIds.value = []
    selectAll.value = false
    await loadCases()
  } catch (e: any) { ElMessage.error(e?.response?.data?.error || '批量删除失败') }
}

async function onBatchUpdateLevel(level: string) {
  if (!selectedProject.value || selectedIds.value.length === 0) return
  try {
    await batchUpdateLevel(selectedProject.value, selectedIds.value, level)
    ElMessage.success(`已修改 ${selectedIds.value.length} 条用例等级为 ${level}`)
    selectedIds.value = []
    selectAll.value = false
    await loadCases()
  } catch (e: any) { ElMessage.error(e?.response?.data?.error || '批量修改失败') }
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
  } catch (e: any) { ElMessage.error(e?.response?.data?.error || '批量移动失败') }
}



async function onCloneCase(row: TableRow) {
  if (!selectedProject.value) return
  try {
    await cloneTestCase(selectedProject.value, row.id)
    ElMessage.success('复制成功')
    await loadCases()
  } catch (e: any) { ElMessage.error(e?.response?.data?.error || '复制失败') }
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

async function onUploadAttachment(file: File) {
  if (!selectedProject.value || !editingId.value) {
    ElMessage.warning('请先保存用例后再上传附件')
    return
  }
  try {
    const att = await uploadAttachment(selectedProject.value, editingId.value, file)
    if (att) caseAttachments.value.push(att as any)
    ElMessage.success('附件上传成功')
  } catch (e: any) { ElMessage.error(e?.response?.data?.error || '上传失败') }
}

async function onRemoveAttachment(index: number) {
  const att = caseAttachments.value[index]
  if (!att || !selectedProject.value) return
  try {
    await deleteAttachment(selectedProject.value, att.id)
    caseAttachments.value.splice(index, 1)
    ElMessage.success('附件已删除')
  } catch (e: any) { ElMessage.error(e?.response?.data?.error || '删除附件失败') }
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
  } catch (e: any) { ElMessage.error(e?.response?.data?.error || '导入失败') }
  finally { appLoading.value = false }
}

async function onDelete(row: TableRow) {
  if (!selectedProject.value) return
  try { await ElMessageBox.confirm(`确认删除用例【${row.title}】？`, '删除确认', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  try {
    await deleteTestCase(selectedProject.value, row.id)
    ElMessage.success('删除成功')
    const maxAfterDelete = Math.max(1, Math.ceil((total.value - 1) / pageSize.value))
    if (page.value > maxAfterDelete) page.value = maxAfterDelete
    await loadCases()
  } catch (e: any) { ElMessage.error(e?.response?.data?.error || '删除失败') }
}

// ── Directory ──

function openCreateDirectory() { directoryForm.parentPath = '/'; directoryForm.name = ''; directoryDialogVisible.value = true }

function submitDirectory() {
  const parent = normalizeDirectoryPath(directoryForm.parentPath || '/')
  const name = directoryForm.name.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (!name) { ElMessage.warning('目录名称不能为空'); return }
  if (!/^[\u4e00-\u9fa5A-Za-z0-9_-]+$/.test(name)) { ElMessage.warning('目录名称仅支持中文、英文、数字、下划线、中划线'); return }
  const nextPath = normalizeDirectoryPath(`${parent}/${name}`)
  if (calcModuleDepth(nextPath) > 5) { ElMessage.warning('目录最多支持 5 层'); return }
  if (modulePaths.value.includes(nextPath)) { ElMessage.warning('目录已存在'); return }
  customModulePaths.value.push(nextPath)
  caseForm.modulePath = nextPath
  directoryDialogVisible.value = false
  ElMessage.success('创建成功')
}

async function removeDirectory(path: string) {
  const target = normalizeDirectoryPath(path)
  if (target === '/') { ElMessage.warning('根目录不可删除'); return }
  if (!selectedProject.value) { ElMessage.warning('请先选择项目'); return }
  const childDirs = modulePaths.value.filter((p) => p !== target && p.startsWith(`${target}/`))
  if (childDirs.length > 0) { ElMessage.warning('仅支持从最下级目录开始删除，请先删除子目录'); return }
  const boundCases = rows.value.filter((r) => isPathEqualOrChild(r.modulePath || '/未规划用例', target))
  try { await ElMessageBox.confirm(`确认删除目录 ${target}（含 ${boundCases.length} 条用例）？`, '删除确认', { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' }) } catch { return }
  try {
    for (const tc of boundCases) await deleteTestCase(selectedProject.value, tc.id)
    customModulePaths.value = customModulePaths.value.filter((p) => !isPathEqualOrChild(p, target))
    if (isPathEqualOrChild(caseForm.modulePath || '/未规划用例', target)) caseForm.modulePath = '/未规划用例'
    const maxAfterDelete = Math.max(1, Math.ceil((total.value - boundCases.length) / pageSize.value))
    if (page.value > maxAfterDelete) page.value = maxAfterDelete
    await loadCases()
    ElMessage.success(`删除成功（${boundCases.length} 条）`)
  } catch (e: any) { ElMessage.error(e?.response?.data?.error || '删除目录失败') }
}

// ── Steps ──

function addStepRow() { stepRows.value.push({ action: '', expected: '' }) }
function removeStepRow(index: number) { if (stepRows.value.length <= 1) { stepRows.value = [{ action: '', expected: '' }]; return }; stepRows.value.splice(index, 1) }
function copyStepRow(index: number) { const src = stepRows.value[index]; if (!src) return; stepRows.value.splice(index + 1, 0, { action: src.action, expected: src.expected }) }
function insertStepAbove(index: number) { stepRows.value.splice(index, 0, { action: '', expected: '' }) }
function insertStepBelow(index: number) { stepRows.value.splice(index + 1, 0, { action: '', expected: '' }) }
function onStepDragStart(index: number) { draggingStepIndex.value = index }
function onStepDrop(targetIndex: number) {
  const from = draggingStepIndex.value
  if (from === null || from === targetIndex) { draggingStepIndex.value = null; return }
  const arr = stepRows.value; const item = arr[from]; if (!item) { draggingStepIndex.value = null; return }
  arr.splice(from, 1); const insertAt = from < targetIndex ? targetIndex - 1 : targetIndex; arr.splice(insertAt, 0, item); draggingStepIndex.value = null
}
function onStepDragEnd() { draggingStepIndex.value = null }

// ── Project switch ──
/** 切换当前项目；若点击归档项目则给出只读提示，不切换编辑上下文。 */
function onProjectSwitch(project: Project) {
  if (project.status === 'archived') {
    projectDropdownOpen.value = false
    ElMessage.warning(`项目「${project.name}」已归档，仅支持查看，请先恢复后再切换`)
    return
  }
  projectStore.selectedProjectId = project.id
  projectStore.persistNavState()
  projectDropdownOpen.value = false
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
  } catch { selectedModulePath.value = '' }
  loadCases()
})
</script>

<template>
  <div class="case-page" :class="{ 'panel-collapsed': !treePanelOpen }">
    <button class="panel-toggle" @click="treePanelOpen = !treePanelOpen" :title="treePanelOpen ? '收起目录' : '展开目录'">
      {{ treePanelOpen ? '◂' : '▸' }}
    </button>
    <div class="left-tree" :class="{ collapsed: !treePanelOpen }">
      <div class="tree-content">
        <!-- Project Switcher -->
        <div class="tree-project-switcher">
          <div
            class="project-trigger"
            :class="{ active: projectDropdownOpen }"
            @click="projectDropdownOpen = !projectDropdownOpen"
          >
            <div class="project-trigger-icon">
              <LuAtom :size="18" :stroke-width="1.8" />
            </div>
            <div class="project-trigger-info">
              <span class="project-trigger-name">{{ currentProjectName }}</span>
            </div>
            <svg class="project-trigger-chevron" :class="{ rotated: projectDropdownOpen }" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <Transition name="dropdown-slide">
            <div v-if="projectDropdownOpen" class="project-dropdown-panel">
              <div
                v-for="p in projects"
                :key="p.id"
                class="project-dropdown-item"
                :class="{ selected: p.id === selectedProject, archived: p.status === 'archived' }"
                :title="p.status === 'archived' ? '归档项目仅支持查看，无法切换为当前编辑项目' : undefined"
                @click="onProjectSwitch(p)"
              >
                <div v-if="p.id === selectedProject" class="project-item-indicator" />
                <span class="project-item-name">{{ p.name }}</span>
                <el-tag v-if="p.status === 'archived'" size="small" type="info" effect="plain" style="margin-left: 6px; font-size: 10px;">已归档</el-tag>
                <svg v-if="p.id === selectedProject" class="project-item-check" width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </div>
          </Transition>
          <div v-if="projectDropdownOpen" class="project-dropdown-overlay" @click="projectDropdownOpen = false" />
          <div v-if="selectedProjectArchived" class="project-readonly-hint">
            当前项目已归档，当前页面仅建议查看；如需继续编辑，请先到项目管理中恢复项目。
          </div>
        </div>
        <div class="tree-divider"></div>
        <!-- Search -->
        <div class="tree-header">
          <el-input size="small" class="module-search-input" placeholder="请输入模块名称">
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>

        <!-- Tree List -->
        <div class="tree-list">
          <div class="tree-item tree-root-row" :class="{ active: selectedModulePath === '' }" @click="onModuleClick('')">
            <div class="tree-node-left">
              <el-icon class="tree-node-icon"><FolderOpened /></el-icon>
              <span class="tree-root-title">全部用例</span>
            </div>
            <div class="tree-node-right">
              <span class="tree-node-count">{{ total }}</span>
              <button class="tree-node-action" @click.stop="treeExpanded = !treeExpanded" :title="treeExpanded ? '收起' : '展开'">
                <el-icon :size="14"><CaretBottom v-if="treeExpanded" /><CaretRight v-else /></el-icon>
              </button>
              <button class="tree-node-action" @click.stop="openCreateDirectory" title="新建目录">
                <el-icon :size="14"><FolderAdd /></el-icon>
              </button>
            </div>
          </div>
          <!-- 未规划用例 -->
          <div v-if="treeExpanded" class="tree-item tree-unplanned" :class="{ active: selectedModulePath === '/未规划用例' }" @click="onModuleClick('/未规划用例')">
            <div class="tree-node-left">
              <el-icon class="tree-node-icon"><Document /></el-icon>
              <span class="tree-node-name">未规划用例</span>
            </div>
            <span class="tree-node-count">{{ unplannedCount }}</span>
          </div>
          <el-tree v-if="treeExpanded && moduleTree.length > 0" class="module-tree" :data="moduleTree" node-key="path" default-expand-all :props="{ label: 'name', children: 'children' }">
            <template #default="{ data }">
              <div class="tree-node-row" :class="{ active: selectedModulePath === data.path }" @click.stop="onModuleClick(data.path)">
                <div class="tree-node-left">
                  <el-icon class="tree-node-icon"><Folder /></el-icon>
                  <span class="tree-node-name">{{ data.name }}</span>
                </div>
                <div class="tree-node-right">
                  <span class="tree-node-count">{{ moduleCaseCount[data.path] || 0 }}</span>
                  <button class="tree-node-action" @click.stop="directoryForm.parentPath = data.path; directoryForm.name = ''; directoryDialogVisible = true" title="新建子目录">
                    <el-icon :size="14"><Plus /></el-icon>
                  </button>
                  <el-dropdown trigger="click" @command="(cmd: string) => onNodeMenuCommand(cmd, data.path, data.name)" @click.stop>
                    <button class="tree-node-action" @click.stop title="更多操作">
                      <el-icon :size="14"><MoreFilled /></el-icon>
                    </button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="rename">重命名</el-dropdown-item>
                        <el-dropdown-item command="delete" divided style="color: #ef4444;">删除</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </div>
            </template>
          </el-tree>
        </div>
      </div>
    </div>

    <!-- Directory context menu -->
    <Teleport to="body">
      <div v-if="ctxMenu.visible" class="ctx-menu-overlay" @click="closeCtxMenu" @contextmenu.prevent="closeCtxMenu">
        <div class="ctx-menu" :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }" @click.stop>
          <div class="ctx-menu-item" @click="ctxAddSubDir">新建子目录</div>
          <div class="ctx-menu-item" @click="ctxRename">重命名</div>
          <div class="ctx-menu-divider"></div>
          <div class="ctx-menu-item ctx-danger" @click="ctxDelete">删除</div>
        </div>
      </div>
    </Teleport>

    <div class="right-table">
      <!-- Tab Navigation (Style B) -->
      <div class="content-tabs">
        <div class="content-tabs-left">
          <button class="content-tab active">用例列表</button>
          <button class="content-tab">思维导图</button>
          <button class="content-tab">需求覆盖</button>
          <button class="content-tab">执行统计</button>
        </div>
        <div class="content-tabs-right">
          <el-button type="primary" class="btn-new-case" @click="openCreate">
            <el-icon><Plus /></el-icon> 新建用例
          </el-button>
          <input type="file" accept=".xlsx" style="display:none" @change="onImportXlsx" />
        </div>
      </div>

      <!-- Metric Dashboard Cards (Style B — exact match) -->
      <div class="metric-cards">
        <!-- Card 1: 总用例 -->
        <div class="metric-card">
          <div class="metric-card-row">
            <span class="metric-label">总用例</span>
            <div class="metric-icon" style="background: rgba(124, 58, 237, 0.18); color: #a78bfa;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                <path d="M12 11h4"></path>
                <path d="M12 16h4"></path>
                <path d="M8 11h.01"></path>
                <path d="M8 16h.01"></path>
              </svg>
            </div>
          </div>
          <div class="metric-card-row metric-card-bottom">
            <span class="metric-value">{{ metricTotal }}</span>
            <span class="metric-trend-badge metric-trend-up">↗ +8%</span>
          </div>
        </div>

        <!-- Card 2: 通过率 -->
        <div class="metric-card">
          <div class="metric-card-row">
            <span class="metric-label">通过率</span>
            <div class="metric-icon" style="background: rgba(59, 130, 246, 0.18); color: #60a5fa;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"></path>
              </svg>
            </div>
          </div>
          <div class="metric-card-row metric-card-bottom">
            <span class="metric-value">{{ metricPassRate }}<small>%</small></span>
            <div class="metric-ring-lg">
              <svg viewBox="0 0 48 48" class="donut-lg">
                <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="4" />
                <circle cx="24" cy="24" r="20" fill="none" stroke="#3b82f6" stroke-width="4"
                  stroke-dasharray="125.7" :stroke-dashoffset="125.7 - (125.7 * metricPassRate / 100)" stroke-linecap="round"
                  style="transform: rotate(-90deg); transform-origin: center;" />
              </svg>
            </div>
          </div>
        </div>

        <!-- Card 3: 执行覆盖 -->
        <div class="metric-card">
          <div class="metric-card-row">
            <span class="metric-label">执行覆盖</span>
            <div class="metric-icon" style="background: rgba(245, 158, 11, 0.18); color: #fbbf24;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="16" y="6" width="4" height="14" rx="1"></rect>
                <rect x="10" y="10" width="4" height="10" rx="1"></rect>
                <rect x="4" y="14" width="4" height="6" rx="1"></rect>
              </svg>
            </div>
          </div>
          <div class="metric-card-row metric-card-bottom">
            <span class="metric-value-sm">{{ metricCoverage }}%</span>
            <span class="metric-target">Target 90%</span>
          </div>
          <div class="metric-progress-wide">
            <div class="metric-progress-bar-wide" :style="{ width: metricCoverage + '%' }"></div>
          </div>
        </div>

        <!-- Card 4: 本周新增 -->
        <div class="metric-card">
          <div class="metric-card-row">
            <span class="metric-label">本周新增</span>
            <div class="metric-icon" style="background: rgba(236, 72, 153, 0.18); color: #f472b6;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23 12l-2.44-2.78.34-3.68-3.61-.82-1.89-3.18L12 3 8.6 1.54 6.71 4.72l-3.61.81.34 3.68L1 12l2.44 2.78-.34 3.69 3.61.82 1.89 3.18L12 21l3.4 1.46 1.89-3.18 3.61-.82-.34-3.68L23 12zm-13 5l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"></path>
              </svg>
            </div>
          </div>
          <div class="metric-card-row metric-card-bottom">
            <span class="metric-value">{{ metricWeeklyNew }}</span>
            <div class="mini-bars">
              <svg viewBox="0 0 40 24" class="mini-bars-svg">
                <rect x="2" y="14" width="4" height="10" rx="1" fill="#7c3aed" opacity="0.5" />
                <rect x="9" y="8" width="4" height="16" rx="1" fill="#7c3aed" opacity="0.6" />
                <rect x="16" y="4" width="4" height="20" rx="1" fill="#7c3aed" opacity="0.7" />
                <rect x="23" y="10" width="4" height="14" rx="1" fill="#7c3aed" opacity="0.8" />
                <rect x="30" y="2" width="4" height="22" rx="1" fill="#a78bfa" />
              </svg>
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
          <el-select v-model="levelFilter" placeholder="优先级" clearable size="default" class="filter-dropdown" @change="onSearch">
            <el-option label="P0" value="P0" />
            <el-option label="P1" value="P1" />
            <el-option label="P2" value="P2" />
            <el-option label="P3" value="P3" />
          </el-select>
          <el-select v-model="execFilter" placeholder="状态" clearable size="default" class="filter-dropdown" @change="onSearch">
            <el-option label="未执行" value="未执行" />
            <el-option label="已通过" value="已通过" />
            <el-option label="已失败" value="已失败" />
          </el-select>
          <el-select v-model="reviewFilter" placeholder="所属模块" clearable size="default" class="filter-dropdown" @change="onSearch">
            <el-option v-for="m in flatModules" :key="m" :label="m" :value="m" />
          </el-select>
          <button class="filter-icon-btn" @click="filterPanelVisible = true" title="高级筛选">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              <line x1="4" y1="8" x2="12" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              <line x1="6" y1="12" x2="10" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <!-- View Toggle (kept from Style C, positioned in filter bar) -->
      <div class="view-toggle" style="position: absolute; right: 0; top: 0; display: none;">
        <button class="view-toggle-btn" :class="{ active: viewMode === 'table' }" @click="viewMode = 'table'" title="表格视图">
          <el-icon :size="16"><List /></el-icon>
        </button>
        <button class="view-toggle-btn" :class="{ active: viewMode === 'kanban' }" @click="viewMode = 'kanban'" title="看板视图">
          <el-icon :size="16"><Grid /></el-icon>
        </button>
      </div>

      <!-- Floating batch action bar (Stitch design) -->
      <Teleport to="body">
        <Transition name="batch-slide">
          <div v-if="selectedIds.length > 0" class="batch-float-overlay">
            <div class="batch-float-bar">
              <div class="batch-float-item batch-float-check">
                <el-icon><CircleCheck /></el-icon>
                <span>批量操作</span>
              </div>
              <div class="batch-float-divider"></div>
              <button class="batch-float-item" @click="batchMoveVisible = true">
                <el-icon><Sort /></el-icon>
                <span>批量移动</span>
              </button>
              <button class="batch-float-item">
                <el-dropdown trigger="click" @command="onBatchUpdateLevel">
                  <span class="batch-float-inner">
                    <el-icon><Edit /></el-icon>
                    <span>批量编辑</span>
                  </span>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="P0">P0</el-dropdown-item>
                      <el-dropdown-item command="P1">P1</el-dropdown-item>
                      <el-dropdown-item command="P2">P2</el-dropdown-item>
                      <el-dropdown-item command="P3">P3</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </button>
              <button class="batch-float-item batch-float-danger" @click="onBatchDelete">
                <el-icon><Delete /></el-icon>
                <span>批量删除</span>
              </button>
              <button class="batch-float-close" @click="selectedIds = []; selectAll = false">×</button>
            </div>
          </div>
        </Transition>
      </Teleport>

      <div class="filter-chips" v-if="activeFilterChips.length > 0">
        <div class="chip" v-for="f in activeFilterChips" :key="f.key">
          <span>{{ f.label }}: {{ f.value }}</span>
          <button class="chip-close" @click="clearOneFilter(f.key)">×</button>
        </div>
        <button class="chip-clear-all" @click="onResetSearch">清空筛选</button>
      </div>

      <div class="table-shell" v-if="viewMode === 'table'" v-loading="appLoading">
        <div v-if="appLoading" class="table-skeleton">
          <div class="skeleton-row" v-for="i in 8" :key="i">
            <span class="sk sk-id"></span><span class="sk sk-name"></span>
            <span class="sk"></span><span class="sk"></span><span class="sk"></span>
            <span class="sk"></span><span class="sk"></span><span class="sk"></span>
            <span class="sk"></span><span class="sk"></span><span class="sk"></span>
            <span class="sk sk-op"></span>
          </div>
        </div>

        <table v-else>
          <thead>
            <tr>
              <th style="width: 40px"><input type="checkbox" :checked="selectAll" @change="selectAll = !selectAll; toggleSelectAll()" /></th>
              <th style="width: 80px" class="sortable" @click="toggleSort('id')">
                ID <span class="sort-flag" :class="{ active: sortBy === 'id' }">{{ sortBy === 'id' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th>用例名称</th>
              <th style="width: 80px">优先级</th>
              <th style="width: 140px">所属模块</th>
              <th style="width: 80px">评审结果</th>
              <th style="width: 80px">状态</th>
              <th style="width: 120px">标签</th>
              <th style="width: 110px">负责人</th>
              <th style="width: 100px" class="sortable" @click="toggleSort('updated_at')">
                更新时间 <span class="sort-flag" :class="{ active: sortBy === 'updated_at' }">{{ sortBy === 'updated_at' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th style="width: 110px">创建人</th>
              <th style="width: 100px" class="sortable" @click="toggleSort('created_at')">
                创建时间 <span class="sort-flag" :class="{ active: sortBy === 'created_at' }">{{ sortBy === 'created_at' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th style="width: 140px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loadError"><td colspan="13" class="empty-td">{{ loadError }} <el-button size="small" @click="loadCases" style="margin-left: 10px">重试</el-button></td></tr>
            <tr v-else-if="rows.length === 0">
              <td colspan="13" class="empty-td testcase-empty-cell">
                <div class="testcase-empty-wrap"><el-empty description="暂无数据" :image-size="140"><el-button type="primary" plain @click="openCreate">去新建</el-button></el-empty></div>
              </td>
            </tr>
            <tr v-else v-for="r in rows" :key="r.id" :class="{ 'row-selected': selectedIds.includes(r.id) }">
              <td><input type="checkbox" :checked="selectedIds.includes(r.id)" @change="toggleSelectRow(r.id)" /></td>
              <td class="id" @click="copyIdToClipboard(r.id)" style="cursor:pointer" title="点击复制 ID">{{ r.id }}</td>
              <td class="name" :title="r.title"><strong>{{ r.title }}</strong></td>
              <td><LevelBadge :level="r.level" /></td>
              <td>
                <span style="display:inline-flex;align-items:center;gap:6px">
                  <el-icon style="color:rgba(255,255,255,0.3)"><Folder /></el-icon>
                  {{ r.modulePath }}
                </span>
              </td>
              <td><StatusBadge :value="r.reviewResult" /></td>
              <td><StatusBadge :value="r.execResult" /></td>
              <td :title="r.tags || '-'">
                <div style="display:flex;gap:4px;flex-wrap:wrap" v-if="r.tags">
                  <span class="table-tag" v-for="t in r.tags.split(',')" :key="t">{{ t.trim() }}</span>
                </div>
                <span v-else style="color:var(--tp-gray-500)">-</span>
              </td>
              <td>
                <div class="table-user">
                  <div class="table-user-avatar">{{ r.updatedByName ? r.updatedByName.substring(0, 1).toUpperCase() : 'U' }}</div>
                  <span class="table-user-name">{{ r.updatedByName }}</span>
                </div>
              </td>
              <td><span style="color:var(--tp-gray-500);font-size:12px">{{ formatRelativeTime(r.updatedAt) }}</span></td>
              <td>
                <div class="table-user">
                  <div class="table-user-avatar">{{ r.createdByName ? r.createdByName.substring(0, 1).toUpperCase() : 'C' }}</div>
                  <span class="table-user-name">{{ r.createdByName }}</span>
                </div>
              </td>
              <td><span style="color:var(--tp-gray-500);font-size:12px">{{ formatRelativeTime(r.createdAt) }}</span></td>
              <td>
                <div class="action-group">
                  <button class="action-btn action-edit icon-only" @click="openEdit(r)"><el-icon class="btn-icon"><Edit /></el-icon><span>编辑</span></button>
                  <button class="action-btn action-clone icon-only" @click="onCloneCase(r)"><el-icon class="btn-icon"><CopyDocument /></el-icon><span>复制</span></button>
                  <button class="action-btn action-delete icon-only" @click="onDelete(r)"><el-icon class="btn-icon"><Delete /></el-icon><span>删除</span></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pager" v-if="viewMode === 'table'">
        <el-pagination background size="small" :current-page="page" :page-size="pageSize" :page-sizes="pageSizeOptions" :total="total" layout="total, sizes, prev, pager, next, jumper" @size-change="onPaginationSizeChange" @current-change="onPaginationCurrentChange" />
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
            <div v-for="item in col.items" :key="item.id" class="kanban-card" @click="openEdit(item)">
              <div class="kanban-card-top">
                <LevelBadge :level="item.level" />
                <span class="kanban-card-id">TC-{{ item.id }}</span>
              </div>
              <div class="kanban-card-title">{{ item.title }}</div>
              <div class="kanban-card-meta">
                <span class="kanban-card-module">📁 {{ item.modulePath || '未分类' }}</span>
              </div>
              <div class="kanban-card-tags" v-if="item.tags">
                <span class="kanban-tag" v-for="t in item.tags.split(',').slice(0, 3)" :key="t">{{ t.trim() }}</span>
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
    <el-drawer v-model="filterPanelVisible" title="高级筛选" size="360px" direction="rtl" class="advanced-filter-drawer">
      <div class="advanced-filter-form">
        <el-form label-position="top">
          <el-form-item label="用例等级">
            <el-select v-model="levelFilter" placeholder="全部" clearable>
              <el-option label="全部" value="" /><el-option label="P0" value="P0" /><el-option label="P1" value="P1" /><el-option label="P2" value="P2" /><el-option label="P3" value="P3" />
            </el-select>
          </el-form-item>
          <el-form-item label="评审结果">
            <el-select v-model="reviewFilter" placeholder="全部" clearable>
              <el-option label="全部" value="" /><el-option label="未评审" value="未评审" /><el-option label="已通过" value="已通过" /><el-option label="不通过" value="不通过" /><el-option label="重新提审" value="重新提审" />
            </el-select>
          </el-form-item>
          <el-form-item label="执行结果">
            <el-select v-model="execFilter" placeholder="全部" clearable>
              <el-option label="全部" value="" /><el-option label="未执行" value="未执行" /><el-option label="成功" value="成功" /><el-option label="失败" value="失败" /><el-option label="阻塞" value="阻塞" />
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
            <div style="display:flex; gap:8px; align-items:center;">
              <el-date-picker v-model="createdAfter" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" clearable style="flex:1;" />
              <span style="color:rgba(255,255,255,0.3);">~</span>
              <el-date-picker v-model="createdBefore" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" clearable style="flex:1;" />
            </div>
          </el-form-item>
          <el-form-item label="更新时间">
            <div style="display:flex; gap:8px; align-items:center;">
              <el-date-picker v-model="updatedAfter" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" clearable style="flex:1;" />
              <span style="color:rgba(255,255,255,0.3);">~</span>
              <el-date-picker v-model="updatedBefore" type="date" value-format="YYYY-MM-DD" placeholder="结束日期" clearable style="flex:1;" />
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
          <el-select v-model="batchMoveTarget" style="width:100%;">
            <el-option label="/未规划用例" value="/未规划用例" />
            <el-option v-for="p in modulePaths" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchMoveVisible = false">取消</el-button>
        <el-button type="primary" @click="onBatchMove">确认移动 ({{ selectedIds.length }} 条)</el-button>
      </template>
    </el-dialog>

    <!-- Case editor drawer -->
    <el-drawer v-model="dialogVisible" :title="editingId ? '编辑用例' : '新建用例'" size="74%" direction="rtl" class="case-editor-drawer">
      <div class="case-editor">
        <div class="case-editor-head">
          <div class="head-left"><div class="case-tag">TEST CASE</div><h3>{{ editingId ? '编辑测试用例' : '新建测试用例' }}</h3></div>
          <div class="head-right"><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="submitCase">保存</el-button></div>
        </div>
        <el-form label-position="top" class="case-editor-form">
          <section class="editor-block">
            <div class="block-title">基础信息</div>
            <div class="block-grid block-grid-2">
              <el-form-item label="用例名称"><el-input v-model="caseForm.title" placeholder="请输入用例名称" /></el-form-item>
              <el-form-item label="用例等级"><el-select v-model="caseForm.level"><el-option label="P0" value="P0" /><el-option label="P1" value="P1" /><el-option label="P2" value="P2" /><el-option label="P3" value="P3" /></el-select></el-form-item>
              <el-form-item label="标签" class="block-col-span-2"><el-input v-model="caseForm.tags" placeholder="多个标签以逗号分隔" /></el-form-item>
            </div>
          </section>
          <section class="editor-block">
            <div class="block-title">评审与执行</div>
            <div class="block-grid block-grid-2">
              <el-form-item label="评审结果"><el-select v-model="caseForm.reviewResult"><el-option label="未评审" value="未评审" /><el-option label="已通过" value="已通过" /><el-option label="不通过" value="不通过" /><el-option label="重新提审" value="重新提审" /></el-select></el-form-item>
              <el-form-item label="执行结果"><el-select v-model="caseForm.execResult"><el-option label="未执行" value="未执行" /><el-option label="成功" value="成功" /><el-option label="失败" value="失败" /><el-option label="阻塞" value="阻塞" /></el-select></el-form-item>
            </div>
          </section>
          <section class="editor-block">
            <div class="block-title">前置条件</div>
            <RichTextEditor v-model="caseForm.precondition" placeholder="请输入前置条件…" />
          </section>
          <section class="editor-block">
            <div class="block-title">步骤描述</div>
            <div class="steps-grid-head"><div>步骤</div><div>预期结果</div><div>操作</div></div>
            <div class="steps-grid-row" v-for="(s, idx) in stepRows" :key="idx" draggable="true" @dragstart="onStepDragStart(idx)" @dragover.prevent @drop="onStepDrop(idx)" @dragend="onStepDragEnd">
              <el-input v-model="s.action" placeholder="请输入步骤" />
              <el-input v-model="s.expected" placeholder="请输入预期结果" />
              <div class="step-ops">
                <el-dropdown trigger="click" @command="(cmd: string) => { if (cmd === 'copy') copyStepRow(idx); else if (cmd === 'insertAbove') insertStepAbove(idx); else if (cmd === 'insertBelow') insertStepBelow(idx); else if (cmd === 'delete') removeStepRow(idx); }">
                  <button type="button" class="step-op" title="操作"><el-icon class="btn-icon"><Edit /></el-icon></button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="copy"><el-icon><CopyDocument /></el-icon>复制</el-dropdown-item>
                      <el-dropdown-item command="insertAbove"><el-icon><CaretTop /></el-icon>在上方插入</el-dropdown-item>
                      <el-dropdown-item command="insertBelow"><el-icon><CaretBottom /></el-icon>在下方插入</el-dropdown-item>
                      <el-dropdown-item command="delete" divided><el-icon><Delete /></el-icon>删除</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </div>
            <div class="steps-grid-actions"><el-button @click="addStepRow">新增步骤</el-button></div>
          </section>
          <section class="editor-block">
            <div class="block-title">备注</div>
            <RichTextEditor v-model="caseForm.remark" placeholder="请输入备注信息…" />
          </section>
          <section class="editor-block">
            <div class="block-title">附件</div>
            <FileUploader :files="caseAttachments" :project-id="selectedProject ?? undefined" @upload="onUploadAttachment" @remove="onRemoveAttachment" />
            <div v-if="!editingId" class="attachment-hint">请先保存用例后再上传附件</div>
          </section>
          <section v-if="editingId && caseHistory.length > 0" class="editor-block">
            <div class="block-title" style="cursor:pointer; user-select:none;" @click="historyExpanded = !historyExpanded">
              编辑历史 ({{ caseHistory.length }}) <span style="font-size:11px; color:var(--tp-gray-500);">{{ historyExpanded ? '▼' : '▶' }}</span>
            </div>
            <div v-if="historyExpanded" class="history-list">
              <div v-for="h in caseHistory" :key="h.id" class="history-item">
                <span class="history-action">{{ h.action === 'update' ? '修改' : h.action === 'create' ? '创建' : h.action }}</span>
                <span class="history-field" v-if="h.field_name">{{ h.field_name }}</span>
                <span class="history-time">{{ formatTime(h.created_at) }}</span>
              </div>
            </div>
          </section>
        </el-form>
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
  </div>
</template>
