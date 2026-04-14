<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { useProjectStore } from '../../stores/project'
import { listTags, createTag, updateTag, deleteTag } from '../../api/tag'
import type { Tag } from '../../api/tag'
import { apiClient } from '../../api/client'

const projectStore = useProjectStore()
const selectedProject = computed(() => projectStore.selectedProjectId)
const apiBaseUrl = apiClient.defaults.baseURL || 'http://localhost:8080/api/v1'
const serverUrl = apiBaseUrl.replace(/\/api\/v1\/?$/, '')

// ── State ──
const loading = ref(false)
const tags = ref<Tag[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const activeTab = ref<'all' | 'recent'>('all')
const sortBy = ref<'case_count' | 'name' | 'created_at'>('case_count')

// ── Dialog ──
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const tagForm = reactive({
  name: '',
  color: '#3B82F6',
  description: '',
})

// ── Batch create ──
const batchInput = ref('')
const batchAutoColor = ref(true)

const presetColors = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
  '#14B8A6', '#6366F1', '#84CC16', '#78716C',
]

// ── Computed ──
/** 热度排行 Top 5 */
const topTags = computed(() => {
  const sorted = [...tags.value].sort((a, b) => b.case_count - a.case_count)
  return sorted.slice(0, 5)
})

/** 当前排序后的标签列表 */
const sortedTags = computed(() => {
  const list = [...tags.value]
  if (sortBy.value === 'case_count') {
    list.sort((a, b) => b.case_count - a.case_count)
  } else if (sortBy.value === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name))
  } else {
    list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
  }
  return list
})

/** 标签总关联用例数 */
const totalCaseCount = computed(() => tags.value.reduce((s, t) => s + (t.case_count || 0), 0))

/** 最大 case_count 用于进度条百分比 */
const maxCaseCount = computed(() => Math.max(...tags.value.map((t) => t.case_count || 0), 1))

// 排行卡片进度条颜色
const rankBarColors = ['#7c3aed', '#0566d9', '#a15100', '#958da1', '#ef4444']

// ── Data Loading ──
async function loadTags() {
  if (!selectedProject.value) {
    tags.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const resp = await listTags(selectedProject.value, {
      keyword: keyword.value.trim() || undefined,
      page: page.value,
      pageSize: pageSize.value,
    })
    const data = resp as { items?: Tag[] | null; total?: number } | Tag[]
    if (Array.isArray(data)) {
      tags.value = data
      total.value = data.length
    } else {
      tags.value = Array.isArray(data?.items) ? data.items : []
      total.value = Number(data?.total) || 0
    }
  } catch {
    ElMessage.error('加载标签列表失败')
  } finally {
    loading.value = false
  }
}

// ── Watchers ──
watch(selectedProject, () => {
  keyword.value = ''
  page.value = 1
  loadTags()
})

watch([page, pageSize], () => loadTags())

onMounted(() => {
  if (selectedProject.value) loadTags()
})

// ── Search ──
function onSearch() {
  page.value = 1
  loadTags()
}

// ── CRUD ──
/** 获取下一个未被已有标签使用的颜色 */
function nextAvailableColor(): string {
  const usedColors = new Set(tags.value.map((t) => t.color?.toUpperCase()))
  for (const c of presetColors) {
    if (!usedColors.has(c.toUpperCase())) return c
  }
  // 全部用完则循环回第一个
  return presetColors[tags.value.length % presetColors.length] ?? '#3B82F6'
}

function openCreate() {
  editingId.value = null
  tagForm.name = ''
  tagForm.color = nextAvailableColor()
  tagForm.description = ''
  dialogVisible.value = true
}

function openEdit(tag: Tag) {
  editingId.value = tag.id
  tagForm.name = tag.name
  tagForm.color = tag.color
  tagForm.description = tag.description || ''
  dialogVisible.value = true
}

