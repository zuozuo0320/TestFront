<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, ArrowUp, CopyDocument, Delete, Edit, Plus } from '@element-plus/icons-vue'
import {
  createProject,
  createRole,
  createTestCase,
  createUser,
  deleteRoleById,
  deleteTestCase,
  deleteUserById,
  listProjects,
  listRoles,
  listTestCases,
  listUsers,
  loginByEmail,
  updateMyProfile,
  updateRoleById,
  updateTestCase,
  updateUser,
  uploadMyAvatar,
  type LoginResp,
  type Project,
  type Role,
  type TestCase,
  type User,
} from './api'

type TableRow = {
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

type UserRow = User & {
  roleIds: number[]
  projectIds: number[]
}

type StepRow = {
  action: string
  expected: string
}

type ModuleTreeNode = {
  name: string
  path: string
  children: ModuleTreeNode[]
}

const topMenu = ref<'workbench' | 'project' | 'plan' | 'testcases' | 'e2e' | 'system'>('testcases')
const activeMenu = ref<'users' | 'roles' | 'projects'>('users')
const users = ref<UserRow[]>([])
const roles = ref<Role[]>([])
const usersLoading = ref(false)
const rolesLoading = ref(false)
const userDialogVisible = ref(false)
const roleDialogVisible = ref(false)
const profileDialogVisible = ref(false)
const projectDialogVisible = ref(false)
const directoryDialogVisible = ref(false)
const treeExpanded = ref(true)
const editingUserId = ref<number | null>(null)
const editingRoleId = ref<number | null>(null)
const savingUser = ref(false)
const savingRole = ref(false)
const savingProfile = ref(false)
const savingProject = ref(false)

const userForm = reactive({
  name: '',
  email: '',
  phone: '',
  roleIds: [] as number[],
  projectIds: [] as number[],
  active: true,
})

const roleForm = reactive({
  name: '',
  description: '',
})

const projectForm = reactive({
  name: '',
  description: '',
})

const profileForm = reactive({
  name: '',
  phone: '',
  avatar: '',
})
const loginLoading = ref(false)
const appLoading = ref(false)
const saving = ref(false)
const loggedIn = ref(false)
const currentUser = ref<LoginResp['user'] | null>(null)

const loginForm = reactive({
  email: 'tester@testpilot.local',
  password: 'TestPilot@2026',
})

const projects = ref<Project[]>([])
const selectedProject = ref<number | null>(null)

const keyword = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const pageInput = ref('1')
const sortBy = ref<'id' | 'created_at' | 'updated_at'>('updated_at')
const sortOrder = ref<'asc' | 'desc'>('desc')
const loadError = ref('')
const levelFilter = ref('')
const reviewFilter = ref('')
const execFilter = ref('')
const filterPanelVisible = ref(false)

const rows = ref<TableRow[]>([])
const customModulePaths = ref<string[]>([])
const stepRows = ref<StepRow[]>([{ action: '', expected: '' }])
const draggingStepIndex = ref<number | null>(null)

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const caseForm = reactive({
  title: '',
  level: 'P1',
  reviewResult: '未评审',
  execResult: '未执行',
  modulePath: '/未规划用例',
  tags: '',
  steps: '',
  priority: 'medium',
})

const directoryForm = reactive({
  parentPath: '/',
  name: '',
})

const pageSizeOptions = [10, 20, 50]

const activeFilterChips = computed(() => {
  const chips: Array<{ key: 'keyword' | 'level' | 'review' | 'exec'; label: string; value: string }> = []
  if (keyword.value.trim()) chips.push({ key: 'keyword', label: '关键字', value: keyword.value.trim() })
  if (levelFilter.value) chips.push({ key: 'level', label: '等级', value: levelFilter.value })
  if (reviewFilter.value) chips.push({ key: 'review', label: '评审', value: reviewFilter.value })
  if (execFilter.value) chips.push({ key: 'exec', label: '执行', value: execFilter.value })
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

const creatableRoles = computed(() => roles.value.filter((r) => r.name !== 'admin'))

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

function openCreateDirectory() {
  directoryForm.parentPath = '/'
  directoryForm.name = ''
  directoryDialogVisible.value = true
}

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
  ElMessage.success(`目录已创建：${nextPath}`)
}

function isPathEqualOrChild(path: string, target: string) {
  const normalizedPath = normalizeCaseModulePath(path)
  const normalizedTarget = normalizeDirectoryPath(target)
  if (normalizedTarget === '/') return true
  return normalizedPath === normalizedTarget || normalizedPath.startsWith(`${normalizedTarget}/`)
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

  const boundCases = rows.value.filter((r) => isPathEqualOrChild(r.modulePath || '/未规划用例', target))
  const boundCount = boundCases.length

  try {
    await ElMessageBox.confirm(
      `确认删除目录 ${target} 吗？该目录下绑定用例数：${boundCount}。删除目录会同步删除目录下所有用例。`,
      '删除确认',
      { confirmButtonText: '继续删除', cancelButtonText: '取消', type: 'warning' },
    )
    await ElMessageBox.confirm(
      `二次确认：将删除目录 ${target} 及其绑定用例（${boundCount} 条），该操作不可恢复。`,
      '二次确认',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'error' },
    )
  } catch {
    return
  }

  try {
    for (const tc of boundCases) {
      await deleteTestCase(selectedProject.value, tc.id)
    }

    customModulePaths.value = customModulePaths.value.filter((p) => !isPathEqualOrChild(p, target))
    if (isPathEqualOrChild(caseForm.modulePath || '/未规划用例', target)) {
      caseForm.modulePath = '/未规划用例'
    }

    const maxAfterDelete = Math.max(1, Math.ceil((total.value - boundCount) / pageSize.value))
    if (page.value > maxAfterDelete) page.value = maxAfterDelete
    await loadCases()

    ElMessage.success(`目录已删除：${target}，同步删除用例 ${boundCount} 条`)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '删除目录失败')
  }
}

