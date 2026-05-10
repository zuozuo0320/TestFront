<script setup lang="ts">
/**
 * ReviewStatCard — 用例评审统计卡片
 *
 * 职责：渲染单个统计卡，含图标、label、数值、副标和进度条。
 * 供 CaseReviewPage.vue 的 4 个统计卡位（未开始/进行中/已完成/已关闭）复用，
 * 替换原本重复 4 次的 70+ 行 template 结构。
 *
 * 进度条宽度按父组件传入的 total（全局计划总数）换算比例。
 */
import { computed } from 'vue'

/** 卡片视觉色调枚举：控制图标 tint、进度条颜色、副标文字色 */
export type ReviewStatVariant = 'secondary' | 'primary' | 'emerald' | 'error'

interface Props {
  /** 卡片顶部小标签，如 "未开始" / "进行中" */
  label: string
  /** Material Symbols 图标名，如 "pending_actions" */
  icon: string
  /** 主数值（该状态下的计划数量） */
  count: number
  /** 项目级计划总数，用于计算进度条宽度 */
  total: number
  /** 色调变体，决定图标色与进度条色 */
  variant?: ReviewStatVariant
  /** 副标文字（高亮显示）；如"3% 完成率"。与 subHint 互斥优先 */
  subText?: string
  /** 淡灰辅助文字（不强调），如"个计划"、"不再可编辑" */
  subHint?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'secondary',
  subText: '',
  subHint: '',
})

/** 进度条宽度百分比：count / total × 100，total=0 时返回 0 */
const barWidthPercent = computed(() => {
  if (!props.total || props.total <= 0) return 0
  return Math.round((props.count / props.total) * 100)
})
</script>

<template>
  <div class="stat-card-pl">
    <div class="stat-bg-icon" :class="`icon-${variant}`">
      <span class="material-symbols-outlined">{{ icon }}</span>
    </div>
    <p class="stat-label-pl">{{ label }}</p>
    <div class="stat-value-row">
      <span class="stat-num">{{ count }}</span>
      <span v-if="subText" class="stat-sub" :class="variant">{{ subText }}</span>
      <span v-else-if="subHint" class="stat-sub-hint">{{ subHint }}</span>
    </div>
    <div class="stat-bar-track">
      <div
        class="stat-bar-fill"
        :class="`bar-${variant}`"
        :style="{ width: barWidthPercent + '%' }"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.stat-card-pl {
  position: relative;
  overflow: hidden;
  min-height: 72px;
  padding: 10px 11px;
  border: 1px solid var(--tp-border-subtle);
  border-radius: 11px;
  background: var(--tp-surface-card);
  box-shadow: var(--tp-shadow-sm);
}
.stat-bg-icon {
  position: absolute;
  top: 8px;
  right: 8px;
  opacity: 0.06;
}
.stat-bg-icon .material-symbols-outlined {
  font-size: 34px;
}
.stat-bg-icon.icon-primary {
  color: var(--tp-primary);
  opacity: 0.08;
}
.stat-bg-icon.icon-emerald {
  color: var(--tp-accent-success);
  opacity: 0.08;
}
.stat-bg-icon.icon-error {
  color: var(--tp-accent-danger);
  opacity: 0.08;
}
.stat-label-pl {
  margin: 0 0 3px;
  color: var(--tp-text-muted);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-ui);
}
.stat-value-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.stat-num {
  color: var(--tp-text-primary);
  font-size: 21px;
  font-weight: var(--tp-font-bold);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.stat-sub {
  font-size: 11px;
  font-weight: var(--tp-font-regular);
}
.stat-sub.primary {
  color: var(--tp-primary);
}
.stat-sub.emerald {
  color: var(--tp-accent-success);
}
.stat-sub.error {
  color: var(--tp-accent-danger);
}
.stat-sub-hint {
  font-size: 11px;
  color: var(--tp-text-muted);
  font-weight: var(--tp-font-regular);
}
.stat-bar-track {
  margin-top: 8px;
  height: 3px;
  width: 100%;
  background: var(--tp-gray-200);
  border-radius: 4px;
  overflow: hidden;
}
.stat-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}
.bar-secondary {
  background: var(--tp-accent-info);
}
.bar-primary {
  background: var(--tp-primary);
}
.bar-emerald {
  background: var(--tp-accent-success);
}
.bar-error {
  background: var(--tp-accent-danger);
}
</style>
