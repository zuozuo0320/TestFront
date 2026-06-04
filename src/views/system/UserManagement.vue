<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Search, Edit, Clock } from '@element-plus/icons-vue'
import { Users, UserCheck, Pencil, KeyRound, Ban, Trash2, Camera } from 'lucide-vue-next'
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
type UserListItem = User & { role_ids?: number[]; project_ids?: number[] }
type ApiError = { response?: { data?: { error?: string; message?: string } } }

const users = ref<UserRow[]>([])
const roles = ref<Role[]>([])
const projects = ref<Project[]>([])
const usersLoading = ref(false)

// ── 分页 ──
const userPage = ref(1)
const userPageSize = ref(10)
const userPageSizeOptions = [10, 20, 50]

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
const userPaginationStart = computed(() =>
  filteredUsers.value.length === 0 ? 0 : (userPage.value - 1) * userPageSize.value + 1,
)
const userPaginationEnd = computed(() =>
  Math.min(userPage.value * userPageSize.value, filteredUsers.value.length),
)

/** 创建时排除 admin 角色（仅编辑时可授予 admin） */
const creatableRoles = computed(() => roles.value.filter((r) => r.name !== 'admin'))

/** 根据头像字段或用户名生成头像 URL（复用 auth store 的离线 SVG fallback） */
function resolveAvatarUrl(avatar?: string, fallbackName?: string) {
  return authStore.resolveAvatarUrl(avatar, fallbackName)
}

function getApiErrorMessage(error: unknown, fallback: string) {
  const data = (error as ApiError).response?.data
  return data?.error || data?.message || fallback
}