async function submitTag() {
  if (!selectedProject.value) return
  const trimmedName = tagForm.name.trim()
  if (!trimmedName) {
    ElMessage.warning('标签名称不能为空')
    return
  }
  if (trimmedName.length < 2 || trimmedName.length > 50) {
    ElMessage.warning('标签名称长度须在 2-50 个字符之间')
    return
  }
  const colorReg = /^#[0-9A-Fa-f]{6}$/
  if (!colorReg.test(tagForm.color)) {
    ElMessage.warning('颜色格式不正确，请使用 #RRGGBB 格式')
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      await updateTag(selectedProject.value, editingId.value, {
        name: trimmedName,
        color: tagForm.color,
        description: tagForm.description.trim(),
      })
      ElMessage.success('标签更新成功')
    } else {
      await createTag(selectedProject.value, {
        name: trimmedName,
        color: tagForm.color,
        description: tagForm.description.trim(),
      })
      ElMessage.success('标签创建成功')
    }
    dialogVisible.value = false
    await loadTags()
  } catch (e: unknown) {
    const msg =
      (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
        ?.message ||
      (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
      '操作失败'
    ElMessage.error(msg)
  } finally {
    saving.value = false
  }
}

async function onDelete(tag: Tag) {
  if (!selectedProject.value) return
  const msg =
    tag.case_count > 0
      ? `该标签已被 ${tag.case_count} 个用例使用，删除后将自动解除关联，是否继续？`
      : `确认删除标签「${tag.name}」？`
  try {
    await ElMessageBox.confirm(msg, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await deleteTag(selectedProject.value, tag.id)
    ElMessage.success('删除成功')
    await loadTags()
  } catch (e: unknown) {
    if (e !== 'cancel') {
      const errMsg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message || '删除失败'
      ElMessage.error(errMsg)
    }
  }
}

async function batchCreate() {
  if (!selectedProject.value) return
  const names = batchInput.value
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (names.length === 0) {
    ElMessage.warning('请输入至少一个标签名')
    return
  }
  saving.value = true
  let successCount = 0
  for (let i = 0; i < names.length; i++) {
    const color = batchAutoColor.value
      ? presetColors[i % presetColors.length]
      : '#3B82F6'
    try {
      await createTag(selectedProject.value, { name: names[i], color, description: '' })
      successCount++
    } catch {
      /* skip duplicates */
    }
  }
  saving.value = false
  if (successCount > 0) {
    ElMessage.success(`成功创建 ${successCount} 个标签`)
    batchInput.value = ''
    await loadTags()
  } else {
    ElMessage.warning('所有标签均已存在或创建失败')
  }
}



function getTagIcon(tag: Tag): string {
  const c = tag.case_count || 0
  if (c > 100) return 'verified'
  if (c > 50) return 'check_circle'
  if (c > 10) return 'sell'
  return 'label'
}

</script>

<template>
  <div v-loading="loading" class="tm-root">
    <!-- No project selected -->
    <div v-if="!selectedProject" class="tm-empty-state">
      <el-empty description="请先在侧边栏选择一个项目" :image-size="120" />
    </div>

    <template v-else>
      <!-- Section 1: 标签热度统计 -->
      <section v-if="tags.length > 0" class="tm-section">
        <div class="tm-section-header">
          <h3 class="tm-section-title">标签热度统计</h3>
          <span class="tm-section-badge">REAL-TIME METRICS</span>
        </div>
        <div class="tm-heat-grid">
          <div
            v-for="(t, idx) in topTags"
            :key="t.id"
            class="tm-heat-card"
          >
            <div class="tm-heat-top">
              <span
                class="tm-heat-tag-badge"
                :style="{
                  backgroundColor: t.color + '1a',
                  color: t.color,
                }"
              >
                #{{ t.name }}
              </span>
              <span class="tm-heat-rank">RANK {{ String(idx + 1).padStart(2, '0') }}</span>
            </div>
            <div class="tm-heat-value">
              <span class="tm-heat-number">{{ t.case_count.toLocaleString() }}</span>
              <span class="tm-heat-label">用例</span>
            </div>
            <div class="tm-heat-bar-track">
              <div
                class="tm-heat-bar-fill"
                :style="{
                  width: Math.max((t.case_count / maxCaseCount) * 100, 5) + '%',
                  backgroundColor: rankBarColors[idx] || t.color,
                }"
              ></div>
            </div>
          </div>
          <!-- 空卡片补位 -->
          <div v-for="n in Math.max(0, 5 - topTags.length)" :key="'ph-' + n" class="tm-heat-card tm-heat-card--empty">
            <div class="tm-heat-top">
              <span class="tm-heat-rank" style="opacity: 0.3">RANK {{ String(topTags.length + n).padStart(2, '0') }}</span>
            </div>
            <div class="tm-heat-value">
              <span class="tm-heat-number" style="opacity: 0.2">--</span>
            </div>
            <div class="tm-heat-bar-track">
              <div class="tm-heat-bar-fill" style="width: 0"></div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 2: Main Grid -->
      <div class="tm-main-grid">
        <!-- Left: Batch Create + Summary -->
        <div class="tm-left-col">
          <!-- Batch Create Panel -->
          <div class="tm-glass-panel">
            <div class="tm-panel-header">
              <div class="tm-panel-icon">
                <span class="material-symbols-outlined">auto_fix_high</span>
              </div>
              <h3 class="tm-panel-title">批量创建标签</h3>
            </div>
            <p class="tm-panel-desc">
              输入多个标签名（使用空格或逗号分隔），系统将自动为您分配高辨识度的互斥色。
            </p>
            <textarea
              v-model="batchInput"
              class="tm-batch-textarea"
              placeholder="例如: 冒烟测试, UI优化, 遗留问题, v2.1.0"
              rows="4"
            ></textarea>
            <div class="tm-batch-footer">
              <label class="tm-batch-checkbox">
                <input v-model="batchAutoColor" type="checkbox" />
                <span>自动分配互斥色</span>
              </label>
              <button type="button" class="tm-batch-btn" :disabled="saving" @click="batchCreate">
                执行创建
              </button>
            </div>
          </div>
          <!-- Summary Card -->
          <div class="tm-summary-card">
            <div class="tm-summary-glow"></div>
            <div class="tm-summary-content">
              <h4 class="tm-summary-label">标签概览</h4>
              <p class="tm-summary-number">{{ tags.length }}</p>
              <p class="tm-summary-sub">
                共 <strong>{{ totalCaseCount }}</strong> 个用例引用
              </p>
              <div v-if="tags.length > 0" class="tm-summary-avatars">
                <div
                  v-for="(t, i) in tags.slice(0, 3)"
                  :key="t.id"
                  class="tm-summary-dot"
                  :style="{ backgroundColor: t.color, zIndex: 10 - i }"
                >
                  {{ t.name.charAt(0).toUpperCase() }}
                </div>
                <div v-if="tags.length > 3" class="tm-summary-dot tm-summary-dot--more">
                  +{{ tags.length - 3 }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: Tag List -->
        <div class="tm-right-col">
          <!-- Tabs + Sort + Actions -->
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
                @click="activeTab = 'recent'; sortBy = 'created_at'"
              >
                最近更新
              </button>
            </div>
            <div class="tm-toolbar-right">
              <div class="tm-search-inline">
                <el-input
                  v-model="keyword"
                  placeholder="搜索标签..."
                  clearable
                  :prefix-icon="Search"
                  size="small"
                  style="width: 180px"
                  @keyup.enter="onSearch"
                  @clear="onSearch"
                />
              </div>
              <div class="tm-sort">
                <span class="tm-sort-label">排序:</span>
                <select v-model="sortBy" class="tm-sort-select">
                  <option value="case_count">用例数</option>
                  <option value="name">名称</option>
                  <option value="created_at">创建时间</option>
                </select>
              </div>
              <button type="button" class="tm-create-btn" @click="openCreate">
                <span class="material-symbols-outlined" style="font-size: 16px">add</span>
                <span>新建标签</span>
              </button>
            </div>
          </div>

          <!-- Tag Rows -->
          <div class="tm-tag-list">
            <div v-if="sortedTags.length === 0" class="tm-list-empty">
              <el-empty description="暂无标签" :image-size="80">
                <el-button type="primary" plain @click="openCreate">去新建</el-button>
              </el-empty>
            </div>
            <div
              v-for="tag in sortedTags"
              :key="tag.id"
              class="tm-tag-row"
              :style="{ '--row-accent': tag.color }"
            >
              <!-- Left: color dot + name + desc -->
              <div class="tm-tag-color-bar" :style="{ backgroundColor: tag.color }"></div>
              <div class="tm-tag-info">
                <div class="tm-tag-name-row">
                  <span
                    class="material-symbols-outlined tm-tag-icon"
                    :style="{ color: tag.color }"
                  >{{ getTagIcon(tag) }}</span>
                  <h4 class="tm-tag-name">{{ tag.name }}</h4>
                  <span
                    class="tm-tag-status-badge"
                    :style="{
                      backgroundColor: tag.color + '1a',
                      color: tag.color,
                    }"
                  >
                    {{ tag.case_count > 0 ? '使用中' : '未使用' }}
                  </span>
                </div>
                <p class="tm-tag-desc">{{ tag.description || '暂无描述' }}</p>
              </div>
              <!-- Stats -->
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
              <!-- Actions -->
              <div class="tm-tag-actions">
                <button type="button" class="tm-icon-btn" @click="openEdit(tag)">
                  <span class="material-symbols-outlined" style="font-size: 18px">edit</span>
                </button>
                <button type="button" class="tm-icon-btn tm-icon-btn--danger" @click="onDelete(tag)">
                  <span class="material-symbols-outlined" style="font-size: 18px">delete</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Pagination -->
          <div v-if="total > pageSize" class="tm-pager">
            <span class="tm-pager-total">共 {{ total }} 条</span>
            <el-pagination
              background
              size="small"
              :current-page="page"
              :page-size="pageSize"
              :total="total"
              layout="prev, pager, next"
              @current-change="(v: number) => { page = v }"
            />
          </div>
        </div>
      </div>
    </template>

    <!-- Create / Edit Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑标签' : '新建标签'"
      width="480px"
    >
      <el-form label-position="top">
        <el-form-item label="标签名称" required>
          <el-input v-model="tagForm.name" maxlength="50" placeholder="2-50 字符" />
        </el-form-item>
        <el-form-item label="颜色" required>
          <div class="color-palette">
            <button
              v-for="c in presetColors"
              :key="c"
              type="button"
              class="color-swatch"
              :class="{ active: tagForm.color === c }"
              :style="{ backgroundColor: c }"
              @click="tagForm.color = c"
            >
              <span v-if="tagForm.color === c" class="material-symbols-outlined" style="color: #fff; font-size: 16px">check</span>
            </button>
          </div>
          <el-input v-model="tagForm.color" maxlength="7" placeholder="#RRGGBB" style="margin-top: 8px; width: 140px" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="tagForm.description" type="textarea" :rows="2" maxlength="200" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitTag">确认</el-button>
      </template>
    </el-dialog>
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

  font-family: 'Inter', system-ui, -apple-system, sans-serif;
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

