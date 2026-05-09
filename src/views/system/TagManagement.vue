<script setup lang="ts">
/**
 * 标签管理页面 — 页面编排层
 *
 * 职责：仅组合子组件 + 注入 Composable，严禁包含业务逻辑。
 * 子组件：TagHeatGrid / TagBatchPanel / TagListRow / TagFormDialog
 * 业务逻辑：useTagManagement composable
 *
 * 完全参考设计图 code.html 实现右侧页面
 */
import { ref, computed } from 'vue'
import { useTagManagement } from '../../composables/useTagManagement'
import TagHeatGrid from './components/TagHeatGrid.vue'
import TagBatchPanel from './components/TagBatchPanel.vue'
import TagFormDialog from './components/TagFormDialog.vue'
import TagListRow from './components/TagListRow.vue'

const {
  loading,
  tags,
  total,
  page,
  pageSize,
  keyword,
  activeTab,
  sortBy,
  dialogVisible,
  editingId,
  saving,
  tagForm,
  batchInput,
  batchAutoColor,
  serverUrl,
  batchPreviewNames,
  topTags,
  sortedTags,
  maxCaseCount,
  selectedProject,
  onSearch,
  onSearchDebounce,
  openCreate,
  openEdit,
  submitTag,
  onDelete,
  batchCreate,
  getTagIcon,
  presetColors,
} = useTagManagement()

const rankBarColors = [
  'var(--tp-primary)',
  'var(--tp-accent-info)',
  'var(--tp-accent-success)',
  'var(--tp-primary-light)',
  'var(--tp-gray-400)',
]
const batchExpanded = ref(false)

/** 切换到"最近更新"标签：同时切换 tab 和将排序字段置为创建时间 */
function switchToRecent() {
  activeTab.value = 'recent'
  sortBy.value = 'created_at'
}

// 柱状图数据：取用例数 TOP 7
const pulseData = computed(() => {
  const sorted = [...tags.value].sort((a, b) => b.case_count - a.case_count).slice(0, 7)
  const max = sorted.length > 0 ? sorted[0]?.case_count || 1 : 1
  return sorted.map((t, i) => ({
    name: t.name,
    color: t.color || '#7c3aed',
    count: t.case_count,
    pct: Math.max(Math.round((t.case_count / max) * 100), 10),
    isTop: i === 0,
  }))
})
</script>

