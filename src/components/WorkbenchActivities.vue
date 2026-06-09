<script setup lang="ts">
// 定义活动属性项接口
interface ActivityItem {
  text: string
  sub: string
  status: 'primary' | 'secondary' | 'error'
}

defineProps<{
  activities: ActivityItem[]
  isAdmin: boolean
}>()
</script>

<template>
  <div class="workbench-card">
    <div class="card-head">
      <div class="card-head-left">
        <span class="material-symbols-outlined card-icon">history</span>
        <div>
          <h3 class="card-title">最近活动日志</h3>
          <p class="card-sub">{{ isAdmin ? '实时审计操作日志' : '需要管理员权限' }}</p>
        </div>
      </div>
      <span v-if="isAdmin && activities.length > 0" class="activity-count">
        {{ activities.length }} 条
      </span>
    </div>

    <!-- 无管理员权限空状态 -->
    <div v-if="!isAdmin" class="activity-empty">
      <span class="material-symbols-outlined" style="color: var(--tp-danger)">lock</span>
      <p>仅系统管理员可查看全局审计日志</p>
    </div>

    <!-- 无数据空状态 -->
    <div v-else-if="activities.length === 0" class="activity-empty">
      <span class="material-symbols-outlined">event_note</span>
      <p>暂无活动审计记录</p>
    </div>

    <!-- 活动时间轴列表 -->
    <div v-else class="timeline-list">
      <div v-for="(act, idx) in activities" :key="idx" class="timeline-item">
        <!-- 不同的操作性质展示不同色彩节点 -->
        <div :class="['timeline-dot', act.status]"></div>
        <span class="timeline-txt">{{ act.text }}</span>
        <span class="timeline-time">{{ act.sub }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 引用公共样式，无需重复编写 */
</style>
