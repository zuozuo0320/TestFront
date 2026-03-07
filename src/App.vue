<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { listProjects, listTestCases, loginByEmail, type LoginResp } from './api'

type Project = {
  id: number
  name: string
  description: string
}

type TestCase = {
  id: number
  title: string
  steps: string
  priority: string
  project_id: number
}

const loading = ref(false)
const loginLoading = ref(false)
const email = ref('tester@testpilot.local')
const currentUser = ref<LoginResp['user'] | null>(null)
const projects = ref<Project[]>([])
const selectedProjectId = ref<number | null>(null)
const testcases = ref<TestCase[]>([])

async function doLogin() {
  if (!email.value.trim()) {
    ElMessage.warning('请输入邮箱')
    return
  }

  loginLoading.value = true
  try {
    const data = await loginByEmail(email.value.trim())
    localStorage.setItem('tp-user-id', String(data.user_id))
    currentUser.value = data.user
    ElMessage.success(`登录成功：${data.user.name}`)
    await loadProjectsAndCases()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || err?.message || '登录失败')
  } finally {
    loginLoading.value = false
  }
}

async function loadProjectsAndCases() {
  loading.value = true
  try {
    const result = await listProjects()
    projects.value = result
    const first = projects.value[0]
    if (!selectedProjectId.value && first) {
      selectedProjectId.value = first.id
    }
    await loadTestCases()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || err?.message || '加载项目失败')
  } finally {
    loading.value = false
  }
}

async function loadTestCases() {
  if (!selectedProjectId.value) {
    testcases.value = []
    return
  }

  loading.value = true
  try {
    testcases.value = await listTestCases(selectedProjectId.value)
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || err?.message || '加载测试用例失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  const userId = localStorage.getItem('tp-user-id')
  if (userId) {
    // 只做轻恢复，避免阻塞首次渲染
    await loadProjectsAndCases()
  }
})
</script>

<template>
  <div class="page">
    <el-card class="card">
      <template #header>
        <div class="header-row">
          <div>
            <h2>TestPilot 登录 & 测试用例列表</h2>
            <p>先把最核心的登录和用例列表跑通</p>
          </div>
          <el-tag v-if="currentUser" type="success">{{ currentUser.name }} / {{ currentUser.role }}</el-tag>
          <el-tag v-else type="info">未登录</el-tag>
        </div>
      </template>

      <el-form inline>
        <el-form-item label="邮箱登录">
          <el-input v-model="email" style="width: 280px" placeholder="tester@testpilot.local" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loginLoading" @click="doLogin">登录</el-button>
        </el-form-item>
      </el-form>

      <el-divider />

      <div class="toolbar">
        <el-select v-model="selectedProjectId" placeholder="选择项目" style="width: 320px" :disabled="!currentUser" @change="loadTestCases">
          <el-option v-for="p in projects" :key="p.id" :label="`${p.name} (#${p.id})`" :value="p.id" />
        </el-select>
        <el-button :disabled="!currentUser" :loading="loading" @click="loadTestCases">刷新测试用例</el-button>
      </div>

      <el-table :data="testcases" border stripe v-loading="loading" style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="title" label="标题" min-width="260" />
        <el-table-column prop="priority" label="优先级" width="120" />
        <el-table-column prop="steps" label="步骤" min-width="420" show-overflow-tooltip />
      </el-table>
    </el-card>
  </div>
</template>
