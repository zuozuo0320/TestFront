<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { loginByEmail, type LoginResp } from './api'

type CaseItem = {
  id: string
  name: string
  level: 'P0' | 'P1' | 'P2'
  creator: string
  updatedAt: string
}

const loginLoading = ref(false)
const loggedIn = ref(false)
const currentUser = ref<LoginResp['user'] | null>(null)

const loginForm = reactive({
  email: 'tester@testpilot.local',
  password: 'TestPilot@2026',
  agree: true,
})

const folderTree = [
  { name: '全部用例', count: 2 },
  { name: '登录模块', count: 1 },
  { name: '订单模块', count: 1 },
]

const mockCases = ref<CaseItem[]>([
  {
    id: 'TC-10001',
    name: '登录成功-有效账号密码',
    level: 'P1',
    creator: 'Tom Tester',
    updatedAt: '2026-03-07 16:22',
  },
  {
    id: 'TC-10002',
    name: '下单成功-购物车结算流程',
    level: 'P0',
    creator: 'Mia Manager',
    updatedAt: '2026-03-07 16:24',
  },
])

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
}

onMounted(() => {
  const token = localStorage.getItem('tp-token')
  if (token) {
    loggedIn.value = true
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
      <div class="ms-page">
        <header class="ms-topbar">
          <div class="left">
            <h2>用例管理</h2>
            <span class="crumb">项目 / 测试管理 / 功能用例</span>
          </div>
          <div class="right">
            <span class="user">{{ currentUser?.name || 'Demo User' }}</span>
            <el-button size="small" @click="logout">退出</el-button>
          </div>
        </header>

        <div class="ms-tabs">
          <button class="tab active">功能用例</button>
          <button class="tab">接口用例</button>
          <button class="tab">场景用例</button>
        </div>

        <main class="ms-main">
          <aside class="ms-left">
            <div class="left-title">用例目录</div>
            <el-input size="small" placeholder="搜索目录" />
            <div class="tree">
              <div v-for="node in folderTree" :key="node.name" class="tree-item">
                <span>{{ node.name }}</span>
                <span class="count">{{ node.count }}</span>
              </div>
            </div>
          </aside>

          <section class="ms-right">
            <div class="toolbar-1">
              <div class="filters">
                <el-input placeholder="请输入 ID/名称" style="width: 220px" />
                <el-select placeholder="优先级" style="width: 120px">
                  <el-option label="全部" value="all" />
                  <el-option label="P0" value="p0" />
                  <el-option label="P1" value="p1" />
                  <el-option label="P2" value="p2" />
                </el-select>
                <el-button>查询</el-button>
                <el-button>重置</el-button>
              </div>
              <div class="actions">
                <el-button>导入</el-button>
                <el-button type="primary">新建用例</el-button>
              </div>
            </div>

            <div class="toolbar-2">
              <el-checkbox>全选</el-checkbox>
              <el-button size="small">批量删除</el-button>
              <el-button size="small">批量移动</el-button>
            </div>

            <div class="table-wrap">
              <table class="case-table">
                <thead>
                  <tr>
                    <th style="width: 42px"></th>
                    <th style="width: 140px">ID</th>
                    <th>用例名称</th>
                    <th style="width: 90px">优先级</th>
                    <th style="width: 150px">创建人</th>
                    <th style="width: 170px">更新时间</th>
                    <th style="width: 140px">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in mockCases" :key="item.id">
                    <td><el-checkbox /></td>
                    <td class="id">{{ item.id }}</td>
                    <td class="name">{{ item.name }}</td>
                    <td>
                      <span class="level" :class="item.level.toLowerCase()">{{ item.level }}</span>
                    </td>
                    <td>{{ item.creator }}</td>
                    <td>{{ item.updatedAt }}</td>
                    <td>
                      <a href="javascript:void(0)">编辑</a>
                      <span class="sep">|</span>
                      <a href="javascript:void(0)">执行</a>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </template>
  </div>
</template>
