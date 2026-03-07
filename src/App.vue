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
  level: string
  reviewResult: string
  execResult: string
  modulePath: string
  tags: string
  updatedBy: number
  updatedByName: string
  updatedAt: string
  createdBy: number
  createdByName: string
  createdAt: string
  steps: string
  priority: string
}

type StepRow = {
  action: string
  expected: string
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
const pageInput = ref('1')
const sortBy = ref<'id' | 'created_at' | 'updated_at'>('updated_at')
const sortOrder = ref<'asc' | 'desc'>('desc')
const loadError = ref('')
const levelFilter = ref('')
const reviewFilter = ref('')
const execFilter = ref('')

const rows = ref<TableRow[]>([])
const stepRows = ref<StepRow[]>([{ action: '', expected: '' }])

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const caseForm = reactive({
  title: '',
  level: 'P1',
  reviewResult: '未评审',
  execResult: '未执行',
  modulePath: '/未分类',
  tags: '',
  steps: '',
  priority: 'medium',
})

const pageSizeOptions = [10, 20, 50]

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
    level: tc.level,
    reviewResult: tc.review_result,
    execResult: tc.exec_result,
    modulePath: tc.module_path,
    tags: tc.tags,
    updatedBy: tc.updated_by,
    updatedByName: tc.updated_by_name || '-',
    updatedAt: formatTime(tc.updated_at),
    createdBy: tc.created_by,
    createdByName: tc.created_by_name || '-',
    createdAt: formatTime(tc.created_at),
    steps: tc.steps,
    priority: tc.priority,
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

function parseStepsToRows(text: string): StepRow[] {
  const raw = (text || '').split('\n').map((s) => s.trim()).filter(Boolean)
  if (raw.length === 0) return [{ action: '', expected: '' }]

  const rows = raw.map((line) => {
    const parts = line.split('|')
    if (parts.length >= 2) {
      return {
        action: (parts[0] ?? '').trim(),
        expected: parts.slice(1).join('|').trim(),
      }
    }
    return { action: line, expected: '' }
  })

  return rows.length > 0 ? rows : [{ action: '', expected: '' }]
}

function rowsToStepsText(rows: StepRow[]): string {
  return rows
    .map((r) => ({ action: (r.action || '').trim(), expected: (r.expected || '').trim() }))
    .filter((r) => r.action || r.expected)
    .map((r) => `${r.action} | ${r.expected}`)
    .join('\n')
}

function addStepRow() {
  stepRows.value.push({ action: '', expected: '' })
}

function removeStepRow(index: number) {
  if (stepRows.value.length <= 1) {
    stepRows.value = [{ action: '', expected: '' }]
    return
  }
  stepRows.value.splice(index, 1)
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
  loadError.value = ''
  try {
    const data = await listTestCases(selectedProject.value, {
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
      level: levelFilter.value || undefined,
      review_result: reviewFilter.value || undefined,
      exec_result: execFilter.value || undefined,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
    })
    rows.value = data.items.map(toRow)
    total.value = data.total
    page.value = data.page
    pageInput.value = String(data.page)
    pageSize.value = data.pageSize
  } catch (e: any) {
    loadError.value = e?.response?.data?.error || '加载用例失败，请重试'
    ElMessage.error(loadError.value)
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
  levelFilter.value = ''
  reviewFilter.value = ''
  execFilter.value = ''
  page.value = 1
  loadCases()
}

function onChangePageSize() {
  page.value = 1
  loadCases()
}

function onJumpPage() {
  const p = Number(pageInput.value)
  if (!Number.isFinite(p) || p < 1) {
    pageInput.value = String(page.value)
    return
  }
  const target = Math.min(pageCount.value, Math.floor(p))
  page.value = target
  pageInput.value = String(target)
  loadCases()
}

function toggleSort(field: 'id' | 'created_at' | 'updated_at') {
  if (sortBy.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = field
    sortOrder.value = 'desc'
  }
  page.value = 1
  loadCases()
}

function openCreate() {
  editingId.value = null
  caseForm.title = ''
  caseForm.level = 'P1'
  caseForm.reviewResult = '未评审'
  caseForm.execResult = '未执行'
  caseForm.modulePath = '/未分类'
  caseForm.tags = ''
  caseForm.steps = ''
  caseForm.priority = 'medium'
  stepRows.value = [{ action: '', expected: '' }]
  dialogVisible.value = true
}

function openEdit(row: TableRow) {
  editingId.value = row.id
  caseForm.title = row.title
  caseForm.level = row.level || 'P1'
  caseForm.reviewResult = row.reviewResult || '未评审'
  caseForm.execResult = row.execResult || '未执行'
  caseForm.modulePath = row.modulePath || '/未分类'
  caseForm.tags = row.tags || ''
  caseForm.steps = row.steps
  caseForm.priority = row.priority || 'medium'
  stepRows.value = parseStepsToRows(row.steps)
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
    const stepsText = rowsToStepsText(stepRows.value)
    caseForm.steps = stepsText

    if (editingId.value) {
      await updateTestCase(selectedProject.value, editingId.value, {
        title: caseForm.title.trim(),
        level: caseForm.level,
        review_result: caseForm.reviewResult,
        exec_result: caseForm.execResult,
        module_path: caseForm.modulePath.trim(),
        tags: caseForm.tags.trim(),
        steps: stepsText,
        priority: caseForm.priority,
      })
      ElMessage.success('修改成功')
    } else {
      await createTestCase(selectedProject.value, {
        title: caseForm.title.trim(),
        level: caseForm.level,
        review_result: caseForm.reviewResult,
        exec_result: caseForm.execResult,
        module_path: caseForm.modulePath.trim(),
        tags: caseForm.tags.trim(),
        steps: stepsText,
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
                    <el-input v-model="keyword" placeholder="通过 ID/名称/标签搜索" style="width: 220px" clearable @keyup.enter="onSearch" />
                    <el-select v-model="levelFilter" style="width: 100px" placeholder="等级" clearable>
                      <el-option label="P0" value="P0" />
                      <el-option label="P1" value="P1" />
                      <el-option label="P2" value="P2" />
                    </el-select>
                    <el-select v-model="reviewFilter" style="width: 120px" placeholder="评审" clearable>
                      <el-option label="未评审" value="未评审" />
                      <el-option label="已通过" value="已通过" />
                      <el-option label="不通过" value="不通过" />
                      <el-option label="重新提审" value="重新提审" />
                    </el-select>
                    <el-select v-model="execFilter" style="width: 120px" placeholder="执行" clearable>
                      <el-option label="未执行" value="未执行" />
                      <el-option label="成功" value="成功" />
                      <el-option label="失败" value="失败" />
                      <el-option label="阻塞" value="阻塞" />
                    </el-select>
                    <el-button @click="onSearch">查询</el-button>
                    <el-button @click="onResetSearch">重置</el-button>
                  </div>
                </div>

                <div class="table-shell" v-loading="appLoading">
                  <table>
                    <thead>
                      <tr>
                        <th style="width: 90px" class="sortable" @click="toggleSort('id')">
                          ID
                          <span class="sort-flag" :class="{ active: sortBy === 'id' }">{{ sortBy === 'id' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span>
                        </th>
                        <th class="sticky-col sticky-name">用例名称</th>
                        <th style="width: 90px">用例等级</th>
                        <th style="width: 100px">评审结果</th>
                        <th style="width: 100px">执行结果</th>
                        <th style="width: 140px">所属模块</th>
                        <th style="width: 120px">标签</th>
                        <th style="width: 110px">更新人</th>
                        <th style="width: 170px" class="sortable" @click="toggleSort('updated_at')">
                          更新时间
                          <span class="sort-flag" :class="{ active: sortBy === 'updated_at' }">{{ sortBy === 'updated_at' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span>
                        </th>
                        <th style="width: 110px">创建人</th>
                        <th style="width: 170px" class="sortable" @click="toggleSort('created_at')">
                          创建时间
                          <span class="sort-flag" :class="{ active: sortBy === 'created_at' }">{{ sortBy === 'created_at' ? (sortOrder === 'asc' ? '↑' : '↓') : '↕' }}</span>
                        </th>
                        <th style="width: 120px" class="sticky-col sticky-action">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-if="loadError">
                        <td colspan="12" class="empty-td">
                          {{ loadError }}
                          <el-button size="small" @click="loadCases" style="margin-left: 10px">重试</el-button>
                        </td>
                      </tr>
                      <tr v-else-if="rows.length === 0">
                        <td colspan="12" class="empty-td">
                          暂无数据
                          <el-button size="small" @click="openCreate" style="margin-left: 10px">去新建</el-button>
                        </td>
                      </tr>
                      <tr v-else v-for="r in rows" :key="r.id">
                        <td class="id">{{ r.id }}</td>
                        <td class="name sticky-col sticky-name" :title="r.title">{{ r.title }}</td>
                        <td>{{ r.level }}</td>
                        <td>{{ r.reviewResult }}</td>
                        <td>{{ r.execResult }}</td>
                        <td>{{ r.modulePath }}</td>
                        <td :title="r.tags || '-'">{{ r.tags || '-' }}</td>
                        <td>{{ r.updatedByName }}</td>
                        <td>{{ r.updatedAt }}</td>
                        <td>{{ r.createdByName }}</td>
                        <td>{{ r.createdAt }}</td>
                        <td class="sticky-col sticky-action">
                          <div class="action-group">
                            <button class="action-btn action-edit" @click="openEdit(r)">编辑</button>
                            <button class="action-btn action-delete" @click="onDelete(r)">删除</button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div class="pager">
                  <span>共 {{ total }} 条</span>
                  <span>每页</span>
                  <el-select v-model="pageSize" size="small" style="width: 88px" @change="onChangePageSize">
                    <el-option v-for="s in pageSizeOptions" :key="s" :label="String(s)" :value="s" />
                  </el-select>
                  <el-button size="small" :disabled="!canPrev" @click="prevPage">上一页</el-button>
                  <span>{{ page }} / {{ pageCount }}</span>
                  <el-button size="small" :disabled="!canNext" @click="nextPage">下一页</el-button>
                  <span>跳至</span>
                  <el-input v-model="pageInput" size="small" style="width: 64px" @keyup.enter="onJumpPage" />
                  <el-button size="small" @click="onJumpPage">GO</el-button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <el-drawer
        v-model="dialogVisible"
        :title="editingId ? '编辑用例' : '新建用例'"
        size="68%"
        direction="rtl"
        class="case-editor-drawer"
      >
        <div class="case-editor">
          <div class="case-editor-head">
            <div class="head-left">
              <div class="case-tag">TEST CASE</div>
              <h3>{{ editingId ? '编辑测试用例' : '新建测试用例' }}</h3>
            </div>
            <div class="head-right">
              <el-button @click="dialogVisible = false">取消</el-button>
              <el-button type="primary" :loading="saving" @click="submitCase">保存</el-button>
            </div>
          </div>

          <el-form label-position="top" class="case-editor-form">
            <section class="editor-block">
              <div class="block-title">基础信息</div>
              <div class="block-grid block-grid-2">
                <el-form-item label="用例名称">
                  <el-input v-model="caseForm.title" placeholder="请输入用例名称" />
                </el-form-item>
                <el-form-item label="所属模块">
                  <el-input v-model="caseForm.modulePath" placeholder="如 /内容/文章" />
                </el-form-item>

                <el-form-item label="用例等级">
                  <el-select v-model="caseForm.level">
                    <el-option label="P0" value="P0" />
                    <el-option label="P1" value="P1" />
                    <el-option label="P2" value="P2" />
                  </el-select>
                </el-form-item>

                <el-form-item label="标签">
                  <el-input v-model="caseForm.tags" placeholder="多个标签以逗号分隔" />
                </el-form-item>
              </div>
            </section>

            <section class="editor-block">
              <div class="block-title">评审与执行状态</div>
              <div class="block-grid block-grid-3">
                <el-form-item label="评审结果">
                  <el-select v-model="caseForm.reviewResult">
                    <el-option label="未评审" value="未评审" />
                    <el-option label="已通过" value="已通过" />
                    <el-option label="不通过" value="不通过" />
                    <el-option label="重新提审" value="重新提审" />
                  </el-select>
                </el-form-item>

                <el-form-item label="执行结果">
                  <el-select v-model="caseForm.execResult">
                    <el-option label="未执行" value="未执行" />
                    <el-option label="成功" value="成功" />
                    <el-option label="失败" value="失败" />
                    <el-option label="阻塞" value="阻塞" />
                  </el-select>
                </el-form-item>

                <el-form-item label="优先级">
                  <el-select v-model="caseForm.priority">
                    <el-option label="high" value="high" />
                    <el-option label="medium" value="medium" />
                    <el-option label="low" value="low" />
                  </el-select>
                </el-form-item>
              </div>
            </section>

            <section class="editor-block">
              <div class="block-title">步骤描述</div>
              <div class="steps-grid-head">
                <div>步骤</div>
                <div>预期结果</div>
                <div>操作</div>
              </div>

              <div class="steps-grid-row" v-for="(s, idx) in stepRows" :key="idx">
                <el-input v-model="s.action" placeholder="请输入步骤" />
                <el-input v-model="s.expected" placeholder="请输入预期结果" />
                <el-button link type="danger" @click="removeStepRow(idx)">删除</el-button>
              </div>

              <div class="steps-grid-actions">
                <el-button @click="addStepRow">新增步骤</el-button>
              </div>
            </section>
          </el-form>
        </div>
      </el-drawer>
    </template>
  </div>
</template>
