<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '../stores/project'
import { listUsersLookup } from '../api/user'
import {
  createReview,
  linkItems,
  type CreateReviewPayload,
  type LinkItemEntry,
} from '../api/caseReview'
import { getProjectSettings, updateProjectSettings } from '../api/caseReviewV02'
import { listTestCases } from '../api/testcase'
import type { TestCase } from '../api/types'
import { extractErrorMessage } from '../utils/error'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const projectId = computed(() => projectStore.selectedProjectId)

// ── Steps ──
const currentStep = ref(1)
const steps = [
  { num: 1, label: '基础信息', icon: 'info' },
  { num: 2, label: '选择用例', icon: 'zoom_out' },
  { num: 3, label: '指派评审人', icon: 'group' },
  { num: 4, label: '确认激活', icon: 'task_alt' },
]

function goStep(n: number) {
  if (n < 1 || n > 4) return
  currentStep.value = n
}
function nextStep() {
  if (currentStep.value === 1 && !form.name.trim()) {
    ElMessage.warning('请填写计划名称')
    return
  }
  if (currentStep.value < 4) currentStep.value++
}
function prevStep() {
  if (currentStep.value > 1) currentStep.value--
}

// ── Step 1: 基础信息 ──
const form = reactive({
  name: '',
  description: '',
  review_mode: 'single' as 'single' | 'parallel',
})

// ── Step 2: 选择用例 ──
const cases = ref<TestCase[]>([])
const casesTotal = ref(0)
const casesPage = ref(1)
const casesPageSize = ref(10)
const casesLoading = ref(false)
const casesSearch = ref('')
const selectedCaseIds = ref<Set<number>>(new Set())

async function fetchCases() {
  if (!projectId.value) return
  casesLoading.value = true
  try {
    const resp = await listTestCases(projectId.value!, {
      page: casesPage.value,
      pageSize: casesPageSize.value,
      keyword: casesSearch.value || undefined,
    })
    cases.value = resp?.items || []
    casesTotal.value = resp?.total || 0
  } catch {
    cases.value = []
  } finally {
    casesLoading.value = false
  }
}
function toggleCase(id: number) {
  if (selectedCaseIds.value.has(id)) {
    selectedCaseIds.value.delete(id)
  } else {
    selectedCaseIds.value.add(id)
  }
}
function selectAllPage() {
  cases.value.forEach((c) => selectedCaseIds.value.add(c.id))
}
function clearSelection() {
  selectedCaseIds.value.clear()
}
function casesGoPage(p: number) {
  casesPage.value = p
  fetchCases()
}

// ── Step 3: 指派评审人 ──
const allUsers = ref<{ id: number; name: string; email: string; avatar?: string }[]>([])
const assignedUserIds = ref<Set<number>>(new Set())
/** v0.2：主评人（唯一），必选；其余被指派的人均为 Shadow */
const primaryReviewerId = ref<number | null>(null)
/** v0.2：项目级 allow_self_review 开关，决定主评人是否允许等于用例作者 */
const allowSelfReview = ref(false)
const settingsLoading = ref(false)

async function loadUsers() {
  try {
    allUsers.value = await listUsersLookup()
  } catch (e: unknown) {
    allUsers.value = []
    ElMessage.warning(extractErrorMessage(e, '加载用户列表失败'))
  }
}

/** 加入 / 移出指派列表；首个加入者自动成为 Primary，保持始终有 Primary */
function toggleUser(id: number) {
  if (assignedUserIds.value.has(id)) {
    removeUser(id)
    return
  }
  assignedUserIds.value.add(id)
  if (primaryReviewerId.value === null) primaryReviewerId.value = id
}

/** 移除指派：如果被移除的是 Primary，自动切到剩余第一个评审人 */
function removeUser(id: number) {
  assignedUserIds.value.delete(id)
  if (primaryReviewerId.value === id) {
    const next = Array.from(assignedUserIds.value)[0]
    primaryReviewerId.value = next ?? null
  }
}

/** 将某个已指派用户提升为主评人 */
function setPrimary(id: number) {
  if (!assignedUserIds.value.has(id)) return
  primaryReviewerId.value = id
}

const assignedUsers = computed(() => allUsers.value.filter((u) => assignedUserIds.value.has(u.id)))
const availableUsers = computed(() =>
  allUsers.value.filter((u) => !assignedUserIds.value.has(u.id)),
)
const primaryReviewerName = computed(() => {
  const uid = primaryReviewerId.value
  if (uid === null) return ''
  return allUsers.value.find((u) => u.id === uid)?.name ?? `#${uid}`
})

/** 加载项目级 allow_self_review 开关（影响 UI 的"允许自审"复选框初值） */
async function loadSettings() {
  if (!projectId.value) return
  try {
    const s = await getProjectSettings(projectId.value)
    allowSelfReview.value = !!s.allow_self_review
  } catch {
    /* 静默：用默认值 false */
  }
}

/** 勾选 / 取消"允许自审"：实时同步到后端，后续接口即刻生效 */
async function onToggleAllowSelfReview(val: boolean) {
  if (!projectId.value) return
  settingsLoading.value = true
  try {
    const s = await updateProjectSettings(projectId.value, { allow_self_review: val })
    allowSelfReview.value = !!s.allow_self_review
    ElMessage.success(val ? '已允许自审' : '已禁止自审')
  } catch (e) {
    // 回滚 UI
    allowSelfReview.value = !val
    ElMessage.error(extractErrorMessage(e, '保存项目设置失败'))
  } finally {
    settingsLoading.value = false
  }
}

// ── Step 4: 确认 & 提交 ──
const submitting = ref(false)

