<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '../stores/project'
import { listUsersLookup } from '../api/user'
import {
  createReview,
  getReview,
  linkItems,
  updateReview,
  type LinkItemEntry,
} from '../api/caseReview'
import { getProjectSettings, updateProjectSettings } from '../api/projectSettings'
import { listTestCases } from '../api/testcase'
import type { TestCase } from '../api/types'
import { extractErrorMessage } from '../utils/error'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const projectId = computed(() => projectStore.selectedProjectId)
const activeReviewId = ref<number | null>(null)
const creatingReview = ref(false)

type ReviewMode = 'single' | 'parallel'

interface CaseReviewCreateDraft {
  version: number
  savedAt: number
  currentStep: number
  form: {
    name: string
    description: string
    review_mode: ReviewMode
  }
  selectedCaseIds: number[]
  assignedUserIds: number[]
  primaryReviewerId: number | null
}

const DRAFT_VERSION = 1
const draftSaveTimer = ref<number | null>(null)
const draftSavingEnabled = ref(false)
const draftSavedAt = ref<number | null>(null)
const draftStorageKey = computed(() =>
  projectId.value && activeReviewId.value
    ? `tp-case-review-create-draft:${projectId.value}:${activeReviewId.value}`
    : '',
)
const draftStatusText = computed(() => {
  if (!activeReviewId.value) return '完成第一步后创建评审任务'
  if (!draftSavedAt.value) return `评审任务 #${activeReviewId.value} 已创建`
  const time = new Date(draftSavedAt.value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `任务 #${activeReviewId.value} 已自动保存 ${time}`
})

// ── Steps ──
const currentStep = ref(1)
const steps = [
  { num: 1, label: '基础信息', icon: 'info' },
  { num: 2, label: '选择用例', icon: 'zoom_out' },
  { num: 3, label: '指派评审人', icon: 'group' },
  { num: 4, label: '确认激活', icon: 'task_alt' },
]

async function goStep(n: number) {
  if (n < 1 || n > 4) return
  if (n > 1 && !activeReviewId.value) {
    const ok = await ensureReviewCreated()
    if (!ok) return
  }
  currentStep.value = n
}
async function nextStep() {
  if (currentStep.value === 1) {
    const ok = await ensureReviewCreated()
    if (!ok) return
    currentStep.value = 2
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
  review_mode: 'single' as ReviewMode,
})

async function ensureReviewCreated() {
  if (!projectId.value) return false
  const name = form.name.trim()
  if (!name) {
    ElMessage.warning('请填写计划名称')
    return false
  }

  creatingReview.value = true
  try {
    form.name = name
    if (activeReviewId.value) {
      await updateReview(projectId.value, activeReviewId.value, {
        name,
        description: form.description,
        review_mode: form.review_mode,
      })
      saveDraftNow()
      return true
    }

    const review = await createReview(projectId.value, {
      name,
      description: form.description,
      review_mode: form.review_mode,
      default_reviewer_ids: [],
    })
    activeReviewId.value = review.id
    await router.replace({
      name: 'CaseReviewCreate',
      query: {
        ...route.query,
        reviewId: undefined,
        draftReviewId: String(review.id),
      },
    })
    saveDraftNow()
    ElMessage.success('评审任务已创建，后续配置将保存到该任务')
    return true
  } catch (e) {
    ElMessage.error(extractErrorMessage(e, '创建评审任务失败'))
    return false
  } finally {
    creatingReview.value = false
  }
}

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
  queueDraftSave()
}
function selectAllPage() {
  cases.value.forEach((c) => selectedCaseIds.value.add(c.id))
  queueDraftSave()
}
function clearSelection() {
  selectedCaseIds.value.clear()
  queueDraftSave()
}
function casesGoPage(p: number) {
  casesPage.value = p
  fetchCases()
}

// ── Step 3: 指派评审人 ──
const allUsers = ref<{ id: number; name: string; email: string; avatar?: string }[]>([])
const failedAvatarUserIds = ref<Set<number>>(new Set())
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
  queueDraftSave()
}

/** 移除指派：如果被移除的是 Primary，自动切到剩余第一个评审人 */
function removeUser(id: number) {
  assignedUserIds.value.delete(id)
  if (primaryReviewerId.value === id) {
    const next = Array.from(assignedUserIds.value)[0]
    primaryReviewerId.value = next ?? null
  }
  queueDraftSave()
}

/** 将某个已指派用户提升为主评人 */
function setPrimary(id: number) {
  if (!assignedUserIds.value.has(id)) return
  primaryReviewerId.value = id
  queueDraftSave()
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
    if (!activeReviewId.value) {
      const ok = await ensureReviewCreated()
      if (!ok) return
    }
    const primaryId = primaryReviewerId.value as number
    const selectedReviewerIds = Array.from(assignedUserIds.value)
    const shadowIds = selectedReviewerIds.filter((id) => id !== primaryId)
    const allReviewers = [primaryId, ...shadowIds]
    await updateReview(projectId.value!, activeReviewId.value!, {
      name: form.name,
      description: form.description,
      review_mode: form.review_mode,
      default_reviewer_ids: allReviewers,
    })
    if (selectedCaseIds.value.size > 0) {
      const entries: LinkItemEntry[] = Array.from(selectedCaseIds.value).map((id) => ({
        testcase_id: id,
        primary_reviewer_id: primaryId,
        shadow_reviewer_ids: shadowIds,
      }))
      await linkItems(projectId.value!, activeReviewId.value!, entries, true)
    }
    ElMessage.success('评审计划已创建并激活')
    clearDraft()
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
function hasUserAvatar(user: { id: number; avatar?: string }) {
  return Boolean(resolveAvatarUrl(user.avatar) && !failedAvatarUserIds.value.has(user.id))
}
function markAvatarFailed(userId: number) {
  failedAvatarUserIds.value = new Set([...failedAvatarUserIds.value, userId])
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

function parseRouteDraftReviewId(): number | null {
  const queryValue = route.query.draftReviewId || route.query.reviewId
  const raw = Array.isArray(queryValue) ? queryValue[0] : queryValue
  const id = Number(raw)
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isReviewMode(value: unknown): value is ReviewMode {
  return value === 'single' || value === 'parallel'
}

async function loadExistingReviewBase(reviewId: number, overrideAll = true) {
  if (!projectId.value) return
  try {
    const review = await getReview(projectId.value, reviewId)
    // 名称和描述始终以后端为准（可能被列表页重命名）
    form.name = review.name
    form.description = review.description || ''
    if (overrideAll) {
      form.review_mode = isReviewMode(review.review_mode) ? review.review_mode : 'single'
    }
  } catch (e) {
    activeReviewId.value = null
    ElMessage.warning(extractErrorMessage(e, '加载评审任务失败，请重新创建'))
  }
}

function clearLegacyProjectDraft() {
  if (!projectId.value) return
  window.localStorage.removeItem(`tp-case-review-create-draft:${projectId.value}`)
}

function normalizeDraftIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
        .map((id) => Math.trunc(id)),
    ),
  )
}

function readDraft(): CaseReviewCreateDraft | null {
  const key = draftStorageKey.value
  if (!key) return null
  const raw = window.localStorage.getItem(key)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== DRAFT_VERSION) return null

    const draftForm = isRecord(parsed.form) ? parsed.form : {}
    const assignedIds = normalizeDraftIds(parsed.assignedUserIds)
    const rawPrimary =
      typeof parsed.primaryReviewerId === 'number' && Number.isFinite(parsed.primaryReviewerId)
        ? Math.trunc(parsed.primaryReviewerId)
        : null
    const primaryId = rawPrimary !== null && assignedIds.includes(rawPrimary) ? rawPrimary : null
    const stepValue =
      typeof parsed.currentStep === 'number' && Number.isFinite(parsed.currentStep)
        ? Math.trunc(parsed.currentStep)
        : 1

    return {
      version: DRAFT_VERSION,
      savedAt:
        typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt)
          ? parsed.savedAt
          : Date.now(),
      currentStep: Math.min(4, Math.max(1, stepValue)),
      form: {
        name: typeof draftForm.name === 'string' ? draftForm.name : '',
        description: typeof draftForm.description === 'string' ? draftForm.description : '',
        review_mode: isReviewMode(draftForm.review_mode) ? draftForm.review_mode : 'single',
      },
      selectedCaseIds: normalizeDraftIds(parsed.selectedCaseIds),
      assignedUserIds: assignedIds,
      primaryReviewerId: primaryId,
    }
  } catch {
    window.localStorage.removeItem(key)
    return null
  }
}

