<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listRoles, createRole, updateRoleById, deleteRoleById } from '../../api/user'
import type { Role } from '../../api/types'

/** 预置角色标识名集合（与后端 model.IsPresetSystemRole 保持一致） */
const PRESET_ROLES = new Set(['admin', 'manager', 'tester', 'reviewer', 'developer', 'readonly'])

/** 角色对应的主题色 */
const ROLE_COLORS: Record<string, string> = {
  admin: '#ef4444',
  manager: '#f59e0b',
  tester: '#3b82f6',
  reviewer: '#22c55e',
  readonly: '#6b7280',
  developer: '#8b5cf6',
}
const DEFAULT_COLOR = '#6366f1'

function getRoleColor(name: string) {
  return ROLE_COLORS[name.toLowerCase()] || DEFAULT_COLOR
}

const roles = ref<Role[]>([])
const rolesLoading = ref(false)
const roleDialogVisible = ref(false)
const editingRoleId = ref<number | null>(null)
const savingRole = ref(false)

const roleForm = reactive({
  name: '',
  display_name: '',
  description: '',
})

/** 判断是否为预置角色 */
function isPresetRole(name: string) {
  return PRESET_ROLES.has(name.toLowerCase())
}

/** 当前编辑的角色是否为预置角色（用于禁用 name 输入框） */
const editingIsPreset = computed(() => {
  if (!editingRoleId.value) return false
  const role = roles.value.find((r) => r.id === editingRoleId.value)
  return role ? isPresetRole(role.name) : false
})

/* ── 统计数据 ── */
const totalRoles = computed(() => roles.value.length)
const presetCount = computed(() => roles.value.filter((r) => isPresetRole(r.name)).length)
const customCount = computed(() => totalRoles.value - presetCount.value)
const totalAssignedUsers = computed(() => roles.value.reduce((sum, r) => sum + (r.user_count ?? 0), 0))

