<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import { getRequirementDoc, type RequirementDoc } from '@/api/requirementDoc'
import {
  adoptResult,
  discardResult,
  listGenResults,
  listGenTasks,
  type GenResult,
  type GenTask,
} from '@/api/requirementGen'
import { parseTestCaseStepsToRows, type TestCaseStepRow } from '@/utils/testCaseSteps'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const projectId = computed(() => projectStore.selectedProjectId)

const docId = ref<number | null>(null)
const activeDoc = ref<RequirementDoc | null>(null)
const tasks = ref<GenTask[]>([])
const caseResults = ref<GenResult[]>([])
const loading = ref(false)
const searchKeyword = ref('')
const selectedCaseId = ref<number | null>(null)

const filteredCases = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return caseResults.value
  return caseResults.value.filter((item) => {
    return item.title.toLowerCase().includes(keyword) || String(item.seq_no).includes(keyword)
  })
})

const selectedCase = computed(() => {
  return caseResults.value.find((item) => item.id === selectedCaseId.value) || null
})
const selectedCaseSteps = computed(() => {
  return selectedCase.value ? parseSteps(selectedCase.value.steps) : []
})

const adoptedCount = computed(() => caseResults.value.filter((item) => item.adopted).length)
const discardedCount = computed(() => caseResults.value.filter((item) => item.discarded).length)
const totalCount = computed(() => caseResults.value.length)

function normalizeTaskStatus(status: string) {
  return status.toLowerCase()
}

function uniqueResults(results: GenResult[]) {
  const map = new Map<number, GenResult>()
  results.forEach((item) => map.set(item.id, item))
  return Array.from(map.values()).sort((a, b) => a.seq_no - b.seq_no)
}

function parseSteps(stepsText: string): TestCaseStepRow[] {
  return parseTestCaseStepsToRows(stepsText).filter((step) => step.action || step.expected)
}

async function resolveDocId() {
  if (!projectId.value) return 0
  const queryDocId = Number(route.query.docId)
  if (Number.isFinite(queryDocId) && queryDocId > 0) return queryDocId

  const { items } = await listGenTasks(projectId.value, { page: 1, page_size: 50 })
  const latestTask = [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0]
  return latestTask?.requirement_doc_id || 0
}

async function loadResults() {
  if (!projectId.value) return
  loading.value = true
  try {
    const targetDocId = await resolveDocId()
    if (!targetDocId) {
      activeDoc.value = null
      tasks.value = []
      caseResults.value = []
      selectedCaseId.value = null
      return
    }

    docId.value = targetDocId
    activeDoc.value = await getRequirementDoc(projectId.value, targetDocId)

    const { items } = await listGenTasks(projectId.value, {
      requirement_doc_id: targetDocId,
      page: 1,
      page_size: 100,
    })
    tasks.value = items

    const doneTasks = items.filter((item) => {
      return ['success', 'partial_adopted', 'partially_closed', 'fully_closed'].includes(
        normalizeTaskStatus(item.status),
      )
    })
    const resultGroups = await Promise.all(
      doneTasks.map((item) => listGenResults(projectId.value as number, item.id).catch(() => [])),
    )
    caseResults.value = uniqueResults(resultGroups.flat())
    selectedCaseId.value = caseResults.value[0]?.id || null
  } catch (err: unknown) {
    console.error('[GenResultView] loadResults failed:', err)
    const msg = err instanceof Error ? err.message : String(err)
    ElMessage.error(`无法加载用例生成结果: ${msg}`)
  } finally {
    loading.value = false
  }
}

async function handleAdopt(result: GenResult) {
  if (!projectId.value) return
  try {
    await adoptResult(projectId.value, result.id)
    result.adopted = true
    result.discarded = false
    ElMessage.success(`用例 #${result.seq_no} 采纳成功`)
  } catch {
    ElMessage.error('采纳操作失败')
  }
}

async function handleDiscard(result: GenResult) {
  if (!projectId.value) return
  try {
    await discardResult(projectId.value, result.id)
    result.discarded = true
    result.adopted = false
    ElMessage.warning(`用例 #${result.seq_no} 已标记丢弃`)
  } catch {
    ElMessage.error('丢弃操作失败')
  }
}

function goBack() {
  router.push({ name: 'RequirementGen' })
}

onMounted(() => {
  loadResults()
})

watch(projectId, () => {
  selectedCaseId.value = null
  loadResults()
})
</script>

