<script setup lang="ts">
/**
 * 标签管理页面 — 页面编排层
 *
 * 职责：仅组合子组件 + 注入 Composable，严禁包含业务逻辑。
 * 子组件：TagBatchPanel / TagListRow / TagFormDialog
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
import EmptyState from '../../components/EmptyState.vue'

const {
  loading,
  initialized,
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

// 全站绑定的总关联用例数
const totalCases = computed(() => {
  return tags.value.reduce((acc, t) => acc + (t.case_count || 0), 0)
})

// 计算前 5 个圆环仪表盘数据 (完全契合最新的极客遥测面板风格)
const top5Rings = computed(() => {
  // 获取用例数降序排列的前 5 大标签
  const sorted = [...tags.value]
    .sort((a, b) => (b.case_count || 0) - (a.case_count || 0))
    .slice(0, 5)
  const top5Total = sorted.reduce((acc, t) => acc + (t.case_count || 0), 0)

  // 设计图专属 5 列配色及 Material 极客图标
  const slotConfigs = [
    { rank: '01', color: '#f59e0b', icon: 'shield' }, // 琥珀金/盾牌 (专享测试)
    { rank: '02', color: '#3b82f6', icon: 'widgets' }, // 天空蓝/组件 (普通测试)
    { rank: '03', color: '#10b981', icon: 'grid_view' }, // 翡翠绿/格子 (回归测试)
    { rank: '04', color: '#a78bfa', icon: 'construction' }, // 罗兰紫/工具 (兼容性测试)
    { rank: '05', color: '#38bdf8', icon: 'verified' }, // 天空蓝/安全 (安全测试)
  ]

  return slotConfigs.map((config, index) => {
    const tag = sorted[index]
    if (tag) {
      const count = tag.case_count || 0
      const pct = top5Total > 0 ? Number(((count / top5Total) * 100).toFixed(1)) : 0
      return {
        rank: config.rank,
        name: tag.name,
        color: tag.color || config.color,
        icon:
          getTagIcon(tag) ||
          config.icon /* 动态获取该标签实际关联的系统自定义图标，若无则使用默认齿轮槽备用 */,
        count,
        pct,
        isEmpty: false,
      }
    } else {
      return {
        rank: config.rank,
        name: `Slot ${config.rank}`,
        color: 'rgba(99, 102, 241, 0.15)',
        icon: 'add', // 使用小加号作为空槽位占位图标，引导点击新建
        count: 0,
        pct: 0,
        isEmpty: true,
      }
    }
  })
})
</script>

<template>
  <div class="tm-root">
    <!-- State 1: No project -->
    <div v-if="!selectedProject" class="tm-empty-state">
      <el-empty description="请先在侧边栏选择一个项目" :image-size="120" />
    </div>

    <!-- State 2: Loading (仅在首次加载未完成时显示，防止切换查询时闪烁) -->
    <div v-else-if="loading && !initialized" class="tm-skeleton">
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
      <!-- ═══ Quality Insights Dashboard (极客 TOP 5 + 热度排行榜) ═══ -->
      <section class="tm-insights">
        <!-- Left Column: Circular Dials Dashboard -->
        <div class="tm-panel tm-panel--dials-dashboard">
          <!-- 背景网格流光微透 -->
          <div class="tm-panel-glow"></div>

          <!-- 1. 顶端：科技感标题栏 -->
          <div class="tm-dials-head">
            <div class="tm-dials-title-group">
              <div class="tm-dials-title-row">
                <h3 class="tm-dials-title">标签覆盖分布 TOP 5</h3>
                <el-tooltip
                  content="按标签绑定用例的次数降序统计前 5 名标签的分布占比"
                  placement="top"
                  effect="dark"
                >
                  <span class="material-symbols-outlined tm-dials-info-icon">help</span>
                </el-tooltip>
              </div>
            </div>
          </div>

          <!-- 2. 中间：5 列对称排布的数码环形仪表盘 (5-Column Tactical Dials Grid) -->
          <div class="tm-dials-grid">
            <div
              v-for="(seg, idx) in top5Rings"
              :key="'dial-' + idx"
              class="tm-dial-item"
              :class="{ 'is-empty': seg.isEmpty }"
              :style="{
                '--accent': seg.color,
                '--accent-glow': seg.isEmpty ? 'rgba(99, 102, 241, 0.03)' : seg.color + '40',
              }"
              @click="seg.isEmpty ? openCreate() : null"
            >
              <!-- 环形 SVG 轨道区 (半径 56, 周长 351.85, 起点为顶部正上方旋转 -90deg) -->
              <el-tooltip
                :disabled="!seg.isEmpty"
                content="槽位空置，点击快速新建标签"
                placement="top"
                effect="dark"
              >
                <div class="tm-dial-circle-wrapper">
                  <!-- 3D 霓虹空气流光发光内胆 aura (Glassmorphism ambient halo) -->
                  <div v-if="!seg.isEmpty" class="tm-dial-bg-glow"></div>

                  <svg class="tm-dial-svg" viewBox="0 0 160 160">
                    <defs>
                      <!-- 动态霓虹模糊发光滤镜 -->
                      <filter :id="'glow-' + idx" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>

                      <!-- 动态高精密圆弧遮罩，用于平滑剪裁出比例部分的 Segment 齿轨 -->
                      <mask :id="'active-mask-' + idx">
                        <circle
                          cx="80"
                          cy="80"
                          r="56"
                          stroke="white"
                          stroke-width="12"
                          fill="none"
                          transform="rotate(-90 80 80)"
                          stroke-dasharray="351.85"
                          :stroke-dashoffset="351.85 * (1 - seg.pct / 100)"
                          stroke-linecap="butt"
                          style="transition: stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)"
                        />
                      </mask>
                    </defs>

                    <!-- A. 引导圆弧背景齿轮轨道 (Muted Dashed Gear Track, 空置时使用更精细的虚线点状) -->
                    <circle
                      cx="80"
                      cy="80"
                      r="56"
                      class="tm-dial-track"
                      :class="{ 'is-empty-track': seg.isEmpty }"
                      :stroke-width="seg.isEmpty ? 4 : 6.5"
                      fill="none"
                      :stroke-dasharray="seg.isEmpty ? '1.5 2.5' : '2.5 3.5'"
                    />

                    <!-- B. 活跃状态流光发光齿弧轨道 (Glowing Active Dash Gear Track) -->
                    <circle
                      v-if="!seg.isEmpty && seg.pct > 0"
                      cx="80"
                      cy="80"
                      r="56"
                      :stroke="seg.color"
                      stroke-width="7.5"
                      fill="none"
                      stroke-dasharray="2.5 3.5"
                      :mask="'url(#active-mask-' + idx + ')'"
                      :filter="'url(#glow-' + idx + ')'"
                    />
                  </svg>

                  <!-- C. 轨道正中心多维数据核心 (Core Panel) -->
                  <div class="tm-dial-core">
                    <!-- 图标舱 -->
                    <div class="tm-dial-icon-container">
                      <span class="material-symbols-outlined tm-dial-icon">{{ seg.icon }}</span>
                    </div>

                    <!-- 标签名 -->
                    <span class="tm-dial-name">{{ seg.name }}</span>

                    <!-- 使用次数 -->
                    <span class="tm-dial-count">{{ seg.isEmpty ? '0' : seg.count }}</span>
                  </div>
                </div>
              </el-tooltip>

              <!-- D. 轨道最下方百分比数值 (Colored Percentage Highlight) -->
              <div class="tm-dial-pct">
                {{ seg.isEmpty ? '0.0%' : seg.pct + '%' }}
              </div>
            </div>
          </div>

          <!-- 3. 底端：对称式仪表盘数据总览尾舱 -->
          <div class="tm-dials-footer">
            <span class="tm-footer-dot"></span>
            共 {{ tags.length }} 个标签，累计使用 {{ totalCases }} 次
          </div>
        </div>

        <!-- Right Column: Top 5 Heatmap Bar Chart (保留的核心热度统计图) -->
        <div class="tm-panel tm-panel--heat">
          <h3 class="tm-panel-title tm-heat-title">热度 Top 5</h3>
          <TagHeatGrid
            v-if="tags.length > 0"
            :top-tags="topTags"
            :max-case-count="maxCaseCount"
            :rank-bar-colors="rankBarColors"
          />
          <div v-else class="tm-panel-empty-state">
            <div class="tm-panel-empty-icon-wrap">
              <span class="material-symbols-outlined tm-panel-empty-icon">bar_chart</span>
            </div>
            <div class="tm-panel-empty-title">暂无数据</div>
            <div class="tm-panel-empty-desc">创建标签并关联测试用例，即可分析使用热度榜。</div>
          </div>
        </div>
      </section>

      <section class="tm-tag-workbench" aria-labelledby="tm-tag-workbench-title">
        <!-- ═══ 精致单行控制栏 ActionBar ═══ -->
        <div class="tm-tag-workbench-head-row">
          <!-- Left: Title, Stats Badge & Tabs -->
          <div class="tm-head-left">
            <h3 id="tm-tag-workbench-title" class="tm-tag-workbench-title">标签列表</h3>
            <span class="tm-tag-count-badge">{{ sortedTags.length }} / {{ total }}</span>
            <div class="tm-tabs">
              <button
                type="button"
                :class="['tm-tab', { active: activeTab === 'all' }]"
                @click="activeTab = 'all'"
              >
                所有
              </button>
              <button
                type="button"
                :class="['tm-tab', { active: activeTab === 'recent' }]"
                @click="switchToRecent"
              >
                最近更新
              </button>
            </div>
          </div>

          <!-- Right: Search Input, Sorting Select & Action Buttons -->
          <div class="tm-head-right">
            <!-- 搜索框 -->
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

            <!-- 排序 -->
            <div class="tm-sort">
              <span class="tm-sort-label">排序:</span>
              <select v-model="sortBy" class="tm-sort-select" aria-label="标签排序方式">
                <option value="case_count">用例数</option>
                <option value="name">名称</option>
                <option value="created_at">创建时间</option>
              </select>
            </div>

            <!-- 操作按钮组 -->
            <div class="tm-action-btns">
              <button type="button" class="tm-btn-filter" @click="openCreate">
                <span class="material-symbols-outlined">add</span>
                新建标签
              </button>
              <button type="button" class="tm-btn-wizard" @click="batchExpanded = !batchExpanded">
                <span class="material-symbols-outlined">auto_awesome</span>
                智能导入
              </button>
            </div>
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
        <div class="tm-card-grid" :class="{ 'is-loading': loading }">
          <div v-if="sortedTags.length === 0" class="tm-list-empty">
            <!-- 使用标签专用的 3D 空状态占位图 -->
            <EmptyState
              type="tag"
              description="暂无标签数据，请先创建首个标签"
              show-action
              action-text="新建标签"
              @action="openCreate"
            />
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
  justify-content: flex-end;
  align-items: center;
  padding: 0;
  background: transparent;
  position: sticky;
  top: 0;
  z-index: 10;
  margin-bottom: 8px;
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
   Quality Insights Dashboard (Concentric Dials TOP 5)
   ══════════════════════════════════════════ */
