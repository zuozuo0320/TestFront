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
  if (filterRoleId.value !== '') {
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
  return u.role_names.some((n) => n.toLowerCase() === 'admin' || n === '系统管理员')
    || u.role === 'admin'
}

/** 格式化最后登录时间 */
function formatTime(value?: string | null) {
  if (!value) return '从未登录'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function onUserPaginationSizeChange(size: number) {
  userPageSize.value = size
  userPage.value = 1
}

function onUserPaginationCurrentChange(current: number) {
  userPage.value = current
}

/** 初始化：先加载角色和项目（用于 roleNameMap），再加载用户 */
onMounted(async () => {
  await Promise.all([loadRoles(), loadProjects()])
  await loadUsers()
})
</script>

<template>
  <div class="module-card users-card" v-loading="usersLoading">
    <!-- 工具栏：标题 + 搜索/筛选 + 新建按钮 -->
    <div class="module-toolbar users-toolbar">
      <h3>用户管理</h3>
      <div class="toolbar-right">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索姓名 / 邮箱"
          clearable
          :prefix-icon="Search"
          style="width: 200px"
          @input="userPage = 1"
        />
        <el-select
          v-model="filterRoleId"
          placeholder="全部角色"
          clearable
          style="width: 140px"
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
          style="width: 120px"
          @change="userPage = 1"
        >
          <el-option label="启用" value="active" />
          <el-option label="冻结" value="disabled" />
        </el-select>
        <el-button type="primary" @click="openCreateUser">新建用户</el-button>
      </div>
    </div>

    <!-- 用户表格 -->
    <el-table :data="pagedUsers" stripe style="width: 100%" empty-text="暂无用户">
      <el-table-column label="姓名" min-width="200">
        <template #default="{ row }">
          <div class="user-cell">
            <img
              class="user-cell-avatar"
              :src="resolveAvatarUrl(row.avatar, row.name)"
              alt="avatar"
              @error="(e: any) => { e.target.src = resolveAvatarUrl('', row.name) }"
            />
            <div class="user-cell-meta">
              <div class="user-cell-name">{{ row.name }}</div>
              <div class="user-cell-sub">{{ row.email }}</div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="角色" min-width="180">
        <template #default="{ row }">
          <div class="role-tags">
            <el-tag
              v-for="(name, idx) in row.role_names"
              :key="idx"
              size="small"
              :type="name === '系统管理员' || row.role === 'admin' ? 'danger' : 'info'"
              effect="plain"
              class="role-tag"
            >
              {{ name }}
            </el-tag>
            <span v-if="!row.role_names.length" class="no-role">未分配</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="项目数" width="80" align="center">
        <template #default="{ row }">{{ row.project_ids.length }}</template>
      </el-table-column>
      <el-table-column label="手机号" width="130">
        <template #default="{ row }">{{ row.phone || '-' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="row.active ? 'success' : 'info'" effect="dark">
            {{ row.active ? '启用' : '冻结' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最后登录" width="120" align="center">
        <template #default="{ row }">
          <span class="time-text">{{ formatTime(row.last_login_at) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link size="small" @click="openEditUser(row)">编辑</el-button>
          <el-button link size="small" @click="openResetPwd(row)">重置密码</el-button>
          <el-button
            link
            size="small"
            type="danger"
            :disabled="isAdmin(row)"
            @click="removeUser(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pager">
      <el-pagination
        background
        small
        :current-page="userPage"
        :page-size="userPageSize"
        :page-sizes="userPageSizeOptions"
        :total="filteredUsers.length"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="onUserPaginationSizeChange"
        @current-change="onUserPaginationCurrentChange"
      />
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
          <el-select v-model="userForm.roleIds" multiple filterable placeholder="请选择角色" style="width: 100%">
            <el-option
              v-for="r in (editingUserId ? roles : creatableRoles)"
              :key="r.id"
              :label="r.display_name || r.name"
              :value="r.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="项目（必选，可多选）">
          <el-select v-model="userForm.projectIds" multiple filterable placeholder="请选择项目" style="width: 100%">
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
    <el-dialog
      v-model="resetPwdDialogVisible"
      title="重置密码"
      width="440px"
    >
      <p style="margin-bottom: 12px; color: rgba(255,255,255,0.6); font-size: 13px;">
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
        <el-button type="primary" :loading="resettingPwd" @click="submitResetPwd">确认重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.users-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 10px;
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.user-cell-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.user-cell-meta {
  overflow: hidden;
}
.user-cell-name {
  font-weight: 500;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-cell-sub {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.role-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.role-tag {
  border-radius: 4px;
}
.no-role {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
}
.time-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}
</style>
