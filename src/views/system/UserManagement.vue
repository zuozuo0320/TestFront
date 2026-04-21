<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  User as UserIcon,
  UserFilled,
  Filter,
  Download,
  Edit,
  Clock,
  CircleClose,
  CircleCheck,
  Delete,
} from '@element-plus/icons-vue'
import {
  listUsers,
  createUser,
  updateUser,
  deleteUserById,
  resetUserPassword,
  listRoles,
  uploadUserAvatar,
} from '../../api/user'
import { listProjects } from '../../api/project'
import type { User, Role, Project } from '../../api/types'
import { useAuthStore } from '../../stores/auth'

const authStore = useAuthStore()

function onAvatarError(event: Event, name?: string) {
  authStore.handleAvatarError(event, name)
}

/** 用户行类型，扩展了角色/项目关联 ID 和角色名称列表 */
type UserRow = User & { role_ids: number[]; project_ids: number[]; role_names: string[] }

const users = ref<UserRow[]>([])
const roles = ref<Role[]>([])
const projects = ref<Project[]>([])
const usersLoading = ref(false)

// ── 分页 ──
const userPage = ref(1)
const userPageSize = ref(10)

// ── 筛选 ──
const searchKeyword = ref('')

const sysLogs = ref([
  {
    id: 1,
    type: 'danger',
    title: '多地登录尝试拦截',
    desc: '用户 ID #9210 (na.li) 尝试从非法 IP 登录。',
    time: '2023-11-24 14:32:11',
  },
  {
    id: 2,
    type: 'primary',
    title: '角色变更提醒',
    desc: '管理员 伟杰 将用户提升为 [QA 工程师]。',
    time: '2023-11-24 12:05:54',
  },
])
const getMockRelativeTime = (id: number) => (id % 2 === 0 ? '2分钟前' : '3天前')
const getMockIp = (id: number) => (id % 2 === 0 ? '192.168.1.45' : '18.23.4.192')

const filterRoleId = ref<number | ''>('')
const filterStatus = ref<'' | 'active' | 'disabled'>('')

// ── 弹窗 ──
const userDialogVisible = ref(false)
const editingUserId = ref<number | null>(null)
const savingUser = ref(false)
const resetPwdDialogVisible = ref(false)
const resetPwdUserId = ref<number | null>(null)
const resetPwdUserName = ref('')
const resetPwdForm = reactive({ newPassword: '' })
const resettingPwd = ref(false)

const avatarFile = ref<File | null>(null)
const avatarPreview = ref('')
const avatarInputRef = ref<HTMLInputElement | null>(null)

const userForm = reactive({
  name: '',
  email: '',
  phone: '',
  password: '',
  roleIds: [] as number[],
  projectIds: [] as number[],
  active: true,
})

/** 构建角色 ID → 名称的映射表，用于快速查找 */
const roleNameMap = computed(() => {
  const map: Record<number, string> = {}
  roles.value.forEach((r) => {
    map[r.id] = r.display_name || r.name
  })
  return map
})

/** 根据筛选条件过滤用户列表 */
const filteredUsers = computed(() => {
  let list = users.value
  // 关键词搜索（姓名/邮箱）
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    list = list.filter(
      (u) => u.name.toLowerCase().includes(kw) || u.email.toLowerCase().includes(kw),
    )
  }
  // 角色筛选
  if (filterRoleId.value !== null && filterRoleId.value !== '') {
    list = list.filter((u) => u.role_ids.includes(filterRoleId.value as number))
  }
  // 状态筛选
  if (filterStatus.value === 'active') {
    list = list.filter((u) => u.active)
  } else if (filterStatus.value === 'disabled') {
    list = list.filter((u) => !u.active)
  }
  return list
})

/** 当前分页数据 */
const pagedUsers = computed(() => {
  const start = (userPage.value - 1) * userPageSize.value
  return filteredUsers.value.slice(start, start + userPageSize.value)
})

/** 创建时排除 admin 角色（仅编辑时可授予 admin） */
const creatableRoles = computed(() => roles.value.filter((r) => r.name !== 'admin'))