.tm-insights {
  display: grid !important; /* 恢复双栏排布 */
  grid-template-columns: 2.3fr 1fr !important; /* 增加左栏宽度，给 5 个大仪表盘创造宽裕的空间 */
  gap: 12px !important;
  padding: 0 !important; /* 彻底取消左右 Indent 边距，让卡片横向100%填满并与底部列表边缘完美对齐 */
  margin-bottom: 0 !important;
}

@media (max-width: 1200px) {
  .tm-insights {
    grid-template-columns: 1fr !important; /* 窄屏自动切换单列垂直堆叠 */
    gap: 16px !important;
  }
}

.tm-panel--dials-dashboard {
  background: var(--surface-container-low) !important;
  border-radius: 13px !important;
  border: 1px solid var(--tp-border-subtle) !important;
  padding: 8px 12px !important;
  position: relative !important;
  overflow: hidden !important;
  box-shadow: var(--tp-shadow-sm) !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: space-between !important;
}

.tm-panel--heat {
  background: var(--surface-container-low) !important;
  border-radius: 13px !important;
  border: 1px solid var(--tp-border-subtle) !important;
  padding: 8px 12px !important;
  position: relative !important;
  overflow: hidden !important;
  box-shadow: var(--tp-shadow-sm) !important;
  display: flex !important;
  flex-direction: column !important;
}

/* 标题区域 */
.tm-dials-head {
  display: flex !important;
  justify-content: space-between !important;
  align-items: flex-start !important;
  margin-bottom: 2px !important;
  position: relative !important;
  z-index: 2 !important;
}

.tm-dials-title-group {
  display: flex !important;
  flex-direction: column !important;
  gap: 3px !important;
}

.tm-dials-title-row {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
}

.tm-dials-title {
  font-size: 16px !important;
  font-weight: 700 !important;
  color: #ffffff !important;
  margin: 0 !important;
  letter-spacing: -0.01em !important;
}

.tm-dials-info-icon {
  font-size: 16px !important;
  color: var(--tp-text-muted) !important;
  cursor: help !important;
  transition: color 0.2s ease !important;
}

.tm-dials-info-icon:hover {
  color: #ffffff !important;
}

.tm-dials-desc {
  font-size: 11px !important;
  color: var(--tp-text-muted) !important;
  margin: 0 !important;
  font-weight: 400 !important;
}

/* 5 列对称圆轨仪网格 (拓宽 gap，让大圆盘舒展排列) */
.tm-dials-grid {
  display: grid !important;
  grid-template-columns: repeat(5, 1fr) !important;
  gap: 16px !important;
  width: 100% !important;
  position: relative !important;
  z-index: 2 !important;
  margin: 12px 0 !important;
}

/* 单个环形仪主体舱 */
.tm-dial-item {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
  cursor: pointer !important;
}

.tm-dial-item:hover {
  transform: translateY(-4px) !important;
}

