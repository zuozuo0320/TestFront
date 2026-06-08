<script setup lang="ts">
/**
 * 标签卡片 — 完全参考设计图 code.html
 *
 * glass-panel + border-l-2 accent + icon box + uppercase name + delete hover
 * Stats: Linked Cases + divider + 创建人
 */
import type { Tag } from '../../../api/tag'

defineProps<{
  tag: Tag
  serverUrl: string
  tagIcon: string
}>()

const emit = defineEmits<{
  edit: [tag: Tag]
  delete: [tag: Tag]
}>()

function formatCount(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  if (n >= 1000) return n.toLocaleString()
  return String(n)
}
</script>

<template>
  <div class="tc-card" :style="{ '--accent': tag.color }">
    <!-- Top row: icon + meta + actions -->
    <div class="tc-top">
      <div class="tc-left">
        <div class="tc-icon-box">
          <span
            class="material-symbols-outlined"
            style="font-variation-settings: 'FILL' 1; font-size: 18px"
          >
            {{ tagIcon }}
          </span>
        </div>
        <div class="tc-meta">
          <h4 class="tc-name">{{ tag.name }}</h4>
          <p class="tc-desc">{{ tag.description || '暂无描述' }}</p>
        </div>
      </div>
      <div class="tc-actions">
        <button
          type="button"
          class="tc-act-btn"
          :aria-label="`编辑标签 ${tag.name}`"
          title="编辑"
          @click="emit('edit', tag)"
        >
          <span class="material-symbols-outlined" style="font-size: 20px">edit</span>
        </button>
        <button
          type="button"
          class="tc-act-btn tc-act-btn--del"
          :aria-label="`删除标签 ${tag.name}`"
          title="删除"
          @click="emit('delete', tag)"
        >
          <span class="material-symbols-outlined" style="font-size: 20px">delete</span>
        </button>
      </div>
    </div>

    <!-- Stats row -->
    <div class="tc-stats">
      <div class="tc-stat">
        <span class="tc-stat-label">关联用例</span>
        <span class="tc-stat-value tc-stat-value--primary">{{ formatCount(tag.case_count) }}</span>
      </div>
      <div class="tc-divider"></div>
      <div class="tc-stat">
        <span class="tc-stat-label">创建人</span>
        <span class="tc-stat-value tc-stat-value--creator">
          <img
            v-if="tag.created_by_avatar"
            class="tc-avatar"
            :src="serverUrl + tag.created_by_avatar"
            :alt="tag.created_by_name"
          />
          {{ tag.created_by_name || '-' }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tc-card {
  position: relative;
  background: var(--tp-surface-card);
  backdrop-filter: none;
  border: 1px solid var(--tp-border-subtle);
  border-radius: 12px;
  padding: 20px;
  transition: background 0.15s;
  cursor: default;
}
.tc-card:hover {
  background: var(--tp-surface-hover);
  border-color: var(--tp-border-strong);
}

/* ── Top row ── */
.tc-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}
.tc-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.tc-icon-box {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
}
.tc-meta {
  flex: 1;
  min-width: 0;
}
.tc-name {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tc-desc {
  font-size: 12px;
  color: var(--on-surface-variant, #ccc3d8);
  margin: 2px 0 0;
  font-weight: 300;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Hover actions ── */
.tc-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.tc-card:hover .tc-actions {
  opacity: 1;
}
.tc-act-btn {
  background: none;
  border: none;
  color: var(--outline, #958da1);
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  transition: color 0.15s;
}
.tc-act-btn:hover {
  color: #fff;
}
.tc-act-btn--del:hover {
  color: #ef4444;
}

/* ── Stats row ── */
.tc-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
}
.tc-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tc-stat-label {
  font-size: 12px;
  color: var(--on-surface-variant, #ccc3d8);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 400;
}
.tc-stat-value {
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.tc-stat-value--primary {
  color: var(--primary, #d2bbff);
  text-shadow: 0 0 10px rgba(210, 187, 255, 0.5);
}
.tc-stat-value--creator {
  font-size: 14px;
  font-weight: 500;
  color: var(--on-surface, #e1e1f2);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.tc-divider {
  width: 1px;
  height: 32px;
  background: rgba(74, 68, 85, 0.3);
  flex-shrink: 0;
}
.tc-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid rgba(74, 68, 85, 0.3);
}

.tc-card {
  background: var(--tp-surface-card, var(--surface-container-low, #fff));
  border-color: var(--tp-border-subtle, var(--glass-border));
  box-shadow: var(--tp-shadow-card, none);
  backdrop-filter: none;
}

.tc-card:hover {
  background: var(--tp-surface-hover, var(--surface-container));
}

.tc-name,
.tc-stat-value--creator {
  color: var(--tp-gray-900, var(--on-surface));
}

.tc-desc,
.tc-stat-label {
  color: var(--tp-gray-600, var(--on-surface-variant));
}

.tc-act-btn:hover {
  color: var(--tp-primary, var(--primary));
}

.tc-act-btn--del:hover {
  color: var(--tp-accent-danger, #ef4444);
}

.tc-stat-value--primary {
  color: var(--tp-primary, var(--primary));
  text-shadow: none;
}

.tc-divider,
.tc-avatar {
  border-color: var(--tp-border-subtle, var(--border-subtle));
}

.tc-divider {
  background: var(--tp-border-subtle, var(--border-subtle));
}

.tc-card {
  overflow: hidden;
  border-radius: 18px;
  border-color: rgba(148, 163, 184, 0.24);
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 252, 0.74)),
    radial-gradient(
      circle at 8% 0%,
      color-mix(in srgb, var(--accent) 14%, transparent),
      transparent 42%
    );
  box-shadow:
    0 16px 34px rgba(15, 23, 42, 0.07),
    inset 0 1px 0 rgba(255, 255, 255, 0.78);
  transition:
    border-color var(--tp-transition),
    box-shadow var(--tp-transition),
    transform var(--tp-transition);
}

.tc-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--accent) 38%, transparent), transparent 34%)
      top / 100% 1px no-repeat,
    radial-gradient(
      circle at 100% 0%,
      color-mix(in srgb, var(--accent) 18%, transparent),
      transparent 36%
    );
}

.tc-card:hover {
  border-color: color-mix(in srgb, var(--accent) 30%, var(--tp-border-strong));
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.82)),
    radial-gradient(
      circle at 8% 0%,
      color-mix(in srgb, var(--accent) 18%, transparent),
      transparent 42%
    );
  box-shadow:
    0 20px 44px rgba(15, 23, 42, 0.09),
    0 0 0 4px color-mix(in srgb, var(--accent) 8%, transparent);
  transform: translateY(-2px);
}

.tc-top,
.tc-stats {
  position: relative;
  z-index: 1;
}

.tc-icon-box {
  border: 1px solid color-mix(in srgb, var(--accent) 22%, rgba(148, 163, 184, 0.24));
  border-radius: 10px;
  background:
    radial-gradient(circle at 35% 20%, rgba(255, 255, 255, 0.82), transparent 42%),
    color-mix(in srgb, var(--accent) 13%, #fff);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.88),
    0 8px 18px color-mix(in srgb, var(--accent) 12%, transparent);
}

.tc-name {
  color: var(--tp-gray-900);
  font-size: var(--tp-text-lg);
  font-weight: var(--tp-font-bold);
  text-transform: none;
  letter-spacing: -0.01em;
}

.tc-desc {
  color: var(--tp-text-muted);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-medium);
}

.tc-actions {
  opacity: 1;
  gap: 6px;
}

.tc-act-btn {
  width: 30px;
  height: 30px;
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.64);
  color: var(--tp-text-subtle);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.tc-act-btn:hover {
  border-color: color-mix(in srgb, var(--accent) 26%, rgba(148, 163, 184, 0.22));
  background: color-mix(in srgb, var(--accent) 10%, #fff);
  color: var(--accent);
}

.tc-act-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent);
}