<template>
  <div class="gen-result-view-page">
    <header class="result-topbar">
      <div class="topbar-left">
        <el-button class="back-button" @click="goBack">
          <span class="material-symbols-outlined">arrow_back</span>
          返回需求智生
        </el-button>
        <div class="topbar-separator"></div>
        <div class="doc-meta">
          <span class="doc-kicker">Requirement Intelligence Output</span>
          <h1>{{ activeDoc?.title || '用例生成结果' }}</h1>
        </div>
      </div>
      <div v-if="caseResults.length" class="result-stats">
        <span>
          总数
          <strong>{{ totalCount }}</strong>
        </span>
        <span>
          已采纳
          <strong class="is-success">{{ adoptedCount }}</strong>
        </span>
        <span>
          已丢弃
          <strong class="is-muted">{{ discardedCount }}</strong>
        </span>
      </div>
    </header>

    <main v-loading="loading" class="result-workbench">
      <aside class="case-rail">
        <el-input v-model="searchKeyword" placeholder="搜索用例名称或编号" clearable>
          <template #prefix>
            <span class="material-symbols-outlined search-icon">search</span>
          </template>
        </el-input>

        <div v-if="filteredCases.length" class="case-list">
          <button
            v-for="item in filteredCases"
            :key="item.id"
            class="case-item"
            :class="{
              'is-active': selectedCaseId === item.id,
              'is-adopted': item.adopted,
              'is-discarded': item.discarded,
            }"
            type="button"
            @click="selectedCaseId = item.id"
          >
            <span class="case-item-top">
              <span>#{{ item.seq_no }}</span>
              <span>{{ item.level }}</span>
            </span>
            <strong>{{ item.title }}</strong>
            <em>{{ item.adopted ? '已采纳' : item.discarded ? '已丢弃' : '待评审' }}</em>
          </button>
        </div>

        <div v-else class="rail-empty">
          <span class="material-symbols-outlined">find_in_page</span>
          <p>{{ caseResults.length ? '无匹配搜索结果' : '暂无生成用例产物' }}</p>
        </div>
      </aside>

      <section class="case-detail">
        <div v-if="selectedCase" class="detail-card">
          <div class="detail-head">
            <span class="detail-seq">#{{ selectedCase.seq_no }}</span>
            <span class="detail-level">{{ selectedCase.level }}</span>
            <h2>{{ selectedCase.title }}</h2>
          </div>

          <div class="detail-body">
            <section v-if="selectedCase.precondition" class="detail-section">
              <h3>前置条件</h3>
              <p>{{ selectedCase.precondition }}</p>
            </section>

            <section class="detail-section">
              <h3>测试步骤与预期</h3>
              <ol v-if="selectedCaseSteps.length" class="step-list">
                <li v-for="(step, index) in selectedCaseSteps" :key="index">
                  <span>{{ index + 1 }}</span>
                  <div>
                    <strong>{{ step.action }}</strong>
                    <p v-if="step.expected">{{ step.expected }}</p>
                  </div>
                </li>
              </ol>
              <p v-else class="empty-text">暂无步骤描述</p>
            </section>

            <section v-if="selectedCase.postcondition" class="detail-section">
              <h3>后置条件</h3>
              <p>{{ selectedCase.postcondition }}</p>
            </section>

            <section v-if="selectedCase.remark" class="detail-section">
              <h3>备注说明</h3>
              <p>{{ selectedCase.remark }}</p>
            </section>
          </div>

          <footer class="detail-actions">
            <span class="status-copy">
              {{
                selectedCase.adopted
                  ? '当前状态：已采纳'
                  : selectedCase.discarded
                    ? '当前状态：已丢弃'
                    : '当前状态：待评审'
              }}
            </span>
            <div>
              <el-button
                type="danger"
                plain
                :disabled="selectedCase.discarded"
                @click="handleDiscard(selectedCase)"
              >
                丢弃用例
              </el-button>
              <el-button
                type="primary"
                :disabled="selectedCase.adopted"
                @click="handleAdopt(selectedCase)"
              >
                采纳用例
              </el-button>
            </div>
          </footer>
        </div>

        <div v-else class="detail-empty">
          <span class="material-symbols-outlined">tab_unselected</span>
          <h3>请选择用例</h3>
          <p>点击左侧任意用例，在这里查看完整步骤和评审状态。</p>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.gen-result-view-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px);
  overflow: hidden;
  color: var(--tp-text-primary);
  background: var(--tp-bg-page);
}

.result-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 72px;
  padding: 0 var(--tp-space-5);
  border-bottom: 1px solid var(--tp-border-subtle);
  background: var(--tp-surface-card);
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: var(--tp-space-4);
  min-width: 0;
}

.back-button {
  display: inline-flex;
  align-items: center;
  gap: var(--tp-space-1);
}

.back-button .material-symbols-outlined {
  font-size: 18px;
}

.topbar-separator {
  width: 1px;
  height: 28px;
  background: var(--tp-border-subtle);
}

.doc-meta {
  min-width: 0;
}

