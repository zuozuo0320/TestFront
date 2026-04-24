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
  padding: 22px 24px;
  border-radius: 12px;
  background: var(--tp-surface-card, #191b26);
  border: 1px solid rgba(74, 68, 85, 0.15);
}
.stat-bg-icon {
  position: absolute;
  top: 12px;
  right: 12px;
  opacity: 0.06;
}
.stat-bg-icon .material-symbols-outlined {
  font-size: 56px;
}
.stat-bg-icon.icon-primary {
  color: var(--tp-primary, #d2bbff);
  opacity: 0.08;
}
.stat-bg-icon.icon-emerald {
  color: #34d399;
  opacity: 0.08;
}
.stat-bg-icon.icon-error {
  color: var(--tp-danger, #ffb4ab);
  opacity: 0.08;
}
.stat-label-pl {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 10px;
}
.stat-value-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.stat-num {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.stat-sub {
  font-size: 11px;
  font-weight: 400;
}
.stat-sub.primary {
  color: var(--tp-primary-light, #d2bbff);
}
.stat-sub.emerald {
  color: #34d399;
}
.stat-sub.error {
  color: var(--tp-danger, #ffb4ab);
}
.stat-sub-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 400;
}
.stat-bar-track {
  margin-top: 16px;
  height: 3px;
  width: 100%;
  background: var(--tp-gray-700, #272935);
  border-radius: 4px;
  overflow: hidden;
}
.stat-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}
.bar-secondary {
  background: var(--tp-info, #adc6ff);
}
.bar-primary {
  background: var(--tp-primary, #d2bbff);
}
.bar-emerald {
  background: #34d399;
}
.bar-error {
  background: var(--tp-danger, #ffb4ab);
}
</style>