.tm-dial-item.is-empty {
  opacity: 0.55 !important;
}

.tm-dial-item.is-empty:hover {
  opacity: 0.85 !important;
}

/* 环形包装器 (微调至 128px，大幅增强布局的紧凑度与精致度) */
.tm-dial-circle-wrapper {
  position: relative !important;
  width: 128px !important;
  height: 128px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.tm-dial-svg {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  overflow: visible !important;
  transform: rotate(0deg) !important;
}

/* 中轴对称数据核心层 */
.tm-dial-core {
  position: absolute !important;
  inset: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  pointer-events: none !important;
}

/* 3D 霓虹空气发光内胆 (仅在深色模式显示，浅色隐藏) */
.tm-dial-bg-glow {
  position: absolute !important;
  inset: -12px !important;
  background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%) !important;
  opacity: 0 !important; /* 浅色模式下完全隐藏发光背景 */
  pointer-events: none !important;
  z-index: 0 !important;
  transition: opacity 0.3s ease !important;
}

/* 引导圆弧背景轨道颜色 */
.tm-dial-track {
  stroke: rgba(0, 0, 0, 0.05) !important; /* 浅色模式采用精细冷灰轨道 */
}

/* 核心图标舱 */
.tm-dial-icon-container {
  width: 36px !important;
  height: 36px !important;
  border-radius: 50% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: rgba(0, 0, 0, 0.02) !important;
  border: 1px solid rgba(0, 0, 0, 0.04) !important;
  margin-top: 8px !important;
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
}

.tm-dial-item:not(.is-empty) .tm-dial-icon-container {
  background: rgba(0, 0, 0, 0.03) !important;
  border-color: rgba(0, 0, 0, 0.05) !important;
}

.tm-dial-item:not(.is-empty):hover .tm-dial-icon-container {
  background: var(--accent) !important;
  border-color: var(--accent) !important;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 25%, transparent) !important;
}

.tm-dial-icon {
  font-size: 17px !important;
  color: var(--tp-text-disabled, #94a3b8) !important;
  transition: all 0.3s ease !important;
}

.tm-dial-item:not(.is-empty) .tm-dial-icon {
  color: var(--accent) !important;
}

.tm-dial-item:not(.is-empty):hover .tm-dial-icon {
  color: #ffffff !important; /* hover 时变为白图标 */
  transform: scale(1.1) !important;
}

/* 标签名 (浅色高对比度，超强阅读) */
.tm-dial-name {
  font-size: 12px !important;
  font-weight: 600 !important;
  color: var(--tp-text-disabled, #94a3b8) !important;
  margin-top: 4px !important;
  max-width: 100px !important;
  text-align: center !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  transition: color 0.25s ease !important;
}

.tm-dial-item:not(.is-empty) .tm-dial-name {
  color: var(--tp-text-primary, #1e293b) !important;
}

.tm-dial-item:not(.is-empty):hover .tm-dial-name {
  color: var(--accent) !important;
}

/* 用例数量 (浅色黑底色，去阴影保证清晰度) */
.tm-dial-count {
  font-size: 27px !important;
  font-weight: 800 !important;
  color: var(--tp-text-disabled, #94a3b8) !important;
  font-family: var(--tp-font-mono, monospace) !important;
  line-height: 1.1 !important;
  margin-top: 1px !important;
  transition: all 0.3s ease !important;
}

.tm-dial-item:not(.is-empty) .tm-dial-count {
  color: var(--tp-text-primary, #0f172a) !important;
  text-shadow: none !important;
}

.tm-dial-item:not(.is-empty):hover .tm-dial-count {
  color: var(--accent) !important;
  text-shadow: none !important;
}

/* 最下方百分比 */
.tm-dial-pct {
  font-size: 12.5px !important;
  font-weight: 700 !important;
  color: var(--tp-text-disabled, #94a3b8) !important;
  margin-top: 10px !important;
  font-family: var(--tp-font-mono, monospace) !important;
  transition: all 0.3s ease !important;
}

.tm-dial-item:not(.is-empty) .tm-dial-pct {
  color: var(--accent) !important;
  text-shadow: none !important;
}

.tm-dial-item:not(.is-empty):hover .tm-dial-pct {
  text-shadow: none !important;
  transform: scale(1.05) !important;
}

/* ══════════════════════════════════════════
   黑曜深色模式专属重置 overrides (html[data-theme='genart'])
   ══════════════════════════════════════════ */

html[data-theme='genart'] .tm-dial-bg-glow {
  opacity: 0.05 !important;
}

html[data-theme='genart'] .tm-dial-item:not(.is-empty):hover .tm-dial-bg-glow {
  opacity: 0.2 !important;
}

html[data-theme='genart'] .tm-dial-track {
  stroke: rgba(255, 255, 255, 0.03) !important;
}

html[data-theme='genart'] .tm-dial-icon-container {
  background: rgba(255, 255, 255, 0.01) !important;
  border: 1px solid rgba(255, 255, 255, 0.03) !important;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3) !important;
}

html[data-theme='genart'] .tm-dial-item:not(.is-empty) .tm-dial-icon-container {
  background: rgba(255, 255, 255, 0.015) !important;
  border-color: rgba(255, 255, 255, 0.04) !important;
}

html[data-theme='genart'] .tm-dial-item:not(.is-empty):hover .tm-dial-icon-container {
  background: var(--accent-glow) !important;
  border-color: color-mix(in oklch, var(--accent) 30%, transparent) !important;
  box-shadow:
    0 0 14px var(--accent-glow),
    0 4px 10px rgba(0, 0, 0, 0.4) !important;
}

html[data-theme='genart'] .tm-dial-icon {
  color: rgba(255, 255, 255, 0.12) !important;
}

html[data-theme='genart'] .tm-dial-item:not(.is-empty) .tm-dial-icon {
  color: var(--accent) !important;
}

html[data-theme='genart'] .tm-dial-item:not(.is-empty):hover .tm-dial-icon {
  color: var(--accent) !important;
}

html[data-theme='genart'] .tm-dial-name {
  color: rgba(255, 255, 255, 0.28) !important;
}

html[data-theme='genart'] .tm-dial-item:not(.is-empty) .tm-dial-name {
  color: rgba(255, 255, 255, 0.72) !important;
}

html[data-theme='genart'] .tm-dial-item:not(.is-empty):hover .tm-dial-name {
  color: #ffffff !important;
}

html[data-theme='genart'] .tm-dial-count {
  color: rgba(255, 255, 255, 0.18) !important;
}

html[data-theme='genart'] .tm-dial-item:not(.is-empty) .tm-dial-count {
  color: #ffffff !important;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5) !important;
}

html[data-theme='genart'] .tm-dial-item:not(.is-empty):hover .tm-dial-count {
  color: #ffffff !important;
  text-shadow: 0 0 12px var(--accent-glow) !important;
}

html[data-theme='genart'] .tm-dial-pct {
  color: rgba(255, 255, 255, 0.14) !important;
}

html[data-theme='genart'] .tm-dial-item:not(.is-empty) .tm-dial-pct {
  color: var(--accent) !important;
  text-shadow: 0 0 6px var(--accent-glow) !important;
}

html[data-theme='genart'] .tm-dial-item:not(.is-empty):hover .tm-dial-pct {
  text-shadow:
    0 0 10px var(--accent),
    0 2px 4px rgba(0, 0, 0, 0.5) !important;
}

/* 对称底座尾舱 */
.tm-dials-footer {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
  font-size: 11px !important;
  color: var(--tp-text-muted) !important;
  margin-top: 18px !important;
  font-weight: 400;
}

.tm-footer-dot {
  width: 4px !important;
  height: 4px !important;
  border-radius: 50% !important;
  background: var(--tp-primary, #3b82f6) !important;
  box-shadow: 0 0 8px var(--tp-primary, #3b82f6) !important;
  display: inline-block !important;
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
.tm-btn-filter:hover {
  background: var(--tp-btn-bg-hover);
  box-shadow: var(--tp-btn-shadow-hover);
}
.tm-btn-wizard {
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
.tm-btn-wizard:hover {
  background: var(--surface-bright);
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
  padding: 16px 0 !important;
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

.tm-root .tm-topnav {
  margin: 24px 32px 12px !important;
  padding: 0 !important;
  border: none !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  justify-content: center !important;
  min-height: 0 !important;
}

.tm-root .tm-topnav .tm-topnav-right {
  display: flex !important;
  flex: 1 1 auto !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: center !important;
  margin: 0 auto !important;
  gap: 24px !important;
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
  width: min(320px, 30vw) !important;
  min-height: 38px;
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 252, 0.82)),
    var(--tp-surface-input);
  border-color: rgba(99, 102, 241, 0.18);
  box-shadow:
    0 8px 30px rgba(99, 102, 241, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.8) !important;
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
  background:
    radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.42), transparent 32%), var(--tp-btn-bg) !important;
  box-shadow:
    0 16px 30px rgba(99, 102, 241, 0.24),
    0 8px 18px rgba(236, 72, 153, 0.16) !important;
  color: var(--tp-btn-text) !important;
  border: none !important;
}

.tm-btn-filter:hover {
  background: var(--tp-btn-bg-hover) !important;
  box-shadow: var(--tp-btn-shadow-hover) !important;
}

.tm-btn-wizard {
  border: 1px solid var(--tp-border-subtle) !important;
  background: var(--tp-surface-card) !important;
  color: var(--tp-text-secondary) !important;
  box-shadow: var(--tp-shadow-sm) !important;
}

.tm-btn-wizard:hover {
  background: var(--tp-surface-hover) !important;
  border-color: var(--tp-border-strong) !important;
  color: var(--tp-text-primary) !important;
}

.tm-card-grid {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
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
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
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
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
  border-radius: 16px !important;
  background: transparent !important;
  box-shadow: none !important;
}

.tm-tag-workbench-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 0 !important;
}

.tm-tag-workbench-title {
  margin: 0;
  color: var(--tp-gray-900);
  font-size: var(--tp-text-lg) !important;
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-tight);
}

.tm-tag-workbench-desc {
  margin: 4px 0 0;
  color: var(--tp-text-muted);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-medium);
  line-height: var(--tp-line-ui);
}

.tm-tag-workbench .tm-actionbar {
  margin: 0 !important;
  padding: 6px 0 10px !important;
  border: none !important;
  border-bottom: 1px solid var(--tp-border-subtle) !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
.tm-tag-workbench .tm-card-grid {
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)) !important;
  align-content: start !important;
  gap: 10px !important;
  padding: 4px 2px !important;
  margin-top: 0 !important;
  flex: 1 !important;
  display: grid !important;
  min-height: 0 !important;
  overflow-y: auto !important;
}

.tm-tag-workbench .tm-list-empty {
  grid-column: 1 / -1 !important;
  padding: 0 !important;
  flex: 1 !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  align-items: center !important;
}

/* 深度重写 el-empty 和 empty-state-wrap 内部的大 padding，消除多层累加空白 */
.tm-tag-workbench .tm-list-empty :deep(.empty-state-wrap) {
  padding: 16px 0 !important;
}

.tm-tag-workbench .tm-list-empty :deep(.el-empty) {
  padding: 0 !important;
}

.tm-tag-workbench .tm-list-empty :deep(.el-empty__image) {
  width: 180px !important;
  height: auto !important;
}

.tm-tag-workbench .tm-list-empty :deep(.el-empty__description) {
  margin-top: 8px !important;
}

.tm-tag-workbench .tm-list-empty :deep(.el-empty__bottom) {
  margin-top: 12px !important;
}

.tm-tag-workbench .tm-pager {
  margin: 24px 0 0 !important;
  padding: 16px 0 0 !important;
  border-top: 1px solid var(--tp-border-subtle) !important;
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
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)) !important;
  }
}

