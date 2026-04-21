<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { listRoles, createRole, updateRoleById, listUsers } from '../../api/user'
import type { Role, User } from '../../api/types'
import { useAuthStore } from '../../stores/auth'

const authStore = useAuthStore()

/** 预置角色标识名集合（与后端 model.IsPresetSystemRole 保持一致） */
const PRESET_ROLES = new Set(['admin', 'manager', 'tester', 'reviewer', 'developer', 'readonly'])

/** 角色对应的图标（Material Symbols） */
const ROLE_ICONS: Record<string, string> = {
  admin: 'admin_panel_settings',
  manager: 'architecture',
  tester: 'touch_app',
  reviewer: 'visibility',
  readonly: 'lock',
  developer: 'bolt',
}

/** 角色对应的假数据权限标签 */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['用户管理', 'API 访问', '系统配置'],
  manager: ['项目管理', '成员分配', '配置模块'],
  tester: ['用例执行', '缺陷提交', '截图上传'],
  reviewer: ['用例审核', '状态修改', '评审报告'],
  readonly: ['数据查看', '报表导出'],
  developer: ['用例查看', '缺陷认领', '日志查看'],
}

/** 角色对应的用户数 — 从真实用户列表统计 */
const allUsers = ref<User[]>([])

const roles = ref<Role[]>([])
const rolesLoading = ref(false)
const roleDialogVisible = ref(false)
const editingRoleId = ref<number | null>(null)
const savingRole = ref(false)

// ── 用户抽屉 ──
const drawerVisible = ref(false)
const drawerRole = ref<Role | null>(null)
const drawerSearch = ref('')

function roleUserCountMap(): Record<string, number> {
  const map: Record<string, number> = {}
  for (const u of allUsers.value) {
    const key = (u.role || '').toLowerCase()
    map[key] = (map[key] || 0) + 1
  }
  return map
}

/** 抽屉中展示的真实用户列表 */
const drawerUsers = computed(() => {
  if (!drawerRole.value) return []
  const roleName = drawerRole.value.name.toLowerCase()
  const all = allUsers.value.filter((u) => (u.role || '').toLowerCase() === roleName)
  const kw = drawerSearch.value.trim().toLowerCase()
  if (!kw) return all
  return all.filter(
    (u) => (u.name || '').toLowerCase().includes(kw) || (u.email || '').toLowerCase().includes(kw),
  )
})

function openUserDrawer(role: Role) {
  drawerRole.value = role
  drawerSearch.value = ''
  drawerVisible.value = true
}

function closeUserDrawer() {
  drawerVisible.value = false
}

function getAvatarUrl(name: string) {
  const seedSource = name.split('(')[0] ?? 'User'
  return authStore.fallbackAvatarUrl(seedSource.trim() || 'User')
}

const roleForm = reactive({
  name: '',
  display_name: '',
  description: '',
})

/** 判断是否为预置角色 */
function isPresetRole(name: string) {
  return PRESET_ROLES.has(name.toLowerCase())
}

/** 当前编辑的角色是否为预置角色 */
const editingIsPreset = computed(() => {
  if (!editingRoleId.value) return false
  const role = roles.value.find((r) => r.id === editingRoleId.value)
  return role ? isPresetRole(role.name) : false
})

/* ── 统计数据 ── */
const totalRoles = computed(() => roles.value.length)
const totalAssignedUsers = computed(() => allUsers.value.length)

/** 获取角色的图标名 */
function getRoleIcon(name: string): string {
  return ROLE_ICONS[name.toLowerCase()] || 'shield_person'
}

/** 获取角色的权限标签 */
function getRolePerms(name: string): string[] {
  return ROLE_PERMISSIONS[name.toLowerCase()] || ['自定义权限']
}

/** 获取角色的用户数 */
function getRoleUserCount(role: Role): number {
  const map = roleUserCountMap()
  return map[role.name.toLowerCase()] || 0
}

async function loadRoles() {
  rolesLoading.value = true
  try {
    const [rolesData, usersData] = await Promise.all([listRoles(), listUsers()])
    roles.value = rolesData
    allUsers.value = usersData
  } finally {
    rolesLoading.value = false
  }
}

