<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Edit, Delete, FolderChecked, Refresh, Search, User as UserIcon } from '@element-plus/icons-vue'
import {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  archiveProject,
  unarchiveProject,
} from '../../api/project'
import { listMembers, addMember, removeMember } from '../../api/projectMember'
import { listUsers } from '../../api/user'
import type { Project, ProjectMember, User } from '../../api/types'

const SEED_PROJECT_NAME = 'AiSight Demo'

/** admin / manager 角色为受保护成员，不可被移除 */
const PROTECTED_ROLE_KEYS = new Set(['admin', 'manager'])
const PROTECTED_ROLE_LABELS = new Set(['系统管理员', '项目管理员'])

const projects = ref<Project[]>([])
const appLoading = ref(false)
const searchKeyword = ref('')
const statusFilter = ref<'' | 'active' | 'archived'>('')

// ── 项目创建/编辑弹窗 ──
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingProjectId = ref<number | null>(null)
const savingProject = ref(false)
const projectForm = reactive({ name: '', description: '' })

// ── 成员管理弹窗 ──
const memberDialogVisible = ref(false)
const memberProject = ref<Project | null>(null)
const members = ref<ProjectMember[]>([])
const membersLoading = ref(false)
const memberSearch = ref('')
const allUsers = ref<User[]>([])
const addMemberUserId = ref<number | ''>('')
const addingMember = ref(false)

/** 过滤并排序项目列表：活跃优先，按创建时间降序 */
const filteredProjects = computed(() => {
  let list = projects.value
  if (statusFilter.value) {
    list = list.filter((p) => p.status === statusFilter.value)
  }
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    list = list.filter((p) => p.name.toLowerCase().includes(kw))
  }
  return [...list].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  })
})

/** 成员搜索过滤 */
const filteredMembers = computed(() => {
  if (!memberSearch.value.trim()) return members.value
  const kw = memberSearch.value.trim().toLowerCase()
  return members.value.filter(
    (m) =>
      m.user?.name?.toLowerCase().includes(kw) ||
      m.user?.email?.toLowerCase().includes(kw),
  )
})

/** 可添加的用户列表（排除已是成员的用户） */
const availableUsers = computed(() => {
  const memberUserIds = new Set(members.value.map((m) => m.user_id))
  return allUsers.value.filter((u) => !memberUserIds.has(u.id) && u.active)
})

function isSeedProject(p: Project) {
  return p.name === SEED_PROJECT_NAME
}

/** 判断单个角色标签是否属于受保护角色。 */
function isProtectedRoleName(roleName: string) {
  const normalized = roleName.trim()
  return PROTECTED_ROLE_KEYS.has(normalized.toLowerCase()) || PROTECTED_ROLE_LABELS.has(normalized)
}

/** 获取成员可展示的角色标签，优先使用后端返回的多角色显示名。 */
function getMemberRoleNames(m: ProjectMember) {
  const roleNames = (m.user?.role_names ?? []).filter((name) => !!name?.trim())
  if (roleNames.length > 0) return roleNames
  return m.user?.role ? [m.user.role] : []
}

/** 判断成员是否为受保护成员（拥有 admin/manager 全局角色）。 */
function isProtectedMember(m: ProjectMember) {
  return getMemberRoleNames(m).some((roleName) => isProtectedRoleName(roleName))
}

/** 根据头像字段或用户名生成头像 URL。 */
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
  } finally {
    appLoading.value = false
  }
}

// ── 项目 CRUD ──

/** 打开创建项目弹窗 */
function openCreateProject() {
  dialogMode.value = 'create'
  editingProjectId.value = null
  projectForm.name = ''
  projectForm.description = ''
  dialogVisible.value = true
}

/** 打开编辑项目弹窗 */
function openEditProject(p: Project) {
  dialogMode.value = 'edit'
  editingProjectId.value = p.id
  projectForm.name = p.name
  projectForm.description = p.description || ''
  dialogVisible.value = true
}