@media (max-width: 900px) {
  .tm-tag-workbench .tm-card-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)) !important;
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

.tm-root {
  --tech-panel: var(--tp-surface-card);
  --tech-border: var(--tp-border-subtle);
  --tech-line: var(--tp-border-subtle);
  gap: 8px;
  padding: 8px 12px 16px;
  background: var(--tp-surface-base);
}

.tm-root::before,
.tm-panel::before,
.tm-panel-glow {
  display: none;
}

.tm-topnav,
.tm-panel,
.tm-panel--pulse,
.tm-panel--heat,
.tm-actionbar,
.tm-tag-workbench {
  background: var(--tp-surface-card);
  border-color: var(--tp-border-subtle);
  box-shadow: var(--tp-shadow-sm);
}

.tm-title::before {
  display: none !important;
  content: none !important;
}

.tm-topnav .tm-title {
  display: block !important;
  margin: 0 0 2px !important;
  color: var(--tp-text-primary) !important;
  font-family: var(--tp-font-family-sans) !important;
  font-size: 18px !important;
  font-weight: var(--tp-font-bold) !important;
  line-height: var(--tp-line-tight) !important;
  letter-spacing: -0.01em !important;
}

.tm-search-box,
.tm-tabs,
.tm-sort {
  background: var(--tp-surface-input);
  border-color: var(--tp-border-subtle);
  box-shadow: none;
}

.tm-search-box:focus-within {
  box-shadow: 0 0 0 3px var(--tp-accent-primary-soft);
}

.tm-panel-icon-right {
  background: var(--tp-accent-primary-soft);
  border: 1px solid var(--tp-accent-primary-border);
  box-shadow: none;
}

.tm-pulse-bar,
.tm-pulse-bar--top {
  box-shadow: none;
}

.tm-tag-workbench .tm-btn-filter {
  background: var(--tp-btn-bg) !important;
  box-shadow: var(--tp-btn-shadow);
}

.tm-tag-workbench .tm-btn-filter:hover {
  background: var(--tp-btn-bg-hover) !important;
  box-shadow: var(--tp-btn-shadow-hover);
}

.tm-tag-workbench .tm-btn-wizard {
  background: var(--tp-surface-input) !important;
  border-color: var(--tp-border-subtle);
  box-shadow: none;
}