function applyDraft(draft: CaseReviewCreateDraft) {
  currentStep.value = draft.currentStep
  form.name = draft.form.name
  form.description = draft.form.description
  form.review_mode = draft.form.review_mode
  selectedCaseIds.value = new Set(draft.selectedCaseIds)
  assignedUserIds.value = new Set(draft.assignedUserIds)
  primaryReviewerId.value = draft.primaryReviewerId
  draftSavedAt.value = draft.savedAt
}

function restoreDraft() {
  const draft = readDraft()
  if (!draft) return false
  applyDraft(draft)
  return true
}

function hasDraftContent() {
  return (
    currentStep.value > 1 ||
    form.name.trim().length > 0 ||
    form.description.trim().length > 0 ||
    form.review_mode !== 'single' ||
    selectedCaseIds.value.size > 0 ||
    assignedUserIds.value.size > 0 ||
    primaryReviewerId.value !== null
  )
}

function saveDraftNow() {
  if (!draftSavingEnabled.value) return
  const key = draftStorageKey.value
  if (!key) return
  if (!hasDraftContent()) {
    window.localStorage.removeItem(key)
    draftSavedAt.value = null
    return
  }
  const savedAt = Date.now()
  const draft: CaseReviewCreateDraft = {
    version: DRAFT_VERSION,
    savedAt,
    currentStep: currentStep.value,
    form: {
      name: form.name,
      description: form.description,
      review_mode: form.review_mode,
    },
    selectedCaseIds: Array.from(selectedCaseIds.value),
    assignedUserIds: Array.from(assignedUserIds.value),
    primaryReviewerId: primaryReviewerId.value,
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(draft))
    draftSavedAt.value = savedAt
  } catch {
    draftSavedAt.value = null
  }
}

function queueDraftSave() {
  if (!draftSavingEnabled.value) return
  if (draftSaveTimer.value !== null) {
    window.clearTimeout(draftSaveTimer.value)
  }
  draftSaveTimer.value = window.setTimeout(() => {
    saveDraftNow()
    draftSaveTimer.value = null
  }, 300)
}

function clearDraft() {
  draftSavingEnabled.value = false
  if (draftSaveTimer.value !== null) {
    window.clearTimeout(draftSaveTimer.value)
    draftSaveTimer.value = null
  }
  const key = draftStorageKey.value
  if (key) window.localStorage.removeItem(key)
  draftSavedAt.value = null
}

watch(
  () => ({
    currentStep: currentStep.value,
    name: form.name,
    description: form.description,
    reviewMode: form.review_mode,
    selectedCaseIds: Array.from(selectedCaseIds.value).sort((a, b) => a - b),
    assignedUserIds: Array.from(assignedUserIds.value).sort((a, b) => a - b),
    primaryReviewerId: primaryReviewerId.value,
  }),
  () => queueDraftSave(),
)

onMounted(async () => {
  activeReviewId.value = parseRouteDraftReviewId()
  if (!activeReviewId.value) clearLegacyProjectDraft()
  const restored = activeReviewId.value ? restoreDraft() : false
  if (activeReviewId.value) {
    // 无论是否恢复了本地草稿，都从后端拉取最新名称/描述（可能被列表页重命名）
    await loadExistingReviewBase(activeReviewId.value, !restored)
  }
  draftSavingEnabled.value = true
  window.addEventListener('beforeunload', saveDraftNow)
  loadUsers()
  loadSettings()
  await fetchCases()
  // 若 URL 带 ?testcaseIds=1,2,3 则自动预选
  const preIds = parsePreselectedIds()
  if (preIds.length > 0) {
    preIds.forEach((id) => selectedCaseIds.value.add(id))
    queueDraftSave()
  }
  if (restored) ElMessage.success('已恢复未完成的评审草稿')
})

