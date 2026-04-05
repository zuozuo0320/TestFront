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
import { listUsers } from '../../api/user'
import type { Project, ProjectMember, User } from '../../api/types'

const SEED_PROJECT_NAME = 'AiSight Demo'
const PROTECTED_ROLE_KEYS = new Set(['admin', 'manager'])
const PROTECTED_ROLE_LABELS = new Set(['系统管理员', '项目管理员'])

const projects = ref<Project[]>([])
const appLoading = ref(false)
const searchKeyword = ref('')
const statusFilter = ref<'' | 'active' | 'archived'>('')

// ── 分页 & 复选框 ──
const currentPage = ref(1)
const pageSize = 4
const selectedIds = ref<Set<number>>(new Set())

// ── Mock 扩展数据 ──
const mockOwners = [
  { name: '姜大卫' },
  { name: '李莎莎' },
  { name: '张伟' },
  { name: '赵敏' },
  { name: '王芳' },
]
const mockStatuses: Array<{ label: string; color: 'emerald' | 'amber' | 'rose' }> = [
  { label: 'Stable', color: 'emerald' },
  { label: 'Degraded', color: 'amber' },
  { label: 'Failing', color: 'rose' },
  { label: 'Stable', color: 'emerald' },
]
const mockProgress = [92, 45, 12, 100, 78, 33, 67, 55]

function getMockOwner(idx: number) {
  return mockOwners[idx % mockOwners.length]!
}
function getMockStatus(idx: number) {
  return mockStatuses[idx % mockStatuses.length]!
}
function getMockProgress(idx: number) {
  return mockProgress[idx % mockProgress.length]!
}
function getProgressColor(idx: number) {
  const s = getMockStatus(idx)
  if (s.color === 'emerald') return '#34d399'
  if (s.color === 'amber') return '#adc6ff'
  return '#ffb4ab'
}