async function loadRoles() {
  rolesLoading.value = true
  try {
    roles.value = await listRoles()
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

/** 删除角色（预置角色不可删，有关联用户的角色不可删） */
async function removeRole(row: Role) {
  try {
    await ElMessageBox.confirm(`确认删除角色【${row.display_name || row.name}】？`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await deleteRoleById(row.id)
    ElMessage.success('角色删除成功')
    await loadRoles()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '删除角色失败')
  }
}

onMounted(() => loadRoles())
</script>

<template>
  <div class="rm-root" v-loading="rolesLoading">
    <!-- 页面顶栏 -->
    <div class="rm-header">
      <h2 class="rm-title">角色管理</h2>
      <el-button type="primary" class="rm-create-btn" @click="openCreateRole">
        + 新建角色
      </el-button>
    </div>

    <!-- 主内容区：列表 + 侧栏 -->
    <div class="rm-body">
      <!-- 左侧角色列表 -->
      <div class="rm-list">
        <div
          v-for="role in roles"
          :key="role.id"
          class="rm-role-item"
          :style="{ '--accent': getRoleColor(role.name) }"
        >
          <div class="rm-role-accent"></div>
          <div class="rm-role-content">
            <div class="rm-role-top">
              <span class="rm-role-display">{{ role.display_name || role.name }}</span>
              <el-tag
                v-if="isPresetRole(role.name)"
                size="small"
                type="warning"
                effect="plain"
                class="rm-preset-tag"
              >
                预置
              </el-tag>
              <code class="rm-role-code">{{ role.name }}</code>
            </div>
            <div class="rm-role-desc">{{ role.description || '暂无描述' }}</div>
          </div>
          <div class="rm-role-users">
            <span class="rm-user-count" :class="{ 'rm-user-count--active': (role.user_count ?? 0) > 0 }">
              {{ role.user_count ?? 0 }}
            </span>
            <span class="rm-user-label">用户</span>
          </div>
          <div class="rm-role-actions">
            <button class="rm-action-btn rm-action-edit" @click="openEditRole(role)">编辑</button>
            <button
              class="rm-action-btn rm-action-delete"
              :disabled="isPresetRole(role.name)"
              @click="removeRole(role)"
            >
              删除
            </button>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="!rolesLoading && roles.length === 0" class="rm-empty">暂无角色</div>
      </div>

      <!-- 右侧统计面板 -->
      <div class="rm-sidebar">
        <div class="rm-stat-card">
          <div class="rm-stat-title">角色概览</div>

          <!-- 环形图 -->
          <div class="rm-ring-wrapper">
            <svg viewBox="0 0 120 120" class="rm-ring-svg">
              <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="12" />
              <circle
                cx="60" cy="60" r="48"
                fill="none"
                stroke="url(#ringGrad)"
                stroke-width="12"
                stroke-linecap="round"
                :stroke-dasharray="`${presetCount / Math.max(totalRoles, 1) * 301.6} 301.6`"
                transform="rotate(-90 60 60)"
              />
              <defs>
                <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#8b5cf6" />
                  <stop offset="100%" stop-color="#3b82f6" />
                </linearGradient>
              </defs>
            </svg>
            <div class="rm-ring-center">
              <span class="rm-ring-number">{{ totalRoles }}</span>
              <span class="rm-ring-label">总角色</span>
            </div>
          </div>

          <!-- 指标行 -->
          <div class="rm-stat-rows">
            <div class="rm-stat-row">
              <span class="rm-stat-dot" style="background: #8b5cf6"></span>
              <span class="rm-stat-key">预置角色</span>
              <span class="rm-stat-val">{{ presetCount }}</span>
            </div>
            <div class="rm-stat-row">
              <span class="rm-stat-dot" style="background: #3b82f6"></span>
              <span class="rm-stat-key">自定义角色</span>
              <span class="rm-stat-val">{{ customCount }}</span>
            </div>
          </div>
        </div>

        <div class="rm-stat-card rm-users-card">
          <div class="rm-stat-title">已分配用户</div>
          <div class="rm-big-number">{{ totalAssignedUsers }}</div>
          <div class="rm-big-label">累计关联用户数</div>
        </div>
      </div>
    </div>

    <!-- 创建/编辑角色弹窗 -->
    <el-dialog
      v-model="roleDialogVisible"
      :title="editingRoleId ? '编辑角色' : '新建角色'"
      width="520px"
    >
      <el-form label-position="top">
        <el-form-item label="角色标识名（英文，唯一）">
          <el-input
            v-model="roleForm.name"
            :disabled="editingIsPreset"
            placeholder="如 qa_lead"
          />
          <div v-if="editingIsPreset" class="form-hint">预置角色标识名不可修改</div>
        </el-form-item>
        <el-form-item label="显示名称（中文）">
          <el-input v-model="roleForm.display_name" placeholder="如 QA 负责人" />
        </el-form-item>
        <el-form-item label="角色描述">
          <el-input v-model="roleForm.description" type="textarea" :rows="3" placeholder="角色职责说明" />
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
/* ── 页面根容器 ── */
.rm-root {
  padding: 28px 32px;
  min-height: 100%;
}

/* ── 顶栏 ── */
.rm-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.rm-title {
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  margin: 0;
}
.rm-create-btn {
  border-radius: 8px;
  font-weight: 600;
}

/* ── 主内容区 ── */
.rm-body {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

/* ── 左侧角色列表 ── */
.rm-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.rm-role-item {
  display: flex;
  align-items: center;
  gap: 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 16px 20px;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}
.rm-role-item:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateY(-1px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

/* 左侧彩色条 */
.rm-role-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--accent);
  border-radius: 4px 0 0 4px;
}

/* 角色主内容 */
.rm-role-content {
  flex: 1;
  min-width: 0;
  padding-left: 4px;
}
.rm-role-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.rm-role-display {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
}
.rm-preset-tag {
  flex-shrink: 0;
  font-size: 10px;
}
.rm-role-code {
  font-size: 11px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.05);
  padding: 1px 6px;
  border-radius: 4px;
}
.rm-role-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 用户数 */
.rm-role-users {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  min-width: 48px;
}
.rm-user-count {
  font-size: 18px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.3);
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
}
.rm-user-count--active {
  color: #8b5cf6;
  background: rgba(139, 92, 246, 0.1);
}
.rm-user-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
}

/* 操作按钮 */
.rm-role-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.rm-action-btn {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.15s;
}
.rm-action-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.rm-action-edit:hover {
  border-color: rgba(139, 92, 246, 0.4);
  color: #a78bfa;
}
.rm-action-delete:hover {
  border-color: rgba(239, 68, 68, 0.4);
  color: #f87171;
}
.rm-action-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.rm-action-btn:disabled:hover {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.6);
  border-color: rgba(255, 255, 255, 0.1);
}

/* 空状态 */
.rm-empty {
  text-align: center;
  padding: 48px 0;
  color: rgba(255, 255, 255, 0.3);
  font-size: 14px;
}

/* ── 右侧统计面板 ── */
.rm-sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.rm-stat-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 20px;
}
.rm-stat-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 16px;
}

/* 环形图 */
.rm-ring-wrapper {
  position: relative;
  width: 120px;
  height: 120px;
  margin: 0 auto 16px;
}
.rm-ring-svg {
  width: 100%;
  height: 100%;
}
.rm-ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.rm-ring-number {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}
.rm-ring-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 2px;
}

/* 统计行 */
.rm-stat-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rm-stat-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rm-stat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.rm-stat-key {
  flex: 1;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}
.rm-stat-val {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}

/* 已分配用户卡片 */
.rm-users-card {
  text-align: center;
}
.rm-big-number {
  font-size: 40px;
  font-weight: 800;
  background: linear-gradient(135deg, #8b5cf6, #3b82f6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1.1;
  margin-bottom: 4px;
}
.rm-big-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
}

/* 弹窗提示 */
.form-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 4px;
}
</style>