/** 提交创建/编辑项目 */
async function submitProject() {
  const name = projectForm.name.trim()
  if (!name) {
    ElMessage.warning('项目名称不能为空')
    return
  }
  savingProject.value = true
  try {
    if (dialogMode.value === 'create') {
      await createProject({
        name,
        description: projectForm.description.trim() || undefined,
      })
      ElMessage.success('项目创建成功')
    } else {
      await updateProject(editingProjectId.value!, {
        name,
        description: projectForm.description.trim() || undefined,
      })
      ElMessage.success('项目更新成功')
    }
    dialogVisible.value = false
    await loadProjects()
  } catch (e: any) {
    const msg = e?.response?.data?.error || e?.response?.data?.message || '操作失败'
    ElMessage.error(msg)
  } finally {
    savingProject.value = false
  }
}

/** 归档项目 */
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
    if (e !== 'cancel') {
      ElMessage.error(e?.response?.data?.error || '归档失败')
    }
  }
}

/** 恢复已归档项目 */
async function onRestore(p: Project) {
  try {
    await unarchiveProject(p.id)
    ElMessage.success('项目已恢复')
    await loadProjects()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '恢复失败')
  }
}

/** 删除项目（须已归档+无数据+非种子） */
async function onDelete(p: Project) {
  try {
    await ElMessageBox.confirm(
      `确定要删除项目「${p.name}」吗？此操作不可恢复。`,
      '删除确认',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'error' },
    )
    await deleteProject(p.id)
    ElMessage.success('项目已删除')
    await loadProjects()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e?.response?.data?.error || '删除失败')
    }
  }
}

// ── 成员管理 ──

/** 打开成员管理弹窗并加载数据 */
async function openMemberDialog(p: Project) {
  memberProject.value = p
  memberSearch.value = ''
  addMemberUserId.value = ''
  memberDialogVisible.value = true
  await loadMembers(p.id)
  // 首次打开时加载全部用户列表（用于添加成员选择器）
  if (allUsers.value.length === 0) {
    try {
      allUsers.value = await listUsers() as any[]
    } catch {
      // 非 admin 可能无权限，忽略
    }
  }
}

/** 加载项目成员列表 */
async function loadMembers(projectId: number) {
  membersLoading.value = true
  try {
    members.value = await listMembers(projectId)
  } finally {
    membersLoading.value = false
  }
}

/** 添加成员到项目 */
async function onAddMember() {
  if (!addMemberUserId.value || !memberProject.value) return
  addingMember.value = true
  try {
    await addMember(memberProject.value.id, addMemberUserId.value as number)
    ElMessage.success('成员添加成功')
    addMemberUserId.value = ''
    await loadMembers(memberProject.value.id)
    await loadProjects() // 刷新成员数
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '添加成员失败')
  } finally {
    addingMember.value = false
  }
}

/** 移除项目成员 */
async function onRemoveMember(m: ProjectMember) {
  if (!memberProject.value) return
  try {
    await ElMessageBox.confirm(
      `确认将【${m.user?.name || '用户'}】从项目中移除？`,
      '移除确认',
      { confirmButtonText: '移除', cancelButtonText: '取消', type: 'warning' },
    )
    await removeMember(memberProject.value.id, m.user_id)
    ElMessage.success('成员已移除')
    await loadMembers(memberProject.value.id)
    await loadProjects() // 刷新成员数
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e?.response?.data?.error || '移除失败')
    }
  }
}

/** 格式化时间，成员加入时间展示到分钟。 */
function formatDate(dateStr?: string) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(() => loadProjects())
</script>

