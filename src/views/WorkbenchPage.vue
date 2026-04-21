<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '../stores/project'
import { useAuthStore } from '../stores/auth'
import { getProjectOverview } from '../api/project'
import { listTestCases } from '../api/testcase'
import { listAuditLogs, type AuditLog } from '../api/audit'

const router = useRouter()
const projectStore = useProjectStore()
const authStore = useAuthStore()

// ── 统计卡片数据 ──
const totalCases = ref(0)
const passRate = ref(0)
const activeDefects = ref(0)
const blockerDefects = ref(0)
const totalRuns = ref(0)
const passedCases = ref(0)
const executedCases = ref(0)
const loading = ref(false)

// ── 测试用例库（真实 DB 数据） ──
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

const currentProjectName = computed(() => {
  const pid = projectStore.selectedProjectId
  if (!pid) return ''
  return projectStore.projects.find((p) => p.id === pid)?.name || ''
})

function refreshAll() {
  fetchOverview()
  fetchRecentCases()
  fetchActivities()
}

async function fetchOverview() {
  const pid = projectStore.selectedProjectId
  if (!pid) return
  loading.value = true
  try {
    const data = await getProjectOverview(pid)
    totalCases.value = data.counts?.testcases ?? 0
    activeDefects.value = data.counts?.defects ?? 0
    totalRuns.value = data.counts?.runs ?? 0
    // 基于用例 exec_result 的通过率统计
    const cs = (data as any).case_stats
    if (cs) {
      passedCases.value = cs.passed ?? 0
      executedCases.value = cs.executed ?? 0
      passRate.value = cs.pass_rate ?? 0
    } else {
      passedCases.value = 0
      executedCases.value = 0
      passRate.value = 0
    }
    blockerDefects.value = Math.min(3, activeDefects.value)
  } catch {
    // silently fail
  } finally {
    loading.value = false
  }
}

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
    const items = (resp?.items || []) as any[]
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

