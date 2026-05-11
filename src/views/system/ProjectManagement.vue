<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  archiveProject,
  unarchiveProject,
  uploadProjectAvatar,
} from '../../api/project'
import { listMembers, addMember, removeMember } from '../../api/projectMember'
import {
  getProjectSettings,
  updateProjectSettings,
  type TestEnvironment,
} from '../../api/projectSettings'
import { listUsers } from '../../api/user'
import type { Project, ProjectMember, User } from '../../api/types'
import { useAuthStore } from '../../stores/auth'
import { extractErrorMessage, isElMessageBoxCancel } from '../../utils/error'

const authStore = useAuthStore()

function onAvatarError(event: Event, name?: string) {
  authStore.handleAvatarError(event, name)
}

const SEED_PROJECT_NAME = 'AiSight Demo'
const PROTECTED_ROLE_KEYS = new Set(['admin', 'manager'])
const PROTECTED_ROLE_LABELS = new Set(['系统管理员', '项目管理员'])

const projects = ref<Project[]>([])
const appLoading = ref(false)
const searchKeyword = ref('')
const statusFilter = ref<'' | 'active' | 'archived'>('')

// ── 分页 & 复选框 ──
const currentPage = ref(1)
const pageSize = ref(10)
const pageSizeOptions = [10, 20, 50]
const selectedIds = ref<Set<number>>(new Set())

type QualityTone = 'emerald' | 'amber' | 'rose' | 'slate'

const qualityStatusMeta: Record<
  NonNullable<Project['quality_status']>,
  { label: string; color: QualityTone }
> = {
  stable: { label: '良好', color: 'emerald' },
  degraded: { label: '需关注', color: 'amber' },
  failing: { label: '失败', color: 'rose' },
  unknown: { label: '未知', color: 'slate' },
}

function getProjectQuality(project: Project) {
  return qualityStatusMeta[project.quality_status ?? 'unknown'] ?? qualityStatusMeta.unknown
}
function getProjectProgress(project: Project) {
  const progress = typeof project.test_progress === 'number' ? project.test_progress : 0
  const normalized = Math.max(0, Math.min(100, progress))
  return Math.round(normalized * 10) / 10
}
function formatProgress(progress: number) {
  return Number.isInteger(progress) ? `${progress}` : progress.toFixed(1)
}
function getProgressColor(project: Project) {
  const s = getProjectQuality(project)
  if (s.color === 'emerald') return '#34d399'
  if (s.color === 'amber') return '#adc6ff'
  if (s.color === 'slate') return '#94a3b8'
  return '#ffb4ab'
}

// ── 项目创建/编辑弹窗 ──
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingProjectId = ref<number | null>(null)
const savingProject = ref(false)
const projectForm = reactive<{ name: string; description: string; ownerId: number | '' }>({
  name: '',
  description: '',
  ownerId: '',
})
const avatarFile = ref<File | null>(null)
const avatarPreview = ref('')
const avatarInputRef = ref<HTMLInputElement | null>(null)

// ── 成员管理弹窗 ──
const memberDialogVisible = ref(false)
const memberProject = ref<Project | null>(null)
const members = ref<ProjectMember[]>([])
const membersLoading = ref(false)
const memberSearch = ref('')
const allUsers = ref<User[]>([])
const addMemberUserId = ref<number | ''>('')
const addingMember = ref(false)
const projectMembers = ref<Record<number, ProjectMember[]>>({})

// ── 测试环境配置弹窗 ──
const environmentDialogVisible = ref(false)
const environmentProject = ref<Project | null>(null)
const environmentRows = ref<TestEnvironment[]>([])
const environmentLoading = ref(false)
const environmentSaving = ref(false)
const projectEnvironmentMap = ref<Record<number, TestEnvironment[]>>({})
const switchingEnvironmentProjectId = ref<number | null>(null)

/** 过滤并排序项目列表 */
const filteredProjects = computed(() => {
  let list = projects.value
  if (statusFilter.value) list = list.filter((p) => p.status === statusFilter.value)
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    list = list.filter((p) => p.name.toLowerCase().includes(kw))
  }
  return [...list].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  })
})

/** 分页 */
const totalProjects = computed(() => filteredProjects.value.length)
const paginatedProjects = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredProjects.value.slice(start, start + pageSize.value)
})
const paginationLabel = computed(() => {
  const start = totalProjects.value === 0 ? 0 : (currentPage.value - 1) * pageSize.value + 1
  const end = Math.min(currentPage.value * pageSize.value, totalProjects.value)
  return `显示 ${start}-${end} / 共 ${totalProjects.value} 个项目`
})

/** 全选 / 单选 */
const isAllSelected = computed(
  () =>
    paginatedProjects.value.length > 0 &&
    paginatedProjects.value.every((p) => selectedIds.value.has(p.id)),
)
function toggleAll() {
  if (isAllSelected.value) paginatedProjects.value.forEach((p) => selectedIds.value.delete(p.id))
  else paginatedProjects.value.forEach((p) => selectedIds.value.add(p.id))
}
function toggleOne(id: number) {
  if (selectedIds.value.has(id)) selectedIds.value.delete(id)
  else selectedIds.value.add(id)
}
function goToPage(page: number) {
  currentPage.value = page
}
function onProjectPaginationSizeChange(size: number) {
  pageSize.value = size
  currentPage.value = 1
}

const filteredMembers = computed(() => {
  if (!memberSearch.value.trim()) return members.value
  const kw = memberSearch.value.trim().toLowerCase()
  return members.value.filter(
    (m) => m.user?.name?.toLowerCase().includes(kw) || m.user?.email?.toLowerCase().includes(kw),
  )
})
const availableUsers = computed(() => {
  const memberUserIds = new Set(members.value.map((m) => m.user_id))
  return allUsers.value.filter((u) => !memberUserIds.has(u.id) && u.active)
})
const ownerOptions = computed(() => allUsers.value.filter((u) => u.active))

function isSeedProject(p: Project) {
  return p.name === SEED_PROJECT_NAME
}
function isProtectedRoleName(roleName: string) {
  const n = roleName.trim()
  return PROTECTED_ROLE_KEYS.has(n.toLowerCase()) || PROTECTED_ROLE_LABELS.has(n)
}
function getMemberRoleNames(m: ProjectMember) {
  const roleNames = (m.user?.role_names ?? []).filter((name) => !!name?.trim())
  if (roleNames.length > 0) return roleNames
  return m.user?.role ? [m.user.role] : []
}
function isProtectedMember(m: ProjectMember) {
  return getMemberRoleNames(m).some((roleName) => isProtectedRoleName(roleName))
}
function resolveAvatarUrl(avatar?: string, fallbackName?: string) {
  return authStore.resolveAvatarUrl(avatar, fallbackName)
}

async function loadProjects() {
  appLoading.value = true
  try {
    projects.value = await listProjects()
    await loadAllProjectMembers()
    await loadAllProjectEnvironmentSummaries()
  } finally {
    appLoading.value = false
  }
}
async function ensureUsersLoaded() {
  if (allUsers.value.length > 0) return
  allUsers.value = (await listUsers()) as User[]
}
async function loadAllProjectMembers() {
  const map: Record<number, ProjectMember[]> = {}
  await Promise.all(
    projects.value.map(async (p) => {
      try {
        map[p.id] = await listMembers(p.id)
      } catch {
        map[p.id] = []
      }
    }),
  )
  projectMembers.value = map
}
async function loadAllProjectEnvironmentSummaries() {
  const map: Record<number, TestEnvironment[]> = {}
  await Promise.all(
    projects.value.map(async (project) => {
      try {
        const settings = await getProjectSettings(project.id)
        map[project.id] = normalizeEnvironmentRows(settings.test_environments)
      } catch {
        map[project.id] = []
      }
    }),
  )
  projectEnvironmentMap.value = map
}

