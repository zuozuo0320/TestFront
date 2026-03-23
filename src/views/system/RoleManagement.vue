<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listRoles, createRole, updateRoleById, deleteRoleById } from '../../api/user'
import type { Role } from '../../api/types'

/** 预置角色标识名集合（与后端 model.IsPresetSystemRole 保持一致） */
const PRESET_ROLES = new Set(['admin', 'manager', 'tester', 'reviewer', 'developer', 'readonly'])

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
      // 编辑时：预置角色只传 display_name 和 description，不传 name
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
  <div class="module-card" v-loading="rolesLoading">
    <div class="module-toolbar">
      <h3>角色管理</h3>
      <el-button type="primary" @click="openCreateRole">新建角色</el-button>
    </div>

    <el-table :data="roles" stripe style="width: 100%" empty-text="暂无角色">
      <el-table-column label="显示名称" min-width="140">
        <template #default="{ row }">
          <div class="role-name-cell">
            <span class="role-display">{{ row.display_name || row.name }}</span>
            <el-tag v-if="isPresetRole(row.name)" size="small" type="warning" effect="plain" class="preset-tag">
              预置
            </el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="标识名" prop="name" width="120">
        <template #default="{ row }">
          <code class="role-code">{{ row.name }}</code>
        </template>
      </el-table-column>
      <el-table-column label="描述" prop="description" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ row.description || '-' }}</template>
      </el-table-column>
      <el-table-column label="关联用户" width="100" align="center">
        <template #default="{ row }">
          <span>{{ row.user_count ?? 0 }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link size="small" @click="openEditRole(row)">编辑</el-button>
          <el-button
            link
            size="small"
            type="danger"
            :disabled="isPresetRole(row.name)"
            @click="removeRole(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

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
.module-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.role-name-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}
.role-display {
  font-weight: 500;
}
.preset-tag {
  flex-shrink: 0;
}
.role-code {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 6px;
  border-radius: 3px;
}
.form-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 4px;
}
</style>
