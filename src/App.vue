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
    // 保证存在两条演示数据时默认全部展示在 open
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
      <div class="issues-shell">
        <div class="issues-header">
          <div>
            <h2>Test Cases</h2>
            <p>{{ openCount }} open · {{ closedCount }} closed</p>
          </div>
          <div class="header-actions">
            <el-select v-model="selectedProjectId" style="width: 240px" @change="loadTestCases">
              <el-option v-for="p in projects" :key="p.id" :label="`${p.name} (#${p.id})`" :value="p.id" />
            </el-select>
            <el-button @click="loadTestCases" :loading="appLoading">刷新</el-button>
            <el-button type="danger" plain @click="logout">退出</el-button>
          </div>
        </div>

        <div class="issues-card">
          <div class="issues-tabs">
            <button :class="['tab-btn', statusTab === 'open' ? 'active' : '']" @click="statusTab = 'open'">
              Open <span>{{ openCount }}</span>
            </button>
            <button :class="['tab-btn', statusTab === 'closed' ? 'active' : '']" @click="statusTab = 'closed'">
              Closed <span>{{ closedCount }}</span>
            </button>
            <div class="spacer"></div>
            <el-input v-model="keyword" placeholder="Search" clearable class="search-input" />
          </div>

          <div v-loading="appLoading">
            <div v-if="filteredCases.length === 0" class="empty">No test cases found.</div>

            <div v-else class="issue-list">
              <div v-for="item in filteredCases" :key="item.id" class="issue-row">
                <div class="issue-main">
                  <div class="issue-title-row">
                    <span :class="['dot', isClosed(item.id) ? 'dot-closed' : 'dot-open']"></span>
                    <span class="title">{{ item.title }}</span>
                  </div>
                  <div class="issue-meta">
                    #{{ item.id }} opened · updated {{ formatWhen(item.updated_at || item.created_at) }}
                  </div>
                </div>

                <div class="issue-actions">
                  <el-button size="small" @click="toggleStatus(item.id)">
                    {{ isClosed(item.id) ? 'Reopen' : 'Close' }}
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
