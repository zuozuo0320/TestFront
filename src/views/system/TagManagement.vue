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

const rankBarColors = ['#ef4444', '#f59e0b', '#adc6ff', '#d2bbff', '#10b981']
const batchExpanded = ref(false)

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
          <p class="tm-subtitle">标签管理 &amp; 智能分析</p>
        </div>
        <div class="tm-topnav-right">
          <div class="tm-search-box">
            <span class="material-symbols-outlined tm-search-icon">search</span>
            <input
              v-model="keyword"
              class="tm-search-input"
              type="text"
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
          <h3 class="tm-panel-title" style="margin-bottom: 24px">热度 Top 5</h3>
          <TagHeatGrid
            v-if="tags.length > 0"
            :top-tags="topTags"
            :max-case-count="maxCaseCount"
            :rank-bar-colors="rankBarColors"
          />
          <p v-else class="tm-panel-empty">暂无数据</p>
        </div>
      </section>

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
            @click="
              activeTab = 'recent'
              sortBy = 'created_at'
            "
          >
            最近更新 (7天内)
          </button>
        </div>
        <div class="tm-actionbar-right">
          <div class="tm-sort">
            <span class="tm-sort-label">排序:</span>
            <select v-model="sortBy" class="tm-sort-select">
              <option value="case_count">用例数</option>
              <option value="name">名称</option>
              <option value="created_at">创建时间</option>
            </select>
          </div>
          <button type="button" class="tm-btn-filter" @click="openCreate">
            <span class="material-symbols-outlined" style="font-size: 18px">filter_list</span>
            新建标签
          </button>
          <button type="button" class="tm-btn-wizard" @click="batchExpanded = !batchExpanded">
            <span class="material-symbols-outlined" style="font-size: 18px">magic_button</span>
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
  --surface: #11131e;
  --surface-container-lowest: #0c0e18;
  --surface-container-low: #191b26;
  --surface-container: #1d1f2b;
  --surface-container-high: #272935;
  --surface-container-highest: #323440;
  --surface-bright: #373845;
  /* text */
  --on-surface: #e1e1f2;
  --on-surface-variant: #ccc3d8;
  --outline: #958da1;
  --outline-variant: #4a4455;
  /* accent */
  --primary: #d2bbff;
  --primary-container: #7c3aed;
  --secondary: #adc6ff;
  --secondary-container: #0566d9;
  --tertiary-container: #a15100;
  --error: #ffb4ab;
  /* glass */
  --glass-bg: rgba(255, 255, 255, 0.04);
  --glass-border: rgba(74, 68, 85, 0.15);
  /* compat for BatchPanel */
  --purple: #7c3aed;
  --purple-light: #d2bbff;
  --purple-20: rgba(124, 58, 237, 0.2);
  --purple-50: rgba(124, 58, 237, 0.5);
  --text-primary: #e1e1f2;
  --text-secondary: #ccc3d8;
  --text-muted: #958da1;
  --bg-input: rgba(255, 255, 255, 0.05);
  --bg-dropdown: #1d1f2b;
  --border-subtle: rgba(74, 68, 85, 0.15);
  --border-20: rgba(74, 68, 85, 0.2);
  --text-muted-40: rgba(149, 141, 161, 0.4);

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
  border-radius: 8px;
  border: none;
  background: linear-gradient(
    to bottom right,
    var(--primary-container),
    var(--secondary-container)
  );
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 0 15px rgba(124, 58, 237, 0.3);
  transition: box-shadow 0.2s;
  font-family: inherit;
  white-space: nowrap;
}
.tm-btn-wizard:hover {
  box-shadow: 0 0 20px rgba(124, 58, 237, 0.5);
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
</style>
