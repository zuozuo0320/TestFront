<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAiScriptStore } from '../../stores/aiScript'
import {
  TaskStatusLabel,
  TaskStatusColor,
  type AiScriptTask,
} from '../../api/aiScript'
import { TaskStatus } from '../../api/aiScript'

const router = useRouter()
const store = useAiScriptStore()

onMounted(() => {
  store.loadTaskList()
})

function goDetail(task: AiScriptTask) {
  router.push(`/ai-script/${task.id}`)
}

function getStatusColor(status: TaskStatus) {
  return TaskStatusColor[status] || 'info'
}

function isRunning(status: TaskStatus) {
  return status === TaskStatus.RUNNING
}
</script>

<template>
  <div class="ai-page">
    <!-- 页面头部 -->
    <div class="ai-page-header">
      <div class="ai-page-header-left">
        <div class="ai-breadcrumb">
          <span>测试智编</span>
          <span class="material-symbols-outlined">chevron_right</span>
          <span class="current">生成任务</span>
        </div>
        <h1>智能脚本生成任务列表</h1>
      </div>
      <div class="ai-action-group">
        <button class="ai-btn ai-btn-ghost">
          <span class="material-symbols-outlined">filter_alt</span>
          筛选条件
        </button>
        <button class="ai-btn ai-btn-ghost">
          <span class="material-symbols-outlined">sort</span>
          按时间排序
        </button>
      </div>
    </div>

    <!-- 主表格 -->
    <div class="ai-table-wrap">
      <table class="ai-table">
        <thead>
          <tr>
            <th>任务名称 / ID</th>
            <th>所属项目</th>
            <th>关联用例</th>
            <th>输出框架</th>
            <th>状态</th>
            <th>生成人 / 时间</th>
            <th style="text-align: right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="task in store.taskList"
            :key="task.id"
            @click="goDetail(task)"
          >
            <td>
              <div class="ai-task-cell">
                <span class="ai-task-name">{{ task.taskName }}</span>
                <span class="ai-task-id">TASK-{{ task.id }}</span>
              </div>
            </td>
            <td>
              <span style="font-size: 0.85rem; color: var(--tp-gray-700)">
                {{ task.projectName }}
              </span>
            </td>
            <td>
              <div class="ai-case-tags">
                <span
                  v-for="tag in task.caseTags"
                  :key="tag"
                  class="ai-case-tag"
                >{{ tag }}</span>
              </div>
            </td>
            <td>
              <span style="font-family: monospace; font-size: 0.85rem; color: var(--tp-gray-700)">
                {{ task.frameworkType }}
              </span>
            </td>
            <td>
              <div
                class="ai-status-badge"
                :class="getStatusColor(task.taskStatus)"
              >
                <span
                  class="ai-status-dot"
                  :class="{ 'animate-pulse': isRunning(task.taskStatus) }"
                ></span>
                <template v-if="task.taskStatus === TaskStatus.GENERATE_SUCCESS">
                  <span class="material-symbols-outlined" style="font-size: 12px">check_circle</span>
                </template>
                <template v-else-if="task.taskStatus === TaskStatus.GENERATE_FAILED">
                  <span class="material-symbols-outlined" style="font-size: 12px">error</span>
                </template>
                <template v-else-if="task.taskStatus === TaskStatus.PENDING_CONFIRM">
                  <span class="material-symbols-outlined" style="font-size: 12px">pending</span>
                </template>
                {{ TaskStatusLabel[task.taskStatus] }}
              </div>
            </td>
            <td>
              <div class="ai-task-cell">
                <span style="font-size: 0.78rem; font-weight: 500">{{ task.createdName }}</span>
                <span style="font-size: 0.6rem; color: var(--tp-gray-500)">{{ task.createdAt }}</span>
              </div>
            </td>
            <td>
              <div class="ai-row-actions">
                <button class="ai-row-action-btn" title="查看详情" @click.stop="goDetail(task)">
                  <span class="material-symbols-outlined">visibility</span>
                </button>
                <button class="ai-row-action-btn" title="复制配置" @click.stop>
                  <span class="material-symbols-outlined">content_copy</span>
                </button>
                <button class="ai-row-action-btn danger" title="废弃" @click.stop>
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 分页 -->
      <div class="ai-table-footer">
        <span class="info">显示 <strong>1 - {{ store.taskList.length }}</strong> / 共 {{ store.taskTotal }} 条任务</span>
        <div class="ai-pagination">
          <button><span class="material-symbols-outlined" style="font-size: 18px">chevron_left</span></button>
          <button class="active">1</button>
          <button>2</button>
          <button>3</button>
          <span class="dots">...</span>
          <button>13</button>
          <button><span class="material-symbols-outlined" style="font-size: 18px">chevron_right</span></button>
        </div>
      </div>
    </div>

    <!-- 底部统计卡片 -->
    <div class="ai-stats-grid">
      <!-- 成功率 -->
      <div class="ai-stat-card">
        <div class="ai-stat-label" style="color: #adc6ff">
          成功率
          <span class="material-symbols-outlined" style="color: #adc6ff">trending_up</span>
        </div>
        <div class="ai-stat-value">94.2%</div>
        <div class="ai-stat-desc">较上周 +2.4%</div>
        <div class="ai-stat-bar">
          <div class="ai-stat-bar-fill" style="width: 94%; background: #adc6ff"></div>
        </div>
      </div>

      <!-- 活跃运行器 -->
      <div class="ai-stat-card">
        <div class="ai-stat-label" style="color: var(--tp-primary-light)">
          活跃运行器
          <span class="material-symbols-outlined" style="color: var(--tp-primary-light)">bolt</span>
        </div>
        <div class="ai-stat-value">12</div>
        <div class="ai-stat-desc">当前正在生成中的任务</div>
        <div style="display: flex; gap: 4px; margin-top: 14px">
          <div style="height: 4px; flex: 1; background: var(--tp-primary-light); border-radius: 4px"></div>
          <div style="height: 4px; flex: 1; background: var(--tp-primary-light); border-radius: 4px"></div>
          <div class="animate-pulse" style="height: 4px; flex: 1; background: var(--tp-primary-light); border-radius: 4px"></div>
          <div style="height: 4px; flex: 1; background: var(--tp-surface-elevated); border-radius: 4px"></div>
        </div>
      </div>

      <!-- 快速入口 -->
      <div class="ai-quickstart-card">
        <div style="position: relative; z-index: 1">
          <div class="ai-stat-label" style="color: #ffb784">快速入口</div>
          <h4>从 UI 轨迹生成</h4>
          <p>将手动录制的操作日志直接转换为 Playwright 代码</p>
        </div>
        <button class="ai-quickstart-link" style="position: relative; z-index: 1">
          立即体验 <span class="material-symbols-outlined" style="font-size: 14px">arrow_forward</span>
        </button>
        <div class="ai-quickstart-glow"></div>
      </div>
    </div>

    <!-- FAB — 跳转脚本资产 -->
    <button class="ai-fab" title="脚本资产管理" @click="router.push('/ai-script/library')">
      <span class="material-symbols-outlined">inventory_2</span>
    </button>
  </div>
</template>

<style scoped>
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.animate-pulse {
  animation: pulse 2s ease-in-out infinite;
}
</style>