<template>
  <div class="tm-root">
    <!-- State 1: No project -->
    <div v-if="!selectedProject" class="tm-empty-state">
      <el-empty description="请先在侧边栏选择一个项目" :image-size="120" />
    </div>

    <!-- State 2: Loading -->
    <div v-else-if="loading && tags.length === 0" class="tm-skeleton">
      <div style="display: flex; justify-content: space-between; align-items: center">
        <el-skeleton :rows="1" animated style="width: 200px" />
        <el-skeleton :rows="0" animated style="width: 240px; height: 32px" />
      </div>
      <div class="tm-skeleton-panels">
        <div class="tm-skeleton-card"><el-skeleton :rows="5" animated /></div>
        <div class="tm-skeleton-card"><el-skeleton :rows="5" animated /></div>
      </div>
      <div class="tm-skeleton-card"><el-skeleton :rows="4" animated /></div>
    </div>

    <!-- State 3: Data -->
    <template v-else>
      <!-- ═══ TopNavBar ═══ -->
      <header class="tm-topnav">
        <div>
          <h2 class="tm-title">标签管理中心</h2>
          <p class="tm-subtitle">智能标签治理中枢</p>
        </div>
        <div class="tm-topnav-right">
          <div class="tm-search-box">
            <span class="material-symbols-outlined tm-search-icon">search</span>
            <input
              v-model="keyword"
              class="tm-search-input"
              type="text"
              aria-label="搜索标签"
              placeholder="搜索标签..."
              @keyup.enter="onSearch"
              @input="onSearchDebounce"
            />
            <div v-if="loading" class="tm-search-spinner"></div>
          </div>
        </div>
      </header>

      <!-- ═══ Quality Insights Dashboard ═══ -->
      <section class="tm-insights">
        <!-- Left: Tag Coverage Pulse -->
        <div class="tm-panel tm-panel--pulse">
          <div class="tm-panel-glow"></div>
          <div class="tm-panel-head">
            <div>
              <h3 class="tm-panel-title">标签覆盖脉冲</h3>
              <p class="tm-panel-desc">全局用例关联分布</p>
            </div>
            <span class="material-symbols-outlined tm-panel-icon-right">trending_up</span>
          </div>
          <div class="tm-pulse-chart">
            <div class="tm-pulse-bars">
              <div v-for="(bar, i) in pulseData" :key="i" class="tm-pulse-col">
                <div class="tm-pulse-tooltip">{{ bar.name }}: {{ bar.count }}</div>
                <div
                  :class="['tm-pulse-bar', { 'tm-pulse-bar--top': bar.isTop }]"
                  :style="{ height: bar.pct + '%', '--bar-color': bar.color }"
                ></div>
              </div>
              <div
                v-for="n in Math.max(0, 7 - pulseData.length)"
                :key="'e-' + n"
                class="tm-pulse-col"
              >
                <div class="tm-pulse-bar" style="height: 6%"></div>
              </div>
            </div>
          </div>
        </div>
        <!-- Right: Top 5 Heatmap -->
        <div class="tm-panel tm-panel--heat">
          <h3 class="tm-panel-title tm-heat-title">热度 Top 5</h3>
          <TagHeatGrid
            v-if="tags.length > 0"
            :top-tags="topTags"
            :max-case-count="maxCaseCount"
            :rank-bar-colors="rankBarColors"
          />
          <p v-else class="tm-panel-empty">暂无数据</p>
        </div>
      </section>

      <section class="tm-tag-workbench" aria-labelledby="tm-tag-workbench-title">
        <div class="tm-tag-workbench-head">
          <div>
            <h3 id="tm-tag-workbench-title" class="tm-tag-workbench-title">标签列表</h3>
            <p class="tm-tag-workbench-desc">
              当前显示 {{ sortedTags.length }} / {{ total }} 个标签
            </p>
          </div>
        </div>

        <!-- ═══ Action Bar & Tabs ═══ -->
        <div class="tm-actionbar">
          <div class="tm-tabs">
            <button
              type="button"
              :class="['tm-tab', { active: activeTab === 'all' }]"
              @click="activeTab = 'all'"
            >
              所有标签
            </button>
            <button
              type="button"
              :class="['tm-tab', { active: activeTab === 'recent' }]"
              @click="switchToRecent"
            >
              最近更新 (7天内)
            </button>
          </div>
          <div class="tm-actionbar-right">
            <div class="tm-sort">
              <span class="tm-sort-label">排序:</span>
              <select v-model="sortBy" class="tm-sort-select" aria-label="标签排序方式">
                <option value="case_count">用例数</option>
                <option value="name">名称</option>
                <option value="created_at">创建时间</option>
              </select>
            </div>
            <button type="button" class="tm-btn-filter" @click="openCreate">
              <span class="material-symbols-outlined" style="font-size: 18px">add</span>
              新建标签
            </button>
            <button type="button" class="tm-btn-wizard" @click="batchExpanded = !batchExpanded">
              <span class="material-symbols-outlined" style="font-size: 18px">auto_awesome</span>
              批量创建向导
            </button>
          </div>
        </div>

        <!-- ═══ Batch Panel Modal ═══ -->
        <teleport to="body">
          <transition name="tm-modal">
            <div v-if="batchExpanded" class="tm-modal-overlay" @click.self="batchExpanded = false">
              <div class="tm-modal-content">
                <div class="tm-modal-header">
                  <div>
                    <h3 class="tm-modal-title">
                      <span class="material-symbols-outlined" style="color: var(--primary)">
                        auto_awesome
                      </span>
                      智能标签解析
                    </h3>
                    <p class="tm-modal-desc">粘贴文本、CSV 或 JSON，AI 将自动提取标签。</p>
                  </div>
                  <button type="button" class="tm-icon-btn" @click="batchExpanded = false">
                    <span class="material-symbols-outlined">close</span>
                  </button>
                </div>
                <div class="tm-modal-body">
                  <TagBatchPanel
                    v-model:batch-input="batchInput"
                    v-model:batch-auto-color="batchAutoColor"
                    :batch-preview-names="batchPreviewNames"
                    :saving="saving"
                    @batch-create="batchCreate"
                  />
                </div>
              </div>
            </div>
          </transition>
        </teleport>

        <!-- ═══ Tag Cards Grid ═══ -->
        <div class="tm-card-grid">
          <div v-if="sortedTags.length === 0" class="tm-list-empty">
            <el-empty description="暂无标签" :image-size="80">
              <el-button type="primary" plain @click="openCreate">去新建</el-button>
            </el-empty>
          </div>
          <TagListRow
            v-for="tag in sortedTags"
            :key="tag.id"
            :tag="tag"
            :server-url="serverUrl"
            :tag-icon="getTagIcon(tag)"
            @edit="openEdit"
            @delete="onDelete"
          />
        </div>

        <!-- ═══ Pagination ═══ -->
        <div v-if="total > pageSize" class="tm-pager">
          <span class="tm-pager-total">共 {{ total }} 条</span>
          <el-pagination
            background
            size="small"
            :current-page="page"
            :page-size="pageSize"
            :total="total"
            layout="prev, pager, next"
            @current-change="
              (v: number) => {
                page = v
              }
            "
          />
        </div>
      </section>
    </template>

    <TagFormDialog
      :visible="dialogVisible"
      :editing-id="editingId"
      :tag-form="tagForm"
      :saving="saving"
      :preset-colors="presetColors"
      @update:visible="dialogVisible = $event"
      @update:tag-form="Object.assign(tagForm, $event)"
      @submit="submitTag"
    />
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════
   Tokens — mapped from design code.html
   ══════════════════════════════════════════ */