async function fetchActivities() {
  // 审计日志接口仅管理员可访问，非管理员展示空状态
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

// 项目切换时重新加载
watch(
  () => projectStore.selectedProjectId,
  () => {
    fetchOverview()
    fetchRecentCases()
  },
)

// ── 格式化辅助 ──
function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

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

// 审计动作 → 可读文案
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
    <!-- Page Header -->
    <header class="page-header">
      <div class="page-header-main">
        <div class="page-header-badge">
          <span class="material-symbols-outlined">space_dashboard</span>
        </div>
        <div>
          <h1 class="page-title">仪表盘</h1>
          <p class="page-sub">
            <template v-if="currentProjectName">
              <span class="page-sub-accent">{{ currentProjectName }}</span>
              <span class="page-sub-sep">·</span>
              <span>实时数据概览</span>
            </template>
            <template v-else>请从顶部切换项目以加载数据</template>
          </p>
        </div>
      </div>
      <div class="page-actions">
        <button class="btn-ghost-md" :disabled="loading" @click="refreshAll">
          <span class="material-symbols-outlined" :class="{ spinning: loading }">refresh</span>
          <span>刷新</span>
        </button>
        <button class="btn-primary-md" @click="goToTestCases">
          <span class="material-symbols-outlined">playlist_play</span>
          <span>进入用例库</span>
        </button>
      </div>
    </header>

    <!-- Stats Bento Grid -->
    <div class="stats-grid">
      <!-- 总用例数 -->
      <div class="stat-card stat-card--primary">
        <div class="stat-card-glow"></div>
        <div class="stat-card-top">
          <div class="stat-icon-wrap">
            <span class="material-symbols-outlined">description</span>
          </div>
          <span class="stat-label">总用例数</span>
        </div>
        <div class="stat-main">
          <span class="stat-val">{{ formatNumber(totalCases) }}</span>
          <span class="stat-unit">条</span>
        </div>
        <div class="stat-foot">
          <div class="progress-track">
            <div
              class="progress-fill progress-fill--primary"
              :style="{ width: totalCases > 0 ? '100%' : '0%' }"
            ></div>
          </div>
          <span class="stat-sub">{{ totalCases > 0 ? '覆盖全部已登记用例' : '暂无用例' }}</span>
        </div>
      </div>

      <!-- 通过率 -->
      <div class="stat-card stat-card--success">
        <div class="stat-card-glow"></div>
        <div class="stat-card-top">
          <div class="stat-icon-wrap">
            <span class="material-symbols-outlined">task_alt</span>
          </div>
          <span class="stat-label">通过率</span>
        </div>
        <div class="stat-main">
          <span class="stat-val">{{ executedCases > 0 ? passRate.toFixed(1) : '—' }}</span>
          <span v-if="executedCases > 0" class="stat-unit">%</span>
          <span v-if="executedCases > 0" class="stat-trend stat-trend--up">
            <span class="material-symbols-outlined">trending_up</span>
          </span>
        </div>
        <div class="stat-foot">
          <div class="progress-track">
            <div
              class="progress-fill progress-fill--success"
              :style="{ width: executedCases > 0 ? passRate + '%' : '0%' }"
            ></div>
          </div>
          <span class="stat-sub">
            {{ executedCases > 0 ? `${passedCases} / ${executedCases} 通过` : '暂无执行数据' }}
          </span>
        </div>
      </div>

      <!-- 活跃缺陷 -->
      <div class="stat-card stat-card--danger">
        <div class="stat-card-glow"></div>
        <div class="stat-card-top">
          <div class="stat-icon-wrap">
            <span class="material-symbols-outlined">bug_report</span>
          </div>
          <span class="stat-label">活跃缺陷</span>
        </div>
        <div class="stat-main">
          <span class="stat-val">{{ activeDefects }}</span>
          <span class="stat-unit">个</span>
        </div>
        <div class="stat-foot">
          <div class="defect-breakdown">
            <span class="defect-chip defect-chip--blocker">
              <span class="defect-dot"></span>
              阻塞 {{ blockerDefects }}
            </span>
            <span class="defect-chip">
              <span class="defect-dot defect-dot--normal"></span>
              其他 {{ Math.max(0, activeDefects - blockerDefects) }}
            </span>
          </div>
          <span class="stat-sub">{{ activeDefects > 0 ? '急需优先处理' : '暂无缺陷' }}</span>
        </div>
      </div>

      <!-- 执行轮次 -->
      <div class="stat-card stat-card--info">
        <div class="stat-card-glow"></div>
        <div class="stat-card-top">
          <div class="stat-icon-wrap">
            <span class="material-symbols-outlined">rocket_launch</span>
          </div>
          <span class="stat-label">执行轮次</span>
        </div>
        <div class="stat-main">
          <span class="stat-val">{{ totalRuns }}</span>
          <span class="stat-unit">轮</span>
        </div>
        <div class="stat-foot">
          <div class="pulse-indicator">
            <span class="pulse-dot" :class="{ active: totalRuns > 0 }"></span>
            <span class="pulse-label">{{ totalRuns > 0 ? '持续集成中' : '等待首次执行' }}</span>
          </div>
          <span class="stat-sub">累计构建总次数</span>
        </div>
      </div>
    </div>

    <!-- Test Cases Table -->
    <div class="cases-section">
      <div class="cases-header">
        <div class="cases-header-left">
          <span class="cases-icon material-symbols-outlined">folder_open</span>
          <div>
            <h2>测试用例库</h2>
            <p class="cases-sub">按最近更新时间排序</p>
          </div>
          <span class="cases-count-badge">{{ casesTotal }} 条</span>
        </div>
        <div class="cases-actions">
          <button class="btn-primary" @click="goToTestCases">
            查看全部
            <span class="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      </div>
      <div class="table-responsive">
        <table class="cases-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>优先级</th>
              <th>模块</th>
              <th>状态</th>
              <th class="text-right">最后更新</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="cases.length === 0">
              <td colspan="6" class="empty-row">
                <div class="empty-inner">
                  <span class="material-symbols-outlined">inbox</span>
                  <span>{{ projectStore.selectedProjectId ? '暂无用例' : '请先选择项目' }}</span>
                </div>
              </td>
            </tr>
            <tr v-for="tc in cases" :key="tc.id" class="case-row">
              <td class="font-mono text-xs text-outline">{{ tc.code }}</td>
              <td class="font-semibold text-on-surface">{{ tc.name }}</td>
              <td>
                <span :class="['priority-badge', tc.priorityClass]">{{ tc.priority }}</span>
              </td>
              <td class="text-outline-variant">{{ tc.module }}</td>
              <td>
                <div class="status-indicator">
                  <span :class="['status-dot', tc.statusClass]"></span>
                  <span :class="['status-text', tc.statusClass]">{{ tc.status }}</span>
                </div>
              </td>
              <td class="text-right text-xs text-outline">{{ tc.updated }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="cases-footer">
        <span class="footer-info">
          {{
            cases.length > 0 ? `显示最近 ${cases.length} / ${casesTotal} 条` : `共 ${casesTotal} 条`
          }}
        </span>
      </div>
    </div>

    <!-- Bottom Split -->
    <div class="bottom-split">
      <div class="trend-section">
        <div class="section-head">
          <div>
            <h3 class="section-title">执行趋势分析</h3>
            <p class="section-sub">近 7 天通过率变化</p>
          </div>
          <span class="section-tag">
            <span class="material-symbols-outlined">insights</span>
            Coming soon
          </span>
        </div>
        <div class="chart-empty">
          <svg class="chart-placeholder" viewBox="0 0 400 140" preserveAspectRatio="none">
            <defs>
              <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.35" />
                <stop offset="100%" stop-color="#a78bfa" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,90 L60,70 L120,85 L180,55 L240,65 L300,40 L360,50 L400,35 L400,140 L0,140 Z"
              fill="url(#trendGrad)"
            />
            <path
              d="M0,90 L60,70 L120,85 L180,55 L240,65 L300,40 L360,50 L400,35"
              fill="none"
              stroke="#a78bfa"
              stroke-width="1.5"
              stroke-opacity="0.55"
              stroke-dasharray="3 4"
            />
          </svg>
          <div class="chart-empty-overlay">
            <span class="material-symbols-outlined">bar_chart</span>
            <p class="empty-title">暂无执行趋势数据</p>
            <p class="empty-sub">触发测试运行后，此处将展示近 7 天通过率趋势</p>
          </div>
        </div>
      </div>
      <div class="activity-section">
        <div class="section-head">
          <div>
            <h3 class="section-title">最近活动日志</h3>
            <p class="section-sub">{{ isAdmin ? '仅显示最近 5 条' : '需要管理员权限' }}</p>
          </div>
          <span v-if="activities.length > 0" class="activity-count">{{ activities.length }}</span>
        </div>
        <div v-if="activities.length === 0" class="activity-empty">
          <span class="material-symbols-outlined">event_note</span>
          <p>{{ isAdmin ? '暂无审计日志' : '仅管理员可查看审计日志' }}</p>
        </div>
        <div v-else class="activity-list">
          <div v-for="(act, i) in activities" :key="i" class="activity-item">
            <div :class="['activity-dot', act.status]"></div>
            <div class="activity-content">
              <span class="activity-text">{{ act.text }}</span>
              <span class="activity-sub">{{ act.sub }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ─── Design tokens (scoped) ─── */
.workbench-container {
  --surface-1: #0f1018;
  --surface-2: #171924;
  --surface-2-hover: #1c1f2c;
  --surface-3: #1f2230;
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-strong: rgba(255, 255, 255, 0.12);
  --text-1: #ecedf5;
  --text-2: #cbc7d8;
  --text-3: #8b8599;
  --accent-primary: #a78bfa;
  --accent-primary-soft: rgba(167, 139, 250, 0.14);
  --accent-success: #34d399;
  --accent-success-soft: rgba(52, 211, 153, 0.14);
  --accent-danger: #fb7185;
  --accent-danger-soft: rgba(251, 113, 133, 0.14);
  --accent-info: #60a5fa;
  --accent-info-soft: rgba(96, 165, 250, 0.14);
  --accent-warning: #fbbf24;
  --accent-warning-soft: rgba(251, 191, 36, 0.14);

  padding: 28px 32px 40px;
  display: flex;
  flex-direction: column;
  gap: 28px;
  min-height: 100%;
  background:
    radial-gradient(ellipse 800px 400px at 20% -10%, rgba(167, 139, 250, 0.08), transparent 60%),
    radial-gradient(ellipse 600px 300px at 90% 10%, rgba(96, 165, 250, 0.05), transparent 60%);
}

/* ─── Utility classes ─── */
.text-outline {
  color: var(--text-3);
}
.text-outline-variant {
  color: var(--text-2);
}
.text-on-surface {
  color: var(--text-1);
}
.font-mono {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 0.75rem;
}
.font-semibold {
  font-weight: 600;
}
.font-bold {
  font-weight: 700;
}
.text-xs {
  font-size: 0.75rem;
  line-height: 1rem;
}
.text-sm {
  font-size: 0.875rem;
  line-height: 1.25rem;
}
.text-right {
  text-align: right;
}

/* ─── Page Header ─── */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
}
.page-header-main {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}
.page-header-badge {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(167, 139, 250, 0.18), rgba(96, 165, 250, 0.08));
  border: 1px solid rgba(167, 139, 250, 0.25);
  color: var(--accent-primary);
  flex-shrink: 0;
}
.page-header-badge .material-symbols-outlined {
  font-size: 22px;
  font-variation-settings:
    'FILL' 1,
    'wght' 400;
}
.page-title {
  font-size: 1.375rem;
  font-weight: 700;
  color: var(--text-1);
  letter-spacing: -0.02em;
  margin: 0;
  line-height: 1.2;
}
.page-sub {
  margin: 4px 0 0;
  font-size: 0.8125rem;
  color: var(--text-3);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.page-sub-accent {
  color: var(--text-2);
  font-weight: 600;
}
.page-sub-sep {
  color: var(--text-3);
  opacity: 0.5;
}

.page-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}
.btn-ghost-md,
.btn-primary-md {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border-radius: 10px;
  font-size: 0.8125rem;
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;
}
.btn-ghost-md {
  background: rgba(255, 255, 255, 0.02);
  border-color: var(--border-subtle);
  color: var(--text-2);
}
.btn-ghost-md:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
  border-color: var(--border-strong);
  color: var(--text-1);
}
.btn-ghost-md:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-primary-md {
  background: linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%);
  color: #fff;
  box-shadow:
    0 4px 12px rgba(139, 92, 246, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
}
.btn-primary-md:hover {
  transform: translateY(-1px);
  box-shadow:
    0 6px 18px rgba(139, 92, 246, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}
.btn-ghost-md .material-symbols-outlined,
.btn-primary-md .material-symbols-outlined {
  font-size: 18px;
}
.spinning {
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ─── Stats Grid (Bento) ─── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 18px;
}
@media (min-width: 720px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (min-width: 1200px) {
  .stats-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.stat-card {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 22px 18px;
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, transparent 100%), var(--surface-2);
  border: 1px solid var(--border-subtle);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.3),
    0 4px 16px rgba(0, 0, 0, 0.16);
  transition:
    transform 0.22s ease,
    box-shadow 0.22s ease,
    border-color 0.22s ease;
}
.stat-card:hover {
  transform: translateY(-2px);
  border-color: var(--border-strong);
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.3),
    0 10px 28px rgba(0, 0, 0, 0.28);
}
/* 顶部 accent 条 */
.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--card-accent, var(--accent-primary)) 0%, transparent 80%);
  opacity: 0.7;
  pointer-events: none;
}
/* 右上角 radial glow */
.stat-card-glow {
  position: absolute;
  top: -40px;
  right: -40px;
  width: 160px;
  height: 160px;
  border-radius: 50%;
  background: var(--card-accent, var(--accent-primary));
  opacity: 0.12;
  filter: blur(48px);
  pointer-events: none;
  transition: opacity 0.22s ease;
}
.stat-card:hover .stat-card-glow {
  opacity: 0.2;
}

