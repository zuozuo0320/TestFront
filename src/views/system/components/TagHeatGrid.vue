<script setup lang="ts">
/**
 * Top 5 热度图 — 完全参考设计图 code.html
 *
 * 每行：mono序号 + 全宽track(gradient fill + border-left-2) + 彩色计数
 */
import type { Tag } from '../../../api/tag'

defineProps<{
  topTags: Tag[]
  maxCaseCount: number
  rankBarColors: string[]
}>()

function formatCount(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}
</script>

<template>
  <div class="hm-list">
    <div v-for="(t, idx) in topTags.slice(0, 5)" :key="t.id" class="hm-row">
      <span class="hm-rank">{{ String(idx + 1).padStart(2, '0') }}</span>
      <div class="hm-bar-track">
        <div
          class="hm-bar-fill"
          :style="{
            width:
              t.case_count > 0 ? Math.max((t.case_count / maxCaseCount) * 100, 15) + '%' : '15%',
            '--bar-color': rankBarColors[idx] || t.color,
          }"
        >
          <span class="hm-bar-label">{{ t.name }}</span>
        </div>
      </div>
      <span class="hm-count" :style="{ color: rankBarColors[idx] || t.color }">
        {{ formatCount(t.case_count) }}
      </span>
    </div>
    <!-- 空行补位 -->
    <div v-for="n in Math.max(0, 5 - topTags.length)" :key="'ph-' + n" class="hm-row hm-row--empty">
      <span class="hm-rank">{{ String(topTags.length + n).padStart(2, '0') }}</span>
      <div class="hm-bar-track">
        <div class="hm-bar-fill hm-bar-fill--empty" style="width: 15%">
          <span class="hm-bar-label">—</span>
        </div>
      </div>
      <span class="hm-count" style="color: var(--outline, #958da1)">0</span>
    </div>
  </div>
</template>

<style scoped>
.hm-list {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
  flex: 1;
}
.hm-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.hm-row--empty {
  opacity: 0.35;
}
.hm-rank {
  flex-shrink: 0;
  width: 16px;
  font-size: 12px;
  font-weight: 400;
  color: var(--on-surface-variant, #ccc3d8);
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
}
.hm-bar-track {
  flex: 1;
  min-width: 0;
  height: 32px;
  background: var(--surface-container, #1d1f2b);
  border-radius: 6px;
  overflow: hidden;
  position: relative;
}
.hm-bar-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(
    to right,
    color-mix(in srgb, var(--bar-color) 20%, transparent),
    color-mix(in srgb, var(--bar-color) 60%, transparent)
  );
  border-left: 2px solid var(--bar-color);
  display: flex;
  align-items: center;
  padding: 0 12px;
  transition: width 0.6s ease;
}
.hm-bar-fill--empty {
  background: rgba(255, 255, 255, 0.03);
  border-left: none;
}
.hm-bar-label {
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  z-index: 1;
}
.hm-count {
  flex-shrink: 0;
  width: 32px;
  text-align: right;
  font-size: 14px;
  font-weight: 600;
}
</style>
