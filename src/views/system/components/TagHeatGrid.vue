<script setup lang="ts">
/**
 * 标签热度统计网格 — 展示用例数 TOP5 的标签卡片
 *
 * 每张卡片显示：标签名称、排名、关联用例数、热度进度条
 * 不足 5 个标签时用空卡片补位，引导用户创建更多标签
 */
import type { Tag } from '../../../api/tag'

defineProps<{
  topTags: Tag[] // 热度 TOP5 标签列表（由父组件计算后传入）
  maxCaseCount: number // 最大用例数（用于计算热度条百分比）
  rankBarColors: string[] // 排名对应的颜色数组（第1名~第5名）
}>()
</script>

<template>
  <section class="tm-section">
    <div class="tm-section-header">
      <h3 class="tm-section-title">标签热度统计</h3>
      <span class="tm-section-badge">REAL-TIME METRICS</span>
    </div>
    <div class="tm-heat-grid">
      <div v-for="(t, idx) in topTags" :key="t.id" class="tm-heat-card">
        <div class="tm-heat-top">
          <span
            class="tm-heat-tag-badge"
            :style="{ backgroundColor: t.color + '1a', color: t.color }"
          >
            #{{ t.name }}
          </span>
          <span class="tm-heat-rank">RANK {{ String(idx + 1).padStart(2, '0') }}</span>
        </div>
        <div class="tm-heat-value">
          <span class="tm-heat-number">{{ t.case_count.toLocaleString() }}</span>
          <span class="tm-heat-label">用例</span>
        </div>
        <div class="tm-heat-bar-track">
          <div
            class="tm-heat-bar-fill"
            :style="{
              width:
                t.case_count > 0 ? Math.max((t.case_count / maxCaseCount) * 100, 15) + '%' : '0%',
              backgroundColor: rankBarColors[idx] || t.color,
            }"
          ></div>
        </div>
      </div>
      <!-- 空卡片补位 -->
      <div
        v-for="n in Math.max(0, 5 - topTags.length)"
        :key="'ph-' + n"
        class="tm-heat-card tm-heat-card--empty"
      >
        <div class="tm-heat-top">
          <span class="tm-heat-rank" style="opacity: 0.3">
            RANK {{ String(topTags.length + n).padStart(2, '0') }}
          </span>
        </div>
        <div class="tm-heat-value">
          <span class="tm-heat-number" style="opacity: 0.2">--</span>
        </div>
        <p class="tm-heat-empty-hint">创建更多标签以解锁排行</p>
        <div class="tm-heat-bar-track">
          <div class="tm-heat-bar-fill" style="width: 0"></div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tm-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.tm-section-title {
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  margin: 0;
}
.tm-section-badge {
  font-size: 10px;
  color: var(--purple-light);
  font-weight: 500;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
.tm-heat-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
}
.tm-heat-card {
  background: var(--bg-card);
  padding: 20px;
  border-radius: 12px;
  border: 1px solid var(--border-faint);
  transition: all 0.25s;
}
.tm-heat-card:hover {
  border-color: var(--purple-20);
}
.tm-heat-card--empty {
  opacity: 0.4;
}
.tm-heat-empty-hint {
  font-size: 10px;
  color: var(--text-muted);
  margin: 8px 0 0;
  font-style: italic;
}
.tm-heat-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}
.tm-heat-tag-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tm-heat-rank {
  font-size: 11px;
  color: var(--text-secondary-50);
  text-transform: uppercase;
  font-weight: 500;
}
.tm-heat-value {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}
.tm-heat-number {
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.04em;
}
.tm-heat-label {
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.tm-heat-bar-track {
  margin-top: 16px;
  height: 4px;
  width: 100%;
  background: var(--bg-card-high);
  border-radius: 99px;
  overflow: hidden;
}
.tm-heat-bar-fill {
  height: 100%;
  border-radius: 99px;
  transition: width 0.6s ease;
}
@media (max-width: 1200px) {
  .tm-heat-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