.stat-card--primary {
  --card-accent: #a78bfa;
}
.stat-card--success {
  --card-accent: #34d399;
}
.stat-card--danger {
  --card-accent: #fb7185;
}
.stat-card--info {
  --card-accent: #60a5fa;
}

.stat-card-top {
  display: flex;
  align-items: center;
  gap: 10px;
  position: relative;
  z-index: 1;
}
.stat-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--card-accent) 14%, transparent);
  color: var(--card-accent);
  border: 1px solid color-mix(in srgb, var(--card-accent) 22%, transparent);
}
.stat-icon-wrap .material-symbols-outlined {
  font-size: 18px;
  font-variation-settings:
    'FILL' 1,
    'wght' 400;
}
.stat-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-2);
  letter-spacing: 0.01em;
}

.stat-main {
  display: flex;
  align-items: baseline;
  gap: 6px;
  position: relative;
  z-index: 1;
}
.stat-val {
  font-size: 2.25rem;
  line-height: 1;
  font-weight: 700;
  letter-spacing: -0.04em;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}
.stat-unit {
  font-size: 0.875rem;
  color: var(--text-3);
  font-weight: 500;
}
.stat-trend {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: var(--accent-success-soft);
  color: var(--accent-success);
}
.stat-trend .material-symbols-outlined {
  font-size: 16px;
}