.tm-root {
  /* surfaces */
  --surface: var(--tp-surface-base);
  --surface-container-lowest: var(--tp-surface-input);
  --surface-container-low: var(--tp-surface-elevated);
  --surface-container: var(--tp-surface-card);
  --surface-container-high: var(--tp-surface-elevated);
  --surface-container-highest: var(--tp-surface-hover);
  --surface-bright: var(--tp-surface-hover);
  /* text */
  --on-surface: var(--tp-gray-900);
  --on-surface-variant: var(--tp-gray-700);
  --outline: var(--tp-gray-500);
  --outline-variant: var(--tp-border-strong);
  /* accent */
  --primary: var(--tp-primary);
  --primary-container: var(--tp-primary-dark);
  --secondary: var(--tp-accent-info);
  --secondary-container: var(--tp-accent-info);
  --tertiary-container: var(--tp-accent-warning);
  --error: var(--tp-accent-danger);
  /* glass */
  --glass-bg: var(--tp-surface-card);
  --glass-border: var(--tp-border-subtle);
  /* compat for BatchPanel */
  --purple: var(--tp-primary);
  --purple-light: var(--tp-accent-primary);
  --purple-20: var(--tp-accent-primary-soft);
  --purple-50: var(--tp-accent-primary-border);
  --text-primary: var(--tp-gray-900);
  --text-secondary: var(--tp-gray-700);
  --text-muted: var(--tp-gray-500);
  --bg-input: var(--tp-surface-input);
  --bg-dropdown: var(--tp-surface-card);
  --border-subtle: var(--tp-border-subtle);
  --border-20: var(--tp-border-strong);
  --text-muted-40: var(--tp-gray-400);

  font-family: 'Inter', sans-serif;
  color: var(--on-surface);
  line-height: 1.5;
  padding: 0 0 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}

/* ══ Empty / Skeleton ══ */
.tm-empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}
.tm-skeleton {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 32px;
}
.tm-skeleton-panels {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
}
.tm-skeleton-card {
  background: var(--surface-container-low);
  padding: 24px;
  border-radius: 12px;
}

/* ══════════════════════════════════════════
   TopNavBar
   ══════════════════════════════════════════ */
.tm-topnav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 32px;
  background: rgba(17, 19, 30, 0.8);
  backdrop-filter: blur(20px);
  position: sticky;
  top: 0;
  z-index: 10;
  margin-bottom: -16px;
}
.tm-title {
  font-size: 24px;
  font-weight: 600;
  color: #fff;
  margin: 0;
  letter-spacing: -0.02em;
}
.tm-subtitle {
  font-size: 14px;
  color: var(--on-surface-variant);
  margin: 4px 0 0;
  font-weight: 300;
}
.tm-topnav-right {
  display: flex;
  align-items: center;
  gap: 24px;
}
/* 与用例评审页 .pipeline-search-box 保持一致：flex 容器承载边框/背景，图标 inline */
.tm-search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(74, 68, 85, 0.35);
  border-radius: 8px;
  padding: 6px 12px;
  width: 390px;
  transition:
    border-color 0.2s,
    box-shadow 0.2s,
    background 0.2s;
}
.tm-search-box:focus-within {
  border-color: rgba(124, 58, 237, 0.5);
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.12);
  background: rgba(255, 255, 255, 0.07);
}
.tm-search-icon {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.4);
  flex-shrink: 0;
  transition: color 0.2s;
}
.tm-search-box:focus-within .tm-search-icon {
  color: rgba(124, 58, 237, 0.8);
}
.tm-search-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: rgba(255, 255, 255, 0.9);
  caret-color: #a78bfa;
  font-size: 13px;
  font-family: inherit;
}
.tm-search-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}
.tm-search-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(124, 58, 237, 0.8);
  border-top-color: transparent;
  animation: tm-spin 0.8s linear infinite;
  flex-shrink: 0;
  opacity: 0.85;
}
@keyframes tm-spin {
  to {
    transform: rotate(360deg);
  }
}
.tm-topnav-icons {
  display: flex;
  gap: 16px;
  color: var(--on-surface-variant);
}
.tm-icon-btn {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  transition: color 0.15s;
}
.tm-icon-btn:hover {
  color: #fff;
}
.tm-icon-btn .material-symbols-outlined {
  font-size: 22px;
}

/* ══════════════════════════════════════════
   Quality Insights Dashboard
   ══════════════════════════════════════════ */
.tm-insights {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 24px;
  padding: 0 32px;
}
.tm-panel {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  padding: 24px;
  position: relative;
  overflow: hidden;
}
.tm-panel--pulse {
  background: var(--surface-container-low);
}
.tm-panel--heat {
  background: var(--surface-container-low);
  display: flex;
  flex-direction: column;
}
.tm-panel-glow {
  position: absolute;
  top: 0;
  right: 0;
  width: 256px;
  height: 256px;
  background: var(--primary-container);
  border-radius: 50%;
  mix-blend-mode: screen;
  filter: blur(100px);
  opacity: 0.2;
  pointer-events: none;
}
.tm-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  position: relative;
  z-index: 1;
}
.tm-panel-title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin: 0;
  letter-spacing: -0.02em;
}
.tm-panel-desc {
  font-size: 14px;
  color: var(--on-surface-variant);
  margin: 4px 0 0;
  font-weight: 300;
}
.tm-panel-icon-right {
  color: var(--secondary);
  font-size: 24px;
}
.tm-panel-empty {
  font-size: 13px;
  color: var(--outline);
  text-align: center;
  padding: 40px 0;
}