.tm-tag-workbench .tm-btn-wizard:hover {
  background: var(--tp-surface-hover) !important;
  box-shadow: none;
}

.tm-root {
  gap: 4px !important;
  padding: 8px 12px 16px !important;
  height: 100% !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  background:
    linear-gradient(
      180deg,
      color-mix(in oklch, var(--tp-surface-card) 34%, var(--tp-surface-base)),
      var(--tp-surface-base) 42%
    ),
    var(--tp-surface-base);
}

.tm-root::before,
.tm-panel::before,
.tm-panel-glow {
  display: none !important;
}

.tm-topnav,
.tm-panel,
.tm-panel--pulse,
.tm-panel--heat,
.tm-tag-workbench {
  border: 1px solid var(--tp-border-subtle) !important;
  border-radius: 13px;
  background: var(--tp-surface-card);
  box-shadow: var(--tp-shadow-sm);
}

.tm-topnav {
  align-items: center;
  min-height: 32px;
  padding: 4px 12px !important;
}

.tm-topnav-right {
  gap: 10px;
}

.tm-search-box {
  width: min(320px, 32vw);
  min-height: 32px;
  padding: 5px 10px;
  border-radius: 10px;
  background: var(--tp-surface-input);
  border-color: var(--tp-border-subtle);
  box-shadow: none;
}

.tm-search-box:focus-within {
  background: var(--tp-surface-card);
  border-color: var(--tp-accent-primary-border);
  box-shadow: 0 0 0 3px var(--tp-accent-primary-soft);
}

.tm-search-icon {
  color: var(--tp-text-subtle);
}

.tm-search-box:focus-within .tm-search-icon {
  color: var(--tp-primary);
}

.tm-search-input {
  color: var(--tp-text-primary);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-medium);
}

.tm-search-input::placeholder {
  color: var(--tp-text-subtle);
}

.tm-insights {
  gap: 8px !important;
}

.tm-panel {
  padding: 8px 12px !important;
}

.tm-tag-workbench {
  padding: 8px 12px !important;
  flex: 1 !important;
  display: flex !important;
  flex-direction: column !important;
  min-height: 0 !important;
  overflow: hidden !important;
}

.tm-tag-workbench-head {
  align-items: flex-start;
  padding: 0 2px 2px;
}

.tm-tag-workbench-title {
  color: var(--tp-text-primary);
  font-size: var(--tp-text-sm);
  font-weight: var(--tp-font-semibold);
  letter-spacing: 0;
}

.tm-tag-workbench-desc {
  margin-top: 2px;
  color: var(--tp-text-muted);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-medium);
}

.tm-tag-workbench .tm-actionbar {
  align-items: center;
  gap: 8px;
  padding: 6px 0 9px;
}

.tm-tabs {
  gap: 2px;
  padding: 2px;
  border-radius: 10px;
  background: var(--tp-surface-input);
  border-color: var(--tp-border-subtle);
}

.tm-tab {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--tp-text-muted);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-medium);
}

.tm-tab.active {
  background: var(--tp-surface-card);
  color: var(--tp-text-primary);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--tp-text-primary) 5%, transparent);
}

.tm-actionbar-right {
  gap: 8px;
}

.tm-sort {
  min-height: 30px;
  padding: 0 9px;
  border-radius: 10px;
  background: var(--tp-surface-input);
  border-color: var(--tp-border-subtle);
}

.tm-sort-select {
  color: var(--tp-text-primary);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-semibold);
}

.tm-tag-workbench .tm-btn-filter,
.tm-tag-workbench .tm-btn-wizard {
  min-height: 30px;
  padding: 0 11px;
  border-radius: 10px;
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-semibold);
}

.tm-tag-workbench .tm-btn-filter {
  /* 使用全站统一的渐变色按钮背景、文字颜色和阴影 */
  background: var(--tp-btn-bg) !important;
  color: var(--tp-btn-text) !important;
  border: 1px solid transparent !important;
  box-shadow: var(--tp-btn-shadow) !important;
}

.tm-tag-workbench .tm-btn-filter:hover {
  background: var(--tp-btn-bg-hover) !important;
  box-shadow: var(--tp-btn-shadow-hover) !important;
  transform: translateY(-0.5px) !important;
}

.tm-tag-workbench .tm-btn-filter:focus,
.tm-tag-workbench .tm-btn-filter:active,
.tm-tag-workbench .tm-btn-filter:focus-visible {
  background: var(--tp-btn-bg-hover) !important;
  box-shadow:
    0 0 0 3px var(--tp-accent-primary-soft),
    var(--tp-btn-shadow-hover) !important;
}

.tm-tag-workbench .tm-btn-filter:active {
  transform: scale(0.98) !important;
}

.tm-tag-workbench .tm-actionbar-right .tm-btn-filter,
.tm-tag-workbench .tm-actionbar-right .tm-btn-filter:hover,
.tm-tag-workbench .tm-actionbar-right .tm-btn-filter:focus,
.tm-tag-workbench .tm-actionbar-right .tm-btn-filter:active,
.tm-tag-workbench .tm-actionbar-right .tm-btn-filter:focus-visible {
  color: var(--tm-primary-button-text) !important;
}

.tm-tag-workbench .tm-btn-wizard {
  border-color: var(--tp-border-subtle);
  background: var(--tp-surface-input) !important;
  color: var(--tp-text-secondary);
}

.tm-tag-workbench .tm-btn-wizard:hover {
  background: var(--tp-surface-hover) !important;
  color: var(--tp-text-primary);
}
</style>

<style>
/* 针对包裹 tm-root 的父级容器，强制去除 padding 彻底抹平灰边 */
.workbench-container:has(.tm-root) {
  padding: 0 !important;
}

/* 修复仪表盘标题在默认亮色模式下隐形的问题，并让其与右侧标题样式对齐 */
html body .tm-root .tm-dials-title {
  color: var(--tp-text-primary) !important;
}
html[data-theme='genart'] body .tm-root .tm-dials-title {
  color: #ffffff !important;
}

/* 强制全局重置，使标签管理页面能够垂直填满可用空间并实现内部列表滚动 */
html body .tm-root {
  height: 100% !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  padding: 4px !important; /* 对齐角色管理页面的外边距 (layout-enhance 全局 4px 规范) */
  gap: 4px !important; /* 垂直间距调整为 4px */
}

/* 仪表盘大容器 */
html body .tm-root .tm-insights {
  margin: 0 !important;
  padding: 0 !important;
  gap: 4px !important; /* 左右卡片的横向间隙与角色页面对齐，统一为 4px */
}

/* 仪表盘子面板 */
html body .tm-root .tm-panel {
  border-radius: 12px !important;
  padding: 10px !important; /* 卡片内边距调整为 10px */
}

/* 强制下部列表卡片容器透明无边框，使标签卡片直接漂浮于页面背景上，彻底抹平双重框视觉 Bug */
html body .tm-root .tm-tag-workbench {
  flex: 1 !important;
  display: flex !important;
  flex-direction: column !important;
  min-height: 0 !important;
  overflow: hidden !important;
  margin: 0 !important;
  padding: 0 !important;
  border-radius: 0 !important;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
}