onBeforeUnmount(() => {
  saveDraftNow()
  window.removeEventListener('beforeunload', saveDraftNow)
  if (draftSaveTimer.value !== null) {
    window.clearTimeout(draftSaveTimer.value)
    draftSaveTimer.value = null
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
        <div class="step-grid step-grid-single">
          <!-- 左：表单 -->
          <div class="step-main">
            <div class="card-glass">
              <h2 class="card-title-primary">步骤 1：评审基础定义</h2>
              <div class="form-group">
                <label class="form-label">评审计划名称</label>
                <input
                  v-model="form.name"
                  class="form-input"
                  placeholder="例如：支付模块回归用例评审 / V2.3 发版前用例基线评审"
                />
              </div>
              <div class="form-group">
                <label class="form-label">评审说明</label>
                <textarea
                  v-model="form.description"
                  class="form-textarea"
                  placeholder="说明本次评审范围、关注点和验收标准，例如：重点检查登录/支付链路用例覆盖率、前置条件完整性、预期结果是否可验证。"
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
                type="text"
                aria-label="搜索用例 ID 或标题"
                class="search-input-wz"
                placeholder="搜索用例 ID 或标题..."
                @keyup.enter="fetchCases"
              />
            </div>
            <div class="filter-btns">
              <button type="button" class="filter-btn">所有模块</button>
              <button type="button" class="filter-btn">所有优先级</button>
              <button type="button" class="filter-btn">所有状态</button>
              <button type="button" class="filter-btn icon-btn" @click="fetchCases">
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
            <button type="button" class="selection-action" @click="selectAllPage">
              全选当前页
            </button>
            <button type="button" class="selection-action danger" @click="clearSelection">
              清除选择
            </button>
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
            type="button"
            class="page-btn-wz"
            aria-label="上一页"
            :disabled="casesPage <= 1"
            @click="casesGoPage(casesPage - 1)"
          >
            <span class="material-symbols-outlined">chevron_left</span>
          </button>
          <button
            v-for="p in Math.min(casesTotalPages, 5)"
            :key="p"
            type="button"
            class="page-btn-wz"
            :class="{ active: p === casesPage }"
            :aria-current="p === casesPage ? 'page' : undefined"
            @click="casesGoPage(p)"
          >
            {{ p }}
          </button>
          <button
            type="button"
            class="page-btn-wz"
            aria-label="下一页"
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
                      v-if="hasUserAvatar(user)"
                      :src="resolveAvatarUrl(user.avatar)"
                      :alt="user.name"
                      class="avatar-img"
                      @error="markAvatarFailed(user.id)"
                    />
                    <span v-else>{{ getInitials(user.name) }}</span>
                  </div>
                  <div class="reviewer-card-info">
                    <h3 class="reviewer-card-name">{{ user.name }}</h3>
                    <p class="reviewer-card-role">{{ user.email }}</p>
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
                        v-if="hasUserAvatar(user)"
                        :src="resolveAvatarUrl(user.avatar)"
                        :alt="user.name"
                        class="avatar-img"
                        @error="markAvatarFailed(user.id)"
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
              <!-- 顶部指标行 -->
              <div class="summary-metrics">
                <div class="summary-metric-item">
                  <span class="material-symbols-outlined metric-icon">description</span>
                  <div>
                    <p class="metric-num">{{ selectedCaseIds.size }}</p>
                    <p class="metric-label">用例总数</p>
                  </div>
                </div>
                <div class="summary-metric-item">
                  <span class="material-symbols-outlined metric-icon">group</span>
                  <div>
                    <p class="metric-num">{{ assignedUserIds.size }}</p>
                    <p class="metric-label">评审人数</p>
                  </div>
                </div>
                <div class="summary-metric-item">
                  <span class="material-symbols-outlined metric-icon">
                    {{ form.review_mode === 'single' ? 'person' : 'groups' }}
                  </span>
                  <div>
                    <p class="metric-num-text">
                      {{ form.review_mode === 'single' ? '独审' : '会签' }}
                    </p>
                    <p class="metric-label">评审模式</p>
                  </div>
                </div>
              </div>
              <!-- 信息区 -->
              <div class="summary-info">
                <div class="summary-info-row">
                  <label class="summary-label">计划名称</label>
                  <p class="summary-value-primary">{{ form.name || '—' }}</p>
                </div>
                <div v-if="form.description" class="summary-info-row">
                  <label class="summary-label">描述</label>
                  <p class="summary-value">{{ form.description }}</p>
                </div>
              </div>
              <!-- 底部评审人 -->
              <div class="summary-footer">
                <div class="summary-avatars">
                  <div
                    v-for="u in assignedUsers.slice(0, 5)"
                    :key="u.id"
                    class="summary-avatar"
                    :title="u.name"
                  >
                    <img
                      v-if="hasUserAvatar(u)"
                      :src="resolveAvatarUrl(u.avatar)"
                      :alt="u.name"
                      class="avatar-img"
                      @error="markAvatarFailed(u.id)"
                    />
                    <span v-else>{{ getInitials(u.name) }}</span>
                  </div>
                  <span v-if="assignedUsers.length > 5" class="summary-avatar more">
                    +{{ assignedUsers.length - 5 }}
                  </span>
                </div>
                <span class="summary-avatar-label">已指派评审人员</span>
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
        <span class="draft-status">
          <span class="material-symbols-outlined">cloud_done</span>
          {{ draftStatusText }}
        </span>
      </div>
      <div class="footer-right">
        <button class="footer-btn outline" @click="router.push('/case-reviews')">取消</button>
        <button
          v-if="currentStep < 4"
          class="footer-btn primary"
          :disabled="creatingReview"
          @click="nextStep"
        >
          {{ creatingReview ? '创建中...' : '下一步' }}
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
  overflow: hidden;
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
  overflow-y: auto;
  padding-bottom: 16px;
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
.step-grid-single {
  grid-template-columns: 1fr;
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

.avatar-img {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
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
  background: var(--tp-btn-bg);
  border-color: var(--tp-btn-border);
  color: var(--tp-btn-text);
  box-shadow: var(--tp-btn-shadow);
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
  box-shadow: inset 0 0 0 1px var(--tp-accent-primary-border);
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
  background: var(--tp-btn-bg);
  color: var(--tp-btn-text);
  border-color: var(--tp-btn-border);
  box-shadow: var(--tp-btn-shadow);
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
  border: 1px solid var(--tp-accent-primary-border);
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
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--tp-surface-base, #11131e);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding: 12px 0;
  z-index: 10;
}
.footer-left,
.footer-right {
  display: flex;
  gap: 12px;
  align-items: center;
}
.draft-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--tp-gray-400, #958da1);
}
.draft-status .material-symbols-outlined {
  font-size: 16px;
  color: #34d399;
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
  background: var(--tp-btn-bg);
  color: var(--tp-btn-text);
  box-shadow: var(--tp-btn-shadow);
}
.footer-btn.primary:hover {
  background: var(--tp-btn-bg-hover);
  transform: none;
  box-shadow: var(--tp-btn-shadow-hover);
}
.footer-btn.primary:active {
  transform: scale(0.97);
}
.footer-btn.activate {
  background: var(--tp-btn-bg);
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

.wizard-page {
  --wizard-focus-ring: 0 0 0 3px var(--tp-accent-primary-soft);
  --wizard-panel-border: var(--tp-border-subtle);
  --wizard-panel-border-strong: var(--tp-border-strong);
  box-sizing: border-box;
  gap: var(--tp-space-5);
  background-image:
    radial-gradient(circle at 10% 0%, var(--tp-accent-primary-soft), transparent 28%),
    radial-gradient(circle at 88% 8%, var(--tp-accent-info-soft), transparent 30%);
}

.wizard-header {
  margin-bottom: var(--tp-space-6);
  padding-top: var(--tp-space-6);
}

.wizard-title {
  font-size: clamp(24px, 2vw, 32px);
  font-weight: 720;
}

.wizard-subtitle,
.card-desc,
.step3-sub {
  color: var(--tp-gray-600);
  line-height: 1.7;
}

.stepper {
  padding: var(--tp-space-4) var(--tp-space-10);
  border: 1px solid var(--wizard-panel-border);
  border-radius: var(--tp-radius-lg);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 62%), var(--tp-surface-card);
  box-shadow: var(--tp-shadow-card);
}

.stepper-line,
.stepper-line-active {
  top: 36px;
}

.step-item {
  min-width: 96px;
  border-radius: var(--tp-radius-md);
  transition:
    transform var(--tp-transition),
    color var(--tp-transition);
}

.step-item:hover {
  transform: translateY(-1px);
}

.step-item:focus-visible,
.mode-radio:focus-visible,
.filter-btn:focus-visible,
.page-btn-wz:focus-visible,
.reviewer-card:focus-visible,
.set-primary-btn:focus-visible,
.remove-btn:focus-visible,
.footer-btn:focus-visible,
.selection-action:focus-visible {
  outline: none;
  box-shadow: var(--wizard-focus-ring);
}

.step-circle {
  box-shadow: inset 0 0 0 1px var(--wizard-panel-border);
}

.step-item.active .step-circle {
  box-shadow:
    var(--tp-shadow-glow),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
}

.wizard-content {
  min-height: 0;
}

.step-grid {
  align-items: start;
}

.card-glass,
.card-surface,
.summary-card,
.checklist-panel,
.assigned-panel {
  border-color: var(--wizard-panel-border);
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.032), transparent 44%), var(--tp-surface-card);
  box-shadow: var(--tp-shadow-card);
}

.card-title-primary,
.step3-title,
.assigned-title,
.checklist-title {
  font-weight: 720;
  letter-spacing: -0.01em;
}

.form-input,
.form-textarea,
.search-box-wz {
  border: 1px solid var(--wizard-panel-border-strong);
  background: rgba(255, 255, 255, 0.035);
}

.form-input:focus,
.form-textarea:focus,
.search-box-wz:focus-within {
  border-color: var(--tp-accent-primary-border);
  box-shadow: var(--wizard-focus-ring);
}

.mode-radio {
  min-height: 44px;
  border-color: var(--wizard-panel-border);
}

.mode-radio:hover,
.mode-radio.selected {
  border-color: var(--tp-accent-primary-border);
  background: var(--tp-accent-primary-soft);
}

.filter-bar {
  border-color: var(--wizard-panel-border);
}

.filter-bar-inner {
  flex-wrap: wrap;
}

.filter-btn {
  min-height: 36px;
  border-color: var(--wizard-panel-border-strong);
}

.filter-btn.icon-btn {
  box-shadow: var(--tp-shadow-glow);
}

.search-box-wz {
  min-height: 40px;
  width: min(400px, 100%);
}

.selection-bar {
  border-color: var(--tp-accent-info-border);
  background: var(--tp-accent-info-soft);
}

.table-wrap {
  border: 1px solid var(--wizard-panel-border);
  border-radius: var(--tp-radius-lg);
  background: var(--tp-surface-card);
}

.wz-table {
  min-width: 880px;
}

.wz-table thead tr {
  background: rgba(12, 14, 24, 0.72);
}

.wz-table th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: rgba(12, 14, 24, 0.92);
  color: var(--tp-gray-600);
}

.wz-row {
  border-bottom-color: var(--wizard-panel-border);
  transition:
    background var(--tp-transition),
    box-shadow var(--tp-transition);
}

.wz-row:hover {
  background: rgba(124, 58, 237, 0.055);
}