.tc-stats {
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
}

.tc-stat-label {
  color: var(--tp-text-subtle);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-semibold);
  text-transform: none;
  letter-spacing: 0;
}

.tc-stat-value {
  font-size: var(--tp-text-lg);
}

.tc-stat-value--primary {
  color: var(--accent);
  text-shadow: 0 0 18px color-mix(in srgb, var(--accent) 24%, transparent);
}

.tc-stat-value--creator {
  color: var(--tp-gray-800);
  font-size: var(--tp-text-sm);
}

.tc-divider {
  background: rgba(148, 163, 184, 0.22);
}

.tc-card {
  min-width: 0;
  padding: 14px 15px;
  border-radius: 15px;
}

.tc-top {
  margin-bottom: 10px;
}

.tc-left {
  gap: 10px;
}

.tc-icon-box {
  width: 30px;
  height: 30px;
}

.tc-icon-box .material-symbols-outlined {
  font-size: 17px !important;
}

.tc-name {
  font-size: var(--tp-text-md);
}

.tc-desc {
  margin-top: 1px;
}

.tc-actions {
  gap: 4px;
}

.tc-act-btn {
  width: 28px;
  height: 28px;
}

.tc-stats {
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
}

.tc-stat {
  gap: 2px;
}

.tc-stat-value {
  font-size: var(--tp-text-md);
}