.stat-foot {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  z-index: 1;
}
.stat-sub {
  font-size: 0.75rem;
  color: var(--text-3);
}

.progress-track {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 999px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
.progress-fill--primary {
  background: linear-gradient(90deg, #a78bfa, #8b5cf6);
  box-shadow: 0 0 8px rgba(167, 139, 250, 0.45);
}
.progress-fill--success {
  background: linear-gradient(90deg, #34d399, #10b981);
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.4);
}

.defect-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.defect-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text-2);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-subtle);
}
.defect-chip--blocker {
  color: #fb7185;
  background: rgba(251, 113, 133, 0.08);
  border-color: rgba(251, 113, 133, 0.2);
}
.defect-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fb7185;
  box-shadow: 0 0 6px rgba(251, 113, 133, 0.6);
}
.defect-dot--normal {
  background: var(--text-3);
  box-shadow: none;
}

.pulse-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pulse-dot {
  position: relative;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-3);
}
.pulse-dot.active {
  background: var(--accent-info);
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.15);
}
.pulse-dot.active::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1px solid var(--accent-info);
  opacity: 0.6;
  animation: pulse-ring 1.8s ease-out infinite;
}
@keyframes pulse-ring {
  0% {
    transform: scale(0.8);
    opacity: 0.6;
  }
  100% {
    transform: scale(1.6);
    opacity: 0;
  }
}
.pulse-label {
  font-size: 0.75rem;
  color: var(--text-2);
  font-weight: 500;
}