.wz-row.selected {
  background: var(--tp-accent-primary-soft);
  box-shadow: inset 3px 0 0 var(--tp-info);
}

.custom-check {
  border-color: var(--tp-gray-600);
}

.page-btn-wz {
  border-color: var(--wizard-panel-border);
}

.page-btn-wz.active {
  border-color: var(--tp-accent-primary-border);
  box-shadow: var(--tp-shadow-glow);
}

.reviewer-grid {
  gap: var(--tp-space-4);
}

.reviewer-card {
  min-height: 132px;
  border-color: var(--wizard-panel-border);
  box-shadow: var(--tp-shadow-card);
  transition:
    border-color var(--tp-transition),
    box-shadow var(--tp-transition),
    transform var(--tp-transition);
}

.reviewer-card:hover {
  transform: translateY(-2px);
  border-color: var(--tp-accent-primary-border);
  box-shadow: var(--tp-shadow-card-hover);
}

.reviewer-card-info,
.assigned-item-left > div:last-child {
  min-width: 0;
}

.reviewer-card-name,
.reviewer-card-role,
.assigned-name,
.assigned-role {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.load-bar-track {
  height: 5px;
  background: rgba(255, 255, 255, 0.06);
}

.assigned-panel {
  position: sticky;
  top: var(--tp-space-5);
}

.assigned-header {
  background: rgba(255, 255, 255, 0.018);
  border-bottom-color: var(--wizard-panel-border);
}

.assigned-list {
  min-height: 260px;
}

.assigned-item {
  border: 1px solid var(--wizard-panel-border);
  box-shadow: inset 0 0 0 1px var(--tp-accent-primary-border);
}

.assigned-item.is-primary {
  border-color: var(--tp-accent-primary-border);
  box-shadow: 0 0 0 1px var(--tp-accent-primary-soft);
}

.remove-btn {
  min-width: 28px;
  min-height: 28px;
}

.drop-placeholder {
  min-height: 112px;
  border-color: var(--wizard-panel-border-strong);
  background: rgba(255, 255, 255, 0.018);
}

.summary-grid {
  position: relative;
}

.summary-big-num {
  font-variant-numeric: tabular-nums;
}

.checklist-item {
  padding: var(--tp-space-2);
  border-radius: var(--tp-radius-md);
  background: rgba(255, 255, 255, 0.018);
}

.activate-hint {
  background: linear-gradient(135deg, var(--tp-accent-primary-soft), transparent);
  border-color: var(--tp-accent-primary-border);
}

.wizard-footer {
  backdrop-filter: none;
  background: var(--tp-surface-card);
}

.footer-btn {
  min-height: 40px;
  border-radius: var(--tp-radius-md);
}

.footer-btn.primary {
  box-shadow: var(--tp-shadow-glow);
}

@media (max-width: 1280px) {
  .step-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .assigned-panel {
    position: static;
  }
}

@media (max-width: 900px) {
  .wizard-page {
    padding: 0 var(--tp-space-5);
  }

  .stepper {
    align-items: stretch;
    gap: var(--tp-space-2);
    overflow-x: auto;
    padding: var(--tp-space-4);
  }

  .stepper-line,
  .stepper-line-active {
    display: none;
  }

  .step-item {
    min-width: 88px;
  }

  .filter-bar-inner,
  .selection-bar,
  .wizard-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .footer-left,
  .footer-right {
    justify-content: space-between;
    width: 100%;
  }
}

@media (max-width: 640px) {
  .wizard-page {
    padding: 0 var(--tp-space-4);
  }

  .card-glass,
  .card-surface,
  .summary-card,
  .checklist-panel {
    padding: var(--tp-space-5);
  }

  .reviewer-grid,
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .footer-left,
  .footer-right {
    flex-wrap: wrap;
  }
}

.wizard-page {
  color: var(--tp-gray-900);
  background:
    radial-gradient(circle at 10% 0%, var(--tp-ambient-primary), transparent 28%),
    radial-gradient(circle at 88% 8%, var(--tp-ambient-info), transparent 30%),
    var(--tp-surface-base);
}

.wizard-title,
.card-title,
.step3-title,
.assigned-title,
.reviewer-card-name,
.assigned-name,
.checklist-title,
.check-label,
.td-title,
.stat-bold {
  color: var(--tp-gray-900);
}

.wizard-subtitle,
.card-desc,
.form-label,
.step-label,
.empty-hint,
.status-text,
.selection-range,
.td-date,
.td-empty,
.step3-sub,
.reviewer-card-role,
.load-bar-labels,
.assigned-sub,
.assigned-role,
.drop-placeholder,
.assigned-stat,
.summary-avatar-label,
.check-desc,
.draft-status,
.self-review-toggle {
  color: var(--tp-gray-500);
}

.card-title-primary,
.step-item.active .step-label,
.step-item.done .step-label,
.mode-radio.selected,
.module-tag,
.selection-count,
.selection-action,
.td-id,
.summary-value-primary,
.summary-big-num,
.checklist-badge,
.activate-hint p,
.drop-placeholder:hover,
.primary-badge,
.set-primary-btn {
  color: var(--tp-primary);
}

.card-glass,
.card-surface,
.summary-card,
.checklist-panel,
.assigned-panel,
.reviewer-card,
.stepper,
.table-wrap {
  background: var(--tp-surface-card);
  border-color: var(--tp-border-subtle);
  box-shadow: var(--tp-shadow-card);
  backdrop-filter: none;
}

.stepper-line {
  background: var(--tp-border-subtle);
}

.stepper-line-active {
  background: var(--tp-primary);
}

.step-circle {
  background: var(--tp-surface-card);
  border-color: var(--tp-border-subtle);
  color: var(--tp-gray-500);
}

.step-item.active .step-circle,
.step-item.done .step-circle,
.custom-check.checked {
  background: var(--tp-primary);
  border-color: var(--tp-primary);
  box-shadow: none;
}

.filter-btn.icon-btn,
.page-btn-wz.active,
.footer-btn.primary,
.footer-btn.activate {
  background: var(--tp-btn-bg);
  border-color: var(--tp-btn-border);
  color: var(--tp-btn-text);
  box-shadow: var(--tp-btn-shadow);
}

.form-input,
.form-textarea,
.search-box-wz,
.mode-radio,
.filter-btn,
.page-btn-wz,
.assigned-item,
.drop-placeholder,
.checklist-item {
  background: var(--tp-surface-input);
  border-color: var(--tp-border-subtle);
  color: var(--tp-gray-900);
}

.form-input:focus,
.form-textarea:focus,
.search-box-wz:focus-within {
  border-color: var(--tp-accent-primary-border);
  box-shadow: 0 0 0 3px var(--tp-accent-primary-soft);
}

.form-input::placeholder,
.form-textarea::placeholder,
.search-input-wz::placeholder {
  color: var(--tp-gray-400);
}

.search-input-wz {
  color: var(--tp-gray-900);
}

.mode-radio:hover,
.mode-radio.selected,
.reviewer-card:hover,
.filter-btn:hover,
.page-btn-wz:hover:not(:disabled),
.drop-placeholder:hover {
  background: var(--tp-surface-hover);
  border-color: var(--tp-border-strong);
  color: var(--tp-gray-900);
  transform: none;
}

.selection-bar {
  background: var(--tp-accent-info-soft);
  border-color: var(--tp-accent-info-border);
}

.wz-table thead tr,
.wz-table th,
.assigned-header,
.assigned-footer,
.wizard-footer {
  background: var(--tp-surface-header);
  border-color: var(--tp-border-subtle);
}

.wz-table th {
  color: var(--tp-gray-500);
}

.wz-row {
  border-bottom-color: var(--tp-border-subtle);
}

.wz-row:hover {
  background: var(--tp-surface-row-hover);
}

.wz-row.selected,
.assigned-item.is-primary {
  background: var(--tp-accent-primary-soft);
  border-color: var(--tp-accent-primary-border);
}

.custom-check {
  border-color: var(--tp-gray-400);
}

.priority-tag.p2,
.summary-value {
  color: var(--tp-gray-700);
}

.priority-tag.p3 {
  color: var(--tp-gray-500);
}

.reviewer-card {
  background: var(--tp-surface-card);
}

.load-bar-track {
  background: var(--tp-gray-200);
}

.primary-badge,
.module-tag,
.checklist-badge {
  background: var(--tp-accent-primary-soft);
  border: 1px solid var(--tp-accent-primary-border);
}

.shadow-badge {
  background: var(--tp-surface-muted);
  color: var(--tp-gray-600);
}

.assigned-item {
  box-shadow: inset 0 0 0 1px var(--tp-accent-primary-border);
}

.remove-btn {
  color: var(--tp-gray-500);
}

.remove-btn:hover {
  background: var(--tp-accent-danger-soft);
  color: var(--tp-accent-danger);
}

.summary-avatar {
  border-color: var(--tp-surface-card);
}

.summary-avatar.more {
  background: var(--tp-gray-200);
  color: var(--tp-gray-600);
}

.activate-hint {
  background: var(--tp-accent-primary-soft);
  border-color: var(--tp-accent-primary-border);
}

.wizard-footer {
  backdrop-filter: none;
  box-shadow: 0 -1px 2px rgba(15, 23, 42, 0.04);
}

.footer-btn.outline {
  background: var(--tp-surface-card);
  border-color: var(--tp-btn-plain-border);
  color: var(--tp-gray-700);
  border-radius: var(--tp-btn-radius);
}

.footer-btn.outline:hover {
  background: var(--tp-surface-hover);
  border-color: var(--tp-border-strong);
  color: var(--tp-gray-900);
}

.footer-btn.primary:hover {
  transform: none;
  background: var(--tp-btn-bg-hover);
  box-shadow: var(--tp-btn-shadow-hover);
}

.footer-btn.activate.not-ready {
  background: var(--tp-gray-400);
}

.wizard-title,
.card-title-primary,
.step3-title,
.assigned-title,
.checklist-title {
  font-weight: var(--tp-font-bold);
}

.wizard-subtitle,
.card-desc,
.step3-sub,
.check-desc,
.draft-status,
.activate-hint p {
  line-height: var(--tp-line-body);
}

.step-label,
.form-label,
.wz-table th,
.load-bar-labels,
.assigned-stat,
.summary-label,
.checklist-badge {
  font-size: var(--tp-text-xs) !important;
  font-weight: var(--tp-font-semibold);
  line-height: var(--tp-line-ui);
  text-transform: none;
  letter-spacing: 0;
}

.wz-table td,
.reviewer-card-role,
.assigned-role,
.check-desc {
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-regular);
}

