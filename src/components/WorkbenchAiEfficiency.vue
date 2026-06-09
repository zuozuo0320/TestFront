<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  requirementsCount: number
  scriptsCount: number
  totalCases: number
}>()

// 估算累计为研发省去的工时：
// 1. 每解析并自动生成一个用例集的需求文档省去 2.5 小时
// 2. 每自动生成一个测试用例省去 0.2 小时（12分钟，含测试思维时间）
// 3. 每录制/自动验证生成一个自动化脚本省去 1.5 小时
const savedHours = computed(() => {
  const docHours = props.requirementsCount * 2.5
  const caseHours = props.totalCases * 0.75 * 0.2 // 假设 75% 用例是 AI 生成的
  const scriptHours = props.scriptsCount * 1.5
  const total = docHours + caseHours + scriptHours
  return total > 0 ? total.toFixed(1) : '0'
})

// AI 生成用例数
const aiCasesCount = computed(() => {
  return Math.round(props.totalCases * 0.75)
})
</script>

<template>
  <div class="workbench-card">
    <div class="card-head">
      <div class="card-head-left">
        <span class="material-symbols-outlined card-icon">bolt</span>
        <div>
          <h3 class="card-title">AI 研发效能中心</h3>
          <p class="card-sub">AI 辅助测试生成及自动化效率分析</p>
        </div>
      </div>
    </div>

    <!-- AI 效能卡片网格 -->
    <div class="ai-efficiency-grid">
      <!-- 需求文档解析 -->
      <div class="ai-efficiency-card">
        <span class="ai-eff-title">需求智生</span>
        <span class="ai-eff-value">{{ requirementsCount }} 份文档</span>
        <div class="ai-eff-footer">
          <span class="material-symbols-outlined ai-sparkle">auto_awesome</span>
          <span>已解析并批量转化用例</span>
        </div>
      </div>

      <!-- AI 用例生成率 -->
      <div class="ai-efficiency-card">
        <span class="ai-eff-title">AI 覆盖率</span>
        <span class="ai-eff-value">{{ totalCases > 0 ? '75%' : '0%' }}</span>
        <div class="ai-eff-footer">
          <span class="material-symbols-outlined ai-sparkle">auto_awesome</span>
          <span>累计智生用例 {{ aiCasesCount }} 条</span>
        </div>
      </div>

      <!-- 自动化脚本智编 -->
      <div class="ai-efficiency-card">
        <span class="ai-eff-title">脚本智编</span>
        <span class="ai-eff-value">{{ scriptsCount }} 个脚本</span>
        <div class="ai-eff-footer">
          <span class="material-symbols-outlined ai-sparkle">auto_awesome</span>
          <span>基于 Playwright 录制与回放</span>
        </div>
      </div>

      <!-- 累计省去工时 -->
      <div class="ai-efficiency-card ai-efficiency-card--highlight">
        <span class="ai-eff-title">省去人工时</span>
        <span class="ai-eff-value text-primary-glow">{{ savedHours }} 小时</span>
        <div class="ai-eff-footer">
          <span class="material-symbols-outlined ai-sparkle">history_toggle_off</span>
          <span>测试资产构建耗时大幅缩减</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 引用公共样式，无需重复编写 */
</style>
