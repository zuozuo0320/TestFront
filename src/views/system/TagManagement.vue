<script setup lang="ts">
/**
 * 标签管理页面 — 页面编排层
 *
 * 职责：仅组合子组件 + 注入 Composable，严禁包含业务逻辑。
 * 子组件：TagHeatGrid / TagBatchPanel / TagSummaryCard / TagListRow / TagFormDialog
 * 业务逻辑：useTagManagement composable
 *
 * 页面状态三态闭环：
 *   1. 未选项目 → 显示空状态提示
 *   2. 加载中    → 显示骨架屏
 *   3. 数据已加载 → 显示热度统计 + 标签列表 + 批量创建面板
 */
import { Search } from '@element-plus/icons-vue'
import { useTagManagement } from '../../composables/useTagManagement'
import TagHeatGrid from './components/TagHeatGrid.vue'
import TagBatchPanel from './components/TagBatchPanel.vue'
import TagSummaryCard from './components/TagSummaryCard.vue'
import TagFormDialog from './components/TagFormDialog.vue'
import TagListRow from './components/TagListRow.vue'

// 从 composable 解构所有响应式状态、计算属性和方法
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
  totalCaseCount,
  maxCaseCount,
  unusedCount,
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

// 热度排行条颜色：从第 1 名到第 5 名依次使用不同颜色区分排名
const rankBarColors = ['#7c3aed', '#0566d9', '#a15100', '#958da1', '#ef4444']
</script>

<template>
  <div class="tm-root">
    <!-- State 1: No project selected -->
    <div v-if="!selectedProject" class="tm-empty-state">
      <el-empty description="请先在侧边栏选择一个项目" :image-size="120" />
    </div>

    <!-- State 2: Loading skeleton -->
    <div v-else-if="loading && tags.length === 0" class="tm-skeleton">
      <div class="tm-skeleton-heat">
        <el-skeleton :rows="1" animated style="width: 120px; margin-bottom: 16px" />
        <div class="tm-skeleton-grid">
          <el-skeleton v-for="n in 5" :key="n" :rows="3" animated class="tm-skeleton-card" />
        </div>
      </div>
      <div class="tm-skeleton-main"><el-skeleton :rows="6" animated /></div>
    </div>
    <!-- State 3: Data loaded -->
    <template v-else>
      <TagHeatGrid
        v-if="tags.length > 0"
        :top-tags="topTags"
        :max-case-count="maxCaseCount"
        :rank-bar-colors="rankBarColors"
      />

      <div class="tm-main-grid">
        <div class="tm-left-col">
          <TagBatchPanel
            v-model:batch-input="batchInput"
            v-model:batch-auto-color="batchAutoColor"
            :batch-preview-names="batchPreviewNames"
            :saving="saving"
            @batch-create="batchCreate"
          />
          <TagSummaryCard
            :tags="tags"
            :total-case-count="totalCaseCount"
            :top-tag-name="topTags[0]?.name ?? '-'"
            :unused-count="unusedCount"
          />
        </div>

        <div class="tm-right-col">
          <div class="tm-list-toolbar">
            <div class="tm-tabs">
              <button
                type="button"
                :class="['tm-tab', { active: activeTab === 'all' }]"
                @click="activeTab = 'all'"
              >
                全部标签
              </button>
              <button
                type="button"
                :class="['tm-tab', { active: activeTab === 'recent' }]"
                @click="
                  activeTab = 'recent'
                  sortBy = 'created_at'
                "
              >
                最近更新
              </button>
            </div>
            <div class="tm-toolbar-right">
              <el-input
                v-model="keyword"
                placeholder="搜索标签..."
                clearable
                :prefix-icon="Search"
                size="small"
                style="width: 180px"
                @keyup.enter="onSearch"
                @input="onSearchDebounce"
                @clear="onSearch"
              />
              <div class="tm-sort">
                <span class="tm-sort-label">排序:</span>
                <select v-model="sortBy" class="tm-sort-select">
                  <option value="case_count">用例数</option>
                  <option value="name">名称</option>
                  <option value="created_at">创建时间</option>
                </select>
              </div>
              <button type="button" class="um-add-btn" @click="openCreate">
                <span class="um-add-icon">+</span>
                新建标签
              </button>
            </div>
          </div>

          <div class="tm-tag-list">
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
        </div>
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
/* ── Design System Tokens ── */
.tm-root {
  --bg-main: #11131e;
  --bg-card: #191b26;
  --bg-card-high: #272935;
  --bg-bright: #373845;
  --text-primary: #e1e1f2;
  --text-secondary: #ccc3d8;
  --text-muted: #958da1;
  --text-faint: #64748b;
  --purple: #7c3aed;
  --purple-light: #d2bbff;
  --blue: #0566d9;
  --border-subtle: rgba(74, 68, 85, 0.1);
  --border-faint: rgba(74, 68, 85, 0.05);
  --green: #10b981;
  --slate: #94a3b8;
  --bg-input: #0c0e18;
  --bg-dropdown: #1d1f2b;
  --bg-dialog: #1e1e2d;
  --bg-dot-more: #323440;
  --purple-20: rgba(124, 58, 237, 0.2);
  --purple-50: rgba(124, 58, 237, 0.5);
  --text-secondary-60: rgba(204, 195, 216, 0.6);
  --text-secondary-50: rgba(204, 195, 216, 0.5);
  --text-muted-40: rgba(149, 141, 161, 0.4);
  --border-20: rgba(74, 68, 85, 0.2);
  --green-15: rgba(16, 185, 129, 0.15);
  --slate-15: rgba(100, 116, 139, 0.15);
  --bg-row: rgba(25, 27, 38, 0.5);
  --glass-bg: rgba(255, 255, 255, 0.04);

  font-family:
    'Inter',
    system-ui,
    -apple-system,
    sans-serif;
  color: var(--text-primary);
  line-height: 1.5;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 32px;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}

