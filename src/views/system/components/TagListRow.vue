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
        <button type="button" class="tc-act-btn" title="编辑" @click="emit('edit', tag)">
          <span class="material-symbols-outlined" style="font-size: 20px">edit</span>
        </button>
        <button
          type="button"
          class="tc-act-btn tc-act-btn--del"
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
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(74, 68, 85, 0.15);
  border-left: 2px solid var(--accent);
  border-radius: 12px;
  padding: 20px;
  transition: background 0.15s;
  cursor: default;
}
.tc-card:hover {
  background: var(--surface-container, #1d1f2b);
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
</style>
