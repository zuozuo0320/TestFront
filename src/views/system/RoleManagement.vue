<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listRoles, createRole, updateRoleById, deleteRoleById } from '../../api/user'
import type { Role } from '../../api/types'

const roles = ref<Role[]>([])
const rolesLoading = ref(false)
const roleDialogVisible = ref(false)
const editingRoleId = ref<number | null>(null)
const savingRole = ref(false)

const roleForm = reactive({ name: '', description: '' })

async function loadRoles() {
  rolesLoading.value = true
  try {
    roles.value = await listRoles()
  } finally {
    rolesLoading.value = false
  }
}

function openCreateRole() {
  editingRoleId.value = null
  roleForm.name = ''
  roleForm.description = ''
  roleDialogVisible.value = true
}

function openEditRole(row: Role) {
  editingRoleId.value = row.id
  roleForm.name = row.name
  roleForm.description = row.description || ''
  roleDialogVisible.value = true
}

async function submitRole() {
  if (!roleForm.name.trim()) {
    ElMessage.warning('角色名称不能为空')
    return
  }
  savingRole.value = true
  try {
    if (editingRoleId.value) {
      await updateRoleById(editingRoleId.value, {
        name: roleForm.name.trim(),
        description: roleForm.description.trim(),
      })
      ElMessage.success('角色更新成功')
    } else {
      await createRole({
        name: roleForm.name.trim(),
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

async function removeRole(row: Role) {
  try {
    await ElMessageBox.confirm(`确认删除角色【${row.name}】？`, '删除确认', {
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
    <table class="simple-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>角色名称</th>
          <th>角色描述</th>
          <th style="width: 180px">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="roles.length === 0">
          <td colspan="4" class="empty-td">暂无角色</td>
        </tr>
        <tr v-for="r in roles" :key="r.id">
          <td>{{ r.id }}</td>
          <td>{{ r.name }}</td>
          <td>{{ r.description || '-' }}</td>
          <td>
            <div class="action-group">
              <button class="action-btn action-edit" @click="openEditRole(r)">编辑</button>
              <button class="action-btn action-delete" @click="removeRole(r)">删除</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <el-dialog
      v-model="roleDialogVisible"
      :title="editingRoleId ? '编辑角色' : '新建角色'"
      width="520px"
    >
      <el-form label-position="top">
        <el-form-item label="角色名称"><el-input v-model="roleForm.name" /></el-form-item>
        <el-form-item label="角色描述">
          <el-input v-model="roleForm.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingRole" @click="submitRole">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