/* ── Section Header ── */
.tm-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.tm-section-title {
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  margin: 0;
}
.tm-section-badge {
  font-size: 10px;
  color: var(--purple-light);
  font-weight: 500;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

/* ── Heat Grid ── */
.tm-heat-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
}
.tm-heat-card {
  background: var(--bg-card);
  padding: 20px;
  border-radius: 12px;
  border: 1px solid var(--border-faint);
  transition: all 0.25s;
}
.tm-heat-card:hover {
  border-color: rgba(124, 58, 237, 0.2);
}
.tm-heat-card--empty {
  opacity: 0.4;
}
.tm-heat-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}
.tm-heat-tag-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tm-heat-rank {
  font-size: 11px;
  color: rgba(204, 195, 216, 0.5);
  text-transform: uppercase;
  font-weight: 500;
}
.tm-heat-value {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}
.tm-heat-number {
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.04em;
}
.tm-heat-label {
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.tm-heat-bar-track {
  margin-top: 16px;
  height: 4px;
  width: 100%;
  background: var(--bg-card-high);
  border-radius: 99px;
  overflow: hidden;
}
.tm-heat-bar-fill {
  height: 100%;
  border-radius: 99px;
  transition: width 0.6s ease;
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

/* ── Glass Panel (Batch Create) ── */
.tm-glass-panel {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  padding: 24px;
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
}
.tm-panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.tm-panel-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(124, 58, 237, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--purple-light);
}
.tm-panel-icon .material-symbols-outlined {
  font-size: 18px;
}
.tm-panel-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.02em;
}
.tm-panel-desc {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 300;
  line-height: 1.6;
  margin: 0 0 16px;
}
.tm-batch-textarea {
  width: 100%;
  background: #0c0e18;
  border: 1px solid rgba(74, 68, 85, 0.2);
  border-radius: 12px;
  padding: 14px;
  font-size: 13px;
  color: var(--text-primary);
  resize: vertical;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}