/** 根据头像字段或用户名生成头像 URL（复用 auth store 的离线 SVG fallback） */
function resolveAvatarUrl(avatar?: string, fallbackName?: string) {
  return authStore.resolveAvatarUrl(avatar, fallbackName)
}

/** 加载用户列表，解析后端返回的 role_ids / project_ids，并补充 role_names */
async function loadUsers() {
  usersLoading.value = true
  try {
    const data = await listUsers()
    users.value = (data as any[]).map((u: any) => {
      const roleIds: number[] = u.role_ids ?? []
      const projectIds: number[] = u.project_ids ?? []
      return {
        ...u,
        role_ids: roleIds,
        project_ids: projectIds,
        role_names: roleIds.map((id: number) => roleNameMap.value[id] || `ID:${id}`),
      }
    })
  } finally {
    usersLoading.value = false
  }
}

async function loadRoles() {
  roles.value = await listRoles()
}

async function loadProjects() {
  projects.value = await listProjects()
}

// ── 校验函数 ──

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

/** 密码强度校验：≥8位，含大写+小写+数字 */
function isValidPassword(pwd: string) {
  if (pwd.length < 8) return false
  return /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /[0-9]/.test(pwd)
}

// ── CRUD 操作 ──

/** 打开创建用户弹窗，重置表单 */
function openCreateUser() {
  editingUserId.value = null
  userForm.name = ''
  userForm.email = ''
  userForm.phone = ''
  userForm.password = ''
  userForm.roleIds = []
  userForm.projectIds = []
  userForm.active = true
  avatarFile.value = null
  avatarPreview.value = ''
  userDialogVisible.value = true
}

/** 打开编辑用户弹窗，回填已有数据 */
function openEditUser(u: UserRow) {
  editingUserId.value = u.id
  userForm.name = u.name
  userForm.email = u.email
  userForm.phone = u.phone || ''
  userForm.password = ''
  userForm.roleIds = [...u.role_ids]
  userForm.projectIds = [...u.project_ids]
  userForm.active = u.active
  avatarFile.value = null
  avatarPreview.value = u.avatar ? resolveAvatarUrl(u.avatar) : ''
  userDialogVisible.value = true
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

/** 提交创建/编辑用户表单 */
async function submitUser() {
  const name = userForm.name.trim()
  const email = userForm.email.trim()
  const phone = userForm.phone.trim()

  if (!isValidName(name)) {
    ElMessage.warning('姓名格式不正确（2-40字符，支持中文/英文/数字）')
    return
  }
  if (!editingUserId.value && !isValidEmail(email)) {
    ElMessage.warning('邮箱格式不正确')
    return
  }
  if (!isValidPhone(phone)) {
    ElMessage.warning('手机号需为11位')
    return
  }
  if (userForm.roleIds.length === 0) {
    ElMessage.warning('请选择至少一个角色')
    return
  }
  if (userForm.projectIds.length === 0) {
    ElMessage.warning('请选择至少一个项目')
    return
  }
  // 创建时密码必填
  if (!editingUserId.value) {
    if (!userForm.password) {
      ElMessage.warning('请输入初始密码')
      return
    }
    if (!isValidPassword(userForm.password)) {
      ElMessage.warning('密码需≥8位，且包含大写字母、小写字母和数字')
      return
    }
  }

  savingUser.value = true
  try {
    let newUserId: number | null = null
    if (editingUserId.value) {
      await updateUser(editingUserId.value, {
        name,
        phone: phone || undefined,
        active: userForm.active,
        role_ids: userForm.roleIds,
        project_ids: userForm.projectIds,
      })
      ElMessage.success('用户更新成功')
    } else {
      const defaultRoleName =
        roles.value.find((r) => r.id === userForm.roleIds[0])?.name || 'tester'
      const created = await createUser({
        name,
        email,
        phone: phone || undefined,
        password: userForm.password,
        role: defaultRoleName,
        role_ids: userForm.roleIds,
        project_ids: userForm.projectIds,
      })
      newUserId = (created as any)?.id ?? null
      ElMessage.success('用户创建成功')
    }
    // 上传头像（如果选择了新文件）
    const savedUserId = editingUserId.value ?? newUserId
    if (avatarFile.value && savedUserId) {
      try {
        await uploadUserAvatar(savedUserId, avatarFile.value)
      } catch {
        ElMessage.warning('头像上传失败，用户信息已保存')
      }
    }
    userDialogVisible.value = false
    await loadUsers()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '保存用户失败')
  } finally {
    savingUser.value = false
  }
}

