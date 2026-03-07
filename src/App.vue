<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
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

const keyword = ref('')
const statusTab = ref<'open' | 'closed'>('open')
const closedIds = ref<number[]>([])

const openCount = computed(() => testcases.value.filter((c) => !closedIds.value.includes(c.id)).length)
const closedCount = computed(() => closedIds.value.length)

const filteredCases = computed(() => {
  return testcases.value
    .filter((item) => {
      const matchesKeyword =
        keyword.value.trim() === '' ||
        item.title.toLowerCase().includes(keyword.value.trim().toLowerCase()) ||
        item.steps.toLowerCase().includes(keyword.value.trim().toLowerCase())

      const isClosed = closedIds.value.includes(item.id)
      const matchesStatus = statusTab.value === 'open' ? !isClosed : isClosed

      return matchesKeyword && matchesStatus
    })
    .sort((a, b) => b.id - a.id)
})

function isClosed(id: number) {
  return closedIds.value.includes(id)
}

function toggleStatus(id: number) {
  if (isClosed(id)) {
    closedIds.value = closedIds.value.filter((x) => x !== id)
    ElMessage.success(`已重新打开用例 #${id}`)
    return
  }
  closedIds.value = [...closedIds.value, id]
  ElMessage.success(`已关闭用例 #${id}`)
}

function formatWhen(value?: string) {
  if (!value) return 'just now'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'just now'
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
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

function logout() {
  localStorage.removeItem('tp-user-id')
  localStorage.removeItem('tp-token')
  loggedIn.value = false
  currentUser.value = null
  projects.value = []
  selectedProjectId.value = null
  testcases.value = []
  keyword.value = ''
  statusTab.value = 'open'
  closedIds.value = []
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
    closedIds.value = []
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
      <div class="issues-page">
        <div class="issues-page-header">
          <div>
            <h2>Issues</h2>
            <p>Manage test cases in issue workflow</p>
          </div>
          <div class="page-actions">
            <el-select v-model="selectedProjectId" style="width: 220px" @change="loadTestCases">
              <el-option v-for="p in projects" :key="p.id" :label="`${p.name} (#${p.id})`" :value="p.id" />
            </el-select>
            <el-button @click="loadTestCases" :loading="appLoading">刷新</el-button>
            <el-button plain @click="logout">退出</el-button>
          </div>
        </div>

        <div class="gh-card">
          <div class="gh-topline">
            <div class="gh-tabs">
              <button :class="['gh-tab', statusTab === 'open' ? 'active' : '']" @click="statusTab = 'open'">
                Open <span>{{ openCount }}</span>
              </button>
              <button :class="['gh-tab', statusTab === 'closed' ? 'active' : '']" @click="statusTab = 'closed'">
                Closed <span>{{ closedCount }}</span>
              </button>
            </div>
            <el-button type="success" size="small">New issue</el-button>
          </div>

          <div class="gh-filterline">
            <el-input v-model="keyword" clearable placeholder="Search all issues" class="gh-search" />
            <div class="gh-filter-actions">
              <button>Filters</button>
              <button>Labels</button>
              <button>Milestones</button>
              <button>Assignees</button>
              <button>Sort</button>
            </div>
          </div>

          <div v-loading="appLoading">
            <div v-if="filteredCases.length === 0" class="empty">No results matched your search.</div>

            <div v-else>
              <div v-for="item in filteredCases" :key="item.id" class="gh-row">
                <div class="gh-row-main">
                  <div class="gh-title-line">
                    <span :class="['dot', isClosed(item.id) ? 'dot-closed' : 'dot-open']"></span>
                    <span class="gh-title">{{ item.title }}</span>
                  </div>
                  <div class="gh-meta">#{{ item.id }} opened · updated {{ formatWhen(item.updated_at || item.created_at) }}</div>
                </div>
                <div class="gh-row-right">
                  <el-button size="small" @click="toggleStatus(item.id)">{{ isClosed(item.id) ? 'Reopen' : 'Close' }}</el-button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