.doc-kicker {
  color: var(--tp-text-muted);
  font-family: var(--tp-font-family-mono);
  font-size: var(--tp-text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.doc-meta h1 {
  margin: var(--tp-space-1) 0 0;
  overflow: hidden;
  color: var(--tp-text-primary);
  font-size: var(--tp-text-lg);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-stats {
  display: flex;
  gap: var(--tp-space-4);
  padding: var(--tp-space-1) var(--tp-space-3);
  border: 1px solid var(--tp-border-subtle);
  border-radius: 999px;
  background: var(--tp-surface-muted);
  color: var(--tp-text-secondary);
  font-size: var(--tp-text-xs);
}

.result-stats strong {
  color: var(--tp-text-primary);
  font-family: var(--tp-font-family-mono);
}

.result-stats .is-success {
  color: var(--tp-success);
}

.result-stats .is-muted {
  color: var(--tp-text-muted);
}

.result-workbench {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  flex: 1;
  overflow: hidden;
}

.case-rail {
  display: flex;
  flex-direction: column;
  gap: var(--tp-space-3);
  overflow: hidden;
  padding: var(--tp-space-4);
  border-right: 1px solid var(--tp-border-subtle);
  background: var(--tp-surface-card);
}

.search-icon {
  color: var(--tp-text-muted);
  font-size: 18px;
}

.case-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--tp-space-2);
  overflow-y: auto;
}

.case-item {
  display: flex;
  flex-direction: column;
  gap: var(--tp-space-2);
  width: 100%;
  padding: var(--tp-space-3);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-lg);
  color: var(--tp-text-primary);
  text-align: left;
  background: var(--tp-surface-muted);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    transform 0.2s ease,
    background 0.2s ease;
}

.case-item:hover,
.case-item.is-active {
  border-color: var(--tp-accent-primary-border);
  background: var(--tp-accent-primary-soft);
  transform: translateX(2px);
}

.case-item.is-discarded {
  opacity: 0.58;
}

.case-item-top {
  display: flex;
  justify-content: space-between;
  color: var(--tp-accent-primary);
  font-family: var(--tp-font-family-mono);
  font-size: var(--tp-text-xs);
}

.case-item strong {
  font-size: var(--tp-text-sm);
  line-height: var(--tp-line-ui);
}

.case-item em {
  color: var(--tp-text-muted);
  font-style: normal;
  font-size: var(--tp-text-xs);
}

.rail-empty,
.detail-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--tp-text-muted);
  text-align: center;
}

.rail-empty .material-symbols-outlined,
.detail-empty .material-symbols-outlined {
  margin-bottom: var(--tp-space-3);
  font-size: 44px;
}

.case-detail {
  overflow: hidden;
  padding: var(--tp-space-5);
  background: var(--tp-bg-page);
}

.detail-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-xl);
  background: var(--tp-surface-card);
}

.detail-head {
  padding: var(--tp-space-5);
  border-bottom: 1px solid var(--tp-border-subtle);
}

.detail-seq,
.detail-level {
  display: inline-flex;
  margin-right: var(--tp-space-2);
  padding: 2px var(--tp-space-2);
  border-radius: 999px;
  color: var(--tp-accent-primary);
  background: var(--tp-accent-primary-soft);
  font-family: var(--tp-font-family-mono);
  font-size: var(--tp-text-xs);
}

.detail-head h2 {
  margin: var(--tp-space-3) 0 0;
  color: var(--tp-text-primary);
  font-size: var(--tp-text-xl);
}

.detail-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--tp-space-4);
  overflow-y: auto;
  padding: var(--tp-space-5);
}

.detail-section {
  padding: var(--tp-space-4);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-lg);
  background: var(--tp-surface-muted);
}

.detail-section h3 {
  margin: 0 0 var(--tp-space-3);
  color: var(--tp-text-secondary);
  font-size: var(--tp-text-sm);
}

.detail-section p {
  margin: 0;
  color: var(--tp-text-muted);
  line-height: var(--tp-line-relaxed);
}

.step-list {
  display: flex;
  flex-direction: column;
  gap: var(--tp-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.step-list li {
  display: flex;
  gap: var(--tp-space-3);
}

.step-list li > span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  color: var(--tp-accent-primary);
  background: var(--tp-accent-primary-soft);
  font-family: var(--tp-font-family-mono);
  font-size: var(--tp-text-xs);
}

.step-list strong {
  color: var(--tp-text-primary);
  font-size: var(--tp-text-sm);
}

.step-list p {
  margin-top: var(--tp-space-1);
}

.empty-text {
  color: var(--tp-text-muted);
}

.detail-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--tp-space-4) var(--tp-space-5);
  border-top: 1px solid var(--tp-border-subtle);
  background: var(--tp-surface-muted);
}

.status-copy {
  color: var(--tp-text-secondary);
  font-size: var(--tp-text-sm);
}

@media (max-width: 900px) {
  .result-workbench {
    grid-template-columns: 1fr;
  }

  .case-rail {
    max-height: 42vh;
    border-right: none;
    border-bottom: 1px solid var(--tp-border-subtle);
  }
}
</style>
