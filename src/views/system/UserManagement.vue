<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listUsers,
  createUser,
  updateUser,
  deleteUserById,
  listRoles,
} from '../../api/user'
import { listProjects } from '../../api/project'
import type { User, Role, Project } from '../../api/types'

type UserRow = User & { roleIds: number[]; projectIds: number[] }

const users = ref<UserRow[]>([])
const roles = ref<Role[]>([])
const projects = ref<Project[]>([])
const usersLoading = ref(false)
const userPage = ref(1)
const userPageSize = ref(10)
const userPageSizeOptions = [10, 20, 50]
const userDialogVisible = ref(false)
const editingUserId = ref<number | null>(null)
const savingUser = ref(false)

const userForm = reactive({
  name: '',
  email: '',
  phone: '',
  roleIds: [] as number[],
  projectIds: [] as number[],
  active: true,
})

const pagedUsers = computed(() => {
  const start = (userPage.value - 1) * userPageSize.value
  return users.value.slice(start, start + userPageSize.value)
})

const creatableRoles = computed(() => roles.value.filter((r) => r.name !== 'admin'))

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

async function loadUsers() {
  usersLoading.value = true
  try {
    const data = await listUsers()
    users.value = data.map((u) => ({ ...u, roleIds: [], projectIds: [] }))
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

function openCreateUser() {
  editingUserId.value = null
  userForm.name = ''
  userForm.email = ''
  userForm.phone = ''
  userForm.roleIds = []
  userForm.projectIds = []
  userForm.active = true
  userDialogVisible.value = true
}

function openEditUser(u: UserRow) {
  editingUserId.value = u.id
  userForm.name = u.name
  userForm.email = u.email
  userForm.phone = u.phone || ''
  userForm.roleIds = u.roleIds || []
  userForm.projectIds = u.projectIds || []
  userForm.active = u.active
  userDialogVisible.value = true
}

async function submitUser() {
  const name = userForm.name.trim()
  const email = userForm.email.trim()
  const phone = userForm.phone.trim()

  if (!isValidName(name)) {
    ElMessage.warning('姓名格式不正确（2-40字符，支持中文/英文/数字）')
    return
  }
  if (!isValidEmail(email)) {
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
      const defaultRoleName =
        roles.value.find((r) => r.id === userForm.roleIds[0])?.name || 'tester'
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

function onUserPaginationSizeChange(size: number) {
  userPageSize.value = size
  userPage.value = 1
}

function onUserPaginationCurrentChange(current: number) {
  userPage.value = current
}

onMounted(async () => {
  await Promise.all([loadUsers(), loadRoles(), loadProjects()])
})
</script>

<template>
  <div class="module-card users-card" v-loading="usersLoading">
    <div class="module-toolbar users-toolbar">
      <h3>用户管理</h3>
      <div class="toolbar-extra">
        <el-button type="primary" @click="openCreateUser">新建用户</el-button>
      </div>
    </div>
    <table class="simple-table users-table">
      <thead>
        <tr>
          <th>姓名</th>
          <th>邮箱</th>
          <th>手机号</th>
          <th>状态</th>
          <th style="width: 220px">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="users.length === 0">
          <td colspan="5" class="empty-td">暂无用户</td>
        </tr>
        <tr v-for="u in pagedUsers" :key="u.id">
          <td>
            <div class="user-cell">
              <img
                class="user-cell-avatar"
                :src="resolveAvatarUrl(u.avatar, u.name)"
                alt="avatar"
                @error="(e: any) => { e.target.src = resolveAvatarUrl('', u.name) }"
              />
              <div class="user-cell-meta">
                <div class="user-cell-name">{{ u.name }}</div>
                <div class="user-cell-sub">{{ u.email }}</div>
              </div>
            </div>
          </td>
          <td>{{ u.email }}</td>
          <td>{{ u.phone || '-' }}</td>
          <td>
            <el-tag size="small" :type="u.active ? 'success' : 'info'">
              {{ u.active ? '启用' : '冻结' }}
            </el-tag>
          </td>
          <td>
            <div class="action-group">
              <button class="action-btn action-edit" @click="openEditUser(u)">编辑</button>
              <button
                class="action-btn action-delete"
                :class="{ disabled: String((u as any).role || '').toLowerCase() === 'admin' }"
                :disabled="String((u as any).role || '').toLowerCase() === 'admin'"
                @click="
                  String((u as any).role || '').toLowerCase() !== 'admin' && removeUser(u)
                "
              >
                删除
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="pager">
      <el-pagination
        background
        small
        :current-page="userPage"
        :page-size="userPageSize"
        :page-sizes="userPageSizeOptions"
        :total="users.length"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="onUserPaginationSizeChange"
        @current-change="onUserPaginationCurrentChange"
      />
    </div>

    <el-dialog
      v-model="userDialogVisible"
      :title="editingUserId ? '编辑用户' : '新建用户'"
      width="640px"
    >
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
  </div>
</template>