.td-title,
.reviewer-card-name,
.assigned-name,
.check-label {
  font-size: var(--tp-text-sm);
  font-weight: var(--tp-font-semibold);
  line-height: var(--tp-line-ui);
}

.module-tag,
.priority-tag,
.shadow-badge,
.primary-badge {
  min-height: 24px;
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-tight);
  letter-spacing: 0;
}

.wizard-page {
  min-height: calc(100vh - 56px - 16px);
  gap: 8px;
  padding: 0 8px !important;
}

.wizard-header {
  margin-bottom: 6px;
  padding-top: 0;
}

.wizard-title-area {
  margin-bottom: 6px;
}

.wizard-title {
  margin-bottom: 2px;
  font-size: 18px;
  line-height: var(--tp-line-tight);
}

.wizard-subtitle,
.card-desc,
.step3-sub {
  font-size: 12px;
  line-height: var(--tp-line-ui);
}

.stepper {
  padding: 8px 28px;
  border-radius: 12px;
  box-shadow: var(--tp-shadow-sm);
}

.stepper-line,
.stepper-line-active {
  top: 24px;
  left: 48px;
  right: 48px;
  height: 1px;
}

.step-item {
  min-width: 82px;
  gap: 5px;
}

.step-circle {
  width: 30px;
  height: 30px;
  font-size: 12px;
}

.step-circle .material-symbols-outlined,
.step-check {
  font-size: 16px;
}

.step-label {
  font-size: 11px !important;
}

.wizard-content {
  padding-bottom: 12px;
}

.step-grid {
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 12px;
}

.step-grid.step-grid-single {
  grid-template-columns: minmax(0, 1fr);
}

.card-glass,
.card-surface,
.summary-card,
.checklist-panel,
.assigned-panel {
  padding: 14px;
  border-radius: 12px;
  box-shadow: var(--tp-shadow-sm);
}

.card-title-primary {
  margin-bottom: 12px;
  font-size: 15px;
  line-height: var(--tp-line-tight);
}

.card-title,
.step3-title,
.assigned-title,
.checklist-title {
  font-size: 14px;
  line-height: var(--tp-line-ui);
}

.form-group {
  margin-bottom: 12px;
}

.form-label {
  margin-bottom: 5px;
}

.form-input,
.form-textarea {
  min-height: 32px;
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 12px;
}

.form-textarea {
  min-height: 78px;
}

.mode-radio-group {
  gap: 8px;
}

.mode-radio {
  min-height: 32px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
}

.filter-bar {
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: 12px;
}

.filter-bar-inner {
  gap: 8px;
}

.filter-btn {
  min-height: 30px;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 12px;
}

.search-box-wz {
  min-height: 30px;
  width: min(320px, 100%);
  padding: 4px 9px;
  border-radius: 8px;
}

.search-icon-wz {
  font-size: 16px;
}

.search-input-wz {
  font-size: 12px;
}

.selection-bar {
  margin-bottom: 10px;
  padding: 7px 10px;
  border-radius: 10px;
}

.table-wrap {
  border-radius: 12px;
}

.wz-table {
  min-width: 840px;
}

.wz-table th {
  height: 34px;
  padding: 7px 10px;
}

.wz-table td {
  height: 42px;
  padding: 7px 10px;
}

.th-check,
.td-check {
  width: 38px;
}

.custom-check {
  width: 15px;
  height: 15px;
  border-radius: 4px;
}

.td-title {
  font-size: 12px;
}

.wz-pagination {
  padding: 8px;
}

.page-btn-wz {
  min-width: 28px;
  height: 28px;
  border-radius: 8px;
}

.step3-header {
  margin-bottom: 12px;
}

.reviewer-grid {
  gap: 10px;
}

.reviewer-card {
  min-height: 96px;
  padding: 10px;
  border-radius: 11px;
  box-shadow: var(--tp-shadow-sm);
}

.reviewer-card-top {
  gap: 9px;
  margin-bottom: 9px;
}

.reviewer-avatar-lg {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  font-size: 12px;
}

.load-bar-track {
  height: 3px;
}

.assigned-panel {
  top: 12px;
}

.assigned-header,
.assigned-footer {
  padding: 9px 10px;
}

.assigned-list {
  min-height: 200px;
}

.assigned-item {
  padding: 8px;
  border-radius: 10px;
}

.reviewer-avatar-sm {
  width: 24px;
  height: 24px;
}

.remove-btn {
  min-width: 24px;
  min-height: 24px;
}

.drop-placeholder {
  min-height: 82px;
  padding: 12px;
}

.summary-card {
  padding: 14px;
}

.summary-grid {
  gap: 18px;
}

.summary-value-primary {
  margin-bottom: 12px;
  font-size: 15px;
}

.summary-meta,
.summary-stats {
  gap: 10px;
}

.summary-big-num {
  font-size: 24px;
}

.summary-avatar {
  width: 24px;
  height: 24px;
}

.checklist-item {
  padding: 7px 8px;
}

.activate-hint {
  padding: 10px 12px;
  border-radius: 10px;
}

.wizard-footer {
  min-height: 48px;
  padding: 8px 0;
}

.footer-btn {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 12px;
}

@media (max-width: 1280px) {
  .step-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .assigned-panel {
    position: static;
  }
}

