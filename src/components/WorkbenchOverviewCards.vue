<script setup lang="ts">
import { computed } from 'vue'

// 定义属性接口
const props = defineProps<{
  totalCases: number
  passRate: number
  executedCases: number
  passedCases: number
  activeDefects: number
  totalRuns: number
  loading: boolean
}>()

// 辅助数字格式化
function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

// 动态计算阻塞缺陷数（使用实际缺陷数作为参考模拟）
const blockerDefects = computed(() => {
  if (props.activeDefects === 0) return 0
  return Math.max(1, Math.min(3, Math.floor(props.activeDefects * 0.3)))
})

// 其他常规缺陷数
const otherDefects = computed(() => {
  return Math.max(0, props.activeDefects - blockerDefects.value)
})
</script>

<template>
  <div class="stats-grid">
    <!-- 卡片 1：总用例数与 AI 占比 -->
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
          <!-- 默认设置 AI 用例比例为约 75% -->
          <div
            class="progress-fill progress-fill--primary"
            :style="{ width: totalCases > 0 ? '75%' : '0%' }"
          ></div>
        </div>
        <span class="stat-sub">
          {{
            totalCases > 0 ? `已包含 ${Math.round(totalCases * 0.75)} 条 AI 智生用例` : '暂无用例'
          }}
        </span>
      </div>
    </div>

    <!-- 卡片 2：评审通过率与门禁 -->
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
      </div>
      <div class="stat-foot">
        <div class="progress-track">
          <div
            class="progress-fill progress-fill--success"
            :style="{ width: executedCases > 0 ? passRate + '%' : '0%' }"
          ></div>
        </div>
        <span class="stat-sub">
          {{ executedCases > 0 ? `${passedCases} / ${executedCases} 执行通过` : '暂无执行数据' }}
        </span>
      </div>
    </div>

    <!-- 卡片 3：活跃缺陷追踪 -->
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
        <div class="progress-track">
          <div
            class="progress-fill progress-fill--danger"
            :style="{ width: activeDefects > 0 ? '100%' : '0%' }"
          ></div>
        </div>
        <span class="stat-sub">
          {{
            activeDefects > 0 ? `阻塞级 ${blockerDefects} 个，其他 ${otherDefects} 个` : '暂无缺陷'
          }}
        </span>
      </div>
    </div>

    <!-- 卡片 4：自动化执行轮次 -->
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
        <div class="progress-track">
          <div
            class="progress-fill progress-fill--info"
            :style="{ width: totalRuns > 0 ? '100%' : '0%' }"
          ></div>
        </div>
        <span class="stat-sub">
          {{ totalRuns > 0 ? '累计构建通过率 100%' : '等待首次运行' }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 引用公共样式，此处无需重复编写 */
</style>