/* ── Pulse Bar Chart ── */
.tm-pulse-chart {
  position: relative;
  z-index: 1;
  margin-top: 16px;
}
.tm-pulse-bars {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 160px;
}
.tm-pulse-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  position: relative;
}
.tm-pulse-col:hover .tm-pulse-tooltip {
  opacity: 1;
}
.tm-pulse-tooltip {
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%) translateY(-100%);
  font-size: 12px;
  color: var(--secondary);
  opacity: 0;
  transition: opacity 0.15s;
  white-space: nowrap;
  pointer-events: none;
}
.tm-pulse-col:first-child .tm-pulse-tooltip,
.tm-pulse-bar--top + .tm-pulse-tooltip {
  color: var(--primary);
  font-weight: 600;
}
.tm-pulse-bar {
  width: 100%;
  background: color-mix(in srgb, var(--bar-color, #958da1) 20%, transparent);
  border-radius: 4px 4px 0 0;
  transition:
    height 0.6s ease,
    background 0.2s,
    filter 0.2s;
  min-height: 4px;
  border-top: 1px solid color-mix(in srgb, var(--bar-color, #958da1) 40%, transparent);
}
.tm-pulse-bar:hover {
  filter: brightness(1.5);
}
.tm-pulse-bar--top {
  background: color-mix(in srgb, var(--bar-color) 50%, transparent);
  border-top: 2px solid var(--bar-color);
}
.tm-pulse-bar--top:hover {
  filter: brightness(1.3);
}

/* ══════════════════════════════════════════
   Action Bar & Tabs
   ══════════════════════════════════════════ */
.tm-actionbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  padding: 0 32px 16px;
  border-bottom: 1px solid rgba(74, 68, 85, 0.2);
  margin-top: -8px;
}
.tm-tabs {
  display: flex;
  gap: 24px;
}
.tm-tab {
  background: none;
  border: none;
  font-size: 14px;
  font-weight: 500;
  color: var(--on-surface-variant);
  cursor: pointer;
  padding: 0 0 8px;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  font-family: inherit;
  letter-spacing: 0.02em;
}
.tm-tab:hover {
  color: var(--on-surface);
}
.tm-tab.active {
  color: var(--primary);
  font-weight: 600;
  border-bottom-color: var(--primary);
}
.tm-actionbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.tm-sort {
  display: flex;
  align-items: center;
  gap: 4px;
}
.tm-sort-label {
  font-size: 12px;
  color: var(--on-surface-variant);
}
.tm-sort-select {
  background: transparent;
  border: none;
  font-size: 12px;
  color: var(--on-surface);
  font-weight: 600;
  cursor: pointer;
  outline: none;
  font-family: inherit;
}
.tm-sort-select option {
  background: var(--surface-container);
}
.tm-btn-filter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid rgba(74, 68, 85, 0.3);
  background: transparent;
  color: var(--on-surface);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
  font-family: inherit;
  white-space: nowrap;
}
.tm-btn-filter:hover {
  background: var(--surface-bright);
}
.tm-btn-wizard {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: var(--tp-btn-radius);
  border: none;
  background: var(--tp-btn-bg);
  color: var(--tp-btn-text);
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
  box-shadow: var(--tp-btn-shadow);
  transition: all var(--tp-transition);
  font-family: inherit;
  white-space: nowrap;
}
.tm-btn-wizard:hover {
  background: var(--tp-btn-bg-hover);
  box-shadow: var(--tp-btn-shadow-hover);
}

/* ══════════════════════════════════════════
   Tag Cards Grid — Bento style
   ══════════════════════════════════════════ */
.tm-card-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  padding: 0 32px;
  margin-top: -4px;
}
.tm-list-empty {
  grid-column: 1 / -1;
  text-align: center;
  padding: 60px 0;
}

/* ══ Pagination ══ */
.tm-pager {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 32px 0;
}
.tm-pager-total {
  font-size: 11px;
  color: var(--outline);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.tm-pager :deep(.el-pagination) {
  --el-pagination-bg-color: transparent;
  --el-pagination-button-disabled-bg-color: transparent;
  --el-pagination-hover-color: #fff;
}
.tm-pager :deep(.btn-prev),
.tm-pager :deep(.btn-next) {
  color: var(--outline);
}
.tm-pager :deep(.el-pager li) {
  background: transparent;
  color: var(--outline);
  border-radius: 4px;
}
.tm-pager :deep(.el-pager li.is-active) {
  background: var(--primary-container) !important;
  color: #fff;
}
.tm-pager :deep(.el-pager li:hover) {
  background: var(--surface-container-high);
}

/* ══ Responsive ══ */
@media (max-width: 1200px) {
  .tm-insights {
    grid-template-columns: 1fr;
  }
  .tm-card-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 768px) {
  .tm-card-grid {
    grid-template-columns: 1fr;
  }
  .tm-topnav {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
}

.tm-root {
  --surface: var(--tp-surface-base);
  --surface-container-lowest: var(--tp-surface-base);
  --surface-container-low: var(--tp-surface-card);
  --surface-container: var(--tp-surface-card);
  --surface-container-high: var(--tp-surface-elevated);
  --surface-container-highest: var(--tp-surface-elevated);
  --surface-bright: var(--tp-surface-hover);
  --on-surface: var(--tp-gray-900);
  --on-surface-variant: var(--tp-gray-700);
  --outline: var(--tp-gray-500);
  --outline-variant: var(--tp-border-subtle);
  --primary: var(--tp-accent-primary);
  --primary-container: var(--tp-primary);
  --secondary: var(--tp-accent-info);
  --secondary-container: var(--tp-accent-info);
  --error: var(--tp-accent-danger);
  --glass-bg: var(--tp-surface-card);
  --glass-border: var(--tp-border-subtle);
  --purple: var(--tp-primary);
  --purple-light: var(--tp-accent-primary);
  --purple-20: var(--tp-accent-primary-soft);
  --purple-50: var(--tp-accent-primary-border);
  --text-primary: var(--tp-gray-900);
  --text-secondary: var(--tp-gray-700);
  --text-muted: var(--tp-gray-500);
  --bg-input: var(--tp-surface-input);
  --bg-dropdown: var(--tp-surface-elevated);
  --border-subtle: var(--tp-border-subtle);
  --border-20: var(--tp-border-strong);
  --text-muted-40: var(--tp-gray-400);
  background:
    radial-gradient(circle at 12% 0%, var(--tp-ambient-primary), transparent 30%),
    radial-gradient(circle at 88% 10%, var(--tp-ambient-info), transparent 28%),
    var(--tp-surface-base);
}

.tm-topnav,
.tm-panel,
.tm-panel--pulse,
.tm-panel--heat {
  background:
    linear-gradient(180deg, var(--tp-surface-sheen), transparent 38%), var(--tp-surface-card);
  border: 1px solid var(--tp-border-subtle);
  box-shadow: var(--tp-shadow-card);
  backdrop-filter: none;
}

.tm-title,
.tm-panel-title,
.tm-sort-select {
  color: var(--tp-gray-900);
}

.tm-subtitle,
.tm-panel-desc,
.tm-sort-label,
.tm-pager-total,
.tm-pager :deep(.btn-prev),
.tm-pager :deep(.btn-next),
.tm-pager :deep(.el-pager li) {
  color: var(--tp-gray-500);
}

.tm-search-box,
.tm-btn-filter {
  background: var(--tp-surface-input);
  border-color: var(--tp-border-subtle);
}

.tm-search-box:focus-within {
  border-color: var(--tp-accent-primary-border);
  box-shadow: 0 0 0 3px var(--tp-accent-primary-soft);
  background: var(--tp-surface-hover);
}

.tm-search-box:focus-within .tm-search-icon,
.tm-tab.active,
.tm-panel-icon-right {
  color: var(--tp-accent-primary);
}

.tm-search-spinner {
  border-color: var(--tp-accent-primary);
  border-top-color: transparent;
}

.tm-tab.active {
  border-bottom-color: var(--tp-primary);
}

.tm-btn-wizard,
.tm-pager :deep(.el-pager li.is-active) {
  background: var(--tp-btn-bg) !important;
  color: var(--tp-btn-text);
  border-radius: var(--tp-btn-radius);
  box-shadow: var(--tp-btn-shadow);
}

.tm-btn-wizard:hover {
  background: var(--tp-btn-bg-hover) !important;
  box-shadow: var(--tp-btn-shadow-hover);
}

.tm-btn-filter:hover,
.tm-pager :deep(.el-pager li:hover) {
  background: var(--tp-surface-hover);
}

.tm-panel-glow {
  opacity: 0.06;
}

.tm-pulse-bar:hover,
.tm-pulse-bar--top:hover {
  filter: none;
}

.tm-actionbar {
  border-bottom-color: var(--tp-border-subtle);
}

.tm-icon-btn:focus-visible,
.tm-tab:focus-visible,
.tm-btn-filter:focus-visible,
.tm-btn-wizard:focus-visible,
.tm-sort-select:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--tp-accent-primary-soft);
}

.tm-root {
  --tech-panel:
    linear-gradient(145deg, rgba(255, 255, 255, 0.9), rgba(248, 250, 252, 0.72)),
    radial-gradient(circle at 12% 0%, rgba(99, 102, 241, 0.14), transparent 34%),
    radial-gradient(circle at 92% 14%, rgba(2, 132, 199, 0.12), transparent 32%);
  --tech-border: rgba(148, 163, 184, 0.28);
  --tech-line: rgba(99, 102, 241, 0.16);
  gap: 18px;
  padding-bottom: 28px;
  background:
    radial-gradient(circle at 8% -8%, rgba(99, 102, 241, 0.18), transparent 34%),
    radial-gradient(circle at 92% 2%, rgba(2, 132, 199, 0.16), transparent 30%),
    linear-gradient(180deg, rgba(248, 250, 252, 0.92), var(--tp-surface-base) 38%);
}

.tm-root::before {
  content: '';
  position: sticky;
  top: 0;
  z-index: 0;
  display: block;
  height: 1px;
  margin-bottom: -1px;
  pointer-events: none;
  box-shadow:
    0 0 80px rgba(99, 102, 241, 0.14),
    0 0 120px rgba(2, 132, 199, 0.1);
}

.tm-topnav {
  margin: 16px 32px -4px;
  padding: 18px 20px;
  border: 1px solid var(--tech-border);
  border-radius: 18px;
  background: var(--tech-panel);
  box-shadow:
    0 18px 42px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.tm-title {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--tp-gray-900);
  font-size: var(--tp-text-2xl);
  font-weight: var(--tp-font-bold);
  letter-spacing: -0.03em;
}

.tm-title::before {
  content: '';
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--tp-primary);
  box-shadow:
    0 0 0 5px rgba(99, 102, 241, 0.12),
    0 0 24px rgba(99, 102, 241, 0.46);
}

