<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useProjectStore } from '../stores/project'
import { getProjectOverview } from '../api/project'

const projectStore = useProjectStore()

// ── 统计卡片数据 ──
const totalCases = ref(0)
const passRate = ref(0)
const activeDefects = ref(0)
const blockerDefects = ref(0)
const totalRuns = ref(0)
const passedCases = ref(0)
const executedCases = ref(0)
const loading = ref(false)

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
    }
    blockerDefects.value = Math.min(3, activeDefects.value)
  } catch {
    // silently fail
  } finally {
    loading.value = false
  }
}

onMounted(() => fetchOverview())

// 项目切换时重新加载
watch(() => projectStore.selectedProjectId, () => fetchOverview())

// ── 格式化辅助 ──
function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

const activities = [
  { text: 'Li Wei 启动了回归测试集', sub: '10分钟前 · 运行 ID #4421', status: 'secondary' },
  { text: '检测到阻塞级缺陷 B-249', sub: '45分钟前 · 登录模块', status: 'error' },
  { text: '自动化套件同步完成', sub: '1小时前 · Cloud Hub', status: 'primary' }
]

const testCases = [
  { id: 'TC-2401', name: '验证 OAuth2 社交登录流程', priority: 'P0', priorityClass: 'p-0', module: '登录模块', status: '通过', statusClass: 'pass', updated: '2小时前' },
  { id: 'TC-2412', name: '重置密码邮件发送频率限制', priority: 'P1', priorityClass: 'p-1', module: '登录模块', status: '失败', statusClass: 'fail', updated: '5小时前' },
  { id: 'TC-2435', name: '多因素验证 (MFA) 设备解绑', priority: 'P2', priorityClass: 'p-2', module: '安全设置', status: '未运行', statusClass: 'pending', updated: '昨天 18:30' },
  { id: 'TC-2458', name: '新注册用户默认权限集校验', priority: 'P0', priorityClass: 'p-0', module: '用户管理', status: '通过', statusClass: 'pass', updated: '2天前' },
  { id: 'TC-2460', name: '大批量数据导入超时处理', priority: 'P1', priorityClass: 'p-1', module: '数据模块', status: '通过', statusClass: 'pass', updated: '3天前' }
]

const trends = [
  { percent: '75%', height: '75%' },
  { percent: '50%', height: '50%' },
  { percent: '80%', height: '80%' },
  { percent: '65%', height: '65%' },
  { percent: '100%', height: '100%' },
  { percent: '60%', height: '60%' }
]
const days = ['周一', '周二', '周三', '周四', '周五', '周六']
</script>

<template>
  <div class="workbench-container">
    <!-- Stats Bento Grid -->
    <div class="stats-grid">
      <div class="stat-card group relative overflow-hidden">
        <div class="card-glow"></div>
        <div class="stat-label">总用例数</div>
        <div class="stat-main">
          <span class="stat-val">{{ formatNumber(totalCases) }}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: totalCases > 0 ? '100%' : '0%' }"></div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">通过率</div>
        <div class="stat-main">
          <span class="stat-val">{{ executedCases > 0 ? passRate.toFixed(1) + '%' : 'N/A' }}</span>
          <span v-if="executedCases > 0" class="material-symbols-outlined stat-icon positive text-sm">trending_up</span>
        </div>
        <p class="stat-sub">{{ executedCases > 0 ? `${passedCases} / ${executedCases} 通过` : '暂无执行数据' }}</p>
      </div>
      <div class="stat-card border-error">
        <div class="stat-label">活跃缺陷</div>
        <div class="stat-main">
          <span class="stat-val error">{{ activeDefects }}</span>
          <span class="stat-delta text-outline">/ {{ blockerDefects }}个阻塞级</span>
        </div>
        <p class="stat-sub">{{ activeDefects > 0 ? '急需处理' : '暂无缺陷' }}</p>
      </div>
      <div class="stat-card">
        <div class="stat-label">执行轮次</div>
        <div class="stat-main">
          <span class="stat-val">{{ totalRuns }}</span>
          <span class="stat-delta text-outline">总轮次</span>
        </div>
        <p class="stat-sub">{{ totalRuns > 0 ? '持续集成中' : '暂无执行记录' }}</p>
      </div>
    </div>

    <!-- Test Cases Table -->
    <div class="cases-section">
      <div class="cases-header">
        <h2>测试用例库</h2>
        <div class="cases-actions">
          <button class="btn-ghost">筛选</button>
          <button class="btn-ghost">导出</button>
          <button class="btn-primary">新建用例</button>
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
            <tr v-for="tc in testCases" :key="tc.id">
              <td class="font-mono text-xs text-outline">{{ tc.id }}</td>
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
        <span class="footer-info">显示 1-5 共 124 个条目</span>
        <div class="pagination">
          <button class="page-btn disabled"><span class="material-symbols-outlined text-sm">chevron_left</span></button>
          <button class="page-btn active">1</button>
          <button class="page-btn font-bold">2</button>
          <button class="page-btn font-bold">3</button>
          <button class="page-btn"><span class="material-symbols-outlined text-sm">chevron_right</span></button>
        </div>
      </div>
    </div>

    <!-- Bottom Split -->
    <div class="bottom-split">
      <div class="trend-section">
        <h3 class="section-title">执行趋势分析</h3>
        <div class="chart-area">
          <div class="chart-bars">
            <div class="bar-group" v-for="(t, idx) in trends" :key="idx">
              <div class="bar-fill" :style="{ height: t.height }"></div>
              <div class="bar-tooltip">{{ t.percent }}</div>
            </div>
          </div>
          <div class="chart-labels">
            <span v-for="d in days" :key="d">{{ d }}</span>
          </div>
        </div>
      </div>
      <div class="activity-section">
        <h3 class="section-title">最近活动日志</h3>
        <div class="activity-list">
          <div class="activity-item" v-for="(act, i) in activities" :key="i">
            <div :class="['activity-dot', act.status]"></div>
            <div class="activity-content">
              <span class="activity-text">{{ act.text }}</span>
              <span class="activity-sub">{{ act.sub }}</span>
            </div>
          </div>
        </div>
        <button class="view-all-btn">查看全部活动</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workbench-container {
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 32px;
  min-height: 100%;
}