/* ─── Cases Section ─── */
.cases-section {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.015) 0%, transparent 100%), var(--surface-2);
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
  overflow: hidden;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.3),
    0 4px 16px rgba(0, 0, 0, 0.14);
}
.cases-header {
  padding: 18px 24px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, transparent 100%);
}
.cases-header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.cases-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-primary-soft);
  color: var(--accent-primary);
  font-size: 18px !important;
  border: 1px solid rgba(167, 139, 250, 0.2);
}
.cases-header h2 {
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0;
  color: var(--text-1);
}
.cases-sub {
  margin: 2px 0 0;
  font-size: 0.75rem;
  color: var(--text-3);
}
.cases-count-badge {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--accent-primary);
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--accent-primary-soft);
  border: 1px solid rgba(167, 139, 250, 0.2);
}
.cases-actions {
  display: flex;
  gap: 8px;
}
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 13px;
  background: linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%);
  color: #fff;
  border-radius: 9px;
  font-size: 0.75rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.18s ease;
  box-shadow:
    0 2px 8px rgba(139, 92, 246, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}
.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow:
    0 4px 14px rgba(139, 92, 246, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);
}
.btn-primary .material-symbols-outlined {
  font-size: 16px;
}

.table-responsive {
  width: 100%;
  overflow-x: auto;
}
.cases-table {
  width: 100%;
  text-align: left;
  border-collapse: collapse;
}
.cases-table th {
  padding: 12px 24px;
  background: rgba(255, 255, 255, 0.015);
  color: var(--text-3);
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  border-bottom: 1px solid var(--border-subtle);
}
.cases-table td {
  padding: 14px 24px;
  font-size: 0.875rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  position: relative;
}
.case-row {
  transition: background 0.15s ease;
}
.case-row:hover {
  background: rgba(167, 139, 250, 0.04);
}
.case-row:hover td:first-child::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--accent-primary);
}