.tm-subtitle {
  color: var(--tp-text-muted);
  font-size: var(--tp-text-sm);
  font-weight: var(--tp-font-medium);
}

.tm-search-box {
  width: min(390px, 38vw);
  min-height: 38px;
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 252, 0.82)),
    var(--tp-surface-input);
  border-color: rgba(99, 102, 241, 0.18);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    0 10px 26px rgba(15, 23, 42, 0.05);
}

.tm-search-box:focus-within {
  border-color: rgba(99, 102, 241, 0.42);
  box-shadow:
    0 0 0 4px rgba(99, 102, 241, 0.1),
    0 14px 32px rgba(99, 102, 241, 0.14);
}

.tm-search-input {
  color: var(--tp-gray-900);
  caret-color: var(--tp-primary);
}

.tm-search-input::placeholder {
  color: var(--tp-gray-400);
}

.tm-insights {
  gap: 18px;
  padding: 0 32px;
}

.tm-panel,
.tm-panel--pulse,
.tm-panel--heat {
  border-color: var(--tech-border);
  border-radius: 18px;
  background: var(--tech-panel);
  box-shadow:
    0 18px 42px rgba(15, 23, 42, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.76);
}

.tm-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.46), transparent) top / 100% 1px
      no-repeat,
    repeating-linear-gradient(
      90deg,
      transparent 0,
      transparent 31px,
      rgba(99, 102, 241, 0.035) 32px
    );
}

