<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { loginByEmail, type LoginResp } from './api'

type CaseRow = {
  id: number
  name: string
  level: 'P0' | 'P1' | 'P2'
  review: '未评审' | '已通过' | '不通过'
  exec: '未执行' | '成功' | '失败'
  module: string
  tags: string
  updater: string
  updateTime: string
  creator: string
  createTime: string
}

const loginLoading = ref(false)
const loggedIn = ref(false)
const currentUser = ref<LoginResp['user'] | null>(null)

const loginForm = reactive({
  email: 'tester@testpilot.local',
  password: 'TestPilot@2026',
})

const projectOptions = [
  { id: '100001100001', name: '示例项目' },
  { id: '100001100002', name: '演示项目B' },
]
const selectedProject = ref(projectOptions[0]?.id ?? '')

const topCaseTabs = ['用例', '评审']
const activeTopCaseTab = ref('用例')

const leftMainNav = ['工作台', '项目管理', '测试计划', '测试用例', '接口测试', '缺陷管理', '系统设置']
const activeMainNav = ref('测试用例')

const moduleTree = [
  { name: '全部用例', count: 14, active: true },
  { name: '未规划用例', count: 0, active: false },
  { name: '登录', count: 3, active: false },
  { name: '内容', count: 10, active: false },
  { name: '1', count: 1, active: false },
]

const keyword = ref('')

const rows = ref<CaseRow[]>([
  {
    id: 100001,
    name: 'test1',
    level: 'P0',
    review: '未评审',
    exec: '未执行',
    module: '/1/2',
    tags: 'tt',
    updater: 'demo',
    updateTime: '2026-03-07 11:43:08',
    creator: 'demo',
    createTime: '2026-03-07 11:43:08',
  },
  {
    id: 13,
    name: '已有的草稿，发布成功',
    level: 'P0',
    review: '已通过',
    exec: '成功',
    module: '/内容/文章',
    tags: '-',
    updater: 'Administrator',
    updateTime: '2024-05-28 11:13:10',
    creator: 'Administrator',
    createTime: '2024-05-28 11:13:10',
  },
])

const filteredRows = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter((r) => `${r.id}`.includes(q) || r.name.toLowerCase().includes(q) || r.tags.toLowerCase().includes(q))
})

function levelClass(level: string) {
  return `level-${level.toLowerCase()}`
}

function statusClass(s: string) {
  if (s === '已通过' || s === '成功') return 'ok'
  if (s === '不通过' || s === '失败') return 'fail'
  return 'pending'
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
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '登录失败')
  } finally {
    loginLoading.value = false
  }
}

function logout() {
  localStorage.removeItem('tp-token')
  localStorage.removeItem('tp-user-id')
  sessionStorage.removeItem('tp-token')
  sessionStorage.removeItem('tp-user-id')

  currentUser.value = null
  loggedIn.value = false

  // hard fallback to avoid stale state/cache issues in dev mode
  window.location.reload()
}

onMounted(() => {
  if (localStorage.getItem('tp-token')) loggedIn.value = true
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
            <div class="logo">M</div>
            <div class="name">MeterSphere</div>
          </div>

          <div class="project-area">
            <div class="project-inline">
              <el-select v-model="selectedProject" class="project-select-inline" popper-class="project-select-popper">
                <el-option v-for="p in projectOptions" :key="p.id" :label="p.name" :value="p.id" />
              </el-select>
            </div>

            <div class="mini-tabs">
              <button v-for="t in topCaseTabs" :key="t" :class="['mini-tab', t === activeTopCaseTab ? 'active' : '']">{{ t }}</button>
            </div>
          </div>

          <div class="user-box">
            <span class="user-name">{{ currentUser?.name || 'demo' }}</span>
            <el-button size="small" @click="logout">退出</el-button>
          </div>
        </header>

        <div class="main">
          <aside class="main-nav">
            <div v-for="n in leftMainNav" :key="n" :class="['main-nav-item', n === activeMainNav ? 'active' : '']">{{ n }}</div>
          </aside>

          <section class="content-wrap">
            <div class="case-page">
              <div class="left-tree">
                <el-input size="small" placeholder="请输入模块名称" />
                <div class="tree-list">
                  <div v-for="n in moduleTree" :key="n.name" :class="['tree-item', n.active ? 'active' : '']">
                    <span>{{ n.name }}</span>
                    <span>{{ n.count }}</span>
                  </div>
                </div>
                <div class="recycle">回收站 0</div>
              </div>

              <div class="right-table">
                <div class="toolbar-1">
                  <div class="left">
                    <el-button type="primary">新建</el-button>
                    <el-button>导入</el-button>
                  </div>
                  <div class="right">
                    <el-input v-model="keyword" placeholder="通过 ID/名称/标签搜索" style="width: 220px" clearable />
                    <el-select style="width: 120px" placeholder="全部数据">
                      <el-option label="全部数据" value="all" />
                    </el-select>
                    <el-button>筛选</el-button>
                    <el-button>表格</el-button>
                    <el-button>看板</el-button>
                  </div>
                </div>

                <div class="table-shell">
                  <table>
                    <thead>
                      <tr>
                        <th style="width: 36px"></th>
                        <th style="width: 90px">ID</th>
                        <th>用例名称</th>
                        <th style="width: 90px">用例等级</th>
                        <th style="width: 90px">评审结果</th>
                        <th style="width: 90px">执行结果</th>
                        <th style="width: 120px">所属模块</th>
                        <th style="width: 80px">标签</th>
                        <th style="width: 110px">更新人</th>
                        <th style="width: 150px">更新时间</th>
                        <th style="width: 110px">创建人</th>
                        <th style="width: 150px">创建时间</th>
                        <th style="width: 90px">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="r in filteredRows" :key="r.id">
                        <td><el-checkbox /></td>
                        <td class="id">{{ r.id }}</td>
                        <td class="name">{{ r.name }}</td>
                        <td><span class="level" :class="levelClass(r.level)">{{ r.level }}</span></td>
                        <td><span class="status" :class="statusClass(r.review)">{{ r.review }}</span></td>
                        <td><span class="status" :class="statusClass(r.exec)">{{ r.exec }}</span></td>
                        <td>{{ r.module }}</td>
                        <td>{{ r.tags }}</td>
                        <td>{{ r.updater }}</td>
                        <td>{{ r.updateTime }}</td>
                        <td>{{ r.creator }}</td>
                        <td>{{ r.createTime }}</td>
                        <td><a href="javascript:void(0)">编辑</a> | <a href="javascript:void(0)">复制</a></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div class="pager">共 14 条 &nbsp;&nbsp; 1 2</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>