function resolveAvatarUrl(avatar?: string, fallbackName?: string) {
  const avatarRaw = (avatar || '').trim()
  if (avatarRaw) {
    if (/^https?:\/\//i.test(avatarRaw)) return avatarRaw
    const envBase = ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined)?.trim()
    if (envBase && /^https?:\/\//i.test(envBase)) {
      const origin = envBase.replace(/\/api\/v1\/?$/, '')
      return `${origin}${avatarRaw.startsWith('/') ? '' : '/'}${avatarRaw}`
    }
    return `http://localhost:8080${avatarRaw.startsWith('/') ? '' : '/'}${avatarRaw}`
  }
  const seed = encodeURIComponent((fallbackName || 'TestPilot').trim() || 'TestPilot')
  return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}`
}

const userAvatarUrl = computed(() => {
  return resolveAvatarUrl((currentUser.value as any)?.avatar, currentUser.value?.name)
})

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

function parseStepsToRows(text: string): StepRow[] {
  const raw = (text || '').split('\n').map((s) => s.trim()).filter(Boolean)
  if (raw.length === 0) return [{ action: '', expected: '' }]

  const rows = raw.map((line) => {
    const parts = line.split('|')
    if (parts.length >= 2) {
      return {
        action: (parts[0] ?? '').trim(),
        expected: parts.slice(1).join('|').trim(),
      }
    }
    return { action: line, expected: '' }
  })

  return rows.length > 0 ? rows : [{ action: '', expected: '' }]
}

function rowsToStepsText(rows: StepRow[]): string {
  return rows
    .map((r) => ({ action: (r.action || '').trim(), expected: (r.expected || '').trim() }))
    .filter((r) => r.action || r.expected)
    .map((r) => `${r.action} | ${r.expected}`)
    .join('\n')
}

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

function moveStepUp(index: number) {
  if (index <= 0) return
  const arr = stepRows.value
  const current = arr[index]
  const prev = arr[index - 1]
  if (!current || !prev) return
  arr[index - 1] = current
  arr[index] = prev
}

function moveStepDown(index: number) {
  const arr = stepRows.value
  if (index >= arr.length - 1) return
  const current = arr[index]
  const next = arr[index + 1]
  if (!current || !next) return
  arr[index] = next
  arr[index + 1] = current
}

function copyStepRow(index: number) {
  const src = stepRows.value[index]
  if (!src) return
  stepRows.value.splice(index + 1, 0, { action: src.action, expected: src.expected })
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

async function doLogin() {
  loginLoading.value = true
  try {
    const data = await loginByEmail(loginForm.email, loginForm.password)
    localStorage.setItem('tp-token', data.token)
    localStorage.setItem('tp-user-id', String(data.user_id))
    currentUser.value = data.user
    loggedIn.value = true
    ElMessage.success('登录成功')
    await initAfterLogin()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '登录失败')
  } finally {
    loginLoading.value = false
  }
}

async function initAfterLogin() {
  appLoading.value = true
  try {
    projects.value = await listProjects()
    const firstProject = projects.value[0]
    if (firstProject) {
      selectedProject.value = firstProject.id
      await loadCases()
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '初始化失败')
  } finally {
    appLoading.value = false
  }
}

async function loadProjects() {
  projects.value = await listProjects()
  const firstProject = projects.value[0]
  if (firstProject) {
    const exists = projects.value.some((p) => p.id === selectedProject.value)
    if (!exists) selectedProject.value = firstProject.id
  } else {
    selectedProject.value = null
  }
}

async function loadCases() {
  if (!selectedProject.value) return
  appLoading.value = true
  loadError.value = ''
  try {
    const data = await listTestCases(selectedProject.value, {
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
      level: levelFilter.value || undefined,
      review_result: reviewFilter.value || undefined,
      exec_result: execFilter.value || undefined,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
    })
    rows.value = data.items.map(toRow)
    total.value = data.total
    page.value = data.page
    pageInput.value = String(data.page)
    pageSize.value = data.pageSize
  } catch (e: any) {
    loadError.value = e?.response?.data?.error || '加载用例失败，请重试'
    ElMessage.error(loadError.value)
  } finally {
    appLoading.value = false
  }
}

function onSearch() {
  page.value = 1
  loadCases()
}

function onResetSearch() {
  keyword.value = ''
  levelFilter.value = ''
  reviewFilter.value = ''
  execFilter.value = ''
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
  pageInput.value = String(current)
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

function openCreate() {
  editingId.value = null
  caseForm.title = ''
  caseForm.level = 'P1'
  caseForm.reviewResult = '未评审'
  caseForm.execResult = '未执行'
  caseForm.modulePath = '/未规划用例'
  caseForm.tags = ''
  caseForm.steps = ''
  caseForm.priority = 'medium'
  stepRows.value = [{ action: '', expected: '' }]
  dialogVisible.value = true
}

function openEdit(row: TableRow) {
  editingId.value = row.id
  caseForm.title = row.title
  caseForm.level = row.level || 'P1'
  caseForm.reviewResult = row.reviewResult || '未评审'
  caseForm.execResult = row.execResult || '未执行'
  caseForm.modulePath = row.modulePath || '/未规划用例'
  caseForm.tags = row.tags || ''
  caseForm.steps = row.steps
  caseForm.priority = row.priority || 'medium'
  stepRows.value = parseStepsToRows(row.steps)
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
    caseForm.steps = stepsText

    if (editingId.value) {
      await updateTestCase(selectedProject.value, editingId.value, {
        title: caseForm.title.trim(),
        level: caseForm.level,
        review_result: caseForm.reviewResult,
        exec_result: caseForm.execResult,
        module_path: caseForm.modulePath.trim(),
        tags: caseForm.tags.trim(),
        steps: stepsText,
        priority: caseForm.priority,
      })
      ElMessage.success('修改成功')
    } else {
      await createTestCase(selectedProject.value, {
        title: caseForm.title.trim(),
        level: caseForm.level,
        review_result: caseForm.reviewResult,
        exec_result: caseForm.execResult,
        module_path: caseForm.modulePath.trim(),
        tags: caseForm.tags.trim(),
        steps: stepsText,
        priority: caseForm.priority,
      })
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

async function onProjectChange() {
  page.value = 1
  if (topMenu.value === 'testcases') {
    await loadCases()
  }
}

async function loadUsers() {
  usersLoading.value = true
  try {
    const data = await listUsers()
    users.value = data
      .filter((u) => !u.deleted_at)
      .map((u) => ({ ...u, roleIds: [], projectIds: [] }))
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '加载用户失败')
  } finally {
    usersLoading.value = false
  }
}

async function loadRoles() {
  rolesLoading.value = true
  try {
    roles.value = await listRoles()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '加载角色失败')
  } finally {
    rolesLoading.value = false
  }
}

function switchTopMenu(menu: 'workbench' | 'project' | 'plan' | 'testcases' | 'e2e' | 'system') {
  topMenu.value = menu
  if (menu === 'system') {
    if (roles.value.length === 0) loadRoles()
    if (users.value.length === 0) loadUsers()
    if (projects.value.length === 0) loadProjects()
  }
  if (menu === 'project' && projects.value.length === 0) {
    loadProjects()
  }
}

function switchMenu(menu: 'users' | 'roles' | 'projects') {
  activeMenu.value = menu
  if (menu === 'users') {
    loadUsers()
    if (roles.value.length === 0) loadRoles()
  }
  if (menu === 'roles') loadRoles()
  if (menu === 'projects') loadProjects()
}

function syncProfileForm() {
  profileForm.name = currentUser.value?.name || ''
  profileForm.phone = (currentUser.value as any)?.phone || ''
  profileForm.avatar = (currentUser.value as any)?.avatar || ''
}

function openCreateUser() {
  editingUserId.value = null
  userForm.name = ''
  userForm.email = ''
  userForm.phone = ''
  userForm.roleIds = []
  userForm.projectIds = selectedProject.value ? [selectedProject.value] : []
  userForm.active = true
  userDialogVisible.value = true
}

function openEditUser(row: UserRow) {
  editingUserId.value = row.id
  userForm.name = row.name
  userForm.email = row.email
  userForm.phone = row.phone || ''
  userForm.roleIds = row.roleIds || []
  userForm.projectIds = row.projectIds || []
  userForm.active = row.active
  userDialogVisible.value = true
}

async function submitUser() {
  const name = userForm.name.trim()
  const email = userForm.email.trim().toLowerCase()
  const phone = userForm.phone.trim()

  if (!isValidName(name)) {
    ElMessage.warning('姓名需为2-40位，只允许中文/英文/数字/空格/·/-/_')
    return
  }
  if (!isValidEmail(email)) {
    ElMessage.warning('邮箱格式不正确')
    return
  }
  if (phone && !isValidPhone(phone)) {
    ElMessage.warning('手机号格式不正确（需为11位手机号）')
    return
  }
  if (userForm.roleIds.length === 0 || userForm.projectIds.length === 0) {
    ElMessage.warning('角色和项目至少选择一个')
    return
  }

  savingUser.value = true
  try {
    if (editingUserId.value) {
      await updateUser(editingUserId.value, {
        name,
        email,
        phone: phone || undefined,
        active: userForm.active,
        role_ids: userForm.roleIds,
        project_ids: userForm.projectIds,
      })
      ElMessage.success('用户更新成功')
    } else {
      const defaultRoleName = roles.value.find((r) => r.id === userForm.roleIds[0])?.name || 'tester'
      await createUser({
        name,
        email,
        phone: phone || undefined,
        role: defaultRoleName,
        role_ids: userForm.roleIds,
        project_ids: userForm.projectIds,
      })
      ElMessage.success('用户创建成功')
    }

    userDialogVisible.value = false
    await loadUsers()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '保存用户失败')
  } finally {
    savingUser.value = false
  }
}

function isValidName(name: string) {
  const value = name.trim()
  if (value.length < 2 || value.length > 40) return false
  return /^[\u4e00-\u9fa5A-Za-z0-9\s·_-]+$/.test(value)
}

function isValidEmail(email: string) {
  const value = email.trim().toLowerCase()
  if (!value || value.length > 120) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isValidPhone(phone: string) {
  const value = phone.trim()
  if (!value) return true
  return /^1\d{10}$/.test(value)
}

async function removeUser(row: UserRow) {
  try {
    await ElMessageBox.confirm(`确认删除用户【${row.name}】？`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  try {
    await deleteUserById(row.id)
    ElMessage.success('用户已逻辑删除')
    await loadUsers()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '删除用户失败')
  }
}

function openCreateRole() {
  editingRoleId.value = null
  roleForm.name = ''
  roleForm.description = ''
  roleDialogVisible.value = true
}

function openEditRole(row: Role) {
  editingRoleId.value = row.id
  roleForm.name = row.name
  roleForm.description = row.description || ''
  roleDialogVisible.value = true
}

async function submitRole() {
  if (!roleForm.name.trim()) {
    ElMessage.warning('角色名称不能为空')
    return
  }

  savingRole.value = true
  try {
    if (editingRoleId.value) {
      await updateRoleById(editingRoleId.value, {
        name: roleForm.name.trim(),
        description: roleForm.description.trim(),
      })
      ElMessage.success('角色更新成功')
    } else {
      await createRole({
        name: roleForm.name.trim(),
        description: roleForm.description.trim(),
      })
      ElMessage.success('角色创建成功')
    }

    roleDialogVisible.value = false
    await loadRoles()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '保存角色失败')
  } finally {
    savingRole.value = false
  }
}

async function removeRole(row: Role) {
  try {
    await ElMessageBox.confirm(`确认删除角色【${row.name}】？`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  try {
    await deleteRoleById(row.id)
    ElMessage.success('角色删除成功')
    await loadRoles()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '删除角色失败')
  }
}

function openCreateProject() {
  projectForm.name = ''
  projectForm.description = ''
  projectDialogVisible.value = true
}

async function submitProject() {
  const name = projectForm.name.trim()
  if (!name) {
    ElMessage.warning('项目名称不能为空')
    return
  }
  savingProject.value = true
  try {
    const project = await createProject({
      name,
      description: projectForm.description.trim() || undefined,
    })
    ElMessage.success('项目创建成功')
    projectDialogVisible.value = false
    await loadProjects()
    selectedProject.value = project.id
    if (topMenu.value === 'testcases') {
      page.value = 1
      await loadCases()
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '创建项目失败')
  } finally {
    savingProject.value = false
  }
}

async function saveProfile() {
  savingProfile.value = true
  try {
    const data = await updateMyProfile({
      name: profileForm.name.trim() || undefined,
      phone: profileForm.phone.trim() || undefined,
      avatar: profileForm.avatar.trim() || undefined,
    })
    currentUser.value = { ...currentUser.value!, ...data }
    ElMessage.success('个人中心更新成功')
    profileDialogVisible.value = false
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '个人中心更新失败')
  } finally {
    savingProfile.value = false
  }
}

async function onAvatarFileChange(file: any) {
  const raw = file?.raw as File | undefined
  if (!raw) return
  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(raw.type)) {
    ElMessage.warning('仅支持 JPG/PNG/WEBP 图片')
    return
  }
  if (raw.size > 2 * 1024 * 1024) {
    ElMessage.warning('头像大小不能超过 2MB')
    return
  }
  try {
    savingProfile.value = true
    const data = await uploadMyAvatar(raw)
    profileForm.avatar = data.avatar
    currentUser.value = { ...(currentUser.value as any), avatar: data.avatar }
    ElMessage.success('头像上传成功')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '头像上传失败')
  } finally {
    savingProfile.value = false
  }
}

function openProfileCenter() {
  syncProfileForm()
  profileDialogVisible.value = true
}

function logout() {
  localStorage.removeItem('tp-token')
  localStorage.removeItem('tp-user-id')
  sessionStorage.removeItem('tp-token')
  sessionStorage.removeItem('tp-user-id')

  currentUser.value = null
  loggedIn.value = false
  window.location.reload()
}

onMounted(async () => {
  if (localStorage.getItem('tp-token')) {
    loggedIn.value = true
    await initAfterLogin()
    syncProfileForm()
  }
})
</script>

<template>
  <div class="page">
    <template v-if="!loggedIn">
      <div class="login-wrap">
        <div class="login-card">
          <div class="wordmark">TP</div>
          <h1>登录 TestPilot</h1>
          <p class="sub">工业级测试管理工作台</p>

          <el-input v-model="loginForm.email" placeholder="请输入用户名 / 邮箱" class="mb12" />
          <el-input v-model="loginForm.password" placeholder="请输入密码" show-password class="mb12" />

          <div class="row-between">
            <span class="hint">示例账号：tester@testpilot.local / TestPilot@2026</span>
            <a class="link" href="javascript:void(0)">忘记密码？</a>
          </div>

          <el-button class="primary-btn" :loading="loginLoading" @click="doLogin">登录</el-button>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="layout">
        <header class="top-header">
          <div class="brand">
            <div class="logo">TP</div>
            <div class="name">TestPilot</div>
          </div>

          <div class="project-area">
            <div class="project-inline">
              <el-select v-model="selectedProject" class="project-select-inline" popper-class="project-select-popper" @change="onProjectChange">
                <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
              </el-select>
            </div>

            <div class="mini-tabs">
              <button class="mini-tab active">用例</button>
              <button class="mini-tab">评审</button>
            </div>
          </div>

          <div class="user-box">
            <div class="user-avatar-wrap">
              <img class="user-avatar" :src="userAvatarUrl" alt="avatar" />
              <div class="user-hover-card">
                <div class="hover-user-row">
                  <img class="hover-avatar" :src="userAvatarUrl" alt="avatar" />
                  <div class="hover-user-meta">
                    <div class="hover-name">{{ currentUser?.name || '示例用户' }}</div>
                  </div>
                </div>
                <div class="hover-actions">
                  <button class="hover-action-btn" @click="openProfileCenter">个人中心</button>
                  <button class="hover-action-btn danger" @click="logout">退出登录</button>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div class="main">
          <aside class="main-nav">
            <div class="main-nav-item" @click="switchTopMenu('workbench')" :class="{ active: topMenu === 'workbench' }">工作台</div>
            <div class="main-nav-item" @click="switchTopMenu('project')" :class="{ active: topMenu === 'project' }">项目管理</div>
            <div class="main-nav-item" @click="switchTopMenu('plan')" :class="{ active: topMenu === 'plan' }">测试计划</div>
            <div class="main-nav-item" @click="switchTopMenu('testcases')" :class="{ active: topMenu === 'testcases' }">测试用例</div>
            <div class="main-nav-item" @click="switchTopMenu('e2e')" :class="{ active: topMenu === 'e2e' }">E2E测试</div>
            <div class="main-nav-item" @click="switchTopMenu('system')" :class="{ active: topMenu === 'system' }">系统管理</div>

            <div v-if="topMenu === 'system'" class="sub-nav">
              <div class="sub-nav-item" @click="switchMenu('users')" :class="{ active: activeMenu === 'users' }">用户管理</div>
              <div class="sub-nav-item" @click="switchMenu('roles')" :class="{ active: activeMenu === 'roles' }">角色管理</div>
              <div class="sub-nav-item" @click="switchMenu('projects')" :class="{ active: activeMenu === 'projects' }">项目管理</div>
            </div>
          </aside>

          <section class="content-wrap">
            <div v-if="topMenu === 'testcases'" class="case-page">
              <div class="left-tree">
                <div class="tree-header">
                  <el-input size="small" placeholder="请输入模块名称" />
                </div>
                <div class="tree-list">
                  <div class="tree-item active tree-root-row">
                    <span class="tree-root-title">全部用例</span>
                    <div class="tree-root-actions">
                      <span class="tree-root-count">{{ total }}</span>
                      <el-tooltip content="展开/收起目录" placement="top">
                        <button class="tree-icon-btn ghost" @click.stop="treeExpanded = !treeExpanded">
                          <el-icon><ArrowDown v-if="treeExpanded" /><ArrowUp v-else /></el-icon>
                        </button>
                      </el-tooltip>
                      <el-tooltip content="新建目录" placement="top">
                        <button class="tree-icon-btn ghost" @click.stop="openCreateDirectory">
                          <el-icon><Plus /></el-icon>
                        </button>
                      </el-tooltip>
                    </div>
                  </div>
                  <el-tree
                    v-if="treeExpanded && moduleTree.length > 0"
                    class="module-tree"
                    :data="moduleTree"
                    node-key="path"
                    default-expand-all
                    :props="{ label: 'name', children: 'children' }"
                  >
                    <template #default="{ data }">
                      <div class="tree-node-row">
                        <span>{{ data.name }}</span>
                        <el-tooltip content="删除目录" placement="top">
                          <button class="tree-remove icon" @click.stop="removeDirectory(data.path)">
                            <el-icon><Delete /></el-icon>
                          </button>
                        </el-tooltip>
                      </div>
                    </template>
                  </el-tree>
                </div>
              </div>

              <div class="right-table">
                <div class="toolbar-1">
                  <div class="left">
                    <el-button type="primary" @click="openCreate">新建</el-button>
                  </div>
                  <div class="right filter-bar minimal">
                    <el-input v-model="keyword" class="query-input" placeholder="通过 ID/名称/标签搜索" clearable @keyup.enter="onSearch" />
                    <el-button class="toolbar-btn btn-query" @click="onSearch">查询</el-button>
                    <el-button class="toolbar-btn btn-advanced" @click="filterPanelVisible = true">高级筛选</el-button>
                    <el-button class="toolbar-btn btn-reset" @click="onResetSearch">重置</el-button>
                  </div>
                </div>

                <div class="filter-chips" v-if="activeFilterChips.length > 0">
                  <div class="chip" v-for="f in activeFilterChips" :key="f.key">
                    <span>{{ f.label }}: {{ f.value }}</span>
                    <button class="chip-close" @click="clearOneFilter(f.key)">×</button>
                  </div>
                  <button class="chip-clear-all" @click="onResetSearch">清空筛选</button>
                </div>

                <div class="table-shell" v-loading="appLoading">
                  <div v-if="appLoading" class="table-skeleton">
                    <div class="skeleton-row" v-for="i in 8" :key="i">
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
                        <th style="width: 90px" class="sortable" @click="toggleSort('id')">
                          ID
                          <span class="sort-flag" :class="{ active: sortBy === 'id' }">{{ sortBy === 'id' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span>
                        </th>
                        <th class="sticky-col sticky-name">用例名称</th>
                        <th style="width: 90px">用例等级</th>
                        <th style="width: 100px">评审结果</th>
                        <th style="width: 100px">执行结果</th>
                        <th style="width: 140px">所属模块</th>
                        <th style="width: 120px">标签</th>
                        <th style="width: 110px">更新人</th>
                        <th style="width: 170px" class="sortable" @click="toggleSort('updated_at')">
                          更新时间
                          <span class="sort-flag" :class="{ active: sortBy === 'updated_at' }">{{ sortBy === 'updated_at' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span>
                        </th>
                        <th style="width: 110px">创建人</th>
                        <th style="width: 170px" class="sortable" @click="toggleSort('created_at')">
                          创建时间
                          <span class="sort-flag" :class="{ active: sortBy === 'created_at' }">{{ sortBy === 'created_at' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span>
                        </th>
                        <th style="width: 120px" class="sticky-col sticky-action">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-if="loadError">
                        <td colspan="12" class="empty-td">
                          {{ loadError }}
                          <el-button size="small" @click="loadCases" style="margin-left: 10px">重试</el-button>
                        </td>
                      </tr>
                      <tr v-else-if="rows.length === 0">
                        <td colspan="12" class="empty-td">
                          暂无数据
                          <el-button size="small" @click="openCreate" style="margin-left: 10px">去新建</el-button>
                        </td>
                      </tr>
                      <tr v-else v-for="r in rows" :key="r.id">
                        <td class="id">{{ r.id }}</td>
                        <td class="name sticky-col sticky-name" :title="r.title">{{ r.title }}</td>
                        <td>{{ r.level }}</td>
                        <td>{{ r.reviewResult }}</td>
                        <td>{{ r.execResult }}</td>
                        <td>{{ r.modulePath }}</td>
                        <td :title="r.tags || '-'">{{ r.tags || '-' }}</td>
                        <td>{{ r.updatedByName }}</td>
                        <td>{{ r.updatedAt }}</td>
                        <td>{{ r.createdByName }}</td>
                        <td>{{ r.createdAt }}</td>
                        <td class="sticky-col sticky-action">
                          <div class="action-group">
                            <button class="action-btn action-edit" @click="openEdit(r)">
                              <el-icon class="btn-icon"><Edit /></el-icon>
                              <span>编辑</span>
                            </button>
                            <button class="action-btn action-delete" @click="onDelete(r)">
                              <el-icon class="btn-icon"><Delete /></el-icon>
                              <span>删除</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div class="pager">
                  <el-pagination
                    background
                    small
                    :current-page="page"
                    :page-size="pageSize"
                    :page-sizes="pageSizeOptions"
                    :total="total"
                    layout="total, sizes, prev, pager, next, jumper"
                    @size-change="onPaginationSizeChange"
                    @current-change="onPaginationCurrentChange"
                  />
                </div>
              </div>
            </div>

            <div v-else-if="topMenu === 'system' && activeMenu === 'users'" class="module-card users-card" v-loading="usersLoading">
              <div class="module-toolbar users-toolbar">
                <h3>用户管理</h3>
                <div class="toolbar-extra">
                  <el-tag type="info" effect="plain">共 {{ users.length }} 个用户</el-tag>
                  <el-button type="primary" @click="openCreateUser">新建用户</el-button>
                </div>
              </div>
              <table class="simple-table users-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>姓名</th>
                    <th>邮箱</th>
                    <th>手机号</th>
                    <th>状态</th>
                    <th style="width: 220px">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="users.length === 0">
                    <td colspan="6" class="empty-td">暂无用户</td>
                  </tr>
                  <tr v-for="u in users" :key="u.id">
                    <td class="mono">#{{ u.id }}</td>
                    <td>
                      <div class="user-cell">
                        <img class="user-cell-avatar" :src="resolveAvatarUrl(u.avatar, u.name)" alt="avatar" />
                        <div class="user-cell-meta">
                          <div class="user-cell-name">{{ u.name }}</div>
                          <div class="user-cell-sub">{{ u.email }}</div>
                        </div>
                      </div>
                    </td>
                    <td>{{ u.email }}</td>
                    <td>{{ u.phone || '-' }}</td>
                    <td>
                      <el-tag size="small" :type="u.active ? 'success' : 'info'">{{ u.active ? '启用' : '冻结' }}</el-tag>
                    </td>
                    <td>
                      <div class="action-group">
                        <button class="action-btn action-edit" @click="openEditUser(u)">编辑</button>
                        <button class="action-btn action-delete" @click="removeUser(u)">删除</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-else-if="topMenu === 'system' && activeMenu === 'roles'" class="module-card users-card" v-loading="rolesLoading">
              <div class="module-toolbar users-toolbar">
                <h3>角色管理</h3>
                <div class="toolbar-extra">
                  <el-tag type="info" effect="plain">共 {{ roles.length }} 个角色</el-tag>
                  <el-button type="primary" @click="openCreateRole">新建角色</el-button>
                </div>
              </div>
              <table class="simple-table users-table">
                <thead>
                  <tr>
                    <th>角色名称</th>
                    <th>描述</th>
                    <th style="width: 220px">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="roles.length === 0">
                    <td colspan="3" class="empty-td">暂无角色</td>
                  </tr>
                  <tr v-for="r in roles" :key="r.id">
                    <td>
                      <div class="role-cell-name">{{ r.name }}</div>
                    </td>
                    <td>{{ r.description || '-' }}</td>
                    <td>
                      <div class="action-group">
                        <button class="action-btn action-edit" @click="openEditRole(r)">编辑</button>
                        <button class="action-btn action-delete" @click="removeRole(r)">删除</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-else-if="topMenu === 'system' && activeMenu === 'projects'" class="module-card" v-loading="appLoading">
              <div class="module-toolbar">
                <h3>项目管理</h3>
                <el-button type="primary" @click="openCreateProject">新建项目</el-button>
              </div>
              <table class="simple-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>项目名称</th>
                    <th>项目描述</th>
                    <th style="width: 180px">联动状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="projects.length === 0">
                    <td colspan="4" class="empty-td">暂无项目</td>
                  </tr>
                  <tr v-for="p in projects" :key="p.id" :class="{ 'project-selected-row': selectedProject === p.id }">
                    <td>{{ p.id }}</td>
                    <td>{{ p.name }}</td>
                    <td>{{ p.description || '-' }}</td>
                    <td>
                      <el-button size="small" :type="selectedProject === p.id ? 'primary' : 'default'" @click="selectedProject = p.id; onProjectChange()">
                        {{ selectedProject === p.id ? '当前项目' : '设为当前' }}
                      </el-button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-else class="module-card">
              <div class="module-toolbar">
                <h3>{{ topMenu === 'workbench' ? '工作台' : topMenu === 'project' ? '项目管理' : topMenu === 'plan' ? '测试计划' : 'E2E测试' }}</h3>
              </div>
              <div class="empty-td">该模块保留原入口，页面建设中。</div>
            </div>
          </section>
        </div>
      </div>

      <el-dialog v-model="profileDialogVisible" title="个人中心" width="520px">
        <el-form label-position="top" class="profile-form">
          <el-form-item label="头像">
            <div class="profile-avatar-uploader">
              <img class="profile-avatar-preview" :src="userAvatarUrl" alt="avatar" />
              <el-upload
                class="avatar-upload"
                :show-file-list="false"
                :auto-upload="false"
                :on-change="onAvatarFileChange"
                accept=".jpg,.jpeg,.png,.webp"
              >
                <el-button size="small">上传头像</el-button>
              </el-upload>
            </div>
          </el-form-item>
          <el-form-item label="姓名">
            <el-input v-model="profileForm.name" />
          </el-form-item>
          <el-form-item label="手机号">
            <el-input v-model="profileForm.phone" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="profileDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="savingProfile" @click="saveProfile">保存资料</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="userDialogVisible" :title="editingUserId ? '编辑用户' : '新建用户'" width="640px">
        <el-form label-position="top">
          <el-form-item label="姓名"><el-input v-model="userForm.name" /></el-form-item>
          <el-form-item label="邮箱"><el-input v-model="userForm.email" /></el-form-item>
          <el-form-item label="手机号"><el-input v-model="userForm.phone" /></el-form-item>
          <el-form-item label="角色（必选，可多选）">
            <el-select v-model="userForm.roleIds" multiple filterable placeholder="请选择角色">
              <el-option v-for="r in creatableRoles" :key="r.id" :label="r.name" :value="r.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="项目（必选，可多选）">
            <el-select v-model="userForm.projectIds" multiple filterable placeholder="请选择项目">
              <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="状态">
            <el-switch v-model="userForm.active" active-text="启用" inactive-text="冻结" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="userDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="savingUser" @click="submitUser">保存</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="projectDialogVisible" title="新建项目" width="520px">
        <el-form label-position="top">
          <el-form-item label="项目名称">
            <el-input v-model="projectForm.name" maxlength="80" show-word-limit />
          </el-form-item>
          <el-form-item label="项目描述">
            <el-input v-model="projectForm.description" type="textarea" :rows="3" maxlength="200" show-word-limit />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="projectDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="savingProject" @click="submitProject">创建</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="directoryDialogVisible" title="新建目录" width="520px">
        <el-form label-position="top">
          <el-form-item label="父级目录">
            <el-select v-model="directoryForm.parentPath" placeholder="请选择父级目录">
              <el-option label="全部用例（根目录）" value="/" />
              <el-option v-for="p in modulePaths" :key="p" :label="p" :value="p" />
            </el-select>
          </el-form-item>
          <el-form-item label="目录名称">
            <el-input v-model="directoryForm.name" maxlength="40" show-word-limit placeholder="例如：登录" />
          </el-form-item>
          <div class="directory-tip">规则：最多支持 5 层目录，如 /一级/二级/三级/四级/五级</div>
        </el-form>
        <template #footer>
          <el-button @click="directoryDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitDirectory">创建并使用</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="roleDialogVisible" :title="editingRoleId ? '编辑角色' : '新建角色'" width="520px">
        <el-form label-position="top">
          <el-form-item label="角色名称"><el-input v-model="roleForm.name" /></el-form-item>
          <el-form-item label="角色描述"><el-input v-model="roleForm.description" type="textarea" :rows="3" /></el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="roleDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="savingRole" @click="submitRole">保存</el-button>
        </template>
      </el-dialog>

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
              <el-select v-model="levelFilter" placeholder="请选择" clearable>
                <el-option label="P0" value="P0" />
                <el-option label="P1" value="P1" />
                <el-option label="P2" value="P2" />
              </el-select>
            </el-form-item>

            <el-form-item label="评审结果">
              <el-select v-model="reviewFilter" placeholder="请选择" clearable>
                <el-option label="未评审" value="未评审" />
                <el-option label="已通过" value="已通过" />
                <el-option label="不通过" value="不通过" />
                <el-option label="重新提审" value="重新提审" />
              </el-select>
            </el-form-item>

            <el-form-item label="执行结果">
              <el-select v-model="execFilter" placeholder="请选择" clearable>
                <el-option label="未执行" value="未执行" />
                <el-option label="成功" value="成功" />
                <el-option label="失败" value="失败" />
                <el-option label="阻塞" value="阻塞" />
              </el-select>
            </el-form-item>
          </el-form>

          <div class="advanced-filter-actions">
            <el-button @click="filterPanelVisible = false">取消</el-button>
            <el-button class="btn-reset" @click="onResetSearch">重置</el-button>
            <el-button class="btn-query" @click="applyAdvancedFilters">应用筛选</el-button>
          </div>
        </div>
      </el-drawer>

      <el-drawer
        v-model="dialogVisible"
        :title="editingId ? '编辑用例' : '新建用例'"
        size="68%"
        direction="rtl"
        class="case-editor-drawer"
      >
        <div class="case-editor">
          <div class="case-editor-head">
            <div class="head-left">
              <div class="case-tag">TEST CASE</div>
              <h3>{{ editingId ? '编辑测试用例' : '新建测试用例' }}</h3>
            </div>
            <div class="head-right">
              <el-button @click="dialogVisible = false">取消</el-button>
              <el-button type="primary" :loading="saving" @click="submitCase">保存</el-button>
            </div>
          </div>

          <el-form label-position="top" class="case-editor-form">
            <section class="editor-block">
              <div class="block-title">基础信息</div>
              <div class="block-grid block-grid-2">
                <el-form-item label="用例名称">
                  <el-input v-model="caseForm.title" placeholder="请输入用例名称" />
                </el-form-item>
                <el-form-item label="所属模块">
                  <el-input v-model="caseForm.modulePath" placeholder="如 /内容/文章" />
                </el-form-item>

                <el-form-item label="用例等级">
                  <el-select v-model="caseForm.level">
                    <el-option label="P0" value="P0" />
                    <el-option label="P1" value="P1" />
                    <el-option label="P2" value="P2" />
                  </el-select>
                </el-form-item>

                <el-form-item label="标签">
                  <el-input v-model="caseForm.tags" placeholder="多个标签以逗号分隔" />
                </el-form-item>
              </div>
            </section>

            <section class="editor-block">
              <div class="block-title">评审与执行状态</div>
              <div class="block-grid block-grid-3">
                <el-form-item label="评审结果">
                  <el-select v-model="caseForm.reviewResult">
                    <el-option label="未评审" value="未评审" />
                    <el-option label="已通过" value="已通过" />
                    <el-option label="不通过" value="不通过" />
                    <el-option label="重新提审" value="重新提审" />
                  </el-select>
                </el-form-item>

                <el-form-item label="执行结果">
                  <el-select v-model="caseForm.execResult">
                    <el-option label="未执行" value="未执行" />
                    <el-option label="成功" value="成功" />
                    <el-option label="失败" value="失败" />
                    <el-option label="阻塞" value="阻塞" />
                  </el-select>
                </el-form-item>

                <el-form-item label="优先级">
                  <el-select v-model="caseForm.priority">
                    <el-option label="high" value="high" />
                    <el-option label="medium" value="medium" />
                    <el-option label="low" value="low" />
                  </el-select>
                </el-form-item>
              </div>
            </section>

            <section class="editor-block">
              <div class="block-title">步骤描述</div>
              <div class="steps-grid-head">
                <div>步骤</div>
                <div>预期结果</div>
                <div>操作</div>
              </div>

              <div
                class="steps-grid-row"
                v-for="(s, idx) in stepRows"
                :key="idx"
                draggable="true"
                @dragstart="onStepDragStart(idx)"
                @dragover.prevent
                @drop="onStepDrop(idx)"
                @dragend="onStepDragEnd"
              >
                <el-input v-model="s.action" placeholder="请输入步骤" />
                <el-input v-model="s.expected" placeholder="请输入预期结果" />
                <div class="step-ops">
                  <button class="step-op" :disabled="idx === 0" @click="moveStepUp(idx)">
                    <el-icon class="btn-icon"><ArrowUp /></el-icon>
                    <span>上移</span>
                  </button>
                  <button class="step-op" :disabled="idx === stepRows.length - 1" @click="moveStepDown(idx)">
                    <el-icon class="btn-icon"><ArrowDown /></el-icon>
                    <span>下移</span>
                  </button>
                  <button class="step-op" @click="copyStepRow(idx)">
                    <el-icon class="btn-icon"><CopyDocument /></el-icon>
                    <span>复制</span>
                  </button>
                  <button class="step-op danger" @click="removeStepRow(idx)">
                    <el-icon class="btn-icon"><Delete /></el-icon>
                    <span>删除</span>
                  </button>
                </div>
              </div>

              <div class="steps-grid-actions">
                <el-button @click="addStepRow">新增步骤</el-button>
              </div>
            </section>
          </el-form>
        </div>
      </el-drawer>
    </template>
  </div>
</template>