/* ══════════════════════════════════════════════════
   Step 2 选择用例 — 最终视觉优化覆盖
   ══════════════════════════════════════════════════ */

/* 筛选栏 */
.filter-bar {
  background: var(--tp-surface-card);
  border: 1px solid var(--tp-border-subtle);
  box-shadow: none;
}

.filter-btn {
  color: var(--tp-text-secondary);
  background: var(--tp-surface-input);
  border: 1px solid var(--tp-border-subtle);
  font-weight: var(--tp-font-medium);
  transition:
    border-color var(--tp-transition),
    background var(--tp-transition),
    color var(--tp-transition);
}

.filter-btn:hover {
  border-color: var(--tp-border-strong);
  background: var(--tp-surface-hover);
  color: var(--tp-text-primary);
}

.filter-btn.icon-btn {
  background: var(--tp-primary);
  border-color: var(--tp-primary);
  color: #fff;
  box-shadow: none;
}

.filter-btn.icon-btn:hover {
  background: var(--tp-primary-dark);
  border-color: var(--tp-primary-dark);
  color: #fff;
}

/* 搜索框 */
.search-box-wz {
  background: var(--tp-surface-input);
  border: 1px solid var(--tp-border-subtle);
  box-shadow: none;
}

.search-box-wz:focus-within {
  border-color: var(--tp-accent-primary-border);
  box-shadow: 0 0 0 3px var(--tp-accent-primary-soft);
}

/* 选中状态条 */
.selection-bar {
  background: var(--tp-accent-info-soft);
  border: 1px solid var(--tp-accent-info-border);
}

.selection-count {
  color: var(--tp-accent-info);
  font-weight: var(--tp-font-semibold);
}

.selection-action {
  color: var(--tp-accent-info);
  font-weight: var(--tp-font-medium);
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 2px;
  transition:
    color var(--tp-transition),
    text-decoration-color var(--tp-transition);
}

.selection-action:hover {
  text-decoration-color: currentColor;
}

.selection-action.danger {
  color: var(--tp-danger);
}

.selection-range {
  color: var(--tp-text-subtle);
  font-variant-numeric: tabular-nums;
}

/* 表格容器 */
.table-wrap {
  background: var(--tp-surface-card);
  border: 1px solid var(--tp-border-subtle);
  box-shadow: none;
  overflow-x: auto;
}

/* 表格 */
.wz-table {
  table-layout: fixed;
}

.wz-table colgroup,
.wz-table col {
  visibility: visible;
}

.th-check,
.td-check {
  width: 36px;
}

.wz-table th:nth-child(2) {
  width: 72px;
}

.wz-table th:nth-child(3) {
  width: auto;
}

.wz-table th:nth-child(4) {
  width: 100px;
}

.wz-table th:nth-child(5) {
  width: 64px;
}

.wz-table th:nth-child(6) {
  width: 80px;
}

.wz-table th:nth-child(7) {
  width: 100px;
}

/* 表头 */
.wz-table thead tr {
  background: var(--tp-surface-header);
}

.wz-table th {
  background: var(--tp-surface-header);
  color: var(--tp-text-subtle);
  border-bottom: 1px solid var(--tp-border-subtle);
  font-weight: var(--tp-font-semibold);
  font-size: var(--tp-text-xs);
  text-transform: none;
  letter-spacing: 0;
}

/* 表格行 */
.wz-row {
  border-bottom: 1px solid var(--tp-border-subtle);
  transition:
    background var(--tp-transition),
    box-shadow var(--tp-transition);
}

.wz-row:hover {
  background: var(--tp-surface-row-hover);
  box-shadow: inset 2px 0 0 var(--tp-primary);
}

.wz-row.selected {
  background: var(--tp-accent-primary-soft);
  box-shadow: inset 3px 0 0 var(--tp-primary);
}

.wz-row.selected:hover {
  background: rgba(99, 102, 241, 0.12);
}

/* Checkbox */
.custom-check {
  border: 1.5px solid var(--tp-gray-400);
  border-radius: 4px;
  transition:
    background var(--tp-transition),
    border-color var(--tp-transition);
}

.custom-check.checked {
  background: var(--tp-primary);
  border-color: var(--tp-primary);
  color: #fff;
}

/* ID 列 */
.td-id {
  font-family: var(--tp-font-family-mono);
  font-size: var(--tp-text-xs);
  color: var(--tp-text-muted);
  font-variant-numeric: tabular-nums;
}

/* 标题列 */
.td-title {
  color: var(--tp-text-primary);
  font-weight: var(--tp-font-semibold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 模块标签 */
.module-tag {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--tp-accent-primary-soft);
  border: 1px solid var(--tp-accent-primary-border);
  color: var(--tp-primary);
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-semibold);
  line-height: var(--tp-line-tight);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 优先级标签 */
.priority-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  min-height: 22px;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: var(--tp-text-xs);
  font-weight: var(--tp-font-bold);
  line-height: var(--tp-line-tight);
}

.priority-tag.p0 {
  background: var(--tp-p0-bg);
  color: var(--tp-p0);
  border: 1px solid rgba(220, 38, 38, 0.18);
}

.priority-tag.p1 {
  background: var(--tp-p1-bg);
  color: var(--tp-p1);
  border: 1px solid rgba(249, 115, 22, 0.18);
}

.priority-tag.p2 {
  background: var(--tp-p2-bg);
  color: var(--tp-p2);
  border: 1px solid rgba(99, 102, 241, 0.18);
}

.priority-tag.p3 {
  background: var(--tp-p3-bg);
  color: var(--tp-p3);
  border: 1px solid rgba(100, 116, 139, 0.18);
}

/* 状态指示 */
.status-dot {
  width: 7px;
  height: 7px;
}

.status-dot.active {
  background: var(--tp-success);
}

.status-dot.pending {
  background: var(--tp-warning);
}

.status-dot.draft {
  background: var(--tp-gray-400);
}

.status-dot.discarded {
  background: var(--tp-danger);
}

.status-text {
  color: var(--tp-text-secondary);
  font-size: var(--tp-text-xs);
}

/* 日期列 */
.td-date {
  color: var(--tp-text-subtle);
  font-variant-numeric: tabular-nums;
}

/* 空状态 */
.td-empty {
  color: var(--tp-text-subtle);
  text-align: center;
  padding: 36px 10px;
}

/* 分页 */
.wz-pagination {
  background: var(--tp-surface-card);
  border-top: 1px solid var(--tp-border-subtle);
  border-radius: 0 0 12px 12px;
}

.page-btn-wz {
  background: var(--tp-surface-input);
  border: 1px solid var(--tp-border-subtle);
  color: var(--tp-text-secondary);
  font-variant-numeric: tabular-nums;
  transition:
    background var(--tp-transition),
    border-color var(--tp-transition),
    color var(--tp-transition);
}

.page-btn-wz:hover:not(:disabled) {
  background: var(--tp-surface-hover);
  border-color: var(--tp-border-strong);
  color: var(--tp-text-primary);
}

.page-btn-wz.active {
  background: var(--tp-primary);
  border-color: var(--tp-primary);
  color: #fff;
  box-shadow: none;
}

.page-btn-wz:disabled {
  opacity: 0.36;
  cursor: not-allowed;
}

/* ══════════════════════════════════════════════════
   Step 3 指派评审人 — 全面精调覆盖
   ══════════════════════════════════════════════════ */

/* 标题区 */
.step3-header {
  margin-bottom: 16px;
}

.step3-title {
  font-size: 16px;
  font-weight: var(--tp-font-bold);
  color: var(--tp-text-primary);
  margin: 0 0 4px;
}

.step3-sub {
  font-size: 12px;
  font-weight: 400;
  color: var(--tp-text-secondary);
  margin: 0;
  line-height: var(--tp-line-ui);
}