/** 打开创建角色弹窗，重置表单 */
function openCreateRole() {
  editingRoleId.value = null
  roleForm.name = ''
  roleForm.display_name = ''
  roleForm.description = ''
  roleDialogVisible.value = true
}

/** 打开编辑角色弹窗，回填已有数据 */
function openEditRole(row: Role) {
  editingRoleId.value = row.id
  roleForm.name = row.name
  roleForm.display_name = row.display_name || ''
  roleForm.description = row.description || ''
  roleDialogVisible.value = true
}

/** 提交创建/编辑角色 */
async function submitRole() {
  if (!roleForm.name.trim()) {
    ElMessage.warning('角色标识名不能为空')
    return
  }
  savingRole.value = true
  try {
    if (editingRoleId.value) {
      const payload: any = {
        display_name: roleForm.display_name.trim(),
        description: roleForm.description.trim(),
      }
      if (!editingIsPreset.value) {
        payload.name = roleForm.name.trim()
      }
      await updateRoleById(editingRoleId.value, payload)
      ElMessage.success('角色更新成功')
    } else {
      await createRole({
        name: roleForm.name.trim(),
        display_name: roleForm.display_name.trim(),
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

onMounted(() => loadRoles())
</script>

<template>
  <div v-loading="rolesLoading" class="rm-root">
    <!-- Header Section -->
    <div class="rm-header">
      <div class="rm-header-left">
        <h2 class="rm-title">角色管理</h2>
        <p class="rm-subtitle">配置和分配组织内的细粒度权限。</p>
      </div>
      <div class="rm-header-right">
        <div class="rm-stats-panel">
          <div class="rm-stat-item">
            <span class="rm-stat-label">总角色</span>
            <span class="rm-stat-number rm-stat-primary">{{ totalRoles }}</span>
          </div>
          <div class="rm-stat-divider"></div>
          <div class="rm-stat-item">
            <span class="rm-stat-label">活跃用户</span>
            <span class="rm-stat-number rm-stat-secondary">{{ totalAssignedUsers }}</span>
          </div>
          <button class="rm-add-btn" @click="openCreateRole">
            <span class="rm-add-icon">+</span>
            新增角色
          </button>
        </div>
      </div>
    </div>

    <!-- Roles Bento Grid -->
    <div class="rm-grid">
      <div v-for="role in roles" :key="role.id" class="rm-card">
        <!-- Hover accent bar -->
        <div class="rm-card-accent"></div>

        <!-- Card top: icon + user badge -->
        <div class="rm-card-top">
          <div class="rm-card-icon">
            <span class="material-symbols-outlined rm-icon-filled">
              {{ getRoleIcon(role.name) }}
            </span>
          </div>
          <div class="rm-badge">
            <span class="rm-badge-icon">👥</span>
            <span class="rm-badge-text">{{ getRoleUserCount(role) }} 用户</span>
          </div>
        </div>

        <!-- Role name + description -->
        <h3 class="rm-card-name">{{ role.display_name || role.name }}</h3>
        <p class="rm-card-desc">{{ role.description || '暂无描述' }}</p>

        <!-- Permission tags -->
        <div class="rm-perm-tags">
          <span v-for="perm in getRolePerms(role.name)" :key="perm" class="rm-perm-tag">
            {{ perm }}
          </span>
        </div>

        <!-- Action buttons -->
        <div class="rm-card-actions">
          <button class="rm-btn-edit" @click="openEditRole(role)">编辑权限</button>
          <button class="rm-btn-view" @click="openUserDrawer(role)">展示用户</button>
        </div>
      </div>

      <!-- Create Custom Role Card -->
      <div class="rm-card rm-card-empty" @click="openCreateRole">
        <div class="rm-empty-icon">
          <span class="rm-empty-plus">+</span>
        </div>
        <p class="rm-empty-title">创建自定义角色</p>
        <p class="rm-empty-desc">定义一组独特的权限以满足特定需求。</p>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!rolesLoading && roles.length === 0" class="rm-empty-state">暂无角色</div>

    <!-- 用户列表抽屉 -->
    <teleport to="body">
      <transition name="drawer-fade">
        <div v-if="drawerVisible" class="drawer-overlay" @click="closeUserDrawer"></div>
      </transition>
      <transition name="drawer-slide">
        <aside v-if="drawerVisible" class="drawer-panel">
          <!-- Header -->
          <div class="drawer-header">
            <div class="drawer-title-area">
              <div class="drawer-title-row">
                <span class="material-symbols-outlined rm-icon-filled drawer-title-icon">
                  {{ getRoleIcon(drawerRole?.name || '') }}
                </span>
                <h2 class="drawer-title">{{ drawerRole?.display_name || drawerRole?.name }}</h2>
              </div>
              <p class="drawer-subtitle">用户列表 ({{ drawerUsers.length }})</p>
            </div>
            <button class="drawer-close" @click="closeUserDrawer">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <!-- Search -->
          <div class="drawer-search">
            <span class="material-symbols-outlined drawer-search-icon">search</span>
            <input
              v-model="drawerSearch"
              class="drawer-search-input"
              placeholder="搜索用户姓名或邮箱..."
            />
          </div>

          <!-- User list -->
          <div class="drawer-list">
            <div v-for="(user, idx) in drawerUsers" :key="idx" class="drawer-user-item">
              <div class="drawer-user-info">
                <div class="drawer-avatar">
                  <img :src="getAvatarUrl(user.name)" :alt="user.name" />
                </div>
                <div>
                  <div class="drawer-user-name">{{ user.name }}</div>
                  <div class="drawer-user-email">{{ user.email }}</div>
                </div>
              </div>
            </div>
            <div v-if="drawerUsers.length === 0" class="drawer-empty">暂无匹配用户</div>
          </div>

          <!-- Footer -->
          <div class="drawer-footer">
            <button class="drawer-footer-btn">
              <span class="material-symbols-outlined" style="font-size: 20px">person_add</span>
              添加新成员
            </button>
          </div>
        </aside>
      </transition>
    </teleport>

    <!-- 创建/编辑角色弹窗 -->
    <el-dialog
      v-model="roleDialogVisible"
      :title="editingRoleId ? '编辑角色' : '新建角色'"
      width="520px"
    >
      <el-form label-position="top">
        <el-form-item label="角色标识名（英文，唯一）">
          <el-input v-model="roleForm.name" :disabled="editingIsPreset" placeholder="如 qa_lead" />
          <div v-if="editingIsPreset" class="form-hint">预置角色标识名不可修改</div>
        </el-form-item>
        <el-form-item label="显示名称（中文）">
          <el-input v-model="roleForm.display_name" placeholder="如 QA 负责人" />
        </el-form-item>
        <el-form-item label="角色描述">
          <el-input
            v-model="roleForm.description"
            type="textarea"
            :rows="3"
            placeholder="角色职责说明"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingRole" @click="submitRole">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ── Google Material Symbols ── */
@import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');

.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-smoothing: antialiased;
}
.rm-icon-filled {
  font-variation-settings:
    'FILL' 1,
    'wght' 300,
    'GRAD' 0,
    'opsz' 24;
}

/* ── Root ── */
.rm-root {
  padding: 16px 20px;
  min-height: 100%;
}

/* ── Header ── */
.rm-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 40px;
  gap: 24px;
  flex-wrap: wrap;
}
.rm-header-left {
  flex: 1;
  min-width: 200px;
}
.rm-title {
  font-size: 28px;
  font-weight: 600;
  color: #e1e1f2;
  margin: 0 0 6px 0;
  letter-spacing: -0.5px;
}
.rm-subtitle {
  font-size: 14px;
  color: #ccc3d8;
  margin: 0;
  font-weight: 300;
}
.rm-header-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

/* Stats panel — glass container holding stats + button */
.rm-stats-panel {
  display: flex;
  align-items: center;
  gap: 32px;
  padding: 16px 24px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(74, 68, 85, 0.15);
}
.rm-stat-item {
  text-align: center;
}
.rm-stat-label {
  display: block;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: #958da1;
  margin-bottom: 4px;
}
.rm-stat-number {
  font-size: 24px;
  font-weight: 700;
}
.rm-stat-primary {
  color: #d2bbff;
}
.rm-stat-secondary {
  color: #adc6ff;
}
.rm-stat-divider {
  width: 1px;
  height: 32px;
  background: rgba(74, 68, 85, 0.2);
}

/* Add button — inside the glass panel */
.rm-add-btn {
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
.rm-add-btn:hover {
  filter: brightness(1.15);
}
.rm-add-btn:active {
  transform: scale(0.95);
}
.rm-add-icon {
  font-size: 16px;
  font-weight: 700;
}

/* ── Grid ── */
.rm-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

/* ── Card ── */
.rm-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 24px;
  border-radius: 16px;
  background: #191b26;
  border: 1px solid rgba(74, 68, 85, 0.15);
  transition: all 0.3s ease;
  overflow: hidden;
}
.rm-card:hover {
  background: #272935;
}

/* Accent bar */
.rm-card-accent {
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 0;
  background: #adc6ff;
  border-radius: 16px 0 0 16px;
  transition: height 0.5s ease;
}
.rm-card:hover .rm-card-accent {
  height: 100%;
}

/* Card top row */
.rm-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}
.rm-card-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: rgba(210, 187, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #d2bbff;
}
.rm-card-icon .material-symbols-outlined {
  font-size: 28px;
}

/* User badge */
.rm-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-radius: 9999px;
  background: rgba(173, 198, 255, 0.1);
  border: 1px solid rgba(173, 198, 255, 0.2);
  color: #adc6ff;
}
.rm-badge-icon {
  font-size: 12px;
}
.rm-badge-text {
  font-size: 12px;
  font-weight: 600;
}

/* Card name & desc */
.rm-card-name {
  font-size: 18px;
  font-weight: 600;
  color: #e1e1f2;
  margin: 0 0 4px 0;
}
.rm-card-desc {
  font-size: 12px;
  color: #958da1;
  margin: 0 0 20px 0;
  line-height: 1.5;
}

/* Permission tags */
.rm-perm-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 24px;
}
.rm-perm-tag {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 4px 8px;
  border-radius: 4px;
  background: #1d1f2b;
  color: #ccc3d8;
  border: 1px solid rgba(255, 255, 255, 0.05);
  font-weight: 500;
}