/* 整合后的单行 ActionBar 工具条，改用透明底以与整体背景融为一体 */
html body .tm-root .tm-tag-workbench-head-row {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 0 0 4px 0 !important; /* 去除左右侧多余缩进，仅保留 4px 底部边距 */
  border-bottom: 1px solid var(--tp-border-subtle) !important;
  gap: 8px !important; /* 操作按钮与搜索框间隙调整为较为舒适的 8px */
  flex-wrap: wrap !important;
  background: transparent !important;
  margin-bottom: 4px !important;
}

/* 左侧标题、计数与 Tab 聚合 */
html body .tm-root .tm-head-left {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
}

/* 标签列表标题 */
html body .tm-root .tm-tag-workbench-title {
  font-size: 13.5px !important;
  font-weight: var(--tp-font-semibold, 600) !important;
  color: var(--tp-text-primary) !important;
  margin: 0 !important;
  letter-spacing: -0.01em;
}

/* 计数小胶囊徽章 */
html body .tm-root .tm-tag-count-badge {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 1.5px 6px !important;
  border-radius: 999px !important;
  font-family: var(--tp-font-mono, monospace) !important;
  font-size: 10.5px !important;
  font-weight: 600 !important;
  background: var(--tp-surface-input) !important;
  color: var(--tp-text-secondary) !important;
  border: 1px solid var(--tp-border-subtle) !important;
}

/* Tabs 胶囊外壳 */
html body .tm-root .tm-tabs {
  display: inline-flex !important;
  align-items: center !important;
  gap: 2px !important;
  padding: 2px !important;
  height: 32px !important;
  box-sizing: border-box !important;
  border-radius: 999px !important;
  background: var(--tp-surface-input) !important;
  border: 1px solid var(--tp-border-subtle) !important;
}

/* Tab 按钮 */
html body .tm-root .tm-tab {
  min-height: 26px !important;
  height: 26px !important;
  padding: 0 12px !important;
  border-radius: 999px !important;
  color: var(--tp-text-muted) !important;
  font-size: 12px !important;
  font-weight: var(--tp-font-medium, 500) !important;
  background: transparent !important;
  border: none !important;
  cursor: pointer !important;
  transition: all var(--tp-transition) !important;
  line-height: 26px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}

html body .tm-root .tm-tab.active {
  background: var(--tp-surface-card) !important;
  color: var(--tp-text-primary) !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08) !important;
  font-weight: 600 !important;
}

/* 右侧搜索、排序与操作按钮聚合 */
html body .tm-root .tm-head-right {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  flex-wrap: wrap !important;
}

/* 搜索框：支持聚焦时自然过渡变宽的物理呼吸动效 */
html body .tm-root .tm-search-box {
  width: 180px !important;
  min-height: 32px !important;
  height: 32px !important;
  padding: 0 10px !important;
  border-radius: 8px !important;
  background: var(--tp-surface-input) !important;
  border: 1px solid var(--tp-border-subtle) !important;
  box-shadow: none !important;
  transition:
    width 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.2s,
    box-shadow 0.2s,
    background 0.2s !important;
}

html body .tm-root .tm-search-box:focus-within {
  width: 240px !important;
  border-color: var(--tp-accent-primary-border) !important;
  background: var(--tp-surface-card) !important;
  box-shadow: 0 0 0 3px var(--tp-accent-primary-soft) !important;
}

html body .tm-root .tm-search-icon {
  font-size: 16px !important;
  color: var(--tp-text-subtle) !important;
}

html body .tm-root .tm-search-input {
  font-size: 12px !important;
  color: var(--tp-text-primary) !important;
}

/* 排序下拉容器 */
html body .tm-root .tm-sort {
  display: flex !important;
  align-items: center !important;
  height: 32px !important;
  padding: 0 8px !important;
  border-radius: 8px !important;
  background: var(--tp-surface-input) !important;
  border: 1px solid var(--tp-border-subtle) !important;
  gap: 6px !important;
  transition:
    border-color 0.2s,
    box-shadow 0.2s !important; /* 平滑过渡焦点状态，提升可交互质感 */
}

/* 内部 select 元素聚焦时，将外框的高亮效果应用到父级容器，避免产生双重内框 */
html body .tm-root .tm-sort:focus-within {
  border-color: var(--tp-accent-primary-border) !important;
  box-shadow: 0 0 0 3px var(--tp-accent-primary-soft) !important;
}

html body .tm-root .tm-sort-label {
  font-size: 12px !important;
  color: var(--tp-text-subtle) !important;
}

html body .tm-root .tm-sort-select {
  font-size: 12px !important;
  color: var(--tp-text-primary) !important;
  font-weight: 600 !important;
  border: none !important;
  outline: none !important;
  cursor: pointer !important;
  /* 强制清除所有浏览器的原生默认下拉框外观样式与边框/阴影，消除双框 bug */
  -webkit-appearance: none !important;
  -moz-appearance: none !important;
  appearance: none !important;
  background-color: transparent !important;
  /* 引入自定义内联 SVG 箭头，在抹除原生外观后保证下拉方向指示的可见性与美观度 */
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>") !important;
  background-repeat: no-repeat !important;
  background-position: right 4px center !important;
  background-size: 10px 10px !important;
  padding: 0 16px 0 2px !important; /* 给自定义的下拉小箭头留出合理的右侧内边距空间，防止文字重叠 */
}

/* 彻底禁绝 select 元素自身的聚焦虚线框和阴影，避免在不同浏览器上产生杂余内框 */
html body .tm-root .tm-sort-select:focus,
html body .tm-root .tm-sort-select:active,
html body .tm-root .tm-sort-select:focus-visible {
  outline: none !important;
  box-shadow: none !important;
}

/* 操作按钮组 */
html body .tm-root .tm-action-btns {
  display: flex !important;
  gap: 6px !important;
}

html body .tm-root .tm-btn-filter,
html body .tm-root .tm-btn-wizard {
  min-height: 32px !important;
  height: 32px !important;
  padding: 0 14px !important;
  border-radius: 8px !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  white-space: nowrap !important;
  cursor: pointer !important;
  border: 1px solid transparent !important;
  transition: all var(--tp-transition) !important;
}

html body .tm-root .tm-btn-filter .material-symbols-outlined,
html body .tm-root .tm-btn-wizard .material-symbols-outlined {
  font-size: 16px !important;
}

/* 新建标签按钮：对齐全站统一的渐变高保真按钮样式 */
html body .tm-root .tm-btn-filter {
  background: var(--tp-btn-bg) !important;
  color: var(--tp-btn-text) !important;
  box-shadow: var(--tp-btn-shadow) !important;
}

html body .tm-root .tm-btn-filter:hover {
  background: var(--tp-btn-bg-hover) !important;
  box-shadow: var(--tp-btn-shadow-hover) !important;
  transform: translateY(-0.5px) !important;
}

