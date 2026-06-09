<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

// 定义模拟的用例评审计划列表
const reviewPlans = [
  {
    id: 1,
    name: '2026Q2 核心业务流用例评审',
    moderator: '超级管理员',
    cases: 12,
    approved: 8,
    passRate: 66.7,
    status: 'in_progress',
    aiGate: 'failed',
  },
  {
    id: 2,
    name: '智能路由算法测试评审',
    moderator: '项目管理员',
    cases: 8,
    approved: 8,
    passRate: 100,
    status: 'completed',
    aiGate: 'passed',
  },
  {
    id: 3,
    name: '用户中心权限体系重构评审',
    moderator: '测试主管',
    cases: 15,
    approved: 10,
    passRate: 66.7,
    status: 'in_progress',
    aiGate: 'running',
  },
]

// 导航至评审详情
function goToReviewDetail(id: number) {
  router.push(`/case-reviews/${id}`)
}

// 导航至评审列表
function goToReviewList() {
  router.push('/case-reviews')
}

// 翻译状态标签
function mapStatusLabel(status: string): string {
  if (status === 'in_progress') return '进行中'
  if (status === 'completed') return '已完成'
  return '未开始'
}

// 翻译 AI 门禁状态标签
function mapAiGateLabel(gate: string): string {
  if (gate === 'passed') return 'AI 预审通过'
  if (gate === 'failed') return 'AI 门禁拦截'
  if (gate === 'running') return 'AI 分析中'
  return '未开始'
}
</script>

<template>
  <div class="workbench-card">
    <div class="card-head">
      <div class="card-head-left">
        <span class="material-symbols-outlined card-icon">rate_review</span>
        <div>
          <h3 class="card-title">用例评审与门禁</h3>
          <p class="card-sub">跟踪用例评审状态与 AI 门禁分析</p>
        </div>
      </div>
      <button class="card-action-btn" @click="goToReviewList">
        全部评审
        <span class="material-symbols-outlined" style="font-size: 14px">arrow_forward</span>
      </button>
    </div>

    <!-- 评审计划网格列表 -->
    <div class="review-plans-grid">
      <div
        v-for="plan in reviewPlans"
        :key="plan.id"
        class="review-plan-row"
        @click="goToReviewDetail(plan.id)"
      >
        <div class="plan-meta">
          <span class="plan-name" :title="plan.name">{{ plan.name }}</span>
          <span class="plan-submeta">
            <span>负责人: {{ plan.moderator }}</span>
          </span>
        </div>
        <div class="plan-progress">
          <div class="progress-num">
            <span>通过率</span>
            <span>{{ plan.approved }}/{{ plan.cases }} ({{ plan.passRate.toFixed(0) }}%)</span>
          </div>
          <div class="progress-track" style="height: 3px">
            <div
              class="progress-fill progress-fill--success"
              :style="{ width: plan.passRate + '%' }"
            ></div>
          </div>
        </div>
        <div>
          <span :class="['plan-ai-gate', plan.aiGate]">
            <span class="material-symbols-outlined" style="font-size: 13px">
              {{
                plan.aiGate === 'passed'
                  ? 'check_circle'
                  : plan.aiGate === 'failed'
                    ? 'error'
                    : plan.aiGate === 'running'
                      ? 'sync'
                      : 'hourglass_empty'
              }}
            </span>
            {{ mapAiGateLabel(plan.aiGate) }}
          </span>
        </div>
        <div style="text-align: right">
          <span :class="['plan-status-badge', plan.status]">
            {{ mapStatusLabel(plan.status) }}
          </span>
        </div>
      </div>
    </div>

    <!-- 评审缺陷 Action Items 追踪器 -->
    <div class="action-items-tracker">
      <div class="tracker-left">
        <span class="material-symbols-outlined" style="font-size: 18px">assignment_late</span>
        <span>用例评审 Action Items (缺陷追踪)</span>
      </div>
      <div class="tracker-pills">
        <span class="tracker-pill open">4 待解决</span>
        <span class="tracker-pill resolved">2 已修复</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 引用公共样式，无需重复编写 */
</style>