const qualityChecks = computed(() => [
  {
    label: '基础信息已填写',
    desc: form.name ? `计划名称: ${form.name}` : '未填写计划名称',
    ok: !!form.name.trim(),
    step: 1, // 失败时跳回第 1 步
    errorTip: '请填写计划名称',
  },
  {
    label: '用例关联完整',
    desc: `${selectedCaseIds.value.size} 条测试用例已选择`,
    ok: selectedCaseIds.value.size > 0,
    step: 2,
    errorTip: '请至少选择一条用例加入评审',
  },
  {
    label: '评审人员已就绪',
    desc: `已指派 ${assignedUserIds.value.size} 名评审人`,
    ok: assignedUserIds.value.size > 0,
    step: 3,
    errorTip: '请至少指派一名评审人',
  },
  {
    label: '主评人已指定',
    desc: primaryReviewerName.value ? `主评人：${primaryReviewerName.value}` : '未指定主评人',
    ok: primaryReviewerId.value !== null,
    step: 3,
    errorTip: '请在已指派评审人中指定一名主评人',
  },
])

/** 所有自检项是否全部通过 */
const allChecksPassed = computed(() => qualityChecks.value.every((c) => c.ok))

async function handleActivate() {
  // 提交前前端校验：任何一项自检未通过，跳回对应步骤并提示
  const failed = qualityChecks.value.find((c) => !c.ok)
  if (failed) {
    ElMessage.warning(failed.errorTip)
    currentStep.value = failed.step
    return
  }

  submitting.value = true
  try {
    const primaryId = primaryReviewerId.value as number
    const selectedReviewerIds = Array.from(assignedUserIds.value)
    const shadowIds = selectedReviewerIds.filter((id) => id !== primaryId)
    const allReviewers = [primaryId, ...shadowIds]
    const payload: CreateReviewPayload = {
      name: form.name,
      description: form.description,
      review_mode: form.review_mode,
      default_reviewer_ids: allReviewers,
      default_primary_reviewer_id: primaryId,
      default_shadow_reviewer_ids: shadowIds,
    }
    const review = await createReview(projectId.value!, payload)
    // 关联用例：显式指定主评人 + 陪审
    if (selectedCaseIds.value.size > 0 && review?.id) {
      const entries: LinkItemEntry[] = Array.from(selectedCaseIds.value).map((id) => ({
        testcase_id: id,
        primary_reviewer_id: primaryId,
        shadow_reviewer_ids: shadowIds,
      }))
      await linkItems(projectId.value!, review.id, entries)
    }
    ElMessage.success('评审计划已创建并激活')
    router.push('/case-reviews')
  } catch (e) {
    ElMessage.error(extractErrorMessage(e, '创建评审计划失败'))
  } finally {
    submitting.value = false
  }
}

// ── Helpers ──
function getInitials(name: string) {
  if (!name) return '?'
  return name.slice(0, 2).toUpperCase()
}

/** 根据头像字段或用户名生成头像 URL */
function resolveAvatarUrl(avatar?: string, _fallbackName?: string) {
  const avatarRaw = (avatar || '').trim()
  if (avatarRaw) {
    if (/^https?:\/\//i.test(avatarRaw)) return avatarRaw
    const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
    if (envBase && /^https?:\/\//i.test(envBase)) {
      const origin = envBase.replace(/\/api\/v1\/?$/, '')
      return `${origin}${avatarRaw.startsWith('/') ? '' : '/'}${avatarRaw}`
    }
    // 默认返回相对路径：dev 下 /uploads 走 Vite proxy，生产由反向代理处理
    return `${avatarRaw.startsWith('/') ? '' : '/'}${avatarRaw}`
  }
  return ''
}

const casesTotalPages = computed(() =>
  Math.max(1, Math.ceil(casesTotal.value / casesPageSize.value)),
)

/** 从 route query 解析预选用例 ID（兼容逗号分隔和数组形式） */
function parsePreselectedIds(): number[] {
  const raw = route.query.testcaseIds
  const parts = Array.isArray(raw)
    ? raw.flatMap((v) => String(v).split(','))
    : raw
      ? String(raw).split(',')
      : []
  return parts.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0)
}

onMounted(async () => {
  loadUsers()
  loadSettings()
  await fetchCases()
  // 若 URL 带 ?testcaseIds=1,2,3 则自动预选
  const preIds = parsePreselectedIds()
  if (preIds.length > 0) {
    preIds.forEach((id) => selectedCaseIds.value.add(id))
  }
})
</script>