html body .tm-root .tm-btn-filter:active {
  transform: scale(0.98) !important;
}

/* 智能导入按钮 */
html body .tm-root .tm-btn-wizard {
  background: var(--tp-surface-input) !important;
  border: 1px solid var(--tp-border-subtle) !important;
  color: var(--tp-text-secondary) !important;
  box-shadow: none !important;
}

html body .tm-root .tm-btn-wizard:hover {
  background: var(--tp-surface-hover) !important;
  color: var(--tp-text-primary) !important;
}
html body .tm-root .tm-tag-workbench .tm-card-grid {
  flex: 1 !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  padding: 0 !important; /* 卡片网格彻底贴边无缩进，完全由页面外边距统一对齐 */
  gap: 12px !important; /* 调整网格卡片间隙为 12px，提供更舒适的呼吸感与边界感 */
  transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

html body .tm-root .tm-tag-workbench .tm-card-grid.is-loading {
  opacity: 0.62 !important;
  pointer-events: none !important; /* 防止网络延迟时用户重复触发操作 */
}
html body .tm-root .tm-tag-workbench .tm-pager {
  margin: 4px 0 0 !important;
  padding: 4px 0 0 0 !important; /* 分页条贴边无缩进，间隙为 4px */
  border-top: 1px solid var(--tp-border-subtle) !important;
  background: transparent !important;
}

/* 右侧热度榜暂无数据美化 */
html body .tm-root .tm-panel-empty-state {
  flex: 1 !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 24px 8px !important;
  text-align: center !important;
  gap: 8px !important;
  opacity: 0.85 !important;
}

html body .tm-root .tm-panel-empty-icon-wrap {
  width: 48px !important;
  height: 48px !important;
  border-radius: 50% !important;
  background: var(--tp-surface-input) !important;
  border: 1px solid var(--tp-border-subtle) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex-shrink: 0 !important;
  margin-bottom: 4px !important;
  box-shadow: var(--tp-shadow-sm) !important;
  transition: all var(--tp-transition) !important;
}

html body .tm-root .tm-panel-empty-state:hover .tm-panel-empty-icon-wrap {
  transform: scale(1.06) !important;
  border-color: var(--tp-accent-primary-border) !important;
  background: var(--tp-accent-primary-soft) !important;
  box-shadow: 0 0 16px var(--tp-accent-primary-soft) !important;
}

html body .tm-root .tm-panel-empty-icon {
  font-size: 24px !important;
  color: var(--tp-text-subtle) !important;
  line-height: 1 !important;
  transition: all var(--tp-transition) !important;
}

html body .tm-root .tm-panel-empty-state:hover .tm-panel-empty-icon {
  color: var(--tp-primary) !important;
}

html body .tm-root .tm-panel-empty-title {
  font-size: 13px !important;
  font-weight: var(--tp-font-semibold, 600) !important;
  color: var(--tp-text-secondary) !important;
}

html body .tm-root .tm-panel-empty-desc {
  font-size: 11px !important;
  color: var(--tp-text-muted) !important;
  max-width: 200px !important;
  line-height: 1.5 !important;
}

/* 左侧仪表盘暂无数据美化 */
html body .tm-root .tm-dials-empty-state {
  flex: 1 !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 32px 16px !important;
  text-align: center !important;
  gap: 8px !important;
  opacity: 0.85 !important;
  margin: 12px 0 !important;
}

html body .tm-root .tm-dials-empty-icon-wrap {
  width: 52px !important;
  height: 52px !important;
  border-radius: 50% !important;
  background: var(--tp-surface-input) !important;
  border: 1px solid var(--tp-border-subtle) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex-shrink: 0 !important;
  margin-bottom: 4px !important;
  box-shadow: var(--tp-shadow-sm) !important;
  transition: all var(--tp-transition) !important;
}

html body .tm-root .tm-dials-empty-state:hover .tm-dials-empty-icon-wrap {
  transform: scale(1.06) !important;
  border-color: var(--tp-accent-primary-border) !important;
  background: var(--tp-accent-primary-soft) !important;
  box-shadow: 0 0 16px var(--tp-accent-primary-soft) !important;
}

html body .tm-root .tm-dials-empty-icon {
  font-size: 26px !important;
  color: var(--tp-text-subtle) !important;
  line-height: 1 !important;
  transition: all var(--tp-transition) !important;
}

html body .tm-root .tm-dials-empty-state:hover .tm-dials-empty-icon {
  color: var(--tp-primary) !important;
}

html body .tm-root .tm-dials-empty-title {
  font-size: 13px !important;
  font-weight: var(--tp-font-semibold, 600) !important;
  color: var(--tp-text-secondary) !important;
}

html body .tm-root .tm-dials-empty-desc {
  font-size: 11px !important;
  color: var(--tp-text-muted) !important;
  max-width: 280px !important;
  line-height: 1.5 !important;
}

/* ══════════════════════════════════════════
   未分配空槽位 (is-empty) 的极客精致感样式与交互
   ══════════════════════════════════════════ */
/* 去除默认粗暴的 0.55 opacity 滤镜，采用精心调配的非激活对比度 */
html body .tm-root .tm-dial-item.is-empty {
  opacity: 1 !important;
}

/* 细虚线空置轨道 */
html body .tm-root .tm-dial-item.is-empty .is-empty-track {
  stroke: rgba(99, 102, 241, 0.08) !important;
  transition: stroke 0.3s ease !important;
}

html[data-theme='genart'] body .tm-root .tm-dial-item.is-empty .is-empty-track {
  stroke: rgba(255, 255, 255, 0.03) !important;
}

/* 空置图标舱：虚线圆圈 */
html body .tm-root .tm-dial-item.is-empty .tm-dial-icon-container {
  background: transparent !important;
  border: 1px dashed rgba(99, 102, 241, 0.22) !important;
  box-shadow: none !important;
}

/* 空置加号图标 */
html body .tm-root .tm-dial-item.is-empty .tm-dial-icon {
  font-size: 14px !important;
  color: var(--tp-text-placeholder, rgba(99, 102, 241, 0.45)) !important;
  font-weight: bold !important;
}

/* 空置槽位名称：极客 monospace 风格 */
html body .tm-root .tm-dial-item.is-empty .tm-dial-name {
  font-family: var(--tp-font-mono, monospace) !important;
  font-size: 10.5px !important;
  font-weight: 500 !important;
  color: var(--tp-text-placeholder, rgba(99, 102, 241, 0.38)) !important;
  letter-spacing: 0.05em;
}

/* 空置用例数字：微暗的 0 */
html body .tm-root .tm-dial-item.is-empty .tm-dial-count {
  font-size: 24px !important;
  font-weight: 700 !important;
  color: var(--tp-text-placeholder, rgba(0, 0, 0, 0.16)) !important;
  text-shadow: none !important;
}

html[data-theme='genart'] body .tm-root .tm-dial-item.is-empty .tm-dial-count {
  color: rgba(255, 255, 255, 0.08) !important;
  text-shadow: none !important;
}

/* 空置百分比数值 */
html body .tm-root .tm-dial-item.is-empty .tm-dial-pct {
  font-size: 11.5px !important;
  color: var(--tp-text-placeholder, rgba(0, 0, 0, 0.18)) !important;
}

html[data-theme='genart'] body .tm-root .tm-dial-item.is-empty .tm-dial-pct {
  color: rgba(255, 255, 255, 0.1) !important;
}

/* ── 空槽位 Hover 点击状态反馈 ── */
html body .tm-root .tm-dial-item.is-empty:hover {
  transform: translateY(-3px) !important;
}

html body .tm-root .tm-dial-item.is-empty:hover .tm-dial-icon-container {
  border-style: solid !important;
  border-color: var(--tp-primary) !important;
  background: rgba(99, 102, 241, 0.08) !important;
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.18) !important;
}

