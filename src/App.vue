<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createTestCase,
  deleteTestCase,
  listProjects,
  listTestCases,
  loginByEmail,
  updateTestCase,
  type LoginResp,
  type Project,
  type TestCase,
} from './api'

type TableRow = {
  id: number
  title: string
  priority: string
  steps: string
  createdAt: string
  updatedAt: string
}

const loginLoading = ref(false)
const appLoading = ref(false)
const saving = ref(false)
const loggedIn = ref(false)
const currentUser = ref<LoginResp['user'] | null>(null)

const loginForm = reactive({
  email: 'tester@testpilot.local',
  password: 'TestPilot@2026',
})

const projects = ref<Project[]>([])
const selectedProject = ref<number | null>(null)

const keyword = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)

const rows = ref<TableRow[]>([])

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const caseForm = reactive({
  title: '',
  steps: '',
  priority: 'medium',
})

const pageCount = computed(() => {
  if (total.value <= 0) return 1
  return Math.max(1, Math.ceil(total.value / pageSize.value))
})

const canPrev = computed(() => page.value > 1)
const canNext = computed(() => page.value < pageCount.value)

function toRow(tc: TestCase): TableRow {
  return {
    id: tc.id,
    title: tc.title,
    priority: tc.priority,
    steps: tc.steps,
    createdAt: formatTime(tc.created_at),
    updatedAt: formatTime(tc.updated_at),
  }
}

function formatTime(value?: string) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

async function doLogin() {
  loginLoading.value = true
  try {
    const data = await loginByEmail(loginForm.email, loginForm.password)
    localStorage.setItem('tp-token', data.token)
    localStorage.setItem('tp-user-id', String(data.user_id))
    currentUser.value = data.user
    loggedIn.value = true
    ElMessage.success('登录成功')
    await initAfterLogin()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '登录失败')
  } finally {
    loginLoading.value = false
  }
}

async function initAfterLogin() {
  appLoading.value = true
  try {
    projects.value = await listProjects()
    const firstProject = projects.value[0]
    if (firstProject) {
      selectedProject.value = firstProject.id
      await loadCases()
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '初始化失败')
  } finally {
    appLoading.value = false
  }
}

async function loadCases() {
  if (!selectedProject.value) return
  appLoading.value = true
  try {
    const data = await listTestCases(selectedProject.value, {
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
    })
    rows.value = data.items.map(toRow)
    total.value = data.total
    page.value = data.page
    pageSize.value = data.pageSize
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '加载用例失败')
  } finally {
    appLoading.value = false
  }
}

function onSearch() {
  page.value = 1
  loadCases()
}

function onResetSearch() {
  keyword.value = ''
  page.value = 1
  loadCases()
}

function openCreate() {
  editingId.value = null
  caseForm.title = ''
  caseForm.steps = ''
  caseForm.priority = 'medium'
  dialogVisible.value = true
}

function openEdit(row: TableRow) {
  editingId.value = row.id
  caseForm.title = row.title
  caseForm.steps = row.steps
  caseForm.priority = row.priority || 'medium'
  dialogVisible.value = true
}

async function submitCase() {
  if (!selectedProject.value) return
  if (!caseForm.title.trim()) {
    ElMessage.warning('用例名称不能为空')
    return
  }

  saving.value = true
  try {
    if (editingId.value) {
      await updateTestCase(selectedProject.value, editingId.value, {
        title: caseForm.title.trim(),
        steps: caseForm.steps.trim(),
        priority: caseForm.priority,
      })
      ElMessage.success('修改成功')
    } else {
      await createTestCase(selectedProject.value, {
        title: caseForm.title.trim(),
        steps: caseForm.steps.trim(),
        priority: caseForm.priority,
      })
      ElMessage.success('新增成功')
      page.value = 1
    }

    dialogVisible.value = false
    await loadCases()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '保存失败')
  } finally {
    saving.value = false
  }
}

