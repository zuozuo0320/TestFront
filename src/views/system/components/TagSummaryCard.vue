<script setup lang="ts">
/**
 * 标签概览卡片 — 显示标签模块的核心统计指标
 *
 * 包括：标签总数、关联用例总数、最热标签名称、未使用标签数
 * 底部显示前 3 个标签的颜色圆点（头像堆叠效果）
 */
import type { Tag } from '../../../api/tag'

defineProps<{
  tags: Tag[] // 当前页全部标签列表（用于计算总数和颜色圆点）
  totalCaseCount: number // 关联用例总数
  topTagName: string // 最热标签名称（用例数最多的）
  unusedCount: number // 未被任何用例引用的标签数
}>()
</script>

<template>
  <div class="tm-summary-card">
    <div class="tm-summary-glow"></div>
    <div class="tm-summary-content">
      <h4 class="tm-summary-label">标签概览</h4>
      <p class="tm-summary-number">{{ tags.length }}</p>
      <p class="tm-summary-sub">
        共
        <strong>{{ totalCaseCount }}</strong>
        个用例引用
      </p>
      <div class="tm-summary-metrics">
        <div class="tm-summary-metric">
          <span class="tm-summary-metric-label">最热标签</span>
          <span class="tm-summary-metric-value">{{ topTagName }}</span>
        </div>
        <div class="tm-summary-metric">
          <span class="tm-summary-metric-label">未使用</span>
          <span class="tm-summary-metric-value">{{ unusedCount }}</span>
        </div>
      </div>
      <div v-if="tags.length > 0" class="tm-summary-avatars">
        <div
          v-for="(t, i) in tags.slice(0, 3)"
          :key="t.id"
          class="tm-summary-dot"
          :style="{ backgroundColor: t.color, zIndex: 10 - i }"
        >
          {{ t.name.charAt(0).toUpperCase() }}
        </div>
        <div v-if="tags.length > 3" class="tm-summary-dot tm-summary-dot--more">
          +{{ tags.length - 3 }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tm-summary-card {
  position: relative;
  overflow: hidden;
  padding: 24px;
  border-radius: 16px;
  background: var(--bg-card-high);
  border: 1px solid var(--border-subtle);
  min-height: 180px;
}
.tm-summary-glow {
  position: absolute;
  top: -40px;
  right: -40px;
  width: 120px;
  height: 120px;
  background: var(--purple-20);
  border-radius: 50%;
  filter: blur(40px);
}
.tm-summary-content {
  position: relative;
  z-index: 1;
}
.tm-summary-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--text-secondary-60);
  margin: 0 0 8px;
  font-weight: 600;
}
.tm-summary-number {
  font-size: 28px;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.04em;
}
.tm-summary-sub {
  font-size: 12px;
  color: var(--green);
  margin: 4px 0 0;
}
.tm-summary-sub strong {
  font-weight: 700;
}
.tm-summary-metrics {
  display: flex;
  gap: 24px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}
.tm-summary-metric-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.tm-summary-metric-value {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-top: 2px;
  color: var(--text-primary);
}
.tm-summary-avatars {
  display: flex;
  margin-top: 20px;
}
.tm-summary-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--bg-card-high);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  margin-left: -8px;
}
.tm-summary-dot:first-child {
  margin-left: 0;
}
.tm-summary-dot--more {
  background: var(--bg-dot-more);
  color: var(--text-secondary);
}
</style>