/* ── Empty State ── */
.tm-empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

/* ── Main Grid ── */
.tm-main-grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 32px;
}
.tm-left-col {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.tm-right-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── List Toolbar ── */
.tm-list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
}
.tm-tabs {
  display: flex;
  gap: 16px;
}
.tm-tab {
  background: none;
  border: none;
  font-size: 14px;
  font-weight: 400;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0 0 4px;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}
.tm-tab:hover {
  color: var(--text-primary);
}
.tm-tab.active {
  font-weight: 600;
  color: var(--purple-light);
  border-bottom-color: var(--purple-light);
}
.tm-toolbar-right {
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
  color: var(--text-secondary);
}
.tm-sort-select {
  background: transparent;
  border: none;
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 600;
  cursor: pointer;
  outline: none;
  font-family: inherit;
}
.tm-sort-select option {
  background: var(--bg-dropdown);
}
/* Add button — 与用户管理页统一 */
.um-add-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  margin-left: 16px;
  border-radius: 10px;
  border: none;
  background: var(--purple);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.um-add-btn:hover {
  filter: brightness(1.15);
}
.um-add-btn:active {
  transform: scale(0.95);
}
.um-add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.um-add-icon {
  font-size: 16px;
  font-weight: 700;
}

/* ── Tag List ── */
.tm-tag-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tm-list-empty {
  text-align: center;
  padding: 60px 0;
}

/* ── Pagination ── */
.tm-pager {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 8px 0;
}
.tm-pager-total {
  font-size: 11px;
  color: var(--text-faint);
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
  color: var(--text-faint);
}
.tm-pager :deep(.el-pager li) {
  background: transparent;
  color: var(--text-faint);
  border-radius: 4px;
}
.tm-pager :deep(.el-pager li.is-active) {
  background: var(--purple) !important;
  color: #fff;
}
.tm-pager :deep(.el-pager li:hover) {
  background: var(--bg-card-high);
}

/* ── Skeleton ── */
.tm-skeleton {
  display: flex;
  flex-direction: column;
  gap: 32px;
}
.tm-skeleton-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
}
.tm-skeleton-card {
  background: var(--bg-card);
  padding: 20px;
  border-radius: 12px;
}
.tm-skeleton-main {
  background: var(--bg-card);
  padding: 24px;
  border-radius: 16px;
}

/* ── Responsive ── */
@media (max-width: 1200px) {
  .tm-heat-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .tm-main-grid {
    grid-template-columns: 1fr;
  }
}
</style>
