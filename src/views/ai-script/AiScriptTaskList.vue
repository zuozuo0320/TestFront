<script setup lang="ts">
import { onMounted, ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAiScriptStore } from '../../stores/aiScript'
import {
  TaskStatusLabel,
  TaskStatusColor,
  GenerationMode,
  GenerationModeLabel,
  type AiScriptTask,
} from '../../api/aiScript'
import { TaskStatus } from '../../api/aiScript'
import { listProjects } from '../../api/project'
import { listTestCases } from '../../api/testcase'
import type { Project, TestCase } from '../../api/types'

const router = useRouter()
const store = useAiScriptStore()

const projects = ref<Project[]>([])
const currentPage = ref(1)
const pageSize = ref(10)

const totalPages = computed(() => Math.max(1, Math.ceil(store.taskTotal / pageSize.value)))
const displayPages = computed(() => {
  const pages: number[] = []
  const total = totalPages.value
  const cur = currentPage.value
  for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) {
    pages.push(i)
  }
  return pages
})

async function loadPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
  await store.loadTaskList({ pageNo: page, pageSize: pageSize.value })
}

onMounted(async () => {
  store.loadTaskList({ pageNo: 1, pageSize: pageSize.value })
  projects.value = await listProjects()
})

// ── 统计卡片聚合 ──
const statsSuccessRate = computed(() => {
  const list = store.taskList
  if (list.length === 0) return 0
  const success = list.filter(
    (t) =>
      t.taskStatus === TaskStatus.CONFIRMED ||
      t.taskStatus === TaskStatus.GENERATE_SUCCESS ||
      t.taskStatus === TaskStatus.PENDING_CONFIRM,
  ).length
  return Math.round((success / list.length) * 100)
})
const statsRunningCount = computed(
  () => store.taskList.filter((t) => t.taskStatus === TaskStatus.RUNNING).length,
)

function goDetail(task: AiScriptTask) {
  router.push(`/ai-script/${task.id}`)
}

function getStatusColor(status: TaskStatus) {
  return TaskStatusColor[status] || 'info'
}

function isRunning(status: TaskStatus) {
  return status === TaskStatus.RUNNING
}

// ── 新建任务 Dialog ──
const showCreateDialog = ref(false)
const createForm = reactive({
  projectId: 0,
  taskName: '',
  generationMode: GenerationMode.RECORDING_ENHANCED as GenerationMode,
  scenarioDesc: '',
  startUrl: '',
  accountRef: '',
  caseIds: '',
  frameworkType: 'Playwright',
})

function openCreateDialog() {
  createForm.projectId = projects.value[0]?.id ?? 0
  createForm.taskName = ''
  createForm.scenarioDesc = ''
  createForm.startUrl = ''
  createForm.accountRef = ''
  createForm.caseIds = ''
  createForm.frameworkType = 'Playwright'
  createForm.generationMode = GenerationMode.RECORDING_ENHANCED
  selectedCaseIds.value = []
  showCreateDialog.value = true
  if (createForm.projectId) loadCases(createForm.projectId)
}

// ── 用例搜索选择 ──
const caseCandidates = ref<TestCase[]>([])
const selectedCaseIds = ref<number[]>([])
const caseSearchKeyword = ref('')
const showCaseDropdown = ref(false)
let caseSearchTimer: ReturnType<typeof setTimeout> | null = null

async function loadCases(projectId: number, keyword = '') {
  try {
    const resp = await listTestCases(projectId, { page: 1, pageSize: 20, keyword })
    caseCandidates.value = resp?.items || []
  } catch {
    caseCandidates.value = []
  }
}

function handleCaseSearch(ev: Event) {
  const val = (ev.target as HTMLInputElement).value
  caseSearchKeyword.value = val
  if (caseSearchTimer) clearTimeout(caseSearchTimer)
  caseSearchTimer = setTimeout(() => {
    if (createForm.projectId) loadCases(createForm.projectId, val)
  }, 300)
}