.tm-panel-glow {
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.22), transparent 62%);
  opacity: 0.55;
  filter: blur(54px);
}

.tm-panel-title {
  color: var(--tp-gray-900);
  font-size: var(--tp-text-lg);
  font-weight: var(--tp-font-bold);
}

.tm-panel-desc {
  color: var(--tp-text-muted);
  font-weight: var(--tp-font-medium);
}

.tm-heat-title {
  margin-bottom: 20px;
}

.tm-panel-icon-right {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.1);
  color: var(--tp-primary);
  box-shadow: 0 0 22px rgba(99, 102, 241, 0.16);
}

.tm-pulse-bars {
  height: 148px;
  gap: 10px;
  padding-top: 10px;
}

.tm-pulse-bar {
  border-radius: 10px 10px 3px 3px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bar-color) 54%, #fff), transparent 122%),
    color-mix(in srgb, var(--bar-color) 26%, #fff);
  border: 1px solid color-mix(in srgb, var(--bar-color) 24%, var(--tp-border-subtle));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.72),
    0 10px 24px color-mix(in srgb, var(--bar-color) 16%, transparent);
}

.tm-pulse-bar--top {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--bar-color) 72%, #fff), transparent 125%),
    color-mix(in srgb, var(--bar-color) 34%, #fff);
  border-color: color-mix(in srgb, var(--bar-color) 38%, var(--tp-border-subtle));
}

.tm-pulse-bar:hover,
.tm-pulse-bar--top:hover {
  filter: saturate(1.08) brightness(1.02);
}

.tm-pulse-tooltip {
  padding: 4px 8px;
  border: 1px solid rgba(99, 102, 241, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--tp-gray-800);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
}

.tm-actionbar {
  align-items: center;
  margin: -2px 32px 0;
  padding: 12px 14px;
  border: 1px solid var(--tech-border);
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.84), rgba(248, 250, 252, 0.72)),
    rgba(255, 255, 255, 0.72);
  box-shadow:
    0 12px 28px rgba(15, 23, 42, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.76);
}

.tm-tabs {
  gap: 4px;
  padding: 3px;
  border: 1px solid rgba(99, 102, 241, 0.13);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
}

.tm-tab {
  min-height: 30px;
  padding: 0 13px;
  border: 0;
  border-radius: 999px;
  color: var(--tp-text-muted);
  letter-spacing: 0;
}

.tm-tab.active {
  background: rgba(99, 102, 241, 0.12);
  color: var(--tp-primary);
  box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.16);
}

.tm-sort {
  height: 34px;
  padding: 0 10px;
  border: 1px solid rgba(99, 102, 241, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
}

.tm-btn-filter,
.tm-btn-wizard {
  min-height: 34px;
  border-radius: 999px;
}

.tm-btn-filter {
  border-color: rgba(99, 102, 241, 0.2);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 252, 0.82)),
    var(--tp-surface-input);
  color: var(--tp-primary);
  box-shadow: 0 10px 22px rgba(99, 102, 241, 0.08);
}

.tm-btn-filter:hover {
  background: rgba(99, 102, 241, 0.1);
}

.tm-btn-wizard {
  background:
    radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.42), transparent 32%), var(--tp-btn-bg) !important;
  box-shadow:
    0 16px 30px rgba(99, 102, 241, 0.24),
    0 8px 18px rgba(236, 72, 153, 0.16);
}

.tm-card-grid {
  grid-template-columns: repeat(auto-fill, minmax(292px, 1fr));
  gap: 16px;
}

.tm-pager {
  margin: 0 32px;
  padding: 12px 0 0;
}

@media (max-width: 768px) {
  .tm-topnav,
  .tm-actionbar,
  .tm-pager {
    margin-inline: 16px;
  }

  .tm-search-box {
    width: 100%;
  }

  .tm-insights,
  .tm-card-grid {
    padding-inline: 16px;
  }
}

.tm-root {
  gap: 12px;
  padding-bottom: 20px;
}

.tm-topnav {
  margin: 10px 24px -2px;
  padding: 12px 16px;
  border-radius: 14px;
}

.tm-title {
  font-size: var(--tp-text-xl);
}

.tm-title::before {
  width: 8px;
  height: 8px;
  box-shadow:
    0 0 0 4px rgba(99, 102, 241, 0.1),
    0 0 18px rgba(99, 102, 241, 0.38);
}

.tm-subtitle {
  margin-top: 2px;
  font-size: var(--tp-text-xs);
}

.tm-search-box {
  width: min(340px, 34vw);
  min-height: 32px;
  padding: 5px 11px;
}

.tm-insights {
  gap: 12px;
  padding: 0 24px;
}

.tm-panel {
  padding: 16px;
  border-radius: 14px;
}

.tm-panel-head {
  margin-bottom: 12px;
}

