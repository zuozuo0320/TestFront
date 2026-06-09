<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '../stores/project'
import { useAuthStore } from '../stores/auth'
import { getProjectOverview } from '../api/project'
import { listTestCases } from '../api/testcase'
import { listAuditLogs, type AuditLog } from '../api/audit'

// 导入子组件
import WorkbenchCharts from '../components/WorkbenchCharts.vue'
import WorkbenchReviewBoard from '../components/WorkbenchReviewBoard.vue'
import WorkbenchAiEfficiency from '../components/WorkbenchAiEfficiency.vue'
import WorkbenchRunTrends from '../components/WorkbenchRunTrends.vue'
import WorkbenchActivities from '../components/WorkbenchActivities.vue'

interface OverviewCaseStats {
  passed?: number
  executed?: number
  pass_rate?: number
}

type OverviewWithCaseStats = Awaited<ReturnType<typeof getProjectOverview>> & {
  case_stats?: OverviewCaseStats
}

const router = useRouter()
const projectStore = useProjectStore()
const authStore = useAuthStore()

// ── 统计卡片数据 ──
const totalCases = ref(0)
const passRate = ref(0)
interface LatestRunInfo {
  id?: number
  status?: string
  mode?: string
  created_at?: string
  total_results?: number
  passed_results?: number
  pass_rate?: number
}

const activeDefects = ref(0)
const totalRuns = ref(0)
const passedCases = ref(0)
const executedCases = ref(0)
const loading = ref(false)
const latestRunData = ref<LatestRunInfo | null>(null)

// ── 测试用例列表数据 ──
interface CaseRow {
  id: number
  code: string
  name: string
  priority: string
  priorityClass: string
  module: string
  status: string
  statusClass: string
  updated: string
}
const cases = ref<CaseRow[]>([])
const casesTotal = ref(0)

// ── 最近活动日志（真实审计日志） ──
interface ActivityItem {
  text: string
  sub: string
  status: 'primary' | 'secondary' | 'error'
}
const activities = ref<ActivityItem[]>([])

const isAdmin = computed(() => authStore.user?.role === 'admin')
const requirementsCount = ref(0)
const scriptsCount = ref(0)

// 获取项目概览统计
async function fetchOverview() {
  const pid = projectStore.selectedProjectId
  if (!pid) return
  loading.value = true
  try {
    const data = (await getProjectOverview(pid)) as OverviewWithCaseStats
    totalCases.value = data.counts?.testcases ?? 0
    activeDefects.value = data.counts?.defects ?? 0
    totalRuns.value = data.counts?.runs ?? 0
    requirementsCount.value = data.counts?.requirements ?? 0
    scriptsCount.value = data.counts?.scripts ?? 0

    const cs = data.case_stats
    if (cs) {
      passedCases.value = cs.passed ?? 0
      executedCases.value = cs.executed ?? 0
      passRate.value = cs.pass_rate ?? 0
    } else {
      passedCases.value = 0
      executedCases.value = 0
      passRate.value = 0
    }

    // 获取最新一轮执行结果
    const latest = data.latest_run as LatestRunInfo | undefined
    if (latest && latest.id) {
      latestRunData.value = latest
    } else {
      latestRunData.value = null
    }
  } catch {
    // 接口异常时静默失败
  } finally {
    loading.value = false
  }
}

// 获取用例列表
async function fetchRecentCases() {
  const pid = projectStore.selectedProjectId
  if (!pid) {
    cases.value = []
    casesTotal.value = 0
    return
  }
  try {
    const resp = await listTestCases(pid, {
      page: 1,
      pageSize: 5,
      sortBy: 'updated_at',
      sortOrder: 'desc',
    })
    const items = resp?.items || []
    cases.value = items.map((it) => ({
      id: it.id,
      code: `TC-${String(it.id).padStart(4, '0')}`,
      name: it.title || '-',
      priority: mapLevelLabel(it.level),
      priorityClass: mapLevelClass(it.level),
      module: it.module_path || '未分类',
      status: mapExecResultLabel(it.exec_result),
      statusClass: mapExecResultClass(it.exec_result),
      updated: formatRelativeTime(it.updated_at),
    }))
    casesTotal.value = resp?.total ?? 0
  } catch {
    cases.value = []
    casesTotal.value = 0
  }
}

// 获取审计日志
async function fetchActivities() {
  if (!isAdmin.value) {
    activities.value = []
    return
  }
  try {
    const logs = await listAuditLogs()
    activities.value = logs.slice(0, 5).map(mapAuditLogToActivity)
  } catch {
    activities.value = []
  }
}

onMounted(() => {
  fetchOverview()
  fetchRecentCases()
  fetchActivities()
})

watch(
  () => projectStore.selectedProjectId,
  () => {
    fetchOverview()
    fetchRecentCases()
  },
)

// ── 格式化辅助 ──
function mapLevelLabel(level?: string): string {
  const l = (level || '').toUpperCase()
  if (l === 'P0' || l === 'P1' || l === 'P2' || l === 'P3') return l
  if (l === 'HIGH') return 'P0'
  if (l === 'MEDIUM') return 'P1'
  if (l === 'LOW') return 'P2'
  return 'P2'
}

function mapLevelClass(level?: string): string {
  const l = mapLevelLabel(level)
  return `p-${l.charAt(1)}`
}

function mapExecResultLabel(exec?: string): string {
  const e = (exec || '').toLowerCase()
  if (e === 'passed' || e === 'pass' || e === '通过') return '通过'
  if (e === 'failed' || e === 'fail' || e === '失败') return '失败'
  if (e === 'blocked' || e === '阻塞') return '阻塞'
  if (e === 'skipped' || e === '跳过') return '跳过'
  return '未运行'
}