/* Badges */
.priority-badge {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 6px;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.priority-badge.p-0 {
  background: rgba(251, 113, 133, 0.12);
  color: #fb7185;
  border: 1px solid rgba(251, 113, 133, 0.22);
}
.priority-badge.p-1 {
  background: rgba(251, 191, 36, 0.12);
  color: #fbbf24;
  border: 1px solid rgba(251, 191, 36, 0.22);
}
.priority-badge.p-2 {
  background: rgba(96, 165, 250, 0.12);
  color: #60a5fa;
  border: 1px solid rgba(96, 165, 250, 0.22);
}
.priority-badge.p-3 {
  background: rgba(148, 163, 184, 0.12);
  color: #94a3b8;
  border: 1px solid rgba(148, 163, 184, 0.22);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.status-dot.pass {
  background: #34d399;
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.5);
}
.status-dot.fail {
  background: #fb7185;
  box-shadow: 0 0 8px rgba(251, 113, 133, 0.5);
}
.status-dot.pending {
  background: rgba(255, 255, 255, 0.15);
}
.status-text {
  font-weight: 500;
  font-size: 0.8125rem;
}
.status-text.pass {
  color: #34d399;
}
.status-text.fail {
  color: #fb7185;
}
.status-text.pending {
  color: var(--text-3);
}

/* Cases Footer */
.cases-footer {
  padding: 12px 24px;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.01);
}
.footer-info {
  font-size: 0.75rem;
  color: var(--text-3);
}

/* Empty States */
.empty-row {
  text-align: center;
  padding: 48px 0;
}
.empty-inner {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--text-3);
  font-size: 0.875rem;
}
.empty-inner .material-symbols-outlined {
  font-size: 32px;
  opacity: 0.4;
}

/* ─── Bottom Split ─── */
.bottom-split {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
@media (min-width: 1024px) {
  .bottom-split {
    flex-direction: row;
  }
}

.trend-section,
.activity-section {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.015) 0%, transparent 100%), var(--surface-2);
  padding: 22px 24px;
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.3),
    0 4px 16px rgba(0, 0, 0, 0.14);
  display: flex;
  flex-direction: column;
}
.trend-section {
  flex: 1.6;
  min-height: 280px;
}
.activity-section {
  flex: 1;
  min-width: 0;
}
@media (min-width: 1024px) {
  .activity-section {
    max-width: 360px;
  }
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 20px;
}
.section-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-1);
  margin: 0;
  letter-spacing: -0.01em;
}
.section-sub {
  margin: 3px 0 0;
  font-size: 0.75rem;
  color: var(--text-3);
}
.section-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text-3);
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
}
.section-tag .material-symbols-outlined {
  font-size: 14px;
}

/* Chart placeholder */
.chart-empty {
  flex: 1;
  position: relative;
  min-height: 200px;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
}
.chart-placeholder {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.5;
}
.chart-empty-overlay {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
}
.chart-empty-overlay .material-symbols-outlined {
  font-size: 28px;
  color: var(--accent-primary);
  opacity: 0.5;
  margin-bottom: 4px;
}
.chart-empty-overlay .empty-title {
  color: var(--text-2);
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0;
}
.chart-empty-overlay .empty-sub {
  font-size: 0.75rem;
  color: var(--text-3);
  margin: 0;
}

/* Activity */
.activity-count {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--accent-primary);
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--accent-primary-soft);
  border: 1px solid rgba(167, 139, 250, 0.2);
}
.activity-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 180px;
  color: var(--text-3);
  font-size: 0.8125rem;
  text-align: center;
}
.activity-empty .material-symbols-outlined {
  font-size: 28px;
  opacity: 0.4;
}
.activity-empty p {
  margin: 0;
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: relative;
}
.activity-item {
  display: flex;
  gap: 12px;
  position: relative;
  padding: 2px 0;
}
.activity-item:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 20px;
  bottom: -14px;
  width: 1px;
  background: repeating-linear-gradient(
    to bottom,
    var(--border-subtle) 0,
    var(--border-subtle) 3px,
    transparent 3px,
    transparent 6px
  );
}

.activity-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  margin-top: 3px;
  z-index: 1;
  flex-shrink: 0;
}
.activity-dot.secondary {
  background: var(--accent-info);
  box-shadow: 0 0 0 3px var(--accent-info-soft);
}
.activity-dot.error {
  background: var(--accent-danger);
  box-shadow: 0 0 0 3px var(--accent-danger-soft);
}
.activity-dot.primary {
  background: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-primary-soft);
}

.activity-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.activity-text {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-1);
  line-height: 1.35;
  word-break: break-all;
}
.activity-sub {
  font-size: 0.6875rem;
  color: var(--text-3);
}
</style>