<template>
  <div class="module-card" v-loading="appLoading">
    <!-- 工具栏 -->
    <div class="module-toolbar">
      <h3>项目管理</h3>
      <div class="toolbar-right">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索项目名称"
          clearable
          :prefix-icon="Search"
          style="width: 220px"
        />
        <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 130px">
          <el-option label="活跃" value="active" />
          <el-option label="已归档" value="archived" />
        </el-select>
        <el-button type="primary" @click="openCreateProject">新建项目</el-button>
      </div>
    </div>

    <!-- 项目表格 -->
    <el-table :data="filteredProjects" stripe style="width: 100%" empty-text="暂无项目">
      <el-table-column prop="name" label="项目名称" min-width="180">
        <template #default="{ row }">
          <div class="project-name-cell">
            <span>{{ row.name }}</span>
            <el-tag v-if="isSeedProject(row)" size="small" type="warning" effect="plain" class="seed-tag">种子</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="项目描述" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ row.description || '-' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small" effect="dark">
            {{ row.status === 'active' ? '活跃' : '已归档' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="成员" width="80" align="center">
        <template #default="{ row }">{{ row.member_count ?? 0 }}</template>
      </el-table-column>
      <el-table-column label="用例" width="80" align="center">
        <template #default="{ row }">{{ row.testcase_count ?? 0 }}</template>
      </el-table-column>
      <el-table-column label="创建时间" width="120" align="center">
        <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="260" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link :icon="Edit" @click="openEditProject(row)">编辑</el-button>
          <el-button link :icon="UserIcon" @click="openMemberDialog(row)">成员</el-button>
          <el-button
            v-if="row.status === 'active'"
            link
            :icon="FolderChecked"
            :disabled="isSeedProject(row)"
            @click="onArchive(row)"
          >归档</el-button>
          <el-button
            v-else
            link
            :icon="Refresh"
            @click="onRestore(row)"
          >恢复</el-button>
          <el-button
            link
            :icon="Delete"
            type="danger"
            :disabled="isSeedProject(row) || row.status === 'active'"
            @click="onDelete(row)"
          >删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建/编辑项目弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新建项目' : '编辑项目'"
      width="520px"
    >
      <el-form label-position="top">
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
      :title="`成员管理 — ${memberProject?.name || ''}`"
      width="680px"
    >
      <!-- 添加成员 -->
      <div class="member-add-bar">
        <el-select
          v-model="addMemberUserId"
          filterable
          placeholder="选择用户添加到项目"
          style="flex: 1"
          :disabled="availableUsers.length === 0"
        >
          <el-option
            v-for="u in availableUsers"
            :key="u.id"
            :label="`${u.name} (${u.email})`"
            :value="u.id"
          />
        </el-select>
        <el-button
          type="primary"
          :loading="addingMember"
          :disabled="!addMemberUserId"
          @click="onAddMember"
        >
          添加
        </el-button>
      </div>

      <!-- 成员搜索 -->
      <el-input
        v-model="memberSearch"
        placeholder="搜索成员姓名 / 邮箱"
        clearable
        :prefix-icon="Search"
        style="margin-bottom: 12px"
      />

      <!-- 成员列表 -->
      <el-table :data="filteredMembers" stripe v-loading="membersLoading" empty-text="暂无成员" max-height="400">
        <el-table-column label="成员" min-width="240">
          <template #default="{ row }">
            <div class="member-cell">
              <img
                class="member-avatar"
                :src="resolveAvatarUrl(row.user?.avatar, row.user?.name)"
                alt="avatar"
                @error="(e: any) => { e.target.src = resolveAvatarUrl('', row.user?.name) }"
              />
              <div class="member-meta">
                <span class="member-name">{{ row.user?.name || '-' }}</span>
                <span class="member-email">{{ row.user?.email || '' }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="角色标签" min-width="220" align="center">
          <template #default="{ row }">
            <div class="member-role-tags">
              <el-tag
                v-for="(roleName, idx) in getMemberRoleNames(row)"
                :key="`${row.user_id}-${idx}`"
                size="small"
                :type="isProtectedRoleName(roleName) ? 'danger' : 'info'"
                effect="plain"
              >
                {{ roleName }}
              </el-tag>
              <span v-if="getMemberRoleNames(row).length === 0">-</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="加入时间" width="120" align="center">
          <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center">
          <template #default="{ row }">
            <el-tooltip
              v-if="isProtectedMember(row)"
              content="admin/manager 角色成员不可移除"
              placement="top"
            >
              <el-button link size="small" type="danger" disabled>移除</el-button>
            </el-tooltip>
            <el-button
              v-else
              link
              size="small"
              type="danger"
              @click="onRemoveMember(row)"
            >
              移除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<style scoped>
.module-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.project-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.seed-tag {
  flex-shrink: 0;
}
.member-add-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.member-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.member-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.06);
}
.member-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.member-name {
  font-weight: 500;
  font-size: 13px;
}
.member-email {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}
.member-role-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
</style>