/* Card actions */
.rm-card-actions {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}
.rm-btn-edit {
  flex: 1;
  padding: 8px 0;
  font-size: 12px;
  font-weight: 600;
  border-radius: 8px;
  border: none;
  background: #373845;
  color: #e1e1f2;
  cursor: pointer;
  transition: background 0.2s;
}
.rm-btn-edit:hover {
  background: #323440;
}
.rm-btn-view {
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 8px;
  border: 1px solid rgba(74, 68, 85, 0.3);
  background: transparent;
  color: #958da1;
  cursor: pointer;
  transition: all 0.2s;
}
.rm-btn-view:hover {
  color: #e1e1f2;
  background: rgba(255, 255, 255, 0.05);
}

/* ── Empty state card ── */
.rm-card-empty {
  border: 2px dashed rgba(74, 68, 85, 0.2);
  background: transparent;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 32px;
  min-height: 240px;
  transition: all 0.3s;
}
.rm-card-empty:hover {
  background: rgba(255, 255, 255, 0.02);
  border-color: rgba(124, 58, 237, 0.4);
}
.rm-empty-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #1d1f2b;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  transition: all 0.3s;
}
.rm-card-empty:hover .rm-empty-icon {
  transform: scale(1.1);
}
.rm-empty-plus {
  font-size: 24px;
  color: #958da1;
  transition: color 0.3s;
}
.rm-card-empty:hover .rm-empty-plus {
  color: #d2bbff;
}
.rm-empty-title {
  font-size: 15px;
  font-weight: 600;
  color: #ccc3d8;
  margin: 0 0 8px 0;
  transition: color 0.3s;
}
.rm-card-empty:hover .rm-empty-title {
  color: #e1e1f2;
}
.rm-empty-desc {
  font-size: 12px;
  color: #958da1;
  text-align: center;
  max-width: 180px;
  margin: 0;
}