async function onDelete(row: TableRow) {
  if (!selectedProject.value) return

  try {
    await ElMessageBox.confirm(`确认删除用例【${row.title}】？`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  try {
    await deleteTestCase(selectedProject.value, row.id)
    ElMessage.success('删除成功')

    const maxAfterDelete = Math.max(1, Math.ceil((total.value - 1) / pageSize.value))
    if (page.value > maxAfterDelete) page.value = maxAfterDelete
    await loadCases()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '删除失败')
  }
}

function prevPage() {
  if (!canPrev.value) return
  page.value -= 1
  loadCases()
}

function nextPage() {
  if (!canNext.value) return
  page.value += 1
  loadCases()
}

async function onProjectChange() {
  page.value = 1
  await loadCases()
}

function logout() {
  localStorage.removeItem('tp-token')
  localStorage.removeItem('tp-user-id')
  sessionStorage.removeItem('tp-token')
  sessionStorage.removeItem('tp-user-id')

  currentUser.value = null
  loggedIn.value = false
  window.location.reload()
}

onMounted(async () => {
  if (localStorage.getItem('tp-token')) {
    loggedIn.value = true
    await initAfterLogin()
  }
})
</script>

<template>
  <div class="page">
    <template v-if="!loggedIn">
      <div class="login-wrap">
        <div class="login-card">
          <div class="wordmark">TP</div>
          <h1>Sign in to TestPilot</h1>
          <p class="sub">Industrial test management workspace</p>

          <el-input v-model="loginForm.email" placeholder="请输入用户名 / 邮箱" class="mb12" />
          <el-input v-model="loginForm.password" placeholder="请输入密码" show-password class="mb12" />

          <div class="row-between">
            <span class="hint">Demo: tester@testpilot.local / TestPilot@2026</span>
            <a class="link" href="javascript:void(0)">Forgot password?</a>
          </div>

          <el-button class="primary-btn" :loading="loginLoading" @click="doLogin">登录</el-button>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="layout">
        <header class="top-header">
          <div class="brand">
            <div class="logo">TP</div>
            <div class="name">TestPilot</div>
          </div>

          <div class="project-area">
            <div class="project-inline">
              <el-select v-model="selectedProject" class="project-select-inline" popper-class="project-select-popper" @change="onProjectChange">
                <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
              </el-select>
            </div>

            <div class="mini-tabs">
              <button class="mini-tab active">用例</button>
              <button class="mini-tab">评审</button>
            </div>
          </div>

          <div class="user-box">
            <span class="user-name">{{ currentUser?.name || 'demo' }}</span>
            <el-button size="small" @click="logout">退出</el-button>
          </div>
        </header>

        <div class="main">
          <aside class="main-nav">
            <div class="main-nav-item">工作台</div>
            <div class="main-nav-item">项目管理</div>
            <div class="main-nav-item">测试计划</div>
            <div class="main-nav-item active">测试用例</div>
            <div class="main-nav-item">E2E测试</div>
          </aside>

          <section class="content-wrap">
            <div class="case-page">
              <div class="left-tree">
                <el-input size="small" placeholder="请输入模块名称" />
                <div class="tree-list">
                  <div class="tree-item active">
                    <span>全部用例</span>
                    <span>{{ total }}</span>
                  </div>
                </div>
              </div>

              <div class="right-table">
                <div class="toolbar-1">
                  <div class="left">
                    <el-button type="primary" @click="openCreate">新建</el-button>
                  </div>
                  <div class="right">
                    <el-input v-model="keyword" placeholder="通过 ID/名称/步骤搜索" style="width: 240px" clearable @keyup.enter="onSearch" />
                    <el-button @click="onSearch">查询</el-button>
                    <el-button @click="onResetSearch">重置</el-button>
                  </div>
                </div>

                <div class="table-shell" v-loading="appLoading">
                  <table>
                    <thead>
                      <tr>
                        <th style="width: 90px">ID</th>
                        <th>用例名称</th>
                        <th style="width: 90px">优先级</th>
                        <th style="width: 220px">步骤</th>
                        <th style="width: 170px">更新时间</th>
                        <th style="width: 120px">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="r in rows" :key="r.id">
                        <td class="id">{{ r.id }}</td>
                        <td class="name">{{ r.title }}</td>
                        <td>{{ r.priority }}</td>
                        <td>{{ r.steps || '-' }}</td>
                        <td>{{ r.updatedAt }}</td>
                        <td>
                          <a href="javascript:void(0)" @click="openEdit(r)">编辑</a>
                          <span class="sep">|</span>
                          <a href="javascript:void(0)" @click="onDelete(r)">删除</a>
                        </td>
                      </tr>
                      <tr v-if="rows.length === 0">
                        <td colspan="6" class="empty-td">暂无数据</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div class="pager">
                  <span>共 {{ total }} 条</span>
                  <el-button size="small" :disabled="!canPrev" @click="prevPage">上一页</el-button>
                  <span>{{ page }} / {{ pageCount }}</span>
                  <el-button size="small" :disabled="!canNext" @click="nextPage">下一页</el-button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <el-dialog v-model="dialogVisible" :title="editingId ? '修改测试用例' : '新增测试用例'" width="560px">
        <el-form label-position="top">
          <el-form-item label="用例名称">
            <el-input v-model="caseForm.title" />
          </el-form-item>
          <el-form-item label="优先级">
            <el-select v-model="caseForm.priority" style="width: 180px">
              <el-option label="high" value="high" />
              <el-option label="medium" value="medium" />
              <el-option label="low" value="low" />
            </el-select>
          </el-form-item>
          <el-form-item label="步骤">
            <el-input v-model="caseForm.steps" type="textarea" :rows="4" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="submitCase">保存</el-button>
        </template>
      </el-dialog>
    </template>
  </div>
</template>