function mapExecResultClass(exec?: string): string {
  const label = mapExecResultLabel(exec)
  if (label === '通过') return 'pass'
  if (label === '失败') return 'fail'
  if (label === '阻塞') return 'fail'
  return 'pending'
}

function formatRelativeTime(iso?: string): string {
  if (!iso) return '-'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const diff = Date.now() - t
  const minutes = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return iso.substring(0, 10)
}

const actionLabelMap: Record<string, string> = {
  'user.create': '创建了用户',
  'user.update': '更新了用户信息',
  'user.delete': '删除了用户',
  'user.toggle_active': '切换了用户启用状态',
  'user.reset_password': '重置了用户密码',
  'user.assign_roles': '调整了用户角色',
  'profile.update': '更新了个人资料',
  'profile.avatar_upload': '更新了头像',
  'project.create': '创建了项目',
  'project.update': '更新了项目信息',
  'project.archive': '归档了项目',
  'project.restore': '恢复了项目',
  'project.delete': '删除了项目',
  'testcase.create': '创建了测试用例',
  'testcase.update': '更新了测试用例',
  'testcase.delete': '删除了测试用例',
  'testcase.batch_delete': '批量删除了用例',
  'role.create': '新建了角色',
  'role.update': '更新了角色',
  'role.delete': '删除了角色',
}

function mapAuditLogToActivity(log: AuditLog): ActivityItem {
  const action = actionLabelMap[log.action] || log.action
  const text = `${action} · ${log.target_type}#${log.target_id}`
  const status: ActivityItem['status'] = log.action.includes('delete')
    ? 'error'
    : log.action.includes('create')
      ? 'primary'
      : 'secondary'
  return {
    text,
    sub: `${formatRelativeTime(log.created_at)} · ${log.target_type}`,
    status,
  }
}

function goToTestCases() {
  router.push('/testcases')
}
</script>

<template>
  <div class="workbench-container">
    <!-- 双列图表与看板网格 -->
    <div class="workbench-grid">
      <!-- 左列：质量图表、用例评审、用例库列表 -->
      <div style="display: flex; flex-direction: column; gap: 20px; min-width: 0">
        <!-- 多维用例分布 -->
        <WorkbenchCharts :total-cases="totalCases" />

        <!-- 用例评审与门禁看板 -->
        <WorkbenchReviewBoard />

        <!-- 测试用例库（近 5 条记录列表） -->
        <div class="workbench-card" style="padding: 0; overflow: hidden">
          <div
            class="card-head"
            style="padding: 16px 20px; border-bottom: 1px solid var(--tp-border-subtle)"
          >
            <div class="card-head-left">
              <span class="material-symbols-outlined card-icon">folder_open</span>
              <div>
                <h3 class="card-title">测试用例库摘要</h3>
                <p class="card-sub">按最新更新时间排序</p>
              </div>
            </div>
            <button class="card-action-btn" @click="goToTestCases">
              全部用例
              <span class="material-symbols-outlined" style="font-size: 14px">arrow_forward</span>
            </button>
          </div>

          <div class="table-responsive">
            <table class="cases-table">
              <thead>
                <tr>
                  <th style="width: 100px">ID</th>
                  <th>用例标题</th>
                  <th style="width: 80px">优先级</th>
                  <th style="width: 120px">模块</th>
                  <th style="width: 100px">执行状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="cases.length === 0">
                  <td
                    colspan="5"
                    style="
                      text-align: center;
                      padding: var(--tp-space-8) 0;
                      color: var(--tp-text-subtle);
                    "
                  >
                    {{ projectStore.selectedProjectId ? '暂无用例数据' : '请先选择项目' }}
                  </td>
                </tr>
                <tr v-for="tc in cases" :key="tc.id" class="case-row">
                  <td class="font-mono" style="color: var(--tp-text-subtle)">{{ tc.code }}</td>
                  <td class="text-on-surface" style="word-break: break-all">{{ tc.name }}</td>
                  <td>
                    <span :class="['priority-badge', tc.priorityClass]">{{ tc.priority }}</span>
                  </td>
                  <td style="color: var(--tp-text-secondary)">{{ tc.module }}</td>
                  <td>
                    <div class="status-indicator">
                      <span :class="['status-dot', tc.statusClass]"></span>
                      <span :class="['status-text', tc.statusClass]">{{ tc.status }}</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="cases-footer" style="padding: 10px 20px">
            <span class="footer-info">显示最近 {{ cases.length }} / {{ casesTotal }} 条用例</span>
          </div>
        </div>
      </div>

      <!-- 右列：AI 效能、执行趋势、活动 timeline -->
      <div style="display: flex; flex-direction: column; gap: 20px; min-width: 0">
        <!-- AI 研发效能中心 -->
        <WorkbenchAiEfficiency
          :requirements-count="requirementsCount"
          :scripts-count="scriptsCount"
          :total-cases="totalCases"
        />

        <!-- 测试运行趋势与最近执行记录 -->
        <WorkbenchRunTrends :total-runs="totalRuns" :latest-run="latestRunData" />

        <!-- 最近活动审计日志 -->
        <WorkbenchActivities :activities="activities" :is-admin="isAdmin" />
      </div>
    </div>
  </div>
</template>

<style>
/* 引入重构后的全局工作台独立样式 */
@import '../styles/workbench.css';
</style>
