<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  totalCases: number
}>()

// 1. 动态生成优先级分布数据，确保总数等于 totalCases
const levelData = computed(() => {
  const tc = props.totalCases
  if (tc === 0) {
    return [
      { name: 'P0 - 紧急严重', count: 0, pct: 0, class: 'p-0' },
      { name: 'P1 - 高优先级', count: 0, pct: 0, class: 'p-1' },
      { name: 'P2 - 中优先级', count: 0, pct: 0, class: 'p-2' },
      { name: 'P3 - 低优先级', count: 0, pct: 0, class: 'p-3' },
    ]
  }
  const p0 = Math.floor(tc * 0.15)
  const p1 = Math.floor(tc * 0.35)
  const p2 = Math.floor(tc * 0.4)
  const p3 = tc - (p0 + p1 + p2)

  return [
    { name: 'P0 - 紧急严重', count: p0, pct: Math.round((p0 / tc) * 100), class: 'p-0' },
    { name: 'P1 - 高优先级', count: p1, pct: Math.round((p1 / tc) * 100), class: 'p-1' },
    { name: 'P2 - 中优先级', count: p2, pct: Math.round((p2 / tc) * 100), class: 'p-2' },
    { name: 'P3 - 低优先级', count: p3, pct: Math.round((p3 / tc) * 100), class: 'p-3' },
  ]
})

// 2. 动态生成生命周期状态分布数据，以供环形图使用
const statusData = computed(() => {
  const tc = props.totalCases
  if (tc === 0) {
    return [
      { key: 'active', label: '已生效', count: 0, pct: 0, strokeDash: '0 100' },
      { key: 'draft', label: '草稿', count: 0, pct: 0, strokeDash: '0 100' },
      { key: 'pending', label: '待评审', count: 0, pct: 0, strokeDash: '0 100' },
      { key: 'discarded', label: '已废弃', count: 0, pct: 0, strokeDash: '0 100' },
    ]
  }

  const active = Math.floor(tc * 0.6)
  const draft = Math.floor(tc * 0.2)
  const pending = Math.floor(tc * 0.15)
  const discarded = tc - (active + draft + pending)

  const states = [
    { key: 'active', label: '已生效', count: active },
    { key: 'draft', label: '草稿', count: draft },
    { key: 'pending', label: '待评审', count: pending },
    { key: 'discarded', label: '已废弃', count: discarded },
  ]

  // SVG 环周长 C = 2 * PI * r = 2 * 3.14159 * 18 = 113.1
  const radius = 18
  const circumference = 2 * Math.PI * radius

  return states.map((s) => {
    const pct = Math.round((s.count / tc) * 100)
    const dashVal = (pct / 100) * circumference
    const restVal = circumference - dashVal
    return {
      ...s,
      pct,
      strokeDash: `${dashVal.toFixed(1)} ${restVal.toFixed(1)}`,
    }
  })
})
</script>

<template>
  <div class="workbench-card">
    <div class="card-head">
      <div class="card-head-left">
        <span class="material-symbols-outlined card-icon">analytics</span>
        <div>
          <h3 class="card-title">多维用例分布</h3>
          <p class="card-sub">分析用例的优先级与生命周期状态</p>
        </div>
      </div>
    </div>

    <div class="charts-wrapper">
      <!-- 左：用例优先级分布 (Bar Chart) -->
      <div class="chart-container">
        <div class="chart-headline">用例优先级划分</div>
        <div class="bar-chart">
          <div v-for="item in levelData" :key="item.name" class="bar-chart-item">
            <div class="bar-chart-info">
              <div class="bar-label">
                <span :class="['bar-dot', item.class]"></span>
                <span class="bar-text">{{ item.name }}</span>
              </div>
              <span class="bar-count">{{ item.count }} 条 ({{ item.pct }}%)</span>
            </div>
            <div class="bar-track">
              <div :class="['bar-fill', item.class]" :style="{ width: item.pct + '%' }"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右：用例生命周期分布 (Circle Progress Grid) -->
      <div class="chart-container">
        <div class="chart-headline">生命周期状态</div>
        <div class="status-grid-chart">
          <div v-for="item in statusData" :key="item.key" class="status-grid-item">
            <div class="status-circle-wrap">
              <svg class="status-circle-svg" viewBox="0 0 40 40">
                <circle class="status-circle-bg" cx="20" cy="20" r="18" />
                <circle
                  :class="['status-circle-val', item.key]"
                  cx="20"
                  cy="20"
                  r="18"
                  :stroke-dasharray="item.strokeDash"
                />
              </svg>
              <span class="status-percent">{{ item.pct }}%</span>
            </div>
            <span class="status-item-label">{{ item.label }}</span>
            <span class="status-item-count">{{ item.count }} 条</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 引用公共样式，无需重复编写 */
</style>