/** 冻结/解冻用户 */
async function toggleFreeze(row: UserRow) {
  const action = row.active ? '冻结' : '解冻'
  try {
    await ElMessageBox.confirm(
      `确认${action}用户【${row.name}】？${row.active ? '冻结后该用户将无法登录。' : ''}`,
      `${action}确认`,
      {
        confirmButtonText: action,
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  try {
    await updateUser(row.id, { active: !row.active })
    ElMessage.success(`用户已${action}`)
    await loadUsers()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || `${action}失败`)
  }
}

/** 删除用户（逻辑删除） */
async function removeUser(row: UserRow) {
  try {
    await ElMessageBox.confirm(`确认删除用户【${row.name}】？删除后不可恢复。`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await deleteUserById(row.id)
    ElMessage.success('用户已删除')
    await loadUsers()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '删除用户失败')
  }
}

/** 打开重置密码弹窗 */
function openResetPwd(u: UserRow) {
  resetPwdUserId.value = u.id
  resetPwdUserName.value = u.name
  resetPwdForm.newPassword = ''
  resetPwdDialogVisible.value = true
}

/** 提交重置密码 */
async function submitResetPwd() {
  if (!isValidPassword(resetPwdForm.newPassword)) {
    ElMessage.warning('密码需≥8位，且包含大写字母、小写字母和数字')
    return
  }
  resettingPwd.value = true
  try {
    await resetUserPassword(resetPwdUserId.value!, resetPwdForm.newPassword)
    ElMessage.success('密码重置成功')
    resetPwdDialogVisible.value = false
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '重置密码失败')
  } finally {
    resettingPwd.value = false
  }
}

/** 判断用户是否拥有 admin 角色（用于禁用删除按钮） */
function isAdmin(u: UserRow) {
  return (
    u.role_names.some((n) => n.toLowerCase() === 'admin' || n === '系统管理员') ||
    u.role === 'admin'
  )
}

function onUserPaginationCurrentChange(current: number) {
  userPage.value = current
}

/* ── Design C: 统计数据计算 ── */

/** 角色主题色映射 */
const ROLE_COLORS: Record<string, string> = {
  admin: '#ef4444',
  manager: '#f59e0b',
  tester: '#3b82f6',
  reviewer: '#22c55e',
  readonly: '#6b7280',
  developer: '#8b5cf6',
}
const DEFAULT_COLOR = '#6366f1'

/** 根据用户的首个角色返回对应的主题色（用于左侧彩色条） */
function getRoleAccentColor(u: UserRow) {
  if (u.role && ROLE_COLORS[u.role.toLowerCase()]) {
    return ROLE_COLORS[u.role.toLowerCase()]
  }
  // 如果没有 role 字段，尝试从 role_ids 找到对应角色名
  for (const rid of u.role_ids) {
    const r = roles.value.find((role) => role.id === rid)
    if (r && ROLE_COLORS[r.name.toLowerCase()]) {
      return ROLE_COLORS[r.name.toLowerCase()]
    }
  }
  return DEFAULT_COLOR
}

/** 活跃用户数 */
const activeUserCount = computed(() => users.value.filter((u) => u.active).length)

/** 角色分布统计 */
const roleDistribution = computed(() => {
  const counts: Record<number, number> = {}
  users.value.forEach((u) => {
    u.role_ids.forEach((rid) => {
      counts[rid] = (counts[rid] || 0) + 1
    })
  })
  const maxCount = Math.max(...Object.values(counts), 1)
  return roles.value.map((r) => ({
    name: r.name,
    displayName: r.display_name || r.name,
    count: counts[r.id] || 0,
    percent: ((counts[r.id] || 0) / maxCount) * 100,
    color: ROLE_COLORS[r.name.toLowerCase()] || DEFAULT_COLOR,
  }))
})

/** 初始化：先加载角色和项目（用于 roleNameMap），再加载用户 */
onMounted(async () => {
  await Promise.all([loadRoles(), loadProjects()])
  await loadUsers()
})
</script>

<template>
  <div v-loading="usersLoading" class="um-root">
    <div class="um-top-header">
      <div class="um-header-left">
        <h2 class="um-title">用户管理</h2>
        <p class="um-subtitle">管理系统用户、角色权限与安全审计状态。</p>
      </div>
      <div class="um-header-right">
        <div class="um-stats-panel">
          <div class="um-stat-item">
            <span class="um-stat-label">总用户</span>
            <span class="um-stat-number um-stat-primary">{{ users.length }}</span>
          </div>
          <div class="um-stat-divider"></div>
          <div class="um-stat-item">
            <span class="um-stat-label">活跃用户</span>
            <span class="um-stat-number um-stat-secondary">{{ activeUserCount }}</span>
          </div>
          <button class="um-add-btn" @click="openCreateUser">
            <span class="um-add-icon">+</span>
            添加用户
          </button>
        </div>
      </div>
    </div>

    <div class="um-dashboard-bento">
      <div class="um-bento-card">
        <div class="um-bento-bg-icon group-hover-icon">
          <el-icon><UserIcon /></el-icon>
        </div>
        <p class="um-bento-label">总用户量</p>
        <div class="um-bento-value-row">
          <h3 class="um-bento-value text-white">{{ users.length.toLocaleString() }}</h3>
          <span class="um-bento-trend success">↑ 12%</span>
        </div>
      </div>
      <div class="um-bento-card">
        <div class="um-bento-bg-icon group-hover-icon">
          <el-icon><UserFilled /></el-icon>
        </div>
        <p class="um-bento-label">活跃用户</p>
        <div class="um-bento-value-row">
          <h3 class="um-bento-value text-secondary">{{ activeUserCount.toLocaleString() }}</h3>
          <span class="um-bento-trend faint">76.6% 转化率</span>
        </div>
      </div>
      <div class="um-bento-card col-span-2 flex-card">
        <div class="um-role-dist-wrapper">
          <p class="um-bento-label mb-md">角色分布</p>
          <div class="um-role-bar">
            <div
              v-for="rd in roleDistribution"
              :key="rd.name"
              class="um-role-segment"
              :style="{ width: rd.percent + '%', background: rd.color }"
            ></div>
          </div>
          <div class="um-role-legends">
            <span v-for="rd in roleDistribution" :key="rd.name" class="um-role-legend">
              <span class="um-legend-dot" :style="{ background: rd.color }"></span>
              {{ rd.displayName }} ({{ Math.round(rd.percent) }}%)
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- User List Panel -->
    <div class="um-list-panel">
      <div class="um-list-header">
        <div class="um-list-h-left">
          <h4 class="um-list-title">所有用户</h4>
          <span class="um-live-badge">实时更新</span>
        </div>
        <div class="um-list-h-right">
          <button class="um-action-btn">
            <el-icon><Filter /></el-icon>
          </button>
          <button class="um-action-btn">
            <el-icon><Download /></el-icon>
          </button>
        </div>
      </div>

      <div class="um-table-wrapper">
        <table class="um-table">
          <thead>
            <tr>
              <th>用户信息</th>
              <th>角色级别</th>
              <th>最后登录</th>
              <th>状态</th>
              <th class="text-right">管理操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in pagedUsers" :key="u.id" class="um-tr">
              <td>
                <div class="um-user-cell">
                  <div class="um-avatar-glass">
                    <img
                      :src="resolveAvatarUrl(u.avatar, u.name)"
                      :alt="u.name"
                      @error="onAvatarError($event, u.name)"
                    />
                  </div>
                  <div class="um-user-text">
                    <p class="um-name">{{ u.name }}</p>
                    <p class="um-email">{{ u.email }}</p>
                  </div>
                </div>
              </td>
              <td>
                <span
                  class="um-role-badge"
                  :style="{
                    color: getRoleAccentColor(u),
                    backgroundColor: `${getRoleAccentColor(u)}1A`,
                    borderColor: `${getRoleAccentColor(u)}33`,
                  }"
                >
                  {{ u.role_names[0] || u.role || '未分配' }}
                </span>
              </td>
              <td>
                <p class="um-time">{{ getMockRelativeTime(u.id) }}</p>
                <p class="um-ip">IP: {{ getMockIp(u.id) }}</p>
              </td>
              <td>
                <div class="um-status-cell">
                  <span class="um-status-dot" :class="u.active ? 'active' : 'disabled'"></span>
                  <span class="um-status-text" :class="u.active ? 'text-success' : 'text-error'">
                    {{ u.active ? '已启用' : '已冻结' }}
                  </span>
                </div>
              </td>
              <td class="text-right">
                <div class="action-group">
                  <button
                    class="action-btn action-edit icon-only"
                    title="编辑"
                    @click="openEditUser(u)"
                  >
                    <el-icon class="btn-icon"><Edit /></el-icon>
                    <span>编辑</span>
                  </button>
                  <button
                    class="action-btn action-clone icon-only"
                    title="重置密码"
                    @click="openResetPwd(u)"
                  >
                    <el-icon class="btn-icon"><Clock /></el-icon>
                    <span>重置密码</span>
                  </button>
                  <button
                    class="action-btn action-clone icon-only"
                    :title="u.active ? '冻结' : '解冻'"
                    :disabled="isAdmin(u)"
                    @click="!isAdmin(u) && toggleFreeze(u)"
                  >
                    <el-icon class="btn-icon">
                      <CircleClose v-if="u.active" />
                      <CircleCheck v-else />
                    </el-icon>
                    <span>{{ u.active ? '冻结' : '解冻' }}</span>
                  </button>
                  <button
                    class="action-btn action-delete icon-only"
                    title="删除"
                    :disabled="isAdmin(u)"
                    @click="!isAdmin(u) && removeUser(u)"
                  >
                    <el-icon class="btn-icon"><Delete /></el-icon>
                    <span>删除</span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!usersLoading && filteredUsers.length === 0" class="um-empty">暂无用户</div>
      </div>

      <div v-if="filteredUsers.length > 0" class="um-pagination" style="justify-content: flex-end">
        <el-pagination
          background
          small
          :current-page="userPage"
          :page-size="userPageSize"
          :total="filteredUsers.length"
          layout="prev, pager, next"
          @current-change="onUserPaginationCurrentChange"
        />
      </div>
    </div>

    <!-- Security Cards -->
    <div class="um-security-section">
      <div class="um-sec-panel sys-logs">
        <div class="um-sec-header">
          <h5 class="um-sec-title">系统安全日志</h5>
          <button class="um-sec-link">查看全部</button>
        </div>
        <div class="um-log-list">
          <div v-for="log in sysLogs" :key="log.id" class="um-log-row group">
            <div class="um-log-dot" :class="log.type"></div>
            <div class="um-log-content">
              <p class="um-log-desc">
                <span class="text-white">{{ log.title }}:</span>
                {{ log.desc }}
              </p>
              <span class="um-log-time">{{ log.time }}</span>
            </div>
            <button class="um-log-link">
              <el-icon><Edit /></el-icon>
            </button>
            <!-- Fake external icon -->
          </div>
        </div>
      </div>

      <div class="um-sec-panel audit-status">
        <el-icon class="um-audit-bg-icon"><Clock /></el-icon>
        <h6 class="um-sec-title white-text mb-md">安全审查状态</h6>
        <div class="um-audit-progress">
          <div class="um-audit-bar-track">
            <div class="um-audit-bar-fill"></div>
          </div>
          <span class="um-audit-pct">92%</span>
        </div>
        <p class="um-audit-desc">
          您的系统安全等级为“优”。当前有 12 个账号未开启多因素认证 (MFA)，建议立即执行审查。
        </p>
        <button class="um-audit-btn">启动全员审查</button>
      </div>
    </div>

    <!-- Dialogs -->
    <el-dialog
      v-model="userDialogVisible"
      :title="editingUserId ? '编辑用户' : '新建用户'"
      width="640px"
      class="um-dialog"
    >
      <el-form label-position="top">
        <el-form-item label="用户头像">
          <div class="um-avatar-upload" @click="triggerAvatarInput">
            <img v-if="avatarPreview" :src="avatarPreview" class="um-avatar-preview" />
            <div v-else class="um-avatar-placeholder">
              <span class="um-avatar-placeholder-icon">+</span>
              <span class="um-avatar-placeholder-text">点击上传</span>
            </div>
            <input
              ref="avatarInputRef"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              style="display: none"
              @change="onAvatarSelected"
            />
          </div>
          <span class="um-avatar-hint">支持 PNG/JPG/GIF/WebP，最大 2MB</span>
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="userForm.name" placeholder="2-40字符" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input
            v-model="userForm.email"
            :disabled="!!editingUserId"
            placeholder="登录邮箱（创建后不可修改）"
          />
        </el-form-item>
        <el-form-item v-if="!editingUserId" label="初始密码">
          <el-input
            v-model="userForm.password"
            type="password"
            show-password
            placeholder="≥8位，含大写+小写+数字"
          />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="userForm.phone" placeholder="选填" />
        </el-form-item>
        <el-form-item label="角色（必选，可多选）">
          <el-select
            v-model="userForm.roleIds"
            multiple
            filterable
            placeholder="请选择角色"
            style="width: 100%"
          >
            <el-option
              v-for="r in editingUserId ? roles : creatableRoles"
              :key="r.id"
              :label="r.display_name || r.name"
              :value="r.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="项目（必选，可多选）">
          <el-select
            v-model="userForm.projectIds"
            multiple
            filterable
            placeholder="请选择项目"
            style="width: 100%"
          >
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

    <el-dialog v-model="resetPwdDialogVisible" title="重置密码" width="440px" class="um-dialog">
      <p style="margin-bottom: 12px; color: rgba(255, 255, 255, 0.6); font-size: 13px">
        为用户【{{ resetPwdUserName }}】设置新密码
      </p>
      <el-form label-position="top">
        <el-form-item label="新密码">
          <el-input
            v-model="resetPwdForm.newPassword"
            type="password"
            show-password
            placeholder="≥8位，含大写+小写+数字"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetPwdDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="resettingPwd" @click="submitResetPwd">
          确认重置
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ── Typography & Variables ── */
.um-root {
  --bg-main: #11131e;
  --bg-card: #191b26;
  --bg-card-high: #272935;
  --text-on-surface: #e1e1f2;
  --text-on-surface-variant: #ccc3d8;
  --text-slate: #94a3b8;
  --primary: #d2bbff;
  --secondary: #adc6ff;
  --tertiary: #ffb784;
  --error: #ffb4ab;
  --success: #10b981;
  --primary-container: #7c3aed;
  --secondary-container: #0566d9;
  --border-light: rgba(74, 68, 85, 0.1);
  --border-lighter: rgba(74, 68, 85, 0.05);

  font-family:
    'Inter',
    system-ui,
    -apple-system,
    sans-serif;
  color: var(--text-on-surface);
  line-height: 1.5;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* Utilities */
.text-white {
  color: #fff;
}
.text-secondary {
  color: var(--secondary);
}
.text-success {
  color: var(--success);
}
.text-error {
  color: var(--error);
}
.mb-md {
  margin-bottom: 16px;
}

/* ── Top Header (与角色管理统一) ── */
.um-top-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
  flex-wrap: wrap;
}
.um-header-left {
  flex: 1;
  min-width: 200px;
}
.um-title {
  font-size: 28px;
  font-weight: 600;
  color: #e1e1f2;
  margin: 0 0 6px 0;
  letter-spacing: -0.5px;
}
.um-subtitle {
  font-size: 14px;
  color: #ccc3d8;
  margin: 0;
  font-weight: 300;
}
.um-header-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

