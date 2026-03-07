<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
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

const appLoading = ref(false)
const loginLoading = ref(false)
const loggedIn = ref(false)
const currentUser = ref<LoginResp['user'] | null>(null)

const loginForm = reactive({
  email: 'tester@testpilot.local',
  password: 'TestPilot@2026',
  agree: true,
})

const projects = ref<Project[]>([])
const selectedProjectId = ref<number | null>(null)
const testcases = ref<TestCase[]>([])

async function doLogin() {
  if (!loginForm.email.trim() || !loginForm.password.trim()) {
    ElMessage.warning('请输入账号和密码')
    return
  }
  if (!loginForm.agree) {
    ElMessage.warning('请先勾选服务协议')
    return
  }

  loginLoading.value = true
  try {
    const data = await loginByEmail(loginForm.email.trim(), loginForm.password)
    localStorage.setItem('tp-user-id', String(data.user_id))
    localStorage.setItem('tp-token', data.token)
    currentUser.value = data.user
    loggedIn.value = true
    ElMessage.success(`欢迎回来，${data.user.name}`)
    await loadProjectsAndCases()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || err?.message || '登录失败')
  } finally {
    loginLoading.value = false
  }
}

function logout() {
  localStorage.removeItem('tp-user-id')
  localStorage.removeItem('tp-token')
  loggedIn.value = false
  currentUser.value = null
  projects.value = []
  selectedProjectId.value = null
  testcases.value = []
}

async function loadProjectsAndCases() {
  appLoading.value = true
  try {
    projects.value = await listProjects()
    const first = projects.value[0]
    if (!selectedProjectId.value && first) {
      selectedProjectId.value = first.id
    }
    await loadTestCases()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || err?.message || '加载项目失败')
  } finally {
    appLoading.value = false
  }
}

async function loadTestCases() {
  if (!selectedProjectId.value) {
    testcases.value = []
    return
  }

  appLoading.value = true
  try {
    testcases.value = await listTestCases(selectedProjectId.value)
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || err?.message || '加载测试用例失败')
  } finally {
    appLoading.value = false
  }
}

onMounted(async () => {
  const token = localStorage.getItem('tp-token')
  const userId = localStorage.getItem('tp-user-id')
  if (token && userId) {
    loggedIn.value = true
    await loadProjectsAndCases()
  }
})
</script>

<template>
  <div class="shell">
    <template v-if="!loggedIn">
      <div class="login-layout">
        <section class="brand-panel">
          <div class="brand-mask"></div>
          <div class="brand-content">
            <div class="brand-badge">INDUSTRIAL QA HUB</div>
            <h1>TestPilot 质量中台</h1>
            <p>连接需求、用例、脚本、执行、缺陷，构建可审计的工业级质量闭环。</p>

            <div class="brand-metrics">
              <div class="metric-item">
                <div class="metric-value">99.9%</div>
                <div class="metric-label">执行服务可用性目标</div>
              </div>
              <div class="metric-item">
                <div class="metric-value">95%</div>
                <div class="metric-label">发布门禁通过阈值</div>
              </div>
              <div class="metric-item">
                <div class="metric-value">30%+</div>
                <div class="metric-label">人均覆盖项目提升目标</div>
              </div>
            </div>
          </div>
        </section>

        <section class="login-panel">
          <div class="panel-card">
            <div class="panel-title">
              <h2>欢迎登录</h2>
              <p>工业级测试管理平台 · 安全访问</p>
            </div>

            <el-form label-position="top" class="login-form" @submit.prevent>
              <el-form-item label="企业邮箱">
                <el-input v-model="loginForm.email" size="large" placeholder="例如：tester@testpilot.local" />
              </el-form-item>

              <el-form-item label="密码">
                <el-input v-model="loginForm.password" size="large" type="password" show-password placeholder="请输入密码" />
              </el-form-item>

              <div class="row-between">
                <el-checkbox v-model="loginForm.agree">我已阅读并同意服务协议</el-checkbox>
                <a class="link" href="javascript:void(0)">忘记密码</a>
              </div>

              <el-button type="primary" size="large" class="login-btn" :loading="loginLoading" @click="doLogin">登录系统</el-button>

              <div class="tips">
                <p>Demo 账号：tester@testpilot.local</p>
                <p>Demo 密码：TestPilot@2026</p>
              </div>
            </el-form>
          </div>
        </section>
      </div>
    </template>

    <template v-else>
      <div class="workbench">
        <el-card class="card">
          <template #header>
            <div class="header-row">
              <div>
                <h2>测试用例列表</h2>
                <p>当前用户：{{ currentUser?.name || '已登录用户' }}（{{ currentUser?.role || '-' }}）</p>
              </div>
              <el-button type="danger" plain @click="logout">退出登录</el-button>
            </div>
          </template>

          <div class="toolbar">
            <el-select
              v-model="selectedProjectId"
              placeholder="选择项目"
              style="width: 320px"
              :disabled="!loggedIn"
              @change="loadTestCases"
            >
              <el-option v-for="p in projects" :key="p.id" :label="`${p.name} (#${p.id})`" :value="p.id" />
            </el-select>
            <el-button :loading="appLoading" @click="loadTestCases">刷新测试用例</el-button>
          </div>

          <el-table :data="testcases" border stripe v-loading="appLoading" style="width: 100%">
            <el-table-column prop="id" label="ID" width="80" />
            <el-table-column prop="title" label="标题" min-width="260" />
            <el-table-column prop="priority" label="优先级" width="120" />
            <el-table-column prop="steps" label="步骤" min-width="420" show-overflow-tooltip />
          </el-table>
        </el-card>
      </div>
    </template>
  </div>
</template>
