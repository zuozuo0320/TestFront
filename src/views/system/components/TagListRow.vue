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
    <!-- 左侧精致垂直彩色指示条 -->
    <div class="tc-accent-strip" :style="{ backgroundColor: tag.color }"></div>

    <!-- Top row: icon + meta + actions -->
    <div class="tc-top">
      <div class="tc-left">
        <div class="tc-icon-box">
          <span
            class="material-symbols-outlined tc-card-icon"
            style="font-variation-settings: 'FILL' 1; font-size: 18px"
          >
            {{ tagIcon }}
          </span>
        </div>
        <div class="tc-meta">
          <h4 class="tc-name">{{ tag.name }}</h4>
          <el-tooltip
            v-if="tag.description"
            :content="tag.description"
            placement="top"
            effect="dark"
          >
            <p class="tc-desc">{{ tag.description }}</p>
          </el-tooltip>
          <p v-else class="tc-desc is-empty">暂无描述</p>
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
          <span class="material-symbols-outlined" style="font-size: 18px">edit</span>
        </button>
        <button
          type="button"
          class="tc-act-btn tc-act-btn--del"
          :aria-label="`删除标签 ${tag.name}`"
          title="删除"
          @click="emit('delete', tag)"
        >
          <span class="material-symbols-outlined" style="font-size: 18px">delete</span>
        </button>
      </div>
    </div>

    <!-- Bottom row: Horizontal Stats Info -->
    <div class="tc-bottom-info">
      <div class="tc-stat-pill">
        <span class="material-symbols-outlined tc-stat-icon">tag</span>
        <span class="tc-stat-count">{{ formatCount(tag.case_count) }}</span>
        <span class="tc-stat-label">用例</span>
      </div>
      <div class="tc-creator">
        <img
          v-if="tag.created_by_avatar"
          class="tc-avatar"
          :src="serverUrl + tag.created_by_avatar"
          :alt="tag.created_by_name"
        />
        <span v-else class="material-symbols-outlined tc-avatar-placeholder">account_circle</span>
        <span class="tc-creator-name">{{ tag.created_by_name || '-' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==================== 统一高保真双主题卡片与微交互样式 ==================== */
.tc-card {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  padding: 14px 16px;
  cursor: default;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 104px;
  box-sizing: border-box;
  background: var(--tp-surface-card, #ffffff);
  border: 1px solid var(--tp-border-subtle, #e2e8f0);
  box-shadow: var(--tp-shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05));
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  transform: translateY(0);
}

.tc-card:hover {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--tp-border-strong, #cbd5e1));
  box-shadow:
    0 12px 24px rgba(15, 23, 42, 0.04),
    0 0 0 3px color-mix(in srgb, var(--accent) 8%, transparent);
  transform: translateY(-2px);
}

/* 垂直彩色指示条 */
.tc-accent-strip {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  z-index: 2;
}

/* 黑曜深色主题卡片自适应 */
html[data-theme='genart'] .tc-card {
  background: var(--tp-surface-card, #151622);
  border-color: var(--tp-border-subtle, #202230);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

html[data-theme='genart'] .tc-card:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, rgba(255, 255, 255, 0.12));
  box-shadow:
    0 16px 36px rgba(0, 0, 0, 0.5),
    0 0 0 4px color-mix(in srgb, var(--accent) 12%, transparent);
}

/* ── Top row ── */
.tc-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: relative;
  z-index: 1;
  width: 100%;
}

.tc-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

/* 统一图标框：高亮玻璃质感 */
.tc-icon-box {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 20%, rgba(148, 163, 184, 0.12));
  background: color-mix(in srgb, var(--accent) 8%, rgba(255, 255, 255, 0.05));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tc-card-icon {
  color: var(--accent) !important; /* 强制图标颜色与标签配色一致，防止乱色 */
}

.tc-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.tc-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--tp-text-primary, #1e293b);
  margin: 0;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.tc-desc {
  font-size: 11px;
  color: var(--tp-text-muted, #64748b);
  margin: 2px 0 0;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.tc-desc.is-empty {
  color: var(--tp-text-placeholder, #94a3b8);
  opacity: 0.6;
}

/* ── Hover actions ── */
.tc-actions {
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  margin-left: 8px;
}

.tc-card:hover .tc-actions {
  opacity: 1;
}

.tc-act-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid var(--tp-border-subtle, rgba(148, 163, 184, 0.15));
  background: var(--tp-surface-card, #ffffff);
  color: var(--tp-text-subtle, #64748b);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: none;
  transition: all 0.2s ease;
}

.tc-act-btn:hover {
  background: color-mix(in srgb, var(--accent) 8%, var(--tp-surface-hover, #f8fafc));
  border-color: color-mix(in srgb, var(--accent) 30%, var(--tp-border-strong, #cbd5e1));
  color: var(--accent);
}

.tc-act-btn--del:hover {
  background: rgba(239, 68, 68, 0.08) !important;
  border-color: rgba(239, 68, 68, 0.25) !important;
  color: var(--tp-accent-danger, #ef4444) !important;
}

.tc-act-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent);
}

/* ── Bottom Info Row (Horizontal layout) ── */
.tc-bottom-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--tp-border-subtle, rgba(148, 163, 184, 0.1));
  position: relative;
  z-index: 1;
}

html[data-theme='genart'] .tc-bottom-info {
  border-top-color: rgba(255, 255, 255, 0.04) !important;
}

/* 关联用例小药丸 */
.tc-stat-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--tp-surface-input, #f1f5f9);
  border: 1px solid var(--tp-border-subtle, #e2e8f0);
  font-size: 11px;
  color: var(--tp-text-secondary, #475569);
  height: 20px;
  box-sizing: border-box;
}

.tc-stat-icon {
  font-size: 12px !important;
  color: var(--tp-text-placeholder, #94a3b8);
}

.tc-stat-count {
  font-weight: 700;
  color: var(--accent) !important;
  font-family: var(--tp-font-family-mono, monospace);
}

.tc-stat-label {
  font-weight: 500;
  color: var(--tp-text-subtle, #64748b);
}

/* 创建人信息 */
.tc-creator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--tp-text-muted, #64748b);
  height: 20px;
}

.tc-avatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--tp-border-subtle, rgba(148, 163, 184, 0.15));
}

.tc-avatar-placeholder {
  font-size: 16px !important;
  color: var(--tp-text-placeholder, #94a3b8);
}

.tc-creator-name {
  color: var(--tp-text-secondary, #475569);
  font-weight: 500;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