function toggleCase(caseItem: TestCase) {
  const idx = selectedCaseIds.value.indexOf(caseItem.id)
  if (idx >= 0) {
    selectedCaseIds.value.splice(idx, 1)
  } else {
    selectedCaseIds.value.push(caseItem.id)
  }
  createForm.caseIds = selectedCaseIds.value.join(',')
}

function isCaseSelected(id: number) {
  return selectedCaseIds.value.includes(id)
}

async function submitCreateTask() {
  if (
    !createForm.taskName.trim() ||
    !createForm.scenarioDesc.trim() ||
    !createForm.startUrl.trim()
  ) {
    return
  }
  // 解析用例 ID：支持逗号分隔
  const caseIds = createForm.caseIds
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0)
  if (caseIds.length === 0) return

  try {
    const task = await store.createTask({
      projectId: createForm.projectId,
      taskName: createForm.taskName.trim(),
      generationMode: createForm.generationMode,
      scenarioDesc: createForm.scenarioDesc.trim(),
      startUrl: createForm.startUrl.trim(),
      accountRef: createForm.accountRef.trim() || undefined,
      caseIds,
      frameworkType: createForm.frameworkType || 'Playwright',
    })
    showCreateDialog.value = false
    // 创建成功后跳向详情
    router.push(`/ai-script/${task.id}`)
  } catch (e) {
    console.error('创建任务失败:', e)
  }
}

// ── 触发执行 ──
async function handleExecute(task: AiScriptTask) {
  if (
    task.taskStatus !== TaskStatus.PENDING_EXECUTE &&
    task.taskStatus !== TaskStatus.GENERATE_FAILED
  )
    return
  try {
    await store.executeTask(task.id)
    await store.loadTaskList()
  } catch (e) {
    console.error('触发执行失败:', e)
  }
}
</script>