/* 评审人卡片网格 */
.reviewer-grid {
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

/* 评审人卡片 */
.reviewer-card {
  background: var(--tp-surface-card);
  border: 1px solid var(--tp-border-subtle);
  border-radius: 10px;
  box-shadow: none;
  padding: 12px 14px;
  cursor: pointer;
  transition:
    border-color var(--tp-transition),
    background var(--tp-transition),
    box-shadow var(--tp-transition);
}

.reviewer-card:hover {
  transform: none;
  border-color: var(--tp-primary);
  background: var(--tp-accent-primary-soft);
  box-shadow: inset 3px 0 0 var(--tp-primary);
}

.reviewer-card:active {
  background: rgba(99, 102, 241, 0.12);
}

/* 卡片顶部 */
.reviewer-card-top {
  gap: 10px;
  margin-bottom: 10px;
}

.reviewer-card-name {
  font-size: 13px;
  font-weight: var(--tp-font-semibold);
  color: var(--tp-text-primary);
  margin: 0;
}

.reviewer-card-role {
  font-size: 11px;
  color: var(--tp-text-subtle);
  margin: 2px 0 0;
}

/* 头像大 */
.reviewer-avatar-lg {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: var(--tp-accent-primary-soft);
  border: 1px solid var(--tp-accent-primary-border);
  color: var(--tp-primary);
  font-size: 12px;
  font-weight: var(--tp-font-bold);
  flex-shrink: 0;
}

.reviewer-avatar-lg .avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}

/* 负载条 */
.load-bar-wrap {
  margin-top: 10px;
}

.load-bar-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  text-transform: none;
  letter-spacing: 0;
  color: var(--tp-text-secondary);
  margin-bottom: 4px;
}

.load-pct.low {
  color: var(--tp-success);
  font-weight: var(--tp-font-semibold);
}

.load-pct.medium {
  color: var(--tp-warning);
  font-weight: var(--tp-font-semibold);
}

.load-pct.high {
  color: var(--tp-danger);
  font-weight: var(--tp-font-semibold);
}

.load-bar-track {
  height: 3px;
  background: var(--tp-gray-200);
  border-radius: 3px;
  overflow: hidden;
}

.load-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.load-bar-fill.low {
  background: var(--tp-success);
}

.load-bar-fill.medium {
  background: var(--tp-warning);
}

.load-bar-fill.high {
  background: var(--tp-danger);
}

/* 空提示 */
.empty-hint {
  grid-column: 1 / -1;
  text-align: center;
  padding: 32px 16px;
  color: var(--tp-text-subtle);
  font-size: 13px;
}

/* ── 已指派面板 ── */
.assigned-panel {
  background: var(--tp-surface-card);
  border: 1px solid var(--tp-border-subtle);
  border-radius: 10px;
  box-shadow: none;
  backdrop-filter: none;
  display: flex;
  flex-direction: column;
}

.assigned-header {
  background: var(--tp-surface-header);
  border-bottom: 1px solid var(--tp-border-subtle);
  border-radius: 10px 10px 0 0;
  padding: 12px 14px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.assigned-title {
  font-size: 13px;
  font-weight: var(--tp-font-bold);
  color: var(--tp-text-primary);
  margin: 0;
}

.assigned-sub {
  font-size: 11px;
  color: var(--tp-text-subtle);
  margin: 3px 0 0;
  text-transform: none;
  letter-spacing: 0;
  line-height: var(--tp-line-ui);
}

.self-review-toggle {
  font-size: 11px;
  color: var(--tp-text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  margin-top: 2px;
}

.self-review-toggle input[type='checkbox'] {
  width: 14px;
  height: 14px;
  accent-color: var(--tp-primary);
  cursor: pointer;
}

/* 已指派列表 */
.assigned-list {
  padding: 10px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 180px;
}

.assigned-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--tp-surface-input);
  border: 1px solid var(--tp-border-subtle);
  border-radius: 8px;
  padding: 9px 10px;
  box-shadow: none;
  transition:
    border-color var(--tp-transition),
    background var(--tp-transition);
}

.assigned-item:hover {
  border-color: var(--tp-border-strong);
}

.assigned-item:hover .remove-btn {
  opacity: 1;
}

.assigned-item.is-primary {
  background: var(--tp-accent-primary-soft);
  border-color: var(--tp-accent-primary-border);
  box-shadow: none;
}

.assigned-item-left {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.assigned-name {
  font-size: 12px;
  font-weight: var(--tp-font-semibold);
  color: var(--tp-text-primary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assigned-role {
  font-size: 10px;
  color: var(--tp-text-subtle);
  margin: 1px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 头像小 */
.reviewer-avatar-sm {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: var(--tp-accent-primary-soft);
  border: 1px solid var(--tp-accent-primary-border);
  color: var(--tp-primary);
  font-size: 10px;
  font-weight: var(--tp-font-bold);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.reviewer-avatar-sm .avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
}

/* 徽章 */
.primary-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--tp-primary);
  color: #fff;
  font-size: 10px;
  font-weight: var(--tp-font-bold);
  border: none;
  line-height: 1.5;
}

.shadow-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--tp-surface-muted);
  color: var(--tp-text-secondary);
  font-size: 10px;
  font-weight: var(--tp-font-semibold);
  line-height: 1.5;
}

/* 操作按钮 */
.assigned-item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.set-primary-btn {
  padding: 3px 8px;
  border-radius: 5px;
  border: 1px solid var(--tp-accent-primary-border);
  background: transparent;
  color: var(--tp-primary);
  font-size: 10px;
  font-weight: var(--tp-font-medium);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--tp-transition),
    border-color var(--tp-transition);
}

.set-primary-btn:hover {
  background: var(--tp-accent-primary-soft);
  border-color: var(--tp-primary);
}

.remove-btn {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--tp-text-subtle);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition:
    opacity var(--tp-transition),
    background var(--tp-transition),
    color var(--tp-transition);
}

.remove-btn:hover {
  background: var(--tp-accent-danger-soft);
  color: var(--tp-danger);
}

/* 占位区 */
.drop-placeholder {
  background: var(--tp-surface-input);
  border: 1px dashed var(--tp-border-subtle);
  border-radius: 8px;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--tp-text-subtle);
  font-size: 12px;
  cursor: default;
  transition:
    border-color var(--tp-transition),
    color var(--tp-transition),
    background var(--tp-transition);
}

.drop-placeholder .material-symbols-outlined {
  font-size: 24px;
  opacity: 0.5;
}

.drop-placeholder:hover {
  border-color: var(--tp-primary);
  color: var(--tp-primary);
  background: var(--tp-accent-primary-soft);
}

.drop-placeholder:hover .material-symbols-outlined {
  opacity: 1;
}

/* 底部统计 */
.assigned-footer {
  background: var(--tp-surface-header);
  border-top: 1px solid var(--tp-border-subtle);
  border-radius: 0 0 10px 10px;
  padding: 10px 14px;
  font-size: 12px;
}

.assigned-stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--tp-text-secondary);
}

.stat-bold {
  color: var(--tp-primary);
  font-weight: var(--tp-font-bold);
  font-size: 14px;
}

/* ══════════════════════════════════════════════════
   Step 4 确认激活 — 视觉精调
   ══════════════════════════════════════════════════ */

/* 摘要卡片 */
.summary-card {
  background: var(--tp-surface-card);
  border: 1px solid var(--tp-border-subtle);
  border-radius: 10px;
  box-shadow: none;
  padding: 0;
  overflow: hidden;
}

/* 顶部指标行 */
.summary-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-bottom: 1px solid var(--tp-border-subtle);
}

.summary-metric-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 18px;
  border-right: 1px solid var(--tp-border-subtle);
}

.summary-metric-item:last-child {
  border-right: none;
}