// ── 项目创建/编辑弹窗 ──
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingProjectId = ref<number | null>(null)
const savingProject = ref(false)
const projectForm = reactive({ name: '', description: '' })
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
const totalPages = computed(() => Math.ceil(totalProjects.value / pageSize) || 1)
const paginatedProjects = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredProjects.value.slice(start, start + pageSize)
})
const paginationLabel = computed(() => {
  const start = (currentPage.value - 1) * pageSize + 1
  const end = Math.min(currentPage.value * pageSize, totalProjects.value)
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
  if (page >= 1 && page <= totalPages.value) currentPage.value = page
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
  const avatarRaw = (avatar || '').trim()
  if (avatarRaw) {
    if (/^https?:\/\//i.test(avatarRaw)) return avatarRaw
    const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
    if (envBase && /^https?:\/\//i.test(envBase)) {
      const origin = envBase.replace(/\/api\/v1\/?$/, '')
      return `${origin}${avatarRaw.startsWith('/') ? '' : '/'}${avatarRaw}`
    }
    return `http://localhost:8080${avatarRaw.startsWith('/') ? '' : '/'}${avatarRaw}`
  }
  const seed = encodeURIComponent((fallbackName || 'AiSight').trim() || 'AiSight')
  return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}`
}

async function loadProjects() {
  appLoading.value = true
  try {
    projects.value = await listProjects()
    await loadAllProjectMembers()
  } finally {
    appLoading.value = false
  }
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

function openCreateProject() {
  dialogMode.value = 'create'
  editingProjectId.value = null
  projectForm.name = ''
  projectForm.description = ''
  avatarFile.value = null
  avatarPreview.value = ''
  dialogVisible.value = true
}
function openEditProject(p: Project) {
  dialogMode.value = 'edit'
  editingProjectId.value = p.id
  projectForm.name = p.name
  projectForm.description = p.description || ''
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
    if (dialogMode.value === 'create') {
      const created = await createProject({
        name,
        description: projectForm.description.trim() || undefined,
      })
      projectId = created.id
      ElMessage.success('项目创建成功')
    } else {
      projectId = editingProjectId.value!
      await updateProject(projectId, {
        name,
        description: projectForm.description.trim() || undefined,
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
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || e?.response?.data?.message || '操作失败')
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
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.error || '归档失败')
  }
}
async function onRestore(p: Project) {
  try {
    await unarchiveProject(p.id)
    ElMessage.success('项目已恢复')
    await loadProjects()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '恢复失败')
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
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.error || '删除失败')
  }
}
async function openMemberDialog(p: Project) {
  memberProject.value = p
  memberSearch.value = ''
  addMemberUserId.value = ''
  memberDialogVisible.value = true
  await loadMembers(p.id)
  if (allUsers.value.length === 0) {
    try {
      allUsers.value = (await listUsers()) as any[]
    } catch {
      /* 非 admin */
    }
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
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '添加成员失败')
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
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.error || '移除失败')
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
        <h2 class="pm-title">活跃项目库</h2>
        <p class="pm-subtitle">管理并监控所有正在进行的自动化测试流</p>
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
            <th class="pm-th">健康状态</th>
            <th class="pm-th">测试进度</th>
            <th class="pm-th pm-th-action">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, idx) in paginatedProjects" :key="p.id" class="pm-row">
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
                <div class="pm-project-icon" :class="`pm-icon-${getMockStatus(idx).color}`">
                  <img
                    v-if="p.avatar"
                    :src="resolveAvatarUrl(p.avatar)"
                    class="pm-project-avatar-img"
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
                <img class="pm-owner-avatar" :src="resolveAvatarUrl('', getMockOwner(idx).name)" />
                <span class="pm-owner-name">{{ getMockOwner(idx).name }}</span>
              </div>
            </td>
            <td class="pm-td">
              <span class="pm-health-badge" :class="`pm-health-${getMockStatus(idx).color}`">
                <span class="pm-health-dot"></span>
                {{ getMockStatus(idx).label }}
              </span>
            </td>
            <td class="pm-td">
              <div class="pm-progress-cell">
                <span class="pm-progress-label">{{ getMockProgress(idx) }}%</span>
                <div class="pm-progress-track">
                  <div
                    class="pm-progress-bar"
                    :style="{
                      width: getMockProgress(idx) + '%',
                      background: getProgressColor(idx),
                    }"
                    :class="{ 'pm-progress-glow': getMockProgress(idx) === 100 }"
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
            <td colspan="6" class="pm-empty-row">暂无匹配的项目</td>
          </tr>
        </tbody>
      </table>
      <div class="pm-pagination">
        <span class="pm-pagination-info">{{ paginationLabel }}</span>
        <div class="pm-pagination-btns">
          <button
            class="pm-page-btn"
            :disabled="currentPage <= 1"
            @click="goToPage(currentPage - 1)"
          >
            <span class="material-symbols-outlined pm-page-icon">chevron_left</span>
          </button>
          <button
            v-for="pg in totalPages"
            :key="pg"
            class="pm-page-btn"
            :class="{ 'pm-page-btn--active': pg === currentPage }"
            @click="goToPage(pg)"
          >
            {{ pg }}
          </button>
          <button
            class="pm-page-btn"
            :disabled="currentPage >= totalPages"
            @click="goToPage(currentPage + 1)"
          >
            <span class="material-symbols-outlined pm-page-icon">chevron_right</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 底部统计 Bento Grid -->
    <div class="pm-bento-grid">
      <div class="pm-glass-card">
        <div class="pm-card-top">
          <h4 class="pm-card-label">COVERAGE PULSE</h4>
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
          <h4 class="pm-card-label">CRITICAL VECTORS</h4>
          <span class="pm-urgent-badge">URGENT</span>
        </div>
        <div class="pm-vectors-list">
          <div class="pm-vector-row">
            <div class="pm-vector-left">
              <span class="material-symbols-outlined pm-vector-icon pm-vector-rose">
                bug_report
              </span>
              <span class="pm-vector-text">API Latency Issues</span>
            </div>
            <span class="pm-vector-count">12 处</span>
          </div>
          <div class="pm-vector-row">
            <div class="pm-vector-left">
              <span class="material-symbols-outlined pm-vector-icon pm-vector-amber">
                sync_problem
              </span>
              <span class="pm-vector-text">Memory Leaks</span>
            </div>
            <span class="pm-vector-count">5 处</span>
          </div>
          <div class="pm-vector-row">
            <div class="pm-vector-left">
              <span class="material-symbols-outlined pm-vector-icon pm-vector-primary">
                history
              </span>
              <span class="pm-vector-text">Regression Risk</span>
            </div>
            <span class="pm-vector-count pm-vector-primary">低</span>
          </div>
        </div>
      </div>
      <div class="pm-capacity-card">
        <div class="pm-capacity-content">
          <h4 class="pm-card-label pm-card-label--purple">COMPUTE CAPACITY</h4>
          <p class="pm-capacity-sub">测试集群当前负载情况</p>
          <div class="pm-capacity-stats">
            <div>
              <p class="pm-capacity-num">64%</p>
              <p class="pm-capacity-label">LOAD</p>
            </div>
            <div class="pm-capacity-divider"></div>
            <div>
              <p class="pm-capacity-num">
                2.4
                <span class="pm-capacity-unit">ms</span>
              </p>
              <p class="pm-capacity-label">PING</p>
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
            <span
              v-for="(roleName, ridx) in getMemberRoleNames(m)"
              :key="`${m.user_id}-${ridx}`"
              class="mb-role-pill"
              :class="{ 'mb-role-pill--protected': isProtectedRoleName(roleName) }"
            >
              {{ roleName }}
            </span>
            <span v-if="getMemberRoleNames(m).length === 0" class="mb-role-pill">成员</span>
          </div>
          <el-tooltip v-if="isProtectedMember(m)" content="管理员角色不可移除" placement="top">
            <button class="mb-card-remove mb-card-remove--disabled" disabled>移除</button>
          </el-tooltip>
          <button v-else class="mb-card-remove" @click="onRemoveMember(m)">移除</button>
        </div>
        <div v-if="filteredMembers.length === 0 && !membersLoading" class="mb-empty">暂无成员</div>
      </div>
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
  border-radius: 10px;
  border: none;
  background: #7c3aed;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.pm-add-btn:hover {
  filter: brightness(1.15);
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
  border: 1.5px solid #4a4455;
  background: #0c0e18;
  cursor: pointer;
  vertical-align: middle;
  position: relative;
  transition: all 0.15s;
}
.pm-checkbox:checked {
  background: #d2bbff;
  border-color: #d2bbff;
}
.pm-checkbox:checked::after {
  content: '✓';
  position: absolute;
  top: -1px;
  left: 2px;
  font-size: 11px;
  color: #11131e;
  font-weight: 700;
}
.pm-checkbox:focus {
  outline: 2px solid rgba(210, 187, 255, 0.3);
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
  background: #7c3aed;
  color: #fff;
  font-weight: 700;
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
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.mb-role-pill--protected {
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.2);
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
</style>