.text-outline { color: #958da1; }
.text-outline-variant { color: #ccc3d8; }
.text-on-surface { color: #e1e1f2; }
.font-mono { font-family: monospace; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }
.text-xs { font-size: 0.75rem; line-height: 1rem; }
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }
.text-right { text-align: right; }

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 24px;
}
@media (min-width: 768px) {
  .stats-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
.stat-card {
  background-color: #191b26;
  padding: 24px;
  border-radius: 0.75rem;
  border: 1px solid rgba(149, 141, 161, 0.15);
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
}
.stat-card.border-error {
  border-left: 2px solid rgba(255, 180, 171, 0.5);
}

.card-glow {
  position: absolute;
  top: 0;
  right: 0;
  width: 96px;
  height: 96px;
  background-color: rgba(210, 187, 255, 0.05);
  border-radius: 9999px;
  margin-right: -32px;
  margin-top: -32px;
  filter: blur(24px);
}

.stat-label {
  font-size: 10px;
  font-weight: 700;
  color: #ccc3d8;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.stat-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.stat-val {
  font-size: 2.25rem;
  line-height: 2.5rem;
  font-weight: 600;
  letter-spacing: -0.05em;
}
.stat-val.error { color: #ffb4ab; }
.stat-delta { font-size: 0.75rem; font-weight: 700; }
.stat-delta.positive { color: #10b981; }
.stat-icon.positive { color: #10b981; font-variation-settings: 'FILL' 1; }

.stat-sub { font-size: 0.75rem; color: #958da1; margin-top: 16px; }

.progress-track {
  width: 100%;
  height: 4px;
  background-color: #1d1f2b;
  border-radius: 9999px;
  margin-top: 16px;
  overflow: hidden;
}
.progress-fill {
  background-color: #d2bbff;
  height: 100%;
}

/* Cases Section */
.cases-section {
  background-color: #191b26;
  border-radius: 0.75rem;
  border: 1px solid rgba(149, 141, 161, 0.15);
  overflow: hidden;
}
.cases-header {
  padding: 16px 24px;
  border-bottom: 1px solid rgba(74, 68, 85, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.cases-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  letter-spacing: -0.025em;
  margin: 0;
}
.cases-actions {
  display: flex;
  gap: 8px;
}
.btn-ghost {
  padding: 6px 12px;
  background-color: #272935;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  border: none;
  color: #e1e1f2;
  cursor: pointer;
  transition: background-color 0.2s;
}
.btn-ghost:hover { background-color: #373845; }
.btn-primary {
  padding: 6px 12px;
  background-color: #7c3aed;
  color: #ede0ff;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-primary:hover { opacity: 0.9; }

.table-responsive { width: 100%; overflow-x: auto; }
.cases-table {
  width: 100%;
  text-align: left;
  border-collapse: collapse;
}
.cases-table th {
  padding: 16px 24px;
  background-color: rgba(29, 31, 43, 0.5);
  color: #ccc3d8;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
}
.cases-table td {
  padding: 16px 24px;
  font-size: 0.875rem;
  border-bottom: 1px solid rgba(74, 68, 85, 0.05);
}
.cases-table tr:hover {
  background-color: #1d1f2b;
}

/* Badges */
.priority-badge {
  padding: 2px 8px;
  border-radius: 0.25rem;
  font-size: 10px;
  font-weight: 700;
}
.priority-badge.p-0 { background-color: rgba(239, 68, 68, 0.1); color: #ef4444; }
.priority-badge.p-1 { background-color: rgba(245, 158, 11, 0.1); color: #f59e0b; }
.priority-badge.p-2 { background-color: rgba(59, 130, 246, 0.1); color: #3b82f6; }

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
}
.status-dot.pass { background-color: #10b981; box-shadow: 0 0 8px rgba(16, 185, 129, 0.4); }
.status-dot.fail { background-color: #f43f5e; box-shadow: 0 0 8px rgba(244, 63, 94, 0.4); }
.status-dot.pending { background-color: rgba(74, 68, 85, 0.5); }
.status-text { font-weight: 500; font-size: 0.875rem; }
.status-text.pass { color: #34d399; }
.status-text.fail { color: #fb7185; }
.status-text.pending { color: #ccc3d8; }

/* Cases Footer */
.cases-footer {
  padding: 16px 24px;
  border-top: 1px solid rgba(74, 68, 85, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: rgba(25, 27, 38, 0.5);
}
.footer-info {
  font-size: 0.75rem;
  color: #958da1;
}
.pagination {
  display: flex;
  gap: 4px;
}
.page-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.25rem;
  background-color: #1d1f2b;
  color: #958da1;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  transition: color 0.2s;
}
.page-btn:hover:not(.disabled) { color: #e1e1f2; }
.page-btn.disabled { cursor: not-allowed; opacity: 0.5; }
.page-btn.active {
  background-color: #7c3aed;
  color: #ede0ff;
  font-weight: 700;
}

/* Bottom Split */
.bottom-split {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
@media (min-width: 1024px) {
  .bottom-split { flex-direction: row; }
}

.trend-section {
  flex: 1;
  background-color: #191b26;
  padding: 24px;
  border-radius: 0.75rem;
  border: 1px solid rgba(149, 141, 161, 0.15);
}
.section-title {
  font-size: 0.875rem;
  font-weight: 700;
  color: #ccc3d8;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0 0 24px 0;
}

/* Trend Chart */
.chart-area {
  height: 16rem;
  display: flex;
  flex-direction: column;
}
.chart-bars {
  flex: 1;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 0 8px;
}
.bar-group {
  flex: 1;
  background-color: #272935;
  border-top-left-radius: 0.25rem;
  border-top-right-radius: 0.25rem;
  height: 100%;
  position: relative;
  display: flex;
  align-items: flex-end;
}
.bar-fill {
  width: 100%;
  background-color: #0566d9;
  border-top-left-radius: 0.25rem;
  border-top-right-radius: 0.25rem;
  transition: background-color 0.2s;
}
.bar-group:hover .bar-fill { background-color: #adc6ff; }
.bar-tooltip {
  position: absolute;
  top: -24px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  opacity: 0;
  transition: opacity 0.2s;
  color: #e1e1f2;
}
.bar-group:hover .bar-tooltip { opacity: 1; }

.chart-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #958da1;
  margin-top: 16px;
  padding: 0 8px;
}

/* Activity Section */
.activity-section {
  width: 100%;
  background-color: #191b26;
  padding: 24px;
  border-radius: 0.75rem;
  border: 1px solid rgba(149, 141, 161, 0.15);
  display: flex;
  flex-direction: column;
  gap: 24px;
}
@media (min-width: 1024px) {
  .activity-section { width: 20rem; }
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: relative;
}
.activity-item {
  display: flex;
  gap: 12px;
  position: relative;
}
.activity-item:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 7.5px;
  top: 24px;
  bottom: -16px;
  width: 1px;
  background-color: rgba(74, 68, 85, 0.2);
}

.activity-dot {
  width: 16px;
  height: 16px;
  border-radius: 9999px;
  margin-top: 4px;
  z-index: 10;
}
.activity-dot.secondary { background-color: #adc6ff; box-shadow: 0 0 0 4px rgba(173, 198, 255, 0.1); }
.activity-dot.error { background-color: #ffb4ab; box-shadow: 0 0 0 4px rgba(255, 180, 171, 0.1); }
.activity-dot.primary { background-color: #d2bbff; box-shadow: 0 0 0 4px rgba(210, 187, 255, 0.1); }

.activity-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.activity-text {
  font-size: 0.75rem;
  font-weight: 600;
  color: #e1e1f2;
}
.activity-sub {
  font-size: 10px;
  color: #958da1;
}

.view-all-btn {
  margin-top: auto;
  padding: 8px;
  font-size: 0.75rem;
  font-weight: 700;
  color: #d2bbff;
  background: transparent;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: background-color 0.2s;
}
.view-all-btn:hover {
  background-color: rgba(210, 187, 255, 0.05);
}
</style>
