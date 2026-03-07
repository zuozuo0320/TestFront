<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { apiClient } from './api'

type Project = {
  id: number
  name: string
  description: string
}

type Overview = {
  project?: Project
  counts?: Record<string, number>
  latest_run?: {
    id?: number
    status?: string
    mode?: string
    pass_rate?: number
    total_results?: number
    passed_results?: number
  }
  quality_gate?: {
    status?: string
    threshold?: number
    pass_rate?: number
    reason?: string
  }
}

const loading = ref(false)
const running = ref(false)
const projects = ref<Project[]>([])
const selectedProjectId = ref<number | null>(null)
const overview = ref<Overview>({})
const mode = ref<'all' | 'one' | 'batch'>('all')
const scriptId = ref<number | null>(1)

const qualityTagType = computed(() => {
  const status = overview.value.quality_gate?.status
  if (status === 'pass') return 'success'
  if (status === 'blocked') return 'danger'
  return 'info'
})

const runStatusType = computed(() => {
  const status = overview.value.latest_run?.status
  if (status === 'passed') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running') return 'warning'
  return 'info'
})

async function loadProjects() {
  const { data } = await apiClient.get('/projects')
  projects.value = data.projects ?? []
  const firstProject = projects.value[0]
  if (!selectedProjectId.value && firstProject) {
    selectedProjectId.value = firstProject.id
  }
}

async function loadOverview() {
  if (!selectedProjectId.value) return
  const { data } = await apiClient.get(`/projects/${selectedProjectId.value}/demo-overview`)
  overview.value = data
}

async function refreshAll() {
  if (!selectedProjectId.value) return
  loading.value = true
  try {
    await loadOverview()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || err?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function triggerRun() {
  if (!selectedProjectId.value) return
  running.value = true
  try {
    const payload: Record<string, any> = { mode: mode.value }
    if (mode.value === 'one') {
      payload.script_id = scriptId.value || 1
    }

    await apiClient.post(`/projects/${selectedProjectId.value}/runs`, payload)
    ElMessage.success('执行已触发')
    await refreshAll()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || err?.message || '触发执行失败')
  } finally {
    running.value = false
  }
}

function saveUserId(userId: string) {
  localStorage.setItem('tp-user-id', userId)
  ElMessage.success(`已切换用户: ${userId}`)
  refreshAll()
}

onMounted(async () => {
  loading.value = true
  try {
    await loadProjects()
    await loadOverview()
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || err?.message || '初始化失败，请检查后端是否启动')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page">
    <el-card class="card">
      <template #header>
        <div class="header-row">
          <div>
            <h2>TestPilot Demo 控制台</h2>
            <p>前后端分离联调（Front: TestFront / Back: TestPilot）</p>
          </div>
          <div class="ops">
            <el-button size="small" @click="saveUserId('1')">Admin(1)</el-button>
            <el-button size="small" @click="saveUserId('2')">Manager(2)</el-button>
            <el-button size="small" @click="saveUserId('3')">Tester(3)</el-button>
          </div>
        </div>
      </template>

      <div class="toolbar">
        <el-select v-model="selectedProjectId" placeholder="选择项目" style="width: 300px" @change="refreshAll">
          <el-option v-for="p in projects" :key="p.id" :label="`${p.name} (#${p.id})`" :value="p.id" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="refreshAll">刷新概览</el-button>
      </div>

      <el-row :gutter="12" class="stats">
        <el-col :span="4"><el-statistic title="需求" :value="overview.counts?.requirements ?? 0" /></el-col>
        <el-col :span="4"><el-statistic title="用例" :value="overview.counts?.testcases ?? 0" /></el-col>
        <el-col :span="4"><el-statistic title="脚本" :value="overview.counts?.scripts ?? 0" /></el-col>
        <el-col :span="4"><el-statistic title="执行" :value="overview.counts?.runs ?? 0" /></el-col>
        <el-col :span="4"><el-statistic title="缺陷" :value="overview.counts?.defects ?? 0" /></el-col>
      </el-row>

      <el-divider />

      <el-row :gutter="16">
        <el-col :span="12">
          <el-card shadow="never">
            <template #header>质量门禁</template>
            <p>
              状态：
              <el-tag :type="qualityTagType">{{ overview.quality_gate?.status || 'no_runs' }}</el-tag>
            </p>
            <p>通过率：{{ (overview.quality_gate?.pass_rate ?? 0).toFixed(2) }}%</p>
            <p>阈值：{{ overview.quality_gate?.threshold ?? 95 }}%</p>
            <p>原因：{{ overview.quality_gate?.reason || '-' }}</p>
          </el-card>
        </el-col>

        <el-col :span="12">
          <el-card shadow="never">
            <template #header>最新执行</template>
            <p>
              执行状态：
              <el-tag :type="runStatusType">{{ overview.latest_run?.status || 'none' }}</el-tag>
            </p>
            <p>执行模式：{{ overview.latest_run?.mode || '-' }}</p>
            <p>结果：{{ overview.latest_run?.passed_results ?? 0 }} / {{ overview.latest_run?.total_results ?? 0 }}</p>
            <p>通过率：{{ (overview.latest_run?.pass_rate ?? 0).toFixed(2) }}%</p>
          </el-card>
        </el-col>
      </el-row>

      <el-divider />

      <div class="run-box">
        <h3>触发 Demo 执行</h3>
        <el-space wrap>
          <el-select v-model="mode" style="width: 160px">
            <el-option label="全量(all)" value="all" />
            <el-option label="单脚本(one)" value="one" />
          </el-select>
          <el-input-number v-if="mode === 'one'" v-model="scriptId" :min="1" />
          <el-button type="success" :loading="running" @click="triggerRun">触发执行</el-button>
        </el-space>
      </div>

      <el-alert
        style="margin-top: 16px"
        type="info"
        :closable="false"
        title="默认请求头使用 X-User-ID（保存在 localStorage: tp-user-id），可直接切换 1/2/3 测试权限。"
      />
    </el-card>
  </div>
</template>
