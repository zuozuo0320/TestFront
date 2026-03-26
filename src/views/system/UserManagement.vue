<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import {
  listUsers,
  createUser,
  updateUser,
  deleteUserById,
  resetUserPassword,
  listRoles,
} from '../../api/user'
import { listProjects } from '../../api/project'
import type { User, Role, Project } from '../../api/types'

/** 用户行类型，扩展了角色/项目关联 ID 和角色名称列表 */
type UserRow = User & { role_ids: number[]; project_ids: number[]; role_names: string[] }

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

/** 根据头像字段或用户名生成头像 URL */
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
  const seed = encodeURIComponent((fallbackName || 'Aisight').trim() || 'Aisight')
  return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}`
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
  userDialogVisible.value = true
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
      await createUser({
        name,
        email,
        phone: phone || undefined,
        password: userForm.password,
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

/** 删除用户（逻辑删除） */
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

function onUserPaginationSizeChange(size: number) {
  userPageSize.value = size
  userPage.value = 1
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
    <!-- 页面顶栏 -->
    <div class="um-header">
      <h2 class="um-title">用户管理</h2>
      <div class="um-header-actions">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索姓名 / 邮箱"
          clearable
          :prefix-icon="Search"
          class="um-search"
          @input="userPage = 1"
        />
        <el-select
          v-model="filterRoleId"
          placeholder="全部角色"
          clearable
          class="um-filter"
          @change="userPage = 1"
        >
          <el-option
            v-for="r in roles"
            :key="r.id"
            :label="r.display_name || r.name"
            :value="r.id"
          />
        </el-select>
        <el-select
          v-model="filterStatus"
          placeholder="全部状态"
          clearable
          class="um-filter-sm"
          @change="userPage = 1"
        >
          <el-option label="启用" value="active" />
          <el-option label="冻结" value="disabled" />
        </el-select>
        <el-button type="primary" class="um-create-btn" @click="openCreateUser">
          + 新建用户
        </el-button>
      </div>
    </div>

    <!-- 主内容区：列表 + 侧栏 -->
    <div class="um-body">
      <!-- 左侧用户列表 -->
      <div class="um-list">
        <div
          v-for="u in pagedUsers"
          :key="u.id"
          class="um-user-item"
          :style="{ '--accent': getRoleAccentColor(u) }"
        >
          <div class="um-user-accent"></div>
          <img
            class="um-user-avatar"
            :src="resolveAvatarUrl(u.avatar, u.name)"
            alt="avatar"
            @error="
              (e: any) => {
                e.target.src = resolveAvatarUrl('', u.name)
              }
            "
          />
          <div class="um-user-content">
            <div class="um-user-top">
              <span class="um-user-name">{{ u.name }}</span>
              <span class="um-user-email">{{ u.email }}</span>
            </div>
            <div class="um-user-bottom">
              <el-tag
                v-for="(name, idx) in u.role_names"
                :key="idx"
                size="small"
                :type="name === '系统管理员' || u.role === 'admin' ? 'danger' : 'info'"
                effect="plain"
                class="um-role-tag"
              >
                {{ name }}
              </el-tag>
              <span v-if="!u.role_names.length" class="um-no-role">未分配</span>
            </div>
          </div>
          <div class="um-user-status">
            <span
              class="um-status-dot"
              :class="u.active ? 'um-status-dot--active' : 'um-status-dot--disabled'"
            ></span>
            <span class="um-status-text">{{ u.active ? '活跃' : '冻结' }}</span>
          </div>
          <div class="um-user-actions">
            <button class="um-action-btn um-action-edit" @click="openEditUser(u)">编辑</button>
            <button class="um-action-btn um-action-pwd" @click="openResetPwd(u)">重置密码</button>
            <button
              class="um-action-btn um-action-delete"
              :disabled="isAdmin(u)"
              @click="removeUser(u)"
            >
              删除
            </button>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="!usersLoading && filteredUsers.length === 0" class="um-empty">暂无用户</div>

        <!-- 分页 -->
        <div v-if="filteredUsers.length > 0" class="um-pager">
          <el-pagination
            background
            small
            :current-page="userPage"
            :page-size="userPageSize"
            :page-sizes="userPageSizeOptions"
            :total="filteredUsers.length"
            layout="total, sizes, prev, pager, next"
            @size-change="onUserPaginationSizeChange"
            @current-change="onUserPaginationCurrentChange"
          />
        </div>
      </div>

      <!-- 右侧统计面板 -->
      <div class="um-sidebar">
        <!-- 用户概览 -->
        <div class="um-stat-card">
          <div class="um-stat-title">用户概览</div>
          <div class="um-ring-wrapper">
            <svg viewBox="0 0 120 120" class="um-ring-svg">
              <circle
                cx="60"
                cy="60"
                r="48"
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                stroke-width="12"
              />
              <circle
                cx="60"
                cy="60"
                r="48"
                fill="none"
                stroke="url(#userRingGrad)"
                stroke-width="12"
                stroke-linecap="round"
                :stroke-dasharray="`${(activeUserCount / Math.max(users.length, 1)) * 301.6} 301.6`"
                transform="rotate(-90 60 60)"
              />
              <defs>
                <linearGradient id="userRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#22c55e" />
                  <stop offset="100%" stop-color="#3b82f6" />
                </linearGradient>
              </defs>
            </svg>
            <div class="um-ring-center">
              <span class="um-ring-number">{{ users.length }}</span>
              <span class="um-ring-label">总用户</span>
            </div>
          </div>
          <div class="um-stat-rows">
            <div class="um-stat-row">
              <span class="um-stat-dot" style="background: #22c55e"></span>
              <span class="um-stat-key">活跃用户</span>
              <span class="um-stat-val">{{ activeUserCount }}</span>
            </div>
            <div class="um-stat-row">
              <span class="um-stat-dot" style="background: #6b7280"></span>
              <span class="um-stat-key">已冻结</span>
              <span class="um-stat-val">{{ users.length - activeUserCount }}</span>
            </div>
          </div>
        </div>

        <!-- 角色分布 -->
        <div class="um-stat-card">
          <div class="um-stat-title">角色分布</div>
          <div class="um-role-bars">
            <div v-for="rd in roleDistribution" :key="rd.name" class="um-role-bar-row">
              <span class="um-role-bar-name">{{ rd.displayName }}</span>
              <div class="um-role-bar-track">
                <div
                  class="um-role-bar-fill"
                  :style="{ width: rd.percent + '%', background: rd.color }"
                ></div>
              </div>
              <span class="um-role-bar-count">{{ rd.count }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 创建/编辑用户弹窗 -->
    <el-dialog
      v-model="userDialogVisible"
      :title="editingUserId ? '编辑用户' : '新建用户'"
      width="640px"
    >
      <el-form label-position="top">
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

    <!-- 重置密码弹窗 -->
    <el-dialog v-model="resetPwdDialogVisible" title="重置密码" width="440px">
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
/* ── 页面根容器 ── */
.um-root {
  padding: 28px 32px;
  min-height: 100%;
}

/* ── 顶栏 ── */
.um-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}
.um-title {
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  margin: 0;
}
.um-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.um-search {
  width: 200px;
}
.um-filter {
  width: 140px;
}
.um-filter-sm {
  width: 120px;
}
.um-create-btn {
  border-radius: 8px;
  font-weight: 600;
}
.um-search :deep(.el-input__wrapper),
.um-filter :deep(.el-input__wrapper),
.um-filter-sm :deep(.el-input__wrapper) {
  border-radius: 8px;
}

/* ── 主内容区 ── */
.um-body {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

/* ── 左侧用户列表 ── */
.um-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: calc(100vh - 180px);
}

.um-user-item {
  display: flex;
  align-items: center;
  gap: 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 14px 18px;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}
.um-user-item:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateY(-1px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

/* 左侧彩色条 */
.um-user-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--accent);
  border-radius: 4px 0 0 4px;
}

/* 头像 */
.um-user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  margin-left: 4px;
}

/* 用户主内容 */
.um-user-content {
  flex: 1;
  min-width: 0;
}
.um-user-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
}
.um-user-name {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
}
.um-user-email {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
}
.um-user-bottom {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.um-role-tag {
  border-radius: 4px;
  font-size: 10px;
}
.um-no-role {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
}

/* 状态 */
.um-user-status {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  min-width: 56px;
}
.um-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.um-status-dot--active {
  background: #22c55e;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
}
.um-status-dot--disabled {
  background: #6b7280;
}
.um-status-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

/* 操作按钮 */
.um-user-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.um-action-btn {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.15s;
}
.um-action-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.um-action-edit:hover {
  border-color: rgba(139, 92, 246, 0.4);
  color: #a78bfa;
}
.um-action-pwd:hover {
  border-color: rgba(59, 130, 246, 0.4);
  color: #60a5fa;
}
.um-action-delete:hover {
  border-color: rgba(239, 68, 68, 0.4);
  color: #f87171;
}
.um-action-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.um-action-btn:disabled:hover {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.6);
  border-color: rgba(255, 255, 255, 0.1);
}

/* 空状态 */
.um-empty {
  text-align: center;
  padding: 48px 0;
  color: rgba(255, 255, 255, 0.3);
  font-size: 14px;
}

/* 分页 */
.um-pager {
  display: flex;
  justify-content: flex-end;
  margin-top: auto;
  padding-top: 16px;
}

/* ── 右侧统计面板 ── */
.um-sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.um-stat-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 20px;
}
.um-stat-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 16px;
}

/* 环形图 */
.um-ring-wrapper {
  position: relative;
  width: 120px;
  height: 120px;
  margin: 0 auto 16px;
}
.um-ring-svg {
  width: 100%;
  height: 100%;
}
.um-ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.um-ring-number {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}
.um-ring-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 2px;
}

/* 统计行 */
.um-stat-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.um-stat-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.um-stat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.um-stat-key {
  flex: 1;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}
.um-stat-val {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}

/* 角色分布条形图 */
.um-role-bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.um-role-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.um-role-bar-name {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  width: 72px;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.um-role-bar-track {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
}
.um-role-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s ease;
  min-width: 2px;
}
.um-role-bar-count {
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  width: 20px;
  text-align: right;
}
</style>