.tm-panel-title {
  font-size: var(--tp-text-md);
}

.tm-panel-desc {
  margin-top: 2px;
  font-size: var(--tp-text-xs);
}

.tm-panel-icon-right {
  width: 28px;
  height: 28px;
  font-size: 18px;
}

.tm-heat-title {
  margin-bottom: 14px;
}

.tm-pulse-chart {
  margin-top: 8px;
}

.tm-pulse-bars {
  height: 112px;
  gap: 7px;
  padding-top: 4px;
}

.tm-actionbar {
  margin: -2px 24px 0;
  padding: 8px 10px;
  border-radius: 14px;
}

.tm-tabs {
  padding: 2px;
}

.tm-tab {
  min-height: 28px;
  padding: 0 10px;
  font-size: var(--tp-text-xs);
}

.tm-sort,
.tm-btn-filter,
.tm-btn-wizard {
  min-height: 30px;
}

.tm-btn-filter,
.tm-btn-wizard {
  padding: 6px 12px;
  font-size: var(--tp-text-sm);
}

.tm-card-grid {
  grid-template-columns: repeat(auto-fill, minmax(268px, 1fr));
  gap: 12px;
  padding: 0 24px;
  margin-top: -2px;
}

.tm-pager {
  margin: 0 24px;
  padding-top: 8px;
}

@media (max-width: 768px) {
  .tm-topnav,
  .tm-actionbar,
  .tm-pager {
    margin-inline: 16px;
  }

  .tm-insights,
  .tm-card-grid {
    padding-inline: 16px;
  }
}

.tm-tag-workbench {
  margin: 0 24px;
  padding: 12px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 18px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.88), rgba(248, 250, 252, 0.72)),
    radial-gradient(circle at 16% 0%, rgba(99, 102, 241, 0.1), transparent 32%),
    radial-gradient(circle at 90% 16%, rgba(2, 132, 199, 0.08), transparent 28%);
  box-shadow:
    0 18px 42px rgba(15, 23, 42, 0.07),
    inset 0 1px 0 rgba(255, 255, 255, 0.78);
}

.tm-tag-workbench-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 4px 10px;
}

.tm-tag-workbench-title {
  margin: 0;
  color: var(--tp-gray-900);
  font-size: var(--tp-text-md);
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-tight);
}

.tm-tag-workbench-desc {
  margin: 3px 0 0;
  color: var(--tp-text-muted);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-medium);
  line-height: var(--tp-line-ui);
}

.tm-tag-workbench .tm-actionbar {
  margin: 0;
  padding: 8px 0 10px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.tm-tag-workbench .tm-card-grid {
  grid-template-columns: repeat(4, minmax(228px, 1fr));
  gap: 10px;
  padding: 0;
  margin-top: 0;
}

.tm-tag-workbench .tm-pager {
  margin: 0;
  padding: 10px 0 0;
}

.tm-tag-workbench .tm-btn-filter {
  border: 0;
  background:
    radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.42), transparent 32%), var(--tp-btn-bg) !important;
  color: var(--tp-btn-text);
  box-shadow:
    0 14px 28px rgba(99, 102, 241, 0.22),
    0 8px 18px rgba(236, 72, 153, 0.12);
}

.tm-tag-workbench .tm-btn-filter:hover {
  background:
    radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.48), transparent 34%),
    var(--tp-btn-bg-hover) !important;
}

.tm-tag-workbench .tm-btn-wizard {
  border: 1px solid rgba(99, 102, 241, 0.2);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(248, 250, 252, 0.78)),
    rgba(99, 102, 241, 0.08) !important;
  color: var(--tp-primary);
  box-shadow: none;
}

.tm-tag-workbench .tm-btn-wizard:hover {
  background: rgba(99, 102, 241, 0.11) !important;
  box-shadow: 0 10px 22px rgba(99, 102, 241, 0.1);
}

.tm-pulse-bars {
  height: 96px;
}

@media (max-width: 1180px) {
  .tm-tag-workbench .tm-card-grid {
    grid-template-columns: repeat(3, minmax(240px, 1fr));
  }
}

@media (max-width: 900px) {
  .tm-tag-workbench .tm-card-grid {
    grid-template-columns: repeat(2, minmax(240px, 1fr));
  }
}

@media (max-width: 768px) {
  .tm-tag-workbench {
    margin-inline: 16px;
  }

  .tm-tag-workbench .tm-card-grid {
    grid-template-columns: 1fr;
  }
}

.tm-root {
  gap: 10px;
  padding: 8px 12px 20px;
}

.tm-topnav {
  margin: 0;
}

.tm-insights {
  padding: 0;
}

.tm-tag-workbench {
  margin: 0;
}

@media (max-width: 768px) {
  .tm-root {
    padding-inline: 10px;
  }

  .tm-topnav,
  .tm-actionbar,
  .tm-pager,
  .tm-tag-workbench {
    margin-inline: 0;
  }

  .tm-insights,
  .tm-card-grid {
    padding-inline: 0;
  }
}
</style>

<style>
/* ══ Batch panel modal (unscoped — teleported to body) ══ */
.tm-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}
.tm-modal-content {
  width: 100%;
  max-width: 720px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: #1d1f2b;
  border: 1px solid rgba(74, 68, 85, 0.2);
  border-radius: 16px;
  box-shadow: 0 40px 60px -10px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}