.tc-divider {
  height: 28px;
}

/* ==================== 统一高保真双主题卡片与微交互样式 ==================== */
.tc-card {
  overflow: hidden !important;
  position: relative !important;
  border-radius: 14px !important;
  padding: 12px 14px !important;
  cursor: default !important;
  /* 默认浅色主题：温润白紫 + 极简发光 aura */
  background:
    radial-gradient(
      circle at 10% 0%,
      color-mix(in srgb, var(--accent) 12%, transparent),
      transparent 35%
    ),
    #ffffff !important;
  border: 1px solid rgba(139, 92, 246, 0.08) !important;
  box-shadow:
    0 10px 24px rgba(139, 92, 246, 0.03),
    inset 0 1px 0 rgba(255, 255, 255, 0.8) !important;
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
  transform: translateY(0) !important;
}

.tc-card:hover {
  /* 默认浅色悬停：轻量 3D 浮升 + 外发光 */
  background:
    radial-gradient(
      circle at 10% 0%,
      color-mix(in srgb, var(--accent) 18%, transparent),
      transparent 35%
    ),
    #ffffff !important;
  border-color: color-mix(in srgb, var(--accent) 30%, rgba(139, 92, 246, 0.22)) !important;
  box-shadow:
    0 16px 36px color-mix(in srgb, var(--accent) 10%, rgba(139, 92, 246, 0.06)),
    0 0 0 3px color-mix(in srgb, var(--accent) 6%, transparent) !important;
  transform: translateY(-3px) !important;
}

/* 黑曜深色主题卡片自适应 */
html[data-theme='genart'] .tc-card {
  background:
    radial-gradient(
      circle at 10% 0%,
      color-mix(in srgb, var(--accent) 15%, transparent),
      transparent 38%
    ),
    #0d0e15 !important;
  border: 1px solid rgba(255, 255, 255, 0.04) !important;
  box-shadow:
    0 8px 20px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.02) !important;
}

html[data-theme='genart'] .tc-card:hover {
  background:
    radial-gradient(
      circle at 10% 0%,
      color-mix(in srgb, var(--accent) 22%, transparent),
      transparent 38%
    ),
    #0d0e15 !important;
  border-color: color-mix(in srgb, var(--accent) 35%, rgba(255, 255, 255, 0.12)) !important;
  box-shadow:
    0 20px 40px color-mix(in srgb, var(--accent) 15%, rgba(0, 0, 0, 0.65)),
    0 0 0 4px color-mix(in srgb, var(--accent) 10%, transparent) !important;
}

/* 统一图标框：高亮玻璃质感 */
.tc-icon-box {
  width: 32px !important;
  height: 32px !important;
  border-radius: 8px !important;
  border: 1px solid color-mix(in srgb, var(--accent) 20%, rgba(148, 163, 184, 0.12)) !important;
  background: color-mix(in srgb, var(--accent) 8%, rgba(255, 255, 255, 0.05)) !important;
  box-shadow: none !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* 卡片指标行及操作按钮微调 */
.tc-stats {
  border-top: 1px solid rgba(148, 163, 184, 0.08) !important;
}

html[data-theme='genart'] .tc-stats {
  border-top-color: rgba(255, 255, 255, 0.04) !important;
}

.tc-divider {
  background: rgba(148, 163, 184, 0.1) !important;
}

html[data-theme='genart'] .tc-divider {
  background: rgba(255, 255, 255, 0.04) !important;
}

.tc-act-btn {
  width: 28px !important;
  height: 28px !important;
  border-radius: 50% !important;
  border: 1px solid rgba(148, 163, 184, 0.12) !important;
  background: rgba(255, 255, 255, 0.03) !important;
  color: var(--tp-text-subtle) !important;
  box-shadow: none !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.tc-act-btn:hover {
  background: color-mix(in srgb, var(--accent) 10%, transparent) !important;
  border-color: color-mix(in srgb, var(--accent) 30%, transparent) !important;
  color: var(--accent) !important;
}

.tc-act-btn--del:hover {
  background: rgba(239, 68, 68, 0.1) !important;
  border-color: rgba(239, 68, 68, 0.3) !important;
  color: #ef4444 !important;
}

.tc-name,
.tc-stat-value--creator {
  color: var(--tp-text-primary);
}

.tc-desc,
.tc-stat-label {
  color: var(--tp-text-muted);
}

.tc-stat-value--primary {
  color: var(--accent);
  text-shadow: none;
}

.tc-stats,
.tc-divider,
.tc-avatar {
  border-color: var(--tp-border-subtle);
}

.tc-divider {
  background: var(--tp-border-subtle);
}
</style>
