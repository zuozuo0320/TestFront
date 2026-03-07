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
  created_at?: string
  updated_at?: string
}

const loginLoading = ref(false)
const appLoading = ref(false)
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
const keyword = ref('')

const navItems = ['工作台', '项目管理', '测试计划', '测试用例', 'E2E测试']

const mockFallback: TestCase[] = [
  {
    id: 10001,
    title: '登录成功-有效账号密码',
    steps: '1. 打开登录页 2. 输入有效账号密码 3. 点击登录',
    priority: 'high',
    project_id: 1,
    updated_at: '2026-03-07T16:22:00+08:00',
  },
  {
    id: 10002,
    title: '下单成功-购物车结算流程',
    steps: '1. 加购物车 2. 去结算 3. 提交订单',
    priority: 'medium',
    project_id: 1,
    updated_at: '2026-03-07T16:24:00+08:00',
  },
]

function formatWhen(value?: string) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function levelText(priority: string) {
  if (priority === 'high') return 'P0'
  if (priority === 'medium') return 'P1'
  return 'P2'
}

const visibleCases = () => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return testcases.value
  return testcases.value.filter((c) => c.title.toLowerCase().includes(q) || c.steps.toLowerCase().includes(q))
}

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

async function loadProjectsAndCases() {
  appLoading.value = true
  try {
    projects.value = await listProjects()
    const first = projects.value[0]
    if (!selectedProjectId.value && first) {
      selectedProjectId.value = first.id
    }
    await loadTestCases()
  } catch {
    testcases.value = mockFallback
  } finally {
    appLoading.value = false
  }
}

async function loadTestCases() {
  if (!selectedProjectId.value) {
    testcases.value = mockFallback
    return
  }

  appLoading.value = true
  try {
    const data = await listTestCases(selectedProjectId.value)
    testcases.value = data.length > 0 ? data : mockFallback
  } catch {
    testcases.value = mockFallback
  } finally {
    appLoading.value = false
  }
}

function logout() {
  localStorage.removeItem('tp-user-id')
  localStorage.removeItem('tp-token')
  loggedIn.value = false
  currentUser.value = null
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
      <section class="login-shell">
        <div class="login-card">
          <div class="wordmark">TP</div>
          <h1>Sign in to TestPilot</h1>
          <p class="sub">Industrial test management workspace</p>

          <el-form label-position="top" @submit.prevent>
            <el-form-item label="Email">
              <el-input v-model="loginForm.email" size="large" placeholder="tester@testpilot.local" />
            </el-form-item>

            <el-form-item label="Password">
              <el-input v-model="loginForm.password" size="large" type="password" show-password placeholder="Password" />
            </el-form-item>

            <div class="row-between">
              <el-checkbox v-model="loginForm.agree">Agree to Terms</el-checkbox>
              <a class="link" href="javascript:void(0)">Forgot password?</a>
            </div>

            <el-button class="primary-btn" :loading="loginLoading" @click="doLogin">Continue</el-button>
            <div class="demo-tip">Demo: tester@testpilot.local / TestPilot@2026</div>
          </el-form>
        </div>
      </section>
    </template>

    <template v-else>
      <div class="app-shell">
        <header class="global-header">
          <div class="brand">
            <span class="brand-icon">TP</span>
            <span class="brand-name">TestPilot</span>
          </div>

          <div class="project-switch">
            <span>项目：</span>
            <el-select v-model="selectedProjectId" style="width: 240px" @change="loadTestCases">
              <el-option v-for="p in projects" :key="p.id" :label="`${p.name} (#${p.id})`" :value="p.id" />
            </el-select>
          </div>

          <div class="user-area">
            <span>{{ currentUser?.name || 'Demo User' }}</span>
            <el-button size="small" @click="logout">退出</el-button>
          </div>
        </header>

        <div class="app-body">
          <aside class="left-nav">
            <div
              v-for="item in navItems"
              :key="item"
              :class="['nav-item', item === '测试用例' ? 'active' : '']"
            >
              {{ item }}
            </div>
          </aside>

          <main class="content">
            <div class="content-card">
              <div class="content-toolbar">
                <el-input v-model="keyword" placeholder="请输入用例名称/步骤" style="width: 260px" clearable />
                <el-button @click="loadTestCases" :loading="appLoading">刷新</el-button>
                <el-button type="primary">新建用例</el-button>
              </div>

              <table class="case-table">
                <thead>
                  <tr>
                    <th style="width: 140px">ID</th>
                    <th>用例名称</th>
                    <th style="width: 90px">优先级</th>
                    <th style="width: 180px">更新时间</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in visibleCases()" :key="item.id">
                    <td class="id">TC-{{ item.id }}</td>
                    <td>{{ item.title }}</td>
                    <td>{{ levelText(item.priority) }}</td>
                    <td>{{ formatWhen(item.updated_at || item.created_at) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </main>
        </div>
      </div>
    </template>
  </div>
</template>