.tm-batch-textarea::placeholder {
  color: rgba(149, 141, 161, 0.4);
}
.tm-batch-textarea:focus {
  border-color: rgba(124, 58, 237, 0.5);
}
.tm-batch-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
}
.tm-batch-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-secondary);
}
.tm-batch-checkbox:hover {
  color: var(--text-primary);
}
.tm-batch-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  accent-color: var(--purple);
}
.tm-batch-btn {
  padding: 8px 24px;
  border-radius: 8px;
  background: var(--bg-bright);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  border: 1px solid rgba(74, 68, 85, 0.2);
  cursor: pointer;
  transition: all 0.2s;
}
.tm-batch-btn:hover {
  background: #3f4150;
}
.tm-batch-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── Summary Card ── */
.tm-summary-card {
  position: relative;
  overflow: hidden;
  padding: 24px;
  border-radius: 16px;
  background: var(--bg-card-high);
  border: 1px solid var(--border-subtle);
  min-height: 180px;
}
.tm-summary-glow {
  position: absolute;
  top: -40px;
  right: -40px;
  width: 120px;
  height: 120px;
  background: rgba(124, 58, 237, 0.1);
  border-radius: 50%;
  filter: blur(40px);
}
.tm-summary-content {
  position: relative;
  z-index: 1;
}
.tm-summary-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: rgba(204, 195, 216, 0.6);
  margin: 0 0 8px;
  font-weight: 600;
}
.tm-summary-number {
  font-size: 28px;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.04em;
}
.tm-summary-sub {
  font-size: 12px;
  color: #10b981;
  margin: 4px 0 0;
}
.tm-summary-sub strong {
  font-weight: 700;
}
.tm-summary-avatars {
  display: flex;
  margin-top: 20px;
}
.tm-summary-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--bg-card-high);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  margin-left: -8px;
}
.tm-summary-dot:first-child {
  margin-left: 0;
}
.tm-summary-dot--more {
  background: #323440;
  color: var(--text-secondary);
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
  background: #1d1f2b;
}
.tm-create-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border-radius: 8px;
  background: var(--purple);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.tm-create-btn:hover {
  filter: brightness(1.15);
}
.tm-create-btn:active {
  transform: scale(0.95);
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
.tm-tag-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-radius: 12px;
  background: rgba(25, 27, 38, 0.5);
  border-left: 3px solid var(--row-accent, var(--purple));
  transition: all 0.25s;
}
.tm-tag-row:hover {
  background: var(--bg-card-high);
}
.tm-tag-color-bar {
  width: 4px;
  height: 36px;
  border-radius: 2px;
  flex-shrink: 0;
}

/* Tag Info (left part) */
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
.tm-tag-desc {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 300;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Tag Stats (middle part) */
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

/* Tag Actions (right part) */
.tm-tag-actions {
  display: flex;
  gap: 4px;
}
.tm-icon-btn {
  padding: 8px;
  border-radius: 8px;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.tm-icon-btn:hover {
  background: var(--bg-bright);
  color: var(--text-primary);
}
.tm-icon-btn--danger:hover {
  color: #ffb4ab;
  background: rgba(239, 68, 68, 0.1);
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
.tm-pager :deep(.btn-next) { color: var(--text-faint); }
.tm-pager :deep(.el-pager li) {
  background: transparent;
  color: var(--text-faint);
  border-radius: 4px;
}
.tm-pager :deep(.el-pager li.is-active) {
  background: var(--purple) !important;
  color: #fff;
}
.tm-pager :deep(.el-pager li:hover) { background: var(--bg-card-high); }

/* ── Color Palette (Dialog) ── */
.color-palette {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.color-swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.color-swatch:hover {
  transform: scale(1.15);
}
.color-swatch.active {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3);
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