/** 加载用户列表，解析后端返回的 role_ids / project_ids，并补充 role_names */
async function loadUsers() {
  usersLoading.value = true
  try {
    const data = await listUsers()
    users.value = (data as UserListItem[]).map((u) => {
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
      newUserId = created.id
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
  } catch (e: unknown) {
    ElMessage.error(getApiErrorMessage(e, '保存用户失败'))
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
  } catch (e: unknown) {
    ElMessage.error(getApiErrorMessage(e, `${action}失败`))
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
  } catch (e: unknown) {
    ElMessage.error(getApiErrorMessage(e, '删除用户失败'))
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
  } catch (e: unknown) {
    ElMessage.error(getApiErrorMessage(e, '重置密码失败'))
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
function onUserPaginationSizeChange(size: number) {
  userPageSize.value = size
  userPage.value = 1
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
  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0) || 1
  return roles.value.map((r) => ({
    name: r.name,
    displayName: r.display_name || r.name,
    count: counts[r.id] || 0,
    percent: ((counts[r.id] || 0) / totalCount) * 100,
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
    <div class="um-dashboard-bento">
      <!-- Card 1: 总用户量 -->
      <div class="insight-card">
        <div class="insight-left">
          <div class="insight-icon-wrap icon-purple">
            <Users :size="18" />
          </div>
          <div class="insight-trend trend-green">较上周 ↑12%</div>
        </div>
        <div class="insight-right">
          <div class="insight-label">总用户量</div>
          <div class="insight-value">{{ users.length }}</div>
          <div class="insight-chart">
            <div class="bar" style="height: 40%; background: var(--tp-accent-primary-soft)"></div>
            <div class="bar" style="height: 70%; background: var(--tp-accent-primary-border)"></div>
            <div class="bar" style="height: 90%; background: var(--tp-primary)"></div>
          </div>
        </div>
      </div>

      <!-- Card 2: 活跃用户 -->
      <div class="insight-card">
        <div class="insight-left">
          <div class="insight-icon-wrap icon-blue">
            <UserCheck :size="18" />
          </div>
          <div class="insight-trend trend-green">76.6% 活跃</div>
        </div>
        <div class="insight-right">
          <div class="insight-label">活跃用户</div>
          <div class="insight-value">{{ activeUserCount }}</div>
          <div class="insight-chart">
            <div class="bar" style="height: 30%; background: var(--tp-accent-info-soft)"></div>
            <div class="bar" style="height: 50%; background: var(--tp-accent-info-border)"></div>
            <div class="bar" style="height: 80%; background: var(--tp-accent-info)"></div>
          </div>
        </div>
      </div>

      <!-- Card 3: 角色分布 -->
      <div class="role-dist-card">
        <div class="role-dist-title">角色分布</div>
        <div class="role-dist-bar">
          <div
            v-for="rd in roleDistribution"
            :key="rd.name"
            class="role-dist-segment"
            :style="{ width: rd.percent + '%', background: rd.color }"
          ></div>
        </div>
        <div class="role-dist-legends">
          <span
            v-for="rd in roleDistribution.filter((r) => r.count > 0)"
            :key="rd.name"
            class="role-dist-legend"
          >
            <span class="role-legend-dot" :style="{ background: rd.color }"></span>
            {{ rd.displayName }} ({{ Math.round(rd.percent) }}%)
          </span>
        </div>
      </div>
    </div>

    <!-- User List Panel -->
    <div class="um-list-panel">
      <div class="um-list-header">
        <div class="um-list-h-left">
          <h4 class="um-list-title">所有用户</h4>
        </div>
        <div class="um-list-h-right">
          <!-- 搜索输入框 -->
          <div class="um-search-box">
            <el-input
              v-model="searchKeyword"
              placeholder="搜索姓名 / 邮箱"
              clearable
              class="um-search-input"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </div>

          <!-- 角色筛选 -->
          <el-select
            v-model="filterRoleId"
            placeholder="所有角色"
            clearable
            class="um-filter-select"
            popper-class="filter-select-popper-pl"
            style="width: 120px"
          >
            <el-option
              v-for="r in roles"
              :key="r.id"
              :label="r.display_name || r.name"
              :value="r.id"
            />
          </el-select>

          <!-- 状态筛选 -->
          <el-select
            v-model="filterStatus"
            placeholder="所有状态"
            clearable
            class="um-filter-select"
            popper-class="filter-select-popper-pl"
            style="width: 120px"
          >
            <el-option label="已启用" value="active" />
            <el-option label="已冻结" value="disabled" />
          </el-select>

          <!-- 导出数据 -->
          <button class="um-action-btn" title="导出数据">
            <el-icon><Download /></el-icon>
          </button>

          <!-- 添加用户按钮 -->
          <button class="um-add-btn-new" @click="openCreateUser">
            <span class="um-add-icon">+</span>
            添加用户
          </button>
        </div>
      </div>

      <div class="um-table-wrapper">
        <table class="um-table">
          <thead>
            <tr>
              <th style="width: 32%">用户信息</th>
              <th style="width: 18%">角色级别</th>
              <th style="width: 20%">最后登录</th>
              <th style="width: 15%">状态</th>
              <th style="width: 15%" class="text-right">管理操作</th>
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
                    <Pencil :size="15" />
                    <span>编辑</span>
                  </button>
                  <button
                    class="action-btn action-reset-pwd icon-only"
                    title="重置密码"
                    @click="openResetPwd(u)"
                  >
                    <KeyRound :size="15" />
                    <span>重置密码</span>
                  </button>
                  <button
                    class="action-btn action-freeze icon-only"
                    :title="u.active ? '冻结' : '解冻'"
                    :disabled="isAdmin(u)"
                    @click="!isAdmin(u) && toggleFreeze(u)"
                  >
                    <Ban v-if="u.active" :size="15" />
                    <UserCheck v-else :size="15" />
                    <span>{{ u.active ? '冻结' : '解冻' }}</span>
                  </button>
                  <button
                    class="action-btn action-delete icon-only"
                    title="删除"
                    :disabled="isAdmin(u)"
                    @click="!isAdmin(u) && removeUser(u)"
                  >
                    <Trash2 :size="15" />
                    <span>删除</span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!usersLoading && filteredUsers.length === 0" class="um-empty">暂无用户</div>
      </div>

      <div v-if="filteredUsers.length > 0" class="um-pagination">
        <span class="um-pagination-info">
          显示 {{ userPaginationStart }}-{{ userPaginationEnd }} / 共
          {{ filteredUsers.length }} 个用户
        </span>
        <el-pagination
          background
          small
          :current-page="userPage"
          :page-size="userPageSize"
          :page-sizes="userPageSizeOptions"
          :total="filteredUsers.length"
          layout="sizes, prev, pager, next, jumper"
          @size-change="onUserPaginationSizeChange"
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
      <el-form label-position="top" class="um-form-container">
        <!-- 头像行 -->
        <el-form-item label="用户头像" class="form-item-full">
          <div class="um-avatar-upload-row">
            <div class="um-avatar-upload" @click="triggerAvatarInput">
              <div v-if="avatarPreview" class="um-avatar-preview-wrapper">
                <img :src="avatarPreview" class="um-avatar-preview" />
                <div class="um-avatar-overlay">
                  <Camera :size="16" class="um-avatar-overlay-icon" />
                  <span>更换头像</span>
                </div>
              </div>
              <div v-else class="um-avatar-placeholder">
                <Camera class="um-avatar-placeholder-icon" :size="20" />
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
            <div class="um-avatar-hint-wrap">
              <span class="um-avatar-hint-title">支持 PNG / JPG / GIF / WebP 格式</span>
              <span class="um-avatar-hint-sub">推荐尺寸 200x200 像素，文件最大不超过 2MB</span>
            </div>
          </div>
        </el-form-item>

        <!-- 双列网格表单 -->
        <div class="um-form-grid">
          <el-form-item label="姓名" class="form-item-half">
            <el-input v-model="userForm.name" placeholder="姓名" />
          </el-form-item>
          <el-form-item label="手机号" class="form-item-half">
            <el-input v-model="userForm.phone" placeholder="手机号" />
          </el-form-item>

          <el-form-item label="邮箱" :class="editingUserId ? 'form-item-full' : 'form-item-half'">
            <el-input v-model="userForm.email" :disabled="!!editingUserId" placeholder="邮箱" />
          </el-form-item>
          <el-form-item v-if="!editingUserId" label="初始密码" class="form-item-half">
            <el-input
              v-model="userForm.password"
              type="password"
              show-password
              placeholder="密码"
            />
          </el-form-item>

          <el-form-item label="角色（必选，可多选）" class="form-item-full">
            <el-select
              v-model="userForm.roleIds"
              multiple
              filterable
              placeholder="选择角色"
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

          <el-form-item label="项目（必选，可多选）" class="form-item-full">
            <el-select
              v-model="userForm.projectIds"
              multiple
              filterable
              placeholder="选择项目"
              style="width: 100%"
            >
              <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
          </el-form-item>
        </div>

        <!-- 状态选项 -->
        <el-form-item label="用户状态" class="form-item-full um-status-form-item">
          <div class="um-status-switch-wrap">
            <el-switch
              v-model="userForm.active"
              active-text="启用账号"
              inactive-text="冻结账号"
              class="um-status-switch"
            />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingUser" @click="submitUser">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resetPwdDialogVisible" title="重置密码" width="440px" class="um-dialog">
      <p style="margin-bottom: 12px; color: var(--tp-text-muted); font-size: 13px">
        为用户【{{ resetPwdUserName }}】设置新密码
      </p>
      <el-form label-position="top">
        <el-form-item label="新密码">
          <el-input
            v-model="resetPwdForm.newPassword"
            type="password"
            show-password
            placeholder="新密码"
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
  gap: 16px;
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
.um-add-btn:hover {
  background: var(--tp-btn-bg-hover);
  filter: none;
  box-shadow: var(--tp-btn-shadow-hover);
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
  gap: 16px;
}

/* ── Custom Filter Bar & Action Styling ── */
.um-search-box {
  width: 200px;
}

/* 统一输入框与下拉框为圆角胶囊风格，高度 32px */
.um-search-input :deep(.el-input__wrapper),
.um-filter-select :deep(.el-select__wrapper) {
  height: 32px !important;
  line-height: 32px !important;
  border-radius: 999px !important;
  background-color: var(--tp-surface-input) !important;
  border: 1px solid var(--tp-border-subtle) !important;
  box-shadow: none !important;
  padding: 0 12px !important;
  transition: all var(--tp-transition) !important;
}

.um-search-input :deep(.el-input__wrapper):hover,
.um-filter-select :deep(.el-select__wrapper):hover {
  border-color: var(--tp-border-strong) !important;
}

.um-search-input :deep(.el-input__wrapper.is-focus),
.um-filter-select :deep(.el-select__wrapper.is-focused) {
  background-color: var(--tp-surface-card) !important;
  border-color: var(--tp-primary) !important;
  box-shadow: 0 0 0 1px var(--tp-primary) !important;
}

/* 统一输入框与下拉框文字与图标颜色，使用主题变量 */
.um-search-input :deep(.el-input__inner),
.um-filter-select :deep(.el-select__placeholder),
.um-filter-select :deep(.el-select__text) {
  font-size: 13px !important;
  color: var(--tp-text-primary) !important;
}

.um-search-input :deep(.el-input__inner::placeholder),
.um-filter-select :deep(.el-select__placeholder) {
  color: var(--tp-text-placeholder) !important;
}

.um-search-input :deep(.el-input__prefix) {
  color: var(--tp-text-muted) !important;
  margin-right: 4px;
}

/* 统一添加用户按钮样式为 32px 胶囊 */
.um-add-btn-new {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 16px;
  border-radius: 999px;
  border: none;
  background: var(--tp-btn-bg);
  color: var(--tp-btn-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--tp-transition);
  white-space: nowrap;
  box-shadow: var(--tp-btn-shadow);
}

.um-add-btn-new:hover {
  background: var(--tp-btn-bg-hover);
  box-shadow: var(--tp-btn-shadow-hover);
}

.um-add-btn-new:active {
  transform: scale(0.96);
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
  display: flex;
  flex-direction: column;
  flex: 1;
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

.um-list-h-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.um-action-btn {
  width: 32px;
  height: 32px;
  background-color: var(--tp-surface-input);
  border: 1px solid var(--tp-border-subtle);
  border-radius: 50%;
  color: var(--tp-text-subtle);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all var(--tp-transition);
}
.um-action-btn:hover {
  border-color: var(--tp-border-strong);
  background-color: var(--tp-surface-hover);
  color: var(--tp-primary);
}
.um-action-btn:focus-visible {
  outline: none;
  border-color: var(--tp-primary);
  box-shadow: 0 0 0 1px var(--tp-primary);
}

.um-table-wrapper {
  width: 100%;
  overflow-x: auto;
  flex: 1;
}
.um-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
.um-table th {
  padding: 14px 24px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tp-text-subtle);
  background: var(--tp-surface-header);
  border-bottom: 1px solid var(--tp-border-subtle);
}
.um-tr {
  transition: background var(--tp-transition);
}
.um-tr:hover {
  background: var(--tp-surface-row-hover);
}
.um-tr td {
  padding: 20px 24px;
  border-bottom: 1px solid var(--tp-border-subtle);
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

/* ── Row Action Buttons Styling ── */
.um-tr .action-group {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px; /* 使用合适的间距，不再依靠横线分隔 */
}

/* 消除全局纵向分隔线 */
.um-tr .action-btn + .action-btn::before {
  display: none !important;
}

.um-tr .action-btn.icon-only {
  width: 30px;
  height: 30px;
  border-radius: 50% !important; /* 完美的圆形操作按钮 */
  border: 1px solid transparent !important;
  background: transparent !important;
  color: var(--tp-text-secondary) !important;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 !important;
  transition: all var(--tp-transition) !important;
}

/* 各种按钮的 Hover 精致态，与系统用例列表及评审对齐 */
.um-tr .action-btn.action-edit.icon-only:hover:not(:disabled) {
  background: var(--tp-accent-primary-soft) !important;
  border-color: var(--tp-accent-primary-border) !important;
  color: var(--tp-primary) !important;
}

.um-tr .action-btn.action-reset-pwd.icon-only:hover:not(:disabled) {
  background: var(--tp-accent-info-soft) !important;
  border-color: var(--tp-accent-info-border) !important;
  color: var(--tp-accent-info) !important;
}

.um-tr .action-btn.action-freeze.icon-only:hover:not(:disabled) {
  background: var(--tp-accent-warning-soft) !important;
  border-color: var(--tp-accent-warning-border) !important;
  color: var(--tp-accent-warning, #f59e0b) !important;
}

.um-tr .action-btn.action-delete.icon-only:hover:not(:disabled) {
  background: var(--tp-accent-danger-soft) !important;
  border-color: var(--tp-accent-danger-border) !important;
  color: var(--tp-danger) !important;
}

/* 禁用状态 */
.um-tr .action-btn.icon-only:disabled {
  opacity: 0.35 !important;
  cursor: not-allowed !important;
  background: transparent !important;
  border-color: transparent !important;
  color: var(--tp-text-placeholder) !important;
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
  gap: 16px;
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

.um-root {
  --bg-main: var(--tp-surface-base);
  --bg-card: var(--tp-surface-card);
  --bg-card-high: var(--tp-surface-elevated);
  --text-on-surface: var(--tp-gray-900);
  --text-on-surface-variant: var(--tp-gray-700);
  --text-slate: var(--tp-gray-500);
  --primary: var(--tp-accent-primary);
  --secondary: var(--tp-accent-info);
  --tertiary: var(--tp-accent-warning);
  --error: var(--tp-accent-danger);
  --success: var(--tp-accent-success);
  --primary-container: var(--tp-primary);
  --secondary-container: var(--tp-accent-info);
  --border-light: var(--tp-border-subtle);
  --border-lighter: var(--tp-border-subtle);
  background:
    radial-gradient(circle at 12% 0%, var(--tp-ambient-primary), transparent 30%),
    radial-gradient(circle at 88% 10%, var(--tp-ambient-info), transparent 28%),
    var(--tp-surface-base);
}

.um-title,
.text-white,
.um-sec-title.white-text,
.um-table th,
.um-name,
.um-log-desc {
  color: var(--tp-gray-900);
}

.um-subtitle,
.um-time,
.um-email,
.um-ip,
.um-empty,
.um-pagination,
.um-pagination :deep(.btn-prev),
.um-pagination :deep(.btn-next),
.um-pagination :deep(.el-pager li),
.um-log-time,
.um-avatar-hint {
  color: var(--tp-gray-500);
}

.um-stats-panel,
.um-bento-card,
.um-list-panel,
.um-sec-panel,
.audit-status {
  background:
    linear-gradient(180deg, var(--tp-surface-sheen), transparent 38%), var(--tp-surface-card);
  border: 1px solid var(--tp-border-subtle);
  box-shadow: var(--tp-shadow-card);
}

.um-bento-card:hover,
.um-list-panel:hover,
.um-sec-panel:hover {
  border-color: var(--tp-border-strong);
}

.um-add-btn,
.um-pagination :deep(.el-pager li.is-active) {
  background: var(--tp-btn-bg) !important;
  color: var(--tp-btn-text);
  border-radius: var(--tp-btn-radius);
  box-shadow: var(--tp-btn-shadow);
}

.um-add-btn:hover {
  filter: none;
  background: var(--tp-btn-bg-hover) !important;
  box-shadow: var(--tp-btn-shadow-hover);
}

.um-add-btn:active {
  transform: scale(0.98);
}

.um-action-btn,
.um-avatar-glass,
.um-role-bar,
.um-audit-btn {
  background: var(--tp-surface-input);
  border: 1px solid var(--tp-border-subtle);
}

.um-action-btn:hover,
.um-audit-btn:hover,
.um-tr:hover,
.um-log-row:hover {
  background: var(--tp-surface-hover);
}

.um-table th,
.um-tr td,
.um-list-header,
.um-pagination,
.um-stat-divider {
  border-color: var(--tp-border-subtle);
}

.um-stat-primary,
.um-sec-link,
.um-audit-pct {
  color: var(--tp-accent-primary);
}

.um-stat-secondary {
  color: var(--tp-accent-info);
}

.um-live-badge {
  background: var(--tp-accent-primary-soft);
  color: var(--tp-accent-primary);
  border: 1px solid var(--tp-accent-primary-border);
}

.um-status-dot.active,
.um-status-dot.disabled {
  box-shadow: none;
}

.audit-status {
  background:
    linear-gradient(180deg, var(--tp-surface-sheen), transparent 38%), var(--tp-surface-card);
}

.um-dialog :deep(.el-dialog) {
  background: var(--tp-surface-card);
  border: 1px solid var(--tp-border-subtle);
  box-shadow: var(--tp-shadow-md);
}

.um-dialog :deep(.el-dialog__title) {
  color: var(--tp-gray-900);
}

.um-avatar-upload {
  border-color: var(--tp-accent-primary-border);
  background: var(--tp-surface-input);
}

.um-avatar-upload:hover {
  border-color: var(--tp-border-strong);
  box-shadow: none;
}

.um-avatar-placeholder {
  background: var(--tp-accent-primary-soft);
}

.um-avatar-placeholder-icon,
.um-avatar-placeholder-text {
  color: var(--tp-accent-primary);
}

.um-add-btn:focus-visible,
.um-action-btn:focus-visible,
.um-sec-link:focus-visible,
.um-audit-btn:focus-visible,
.um-avatar-upload:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--tp-accent-primary-soft);
}

.um-title {
  font-size: var(--tp-text-3xl);
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-tight);
}

.um-subtitle,
.um-audit-desc {
  font-size: var(--tp-text-md);
  font-weight: var(--tp-font-regular);
  line-height: var(--tp-line-body);
  color: var(--tp-text-muted);
}

.um-stat-label,
.um-bento-label,
.um-table th,
.um-list-header,
.um-role-legends,
.um-status-pill,
.um-sec-title,
.um-sec-link,
.um-upload-overlay,
.um-live-badge {
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-semibold);
  line-height: var(--tp-line-ui);
  text-transform: none;
  letter-spacing: 0;
}

.um-email,
.um-ip,
.um-log-time,
.um-pagination,
.um-avatar-hint,
.um-avatar-placeholder-text {
  font-size: var(--tp-text-xs);
  color: var(--tp-text-muted);
}

.um-list-title,
.um-name,
.um-log-desc {
  font-size: var(--tp-text-sm);
  font-weight: var(--tp-font-semibold);
  line-height: var(--tp-line-ui);
}

.um-add-btn {
  font-weight: var(--tp-font-semibold);
}

.um-audit-btn,
.um-avatar-placeholder-icon {
  font-weight: var(--tp-font-regular);
}

.um-pagination {
  min-height: 48px;
  margin-top: 0;
  padding: 10px 16px;
  justify-content: space-between;
  border-top: 1px solid var(--tp-border-subtle);
  background: linear-gradient(180deg, var(--tp-surface-header), var(--tp-surface-card));
  letter-spacing: 0;
  text-transform: none;
}

.um-pagination-info,
.um-pagination :deep(.el-pagination__total),
.um-pagination :deep(.el-pagination__jump) {
  color: var(--tp-text-muted);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-medium);
  line-height: var(--tp-line-ui);
}

.um-pagination :deep(.el-pagination) {
  gap: 6px;
}

.um-pagination :deep(.el-pagination button),
.um-pagination :deep(.el-pager li) {
  min-width: 32px;
  height: 32px;
  border: 1px solid var(--tp-border-subtle);
  border-radius: 9px;
  background: var(--tp-surface-card);
  color: var(--tp-text-secondary);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-semibold);
}

.um-pagination :deep(.el-pagination button:hover),
.um-pagination :deep(.el-pager li:hover) {
  border-color: var(--tp-accent-primary-border);
  background: var(--tp-surface-hover);
  color: var(--tp-primary);
}

.um-pagination :deep(.el-pagination.is-background .el-pager li.is-active) {
  background: var(--tp-btn-bg) !important;
  border-color: var(--tp-btn-border) !important;
  color: var(--tp-btn-text) !important;
  box-shadow: var(--tp-btn-shadow);
}

.um-root {
  background: var(--tp-surface-base);
}

.um-stats-panel,
.um-bento-card,
.um-list-panel,
.um-sec-panel,
.audit-status {
  background: var(--tp-surface-card);
  border-color: var(--tp-border-subtle);
  box-shadow: var(--tp-shadow-sm);
}

.um-bento-card:hover,
.um-list-panel:hover,
.um-sec-panel:hover {
  box-shadow: var(--tp-shadow-sm);
}

.um-bento-bg-icon {
  display: none;
}

.um-avatar-glass {
  backdrop-filter: none;
  box-shadow: none;
}

.um-pagination {
  background: var(--tp-surface-card);
}

.um-tr:hover,
.um-log-row:hover {
  box-shadow: inset 2px 0 0 var(--tp-primary);
}

/* ── Stats Card Premium Layout (Consistent with Case Review) ── */
.insight-card {
  display: flex;
  justify-content: space-between;
  background:
    linear-gradient(180deg, var(--tp-surface-sheen), transparent 40%), var(--tp-surface-card) !important;
  border: 1px solid var(--tp-border-subtle) !important;
  border-radius: 12px !important;
  box-shadow: var(--tp-shadow-card) !important;
  min-height: 80px !important;
  padding: 10px 12px !important;
  transition: all var(--tp-transition) !important;
}

.insight-card:hover {
  border-color: var(--tp-border-strong) !important;
  box-shadow: var(--tp-shadow-card-hover) !important;
}

.insight-left {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.insight-icon-wrap {
  width: 32px !important;
  height: 32px !important;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.insight-trend {
  margin-top: 6px !important;
  padding: 1px 6px !important;
  border-radius: 999px !important;
  font-size: 10px !important;
  border: 1px solid transparent;
  display: inline-flex;
  align-items: center;
  font-weight: 600;
  width: fit-content;
}

.trend-grey {
  background: var(--tp-surface-muted) !important;
  border-color: var(--tp-border-subtle) !important;
  color: var(--tp-text-secondary) !important;
}

.trend-green {
  background: var(--tp-accent-success-soft) !important;
  border-color: var(--tp-accent-success-border) !important;
  color: var(--tp-accent-success) !important;
}

.insight-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  text-align: right;
}

.insight-label {
  font-size: 11px !important;
  font-weight: var(--tp-font-bold) !important;
  color: var(--tp-text-muted) !important;
}

.insight-value {
  margin: 2px 0 !important;
  font-size: 22px !important;
  font-weight: 780;
  color: var(--tp-text-primary) !important;
  line-height: 1;
}

.insight-chart {
  display: flex;
  align-items: flex-end;
  height: 15px;
  gap: 2px;
}

.insight-chart .bar {
  width: 3px;
  border-radius: 999px;
}

.icon-purple {
  background: var(--tp-accent-primary-soft) !important;
  color: var(--tp-primary) !important;
}

.icon-blue {
  background: var(--tp-accent-info-soft) !important;
  color: var(--tp-accent-info) !important;
}

/* ── Role Distribution Premium Styling ── */
.role-dist-card {
  grid-column: span 2;
  background:
    linear-gradient(180deg, var(--tp-surface-sheen), transparent 40%), var(--tp-surface-card) !important;
  border: 1px solid var(--tp-border-subtle) !important;
  border-radius: 12px !important;
  box-shadow: var(--tp-shadow-card) !important;
  min-height: 80px !important;
  padding: 12px 16px !important;
  transition: all var(--tp-transition) !important;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.role-dist-card:hover {
  border-color: var(--tp-border-strong) !important;
  box-shadow: var(--tp-shadow-card-hover) !important;
}

.role-dist-title {
  font-size: 11px !important;
  font-weight: var(--tp-font-bold) !important;
  color: var(--tp-text-muted) !important;
  margin-bottom: 8px;
}

.role-dist-bar {
  display: flex;
  width: 100%;
  height: 6px;
  border-radius: 99px;
  overflow: hidden;
  background: var(--tp-surface-input);
  margin-bottom: 12px;
}

.role-dist-segment {
  height: 100%;
  transition: width 0.3s ease;
}

.role-dist-legends {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 10px;
  font-weight: 600;
  color: var(--tp-text-secondary);
}

.role-dist-legend {
  display: flex;
  align-items: center;
  gap: 5px;
}

.role-legend-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

/* ── 筛选下拉悬浮窗 (Popper) 美化样式 ── */
:global(.filter-select-popper-pl.el-popper) {
  border: 1px solid var(--tp-border-subtle) !important;
  border-radius: var(--tp-radius-md) !important;
  box-shadow: var(--tp-shadow-sm) !important;
  background: var(--tp-glass-bg-strong, rgba(255, 255, 255, 0.96)) !important;
  backdrop-filter: blur(12px) !important;
}

/* 暗色主题适配 */
:global(html[data-theme='genart'] .filter-select-popper-pl.el-popper) {
  background: var(--tp-gray-100) !important;
  border-color: var(--tp-border-subtle) !important;
}

/* 下拉菜单列表内边距，使选项呈现悬浮感 */
:global(.filter-select-popper-pl .el-select-dropdown__list) {
  padding: 6px !important;
}

/* 下拉选项圆角与交互过渡 */
:global(.filter-select-popper-pl .el-select-dropdown__item) {
  height: 32px !important;
  line-height: 32px !important;
  padding: 0 12px !important;
  border-radius: var(--tp-radius-sm) !important;
  color: var(--tp-text-secondary) !important;
  font-size: 13px !important;
  font-weight: var(--tp-font-medium) !important;
  margin-bottom: 2px !important;
  transition: all var(--tp-transition) !important;
}

:global(.filter-select-popper-pl .el-select-dropdown__item:last-child) {
  margin-bottom: 0 !important;
}

/* 选项 Hover 态 */
:global(.filter-select-popper-pl .el-select-dropdown__item.is-hovering),
:global(.filter-select-popper-pl .el-select-dropdown__item:hover) {
  background: var(--tp-surface-hover) !important;
  color: var(--tp-primary) !important;
}

/* 选项 Selected 选中态 */
:global(.filter-select-popper-pl .el-select-dropdown__item.is-selected) {
  background: var(--tp-accent-primary-soft) !important;
  color: var(--tp-primary) !important;
  font-weight: var(--tp-font-semibold) !important;
}

/* 箭头三角背景色与边框色对齐 */
:global(.filter-select-popper-pl .el-popper__arrow::before) {
  background: var(--tp-glass-bg-strong, rgba(255, 255, 255, 0.96)) !important;
  border-color: var(--tp-border-subtle) !important;
}

:global(html[data-theme='genart'] .filter-select-popper-pl .el-popper__arrow::before) {
  background: var(--tp-gray-100) !important;
  border-color: var(--tp-border-subtle) !important;
}

/* ── Form Dialog Premium Styling ── */
.um-form-container {
  display: flex;
  flex-direction: column;
  gap: 20px; /* 增加行间距，显得更开阔 */
}
.um-form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px 24px; /* 增加列和行间距 */
  width: 100%;
}
.form-item-full {
  grid-column: span 2;
  margin-bottom: 0 !important;
}
.form-item-half {
  grid-column: span 1;
  margin-bottom: 0 !important;
}
.um-status-form-item {
  margin-top: 8px;
}
.um-status-switch-wrap {
  display: flex;
  align-items: center;
  height: 48px;
  background: var(--tp-surface-input);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  padding: 0 16px;
  box-sizing: border-box;
}

/* 统一对话框中的 ElForm 样式，符合 Element Plus 2.x 设计系统 */
:global(.el-overlay .el-dialog.um-dialog .el-form-item__label) {
  font-size: 13px !important;
  font-weight: 600 !important;
  color: var(--tp-text-secondary) !important;
  padding-bottom: 8px !important;
}

:global(.el-overlay .el-dialog.um-dialog .el-input__wrapper) {
  height: 38px !important; /* 对话框中输入框适当增高，更显高端质感 */
  line-height: 38px !important;
  border-radius: 10px !important; /* 调整为更精致的 10px 圆角而非极端的胶囊圆角，适合输入框 */
  background-color: var(--tp-surface-input) !important;
  border: 1px solid var(--tp-border-subtle) !important;
  box-shadow: none !important;
  padding: 0 16px !important;
  transition: all var(--tp-transition) !important;
}

:global(.el-overlay .el-dialog.um-dialog .el-select__wrapper) {
  min-height: 38px !important; /* 多选框使用 min-height，以支持多行标签自动换行 */
  padding: 4px 16px !important;
  border-radius: 10px !important; /* 同样使用精致 of 10px 圆角 */
  background-color: var(--tp-surface-input) !important;
  border: 1px solid var(--tp-border-subtle) !important;
  box-shadow: none !important;
  transition: all var(--tp-transition) !important;
}

:global(.el-overlay .el-dialog.um-dialog .el-input__wrapper:hover),
:global(.el-overlay .el-dialog.um-dialog .el-select__wrapper:hover) {
  border-color: var(--tp-border-strong) !important;
}

:global(.el-overlay .el-dialog.um-dialog .el-input__wrapper.is-focus),
:global(.el-overlay .el-dialog.um-dialog .el-select__wrapper.is-focused) {
  background-color: var(--tp-surface-card) !important;
  border-color: var(--tp-primary) !important;
  box-shadow: 0 0 0 1px var(--tp-primary) !important;
}

/* 消除输入框/选择框及子元素的默认聚焦外框线 (outline) */
:global(.el-overlay .el-dialog.um-dialog .el-input__wrapper),
:global(.el-overlay .el-dialog.um-dialog .el-select__wrapper) {
  outline: none !important;
}
:global(.el-overlay .el-dialog.um-dialog .el-input__wrapper *),
:global(.el-overlay .el-dialog.um-dialog .el-select__wrapper *) {
  outline: none !important;
  box-shadow: none !important;
}

/* 对话框内多选标签美化 */
:global(.el-overlay .el-dialog.um-dialog .el-select__tags) {
  padding-left: 0;
}
:global(.el-overlay .el-dialog.um-dialog .el-tag) {
  border-radius: 6px !important;
  border: 1px solid rgba(139, 92, 246, 0.15) !important;
  background-color: var(--tp-primary-lighter) !important;
  color: var(--tp-primary) !important;
  padding: 0 8px !important;
  height: 24px !important;
  line-height: 22px !important;
}
:global(.el-overlay .el-dialog.um-dialog .el-tag .el-tag__close) {
  color: var(--tp-primary) !important;
}
:global(.el-overlay .el-dialog.um-dialog .el-tag .el-tag__close:hover) {
  background-color: var(--tp-primary) !important;
  color: #fff !important;
}

/* 头像行排版 */
.um-avatar-upload-row {
  display: flex;
  align-items: center;
  gap: 20px;
  background: var(--tp-surface-input);
  padding: 16px;
  border-radius: var(--tp-radius-md);
  border: 1px solid var(--tp-border-subtle);
  width: 100%;
  box-sizing: border-box;
}

.um-avatar-upload {
  width: 80px;
  height: 80px;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  border: 2px dashed var(--tp-border-subtle);
  transition: all var(--tp-transition) ease;
  position: relative;
  background: var(--tp-surface-card);
}

.um-avatar-upload:hover {
  border-color: var(--tp-primary);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px var(--tp-primary-shadow);
}

.um-avatar-preview-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.um-avatar-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.um-avatar-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--tp-transition);
}

.um-avatar-preview-wrapper:hover .um-avatar-overlay {
  opacity: 1;
}

.um-avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--tp-primary-lighter);
  color: var(--tp-primary);
  transition: background var(--tp-transition);
}

.um-avatar-placeholder-icon {
  color: var(--tp-primary);
  margin-bottom: 4px;
}

.um-avatar-placeholder-text {
  font-size: 11px;
  font-weight: 500;
  color: var(--tp-primary);
}

.um-avatar-hint-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.um-avatar-hint-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tp-text-primary);
}
.um-avatar-hint-sub {
  font-size: 12px;
  color: var(--tp-text-subtle);
  line-height: 1.4;
}

/* 对话框内 Switch 美化 */
:global(.el-overlay .el-dialog.um-dialog .um-status-switch .el-switch__label) {
  font-size: 13px !important;
  color: var(--tp-text-subtle) !important;
  font-weight: 500 !important;
}
:global(.el-overlay .el-dialog.um-dialog .um-status-switch .el-switch__label.is-active) {
  color: var(--tp-primary) !important;
  font-weight: 600 !important;
}

/* 对话框 Footer 按钮微调 */
:global(.el-overlay .el-dialog.um-dialog .el-button) {
  height: 36px !important;
  border-radius: 8px !important;
  font-weight: 600 !important;
  padding: 0 20px !important;
}
:global(.el-overlay .el-dialog.um-dialog .el-button--primary) {
  background-color: var(--tp-primary) !important;
  border-color: var(--tp-primary) !important;
}
:global(.el-overlay .el-dialog.um-dialog .el-button--primary:hover) {
  background-color: var(--tp-primary-dark) !important;
  border-color: var(--tp-primary-dark) !important;
}
</style>
