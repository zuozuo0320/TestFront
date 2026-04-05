<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { useProjectStore } from '../stores/project'
import { listUsers } from '../api/user'
import {
  listReviews,
  createReview,
  deleteReview,
  closeReview,
  copyReview,
  type CaseReview,
  type CreateReviewPayload,
  type ReviewListParams,
} from '../api/caseReview'
import { listTestCases } from '../api/testcase'

// ── Stores ──
const projectStore = useProjectStore()

const selectedProjectId = computed(() => projectStore.selectedProjectId)

// ── State ──
const loading = ref(false)
const reviews = ref<CaseReview[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const viewMode = ref<'all' | 'assigned' | 'created'>('all')
const searchKeyword = ref('')
const filterStatus = ref('')
const filterMode = ref('')

// ── 用户列表（评审人选择） ──
const allUsers = ref<{ id: number; name: string; email: string }[]>([])

async function loadUsers() {
  try {
    const resp = await listUsers()
    allUsers.value = (resp as any)?.items || resp || []
  } catch { /* ignore */ }
}

// ── 数据加载 ──
async function fetchReviews() {
  if (!selectedProjectId.value) return
  loading.value = true
  try {
    const params: ReviewListParams = {
      page: page.value,
      pageSize: pageSize.value,
      view: viewMode.value,
      keyword: searchKeyword.value || undefined,
      status: filterStatus.value || undefined,
      review_mode: filterMode.value || undefined,
    }
    const resp = await listReviews(selectedProjectId.value, params)
    reviews.value = resp?.items || []
    total.value = resp?.total || 0
  } catch (e: any) {
    ElMessage.error('加载评审列表失败')
  } finally {
    loading.value = false
  }
}

watch([selectedProjectId, page, pageSize, viewMode], () => fetchReviews())

onMounted(() => {
  fetchReviews()
  loadUsers()
})

function handleSearch() {
  page.value = 1
  fetchReviews()
}

function handlePageChange(p: number) {
  page.value = p
}

function handleSizeChange(s: number) {
  pageSize.value = s
  page.value = 1
}

// ── 创建评审 ──
const createDialogVisible = ref(false)
const createForm = reactive({
  name: '',
  review_mode: 'single' as 'single' | 'parallel',
  description: '',
  default_reviewer_ids: [] as number[],
  planned_start_at: '',
  planned_end_at: '',
  testcase_ids: [] as number[],
})
const creating = ref(false)

// 测试用例列表（用于关联用例 用途选择）
const availableCases = ref<{ id: number; title: string }[]>([])
const loadingCases = ref(false)

async function loadCasesForLink() {
  if (!selectedProjectId.value) return
  loadingCases.value = true
  try {
    const resp = await listTestCases(selectedProjectId.value, { page: 1, pageSize: 200 })
    availableCases.value = (resp as any)?.items?.map((c: any) => ({ id: c.id, title: c.title })) || []
  } catch { /* ignore */ }
  loadingCases.value = false
}

function openCreateDialog() {
  Object.assign(createForm, {
    name: '',
    review_mode: 'single',
    description: '',
    default_reviewer_ids: [],
    planned_start_at: '',
    planned_end_at: '',
    testcase_ids: [],
  })
  loadCasesForLink()
  createDialogVisible.value = true
}

async function handleCreate() {
  if (!createForm.name.trim()) {
    ElMessage.warning('请输入评审计划名称')
    return
  }
  if (createForm.default_reviewer_ids.length === 0) {
    ElMessage.warning('请选择至少一名评审人')
    return
  }
  creating.value = true
  try {
    const payload: CreateReviewPayload = {
      name: createForm.name.trim(),
      review_mode: createForm.review_mode,
      description: createForm.description,
      default_reviewer_ids: createForm.default_reviewer_ids,
      testcase_ids: createForm.testcase_ids,
      auto_submit: true,
    }
    if (createForm.planned_start_at) payload.planned_start_at = createForm.planned_start_at
    if (createForm.planned_end_at) payload.planned_end_at = createForm.planned_end_at
    await createReview(selectedProjectId.value!, payload)
    ElMessage.success('评审计划创建成功')
    createDialogVisible.value = false
    fetchReviews()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '创建失败')
  } finally {
    creating.value = false
  }
}