.metric-icon {
  font-size: 20px;
  color: var(--tp-primary);
  background: var(--tp-accent-primary-soft);
  border-radius: 8px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.metric-num {
  font-size: 22px;
  font-weight: var(--tp-font-bold);
  color: var(--tp-text-primary);
  margin: 0;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.metric-num-text {
  font-size: 16px;
  font-weight: var(--tp-font-bold);
  color: var(--tp-text-primary);
  margin: 0;
  line-height: 1.3;
}

.metric-label {
  font-size: 11px;
  color: var(--tp-text-subtle);
  margin: 2px 0 0;
}

/* 信息区 */
.summary-info {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-bottom: 1px solid var(--tp-border-subtle);
}

.summary-info-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.summary-label {
  font-size: 11px;
  color: var(--tp-text-subtle);
  font-weight: var(--tp-font-medium);
}

.summary-value-primary {
  font-size: 15px;
  font-weight: var(--tp-font-bold);
  color: var(--tp-text-primary);
  margin: 0;
}

.summary-value {
  font-size: 13px;
  color: var(--tp-text-secondary);
  margin: 0;
}

/* 底部评审人 */
.summary-footer {
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.summary-avatars {
  display: flex;
  align-items: center;
  gap: -4px;
}

.summary-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--tp-accent-primary-soft);
  border: 2px solid var(--tp-surface-card);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: var(--tp-font-bold);
  color: var(--tp-primary);
  overflow: hidden;
  margin-left: -6px;
}

.summary-avatar:first-child {
  margin-left: 0;
}

.summary-avatar .avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.summary-avatar.more {
  background: var(--tp-surface-muted);
  color: var(--tp-text-secondary);
  font-size: 9px;
  border-color: var(--tp-surface-card);
}

.summary-avatar-label {
  font-size: 12px;
  color: var(--tp-text-subtle);
  margin-left: 8px;
}

/* 质量自检面板 */
.checklist-panel {
  background: var(--tp-surface-card);
  border: 1px solid var(--tp-border-subtle);
  border-radius: 10px;
  box-shadow: none;
  padding: 14px;
}

.checklist-title {
  font-size: 13px;
  font-weight: var(--tp-font-bold);
  color: var(--tp-text-primary);
  margin: 0 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.checklist-badge {
  font-size: 10px;
  font-weight: var(--tp-font-medium);
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--tp-accent-primary-soft);
  color: var(--tp-primary);
  border: 1px solid var(--tp-accent-primary-border);
}

.checklist-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checklist-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 9px 10px;
  background: var(--tp-surface-input);
  border: 1px solid var(--tp-border-subtle);
  border-radius: 8px;
  transition: border-color var(--tp-transition);
}

.checklist-item.ok {
  border-color: var(--tp-accent-success-border, var(--tp-border-subtle));
}

.checklist-item:not(.ok) {
  opacity: 0.5;
}

.check-icon {
  font-size: 18px;
  color: var(--tp-text-subtle);
  flex-shrink: 0;
  line-height: 1;
}

.check-icon.filled {
  color: var(--tp-success);
}

.check-label {
  font-size: 12px;
  font-weight: var(--tp-font-semibold);
  color: var(--tp-text-primary);
  margin: 0;
}

.check-desc {
  font-size: 11px;
  color: var(--tp-text-subtle);
  margin: 2px 0 0;
}

/* 激活提示 */
.activate-hint {
  margin-top: 12px;
  background: var(--tp-accent-primary-soft);
  border: 1px solid var(--tp-accent-primary-border);
  border-radius: 8px;
  padding: 12px 14px;
}

.activate-hint p {
  font-size: 12px;
  font-style: italic;
  color: var(--tp-primary);
  margin: 0;
  line-height: var(--tp-line-body);
}

.wizard-page {
  background: var(--tp-surface-base) !important;
}

.wizard-page .stepper,
.wizard-page .card-glass,
.wizard-page .card-surface,
.wizard-page .table-wrap,
.wizard-page .reviewer-card,
.wizard-page .assigned-panel,
.wizard-page .summary-card,
.wizard-page .checklist-panel {
  background: var(--tp-surface-card) !important;
  border-color: var(--tp-border-subtle) !important;
  box-shadow: var(--tp-shadow-sm) !important;
  backdrop-filter: none !important;
}

.wizard-page .step-item:hover,
.wizard-page .reviewer-card:hover {
  transform: none !important;
}

.wizard-page .step-item.active .step-circle,
.wizard-page .step-item.done .step-circle,
.wizard-page .filter-btn.icon-btn,
.wizard-page .page-btn-wz.active,
.wizard-page .footer-btn.primary,
.wizard-page .footer-btn.activate {
  box-shadow: var(--tp-btn-shadow) !important;
}

.wizard-page .form-input,
.wizard-page .form-textarea,
.wizard-page .search-box-wz,
.wizard-page .mode-radio,
.wizard-page .filter-btn,
.wizard-page .page-btn-wz,
.wizard-page .assigned-item,
.wizard-page .drop-placeholder,
.wizard-page .checklist-item {
  background: var(--tp-surface-input) !important;
  border-color: var(--tp-border-subtle) !important;
  box-shadow: none !important;
}

.wizard-page .wz-table thead tr,
.wizard-page .wz-table th,
.wizard-page .assigned-header,
.wizard-page .assigned-footer,
.wizard-page .wizard-footer {
  background: var(--tp-surface-header) !important;
  border-color: var(--tp-border-subtle) !important;
}

.wizard-page .wz-row:hover,
.wizard-page .reviewer-card:hover,
.wizard-page .mode-radio:hover,
.wizard-page .page-btn-wz:hover:not(:disabled),
.wizard-page .filter-btn:hover {
  background: var(--tp-surface-row-hover) !important;
}

.wizard-page .wz-row.selected,
.wizard-page .assigned-item.is-primary,
.wizard-page .mode-radio.selected {
  background: var(--tp-accent-primary-soft) !important;
  border-color: var(--tp-accent-primary-border) !important;
}

.wizard-page .reviewer-avatar-lg,
.wizard-page .reviewer-avatar-sm,
.wizard-page .summary-avatar {
  background: var(--tp-accent-primary-soft) !important;
  border: 1px solid var(--tp-accent-primary-border) !important;
  color: var(--tp-primary) !important;
  box-shadow: none !important;
}

.wizard-page .primary-badge,
.wizard-page .module-tag,
.wizard-page .checklist-badge {
  background: var(--tp-accent-primary-soft) !important;
  border: 1px solid var(--tp-accent-primary-border) !important;
  color: var(--tp-primary) !important;
}

.wizard-page .footer-btn.primary:hover {
  box-shadow: var(--tp-btn-shadow-hover) !important;
}

.wizard-page .wizard-title,
.wizard-page .card-title,
.wizard-page .card-title-primary,
.wizard-page .step3-title,
.wizard-page .assigned-title,
.wizard-page .checklist-title,
.wizard-page .td-title,
.wizard-page .reviewer-card-name,
.wizard-page .assigned-name,
.wizard-page .check-label,
.wizard-page .stat-bold {
  color: var(--tp-text-primary) !important;
}

.wizard-page .wizard-subtitle,
.wizard-page .card-desc,
.wizard-page .step3-sub,
.wizard-page .reviewer-card-role,
.wizard-page .assigned-role,
.wizard-page .check-desc,
.wizard-page .td-date,
.wizard-page .status-text,
.wizard-page .selection-range {
  color: var(--tp-text-muted) !important;
}

.wizard-page .form-input,
.wizard-page .form-textarea,
.wizard-page .search-input-wz {
  color: var(--tp-text-primary) !important;
}

.wizard-page .form-input::placeholder,
.wizard-page .form-textarea::placeholder,
.wizard-page .search-input-wz::placeholder {
  color: var(--tp-text-subtle) !important;
}

.wizard-page .wz-table td {
  color: var(--tp-text-secondary) !important;
}

.wizard-page .footer-btn.outline {
  background: var(--tp-surface-input) !important;
  border-color: var(--tp-border-subtle) !important;
  color: var(--tp-text-secondary) !important;
}

.wizard-page .footer-btn.outline:hover {
  border-color: var(--tp-border-strong) !important;
  color: var(--tp-text-primary) !important;
}
</style>