/* Stats panel — glass container (与角色管理统一) */
.um-stats-panel {
  display: flex;
  align-items: center;
  gap: 32px;
  padding: 16px 24px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(74, 68, 85, 0.15);
}
.um-stat-item {
  text-align: center;
}
.um-stat-label {
  display: block;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: #958da1;
  margin-bottom: 4px;
}
.um-stat-number {
  font-size: 24px;
  font-weight: 700;
}
.um-stat-primary {
  color: #d2bbff;
}
.um-stat-secondary {
  color: #adc6ff;
}
.um-stat-divider {
  width: 1px;
  height: 32px;
  background: rgba(74, 68, 85, 0.2);
}

/* Add button — inside the glass panel (与角色管理统一) */
.um-add-btn {
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
.um-add-btn:hover {
  filter: brightness(1.15);
}
.um-add-btn:active {
  transform: scale(0.95);
}
.um-add-icon {
  font-size: 16px;
  font-weight: 700;
}

/* ── Bento Grid ── */
.um-dashboard-bento {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}
.um-bento-card {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 24px;
  position: relative;
  overflow: hidden;
}
.um-bento-card.col-span-2 {
  grid-column: span 2;
}
.um-bento-bg-icon {
  position: absolute;
  top: 16px;
  right: 16px;
  font-size: 60px;
  opacity: 0.1;
  transition: opacity 0.3s;
}
.um-bento-card:hover .um-bento-bg-icon {
  opacity: 0.2;
}
.um-bento-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-on-surface-variant);
  margin: 0 0 8px 0;
}
.um-bento-value-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}
.um-bento-value {
  font-size: 36px;
  font-weight: 600;
  margin: 0;
  line-height: 1;
}
.um-bento-trend {
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 4px;
}
.um-bento-trend.success {
  color: var(--success);
}
.um-bento-trend.faint {
  color: #64748b;
}