// ── 操作 ──
async function handleDelete(review: CaseReview) {
  try {
    await ElMessageBox.confirm(`确定删除评审计划「${review.name}」？`, '删除确认', { type: 'warning' })
    await deleteReview(selectedProjectId.value!, review.id)
    ElMessage.success('已删除')
    fetchReviews()
  } catch { /* cancelled */ }
}

async function handleClose(review: CaseReview) {
  try {
    await ElMessageBox.confirm(`确定关闭评审计划「${review.name}」？关闭后不可编辑。`, '关闭确认', { type: 'warning' })
    await closeReview(selectedProjectId.value!, review.id)
    ElMessage.success('已关闭')
    fetchReviews()
  } catch { /* cancelled */ }
}

async function handleCopy(review: CaseReview) {
  try {
    await copyReview(selectedProjectId.value!, review.id, { include_cases: true })
    ElMessage.success('已复制')
    fetchReviews()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '复制失败')
  }
}

// ── 格式辅助 ──
function statusLabel(status: string) {
  const map: Record<string, string> = {
    not_started: '未开始',
    in_progress: '进行中',
    completed: '已完成',
    closed: '已关闭',
  }
  return map[status] || status
}

function statusType(status: string): 'info' | 'warning' | 'success' | 'danger' | '' {
  const map: Record<string, 'info' | 'warning' | 'success' | 'danger'> = {
    not_started: 'info',
    in_progress: 'warning',
    completed: 'success',
    closed: 'danger',
  }
  return map[status] || 'info'
}

function modeLabel(mode: string) {
  return mode === 'parallel' ? '会签' : '独审'
}

function formatDate(d: string) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('zh-CN')
}

// ── 评审详情（内嵌抽屉） ──
const detailDrawerVisible = ref(false)
const currentReview = ref<CaseReview | null>(null)

function openDetail(review: CaseReview) {
  currentReview.value = review
  detailDrawerVisible.value = true
}
</script>