<template>
  <div class="wizard-page">
    <!-- ─── 顶部标题 + 步骤条 ─── -->
    <div class="wizard-header">
      <div class="wizard-title-area">
        <h1 class="wizard-title">创建评审计划</h1>
        <p class="wizard-subtitle">为当前项目编排质量审计工作流</p>
      </div>

      <!-- Stepper -->
      <div class="stepper">
        <div class="stepper-line"></div>
        <div
          class="stepper-line-active"
          :style="{ width: ((currentStep - 1) / 3) * 100 + '%' }"
        ></div>
        <div
          v-for="step in steps"
          :key="step.num"
          class="step-item"
          :class="{ active: step.num === currentStep, done: step.num < currentStep }"
          @click="goStep(step.num)"
        >
          <div class="step-circle">
            <span v-if="step.num < currentStep" class="material-symbols-outlined step-check">
              check
            </span>
            <span v-else>{{ step.num }}</span>
          </div>
          <span class="step-label">{{ step.label }}</span>
        </div>
      </div>
    </div>

    <!-- ─── 步骤内容区 ─── -->
    <div class="wizard-content">
      <!-- ════ Step 1: 基础信息 ════ -->
      <div v-if="currentStep === 1" class="step-body">
        <div class="step-grid">
          <!-- 左：表单 -->
          <div class="step-main">
            <div class="card-glass">
              <h2 class="card-title-primary">步骤 1：评审基础定义</h2>
              <div class="form-group">
                <label class="form-label">计划标识</label>
                <input v-model="form.name" class="form-input" placeholder="例如：Q3 安全加固专项" />
              </div>
              <div class="form-group">
                <label class="form-label">战略目标</label>
                <textarea
                  v-model="form.description"
                  class="form-textarea"
                  placeholder="定义本轮评审的核心重点..."
                  rows="4"
                ></textarea>
              </div>
              <div class="form-group">
                <label class="form-label">评审模式</label>
                <div class="mode-radio-group">
                  <label class="mode-radio" :class="{ selected: form.review_mode === 'single' }">
                    <input v-model="form.review_mode" type="radio" value="single" class="sr-only" />
                    <span class="material-symbols-outlined" style="font-size: 16px">person</span>
                    独审模式
                  </label>
                  <label class="mode-radio" :class="{ selected: form.review_mode === 'parallel' }">
                    <input
                      v-model="form.review_mode"
                      type="radio"
                      value="parallel"
                      class="sr-only"
                    />
                    <span class="material-symbols-outlined" style="font-size: 16px">group</span>
                    会签模式
                  </label>
                </div>
              </div>
            </div>
          </div>
          <!-- 右：评审人预览 -->
          <div class="step-side">
            <div class="card-surface">
              <div class="card-bg-icon"><span class="material-symbols-outlined">groups</span></div>
              <h2 class="card-title">评审资源预览</h2>
              <p class="card-desc">展示当前项目可参与评审的团队成员</p>
              <div class="reviewer-list">
                <div v-for="user in allUsers.slice(0, 5)" :key="user.id" class="reviewer-card-mini">
                  <div class="reviewer-card-mini-left">
                    <div class="reviewer-avatar">
                      <img
                        v-if="resolveAvatarUrl(user.avatar)"
                        :src="resolveAvatarUrl(user.avatar)"
                        class="avatar-img"
                      />
                      <span v-else>{{ getInitials(user.name) }}</span>
                    </div>
                    <div>
                      <p class="reviewer-name-mini">{{ user.name }}</p>
                      <p class="reviewer-role-mini">{{ user.email }}</p>
                    </div>
                  </div>
                </div>
                <div v-if="allUsers.length === 0" class="empty-hint">暂无可用评审人</div>
              </div>
              <!-- 底部容量进度条 -->
              <div class="capacity-section">
                <div class="capacity-header">
                  <span class="capacity-label">可参与人员</span>
                  <span class="capacity-pct">{{ allUsers.length }} 人</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ════ Step 2: 选择用例 ════ -->
      <div v-if="currentStep === 2" class="step-body">
        <!-- 筛选栏 -->
        <div class="card-glass filter-bar">
          <div class="filter-bar-inner">
            <div class="search-box-wz">
              <span class="material-symbols-outlined search-icon-wz">search</span>
              <input
                v-model="casesSearch"
                class="search-input-wz"
                placeholder="搜索用例 ID 或标题..."
                @keyup.enter="fetchCases"
              />
            </div>
            <div class="filter-btns">
              <button class="filter-btn">所有模块</button>
              <button class="filter-btn">所有优先级</button>
              <button class="filter-btn">所有状态</button>
              <button class="filter-btn icon-btn" @click="fetchCases">
                <span class="material-symbols-outlined" style="font-size: 14px">filter_alt</span>
                筛选
              </button>
            </div>
          </div>
        </div>
        <!-- 选中状态 -->
        <div class="selection-bar">
          <div class="selection-left">
            <span class="selection-count">已选择 {{ selectedCaseIds.size }} 个测试用例</span>
            <button class="selection-action" @click="selectAllPage">全选当前页</button>
            <button class="selection-action danger" @click="clearSelection">清除选择</button>
          </div>
          <span class="selection-range">
            显示范围: {{ (casesPage - 1) * casesPageSize + 1 }}-{{
              Math.min(casesPage * casesPageSize, casesTotal)
            }}
            / {{ casesTotal }}
          </span>
        </div>
        <!-- 表格 -->
        <div class="card-glass table-wrap">
          <table class="wz-table">
            <thead>
              <tr>
                <th class="th-check"></th>
                <th>ID</th>
                <th>用例标题</th>
                <th>模块</th>
                <th>优先级</th>
                <th>状态</th>
                <th class="th-right">更新时间</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="tc in cases"
                :key="tc.id"
                class="wz-row"
                :class="{ selected: selectedCaseIds.has(tc.id) }"
                @click="toggleCase(tc.id)"
              >
                <td class="td-check">
                  <div class="custom-check" :class="{ checked: selectedCaseIds.has(tc.id) }">
                    <span
                      v-if="selectedCaseIds.has(tc.id)"
                      class="material-symbols-outlined"
                      style="font-size: 14px"
                    >
                      check
                    </span>
                  </div>
                </td>
                <td class="td-id">TC-{{ tc.id }}</td>
                <td class="td-title">{{ tc.title }}</td>
                <td class="td-module">
                  <span class="module-tag">
                    {{ (tc.module_path || '未分类').split('/').pop() }}
                  </span>
                </td>
                <td>
                  <span class="priority-tag" :class="(tc.level || 'P2').toLowerCase()">
                    {{ tc.level || 'P2' }}
                  </span>
                </td>
                <td>
                  <span class="status-dot" :class="tc.status || 'draft'"></span>
                  <span class="status-text">
                    {{
                      tc.status === 'active'
                        ? '已生效'
                        : tc.status === 'pending'
                          ? '待评审'
                          : tc.status === 'discarded'
                            ? '已废弃'
                            : '草稿'
                    }}
                  </span>
                </td>
                <td class="td-date">{{ tc.updated_at?.slice(0, 10) || '—' }}</td>
              </tr>
              <tr v-if="cases.length === 0 && !casesLoading">
                <td colspan="7" class="td-empty">暂无用例数据</td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- 分页 -->
        <div v-if="casesTotal > 0" class="wz-pagination">
          <button
            class="page-btn-wz"
            :disabled="casesPage <= 1"
            @click="casesGoPage(casesPage - 1)"
          >
            <span class="material-symbols-outlined">chevron_left</span>
          </button>
          <button
            v-for="p in Math.min(casesTotalPages, 5)"
            :key="p"
            class="page-btn-wz"
            :class="{ active: p === casesPage }"
            @click="casesGoPage(p)"
          >
            {{ p }}
          </button>
          <button
            class="page-btn-wz"
            :disabled="casesPage >= casesTotalPages"
            @click="casesGoPage(casesPage + 1)"
          >
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      </div>

      <!-- ════ Step 3: 指派评审人 ════ -->
      <div v-if="currentStep === 3" class="step-body">
        <div class="step-grid">
          <!-- 左：可选人员 -->
          <div class="step-main">
            <div class="step3-header">
              <div>
                <h2 class="step3-title">指派评审人</h2>
                <p class="step3-sub">请根据负载情况为当前评审任务分配最合适的团队成员。</p>
              </div>
            </div>
            <div class="reviewer-grid">
              <div
                v-for="user in availableUsers"
                :key="user.id"
                class="reviewer-card"
                @click="toggleUser(user.id)"
              >
                <div class="reviewer-card-top">
                  <div class="reviewer-avatar-lg">
                    <img
                      v-if="resolveAvatarUrl(user.avatar)"
                      :src="resolveAvatarUrl(user.avatar)"
                      class="avatar-img"
                    />
                    <span v-else>{{ getInitials(user.name) }}</span>
                  </div>
                  <div class="reviewer-card-info">
                    <h3 class="reviewer-card-name">{{ user.name }}</h3>
                    <p class="reviewer-card-role">{{ user.email }}</p>
                  </div>
                </div>
                <div class="load-bar-wrap">
                  <div class="load-bar-labels">
                    <span>当前工作负载</span>
                    <span class="load-pct low">空闲</span>
                  </div>
                  <div class="load-bar-track">
                    <div class="load-bar-fill low" style="width: 20%"></div>
                  </div>
                </div>
              </div>
              <div v-if="availableUsers.length === 0" class="empty-hint">所有人员已指派</div>
            </div>
          </div>
          <!-- 右：已指派 -->
          <div class="step-side">
            <div class="assigned-panel">
              <div class="assigned-header">
                <div>
                  <h3 class="assigned-title">已指派人员</h3>
                  <p class="assigned-sub">
                    {{ assignedUsers.length }} 名评审人已就绪 · 主评人：
                    <strong>{{ primaryReviewerName || '未指定' }}</strong>
                  </p>
                </div>
                <label class="self-review-toggle" :title="settingsLoading ? '保存中…' : ''">
                  <input
                    type="checkbox"
                    :checked="allowSelfReview"
                    :disabled="settingsLoading"
                    @change="onToggleAllowSelfReview(($event.target as HTMLInputElement).checked)"
                  />
                  <span>允许主评人是用例作者</span>
                </label>
              </div>
              <div class="assigned-list">
                <div
                  v-for="user in assignedUsers"
                  :key="user.id"
                  class="assigned-item"
                  :class="{ 'is-primary': primaryReviewerId === user.id }"
                >
                  <div class="assigned-item-left">
                    <div class="reviewer-avatar-sm">
                      <img
                        v-if="resolveAvatarUrl(user.avatar)"
                        :src="resolveAvatarUrl(user.avatar)"
                        class="avatar-img"
                      />
                      <span v-else>{{ getInitials(user.name) }}</span>
                    </div>
                    <div>
                      <p class="assigned-name">
                        {{ user.name }}
                        <span v-if="primaryReviewerId === user.id" class="primary-badge">
                          主评人
                        </span>
                        <span v-else class="shadow-badge">陪审</span>
                      </p>
                      <p class="assigned-role">{{ user.email }}</p>
                    </div>
                  </div>
                  <div class="assigned-item-actions">
                    <button
                      v-if="primaryReviewerId !== user.id"
                      type="button"
                      class="set-primary-btn"
                      @click="setPrimary(user.id)"
                    >
                      设为主评人
                    </button>
                    <button type="button" class="remove-btn" @click="removeUser(user.id)">
                      <span class="material-symbols-outlined" style="font-size: 14px">close</span>
                    </button>
                  </div>
                </div>
                <!-- 拖拽占位 -->
                <div class="drop-placeholder">
                  <span class="material-symbols-outlined" style="font-size: 28px">add_circle</span>
                  <span>点击左侧人员卡片添加</span>
                </div>
              </div>
              <div class="assigned-footer">
                <div class="assigned-stat">
                  <span>已指派人数:</span>
                  <span class="stat-bold">{{ assignedUsers.length }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ════ Step 4: 确认 & 激活 ════ -->
      <div v-if="currentStep === 4" class="step-body">
        <div class="step-grid">
          <!-- 左：摘要 -->
          <div class="step-main">
            <div class="summary-card">
              <div class="summary-card-bg">
                <span class="material-symbols-outlined">dashboard_customize</span>
              </div>
              <div class="summary-grid">
                <div>
                  <label class="summary-label">计划名称</label>
                  <p class="summary-value-primary">{{ form.name || '—' }}</p>
                  <div class="summary-meta">
                    <div>
                      <label class="summary-label">评审模式</label>
                      <p class="summary-value">
                        {{ form.review_mode === 'single' ? '独审模式' : '会签模式' }}
                      </p>
                    </div>
                    <div>
                      <label class="summary-label">描述</label>
                      <p class="summary-value">{{ form.description || '—' }}</p>
                    </div>
                  </div>
                </div>
                <div class="summary-stats">
                  <div class="summary-stat-item">
                    <label class="summary-label">用例总数</label>
                    <p class="summary-big-num">{{ selectedCaseIds.size }}</p>
                  </div>
                  <div class="summary-stat-item">
                    <label class="summary-label">评审人数</label>
                    <p class="summary-big-num">{{ assignedUserIds.size }}</p>
                  </div>
                  <div class="summary-avatars">
                    <div v-for="u in assignedUsers.slice(0, 4)" :key="u.id" class="summary-avatar">
                      {{ getInitials(u.name) }}
                    </div>
                    <span v-if="assignedUsers.length > 4" class="summary-avatar more">
                      +{{ assignedUsers.length - 4 }}
                    </span>
                    <span class="summary-avatar-label">已指派评审人员</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- 右：质量自检 -->
          <div class="step-side">
            <div class="checklist-panel">
              <h3 class="checklist-title">
                计划质量自检
                <span class="checklist-badge">自动核验中</span>
              </h3>
              <ul class="checklist-items">
                <li
                  v-for="(check, i) in qualityChecks"
                  :key="i"
                  class="checklist-item"
                  :class="{ ok: check.ok }"
                >
                  <span class="material-symbols-outlined check-icon" :class="{ filled: check.ok }">
                    {{ check.ok ? 'check_circle' : 'radio_button_unchecked' }}
                  </span>
                  <div>
                    <p class="check-label">{{ check.label }}</p>
                    <p class="check-desc">{{ check.desc }}</p>
                  </div>
                </li>
              </ul>
            </div>
            <!-- 提示 -->
            <div class="activate-hint">
              <p>
                "一旦激活，评审计划将正式进入执行阶段。所有参与者将收到通知并可开始进行用例评审。"
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── 底部操作栏 ─── -->
    <div class="wizard-footer">
      <div class="footer-left">
        <button v-if="currentStep > 1" class="footer-btn outline" @click="prevStep">
          <span class="material-symbols-outlined" style="font-size: 18px">arrow_back</span>
          上一步
        </button>
      </div>
      <div class="footer-right">
        <button class="footer-btn outline" @click="router.push('/case-reviews')">取消</button>
        <button v-if="currentStep < 4" class="footer-btn primary" @click="nextStep">
          下一步
          <span class="material-symbols-outlined" style="font-size: 18px">arrow_forward</span>
        </button>
        <button
          v-else
          class="footer-btn primary activate"
          :class="{ 'not-ready': !allChecksPassed }"
          :disabled="submitting"
          :title="allChecksPassed ? '' : '还有自检项未通过，点击后将自动跳转到对应步骤'"
          @click="handleActivate"
        >
          <span class="material-symbols-outlined" style="font-size: 18px">bolt</span>
          {{ submitting ? '创建中...' : '激活评审' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ══════════════════════════════════════════════════
   创建评审向导 — Pipeline 暗色主题
   ══════════════════════════════════════════════════ */

.wizard-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0 28px;
  overflow-y: auto;
}

/* ── 标题 + 步骤条 ── */
.wizard-header {
  margin-bottom: 32px;
}
.wizard-title-area {
  margin-bottom: 28px;
}
.wizard-title {
  font-size: 28px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 6px;
  letter-spacing: -0.02em;
}
.wizard-subtitle {
  font-size: 14px;
  color: var(--tp-gray-400, #958da1);
  margin: 0;
  font-weight: 300;
}

/* 步骤条 */
.stepper {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  position: relative;
  padding: 0 40px;
}
.stepper-line {
  position: absolute;
  top: 20px;
  left: 60px;
  right: 60px;
  height: 2px;
  background: var(--tp-gray-700, #272935);
  z-index: 0;
}
.stepper-line-active {
  position: absolute;
  top: 20px;
  left: 60px;
  height: 2px;
  background: linear-gradient(90deg, var(--tp-primary, #7c3aed), var(--tp-info, #0566d9));
  z-index: 1;
  transition: width 0.4s ease;
}
.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 2;
  cursor: pointer;
}
.step-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--tp-surface-card, #1d1f2b);
  border: 1px solid rgba(74, 68, 85, 0.2);
  color: var(--tp-gray-400, #958da1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  transition: all 0.3s;
}
.step-item.active .step-circle {
  background: var(--tp-primary, #7c3aed);
  color: #fff;
  border: none;
  box-shadow: 0 0 15px rgba(124, 58, 237, 0.4);
}
.step-item.done .step-circle {
  background: var(--tp-info, #0566d9);
  color: #fff;
  border: none;
}
.step-check {
  font-size: 18px;
}
.step-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 500;
  color: var(--tp-gray-400, #958da1);
}
.step-item.active .step-label {
  color: var(--tp-primary-light, #d2bbff);
  font-weight: 600;
}
.step-item.done .step-label {
  color: var(--tp-info, #adc6ff);
}

/* ── 内容区 ── */
.wizard-content {
  flex: 1;
  padding-bottom: 100px;
}
.step-body {
  animation: fadeIn 0.3s ease;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.step-grid {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 24px;
}
.step-main {
  min-width: 0;
}
.step-side {
  min-width: 0;
}

/* ── 通用卡片 ── */
.card-glass {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 32px;
}
.card-surface {
  background: var(--tp-surface-card, #1d1f2b);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 32px;
  position: relative;
  overflow: hidden;
  height: 100%;
}
.card-bg-icon {
  position: absolute;
  top: 0;
  right: 0;
  padding: 16px;
  opacity: 0.06;
}
.card-bg-icon .material-symbols-outlined {
  font-size: 96px;
}
.card-title-primary {
  font-size: 18px;
  font-weight: 600;
  color: var(--tp-primary-light, #d2bbff);
  margin: 0 0 24px;
  letter-spacing: -0.01em;
}
.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 4px;
}
.card-desc {
  font-size: 12px;
  color: var(--tp-gray-400, #958da1);
  margin: 0 0 24px;
  font-weight: 300;
}

/* ── 表单 ── */
.form-group {
  margin-bottom: 20px;
}
.form-label {
  display: block;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--tp-gray-400, #958da1);
  margin-bottom: 8px;
  font-weight: 600;
}
.form-input,
.form-textarea {
  width: 100%;
  background: var(--tp-surface-card, #131317);
  border: none;
  border-radius: 8px;
  padding: 14px 16px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: box-shadow 0.2s;
}
.form-input:focus,
.form-textarea:focus {
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.4);
}
.form-input::placeholder,
.form-textarea::placeholder {
  color: rgba(149, 141, 161, 0.4);
}
.form-textarea {
  resize: none;
}

.mode-radio-group {
  display: flex;
  gap: 12px;
}
.mode-radio {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: 8px;
  background: var(--tp-surface-card, #131317);
  border: 1px solid rgba(74, 68, 85, 0.15);
  color: var(--tp-gray-400, #958da1);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.mode-radio.selected {
  border-color: var(--tp-primary, #7c3aed);
  color: var(--tp-primary-light, #d2bbff);
  background: rgba(124, 58, 237, 0.1);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

/* ── 评审人预览（Step1右侧） ── */
.reviewer-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.reviewer-card-mini {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  background: var(--tp-surface-elevated, #272935);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition: all 0.2s;
}
.reviewer-card-mini:hover {
  border-color: rgba(124, 58, 237, 0.3);
  background: rgba(255, 255, 255, 0.03);
}
.reviewer-card-mini-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.reviewer-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--tp-primary, #7c3aed), var(--tp-info, #0566d9));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.reviewer-name-mini {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}
.avatar-img {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}
.reviewer-role-mini {
  font-size: 10px;
  color: var(--tp-gray-400, #958da1);
  margin: 3px 0 0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
/* 底部容量条 */
.capacity-section {
  margin-top: 28px;
  padding-top: 24px;
  border-top: 1px solid rgba(74, 68, 85, 0.1);
}
.capacity-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}
.capacity-label {
  font-size: 12px;
  color: var(--tp-gray-400, #958da1);
  font-weight: 300;
}
.capacity-pct {
  font-size: 12px;
  font-weight: 600;
  color: var(--tp-primary-light, #d2bbff);
}
.empty-hint {
  text-align: center;
  padding: 24px;
  color: var(--tp-gray-400, #958da1);
  font-size: 13px;
}

/* ── Step 2: 用例选择 ── */
.filter-bar {
  margin-bottom: 16px;
  padding: 16px 24px;
}
.filter-bar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.filter-btns {
  display: flex;
  gap: 8px;
  align-items: center;
}
.filter-btn {
  padding: 7px 16px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent;
  color: var(--tp-gray-300, #ccc3d8);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.filter-btn:hover {
  border-color: rgba(124, 58, 237, 0.3);
  color: #fff;
}
.filter-btn.icon-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--tp-primary, #7c3aed);
  border-color: transparent;
  color: #fff;
}
.filter-btn.icon-btn:hover {
  opacity: 0.9;
}

/* 模块标签 */
.td-module {
  white-space: nowrap;
}
.module-tag {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(124, 58, 237, 0.1);
  color: var(--tp-primary-light, #a78bfa);
}
/* 状态 */
.status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}
.status-dot.active {
  background: #10b981;
}
.status-dot.pending {
  background: #f59e0b;
}
.status-dot.draft {
  background: #6c757d;
}
.status-dot.discarded {
  background: #ef4444;
}
.status-text {
  font-size: 12px;
  color: var(--tp-gray-300, #ccc3d8);
}
.search-box-wz {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--tp-surface-card, #131317);
  border: 1px solid rgba(74, 68, 85, 0.2);
  border-radius: 8px;
  padding: 6px 12px;
  max-width: 400px;
}
.search-icon-wz {
  font-size: 18px;
  color: var(--tp-gray-400, #958da1);
}
.search-input-wz {
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  font-size: 13px;
  flex: 1;
}
.search-input-wz::placeholder {
  color: var(--tp-gray-500, #605770);
}

.selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(5, 102, 217, 0.08);
  border: 1px solid rgba(173, 198, 255, 0.15);
  border-radius: 8px;
  padding: 10px 20px;
  margin-bottom: 16px;
}
.selection-left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.selection-count {
  font-size: 13px;
  font-weight: 500;
  color: var(--tp-info, #adc6ff);
}
.selection-action {
  background: none;
  border: none;
  color: var(--tp-info, #adc6ff);
  font-size: 12px;
  cursor: pointer;
}
.selection-action.danger {
  color: var(--tp-danger, #ffb4ab);
}
.selection-range {
  font-size: 12px;
  color: var(--tp-gray-400, #958da1);
}

.table-wrap {
  padding: 0;
  overflow: hidden;
}
.wz-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
.wz-table thead tr {
  background: rgba(255, 255, 255, 0.03);
}
.wz-table th {
  padding: 14px 24px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--tp-gray-400, #958da1);
}
.th-check {
  width: 48px;
}
.th-right {
  text-align: right;
}
.wz-row {
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid rgba(74, 68, 85, 0.05);
}
.wz-row:hover {
  background: rgba(255, 255, 255, 0.02);
}
.wz-row.selected {
  background: rgba(124, 58, 237, 0.06);
  border-left: 2px solid var(--tp-info, #adc6ff);
}
.wz-table td {
  padding: 14px 24px;
}
.td-check {
  width: 48px;
}
.custom-check {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1.5px solid var(--tp-gray-400, #958da1);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.custom-check.checked {
  background: var(--tp-primary, #7c3aed);
  border-color: var(--tp-primary, #7c3aed);
  color: #fff;
}
.td-id {
  font-family: monospace;
  font-size: 12px;
  color: var(--tp-info, #adc6ff);
}
.td-title {
  color: #fff;
  font-size: 13px;
}
.td-date {
  text-align: right;
  font-size: 12px;
  color: var(--tp-gray-400, #958da1);
}
.td-empty {
  text-align: center;
  padding: 40px;
  color: var(--tp-gray-400, #958da1);
  font-size: 13px;
}
.priority-tag {
  font-size: 11px;
  font-weight: 700;
}
.priority-tag.p0 {
  color: #ef4444;
}
.priority-tag.p1 {
  color: #f59e0b;
}
.priority-tag.p2 {
  color: var(--tp-gray-300, #ccc3d8);
}
.priority-tag.p3 {
  color: var(--tp-gray-400, #958da1);
}

.wz-pagination {
  display: flex;
  justify-content: center;
  gap: 6px;
  padding: 16px;
}
.page-btn-wz {
  min-width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: transparent;
  color: var(--tp-gray-200, #e1e1f2);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.page-btn-wz .material-symbols-outlined {
  font-size: 16px;
}
.page-btn-wz:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.05);
}
.page-btn-wz.active {
  background: var(--tp-primary, #7c3aed);
  color: #fff;
  border-color: transparent;
}
.page-btn-wz:disabled {
  opacity: 0.3;
  cursor: default;
}

/* ── Step 3: 指派评审人 ── */
.step3-header {
  margin-bottom: 24px;
}
.step3-title {
  font-size: 22px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 6px;
}
.step3-sub {
  font-size: 14px;
  color: var(--tp-gray-400, #958da1);
  font-weight: 300;
  margin: 0;
}

.reviewer-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.reviewer-card {
  background: var(--tp-surface-card, #1d1f2b);
  border: 1px solid rgba(74, 68, 85, 0.15);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
}
.reviewer-card:hover {
  background: var(--tp-surface-elevated, #272935);
  border-color: rgba(124, 58, 237, 0.3);
}
.reviewer-card-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.reviewer-avatar-lg {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--tp-primary, #7c3aed), var(--tp-info, #0566d9));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.reviewer-card-name {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}
.reviewer-card-role {
  font-size: 11px;
  color: var(--tp-gray-400, #958da1);
  margin: 2px 0 0;
}
.reviewer-card-info {
  flex: 1;
}

.load-bar-wrap {
}
.load-bar-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--tp-gray-400, #958da1);
  margin-bottom: 4px;
}
.load-pct.low {
  color: #34d399;
}
.load-pct.medium {
  color: #f59e0b;
}
.load-pct.high {
  color: var(--tp-danger, #ffb4ab);
}
.load-bar-track {
  height: 4px;
  width: 100%;
  background: var(--tp-gray-700, #323440);
  border-radius: 4px;
  overflow: hidden;
}
.load-bar-fill {
  height: 100%;
  border-radius: 4px;
}
.load-bar-fill.low {
  background: #34d399;
}
.load-bar-fill.medium {
  background: #f59e0b;
}
.load-bar-fill.high {
  background: var(--tp-danger, #ffb4ab);
}

/* 已指派面板 */
.assigned-panel {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(74, 68, 85, 0.15);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.assigned-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.self-review-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(204, 195, 216, 0.75);
  cursor: pointer;
  user-select: none;
}
.self-review-toggle input {
  cursor: pointer;
}
.primary-badge {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(124, 58, 237, 0.15);
  color: #c4b5fd;
  font-size: 10px;
  font-weight: 600;
}
.shadow-badge {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(148, 163, 184, 0.15);
  color: rgba(204, 195, 216, 0.7);
  font-size: 10px;
  font-weight: 600;
}
.assigned-item.is-primary {
  border-color: rgba(124, 58, 237, 0.45);
  background: rgba(124, 58, 237, 0.06);
}
.assigned-item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.set-primary-btn {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid rgba(124, 58, 237, 0.35);
  background: transparent;
  color: #c4b5fd;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.2s;
}
.set-primary-btn:hover {
  background: rgba(124, 58, 237, 0.1);
}
.assigned-title {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}
.assigned-sub {
  font-size: 10px;
  color: var(--tp-gray-400, #958da1);
  margin: 4px 0 0;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.assigned-list {
  padding: 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.assigned-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  border-left: 2px solid var(--tp-primary, #7c3aed);
}
.assigned-item-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.reviewer-avatar-sm {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--tp-primary, #7c3aed), var(--tp-info, #0566d9));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  color: #fff;
}
.assigned-name {
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  margin: 0;
}
.assigned-role {
  font-size: 10px;
  color: var(--tp-gray-400, #958da1);
  margin: 0;
}
.remove-btn {
  background: none;
  border: none;
  color: var(--tp-gray-400, #958da1);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.15s;
}
.assigned-item:hover .remove-btn {
  opacity: 1;
}
.remove-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: var(--tp-danger, #ffb4ab);
}

.drop-placeholder {
  border: 2px dashed rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--tp-gray-400, #958da1);
  font-size: 12px;
  transition: all 0.2s;
}
.drop-placeholder:hover {
  border-color: var(--tp-primary, #7c3aed);
  color: var(--tp-primary-light, #d2bbff);
}
.assigned-footer {
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 0 0 16px 16px;
}
.assigned-stat {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--tp-gray-400, #958da1);
}
.stat-bold {
  color: #fff;
  font-weight: 600;
}

/* ── Step 4: 确认 ── */
.summary-card {
  background: var(--tp-surface-card, #191b26);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 32px;
  position: relative;
  overflow: hidden;
}
.summary-card-bg {
  position: absolute;
  top: 0;
  right: 0;
  padding: 24px;
  opacity: 0.06;
}
.summary-card-bg .material-symbols-outlined {
  font-size: 96px;
}
.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}
.summary-label {
  display: block;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--tp-gray-400, #958da1);
  font-weight: 600;
  margin-bottom: 4px;
}
.summary-value-primary {
  font-size: 18px;
  font-weight: 500;
  color: var(--tp-primary-light, #d2bbff);
  margin: 0 0 20px;
}
.summary-value {
  font-size: 14px;
  color: var(--tp-gray-300, #ccc3d8);
  font-weight: 300;
  margin: 0;
}
.summary-meta {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.summary-stats {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.summary-stat-item {
}
.summary-big-num {
  font-size: 32px;
  font-weight: 700;
  color: var(--tp-info, #adc6ff);
  margin: 0;
}
.summary-avatars {
  display: flex;
  align-items: center;
  gap: 0;
  margin-top: 8px;
}
.summary-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--tp-primary, #7c3aed);
  border: 2px solid var(--tp-surface-card, #191b26);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  margin-left: -8px;
}
.summary-avatar:first-child {
  margin-left: 0;
}
.summary-avatar.more {
  background: var(--tp-gray-700, #323440);
  color: var(--tp-gray-400, #958da1);
}
.summary-avatar-label {
  margin-left: 12px;
  font-size: 11px;
  color: var(--tp-gray-400, #958da1);
}

/* 质量自检 */
.checklist-panel {
  background: var(--tp-surface-card, #191b26);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 24px;
}
.checklist-title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.checklist-badge {
  font-size: 10px;
  background: rgba(210, 187, 255, 0.1);
  color: var(--tp-primary-light, #d2bbff);
  padding: 3px 8px;
  border-radius: 4px;
}
.checklist-items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.checklist-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.checklist-item:not(.ok) {
  opacity: 0.45;
}
.check-icon {
  font-size: 20px;
  color: var(--tp-gray-400, #958da1);
}
.check-icon.filled {
  color: #10b981;
  font-variation-settings: 'FILL' 1;
}
.check-label {
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  margin: 0;
}
.check-desc {
  font-size: 11px;
  color: var(--tp-gray-400, #958da1);
  font-weight: 300;
  margin: 2px 0 0;
}

.activate-hint {
  margin-top: 16px;
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.12), transparent);
  border: 1px solid rgba(210, 187, 255, 0.1);
  border-radius: 12px;
  padding: 20px;
}
.activate-hint p {
  font-size: 12px;
  color: rgba(210, 187, 255, 0.7);
  font-style: italic;
  font-weight: 300;
  line-height: 1.6;
  margin: 0;
}

/* ── 底部操作栏 ── */
.wizard-footer {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  background: var(--tp-surface-base, #11131e);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  margin: 0 -28px;
  padding: 16px 28px;
  z-index: 10;
}
.footer-left,
.footer-right {
  display: flex;
  gap: 12px;
  align-items: center;
}
.footer-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}
.footer-btn.outline {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--tp-gray-300, #ccc3d8);
}
.footer-btn.outline:hover {
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;
}
.footer-btn.primary {
  background: linear-gradient(135deg, var(--tp-primary, #7c3aed), var(--tp-info, #0566d9));
  color: #fff;
  box-shadow: 0 4px 14px rgba(124, 58, 237, 0.25);
}
.footer-btn.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(124, 58, 237, 0.35);
}
.footer-btn.primary:active {
  transform: scale(0.97);
}
.footer-btn.activate {
  background: linear-gradient(135deg, var(--tp-primary, #7c3aed), var(--tp-info, #0566d9));
}
/* 自检未通过时的视觉提示（仍可点击，点击后跳转到对应步骤） */
.footer-btn.activate.not-ready {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.4), rgba(5, 102, 217, 0.4));
  box-shadow: none;
  position: relative;
}
.footer-btn.activate.not-ready::after {
  content: '!';
  position: absolute;
  top: -6px;
  right: -6px;
  width: 16px;
  height: 16px;
  background: #f59e0b;
  color: #fff;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(245, 158, 11, 0.5);
}
.footer-btn:disabled {
  opacity: 0.5;
  cursor: default;
  transform: none !important;
}
</style>