.tm-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  border-bottom: 1px solid rgba(74, 68, 85, 0.2);
  background: #191b26;
}
.tm-modal-title {
  font-size: 20px;
  font-weight: 600;
  color: #fff;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: -0.02em;
  font-family: 'Inter', sans-serif;
}
.tm-modal-title .material-symbols-outlined {
  color: #d2bbff;
}
.tm-modal-desc {
  font-size: 12px;
  color: #ccc3d8;
  font-weight: 300;
  margin: 4px 0 0;
  font-family: 'Inter', sans-serif;
}
.tm-modal-header .tm-icon-btn {
  background: none;
  border: none;
  color: #958da1;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  transition: color 0.15s;
}
.tm-modal-header .tm-icon-btn:hover {
  color: #fff;
}
.tm-modal-body {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  /* propagate tokens so BatchPanel inherits them */
  --glass-bg: transparent;
  --border-subtle: transparent;
  --bg-input: rgba(255, 255, 255, 0.05);
  --border-20: rgba(74, 68, 85, 0.3);
  --text-primary: #e1e1f2;
  --text-secondary: #ccc3d8;
  --text-muted-40: rgba(149, 141, 161, 0.4);
  --purple: #7c3aed;
  --purple-light: #d2bbff;
  --purple-20: rgba(124, 58, 237, 0.2);
  --purple-50: rgba(124, 58, 237, 0.5);
}
/* hide redundant inner header & remove double border */
.tm-modal-body .tm-panel-header {
  display: none;
}
.tm-modal-body .tm-glass-panel {
  background: transparent;
  border: none;
  padding: 0;
  backdrop-filter: none;
  border-radius: 0;
}
/* make textarea visible & styled inside modal */
.tm-modal-body .tm-batch-textarea {
  background: #0c0e18;
  border: 1px solid rgba(74, 68, 85, 0.3);
  border-radius: 12px;
  color: #e1e1f2;
  font-size: 14px;
  padding: 16px;
  min-height: 120px;
}
.tm-modal-body .tm-batch-textarea:focus {
  border-color: rgba(124, 58, 237, 0.5);
}
.tm-modal-body .tm-batch-textarea::placeholder {
  color: rgba(149, 141, 161, 0.5);
}
.tm-modal-enter-active,
.tm-modal-leave-active {
  transition: opacity 0.2s ease;
}
.tm-modal-enter-from,
.tm-modal-leave-to {
  opacity: 0;
}
.tm-modal-enter-active .tm-modal-content {
  animation: tm-modal-in 0.25s ease;
}
@keyframes tm-modal-in {
  from {
    transform: scale(0.95) translateY(10px);
    opacity: 0;
  }
}

.tm-modal-overlay {
  background: var(--tp-overlay-scrim);
}

.tm-modal-content,
.tm-modal-header {
  background: var(--tp-surface-card);
  border-color: var(--tp-border-subtle);
}

.tm-modal-content {
  box-shadow: var(--tp-shadow-md);
}

.tm-modal-title {
  color: var(--tp-gray-900);
}

.tm-modal-title .material-symbols-outlined {
  color: var(--tp-accent-primary);
}

.tm-modal-desc,
.tm-modal-header .tm-icon-btn {
  color: var(--tp-gray-500);
}

.tm-modal-header .tm-icon-btn:hover {
  color: var(--tp-gray-900);
}

.tm-modal-body {
  --bg-input: var(--tp-surface-input);
  --border-20: var(--tp-border-strong);
  --text-primary: var(--tp-gray-900);
  --text-secondary: var(--tp-gray-700);
  --text-muted-40: var(--tp-gray-400);
  --purple: var(--tp-primary);
  --purple-light: var(--tp-accent-primary);
  --purple-20: var(--tp-accent-primary-soft);
  --purple-50: var(--tp-accent-primary-border);
}

.tm-modal-body .tm-batch-textarea {
  background: var(--tp-surface-input);
  border-color: var(--tp-border-subtle);
  color: var(--tp-gray-900);
}

.tm-modal-body .tm-batch-textarea:focus {
  border-color: var(--tp-accent-primary-border);
  box-shadow: 0 0 0 3px var(--tp-accent-primary-soft);
}

.tm-modal-header .tm-icon-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--tp-accent-primary-soft);
}

.tm-modal-overlay {
  background:
    radial-gradient(circle at 50% 18%, rgba(99, 102, 241, 0.16), transparent 34%),
    rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(6px);
}

.tm-modal-content {
  max-width: 680px;
  border-color: rgba(148, 163, 184, 0.26);
  border-radius: 20px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.88)),
    radial-gradient(circle at 8% 0%, rgba(99, 102, 241, 0.14), transparent 34%);
  box-shadow:
    0 32px 84px rgba(15, 23, 42, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.82);
}

.tm-modal-header {
  background: transparent;
  border-bottom-color: rgba(148, 163, 184, 0.18);
}

.tm-modal-title {
  color: var(--tp-gray-900);
  font-size: var(--tp-text-xl);
  font-weight: var(--tp-font-bold);
}

.tm-modal-title .material-symbols-outlined {
  color: var(--tp-primary);
  text-shadow: 0 0 18px rgba(99, 102, 241, 0.32);
}

.tm-modal-desc {
  color: var(--tp-text-muted);
  font-weight: var(--tp-font-medium);
}

.tm-modal-body .tm-batch-textarea {
  border-color: rgba(99, 102, 241, 0.18);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(248, 250, 252, 0.78)),
    var(--tp-surface-input);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.78);
}
</style>
