<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Edit, Delete, FolderChecked, Refresh, Search } from '@element-plus/icons-vue'
import {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  archiveProject,
  unarchiveProject,
} from '../../api/project'
import type { Project } from '../../api/types'

const SEED_PROJECT_NAME = 'AiSight Demo'

const projects = ref<Project[]>([])
const appLoading = ref(false)
const searchKeyword = ref('')
const statusFilter = ref<'' | 'active' | 'archived'>('')

// Dialog
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingProjectId = ref<number | null>(null)
const savingProject = ref(false)
const projectForm = reactive({ name: '', description: '' })

// Filtered & sorted list
const filteredProjects = computed(() => {
  let list = projects.value
  if (statusFilter.value) {
    list = list.filter((p) => p.status === statusFilter.value)
  }
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    list = list.filter((p) => p.name.toLowerCase().includes(kw))
  }
  // Sort: active first, then by created_at desc
  return [...list].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  })
})

function isSeedProject(p: Project) {
  return p.name === SEED_PROJECT_NAME
}

async function loadProjects() {
  appLoading.value = true
  try {
    projects.value = await listProjects()
  } finally {
    appLoading.value = false
  }
}

function openCreateProject() {
  dialogMode.value = 'create'
  editingProjectId.value = null
  projectForm.name = ''
  projectForm.description = ''
  dialogVisible.value = true
}

function openEditProject(p: Project) {
  dialogMode.value = 'edit'
  editingProjectId.value = p.id
  projectForm.name = p.name
  projectForm.description = p.description || ''
  dialogVisible.value = true
}

async function submitProject() {
  const name = projectForm.name.trim()
  if (!name) {
    ElMessage.warning('项目名称不能为空')
    return
  }
  savingProject.value = true
  try {
    if (dialogMode.value === 'create') {
      await createProject({
        name,
        description: projectForm.description.trim() || undefined,
      })
      ElMessage.success('项目创建成功')
    } else {
      await updateProject(editingProjectId.value!, {
        name,
        description: projectForm.description.trim() || undefined,
      })
      ElMessage.success('项目更新成功')
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

async function onRestore(p: Project) {
  try {
    await unarchiveProject(p.id)
    ElMessage.success('项目已恢复')
    await loadProjects()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '恢复失败')
  }
}

async function onDelete(p: Project) {
  try {
    await ElMessageBox.confirm(
      `确定要删除项目「${p.name}」吗？此操作不可恢复。`,
      '删除确认',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'error' },
    )
    await deleteProject(p.id)
    ElMessage.success('项目已删除')
    await loadProjects()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e?.response?.data?.error || '删除失败')
    }
  }
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

onMounted(() => loadProjects())
</script>

<template>
  <div class="module-card" v-loading="appLoading">
    <div class="module-toolbar">
      <h3>项目管理</h3>
      <div class="toolbar-right">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索项目名称"
          clearable
          :prefix-icon="Search"
          style="width: 220px"
        />
        <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 130px">
          <el-option label="活跃" value="active" />
          <el-option label="已归档" value="archived" />
        </el-select>
        <el-button type="primary" @click="openCreateProject">新建项目</el-button>
      </div>
    </div>

    <el-table :data="filteredProjects" stripe style="width: 100%" empty-text="暂无项目">
      <el-table-column prop="name" label="项目名称" min-width="180">
        <template #default="{ row }">
          <div class="project-name-cell">
            <span>{{ row.name }}</span>
            <el-tag v-if="isSeedProject(row)" size="small" type="warning" effect="plain" class="seed-tag">种子</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="项目描述" min-width="240" show-overflow-tooltip>
        <template #default="{ row }">{{ row.description || '-' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small" effect="dark">
            {{ row.status === 'active' ? '活跃' : '已归档' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="成员" width="80" align="center">
        <template #default="{ row }">{{ row.member_count ?? 0 }}</template>
      </el-table-column>
      <el-table-column label="用例" width="80" align="center">
        <template #default="{ row }">{{ row.testcase_count ?? 0 }}</template>
      </el-table-column>
      <el-table-column label="创建时间" width="120" align="center">
        <template #default="{ row }">{{ formatDate(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link :icon="Edit" @click="openEditProject(row)">编辑</el-button>
          <el-button
            v-if="row.status === 'active'"
            link
            :icon="FolderChecked"
            :disabled="isSeedProject(row)"
            @click="onArchive(row)"
          >归档</el-button>
          <el-button
            v-else
            link
            :icon="Refresh"
            @click="onRestore(row)"
          >恢复</el-button>
          <el-button
            link
            :icon="Delete"
            type="danger"
            :disabled="isSeedProject(row) || row.status === 'active'"
            @click="onDelete(row)"
          >删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Create / Edit Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新建项目' : '编辑项目'"
      width="520px"
    >
      <el-form label-position="top">
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
  </div>
</template>

<style scoped>
.module-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.project-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.seed-tag {
  flex-shrink: 0;
}
</style>