.um-role-dist-wrapper {
  flex: 1;
}
.um-role-bar {
  display: flex;
  width: 100%;
  height: 8px;
  border-radius: 99px;
  overflow: hidden;
  background: var(--bg-card-high);
}
.um-role-segment {
  height: 100%;
}
.um-role-legends {
  display: flex;
  gap: 16px;
  margin-top: 16px;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-slate);
}
.um-role-legend {
  display: flex;
  align-items: center;
  gap: 6px;
}
.um-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

/* ── User List Panel ── */
.um-list-panel {
  background: var(--bg-card);
  border-radius: 16px;
  border: 1px solid var(--border-lighter);
  overflow: visible;
}
.um-list-header {
  padding: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-light);
}
.um-list-h-left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.um-list-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}
.um-live-badge {
  background: var(--bg-card-high);
  color: var(--primary);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
}
.um-list-h-right {
  display: flex;
  gap: 8px;
}
.um-action-btn {
  background: var(--bg-card-high);
  border: none;
  padding: 8px;
  border-radius: 8px;
  color: var(--text-slate);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}
.um-action-btn:hover {
  color: #fff;
}

.um-table-wrapper {
  width: 100%;
  overflow-x: auto;
}
.um-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
.um-table th {
  padding: 16px 24px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #64748b;
  border-bottom: 1px solid var(--border-lighter);
}
.um-tr {
  transition: background 0.2s;
}
.um-tr:hover {
  background: rgba(255, 255, 255, 0.02);
}
.um-tr td {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-lighter);
  vertical-align: middle;
}
.um-user-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}
.um-avatar-glass {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
}
.um-avatar-glass img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.um-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-on-surface);
  margin: 0;
}
.um-email {
  font-size: 11px;
  color: #64748b;
  margin: 0;
}