<template>
  <div class="ai-page">
    <!-- 页面头部 -->
    <div class="ai-page-header">
      <div class="ai-page-header-left">
        <div class="ai-breadcrumb">
          <span>测试智编</span>
          <span class="material-symbols-outlined">chevron_right</span>
          <span class="current">生成任务</span>
        </div>
        <h1>智能脚本生成任务列表</h1>
      </div>
      <div class="ai-action-group">
        <button class="ai-btn ai-btn-ghost">
          <span class="material-symbols-outlined">filter_alt</span>
          筛选条件
        </button>
        <button class="ai-btn ai-btn-ghost">
          <span class="material-symbols-outlined">sort</span>
          按时间排序
        </button>
        <button class="ai-btn ai-btn-primary" @click="openCreateDialog">
          <span class="material-symbols-outlined">add</span>
          新建任务
        </button>
      </div>
    </div>

    <!-- 主表格 -->
    <div class="ai-table-wrap">
      <table class="ai-table">
        <thead>
          <tr>
            <th>任务名称 / ID</th>
            <th>所属项目</th>
            <th>关联用例</th>
            <th>输出框架</th>
            <th>状态</th>
            <th>生成人 / 时间</th>
            <th style="text-align: right">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in store.taskList" :key="task.id" @click="goDetail(task)">
            <td>
              <div class="ai-task-cell">
                <span class="ai-task-name">{{ task.taskName }}</span>
                <span class="ai-task-id">TASK-{{ task.id }}</span>
              </div>
            </td>
            <td>
              <span style="font-size: 0.85rem; color: var(--tp-gray-700)">
                {{ task.projectName }}
              </span>
            </td>
            <td>
              <div class="ai-case-tags">
                <span v-for="tag in task.caseTags" :key="tag" class="ai-case-tag">{{ tag }}</span>
                <span v-if="!task.caseTags?.length" class="ai-case-tag">
                  {{ task.caseCount }} 条用例
                </span>
              </div>
            </td>
            <td>
              <span style="font-family: monospace; font-size: 0.85rem; color: var(--tp-gray-700)">
                {{ task.frameworkType }}
              </span>
            </td>
            <td>
              <div class="ai-status-badge" :class="getStatusColor(task.taskStatus)">
                <span
                  class="ai-status-dot"
                  :class="{ 'animate-pulse': isRunning(task.taskStatus) }"
                ></span>
                <template v-if="task.taskStatus === TaskStatus.GENERATE_SUCCESS">
                  <span class="material-symbols-outlined" style="font-size: 12px">
                    check_circle
                  </span>
                </template>
                <template v-else-if="task.taskStatus === TaskStatus.GENERATE_FAILED">
                  <span class="material-symbols-outlined" style="font-size: 12px">error</span>
                </template>
                <template v-else-if="task.taskStatus === TaskStatus.PENDING_CONFIRM">
                  <span class="material-symbols-outlined" style="font-size: 12px">pending</span>
                </template>
                {{ TaskStatusLabel[task.taskStatus] }}
              </div>
            </td>
            <td>
              <div class="ai-task-cell">
                <span style="font-size: 0.78rem; font-weight: 500">{{ task.createdName }}</span>
                <span style="font-size: 0.6rem; color: var(--tp-gray-500)">
                  {{ task.createdAt }}
                </span>
              </div>
            </td>
            <td>
              <div class="ai-row-actions">
                <button class="ai-row-action-btn" title="查看详情" @click.stop="goDetail(task)">
                  <span class="material-symbols-outlined">visibility</span>
                </button>
                <button
                  v-if="
                    task.taskStatus === TaskStatus.PENDING_EXECUTE ||
                    task.taskStatus === TaskStatus.GENERATE_FAILED
                  "
                  class="ai-row-action-btn"
                  title="触发执行"
                  @click.stop="handleExecute(task)"
                >
                  <span class="material-symbols-outlined">play_arrow</span>
                </button>
                <button class="ai-row-action-btn" title="复制配置" @click.stop>
                  <span class="material-symbols-outlined">content_copy</span>
                </button>
                <button class="ai-row-action-btn danger" title="废弃" @click.stop>
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 分页 -->
      <div class="ai-table-footer">
        <span class="info">
          显示
          <strong>
            {{ (currentPage - 1) * pageSize + 1 }} -
            {{ Math.min(currentPage * pageSize, store.taskTotal) }}
          </strong>
          / 共 {{ store.taskTotal }} 条任务
        </span>
        <div class="ai-pagination">
          <button :disabled="currentPage <= 1" @click="loadPage(currentPage - 1)">
            <span class="material-symbols-outlined" style="font-size: 18px">chevron_left</span>
          </button>
          <button v-if="displayPages.length && displayPages[0]! > 1" @click="loadPage(1)">1</button>
          <span v-if="displayPages.length && displayPages[0]! > 2" class="dots">...</span>
          <button
            v-for="p in displayPages"
            :key="p"
            :class="{ active: p === currentPage }"
            @click="loadPage(p)"
          >
            {{ p }}
          </button>
          <span
            v-if="displayPages.length && displayPages[displayPages.length - 1]! < totalPages - 1"
            class="dots"
          >
            ...
          </span>
          <button
            v-if="displayPages.length && displayPages[displayPages.length - 1]! < totalPages"
            @click="loadPage(totalPages)"
          >
            {{ totalPages }}
          </button>
          <button :disabled="currentPage >= totalPages" @click="loadPage(currentPage + 1)">
            <span class="material-symbols-outlined" style="font-size: 18px">chevron_right</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 底部统计卡片 -->
    <div class="ai-stats-grid">
      <!-- 成功率 -->
      <div class="ai-stat-card">
        <div class="ai-stat-label" style="color: #adc6ff">
          成功率
          <span class="material-symbols-outlined" style="color: #adc6ff">trending_up</span>
        </div>
        <div class="ai-stat-value">{{ statsSuccessRate }}%</div>
        <div class="ai-stat-desc">当前页 {{ store.taskList.length }} 条任务统计</div>
        <div class="ai-stat-bar">
          <div
            class="ai-stat-bar-fill"
            :style="{ width: statsSuccessRate + '%', background: '#adc6ff' }"
          ></div>
        </div>
      </div>

      <!-- 活跃运行器 -->
      <div class="ai-stat-card">
        <div class="ai-stat-label" style="color: var(--tp-primary-light)">
          活跃运行器
          <span class="material-symbols-outlined" style="color: var(--tp-primary-light)">bolt</span>
        </div>
        <div class="ai-stat-value">{{ statsRunningCount }}</div>
        <div class="ai-stat-desc">当前正在生成中的任务</div>
        <div style="display: flex; gap: 4px; margin-top: 14px">
          <div
            style="height: 4px; flex: 1; background: var(--tp-primary-light); border-radius: 4px"
          ></div>
          <div
            style="height: 4px; flex: 1; background: var(--tp-primary-light); border-radius: 4px"
          ></div>
          <div
            class="animate-pulse"
            style="height: 4px; flex: 1; background: var(--tp-primary-light); border-radius: 4px"
          ></div>
          <div
            style="height: 4px; flex: 1; background: var(--tp-surface-elevated); border-radius: 4px"
          ></div>
        </div>
      </div>

      <!-- 快速入口 -->
      <div class="ai-quickstart-card">
        <div style="position: relative; z-index: 1">
          <div class="ai-stat-label" style="color: #ffb784">快速入口</div>
          <h4>从 UI 轨迹生成</h4>
          <p>将手动录制的操作日志直接转换为 Playwright 代码</p>
        </div>
        <button
          class="ai-quickstart-link"
          style="position: relative; z-index: 1"
          @click="
            openCreateDialog()
            createForm.generationMode = GenerationMode.RECORDING_ENHANCED
          "
        >
          立即体验
          <span class="material-symbols-outlined" style="font-size: 14px">arrow_forward</span>
        </button>
        <div class="ai-quickstart-glow"></div>
      </div>
    </div>

    <!-- FAB — 跳转脚本资产 -->
    <button class="ai-fab" title="脚本资产管理" @click="router.push('/ai-script/library')">
      <span class="material-symbols-outlined">inventory_2</span>
    </button>

    <!-- 新建任务 Dialog -->
    <div v-if="showCreateDialog" class="ai-dialog-overlay" @click.self="showCreateDialog = false">
      <div class="ai-dialog">
        <div class="ai-dialog-header">
          <h2>新建智能生成任务</h2>
          <button class="ai-dialog-close" @click="showCreateDialog = false">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="ai-dialog-body">
          <div class="ai-form-group">
            <label class="ai-form-label">所属项目 *</label>
            <select v-model="createForm.projectId" class="ai-form-select">
              <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div class="ai-form-group">
            <label class="ai-form-label">生成模式 *</label>
            <select v-model="createForm.generationMode" class="ai-form-select">
              <option v-for="(label, key) in GenerationModeLabel" :key="key" :value="key">
                {{ label }}
              </option>
            </select>
            <span class="ai-form-hint">
              {{
                createForm.generationMode === GenerationMode.RECORDING_ENHANCED
                  ? '录制增强：先 Playwright 录制，再 AI 重构为标准脚本'
                  : 'AI 直生：browser-use 自动探索并生成脚本'
              }}
            </span>
          </div>
          <div class="ai-form-group">
            <label class="ai-form-label">任务名称 *</label>
            <input
              v-model="createForm.taskName"
              class="ai-form-input"
              placeholder="例如：登录流程回归测试"
            />
          </div>
          <div class="ai-form-group">
            <label class="ai-form-label">场景描述 *</label>
            <textarea
              v-model="createForm.scenarioDesc"
              class="ai-form-textarea"
              placeholder="描述 browser-use 需要探索的业务场景"
            />
          </div>
          <div class="ai-form-group">
            <label class="ai-form-label">起始 URL *</label>
            <input
              v-model="createForm.startUrl"
              class="ai-form-input"
              placeholder="https://your-app.com/login"
            />
          </div>
          <div class="ai-form-group">
            <label class="ai-form-label">关联用例 *</label>
            <!-- 已选用例标签 -->
            <div
              v-if="selectedCaseIds.length"
              style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px"
            >
              <span
                v-for="cid in selectedCaseIds"
                :key="cid"
                style="
                  display: inline-flex;
                  align-items: center;
                  gap: 4px;
                  background: rgba(124, 77, 255, 0.15);
                  color: #b388ff;
                  padding: 2px 8px;
                  border-radius: 12px;
                  font-size: 0.75rem;
                "
              >
                TC-{{ cid }}
                <span
                  class="material-symbols-outlined"
                  style="font-size: 14px; cursor: pointer"
                  @click="
                    selectedCaseIds.splice(selectedCaseIds.indexOf(cid), 1)
                    createForm.caseIds = selectedCaseIds.join(',')
                  "
                >
                  ×
                </span>
              </span>
            </div>
            <!-- 搜索输入 -->
            <div style="position: relative">
              <input
                class="ai-form-input"
                :value="caseSearchKeyword"
                placeholder="搜索用例名称或 ID..."
                @input="handleCaseSearch"
                @focus="showCaseDropdown = true"
              />
              <!-- 下拉列表 -->
              <div
                v-if="showCaseDropdown && caseCandidates.length"
                style="
                  position: absolute;
                  top: 100%;
                  left: 0;
                  right: 0;
                  z-index: 100;
                  max-height: 200px;
                  overflow-y: auto;
                  background: var(--tp-surface-elevated, #1e1e2e);
                  border: 1px solid rgba(255, 255, 255, 0.1);
                  border-radius: 8px;
                  margin-top: 4px;
                  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
                "
              >
                <div
                  v-for="c in caseCandidates"
                  :key="c.id"
                  style="
                    padding: 8px 12px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.8rem;
                    transition: background 0.15s;
                  "
                  :style="{ background: isCaseSelected(c.id) ? 'rgba(124,77,255,0.12)' : '' }"
                  @mousedown.prevent="toggleCase(c)"
                >
                  <span
                    class="material-symbols-outlined"
                    style="font-size: 16px"
                    :style="{ color: isCaseSelected(c.id) ? '#b388ff' : 'var(--tp-gray-500)' }"
                  >
                    {{ isCaseSelected(c.id) ? 'check_box' : 'check_box_outline_blank' }}
                  </span>
                  <span style="color: var(--tp-gray-500); min-width: 50px">TC-{{ c.id }}</span>
                  <span
                    style="
                      color: var(--tp-gray-300);
                      flex: 1;
                      overflow: hidden;
                      text-overflow: ellipsis;
                      white-space: nowrap;
                    "
                  >
                    {{ c.title }}
                  </span>
                  <span
                    v-if="c.level"
                    style="
                      font-size: 0.65rem;
                      padding: 1px 6px;
                      border-radius: 8px;
                      background: rgba(255, 255, 255, 0.06);
                      color: var(--tp-gray-500);
                    "
                  >
                    {{ c.level }}
                  </span>
                </div>
              </div>
            </div>
            <span class="ai-form-hint">已选择 {{ selectedCaseIds.length }} 条用例</span>
          </div>
          <div class="ai-form-group">
            <label class="ai-form-label">测试账号 (可选)</label>
            <input
              v-model="createForm.accountRef"
              class="ai-form-input"
              placeholder="引用的测试账号标识"
            />
          </div>
        </div>
        <div class="ai-dialog-footer">
          <button class="ai-btn ai-btn-ghost" @click="showCreateDialog = false">取消</button>
          <button
            class="ai-btn ai-btn-primary"
            :disabled="store.actionLoading"
            @click="submitCreateTask"
          >
            <span v-if="store.actionLoading" class="ai-spinner"></span>
            {{ store.actionLoading ? '创建中...' : '创建任务' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
.animate-pulse {
  animation: pulse 2s ease-in-out infinite;
}
</style>