<template>
  <div class="case-review-page">
    <!-- ─── 顶部 ─── -->
    <div class="page-header">
      <div class="header-left">
        <h2 class="page-title">
          <span class="material-symbols-outlined title-icon">rate_review</span>
          用例评审
        </h2>
        <div class="view-tabs">
          <button
            v-for="tab in [
              { key: 'all', label: '全部', icon: 'list' },
              { key: 'created', label: '我创建的', icon: 'edit_note' },
              { key: 'assigned', label: '我评审的', icon: 'how_to_reg' },
            ]"
            :key="tab.key"
            class="view-tab"
            :class="{ active: viewMode === tab.key }"
            @click="viewMode = tab.key as any"
          >
            <span class="material-symbols-outlined tab-icon">{{ tab.icon }}</span>
            {{ tab.label }}
          </button>
        </div>
      </div>
      <div class="header-right">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索计划名称 / ID"
          :prefix-icon="Search"
          clearable
          class="search-input"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
        <el-select v-model="filterStatus" placeholder="状态" clearable class="filter-select" @change="handleSearch">
          <el-option label="未开始" value="not_started" />
          <el-option label="进行中" value="in_progress" />
          <el-option label="已完成" value="completed" />
          <el-option label="已关闭" value="closed" />
        </el-select>
        <el-select v-model="filterMode" placeholder="模式" clearable class="filter-select" @change="handleSearch">
          <el-option label="独审" value="single" />
          <el-option label="会签" value="parallel" />
        </el-select>
        <el-button type="primary" class="create-btn" @click="openCreateDialog">
          <span class="material-symbols-outlined" style="font-size:18px;margin-right:4px">add_circle</span>
          新建评审
        </el-button>
      </div>
    </div>

    <!-- ─── 内容区 ─── -->
    <div class="content-area">
      <!-- 有数据：表格 -->
      <div v-if="reviews.length > 0 || loading" class="table-card">
        <el-table
          :data="reviews"
          v-loading="loading"
          style="width: 100%"
          row-class-name="review-row"
          @row-click="openDetail"
          :header-cell-style="{ background: '#fafbfc', color: '#606266', fontWeight: 600, fontSize: '13px' }"
        >
          <el-table-column prop="id" label="ID" width="64" align="center">
            <template #default="{ row }">
              <span class="id-badge">#{{ row.id }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="评审计划" min-width="220">
            <template #default="{ row }">
              <div class="plan-cell">
                <span class="material-symbols-outlined plan-icon">assignment</span>
                <div class="plan-info">
                  <span class="plan-name">{{ row.name }}</span>
                  <span v-if="row.description" class="plan-desc">{{ row.description }}</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="模式" width="100" align="center">
            <template #default="{ row }">
              <span class="mode-badge" :class="row.review_mode">
                <span class="material-symbols-outlined" style="font-size:14px">{{ row.review_mode === 'parallel' ? 'group' : 'person' }}</span>
                {{ modeLabel(row.review_mode) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <span class="status-dot" :class="row.status"></span>
              <span class="status-text" :class="row.status">{{ statusLabel(row.status) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="评审进度" width="210">
            <template #default="{ row }">
              <div class="progress-cell">
                <el-progress
                  :percentage="row.case_total_count > 0 ? Math.round((row.approved_count + row.rejected_count + row.needs_update_count) / row.case_total_count * 100) : 0"
                  :stroke-width="6"
                  :color="row.status === 'completed' ? 'var(--tp-success)' : 'var(--tp-primary)'"
                  :show-text="false"
                  style="flex:1"
                />
                <span class="progress-num">
                  {{ row.approved_count + row.rejected_count + row.needs_update_count }}<span class="progress-sep">/</span>{{ row.case_total_count }}
                </span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="通过率" width="80" align="center">
            <template #default="{ row }">
              <span class="rate-chip" :class="{ high: row.pass_rate >= 80, low: row.pass_rate < 50 && row.case_total_count > 0 }">
                {{ row.case_total_count > 0 ? row.pass_rate.toFixed(0) + '%' : '—' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" width="110" align="center">
            <template #default="{ row }">
              <span class="date-text">{{ formatDate(row.created_at) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" align="center" fixed="right">
            <template #default="{ row }">
              <div class="action-btns" @click.stop>
                <button class="act-btn copy" title="复制" @click="handleCopy(row)">
                  <span class="material-symbols-outlined">content_copy</span>
                </button>
                <button v-if="row.status !== 'closed'" class="act-btn close" title="关闭" @click="handleClose(row)">
                  <span class="material-symbols-outlined">block</span>
                </button>
                <button class="act-btn delete" title="删除" @click="handleDelete(row)">
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination-bar" v-if="total > 0">
          <el-pagination
            v-model:current-page="page"
            v-model:page-size="pageSize"
            :total="total"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @current-change="handlePageChange"
            @size-change="handleSizeChange"
          />
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <div class="empty-illustration">
          <span class="material-symbols-outlined empty-icon">rate_review</span>
          <div class="empty-rings">
            <div class="ring ring-1"></div>
            <div class="ring ring-2"></div>
            <div class="ring ring-3"></div>
          </div>
        </div>
        <h3 class="empty-title">还没有评审计划</h3>
        <p class="empty-desc">创建评审计划，关联测试用例，邀请团队成员进行代码评审</p>
        <el-button type="primary" size="large" class="empty-create-btn" @click="openCreateDialog">
          <span class="material-symbols-outlined" style="font-size:18px;margin-right:6px">add_circle</span>
          创建第一个评审计划
        </el-button>
      </div>
    </div>

    <!-- ─── 创建评审对话框 ─── -->
    <el-dialog v-model="createDialogVisible" title="新建评审计划" width="640px" destroy-on-close class="create-dialog">
      <el-form label-width="100px" label-position="top">
        <el-form-item label="计划名称" required>
          <el-input v-model="createForm.name" placeholder="例：V3.2 功能评审" maxlength="128" show-word-limit />
        </el-form-item>
        <el-form-item label="评审模式" required>
          <el-radio-group v-model="createForm.review_mode" class="mode-radio-group">
            <el-radio-button value="single">
              <span class="mode-option">
                <span class="material-symbols-outlined" style="font-size:18px">person</span>
                独审
              </span>
            </el-radio-button>
            <el-radio-button value="parallel">
              <span class="mode-option">
                <span class="material-symbols-outlined" style="font-size:18px">group</span>
                会签
              </span>
            </el-radio-button>
          </el-radio-group>
          <div class="form-hint">
            <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;margin-right:2px">info</span>
            {{ createForm.review_mode === 'single' ? '任意一人评审即出结果' : '所有人通过才算通过，任一人拒绝则拒绝' }}
          </div>
        </el-form-item>
        <el-form-item label="评审人" required>
          <el-select v-model="createForm.default_reviewer_ids" multiple filterable placeholder="选择评审人" style="width: 100%">
            <el-option v-for="u in allUsers" :key="u.id" :label="u.name" :value="u.id">
              <span>{{ u.name }}</span>
              <span style="color:#999;font-size:12px;margin-left:8px">{{ u.email }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="关联用例">
          <el-select v-model="createForm.testcase_ids" multiple filterable placeholder="选择要关联的用例（可选）" style="width: 100%" :loading="loadingCases">
            <el-option v-for="c in availableCases" :key="c.id" :label="`#${c.id} ${c.title}`" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="createForm.description" type="textarea" :rows="3" placeholder="评审计划描述" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- ─── 评审详情抽屉 ─── -->
    <el-drawer v-model="detailDrawerVisible" :title="currentReview?.name || '评审详情'" direction="rtl" size="50%">
      <div v-if="currentReview" class="review-detail">
        <div class="detail-header">
          <el-tag :type="statusType(currentReview.status)">{{ statusLabel(currentReview.status) }}</el-tag>
          <el-tag>{{ modeLabel(currentReview.review_mode) }}</el-tag>
        </div>
        <div class="detail-stats">
          <div class="stat-card"><div class="stat-value">{{ currentReview.case_total_count }}</div><div class="stat-label">关联用例</div></div>
          <div class="stat-card approved"><div class="stat-value">{{ currentReview.approved_count }}</div><div class="stat-label">通过</div></div>
          <div class="stat-card rejected"><div class="stat-value">{{ currentReview.rejected_count }}</div><div class="stat-label">拒绝</div></div>
          <div class="stat-card pending"><div class="stat-value">{{ currentReview.pending_count }}</div><div class="stat-label">待评审</div></div>
          <div class="stat-card"><div class="stat-value">{{ currentReview.pass_rate ? currentReview.pass_rate.toFixed(1) + '%' : '-' }}</div><div class="stat-label">通过率</div></div>
        </div>
        <div class="detail-desc" v-if="currentReview.description"><h4>描述</h4><p>{{ currentReview.description }}</p></div>
        <div class="detail-meta">
          <div>创建时间：{{ formatDate(currentReview.created_at) }}</div>
          <div>更新时间：{{ formatDate(currentReview.updated_at) }}</div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.case-review-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px 24px;
  background: var(--tp-surface-base);
  overflow-y: auto;
}

/* ══ 顶部工具栏 ══ */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}
.header-left { display: flex; align-items: center; gap: 16px; }
.header-right { display: flex; align-items: center; gap: 8px; }

.page-title {
  font-size: 20px; font-weight: 700; color: var(--tp-gray-900); margin: 0;
  display: flex; align-items: center; gap: 8px;
}
.title-icon { font-size: 24px; color: var(--tp-primary-light); }

/* 视图选项卡 */
.view-tabs {
  display: flex; gap: 0; background: var(--tp-surface-card); border-radius: var(--tp-radius-md);
  padding: 3px; border: 1px solid var(--tp-gray-200);
}
.view-tab {
  padding: 6px 14px; border: none; background: transparent; color: var(--tp-gray-500);
  font-size: 13px; border-radius: 8px; cursor: pointer; transition: all var(--tp-transition);
  display: flex; align-items: center; gap: 4px; font-weight: 500;
}
.tab-icon { font-size: 16px; }
.view-tab.active {
  background: var(--tp-primary-lighter); color: var(--tp-primary-light); font-weight: 600;
}
.view-tab:hover:not(.active) { color: var(--tp-gray-700); background: var(--tp-surface-hover); }

/* 搜索和筛选 */
.search-input { width: 200px; }
.filter-select { width: 110px; }
.create-btn {
  display: flex; align-items: center; border-radius: var(--tp-radius-sm);
  background: var(--tp-primary); border: none;
  font-weight: 600; padding: 8px 18px; color: #fff;
}
.create-btn:hover { background: var(--tp-primary-dark); box-shadow: var(--tp-shadow-glow); }

/* ══ 内容区 ══ */
.content-area { flex: 1; display: flex; flex-direction: column; }

/* 表格卡片 */
.table-card {
  background: var(--tp-surface-card); border-radius: var(--tp-radius-lg);
  border: 1px solid var(--tp-gray-200);
  padding: 0; overflow: hidden; flex: 1;
}
:deep(.el-table) {
  --el-table-border-color: transparent;
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: transparent;
  --el-table-text-color: var(--tp-gray-800);
  --el-table-header-text-color: var(--tp-gray-500);
  background: transparent;
}
:deep(.el-table th.el-table__cell) {
  border-bottom: 1px solid var(--tp-gray-200);
  font-weight: 600; font-size: 13px; color: var(--tp-gray-500);
  background: transparent !important;
}
:deep(.review-row) { cursor: pointer; transition: background .15s; }
:deep(.review-row:hover td) { background-color: var(--tp-surface-hover) !important; }
:deep(.review-row td) {
  padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,.04);
  background: transparent !important;
}

/* ID 徽章 */
.id-badge {
  display: inline-block; padding: 2px 8px; border-radius: var(--tp-radius-sm);
  background: var(--tp-primary-lighter); color: var(--tp-primary-light);
  font-size: 12px; font-weight: 600;
}

/* 计划名 */
.plan-cell { display: flex; align-items: center; gap: 10px; }
.plan-icon { font-size: 20px; color: var(--tp-primary-light); opacity: .5; flex-shrink: 0; }
.plan-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.plan-name { font-weight: 600; color: var(--tp-gray-900); font-size: 14px; }
.plan-desc {
  font-size: 12px; color: var(--tp-gray-400);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px;
}

/* 模式徽章 */
.mode-badge {
  display: inline-flex; align-items: center; gap: 3px; padding: 3px 10px;
  border-radius: 20px; font-size: 12px; font-weight: 600;
}
.mode-badge.single { background: rgba(59,130,246,.15); color: #60A5FA; }
.mode-badge.parallel { background: var(--tp-warning-light); color: var(--tp-warning); }

/* 状态点 */
.status-dot {
  display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; vertical-align: middle;
}
.status-dot.not_started { background: var(--tp-gray-400); }
.status-dot.in_progress { background: var(--tp-warning); animation: pulse 1.5s infinite; }
.status-dot.completed { background: var(--tp-success); }
.status-dot.closed { background: var(--tp-danger); }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }

.status-text { font-size: 13px; font-weight: 500; }
.status-text.not_started { color: var(--tp-gray-500); }
.status-text.in_progress { color: var(--tp-warning); }
.status-text.completed { color: var(--tp-success); }
.status-text.closed { color: var(--tp-danger); }

/* 进度 */
.progress-cell { display: flex; align-items: center; gap: 8px; padding: 0 8px; }
:deep(.progress-cell .el-progress-bar__outer) { background: var(--tp-gray-200) !important; }
.progress-num { font-size: 12px; color: var(--tp-gray-500); white-space: nowrap; font-weight: 600; }
.progress-sep { color: var(--tp-gray-300); margin: 0 1px; font-weight: 400; }

/* 通过率 */
.rate-chip {
  display: inline-block; padding: 2px 8px; border-radius: var(--tp-radius-sm);
  font-size: 12px; font-weight: 700; background: var(--tp-info-light); color: var(--tp-info);
}
.rate-chip.high { background: var(--tp-success-light); color: var(--tp-success); }
.rate-chip.low { background: var(--tp-danger-light); color: var(--tp-danger); }

.date-text { font-size: 12px; color: var(--tp-gray-400); }

/* 操作按钮 */
.action-btns { display: flex; gap: 6px; justify-content: center; }
.act-btn {
  width: 30px; height: 30px; border-radius: var(--tp-radius-sm); border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: all var(--tp-transition);
}
.act-btn .material-symbols-outlined { font-size: 17px; }
.act-btn.copy { background: var(--tp-primary-lighter); color: var(--tp-primary-light); }
.act-btn.copy:hover { background: rgba(124,58,237,.25); }
.act-btn.close { background: var(--tp-warning-light); color: var(--tp-warning); }
.act-btn.close:hover { background: rgba(245,158,11,.25); }
.act-btn.delete { background: var(--tp-danger-light); color: var(--tp-danger); }
.act-btn.delete:hover { background: rgba(239,68,68,.25); }

/* 分页 */
.pagination-bar { display: flex; justify-content: flex-end; padding: 12px 16px; }

/* ══ 空状态 ══ */
.empty-state {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: var(--tp-surface-card); border-radius: var(--tp-radius-lg);
  border: 1px solid var(--tp-gray-200);
  padding: 60px 20px;
}
.empty-illustration { position: relative; width: 120px; height: 120px; margin-bottom: 24px; }
.empty-icon {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
  font-size: 56px; color: var(--tp-primary-light); z-index: 2; opacity: .6;
}
.empty-rings { position: absolute; inset: 0; }
.ring {
  position: absolute; border: 2px solid rgba(124,58,237,.12); border-radius: 50%;
  animation: ringPulse 3s ease-in-out infinite;
}
.ring-1 { inset: 10px; animation-delay: 0s; }
.ring-2 { inset: 0; animation-delay: .5s; }
.ring-3 { inset: -10px; animation-delay: 1s; border-color: rgba(124,58,237,.06); }
@keyframes ringPulse {
  0%,100% { transform: scale(1); opacity: .6; }
  50% { transform: scale(1.06); opacity: 1; }
}
.empty-title { font-size: 18px; font-weight: 700; color: var(--tp-gray-900); margin: 0 0 8px; }
.empty-desc { font-size: 14px; color: var(--tp-gray-500); margin: 0 0 28px; text-align: center; max-width: 340px; line-height: 1.6; }
.empty-create-btn {
  display: flex; align-items: center; border-radius: var(--tp-radius-md); font-weight: 600;
  background: var(--tp-primary); border: none; color: #fff;
  padding: 12px 28px; font-size: 15px;
}
.empty-create-btn:hover { background: var(--tp-primary-dark); box-shadow: var(--tp-shadow-glow); }

/* ══ 表单 ══ */
.form-hint {
  font-size: 12px; color: var(--tp-gray-400); margin-top: 6px;
  display: flex; align-items: center;
}
.mode-option { display: inline-flex; align-items: center; gap: 5px; }

/* ══ 详情抽屉 ══ */
.review-detail { padding: 8px; }
.detail-header { display: flex; gap: 8px; margin-bottom: 24px; }
.detail-stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
.stat-card {
  text-align: center; padding: 16px 8px; background: var(--tp-surface-elevated);
  border-radius: var(--tp-radius-md); transition: transform .2s;
  border: 1px solid var(--tp-gray-200);
}
.stat-card:hover { transform: translateY(-2px); }
.stat-card.approved .stat-value { color: var(--tp-success); }
.stat-card.rejected .stat-value { color: var(--tp-danger); }
.stat-card.pending .stat-value { color: var(--tp-warning); }
.stat-value { font-size: 24px; font-weight: 700; color: var(--tp-gray-900); line-height: 1.2; }
.stat-label { font-size: 12px; color: var(--tp-gray-500); margin-top: 4px; }
.detail-desc { margin-bottom: 20px; }
.detail-desc h4 { font-size: 14px; font-weight: 600; margin: 0 0 8px; color: var(--tp-gray-900); }
.detail-desc p { font-size: 13px; color: var(--tp-gray-700); line-height: 1.6; margin: 0; }
.detail-meta {
  font-size: 12px; color: var(--tp-gray-500);
  display: flex; flex-direction: column; gap: 4px;
  padding-top: 16px; border-top: 1px solid var(--tp-gray-200);
}
</style>