.um-role-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 99px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: -0.02em;
  border: 1px solid transparent;
}

.um-time {
  font-size: 12px;
  color: var(--text-on-surface-variant);
  margin: 0;
}
.um-ip {
  font-size: 10px;
  color: #475569;
  margin: 0;
}

.um-status-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.um-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.um-status-dot.active {
  background: var(--success);
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
}
.um-status-dot.disabled {
  background: var(--error);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
}
.um-status-text {
  font-size: 12px;
  font-weight: 500;
}

/* 操作按钮使用全局 .action-btn 样式 */
.um-tr .action-group {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 2px;
}

.um-empty {
  text-align: center;
  padding: 48px;
  color: #64748b;
  font-size: 14px;
}

.um-pagination {
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #64748b;
  border-top: 1px solid var(--border-lighter);
}
.um-pagination :deep(.el-pagination) {
  --el-pagination-bg-color: transparent;
  --el-pagination-button-disabled-bg-color: transparent;
  --el-pagination-hover-color: #fff;
}
.um-pagination :deep(.btn-prev),
.um-pagination :deep(.btn-next) {
  color: #64748b;
}
.um-pagination :deep(.el-pager li) {
  background: transparent;
  color: #64748b;
  border-radius: 4px;
}
.um-pagination :deep(.el-pager li.is-active) {
  background: var(--primary-container) !important;
  color: #fff;
}
.um-pagination :deep(.el-pager li:hover) {
  background: var(--bg-card-high);
}

