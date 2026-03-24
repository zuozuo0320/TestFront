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

// ── 卡片成员头像堆叠 ──
const projectMembers = ref<Record<number, ProjectMember[]>>({})

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
    (m) => m.user?.name?.toLowerCase().includes(kw) || m.user?.email?.toLowerCase().includes(kw),
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
    // 加载所有项目的成员（用于卡片头像展示）
    await loadAllProjectMembers()
  } finally {
    appLoading.value = false
  }
}

/** 批量加载所有项目的成员列表（用于卡片头像展示） */
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

/** 获取项目卡片展示的成员（最多4个） */
function getCardMembers(projectId: number) {
  const all = projectMembers.value[projectId] || []
  return { visible: all.slice(0, 4), overflow: Math.max(0, all.length - 4) }
}

// ── 项目 CRUD ──

/** 打开创建项目弹窗 */
function openCreateProject() {
  dialogMode.value = 'create'
  editingProjectId.value = null
  projectForm.name = ''
  projectForm.description = ''
  avatarFile.value = null
  avatarPreview.value = ''
  dialogVisible.value = true
}

/** 打开编辑项目弹窗 */
function openEditProject(p: Project) {
  dialogMode.value = 'edit'
  editingProjectId.value = p.id
  projectForm.name = p.name
  projectForm.description = p.description || ''
  avatarFile.value = null
  avatarPreview.value = p.avatar ? resolveAvatarUrl(p.avatar) : ''
  dialogVisible.value = true
}

/** 触发头像文件选择 */
function triggerAvatarInput() {
  avatarInputRef.value?.click()
}

/** 处理头像文件选择 */
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

/** 提交创建/编辑项目 */
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
    // 如果选择了新头像，上传
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
    await ElMessageBox.confirm(`确定要删除项目「${p.name}」吗？此操作不可恢复。`, '删除确认', {
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'error',
    })
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
      allUsers.value = (await listUsers()) as any[]
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
    await ElMessageBox.confirm(`确认将【${m.user?.name || '用户'}】从项目中移除？`, '移除确认', {
      confirmButtonText: '移除',
      cancelButtonText: '取消',
      type: 'warning',
    })
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

