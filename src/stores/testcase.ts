import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  listTestCases,
  createTestCase,
  updateTestCase,
  deleteTestCase,
} from '../api/testcase'
import type { TestCase } from '../api/types'

export type TableRow = {
  id: number
  title: string
  level: string
  reviewResult: string
  execResult: string
  modulePath: string
  tags: string
  updatedBy: number
  updatedByName: string
  updatedAt: string
  createdBy: number
  createdByName: string
  createdAt: string
  steps: string
  priority: string
}

export type StepRow = {
  action: string
  expected: string
}

export type ModuleTreeNode = {
  name: string
  path: string
  children: ModuleTreeNode[]
}

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
    modulePath: tc.module_path,
    tags: tc.tags,
    updatedBy: tc.updated_by,
    updatedByName: tc.updated_by_name || '-',
    updatedAt: formatTime(tc.updated_at),
    createdBy: tc.created_by,
    createdByName: tc.created_by_name || '-',
    createdAt: formatTime(tc.created_at),
    steps: tc.steps,
    priority: tc.priority,
  }
}

export function normalizeDirectoryPath(path: string) {
  const cleaned = path.trim().replace(/^\/+/, '').replace(/\/+$/, '')
  if (!cleaned) return '/'
  return `/${cleaned}`
}

export function normalizeCaseModulePath(path: string) {
  const normalized = normalizeDirectoryPath(path)
  return normalized === '/' ? '/未规划用例' : normalized
}

export const useTestCaseStore = defineStore('testcase', () => {
  const rows = ref<TableRow[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(10)
  const pageInput = ref('1')
  const keyword = ref('')
  const levelFilter = ref('')
  const reviewFilter = ref('')
  const execFilter = ref('')
  const sortBy = ref<'id' | 'created_at' | 'updated_at'>('updated_at')
  const sortOrder = ref<'asc' | 'desc'>('desc')
  const loading = ref(false)
  const loadError = ref('')
  const customModulePaths = ref<string[]>([])

  const activeFilterChips = computed(() => {
    const chips: Array<{
      key: 'keyword' | 'level' | 'review' | 'exec'
      label: string
      value: string
    }> = []
    if (keyword.value.trim())
      chips.push({ key: 'keyword', label: '关键字', value: keyword.value.trim() })
    if (levelFilter.value)
      chips.push({ key: 'level', label: '等级', value: levelFilter.value })
    if (reviewFilter.value)
      chips.push({ key: 'review', label: '评审', value: reviewFilter.value })
    if (execFilter.value)
      chips.push({ key: 'exec', label: '执行', value: execFilter.value })
    return chips
  })

  const modulePaths = computed(() => {
    const set = new Set<string>()
    rows.value.forEach((r) => {
      const p = (r.modulePath || '').trim()
      const normalized = normalizeCaseModulePath(p)
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

  async function fetchCases(projectId: number) {
    loadError.value = ''
    if (!projectId) {
      rows.value = []
      total.value = 0
      page.value = 1
      pageInput.value = '1'
      return
    }
    loading.value = true
    try {
      const data = await listTestCases(projectId, {
        page: page.value,
        pageSize: pageSize.value,
        keyword: keyword.value.trim() || undefined,
        level: levelFilter.value || undefined,
        review_result: reviewFilter.value || undefined,
        exec_result: execFilter.value || undefined,
        sortBy: sortBy.value,
        sortOrder: sortOrder.value,
      })
      const items = Array.isArray((data as any).items) ? (data as any).items : []
      rows.value = items.map(toRow)
      total.value = Number((data as any).total) || 0
      page.value = Number((data as any).page) || 1
      pageInput.value = String(page.value)
      pageSize.value = Number((data as any).pageSize) || pageSize.value
    } catch (e: any) {
      loadError.value = e?.response?.data?.error || '加载用例失败，请重试'
    } finally {
      loading.value = false
    }
  }

  async function addCase(
    projectId: number,
    payload: Parameters<typeof createTestCase>[1],
  ) {
    return await createTestCase(projectId, payload)
  }

  async function editCase(
    projectId: number,
    testcaseId: number,
    payload: Parameters<typeof updateTestCase>[2],
  ) {
    return await updateTestCase(projectId, testcaseId, payload)
  }

  async function removeCase(projectId: number, testcaseId: number) {
    return await deleteTestCase(projectId, testcaseId)
  }

  function resetFilters() {
    keyword.value = ''
    levelFilter.value = ''
    reviewFilter.value = ''
    execFilter.value = ''
    page.value = 1
  }

  return {
    rows,
    total,
    page,
    pageSize,
    pageInput,
    keyword,
    levelFilter,
    reviewFilter,
    execFilter,
    sortBy,
    sortOrder,
    loading,
    loadError,
    customModulePaths,
    activeFilterChips,
    modulePaths,
    moduleTree,
    fetchCases,
    addCase,
    editCase,
    removeCase,
    resetFilters,
  }
})