/* ── Security Cards ── */
.um-security-section {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 32px;
}
.um-sec-panel {
  background: var(--bg-card);
  border-radius: 16px;
  padding: 24px;
}
.um-sec-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.um-sec-title {
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0;
}
.um-sec-title.white-text {
  color: #fff;
}
.um-sec-link {
  background: none;
  border: none;
  font-size: 10px;
  font-weight: 700;
  color: var(--primary);
  text-transform: uppercase;
  cursor: pointer;
}
.um-sec-link:hover {
  text-decoration: underline;
}

.um-log-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.um-log-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 12px;
  border-radius: 8px;
  transition: background 0.2s;
}
.um-log-row:hover {
  background: rgba(255, 255, 255, 0.03);
}
.um-log-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 4px;
}
.um-log-dot.danger {
  background: var(--error);
}
.um-log-dot.primary {
  background: var(--secondary);
}

.um-log-content {
  flex: 1;
}
.um-log-desc {
  font-size: 12px;
  color: var(--text-on-surface);
  margin: 0 0 4px 0;
}
.um-log-time {
  font-size: 10px;
  font-weight: 600;
  color: #475569;
}
.um-log-link {
  background: none;
  border: none;
  color: #334155;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}
.um-log-row:hover .um-log-link {
  opacity: 1;
}

.audit-status {
  background: linear-gradient(to bottom right, rgba(124, 58, 237, 0.2), rgba(5, 102, 217, 0.2));
  border: 1px solid rgba(210, 187, 255, 0.1);
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.um-audit-bg-icon {
  position: absolute;
  right: -16px;
  bottom: -16px;
  font-size: 120px;
  opacity: 0.1;
}
.um-audit-progress {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
.um-audit-bar-track {
  flex: 1;
  height: 4px;
  background: var(--bg-card-high);
  border-radius: 99px;
  overflow: hidden;
}
.um-audit-bar-fill {
  width: 92%;
  height: 100%;
  background: var(--primary);
}
.um-audit-pct {
  font-size: 12px;
  font-weight: 700;
  color: var(--primary);
}
.um-audit-desc {
  font-size: 11px;
  color: var(--text-slate);
  line-height: 1.6;
  margin-bottom: 24px;
  position: relative;
  z-index: 1;
}
.um-audit-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 8px;
  width: 100%;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: background 0.2s;
  position: relative;
  z-index: 1;
}
.um-audit-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* Modals */
.um-dialog :deep(.el-dialog) {
  background: #1e1e2d;
  border-radius: 12px;
}
.um-dialog :deep(.el-dialog__title) {
  color: #fff;
}

/* Avatar Upload */
.um-avatar-upload {
  width: 80px;
  height: 80px;
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  border: 2px dashed rgba(124, 58, 237, 0.3);
  transition: all 0.25s ease;
  position: relative;
}
.um-avatar-upload:hover {
  border-color: rgba(124, 58, 237, 0.7);
  box-shadow: 0 0 16px rgba(124, 58, 237, 0.15);
}
.um-avatar-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.um-avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(124, 58, 237, 0.08);
}
.um-avatar-placeholder-icon {
  font-size: 24px;
  font-weight: 300;
  color: rgba(210, 187, 255, 0.6);
  line-height: 1;
}
.um-avatar-placeholder-text {
  font-size: 10px;
  color: rgba(210, 187, 255, 0.5);
  margin-top: 4px;
}
.um-avatar-hint {
  font-size: 11px;
  color: #64748b;
  margin-top: 6px;
  display: block;
}
</style>