function getProjectOwnerName(project: Project) {
  return project.owner_name?.trim() || '未设置'
}
function getProjectOwnerAvatar(project: Project) {
  return resolveAvatarUrl(project.owner_avatar, getProjectOwnerName(project))
}
function isProjectOwnerMember(member: ProjectMember) {
  return memberProject.value?.owner_id === member.user_id
}
function isMemberRemovalBlocked(member: ProjectMember) {
  return isProjectOwnerMember(member) || isProtectedMember(member)
}
function memberRemovalTip(member: ProjectMember) {
  if (isProjectOwnerMember(member)) return '当前负责人不可移除，请先转交负责人'
  return '管理员角色不可移除'
}
function getProjectEnvironments(projectId: number) {
  return projectEnvironmentMap.value[projectId] ?? []
}
function getDefaultProjectEnvironment(projectId: number) {
  const envs = getProjectEnvironments(projectId)
  return envs.find((env) => env.is_default) ?? envs[0] ?? null
}
function createEnvironmentRow(): TestEnvironment {
  return {
    id: `env_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: environmentRows.value.length === 0 ? '测试环境' : '',
    base_url: '',
    description: '',
    is_default: environmentRows.value.length === 0,
  }
}
function normalizeEnvironmentRows(rows: TestEnvironment[]) {
  const normalized = rows.map((row) => ({
    id: row.id,
    name: row.name.trim(),
    base_url: row.base_url.trim(),
    description: row.description?.trim() || '',
    is_default: row.is_default,
  }))
  if (normalized.length > 0 && !normalized.some((row) => row.is_default)) {
    const first = normalized[0]
    if (first) first.is_default = true
  }
  return normalized
}
function isValidHttpUrl(raw: string) {
  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
async function openEnvironmentDialog(project: Project) {
  environmentProject.value = project
  environmentRows.value = []
  environmentDialogVisible.value = true
  environmentLoading.value = true
  try {
    const settings = await getProjectSettings(project.id)
    environmentRows.value =
      settings.test_environments.length > 0
        ? normalizeEnvironmentRows(settings.test_environments)
        : [createEnvironmentRow()]
  } catch {
    ElMessage.error('测试环境配置加载失败，请稍后重试')
  } finally {
    environmentLoading.value = false
  }
}
function addEnvironmentRow() {
  environmentRows.value.push(createEnvironmentRow())
}
function removeEnvironmentRow(id: string) {
  environmentRows.value = normalizeEnvironmentRows(
    environmentRows.value.filter((row) => row.id !== id),
  )
}
function setDefaultEnvironment(id: string) {
  environmentRows.value = environmentRows.value.map((row) => ({
    ...row,
    is_default: row.id === id,
  }))
}
function handleProjectEnvironmentCommand(project: Project, command: string | number | object) {
  if (command === 'manage') {
    void openEnvironmentDialog(project)
    return
  }
  if (typeof command !== 'string') return
  void switchDefaultProjectEnvironment(project, command)
}
async function switchDefaultProjectEnvironment(project: Project, environmentId: string) {
  const envs = getProjectEnvironments(project.id)
  const target = envs.find((env) => env.id === environmentId)
  if (!target) {
    ElMessage.warning('测试环境不存在，请刷新后重试')
    return
  }
  if (target.is_default) return

  const rows = normalizeEnvironmentRows(
    envs.map((env) => ({
      ...env,
      is_default: env.id === environmentId,
    })),
  )
  switchingEnvironmentProjectId.value = project.id
  try {
    const settings = await updateProjectSettings(project.id, {
      test_environments: rows,
    })
    const normalized = normalizeEnvironmentRows(settings.test_environments)
    projectEnvironmentMap.value = {
      ...projectEnvironmentMap.value,
      [project.id]: normalized,
    }
    if (environmentProject.value?.id === project.id) environmentRows.value = normalized
    ElMessage.success(`已切换到 ${target.name}`)
  } catch (err: unknown) {
    ElMessage.error(extractErrorMessage(err, '测试环境切换失败'))
  } finally {
    switchingEnvironmentProjectId.value = null
  }
}
async function submitEnvironmentSettings() {
  if (!environmentProject.value) return
  const rows = normalizeEnvironmentRows(environmentRows.value)
  for (const row of rows) {
    if (!row.name) {
      ElMessage.warning('测试环境名称不能为空')
      return
    }
    if (!isValidHttpUrl(row.base_url)) {
      ElMessage.warning('测试环境访问地址必须是有效的 http 或 https URL')
      return
    }
  }
  environmentSaving.value = true
  try {
    const settings = await updateProjectSettings(environmentProject.value.id, {
      test_environments: rows,
    })
    environmentRows.value = normalizeEnvironmentRows(settings.test_environments)
    projectEnvironmentMap.value = {
      ...projectEnvironmentMap.value,
      [environmentProject.value.id]: environmentRows.value,
    }
    environmentDialogVisible.value = false
    ElMessage.success('测试环境配置已保存')
  } catch (err: unknown) {
    ElMessage.error(extractErrorMessage(err, '测试环境配置保存失败'))
  } finally {
    environmentSaving.value = false
  }
}

async function openCreateProject() {
  try {
    await ensureUsersLoaded()
  } catch {
    ElMessage.error('负责人列表加载失败，请稍后重试')
    return
  }
  dialogMode.value = 'create'
  editingProjectId.value = null
  projectForm.name = ''
  projectForm.description = ''
  projectForm.ownerId = ''
  avatarFile.value = null
  avatarPreview.value = ''
  dialogVisible.value = true
}
async function openEditProject(p: Project) {
  try {
    await ensureUsersLoaded()
  } catch {
    ElMessage.error('负责人列表加载失败，请稍后重试')
    return
  }
  dialogMode.value = 'edit'
  editingProjectId.value = p.id
  projectForm.name = p.name
  projectForm.description = p.description || ''
  projectForm.ownerId = p.owner_id || ''
  avatarFile.value = null
  avatarPreview.value = p.avatar ? resolveAvatarUrl(p.avatar) : ''
  dialogVisible.value = true
}
function triggerAvatarInput() {
  avatarInputRef.value?.click()
}
function onAvatarSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (file.size > 2 * 1024 * 1024) {
    ElMessage.warning('头像文件不能超过 2MB')
    return
  }
  avatarFile.value = file
  avatarPreview.value = URL.createObjectURL(file)
  input.value = ''
}
async function submitProject() {
  const name = projectForm.name.trim()
  if (!name) {
    ElMessage.warning('项目名称不能为空')
    return
  }
  savingProject.value = true
  try {
    let projectId: number
    const ownerId = projectForm.ownerId || undefined
    if (dialogMode.value === 'create') {
      const created = await createProject({
        name,
        description: projectForm.description.trim() || undefined,
        owner_id: ownerId,
      })
      projectId = created.id
      ElMessage.success('项目创建成功')
    } else {
      projectId = editingProjectId.value!
      await updateProject(projectId, {
        name,
        description: projectForm.description.trim() || undefined,
        owner_id: ownerId,
      })
      ElMessage.success('项目更新成功')
    }
    if (avatarFile.value) {
      try {
        await uploadProjectAvatar(projectId, avatarFile.value)
      } catch {
        ElMessage.warning('头像上传失败，项目已保存')
      }
    }
    dialogVisible.value = false
    await loadProjects()
  } catch (err: unknown) {
    ElMessage.error(extractErrorMessage(err, '操作失败'))
  } finally {
    savingProject.value = false
  }
}
async function onArchive(p: Project) {
  try {
    await ElMessageBox.confirm(
      `确定要归档项目「${p.name}」吗？归档后项目内所有数据将变为只读。`,
      '归档确认',
      { confirmButtonText: '确认归档', cancelButtonText: '取消', type: 'warning' },
    )
    await archiveProject(p.id)
    ElMessage.success('项目已归档')
    await loadProjects()
  } catch (err: unknown) {
    if (!isElMessageBoxCancel(err)) ElMessage.error(extractErrorMessage(err, '归档失败'))
  }
}
async function onRestore(p: Project) {
  try {
    await unarchiveProject(p.id)
    ElMessage.success('项目已恢复')
    await loadProjects()
  } catch (err: unknown) {
    ElMessage.error(extractErrorMessage(err, '恢复失败'))
  }
}
async function onDelete(p: Project) {
  try {
    await ElMessageBox.confirm(`确定要删除项目「${p.name}」吗？此操作不可恢复。`, '删除确认', {
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'error',
    })
    await deleteProject(p.id)
    ElMessage.success('项目已删除')
    await loadProjects()
  } catch (err: unknown) {
    if (!isElMessageBoxCancel(err)) ElMessage.error(extractErrorMessage(err, '删除失败'))
  }
}
async function openMemberDialog(p: Project) {
  memberProject.value = p
  memberSearch.value = ''
  addMemberUserId.value = ''
  memberDialogVisible.value = true
  await loadMembers(p.id)
  try {
    await ensureUsersLoaded()
  } catch {
    /* 用户列表加载失败时保持成员管理可用 */
  }
}
async function loadMembers(projectId: number) {
  membersLoading.value = true
  try {
    members.value = await listMembers(projectId)
  } finally {
    membersLoading.value = false
  }
}
async function onAddMember() {
  if (!addMemberUserId.value || !memberProject.value) return
  addingMember.value = true
  try {
    await addMember(memberProject.value.id, addMemberUserId.value as number)
    ElMessage.success('成员添加成功')
    addMemberUserId.value = ''
    await loadMembers(memberProject.value.id)
    await loadProjects()
  } catch (err: unknown) {
    ElMessage.error(extractErrorMessage(err, '添加成员失败'))
  } finally {
    addingMember.value = false
  }
}
async function onRemoveMember(m: ProjectMember) {
  if (!memberProject.value) return
  try {
    await ElMessageBox.confirm(`确认将【${m.user?.name || '用户'}】从项目中移除？`, '移除确认', {
      confirmButtonText: '移除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await removeMember(memberProject.value.id, m.user_id)
    ElMessage.success('成员已移除')
    await loadMembers(memberProject.value.id)
    await loadProjects()
  } catch (err: unknown) {
    if (!isElMessageBoxCancel(err)) ElMessage.error(extractErrorMessage(err, '移除失败'))
  }
}
function onCardAction(cmd: string, p: Project) {
  switch (cmd) {
    case 'edit':
      openEditProject(p)
      break
    case 'members':
      openMemberDialog(p)
      break
    case 'environments':
      openEnvironmentDialog(p)
      break
    case 'archive':
      onArchive(p)
      break
    case 'restore':
      onRestore(p)
      break
    case 'delete':
      onDelete(p)
      break
  }
}
onMounted(() => loadProjects())
void Search // suppress unused import warning
</script>

<template>
  <div v-loading="appLoading" class="pm-page">
    <!-- 头部 -->
    <div class="pm-header">
      <div class="pm-header-left">
        <h2 class="pm-title">项目管理</h2>
        <p class="pm-subtitle">统一维护项目、成员、测试环境和质量状态</p>
      </div>
      <div class="pm-header-right">
        <div class="pm-stats-panel">
          <div class="pm-stat-item">
            <span class="pm-stat-label">总项目</span>
            <span class="pm-stat-number pm-stat-primary">{{ totalProjects }}</span>
          </div>
          <div class="pm-stat-divider"></div>
          <div class="pm-stat-item">
            <span class="pm-stat-label">活跃项目</span>
            <span class="pm-stat-number pm-stat-secondary">
              {{ filteredProjects.filter((p) => p.status === 'active').length }}
            </span>
          </div>
          <button class="pm-add-btn" @click="openCreateProject">
            <span class="pm-add-icon">+</span>
            新增项目
          </button>
        </div>
      </div>
    </div>

    <!-- 数据表格 -->
    <div class="pm-table-wrap">
      <table class="pm-table">
        <thead>
          <tr class="pm-table-head">
            <th class="pm-th pm-th-check">
              <input
                type="checkbox"
                class="pm-checkbox"
                :checked="isAllSelected"
                @change="toggleAll"
              />
            </th>
            <th class="pm-th">项目名称</th>
            <th class="pm-th">负责人</th>
            <th class="pm-th">测试环境</th>
            <th class="pm-th">质量状态</th>
            <th class="pm-th">测试进度</th>
            <th class="pm-th pm-th-action">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in paginatedProjects" :key="p.id" class="pm-row">
            <td class="pm-td pm-td-check">
              <input
                type="checkbox"
                class="pm-checkbox"
                :checked="selectedIds.has(p.id)"
                @change="toggleOne(p.id)"
              />
            </td>
            <td class="pm-td">
              <div class="pm-project-cell">
                <div class="pm-project-icon" :class="`pm-icon-${getProjectQuality(p).color}`">
                  <img
                    v-if="p.avatar"
                    :src="resolveAvatarUrl(p.avatar)"
                    class="pm-project-avatar-img"
                    @error="onAvatarError($event, p.name)"
                  />
                  <span
                    v-else
                    class="material-symbols-outlined"
                    style="font-variation-settings: 'FILL' 1"
                  >
                    rocket_launch
                  </span>
                </div>
                <span class="pm-project-name">{{ p.name }}</span>
              </div>
            </td>
            <td class="pm-td">
              <div class="pm-owner-cell">
                <img
                  class="pm-owner-avatar"
                  :src="getProjectOwnerAvatar(p)"
                  @error="onAvatarError($event, getProjectOwnerName(p))"
                />
                <span class="pm-owner-name">{{ getProjectOwnerName(p) }}</span>
              </div>
            </td>
            <td class="pm-td">
              <el-dropdown
                v-if="getProjectEnvironments(p.id).length > 0"
                trigger="click"
                popper-class="pm-env-dropdown-popper"
                :disabled="switchingEnvironmentProjectId === p.id"
                @command="
                  (cmd: string | number | object) => handleProjectEnvironmentCommand(p, cmd)
                "
              >
                <button class="pm-env-trigger" type="button" :aria-label="`${p.name} 切换测试环境`">
                  <span
                    v-if="switchingEnvironmentProjectId === p.id"
                    class="material-symbols-outlined pm-env-spin"
                  >
                    progress_activity
                  </span>
                  <span v-else class="pm-env-trigger-dot"></span>
                  <span class="pm-env-trigger-label">
                    {{ getDefaultProjectEnvironment(p.id)?.name || '选择环境' }}
                  </span>
                  <span v-if="getProjectEnvironments(p.id).length > 1" class="pm-env-trigger-count">
                    {{ getProjectEnvironments(p.id).length }}
                  </span>
                  <span class="material-symbols-outlined pm-env-chevron">expand_more</span>
                </button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="env in getProjectEnvironments(p.id)"
                      :key="env.id"
                      :command="env.id"
                      :disabled="env.is_default"
                    >
                      <span class="pm-env-menu-item" :class="{ 'is-active': env.is_default }">
                        <span class="pm-env-menu-dot"></span>
                        <span class="pm-env-menu-copy">
                          <span class="pm-env-menu-name">{{ env.name }}</span>
                          <span class="pm-env-menu-url">{{ env.base_url }}</span>
                        </span>
                        <span
                          v-if="env.is_default"
                          class="pm-env-menu-check material-symbols-outlined"
                        >
                          check
                        </span>
                      </span>
                    </el-dropdown-item>
                    <el-dropdown-item command="manage" divided>
                      <span class="pm-env-menu-manage">
                        <span class="material-symbols-outlined">settings</span>
                        管理测试环境
                      </span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <button
                v-else
                class="pm-env-trigger pm-env-trigger--empty"
                type="button"
                @click="openEnvironmentDialog(p)"
              >
                <span class="pm-env-trigger-dot"></span>
                <span class="pm-env-trigger-label">未配置</span>
                <span class="material-symbols-outlined pm-env-chevron">add</span>
              </button>
            </td>
            <td class="pm-td">
              <span class="pm-health-badge" :class="`pm-health-${getProjectQuality(p).color}`">
                <span class="pm-health-dot"></span>
                {{ getProjectQuality(p).label }}
              </span>
            </td>
            <td class="pm-td">
              <div class="pm-progress-cell">
                <span class="pm-progress-label">{{ formatProgress(getProjectProgress(p)) }}%</span>
                <div class="pm-progress-track">
                  <div
                    class="pm-progress-bar"
                    :style="{
                      width: getProjectProgress(p) + '%',
                      background: getProgressColor(p),
                    }"
                    :class="{ 'pm-progress-glow': getProjectProgress(p) === 100 }"
                  ></div>
                </div>
              </div>
            </td>
            <td class="pm-td pm-td-action">
              <el-dropdown trigger="click" @command="(cmd: string) => onCardAction(cmd, p)">
                <button class="pm-more-btn">
                  <span class="material-symbols-outlined">more_vert</span>
                </button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="edit">编辑</el-dropdown-item>
                    <el-dropdown-item command="members">成员管理</el-dropdown-item>
                    <el-dropdown-item command="environments">测试环境</el-dropdown-item>
                    <el-dropdown-item
                      v-if="p.status === 'active'"
                      command="archive"
                      :disabled="isSeedProject(p)"
                    >
                      归档
                    </el-dropdown-item>
                    <el-dropdown-item v-else command="restore">恢复</el-dropdown-item>
                    <el-dropdown-item
                      command="delete"
                      :disabled="isSeedProject(p) || p.status === 'active'"
                      divided
                    >
                      删除
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </td>
          </tr>
          <tr v-if="paginatedProjects.length === 0">
            <td colspan="7" class="pm-empty-row">暂无匹配的项目</td>
          </tr>
        </tbody>
      </table>
      <div class="pm-pagination">
        <span class="pm-pagination-info">{{ paginationLabel }}</span>
        <el-pagination
          background
          size="small"
          :current-page="currentPage"
          :page-size="pageSize"
          :page-sizes="pageSizeOptions"
          :total="totalProjects"
          layout="sizes, prev, pager, next, jumper"
          @size-change="onProjectPaginationSizeChange"
          @current-change="goToPage"
        />
      </div>
    </div>

    <!-- 底部统计 Bento Grid -->
    <div class="pm-bento-grid">
      <div class="pm-glass-card">
        <div class="pm-card-top">
          <h4 class="pm-card-label">覆盖率趋势</h4>
          <span class="pm-trend-up">
            <span class="material-symbols-outlined pm-trend-icon">trending_up</span>
            +4.2%
          </span>
        </div>
        <div class="pm-card-value-row">
          <span class="pm-big-num">88.4</span>
          <span class="pm-big-unit">%</span>
        </div>
        <div class="pm-mini-bars">
          <div class="pm-bar" style="height: 50%"></div>
          <div class="pm-bar" style="height: 66%"></div>
          <div class="pm-bar" style="height: 75%"></div>
          <div class="pm-bar pm-bar-mid" style="height: 50%"></div>
          <div class="pm-bar pm-bar-mid" style="height: 66%"></div>
          <div class="pm-bar pm-bar-hi" style="height: 100%"></div>
        </div>
      </div>
      <div class="pm-glass-card">
        <div class="pm-card-top">
          <h4 class="pm-card-label">风险提醒</h4>
          <span class="pm-urgent-badge">需关注</span>
        </div>
        <div class="pm-vectors-list">
          <div class="pm-vector-row">
            <div class="pm-vector-left">
              <span class="material-symbols-outlined pm-vector-icon pm-vector-rose">
                bug_report
              </span>
              <span class="pm-vector-text">接口响应异常</span>
            </div>
            <span class="pm-vector-count">12 处</span>
          </div>
          <div class="pm-vector-row">
            <div class="pm-vector-left">
              <span class="material-symbols-outlined pm-vector-icon pm-vector-amber">
                sync_problem
              </span>
              <span class="pm-vector-text">运行资源泄露</span>
            </div>
            <span class="pm-vector-count">5 处</span>
          </div>
          <div class="pm-vector-row">
            <div class="pm-vector-left">
              <span class="material-symbols-outlined pm-vector-icon pm-vector-primary">
                history
              </span>
              <span class="pm-vector-text">回归风险</span>
            </div>
            <span class="pm-vector-count pm-vector-primary">低</span>
          </div>
        </div>
      </div>
      <div class="pm-capacity-card">
        <div class="pm-capacity-content">
          <h4 class="pm-card-label pm-card-label--purple">执行资源</h4>
          <p class="pm-capacity-sub">测试执行节点当前负载</p>
          <div class="pm-capacity-stats">
            <div>
              <p class="pm-capacity-num">64%</p>
              <p class="pm-capacity-label">负载</p>
            </div>
            <div class="pm-capacity-divider"></div>
            <div>
              <p class="pm-capacity-num">
                2.4
                <span class="pm-capacity-unit">ms</span>
              </p>
              <p class="pm-capacity-label">响应</p>
            </div>
          </div>
        </div>
        <div class="pm-capacity-deco">
          <span class="material-symbols-outlined">query_stats</span>
        </div>
      </div>
    </div>

    <!-- 创建/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新建项目' : '编辑项目'"
      width="520px"
    >
      <el-form label-position="top">
        <el-form-item label="项目头像">
          <div class="pm-avatar-upload" @click="triggerAvatarInput">
            <img v-if="avatarPreview" :src="avatarPreview" class="pm-avatar-preview" />
            <div v-else class="pm-avatar-placeholder">
              <span class="pm-avatar-placeholder-icon">+</span>
              <span class="pm-avatar-placeholder-text">点击上传</span>
            </div>
            <input
              ref="avatarInputRef"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              style="display: none"
              @change="onAvatarSelected"
            />
          </div>
          <span class="pm-avatar-hint">支持 PNG/JPG/GIF/WebP，最大 2MB</span>
        </el-form-item>
        <el-form-item label="项目名称">
          <el-input
            v-model="projectForm.name"
            maxlength="80"
            show-word-limit
            placeholder="请输入项目名称"
            :disabled="dialogMode === 'edit' && isSeedProject({ name: projectForm.name } as any)"
          />
        </el-form-item>
        <el-form-item label="项目描述">
          <el-input
            v-model="projectForm.description"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="请输入项目描述（可选）"
          />
        </el-form-item>
        <el-form-item label="负责人">
          <el-select
            v-model="projectForm.ownerId"
            filterable
            :clearable="dialogMode === 'create'"
            placeholder="不选择则默认创建人为负责人"
            style="width: 100%"
          >
            <el-option
              v-for="user in ownerOptions"
              :key="user.id"
              :label="`${user.name} (${user.email})`"
              :value="user.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingProject" @click="submitProject">
          {{ dialogMode === 'create' ? '创建' : '保存' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 成员管理弹窗 -->
    <el-dialog
      v-model="memberDialogVisible"
      :title="`${memberProject?.name || ''} - 成员管理`"
      width="900px"
    >
      <div class="mb-toolbar">
        <el-input
          v-model="memberSearch"
          placeholder="搜索成员..."
          clearable
          :prefix-icon="Search"
          class="mb-search"
        />
        <div class="mb-add-bar">
          <el-select
            v-model="addMemberUserId"
            filterable
            placeholder="选择用户..."
            class="mb-add-select"
            :disabled="availableUsers.length === 0"
          >
            <el-option
              v-for="u in availableUsers"
              :key="u.id"
              :label="`${u.name} (${u.email})`"
              :value="u.id"
            />
          </el-select>
          <button
            class="mb-add-btn"
            :disabled="!addMemberUserId || addingMember"
            @click="onAddMember"
          >
            添加成员
          </button>
        </div>
      </div>
      <div v-loading="membersLoading" class="mb-grid">
        <div v-for="m in filteredMembers" :key="m.user_id" class="mb-card">
          <img
            class="mb-card-avatar"
            :src="resolveAvatarUrl(m.user?.avatar, m.user?.name)"
            alt="avatar"
            @error="
              (e: any) => {
                e.target.src = resolveAvatarUrl('', m.user?.name)
              }
            "
          />
          <span class="mb-card-name">{{ m.user?.name || '-' }}</span>
          <span class="mb-card-email">{{ m.user?.email || '' }}</span>
          <div class="mb-card-roles">
            <span v-if="isProjectOwnerMember(m)" class="mb-role-pill mb-role-pill--owner">
              负责人
            </span>
            <span
              v-for="(roleName, ridx) in getMemberRoleNames(m)"
              :key="`${m.user_id}-${ridx}`"
              class="mb-role-pill"
              :class="{ 'mb-role-pill--protected': isProtectedRoleName(roleName) }"
            >
              {{ roleName }}
            </span>
            <span
              v-if="getMemberRoleNames(m).length === 0 && !isProjectOwnerMember(m)"
              class="mb-role-pill"
            >
              成员
            </span>
          </div>
          <el-tooltip
            v-if="isMemberRemovalBlocked(m)"
            :content="memberRemovalTip(m)"
            placement="top"
          >
            <button class="mb-card-remove mb-card-remove--disabled" disabled>移除</button>
          </el-tooltip>
          <button v-else class="mb-card-remove" @click="onRemoveMember(m)">移除</button>
        </div>
        <div v-if="filteredMembers.length === 0 && !membersLoading" class="mb-empty">暂无成员</div>
      </div>
    </el-dialog>

    <el-dialog
      v-model="environmentDialogVisible"
      :title="`${environmentProject?.name || ''} - 测试环境配置`"
      width="860px"
    >
      <div v-loading="environmentLoading" class="pm-env-panel">
        <div class="pm-env-toolbar">
          <div>
            <h3 class="pm-env-title">项目通用测试环境</h3>
            <p class="pm-env-desc">
              维护当前项目可复用的访问地址，AI 生成、脚本录制和后续执行均可引用。
            </p>
          </div>
          <button type="button" class="pm-env-add" @click="addEnvironmentRow">
            <span class="material-symbols-outlined">add</span>
            添加环境
          </button>
        </div>
        <div class="pm-env-list">
          <div v-for="row in environmentRows" :key="row.id" class="pm-env-row">
            <label class="pm-env-default">
              <input
                type="radio"
                name="default-test-environment"
                :checked="row.is_default"
                @change="setDefaultEnvironment(row.id)"
              />
              默认
            </label>
            <el-input v-model="row.name" class="pm-env-name" placeholder="环境名称，如测试环境" />
            <el-input
              v-model="row.base_url"
              class="pm-env-url"
              placeholder="https://test.example.com"
            />
            <el-input
              v-model="row.description"
              class="pm-env-desc-input"
              placeholder="说明（可选）"
            />
            <button
              type="button"
              class="pm-env-remove"
              aria-label="删除测试环境"
              @click="removeEnvironmentRow(row.id)"
            >
              <span class="material-symbols-outlined">delete</span>
            </button>
          </div>
          <div v-if="environmentRows.length === 0" class="pm-env-empty">
            暂无测试环境，点击“添加环境”创建一条配置
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="environmentDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="environmentSaving" @click="submitEnvironmentSettings">
          保存配置
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.pm-page {
  padding: 16px 20px;
}
.pm-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
  gap: 24px;
  flex-wrap: wrap;
}
.pm-header-left {
  flex: 1;
  min-width: 200px;
}
.pm-title {
  font-size: 28px;
  font-weight: 600;
  color: #e1e1f2;
  margin: 0 0 6px 0;
  letter-spacing: -0.5px;
}
.pm-subtitle {
  font-size: 14px;
  color: #ccc3d8;
  margin: 0;
  font-weight: 300;
}
.pm-header-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
/* Stats panel — glass container (与角色管理统一) */
.pm-stats-panel {
  display: flex;
  align-items: center;
  gap: 32px;
  padding: 16px 24px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(74, 68, 85, 0.15);
}
.pm-stat-item {
  text-align: center;
}
.pm-stat-label {
  display: block;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: #958da1;
  margin-bottom: 4px;
}
.pm-stat-number {
  font-size: 24px;
  font-weight: 700;
}
.pm-stat-primary {
  color: #d2bbff;
}
.pm-stat-secondary {
  color: #adc6ff;
}
.pm-stat-divider {
  width: 1px;
  height: 32px;
  background: rgba(74, 68, 85, 0.2);
}
/* Add button — inside the glass panel (与角色管理统一) */
.pm-add-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  margin-left: 16px;
  border-radius: var(--tp-btn-radius);
  border: none;
  background: var(--tp-btn-bg);
  color: var(--tp-btn-text);
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition: all var(--tp-transition);
  white-space: nowrap;
  box-shadow: var(--tp-btn-shadow);
}
.pm-add-btn:hover {
  background: var(--tp-btn-bg-hover);
  filter: none;
  box-shadow: var(--tp-btn-shadow-hover);
}
.pm-add-btn:active {
  transform: scale(0.95);
}
.pm-add-icon {
  font-size: 16px;
  font-weight: 700;
}
.pm-table-wrap {
  background: #191b26;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 24px;
  border: 1px solid rgba(74, 68, 85, 0.05);
}
.pm-table {
  width: 100%;
  text-align: left;
  border-collapse: collapse;
}
.pm-table-head {
  background: #1d1f2b;
}
.pm-th {
  padding: 14px 24px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #ccc3d8;
}
.pm-th-check {
  width: 48px;
  text-align: center;
}
.pm-th-action {
  text-align: right;
  padding-right: 16px;
}
.pm-row {
  border-top: 1px solid rgba(74, 68, 85, 0.1);
  transition: background 0.15s;
}
.pm-row:hover {
  background: rgba(39, 41, 53, 0.5);
}
.pm-td {
  padding: 14px 24px;
  vertical-align: middle;
}
.pm-td-check {
  text-align: center;
}
.pm-td-action {
  text-align: right;
  padding-right: 16px;
}
.pm-empty-row {
  text-align: center;
  padding: 48px 24px;
  color: #958da1;
  font-size: 14px;
}
.pm-checkbox {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1.5px solid var(--tp-border-strong);
  background: var(--tp-surface-input);
  cursor: pointer;
  vertical-align: middle;
  position: relative;
  transition: all 0.15s;
}
.pm-checkbox:checked {
  background: var(--tp-btn-bg);
  border-color: var(--tp-btn-border);
  box-shadow: var(--tp-btn-shadow);
}
.pm-checkbox:checked::after {
  content: '✓';
  position: absolute;
  top: -1px;
  left: 2px;
  font-size: 11px;
  color: var(--tp-btn-text);
  font-weight: 700;
}
.pm-checkbox:focus {
  outline: 2px solid var(--tp-accent-primary-soft);
  outline-offset: 1px;
}
.pm-project-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}
.pm-project-icon {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pm-project-icon .material-symbols-outlined {
  font-size: 18px;
}
.pm-project-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;
}
.pm-icon-emerald {
  background: rgba(210, 187, 255, 0.1);
  color: #d2bbff;
}
.pm-icon-amber {
  background: rgba(173, 198, 255, 0.1);
  color: #adc6ff;
}
.pm-icon-rose {
  background: rgba(255, 180, 171, 0.1);
  color: #ffb4ab;
}
.pm-icon-slate {
  background: rgba(148, 163, 184, 0.12);
  color: #94a3b8;
}
.pm-project-name {
  font-size: 13px;
  font-weight: 600;
  color: #e1e1f2;
}
.pm-owner-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pm-owner-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.06);
}
.pm-owner-name {
  font-size: 13px;
  font-weight: 300;
  color: #e1e1f2;
}
.pm-env-cell {
  display: inline-flex;
  align-items: center;
  max-width: 260px;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--tp-border-subtle);
  border-radius: 12px;
  background: var(--tp-surface-input);
  color: var(--tp-text-primary);
  cursor: pointer;
  text-align: left;
}
.pm-env-cell:hover {
  border-color: var(--tp-accent-primary-border);
  background: var(--tp-surface-hover);
}
.pm-env-cell-icon {
  color: var(--tp-primary);
  font-size: 18px;
}
.pm-env-cell-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.pm-env-cell-name,
.pm-env-cell-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pm-env-cell-name {
  color: var(--tp-text-primary);
  font-size: var(--tp-text-sm);
  font-weight: var(--tp-font-semibold);
  line-height: var(--tp-line-ui);
}
.pm-env-cell-url {
  color: var(--tp-text-muted);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-medium);
  line-height: var(--tp-line-ui);
}
.pm-health-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  gap: 6px;
}
.pm-health-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.pm-health-emerald {
  background: rgba(52, 211, 153, 0.1);
  color: #34d399;
}
.pm-health-amber {
  background: rgba(251, 191, 36, 0.1);
  color: #fbbf24;
}
.pm-health-rose {
  background: rgba(251, 113, 133, 0.1);
  color: #fb7185;
}
.pm-health-slate {
  background: rgba(148, 163, 184, 0.12);
  color: #94a3b8;
}
.pm-progress-cell {
  width: 120px;
}
.pm-progress-label {
  font-size: 10px;
  color: #ccc3d8;
  display: block;
  margin-bottom: 4px;
}
.pm-progress-track {
  width: 100%;
  height: 4px;
  background: #323440;
  border-radius: 9999px;
}
.pm-progress-bar {
  height: 4px;
  border-radius: 9999px;
  transition: width 0.4s ease;
}
.pm-progress-glow {
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.5);
}
.pm-more-btn {
  padding: 6px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #ccc3d8;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pm-more-btn:hover {
  background: #373845;
}
.pm-pagination {
  padding: 14px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(29, 31, 43, 0.5);
}
.pm-pagination-info {
  font-size: 11px;
  color: #958da1;
  font-weight: 300;
}
.pm-pagination-btns {
  display: flex;
  gap: 4px;
}
.pm-page-btn {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  border: none;
  background: #272935;
  color: #e1e1f2;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.pm-page-btn:hover:not(:disabled) {
  background: #373845;
}
.pm-page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.pm-page-btn--active {
  background: var(--tp-btn-bg);
  color: var(--tp-btn-text);
  font-weight: 700;
  box-shadow: var(--tp-btn-shadow);
}
.pm-page-icon {
  font-size: 16px;
}
.pm-bento-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}
.pm-glass-card {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  padding: 24px;
  border-radius: 16px;
  border: 1px solid rgba(74, 68, 85, 0.1);
}
.pm-card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}
.pm-card-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #ccc3d8;
  text-transform: uppercase;
  margin: 0;
}
.pm-card-label--purple {
  color: #d2bbff;
}
.pm-trend-up {
  color: #34d399;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
}
.pm-trend-icon {
  font-size: 14px;
}
.pm-card-value-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 16px;
}
.pm-big-num {
  font-size: 36px;
  font-weight: 600;
  color: #fff;
  letter-spacing: -1px;
}
.pm-big-unit {
  font-size: 14px;
  color: #ccc3d8;
}
.pm-mini-bars {
  height: 48px;
  display: flex;
  align-items: flex-end;
  gap: 4px;
  padding: 0 4px;
}
.pm-bar {
  flex: 1;
  background: rgba(210, 187, 255, 0.2);
  border-radius: 2px 2px 0 0;
}
.pm-bar-mid {
  background: rgba(210, 187, 255, 0.4);
}
.pm-bar-hi {
  background: #d2bbff;
  box-shadow: 0 0 15px rgba(124, 58, 237, 0.3);
}
.pm-urgent-badge {
  background: rgba(244, 63, 94, 0.2);
  color: #fb7185;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
}
.pm-vectors-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.pm-vector-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pm-vector-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pm-vector-icon {
  font-size: 16px;
}
.pm-vector-rose {
  color: #fb7185;
}
.pm-vector-amber {
  color: #fbbf24;
}
.pm-vector-primary {
  color: #d2bbff;
}
.pm-vector-text {
  font-size: 12px;
  font-weight: 300;
  color: #e1e1f2;
}
.pm-vector-count {
  font-size: 12px;
  font-weight: 600;
  color: #e1e1f2;
}
.pm-capacity-card {
  background: rgba(124, 58, 237, 0.1);
  padding: 24px;
  border-radius: 16px;
  border: 1px solid rgba(210, 187, 255, 0.2);
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  position: relative;
}
.pm-capacity-content {
  position: relative;
  z-index: 1;
}
.pm-capacity-sub {
  font-size: 12px;
  color: #ccc3d8;
  font-weight: 300;
  margin: 4px 0 24px;
}
.pm-capacity-stats {
  display: flex;
  gap: 16px;
  align-items: center;
}
.pm-capacity-num {
  font-size: 22px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}
.pm-capacity-unit {
  font-size: 12px;
  font-weight: 300;
  margin-left: 2px;
}
.pm-capacity-label {
  font-size: 10px;
  color: #ccc3d8;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  margin: 4px 0 0;
}
.pm-capacity-divider {
  width: 1px;
  height: 40px;
  background: rgba(74, 68, 85, 0.3);
}
.pm-capacity-deco {
  position: absolute;
  right: -16px;
  bottom: -16px;
  opacity: 0.1;
}
.pm-capacity-deco .material-symbols-outlined {
  font-size: 120px;
}
.pm-avatar-upload {
  width: 72px;
  height: 72px;
  border-radius: 12px;
  border: 2px dashed rgba(255, 255, 255, 0.15);
  cursor: pointer;
  overflow: hidden;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pm-avatar-upload:hover {
  border-color: rgba(124, 58, 237, 0.5);
  background: rgba(124, 58, 237, 0.06);
}
.pm-avatar-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.pm-avatar-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.pm-avatar-placeholder-icon {
  font-size: 22px;
  color: rgba(255, 255, 255, 0.3);
  line-height: 1;
}
.pm-avatar-placeholder-text {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
}
.pm-avatar-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 6px;
  display: block;
}
.mb-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}
.mb-search {
  flex: 3;
  min-width: 0;
}
:deep(.mb-search .el-input__wrapper) {
  border-radius: 8px;
}
.mb-add-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 3;
  min-width: 0;
}
.mb-add-select {
  flex: 1;
  min-width: 0;
}
:deep(.mb-add-select .el-select__wrapper) {
  border-radius: 8px;
}
.mb-add-btn {
  padding: 8px 16px;
  background: linear-gradient(135deg, #7c3aed, #6d28d9);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}
.mb-add-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  box-shadow: 0 4px 16px rgba(124, 58, 237, 0.3);
}
.mb-add-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.mb-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  max-height: 480px;
  overflow-y: auto;
  padding-right: 4px;
}
.mb-grid::-webkit-scrollbar {
  width: 4px;
}
.mb-grid::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}
.mb-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-top: 2px solid rgba(124, 58, 237, 0.4);
  border-radius: 10px;
  padding: 16px 12px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transition: all 0.2s ease;
}
.mb-card:hover {
  border-color: rgba(124, 58, 237, 0.5);
  border-top-color: rgba(124, 58, 237, 0.7);
  background: rgba(255, 255, 255, 0.05);
}
.mb-card-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid rgba(124, 58, 237, 0.25);
  margin-bottom: 6px;
}
.mb-card-name {
  font-size: 13px;
  font-weight: 700;
  color: #f0f0f5;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.mb-card-email {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.28);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  margin-bottom: 4px;
}
.mb-card-roles {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
  margin-top: 2px;
}
.mb-role-pill {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--tp-accent-primary-soft);
  color: var(--tp-primary);
  border: 1px solid var(--tp-accent-primary-soft);
}
.mb-role-pill--protected {
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.2);
}
.mb-role-pill--owner {
  background: rgba(139, 92, 246, 0.18);
  color: #c4b5fd;
  border-color: rgba(139, 92, 246, 0.32);
}
.mb-card-remove {
  margin-top: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.25);
  background: none;
  border: none;
  cursor: pointer;
  padding: 3px 10px;
  border-radius: 6px;
  transition: all 0.15s;
}
.mb-card-remove:hover {
  color: #f87171;
  background: rgba(239, 68, 68, 0.1);
}
.mb-card-remove--disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.mb-card-remove--disabled:hover {
  color: rgba(255, 255, 255, 0.25);
  background: none;
}
.mb-empty {
  grid-column: 1 / -1;
  text-align: center;
  padding: 40px 0;
  color: rgba(255, 255, 255, 0.25);
  font-size: 14px;
}

.pm-page {
  background: var(--tp-surface-base);
}

.pm-title,
.pm-project-name,
.pm-owner-name,
.pm-big-num,
.pm-capacity-num,
.pm-vector-text,
.pm-vector-count,
.mb-card-name {
  color: var(--tp-gray-900);
}

.pm-subtitle,
.pm-stat-label,
.pm-th,
.pm-empty-row,
.pm-progress-label,
.pm-pagination-info,
.pm-card-label,
.pm-big-unit,
.pm-capacity-sub,
.pm-capacity-label,
.mb-card-email,
.mb-empty {
  color: var(--tp-gray-500);
}

.pm-stats-panel,
.pm-table-wrap,
.pm-glass-card,
.pm-capacity-card {
  background: var(--tp-surface-card);
  border-color: var(--tp-border-subtle);
  box-shadow: var(--tp-shadow-card);
  backdrop-filter: none;
}

.pm-stat-primary,
.pm-stat-secondary,
.pm-card-label--purple,
.pm-vector-primary {
  color: var(--tp-primary);
}

.pm-stat-divider,
.pm-capacity-divider {
  background: var(--tp-border-subtle);
}

.pm-add-btn,
.mb-add-btn,
.mb-add-btn:hover:not(:disabled) {
  background: var(--tp-btn-bg);
  color: var(--tp-btn-text);
  border-radius: var(--tp-btn-radius);
  box-shadow: var(--tp-btn-shadow);
  filter: none;
}

.pm-add-btn:hover,
.mb-add-btn:hover:not(:disabled) {
  background: var(--tp-btn-bg-hover);
  box-shadow: var(--tp-btn-shadow-hover);
}

.pm-table-head {
  background: var(--tp-surface-header);
}

.pm-row {
  background: var(--tp-surface-card);
  border-top-color: var(--tp-border-subtle);
}

.pm-row:hover {
  background: var(--tp-surface-row-hover);
}

.pm-td {
  color: var(--tp-gray-700);
}

.pm-checkbox {
  border-color: var(--tp-border-strong);
  background: var(--tp-surface-input);
}

.pm-checkbox:checked {
  background: var(--tp-primary);
  border-color: var(--tp-primary);
}

.pm-checkbox:checked::after {
  color: var(--tp-btn-text);
}

.pm-checkbox:focus {
  outline-color: var(--tp-accent-primary-border);
}

.pm-icon-emerald,
.pm-icon-amber {
  background: var(--tp-accent-primary-soft);
  color: var(--tp-primary);
}

.pm-icon-rose {
  background: var(--tp-accent-danger-soft);
  color: var(--tp-accent-danger);
}

.pm-icon-slate {
  background: var(--tp-surface-muted);
  color: var(--tp-gray-500);
}

.pm-owner-avatar,
.mb-card-avatar {
  background: var(--tp-surface-muted);
  border-color: var(--tp-border-subtle);
}

.pm-health-emerald {
  background: var(--tp-accent-success-soft);
  color: var(--tp-accent-success);
}

.pm-health-amber {
  background: var(--tp-accent-warning-soft);
  color: var(--tp-accent-warning);
}

.pm-health-rose {
  background: var(--tp-accent-danger-soft);
  color: var(--tp-accent-danger);
}

.pm-health-slate {
  background: var(--tp-surface-muted);
  color: var(--tp-gray-500);
}

.pm-progress-track {
  background: var(--tp-gray-200);
}

.pm-more-btn {
  color: var(--tp-gray-500);
}

.pm-more-btn:hover {
  background: var(--tp-surface-hover);
  color: var(--tp-primary);
}

.pm-pagination {
  background: var(--tp-surface-header);
  border-top: 1px solid var(--tp-border-subtle);
}

.pm-page-btn {
  background: var(--tp-surface-input);
  border: 1px solid var(--tp-border-subtle);
  color: var(--tp-gray-700);
}

.pm-page-btn:hover:not(:disabled) {
  background: var(--tp-surface-hover);
  color: var(--tp-primary);
}

.pm-page-btn--active {
  background: var(--tp-btn-bg);
  border-color: var(--tp-btn-border);
  color: var(--tp-btn-text);
  box-shadow: var(--tp-btn-shadow);
}

.pm-bar {
  background: var(--tp-accent-primary-soft);
}

.pm-bar-mid {
  background: var(--tp-accent-primary-border);
}

.pm-bar-hi {
  background: var(--tp-primary);
  box-shadow: var(--tp-shadow-glow);
}

.pm-urgent-badge {
  background: var(--tp-accent-danger-soft);
  color: var(--tp-accent-danger);
}

.pm-vector-rose {
  color: var(--tp-accent-danger);
}

.pm-vector-amber,
.pm-trend-up {
  color: var(--tp-accent-warning);
}

.pm-capacity-card {
  background: var(--tp-accent-primary-soft);
  border-color: var(--tp-accent-primary-border);
}

.pm-avatar-upload {
  border-color: var(--tp-border-strong);
}

.pm-avatar-upload:hover {
  border-color: var(--tp-accent-primary-border);
  background: var(--tp-accent-primary-soft);
}

.pm-avatar-placeholder-icon,
.pm-avatar-placeholder-text,
.pm-avatar-hint {
  color: var(--tp-gray-400);
}

.mb-card {
  background: var(--tp-surface-card);
  border-color: var(--tp-border-subtle);
  border-top-color: var(--tp-accent-primary-border);
}

.mb-card:hover {
  background: var(--tp-surface-hover);
  border-color: var(--tp-border-strong);
  border-top-color: var(--tp-primary);
}

.mb-grid::-webkit-scrollbar-thumb {
  background: var(--tp-gray-300);
}

.mb-role-pill {
  background: var(--tp-accent-primary-soft);
  color: var(--tp-primary);
  border-color: var(--tp-accent-primary-border);
}

.mb-role-pill--protected {
  background: var(--tp-accent-danger-soft);
  color: var(--tp-accent-danger);
  border-color: var(--tp-accent-danger-border);
}

.mb-role-pill--owner {
  background: var(--tp-accent-primary-soft);
  color: var(--tp-primary);
  border-color: var(--tp-accent-primary-border);
}

.mb-card-remove {
  color: var(--tp-gray-500);
}

.mb-card-remove:hover {
  color: var(--tp-accent-danger);
  background: var(--tp-accent-danger-soft);
}

.mb-card-remove--disabled:hover {
  color: var(--tp-gray-400);
}

.pm-title {
  font-size: var(--tp-text-3xl);
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-tight);
}

.pm-subtitle,
.pm-capacity-sub,
.pm-vector-text,
.pm-pagination-info {
  font-size: var(--tp-text-md);
  font-weight: var(--tp-font-regular);
  line-height: var(--tp-line-body);
  color: var(--tp-text-muted);
}

.pm-stat-label,
.pm-th,
.pm-progress-label,
.pm-card-label,
.pm-capacity-label,
.pm-capacity-unit,
.pm-urgent-badge,
.pm-avatar-placeholder-text,
.pm-avatar-hint,
.mb-card-email,
.mb-role-pill {
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-semibold);
  line-height: var(--tp-line-ui);
  text-transform: none;
  letter-spacing: 0;
}

.pm-td,
.pm-owner-name,
.pm-capacity-sub,
.pm-vector-text,
.mb-card-name {
  font-size: var(--tp-text-sm);
  font-weight: var(--tp-font-medium);
  line-height: var(--tp-line-ui);
}

.pm-project-name,
.pm-big-num,
.pm-capacity-num {
  font-weight: var(--tp-font-bold);
}

.pm-add-btn,
.mb-add-btn,
.mb-card-remove {
  font-weight: var(--tp-font-semibold);
}

.pm-pagination {
  min-height: 48px;
  margin-top: 0;
  padding: 10px 16px;
  border-top: 1px solid var(--tp-border-subtle);
  background: linear-gradient(180deg, var(--tp-surface-header), var(--tp-surface-card));
}

.pm-pagination-info {
  color: var(--tp-text-muted);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-medium);
  line-height: var(--tp-line-ui);
}

.pm-pagination :deep(.el-pagination),
.pm-pagination-btns {
  gap: 6px;
}

.pm-pagination :deep(.el-pagination button),
.pm-pagination :deep(.el-pager li),
.pm-page-btn {
  min-width: 32px;
  height: 32px;
  border: 1px solid var(--tp-border-subtle);
  border-radius: 9px;
  background: var(--tp-surface-card);
  color: var(--tp-text-secondary);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-semibold);
  font-variant-numeric: tabular-nums;
}

.pm-pagination :deep(.el-pagination button:hover),
.pm-pagination :deep(.el-pager li:hover),
.pm-page-btn:hover:not(:disabled) {
  border-color: var(--tp-accent-primary-border);
  background: var(--tp-surface-hover);
  color: var(--tp-primary);
}

.pm-pagination :deep(.el-pagination.is-background .el-pager li.is-active),
.pm-page-btn--active {
  background: var(--tp-btn-bg);
  border-color: var(--tp-btn-border);
  color: var(--tp-btn-text);
  box-shadow: var(--tp-btn-shadow);
}

.pm-pagination :deep(.el-pagination__jump),
.pm-pagination :deep(.el-pagination__total) {
  color: var(--tp-text-muted);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-medium);
}

.pm-page-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.pm-page {
  background: var(--tp-surface-base);
}

.pm-stats-panel,
.pm-table-wrap,
.pm-glass-card,
.pm-capacity-card {
  background: var(--tp-surface-card);
  border-color: var(--tp-border-subtle);
  box-shadow: var(--tp-shadow-sm);
  backdrop-filter: none;
}

.pm-row:hover {
  background: var(--tp-surface-row-hover);
  box-shadow: inset 2px 0 0 var(--tp-primary);
}

.pm-pagination {
  background: var(--tp-surface-card);
}

.pm-bar-hi {
  box-shadow: none;
}

.pm-card-top,
.pm-owner-cell,
.pm-actions {
  min-width: 0;
}

.pm-env-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pm-env-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.pm-env-title {
  margin: 0 0 6px;
  color: var(--tp-text-primary);
  font-size: 16px;
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-tight);
  letter-spacing: -0.01em;
}

.pm-env-desc {
  margin: 0;
  color: var(--tp-text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.pm-env-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 14px;
  border: 1px solid rgba(139, 92, 246, 0.18);
  border-radius: var(--tp-btn-radius);
  background: var(--tp-accent-primary-soft);
  color: var(--tp-primary);
  font-size: 13px;
  font-weight: var(--tp-font-semibold);
  cursor: pointer;
  transition: background var(--tp-transition);
}

.pm-env-add:hover {
  background: rgba(139, 92, 246, 0.16);
}

.pm-env-add .material-symbols-outlined {
  font-size: 16px;
}

.pm-env-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pm-env-row {
  display: grid;
  grid-template-columns: 72px minmax(120px, 0.7fr) minmax(220px, 1.1fr) minmax(160px, 0.9fr) 40px;
  gap: 8px;
  align-items: center;
  padding: 12px;
  border: 1px solid rgba(229, 231, 235, 0.7);
  border-radius: var(--tp-radius-lg);
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(17, 24, 39, 0.02);
  transition:
    border-color var(--tp-transition),
    box-shadow var(--tp-transition);
}

.pm-env-row:focus-within,
.pm-env-row:hover {
  border-color: rgba(139, 92, 246, 0.28);
  box-shadow:
    0 6px 14px rgba(17, 24, 39, 0.035),
    0 0 0 3px rgba(139, 92, 246, 0.06);
}

.pm-env-row :deep(.el-input__wrapper) {
  box-shadow: none !important;
  background: var(--tp-surface-input);
  border-radius: 8px;
}

.pm-env-row :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--tp-primary) inset !important;
  background: #ffffff;
}

.pm-env-row :deep(.el-input__inner) {
  font-size: 13px;
}

.pm-env-default {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--tp-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.pm-env-default input[type='radio'] {
  accent-color: var(--tp-primary);
  width: 15px;
  height: 15px;
  cursor: pointer;
}

.pm-env-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--tp-text-muted);
  cursor: pointer;
}

.pm-env-remove:hover {
  background: var(--tp-accent-danger-soft);
  color: var(--tp-accent-danger);
}

.pm-env-remove .material-symbols-outlined {
  font-size: 18px;
}

.pm-env-empty {
  padding: 28px;
  border: 1px dashed var(--tp-border-strong);
  border-radius: var(--tp-radius-lg);
  color: var(--tp-text-muted);
  text-align: center;
}

.pm-page {
  min-height: auto;
  padding: var(--tp-space-2) var(--tp-space-3) var(--tp-space-4);
  background:
    radial-gradient(circle at 8% 88%, var(--tp-ambient-info), transparent 32%),
    radial-gradient(circle at 88% 0%, var(--tp-ambient-primary), transparent 28%),
    var(--tp-surface-base);
}

.pm-header {
  align-items: center;
  gap: var(--tp-space-3);
  margin-bottom: var(--tp-space-2);
}

.pm-title {
  margin-bottom: var(--tp-space-1);
  color: var(--tp-text-primary);
  font-size: var(--tp-text-2xl);
  letter-spacing: -0.03em;
}

.pm-subtitle {
  color: var(--tp-text-muted);
}

.pm-stats-panel {
  gap: var(--tp-space-3);
  padding: var(--tp-space-1) var(--tp-space-2) var(--tp-space-1) var(--tp-space-3);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-xl);
  background: var(--tp-glass-bg-strong);
  box-shadow: var(--tp-shadow-sm);
}

.pm-stat-item {
  min-width: var(--tp-space-12);
  text-align: left;
}

.pm-stat-number {
  color: var(--tp-text-primary);
  font-size: var(--tp-text-xl);
  line-height: var(--tp-line-tight);
}

.pm-add-btn {
  height: var(--tp-btn-height-md);
  padding: 0 var(--tp-space-5);
  margin-left: var(--tp-space-1);
}

.pm-table-wrap {
  overflow: hidden;
  margin-bottom: var(--tp-space-3);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-xl);
  background: var(--tp-glass-bg-strong);
  box-shadow: var(--tp-shadow-card);
}

.pm-table {
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
}

.pm-th {
  padding: var(--tp-space-2) var(--tp-space-3);
  border-bottom: 1px solid var(--tp-border-subtle);
  color: var(--tp-text-subtle);
  font-size: 11px;
}

.pm-th-check {
  width: 46px;
}

.pm-th:nth-child(2) {
  width: 22%;
}

.pm-th:nth-child(3) {
  width: 16%;
}

.pm-th:nth-child(4) {
  width: 26%;
}

.pm-th:nth-child(5) {
  width: 14%;
}

.pm-th:nth-child(6) {
  width: 15%;
}

.pm-row {
  background: rgba(255, 255, 255, 0.7);
}

.pm-row:hover {
  background: var(--tp-surface-row-hover);
  box-shadow: none;
}

.pm-td {
  padding: var(--tp-space-2) var(--tp-space-3);
  border-bottom: 1px solid rgba(229, 231, 235, 0.62);
}

.pm-row:last-child .pm-td {
  border-bottom: 0;
}

.pm-project-icon {
  width: 30px;
  height: 30px;
  border-radius: 11px;
}

.pm-project-name,
.pm-owner-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pm-env-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--tp-space-2);
  width: 156px;
  height: 32px;
  padding: 0 var(--tp-space-2);
  border: 1px solid rgba(196, 181, 253, 0.56);
  border-radius: 10px;
  background: linear-gradient(180deg, var(--tp-surface-card), var(--tp-surface-header));
  color: var(--tp-text-primary);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-medium);
  line-height: var(--tp-line-ui);
  box-shadow:
    0 1px 2px rgba(17, 24, 39, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.78);
  cursor: pointer;
  transition:
    border-color var(--tp-transition),
    background var(--tp-transition),
    box-shadow var(--tp-transition);
}

.pm-env-trigger:hover {
  border-color: var(--tp-accent-primary-border);
  background: var(--tp-surface-hover);
  box-shadow:
    0 4px 10px rgba(139, 92, 246, 0.08),
    0 0 0 3px rgba(139, 92, 246, 0.06);
}

.pm-env-trigger:focus-visible {
  outline: none;
  border-color: var(--tp-primary);
  box-shadow:
    0 0 0 3px var(--tp-accent-primary-soft),
    0 4px 10px rgba(139, 92, 246, 0.1);
}

.pm-env-trigger--empty {
  border-color: var(--tp-border-subtle);
  background: var(--tp-surface-card);
  color: var(--tp-text-muted);
}

.pm-env-trigger--empty:hover {
  border-color: var(--tp-accent-primary-border);
  background: var(--tp-surface-hover);
  color: var(--tp-primary);
}

.pm-env-trigger-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: var(--tp-btn-radius);
  background: var(--tp-primary);
  box-shadow: 0 0 0 3px var(--tp-accent-primary-soft);
}

.pm-env-trigger--empty .pm-env-trigger-dot {
  background: var(--tp-text-disabled);
  box-shadow: none;
}

.pm-env-trigger-label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.pm-env-trigger-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 5px;
  border-radius: var(--tp-btn-radius);
  background: var(--tp-surface-muted);
  color: var(--tp-text-muted);
  font-size: 10px;
  font-weight: var(--tp-font-semibold);
  line-height: 1;
}

.pm-env-chevron {
  flex: 0 0 auto;
  color: var(--tp-text-disabled);
  font-size: 16px;
  transition: color var(--tp-transition);
}

.pm-env-trigger:hover .pm-env-chevron {
  color: var(--tp-text-muted);
}

.pm-env-spin {
  flex: 0 0 auto;
  color: var(--tp-primary);
  font-size: 16px;
  animation: pm-spin 0.9s linear infinite;
}

.pm-env-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.pm-env-menu-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--tp-gray-400);
}

.pm-env-menu-item.is-active .pm-env-menu-dot {
  background: var(--tp-primary);
  box-shadow: 0 0 0 2px var(--tp-accent-primary-soft);
}

.pm-env-menu-copy {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.pm-env-menu-name {
  overflow: hidden;
  color: var(--tp-text-primary);
  font-size: 13px;
  font-weight: var(--tp-font-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pm-env-menu-url {
  overflow: hidden;
  max-width: 200px;
  color: var(--tp-text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pm-env-menu-check {
  flex: 0 0 auto;
  color: var(--tp-primary);
  font-size: 16px;
}

.pm-env-menu-manage {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--tp-text-secondary);
  font-size: 12px;
  font-weight: var(--tp-font-medium);
}

.pm-env-menu-manage .material-symbols-outlined {
  font-size: 15px;
}

:global(.pm-env-dropdown-popper) {
  border: 1px solid var(--tp-border-subtle) !important;
  border-radius: 10px !important;
  background: var(--tp-surface-card) !important;
  box-shadow: var(--tp-shadow-card) !important;
}

:global(.pm-env-dropdown-popper .el-dropdown-menu) {
  padding: 4px !important;
  background: transparent !important;
}

:global(.pm-env-dropdown-popper .el-dropdown-menu__item) {
  min-height: 40px;
  padding: 6px 10px !important;
  border-radius: 6px;
  color: var(--tp-text-primary);
  font-size: 13px;
  line-height: 1.35;
}

:global(.pm-env-dropdown-popper .el-dropdown-menu__item:not(.is-disabled):hover) {
  background: var(--tp-surface-hover) !important;
  color: var(--tp-text-primary) !important;
}

:global(.pm-env-dropdown-popper .el-dropdown-menu__item.is-disabled) {
  background: var(--tp-accent-primary-soft) !important;
  opacity: 1;
  cursor: default;
}

:global(.pm-env-dropdown-popper .el-dropdown-menu__item--divided) {
  min-height: 32px;
  margin-top: 4px !important;
  border-top: 1px solid var(--tp-border-subtle) !important;
}

@keyframes pm-spin {
  to {
    transform: rotate(360deg);
  }
}

.pm-health-badge {
  padding: var(--tp-space-1) var(--tp-space-2);
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-semibold);
}

.pm-progress-cell {
  width: 100%;
  max-width: 132px;
}

.pm-progress-label {
  margin-bottom: 6px;
  color: var(--tp-text-secondary);
  font-variant-numeric: tabular-nums;
}

.pm-progress-track {
  height: 6px;
  background: rgba(139, 92, 246, 0.12);
}

.pm-progress-bar {
  height: 6px;
}

.pm-more-btn {
  width: 34px;
  height: 34px;
  margin-left: auto;
  border: 1px solid transparent;
  border-radius: 11px;
}

.pm-more-btn:hover {
  border-color: var(--tp-accent-primary-border);
}

.pm-pagination {
  padding: var(--tp-space-2) var(--tp-space-3);
  background: rgba(255, 255, 255, 0.72);
}

.pm-bento-grid {
  grid-template-columns: 1fr 1.1fr 0.9fr;
  gap: var(--tp-space-3);
}

.pm-glass-card,
.pm-capacity-card {
  min-height: 118px;
  padding: var(--tp-space-3);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-xl);
  background: var(--tp-glass-bg-strong);
  box-shadow: var(--tp-shadow-sm);
}

.pm-card-top {
  align-items: center;
  margin-bottom: var(--tp-space-2);
}

.pm-card-label {
  color: var(--tp-text-secondary);
  font-size: var(--tp-text-sm);
  font-weight: var(--tp-font-bold);
}

.pm-big-num,
.pm-capacity-num {
  color: var(--tp-text-primary);
  font-size: var(--tp-text-2xl);
  letter-spacing: -0.04em;
}

.pm-mini-bars {
  height: 28px;
  align-items: end;
}

.pm-bar {
  border-radius: 8px 8px 0 0;
}

.pm-vectors-list {
  gap: 9px;
}

.pm-vector-row {
  padding: var(--tp-space-2);
  border: 1px solid rgba(229, 231, 235, 0.72);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.58);
}

.pm-capacity-card {
  overflow: hidden;
  background:
    radial-gradient(circle at 100% 0%, rgba(139, 92, 246, 0.14), transparent 34%),
    var(--tp-glass-bg-strong);
}
</style>