/** 根据项目名称生成一致的品牌色（HSL 色轮均匀分布） */
function getProjectColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 45%)`
}

/** 卡片下拉菜单操作路由 */
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
</script>

<template>
  <div v-loading="appLoading" class="pm-page">
    <!-- 工具栏 -->
    <div class="pm-toolbar">
      <h2 class="pm-title">项目管理</h2>
      <div class="pm-toolbar-right">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索项目名称"
          clearable
          :prefix-icon="Search"
          class="pm-search"
        />
        <el-select v-model="statusFilter" placeholder="全部状态" clearable class="pm-filter">
          <el-option label="活跃" value="active" />
          <el-option label="已归档" value="archived" />
        </el-select>
        <button class="pm-btn-create" @click="openCreateProject">
          <span class="pm-btn-plus">+</span>
          新建项目
        </button>
      </div>
    </div>

    <!-- 项目卡片网格 -->
    <div class="pm-grid">
      <div
        v-for="p in filteredProjects"
        :key="p.id"
        class="pm-card"
        :class="{ 'pm-card--archived': p.status !== 'active' }"
      >
        <!-- 卡片头部：图标 + 名称 + 操作 -->
        <div class="pm-card-header">
          <div v-if="p.avatar" class="pm-card-icon pm-card-icon--img">
            <img :src="resolveAvatarUrl(p.avatar)" class="pm-card-icon-img" />
          </div>
          <div v-else class="pm-card-icon" :style="{ background: getProjectColor(p.name) }">
            {{ p.name.charAt(0).toUpperCase() }}
          </div>
          <div class="pm-card-title-area">
            <div class="pm-card-name">
              {{ p.name }}
              <el-tag
                v-if="isSeedProject(p)"
                size="small"
                type="warning"
                effect="plain"
                class="pm-seed-tag"
              >
                种子
              </el-tag>
            </div>
            <span class="pm-card-date">{{ formatDate(p.created_at) }}</span>
          </div>
          <el-dropdown trigger="click" @command="(cmd: string) => onCardAction(cmd, p)">
            <button class="pm-card-menu">⋯</button>
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
        </div>

        <!-- 描述 -->
        <p class="pm-card-desc">{{ p.description || '暂无描述' }}</p>

        <!-- 底部：状态 + 成员头像 + 统计 -->
        <div class="pm-card-footer">
          <span
            class="pm-status"
            :class="p.status === 'active' ? 'pm-status--active' : 'pm-status--archived'"
          >
            <span class="pm-status-dot"></span>
            {{ p.status === 'active' ? '活跃' : '已归档' }}
          </span>
          <div class="pm-card-right">
            <div v-if="getCardMembers(p.id).visible.length > 0" class="pm-avatar-stack">
              <img
                v-for="(m, idx) in getCardMembers(p.id).visible"
                :key="m.user_id"
                class="pm-avatar-item"
                :style="{ zIndex: 10 - idx }"
                :src="resolveAvatarUrl(m.user?.avatar, m.user?.name)"
                :title="m.user?.name || ''"
                @error="
                  (e: any) => {
                    e.target.src = resolveAvatarUrl('', m.user?.name)
                  }
                "
              />
              <span v-if="getCardMembers(p.id).overflow > 0" class="pm-avatar-overflow">
                +{{ getCardMembers(p.id).overflow }}
              </span>
            </div>
            <span class="pm-stat" title="用例数">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              {{ p.testcase_count ?? 0 }}
            </span>
          </div>
        </div>
      </div>

      <!-- 空态 -->
      <div v-if="filteredProjects.length === 0" class="pm-empty">
        <p>暂无项目</p>
        <button class="pm-btn-create" @click="openCreateProject">
          <span class="pm-btn-plus">+</span>
          创建第一个项目
        </button>
      </div>
    </div>

    <!-- 创建/编辑项目弹窗 -->
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
      <!-- 搜索 + 添加成员栏 -->
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

      <!-- 成员网格 -->
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
              v-for="(roleName, idx) in getMemberRoleNames(m)"
              :key="`${m.user_id}-${idx}`"
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
/* ══════════ 页面 ══════════ */
.pm-page {
  padding: 28px 32px;
}

/* ── 工具栏 ── */
.pm-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.pm-title {
  font-size: 22px;
  font-weight: 700;
  color: #f0f0f5;
  margin: 0;
  letter-spacing: 0.3px;
}
.pm-toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pm-search {
  width: 220px;
}
.pm-filter {
  width: 130px;
}
:deep(.pm-search .el-input__wrapper),
:deep(.pm-filter .el-input__wrapper) {
  border-radius: 8px;
}
:deep(.pm-filter .el-select__wrapper) {
  border-radius: 8px;
}
.pm-btn-create {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 20px;
  background: linear-gradient(135deg, #7c3aed, #6d28d9);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.pm-btn-create:hover {
  background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  box-shadow: 0 4px 20px rgba(124, 58, 237, 0.35);
  transform: translateY(-1px);
}
.pm-btn-plus {
  font-size: 16px;
  font-weight: 300;
  line-height: 1;
}

/* ══════════ 卡片网格 ══════════ */
.pm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}

.pm-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  transition: all 0.25s ease;
  cursor: default;
}
.pm-card:hover {
  border-color: rgba(124, 58, 237, 0.3);
  background: rgba(255, 255, 255, 0.045);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
  transform: translateY(-2px);
}
.pm-card--archived {
  opacity: 0.55;
}
.pm-card--archived:hover {
  opacity: 0.75;
}

/* ── 卡片头部 ── */
.pm-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.pm-card-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}
.pm-card-icon--img {
  overflow: hidden;
  padding: 0;
}
.pm-card-icon-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ── 头像上传组件 ── */
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
.pm-card-title-area {
  flex: 1;
  min-width: 0;
}
.pm-card-name {
  font-size: 15px;
  font-weight: 700;
  color: #f0f0f5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 8px;
}
.pm-seed-tag {
  flex-shrink: 0;
  font-size: 10px;
}
.pm-card-date {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 2px;
  display: block;
}
.pm-card-menu {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.35);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
  letter-spacing: 2px;
}
.pm-card-menu:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
}

/* ── 描述 ── */
.pm-card-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.5;
  margin: 0 0 16px 0;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── 底部状态与统计 ── */
.pm-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}
.pm-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 20px;
}
.pm-status--active {
  color: #34d399;
  background: rgba(52, 211, 153, 0.1);
}
.pm-status--archived {
  color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.04);
}
.pm-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.pm-stats {
  display: flex;
  align-items: center;
  gap: 14px;
}
.pm-card-right {
  display: flex;
  align-items: center;
  gap: 14px;
}
.pm-stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}
.pm-stat svg {
  opacity: 0.5;
}

/* ── 头像堆叠 ── */
.pm-avatar-stack {
  display: flex;
  align-items: center;
}
.pm-avatar-item {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #0d1117;
  margin-left: -8px;
  position: relative;
  background: rgba(255, 255, 255, 0.08);
  transition: transform 0.15s;
}
.pm-avatar-item:first-child {
  margin-left: 0;
}
.pm-avatar-item:hover {
  transform: scale(1.15);
  z-index: 20 !important;
}
.pm-avatar-overflow {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(124, 58, 237, 0.25);
  border: 2px solid #0d1117;
  margin-left: -8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: #a78bfa;
  position: relative;
}

/* ── 空态 ── */
.pm-empty {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: rgba(255, 255, 255, 0.3);
  gap: 16px;
}
.pm-empty p {
  font-size: 15px;
  margin: 0;
}

/* ══════════ 成员弹窗 ══════════ */
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

/* ── 成员网格 4列 ── */
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
  box-shadow: 0 0 24px rgba(124, 58, 237, 0.12);
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