html body .tm-root .tm-dial-item.is-empty:hover .tm-dial-icon {
  color: var(--tp-primary) !important;
  transform: scale(1.15) !important;
}

html body .tm-root .tm-dial-item.is-empty:hover .tm-dial-name {
  color: var(--tp-primary) !important;
}

html body .tm-root .tm-dial-item.is-empty:hover .tm-dial-count {
  color: var(--tp-primary-light, rgba(99, 102, 241, 0.6)) !important;
}

html body .tm-root .tm-dial-item.is-empty:hover .is-empty-track {
  stroke: rgba(99, 102, 241, 0.3) !important;
}

/* 解决空状态大垂直空隙问题 — 全局穿透覆盖，去除 :deep */
html body .tm-root .tm-tag-workbench .tm-list-empty {
  grid-column: 1 / -1 !important;
  padding: 0 !important;
  flex: 1 !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  align-items: center !important;
}
html body .tm-root .tm-tag-workbench .tm-list-empty .empty-state-wrap {
  padding: 12px 0 !important;
}
html body .tm-root .tm-tag-workbench .tm-list-empty .el-empty {
  padding: 0 !important;
}
html body .tm-root .tm-tag-workbench .tm-list-empty .el-empty__image {
  width: 150px !important;
  height: auto !important;
}
html body .tm-root .tm-tag-workbench .tm-list-empty .el-empty__description {
  margin-top: 6px !important;
}
html body .tm-root .tm-tag-workbench .tm-list-empty .el-empty__bottom {
  margin-top: 10px !important;
}

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
/* 隐藏模态框内子组件的冗余头部标题，避免双重标题冲突 */
.tm-modal-body .tm-panel-header {
  display: none !important;
}
/* 强制将子组件的磨砂玻璃面板透明化，去除冗余边框、阴影与内边距，消除“卡片嵌套卡片”的视觉硬块感 */
.tm-modal-body .tm-glass-panel {
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  border-radius: 0 !important;
}
/* 模态框内文本描述美化 */
.tm-modal-body .tm-panel-desc {
  font-size: 13px !important;
  color: var(--tp-text-secondary) !important;
  font-weight: 500 !important;
  line-height: 1.5 !important;
  margin: 0 0 14px !important;
}
/* 模态框内的批量输入文本框，采用圆角与微透质感，完美适配双色主题 */
.tm-modal-body .tm-batch-textarea {
  width: 100% !important;
  background: var(--tp-surface-input) !important;
  border: 1px solid var(--tp-border-subtle) !important;
  border-radius: 12px !important;
  color: var(--tp-text-primary) !important;
  font-size: 13.5px !important;
  padding: 14px 16px !important;
  min-height: 140px !important;
  font-family: inherit !important;
  outline: none !important;
  box-shadow: none !important;
  transition:
    border-color 0.2s,
    box-shadow 0.2s !important;
  box-sizing: border-box !important;
}
.tm-modal-body .tm-batch-textarea:focus {
  border-color: var(--tp-accent-primary-border) !important;
  box-shadow: 0 0 0 3px var(--tp-accent-primary-soft) !important;
}
.tm-modal-body .tm-batch-textarea::placeholder {
  color: var(--tp-gray-400) !important;
}
/* 即将创建标签预览信息小胶囊，采用柔和背景和边框，提供科技感与视觉对齐 */
.tm-modal-body .tm-batch-preview {
  font-size: 12px !important;
  color: var(--tp-primary) !important;
  margin: 12px 0 0 !important;
  font-weight: 500 !important;
  background: var(--tp-accent-primary-soft) !important;
  border: 1px solid var(--tp-accent-primary-border) !important;
  padding: 6px 12px !important;
  border-radius: 8px !important;
  display: inline-block !important;
}
/* 批量模态框尾部按钮与配置区对齐 */
.tm-modal-body .tm-batch-footer {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  margin-top: 20px !important;
}
/* 智能导入复选框交互动效 */
.tm-modal-body .tm-batch-checkbox {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  cursor: pointer !important;
  font-size: 12px !important;
  color: var(--tp-text-secondary) !important;
  font-weight: 500 !important;
  user-select: none !important;
  transition: color 0.15s !important;
}
.tm-modal-body .tm-batch-checkbox:hover {
  color: var(--tp-text-primary) !important;
}
.tm-modal-body .tm-batch-checkbox input[type='checkbox'] {
  width: 16px !important;
  height: 16px !important;
  border-radius: 4px !important;
  accent-color: var(--tp-primary) !important;
  cursor: pointer !important;
}
/* 极客炫彩提交按钮，在轻微 translateY 与阴影过渡中赋予按压触感反馈 */
.tm-modal-body .tm-batch-submit {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 8px 22px !important;
  border-radius: 999px !important;
  border: none !important;
  background: var(--tp-btn-bg) !important;
  color: var(--tp-btn-text, #ffffff) !important;
  font-size: 13px !important;
  font-weight: 650 !important;
  cursor: pointer !important;
  transition: all var(--tp-transition) !important;
  white-space: nowrap !important;
  box-shadow: var(--tp-btn-shadow) !important;
}
.tm-modal-body .tm-batch-submit:hover:not(:disabled) {
  background: var(--tp-btn-bg-hover) !important;
  box-shadow: var(--tp-btn-shadow-hover) !important;
  transform: translateY(-1.5px) !important;
}
.tm-modal-body .tm-batch-submit:active:not(:disabled) {
  transform: translateY(0) scale(0.97) !important;
}
.tm-modal-body .tm-batch-submit:disabled {
  opacity: 0.5 !important;
  cursor: not-allowed !important;
  transform: none !important;
  box-shadow: none !important;
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

/* 批量文本域与焦点动效已由上方全局规则统一处理，此处清除冗余样式 */

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

.tm-modal-overlay {
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: none;
}

.tm-modal-content,
.tm-modal-header {
  background: var(--tp-surface-card);
  border-color: var(--tp-border-subtle);
}

.tm-modal-content {
  border-radius: 16px;
  box-shadow: var(--tp-shadow-md);
}

.tm-modal-title .material-symbols-outlined {
  text-shadow: none;
}

.tm-modal-body .tm-batch-textarea {
  background: var(--tp-surface-input);
  border-color: var(--tp-border-subtle);
  box-shadow: none;
}
</style>
