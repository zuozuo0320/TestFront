<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { listProjects, createProject } from '../../api/project'
import type { Project } from '../../api/types'

const projects = ref<Project[]>([])
const selectedProject = ref<number | null>(null)
const appLoading = ref(false)
const projectDialogVisible = ref(false)
const savingProject = ref(false)
const projectForm = reactive({ name: '', description: '' })

async function loadProjects() {
  appLoading.value = true
  try {
    projects.value = await listProjects()
    const first = projects.value[0]
    if (first) {
      const exists = projects.value.some((p) => p.id === selectedProject.value)
      if (!exists) selectedProject.value = first.id
    } else {
      selectedProject.value = null
    }
  } finally {
    appLoading.value = false
  }
}

function openCreateProject() {
  projectForm.name = ''
  projectForm.description = ''
  projectDialogVisible.value = true
}

async function submitProject() {
  const name = projectForm.name.trim()
  if (!name) {
    ElMessage.warning('项目名称不能为空')
    return
  }
  savingProject.value = true
  try {
    const project = await createProject({
      name,
      description: projectForm.description.trim() || undefined,
    })
    ElMessage.success('项目创建成功')
    projectDialogVisible.value = false
    await loadProjects()
    selectedProject.value = project.id
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '创建项目失败')
  } finally {
    savingProject.value = false
  }
}

onMounted(() => loadProjects())
</script>

<template>
  <div class="module-card" v-loading="appLoading">
    <div class="module-toolbar">
      <h3>项目管理</h3>
      <el-button type="primary" @click="openCreateProject">新建项目</el-button>
    </div>
    <table class="simple-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>项目名称</th>
          <th>项目描述</th>
          <th style="width: 180px">联动状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="projects.length === 0">
          <td colspan="4" class="empty-td">暂无项目</td>
        </tr>
        <tr
          v-for="p in projects"
          :key="p.id"
          :class="{ 'project-selected-row': selectedProject === p.id }"
        >
          <td>{{ p.id }}</td>
          <td>{{ p.name }}</td>
          <td>{{ p.description || '-' }}</td>
          <td>
            <el-button
              size="small"
              :type="selectedProject === p.id ? 'primary' : 'default'"
              @click="selectedProject = p.id"
            >
              {{ selectedProject === p.id ? '当前项目' : '设为当前' }}
            </el-button>
          </td>
        </tr>
      </tbody>
    </table>

    <el-dialog v-model="projectDialogVisible" title="新建项目" width="520px">
      <el-form label-position="top">
        <el-form-item label="项目名称">
          <el-input v-model="projectForm.name" maxlength="80" show-word-limit />
        </el-form-item>
        <el-form-item label="项目描述">
          <el-input
            v-model="projectForm.description"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="projectDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingProject" @click="submitProject">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>