/* ── Global empty ── */
.rm-empty-state {
  text-align: center;
  padding: 48px 0;
  color: rgba(255, 255, 255, 0.3);
  font-size: 14px;
}

/* ── Form hint ── */
.form-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 4px;
}
</style>

<!-- Drawer 使用 teleport 到 body，必须单独放在 unscoped style 中 -->
<style>
/* ══════════════════════════════════════
   用户抽屉 Drawer
   ══════════════════════════════════════ */

/* Overlay */
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 19, 30, 0.8);
  backdrop-filter: blur(4px);
  z-index: 2000;
}

/* Panel */
.drawer-panel {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: 480px;
  background: #191b26;
  z-index: 2001;
  display: flex;
  flex-direction: column;
  border-left: 1px solid rgba(74, 68, 85, 0.1);
  box-shadow: 0 0 60px -10px rgba(0, 0, 0, 0.6);
}

/* Header */
.drawer-header {
  padding: 32px 32px 24px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.drawer-title-area {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.drawer-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.drawer-title-icon {
  color: #d2bbff;
  font-size: 22px;
}
.drawer-title {
  font-size: 22px;
  font-weight: 600;
  color: #e1e1f2;
  margin: 0;
  letter-spacing: -0.3px;
}
.drawer-subtitle {
  font-size: 13px;
  color: #ccc3d8;
  margin: 0;
}
.drawer-close {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #ccc3d8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.drawer-close:hover {
  background: #323440;
  color: #fff;
}

/* Search */
.drawer-search {
  padding: 0 32px;
  margin-bottom: 24px;
  position: relative;
}
.drawer-search-icon {
  position: absolute;
  left: 44px;
  top: 50%;
  transform: translateY(-50%);
  color: #ccc3d8;
  font-size: 18px;
}
.drawer-search-input {
  width: 100%;
  background: #0c0e18;
  border: none;
  border-radius: 10px;
  padding: 10px 12px 10px 40px;
  font-size: 13px;
  color: #e1e1f2;
  outline: none;
  transition: box-shadow 0.2s;
}
.drawer-search-input::placeholder {
  color: #958da1;
}
.drawer-search-input:focus {
  box-shadow: 0 0 0 1px rgba(210, 187, 255, 0.4);
}

/* User list */
.drawer-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 32px 40px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.drawer-user-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-radius: 12px;
  background: #1d1f2b;
  border: 1px solid rgba(74, 68, 85, 0.05);
  transition: all 0.2s;
}
.drawer-user-item:hover {
  border-color: rgba(74, 68, 85, 0.2);
}
.drawer-user-info {
  display: flex;
  align-items: center;
  gap: 14px;
}
.drawer-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba(124, 58, 237, 0.2);
  flex-shrink: 0;
}
.drawer-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.drawer-user-name {
  font-size: 14px;
  font-weight: 500;
  color: #e1e1f2;
}
.drawer-user-email {
  font-size: 12px;
  color: #ccc3d8;
  font-weight: 300;
}
.drawer-empty {
  text-align: center;
  padding: 32px 0;
  color: rgba(255, 255, 255, 0.3);
  font-size: 13px;
}

/* Footer */
.drawer-footer {
  padding: 24px 32px;
  border-top: 1px solid rgba(74, 68, 85, 0.1);
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  margin-top: auto;
}
.drawer-footer-btn {
  width: 100%;
  padding: 14px 0;
  border-radius: 12px;
  border: none;
  background: #7c3aed;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 4px 20px rgba(124, 58, 237, 0.3);
  transition: all 0.2s;
}
.drawer-footer-btn:hover {
  filter: brightness(1.1);
}

/* Transitions */
.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.3s ease;
}
.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(100%);
}
</style>
