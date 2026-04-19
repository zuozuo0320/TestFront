<script setup lang="ts">
/**
 * 标签列表行组件 — 展示单个标签的详细信息
 *
 * 每行显示：
 *   - 左侧：图标 + 标签名称 + 状态徽章（使用中/未使用） + 描述
 *   - 中间：用例数 + 创建人（头像 + 姓名）
 *   - 右侧：编辑/删除操作按钮
 *
 * 左侧边框颜色通过 CSS 变量 --row-accent 动态设置为标签颜色
 */
import { Edit, Delete } from '@element-plus/icons-vue'
import type { Tag } from '../../../api/tag'

defineProps<{
  tag: Tag // 标签完整数据
  serverUrl: string // 服务端基础地址（拼接头像 URL）
  tagIcon: string // Material 图标名称（由父组件根据用例数计算）
}>()

const emit = defineEmits<{
  edit: [tag: Tag] // 点击编辑按钮
  delete: [tag: Tag] // 点击删除按钮
}>()
</script>

<template>
  <div class="tm-tag-row" :style="{ '--row-accent': tag.color }">
    <div class="tm-tag-info">
      <div class="tm-tag-name-row">
        <span class="material-symbols-outlined tm-tag-icon" :style="{ color: tag.color }">
          {{ tagIcon }}
        </span>
        <h4 class="tm-tag-name">{{ tag.name }}</h4>
        <span
          :class="[
            'tm-tag-status-badge',
            tag.case_count > 0 ? 'tm-status--active' : 'tm-status--idle',
          ]"
        >
          {{ tag.case_count > 0 ? '使用中' : '未使用' }}
        </span>
      </div>
      <p class="tm-tag-desc">{{ tag.description || '暂无描述' }}</p>
    </div>
    <div class="tm-tag-stats">
      <div class="tm-stat-cell">
        <p class="tm-stat-label">用例数</p>
        <p class="tm-stat-value">{{ tag.case_count }}</p>
      </div>
      <div class="tm-stat-cell">
        <p class="tm-stat-label">创建人</p>
        <p class="tm-stat-value tm-stat-creator">
          <img
            v-if="tag.created_by_avatar"
            class="tm-creator-avatar"
            :src="serverUrl + tag.created_by_avatar"
            :alt="tag.created_by_name"
          />
          {{ tag.created_by_name || '-' }}
        </p>
      </div>
    </div>
    <div class="action-group">
      <button
        type="button"
        class="action-btn action-edit icon-only"
        title="编辑"
        @click="emit('edit', tag)"
      >
        <el-icon class="btn-icon"><Edit /></el-icon>
        <span>编辑</span>
      </button>
      <button
        type="button"
        class="action-btn action-delete icon-only"
        title="删除"
        @click="emit('delete', tag)"
      >
        <el-icon class="btn-icon"><Delete /></el-icon>
        <span>删除</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.tm-tag-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-radius: 12px;
  background: var(--bg-row);
  border-left: 3px solid var(--row-accent, var(--purple));
  transition: all 0.25s;
}
.tm-tag-row:hover {
  background: var(--bg-card-high);
}
.tm-tag-info {
  flex: 1;
  min-width: 0;
}
.tm-tag-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}
.tm-tag-icon {
  font-size: 18px;
}
.tm-tag-name {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
}
.tm-tag-status-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
  white-space: nowrap;
}
.tm-status--active {
  background-color: var(--green-15);
  color: var(--green);
}
.tm-status--idle {
  background-color: var(--slate-15);
  color: var(--slate);
}
.tm-tag-desc {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 300;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tm-tag-stats {
  display: flex;
  align-items: center;
  gap: 32px;
  padding: 0 24px;
  border-left: 1px solid var(--border-subtle);
  border-right: 1px solid var(--border-subtle);
}
.tm-stat-cell {
  text-align: center;
  min-width: 60px;
}
.tm-stat-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  margin: 0 0 2px;
  font-weight: 500;
}
.tm-stat-value {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}
.tm-stat-creator {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}
.tm-creator-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
}
.action-group {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 2px;
}
</style>
