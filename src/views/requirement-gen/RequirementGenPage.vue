<script setup lang="ts">
/**
 * 需求智生主页面（文档驱动一体化视图）
 *
 * 以需求文档表格为主视图，展开行内联展示该文档的生成任务。
 * "智能生成"作为已解析文档的行级操作。
 */
import { ref, reactive, computed } from 'vue'
import { InfoFilled, SuccessFilled, Clock } from '@element-plus/icons-vue'
import { useRequirementDocs, useGenTasks } from '@/composables/useRequirementGen'
import type { RequirementDoc } from '@/api/requirementDoc'
import type { GenTask, SmartGeneratePayload, SmartGenerateResult } from '@/api/requirementGen'

// ─── 文档逻辑 ───
const {
  docs,
  total,
  loading,
  page,
  pageSize,
  keyword,
  parseStatusFilter,
  fetchDocs,
  handleUpload,
  handlePaste,
  handleDelete,
} = useRequirementDocs()

// ─── 任务逻辑 ───
const {
  smartGenerating,
  currentTask,
  currentResults,
  detailLoading,
  fetchTasksByDocId,
  fetchTaskDetail,
  handleSmartGenerate,
  handleAdopt,
  handleDiscard,
  handleClose,
} = useGenTasks()

// ─── 展开行：文档 → 任务映射 ───
const docTasksMap = reactive<Record<number, GenTask[]>>({})
const docTasksLoading = reactive<Record<number, boolean>>({})
const parsedDocCount = computed(
  () => docs.value.filter((doc) => doc.parse_status === 'parsed').length,
)

/** 解析成功率 */
const parseSuccessRate = computed(() => {
  if (docs.value.length === 0) return 0
  const success = docs.value.filter((doc) => doc.parse_status === 'parsed').length
  return Math.round((success / docs.value.length) * 100)
})

/** 活跃生成任务数 */
const runningTaskCount = computed(() => {
  return Object.values(docTasksMap)
    .flat()
    .filter((t) => t.status === 'running').length
})

async function handleExpandChange(row: RequirementDoc, expandedRows: RequirementDoc[]) {
  const isExpanding = expandedRows.some((r) => r.id === row.id)
  if (isExpanding && !docTasksMap[row.id]) {
    docTasksLoading[row.id] = true
    docTasksMap[row.id] = await fetchTasksByDocId(row.id)
    docTasksLoading[row.id] = false
  }
}

/** 刷新某文档的任务列表 */
async function refreshDocTasks(docId: number) {
  docTasksLoading[docId] = true
  docTasksMap[docId] = await fetchTasksByDocId(docId)
  docTasksLoading[docId] = false
}

// ─── 上传对话框 ───
const showUploadDialog = ref(false)
const uploadFile = ref<File | null>(null)
const uploadTitle = ref('')
const uploadRemark = ref('')

function onFileChange(file: any) {
  uploadFile.value = file.raw
  if (!uploadTitle.value) uploadTitle.value = file.name
}

async function submitUpload() {
  if (!uploadFile.value || !uploadTitle.value) return
  await handleUpload(uploadFile.value, uploadTitle.value, uploadRemark.value)
  showUploadDialog.value = false
  uploadFile.value = null
  uploadTitle.value = ''
  uploadRemark.value = ''
}

// ─── 粘贴对话框 ───
const showPasteDialog = ref(false)
const pasteTitle = ref('')
const pasteContent = ref('')
const pasteRemark = ref('')

async function submitPaste() {
  if (!pasteTitle.value || !pasteContent.value) return
  await handlePaste(pasteTitle.value, pasteContent.value, pasteRemark.value)
  showPasteDialog.value = false
  pasteTitle.value = ''
  pasteContent.value = ''
  pasteRemark.value = ''
}

// ─── 智能生成对话框 ───
const showSmartDialog = ref(false)
const smartDocId = ref(0)
const smartDocTitle = ref('')
const smartForm = ref<SmartGeneratePayload>({
  requirement_doc_id: 0,
  task_name_prefix: '',
  max_cases_per_skill: 20,
  default_level: 'P2',
  extra_prompt: '',
})
const smartResultData = ref<SmartGenerateResult | null>(null)

function openSmartGenerate(doc: RequirementDoc) {
  smartDocId.value = doc.id
  smartDocTitle.value = doc.title
  smartForm.value = {
    requirement_doc_id: doc.id,
    task_name_prefix: '',
    max_cases_per_skill: 20,
    default_level: 'P2',
    extra_prompt: '',
  }
  smartResultData.value = null
  showSmartDialog.value = true
}

async function submitSmartGenerate() {
  const result = await handleSmartGenerate(smartForm.value)
  if (result) {
    smartResultData.value = result
    // 刷新该文档的任务列表
    await refreshDocTasks(smartDocId.value)
  }
}

function onSmartDialogClose() {
  showSmartDialog.value = false
}

// ─── 任务详情对话框 ───
const showDetailDialog = ref(false)

function openDetail(taskId: number) {
  fetchTaskDetail(taskId)
  showDetailDialog.value = true
}

// ─── 搜索 & 分页 ───
function onSearch() {
  page.value = 1
  fetchDocs()
}

function handlePageChange(p: number) {
  page.value = p
  fetchDocs()
}

// ─── 显示工具 ───
function parseStatusLabel(status: string) {
  const map: Record<string, string> = {
    not_parsed: '待解析',
    parsing: '解析中',
    parsed: '已解析',
    parse_failed: '解析失败',
  }
  return map[status] || status
}
function parseStatusType(status: string) {
  const map: Record<string, string> = {
    not_parsed: 'info',
    parsing: 'warning',
    parsed: 'success',
    parse_failed: 'danger',
  }
  return map[status] || 'info'
}
function sourceLabel(type: string) {
  return type === 'upload' ? '文件上传' : '粘贴文本'
}
function taskStatusLabel(status: string) {
  const map: Record<string, string> = {
    pending: '等待中',
    running: '生成中',
    success: '已完成',
    failed: '失败',
    partially_closed: '部分关闭',
    fully_closed: '已关闭',
  }
  return map[status] || status
}
function parseSteps(stepsJson: string): Array<{ action: string; expected: string }> {
  try {
    return JSON.parse(stepsJson)
  } catch {
    return []
  }
}
</script>

<template>
  <div class="requirement-gen-page">
    <div class="page-header">
      <h2 class="page-title">需求智生</h2>
      <p class="page-desc">上传需求文档，展开查看 AI 生成的测试用例任务</p>
    </div>

    <div class="content-card">
      <div class="card-head">
        <div>
          <div class="card-title">需求文档与生成任务</div>
          <div class="card-subtitle">展开文档行查看关联任务，已解析文档可直接智能生成</div>
        </div>
      </div>

      <div class="flow-strip">
        <div class="flow-step completed">
          <span class="flow-index">1</span>
          <span class="flow-text">导入需求</span>
        </div>
        <div class="flow-divider"></div>
        <div class="flow-step active">
          <span class="flow-index">2</span>
          <span class="flow-text">解析文档</span>
          <span class="flow-count">{{ total }}</span>
        </div>
        <div class="flow-divider"></div>
        <div class="flow-step">
          <span class="flow-index">3</span>
          <span class="flow-text">智能生成</span>
          <span class="flow-count">{{ parsedDocCount }}</span>
        </div>
        <div class="flow-divider"></div>
        <div class="flow-step">
          <span class="flow-index">4</span>
          <span class="flow-text">采纳用例</span>
        </div>
      </div>

      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <el-input
            v-model="keyword"
            placeholder="搜索文档标题..."
            clearable
            style="width: 220px"
            @keyup.enter="onSearch"
            @clear="onSearch"
          />
          <el-select
            v-model="parseStatusFilter"
            placeholder="解析状态"
            clearable
            style="width: 130px"
            @change="onSearch"
          >
            <el-option label="待解析" value="not_parsed" />
            <el-option label="解析中" value="parsing" />
            <el-option label="已解析" value="parsed" />
            <el-option label="解析失败" value="parse_failed" />
          </el-select>
        </div>
        <div class="toolbar-right">
          <el-button type="primary" @click="showUploadDialog = true">上传文档</el-button>
          <el-button @click="showPasteDialog = true">粘贴文本</el-button>
        </div>
      </div>

      <!-- 文档表格（含展开行） -->
      <el-table
        v-loading="loading"
        class="main-table"
        :data="docs"
        stripe
        style="width: 100%"
        row-key="id"
        @expand-change="handleExpandChange"
      >
        <template #empty>
          <div class="table-empty">
            <div class="table-empty-title">暂无需求文档</div>
            <div class="table-empty-desc">
              上传需求文档或粘贴需求文本后，即可在当前列表中发起智能生成
            </div>
            <div class="table-empty-actions">
              <el-button type="primary" @click="showUploadDialog = true">上传文档</el-button>
              <el-button @click="showPasteDialog = true">粘贴文本</el-button>
            </div>
          </div>
        </template>

        <el-table-column type="expand" width="42">
          <template #default="{ row }">
            <div v-loading="docTasksLoading[row.id]" class="expand-content">
              <template v-if="docTasksMap[row.id]?.length">
                <div class="expand-header">
                  <span class="expand-label">
                    生成任务（{{ docTasksMap[row.id]?.length ?? 0 }}）
                  </span>
                </div>
                <el-table :data="docTasksMap[row.id]" size="small" class="inner-table">
                  <el-table-column
                    prop="task_name"
                    label="任务名称"
                    min-width="180"
                    show-overflow-tooltip
                  />
                  <el-table-column label="状态" width="100">
                    <template #default="{ row: task }">
                      <span class="status-indicator" :class="task.status?.toLowerCase()">
                        <span class="status-dot"></span>
                        <span class="status-text">
                          {{ taskStatusLabel(task.status?.toLowerCase()) }}
                        </span>
                      </span>
                    </template>
                  </el-table-column>
                  <el-table-column label="AI 模型" width="150" show-overflow-tooltip>
                    <template #default="{ row: task }">
                      <span class="model-badge">{{ task.ai_model_snapshot }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="用例统计 (生成 / 采纳 / 丢弃)" width="180">
                    <template #default="{ row: task }">
                      <div class="metrics-row">
                        <span class="metric-chip total" title="已生成用例">
                          {{ task.generated_count }}
                        </span>
                        <span
                          v-if="task.adopted_count > 0"
                          class="metric-chip adopt"
                          title="已采纳用例"
                        >
                          {{ task.adopted_count }}
                        </span>
                        <span
                          v-if="task.discarded_count > 0"
                          class="metric-chip discard"
                          title="已丢弃用例"
                        >
                          {{ task.discarded_count }}
                        </span>
                      </div>
                    </template>
                  </el-table-column>
                  <el-table-column label="耗时" width="90">
                    <template #default="{ row: task }">
                      <span v-if="task.duration_ms" class="duration-badge">
                        <el-icon class="clock-icon"><Clock /></el-icon>
                        <span class="num">{{ (task.duration_ms / 1000).toFixed(1) }}</span>
                        <span class="unit">s</span>
                      </span>
                      <span v-else class="duration-badge empty">-</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="操作" width="120" fixed="right">
                    <template #default="{ row: task }">
                      <div class="row-actions">
                        <el-button link size="small" @click="openDetail(task.id)">详情</el-button>
                        <el-button
                          v-if="task.status === 'success'"
                          type="warning"
                          link
                          size="small"
                          @click="handleClose(task.id).then(() => refreshDocTasks(row.id))"
                        >
                          关闭
                        </el-button>
                      </div>
                    </template>
                  </el-table-column>
                </el-table>
              </template>
              <div v-else class="expand-empty">暂无生成任务，点击操作栏"智能生成"开始</div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="标题" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="doc-title-cell">
              <span class="doc-title-text">{{ row.title }}</span>
              <span class="doc-title-hint">展开查看关联任务</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="90">
          <template #default="{ row }">
            <span class="source-badge">{{ sourceLabel(row.source_type) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="格式" width="70" prop="file_format" />
        <el-table-column label="字数" width="70">
          <template #default="{ row }">
            <span class="num-text">{{ row.word_count }}</span>
          </template>
        </el-table-column>
        <el-table-column label="解析状态" width="100">
          <template #default="{ row }">
            <el-tag :type="parseStatusType(row.parse_status)" size="small">
              {{ parseStatusLabel(row.parse_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="150">
          <template #default="{ row }">
            {{ row.created_at?.slice(0, 16).replace('T', ' ') }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="168" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button
                v-if="row.parse_status === 'parsed'"
                class="ai-generate-btn"
                link
                size="small"
                @click="openSmartGenerate(row)"
              >
                智能生成
              </el-button>
              <el-button class="delete-btn" link size="small" @click="handleDelete(row.id)">
                删除
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div v-if="total > pageSize" class="pagination-wrap">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="handlePageChange"
        />
      </div>

      <!-- 底部统计卡片 (Consistent with "测试智编" / ai-script style) -->
      <div class="ai-stats-grid">
        <!-- 解析成功率 -->
        <div class="ai-stat-card ai-stat-card--success-rate">
          <div class="ai-stat-label">
            文档解析成功率
            <span class="material-symbols-outlined">trending_up</span>
          </div>
          <div class="ai-stat-value">{{ parseSuccessRate }}%</div>
          <div class="ai-stat-desc">当前页已成功解析 {{ parsedDocCount }} 份文档</div>
          <div class="ai-stat-bar">
            <div class="ai-stat-bar-fill" :style="{ width: parseSuccessRate + '%' }"></div>
          </div>
        </div>

        <!-- 活跃生成任务 -->
        <div class="ai-stat-card ai-stat-card--running">
          <div class="ai-stat-label">
            活跃生成任务
            <span class="material-symbols-outlined">bolt</span>
          </div>
          <div class="ai-stat-value">{{ runningTaskCount }}</div>
          <div class="ai-stat-desc">后台正在进行 AI 用例生成的活跃任务数</div>
          <div class="ai-stat-segments">
            <div
              class="ai-stat-segment"
              :class="{ 'is-active animate-pulse': runningTaskCount > 0 }"
            ></div>
            <div class="ai-stat-segment"></div>
            <div class="ai-stat-segment"></div>
            <div class="ai-stat-segment"></div>
          </div>
        </div>

        <!-- 快速入口 / 快捷提示 -->
        <div class="ai-quickstart-card ai-quickstart-card--recording">
          <div class="ai-quickstart-content">
            <div class="ai-stat-label">快速入口</div>
            <h4>智能用例生成</h4>
            <p>AI 自动读取已解析的需求条目，一键并发生成多维度用例</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── 上传对话框 ─── -->
    <el-dialog v-model="showUploadDialog" title="上传需求文档" width="500px">
      <el-form label-width="80px">
        <el-form-item label="文件">
          <el-upload
            :auto-upload="false"
            :limit="1"
            accept=".docx,.pdf,.md,.txt"
            @change="onFileChange"
          >
            <el-button type="primary">选择文件</el-button>
            <template #tip>
              <div class="el-upload__tip">支持 docx、pdf、md、txt 格式，最大 10MB</div>
            </template>
          </el-upload>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="uploadTitle" placeholder="文档标题（默认使用文件名）" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="uploadRemark" placeholder="可选备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showUploadDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!uploadFile" @click="submitUpload">确定上传</el-button>
      </template>
    </el-dialog>

    <!-- ─── 粘贴对话框 ─── -->
    <el-dialog v-model="showPasteDialog" title="粘贴需求文本" width="600px">
      <el-form label-width="80px">
        <el-form-item label="标题">
          <el-input v-model="pasteTitle" placeholder="文档标题" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input
            v-model="pasteContent"
            type="textarea"
            :rows="12"
            placeholder="粘贴需求文本内容..."
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="pasteRemark" placeholder="可选备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPasteDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!pasteTitle || !pasteContent" @click="submitPaste">
          确定创建
        </el-button>
      </template>
    </el-dialog>

    <!-- ─── 智能生成对话框 ─── -->
    <el-dialog
      v-model="showSmartDialog"
      title="智能生成测试用例"
      width="600px"
      :close-on-click-modal="false"
    >
      <div v-if="!smartResultData">
        <div class="smart-doc-info">
          <span class="smart-doc-label">目标文档：</span>
          <span class="smart-doc-name">{{ smartDocTitle }}</span>
        </div>
        <el-form :model="smartForm" label-width="120px" style="margin-top: 12px">
          <el-form-item label="任务名前缀">
            <el-input v-model="smartForm.task_name_prefix" placeholder="可选，留空则使用文档标题" />
          </el-form-item>
          <el-form-item label="每类最大条数">
            <el-input-number v-model="smartForm.max_cases_per_skill" :min="5" :max="50" />
            <span class="form-tip" style="margin-left: 8px">
              每个匹配的测试策略最多生成的用例数
            </span>
          </el-form-item>
          <el-form-item label="默认优先级">
            <el-select v-model="smartForm.default_level" style="width: 120px">
              <el-option label="P0" value="P0" />
              <el-option label="P1" value="P1" />
              <el-option label="P2" value="P2" />
              <el-option label="P3" value="P3" />
            </el-select>
          </el-form-item>
          <el-form-item label="补充提示">
            <el-input
              v-model="smartForm.extra_prompt"
              type="textarea"
              :rows="2"
              placeholder="对 AI 的额外说明（可选）"
            />
          </el-form-item>
          <div class="smart-hint">
            <el-icon><InfoFilled /></el-icon>
            <span>AI 将自动分析需求特征，匹配最适合的测试策略并批量生成测试用例</span>
          </div>
        </el-form>
      </div>
      <div v-else class="smart-result">
        <div class="smart-result-header">
          <el-icon color="var(--el-color-success)"><SuccessFilled /></el-icon>
          <span>
            已匹配 {{ smartResultData.recommended_skills.length }} 个测试策略，创建
            {{ smartResultData.created_tasks.length }} 个生成任务
          </span>
        </div>
        <div class="smart-result-list">
          <div
            v-for="rec in smartResultData.recommended_skills"
            :key="rec.skill_key"
            class="smart-result-item"
          >
            <el-tag size="small" type="info">{{ rec.skill_key }}</el-tag>
            <span class="rec-reason">{{ rec.reason }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <template v-if="!smartResultData">
          <el-button @click="onSmartDialogClose">取消</el-button>
          <el-button type="primary" :loading="smartGenerating" @click="submitSmartGenerate">
            {{ smartGenerating ? 'AI 分析中...' : '开始智能生成' }}
          </el-button>
        </template>
        <template v-else>
          <el-button type="primary" @click="onSmartDialogClose">完成</el-button>
        </template>
      </template>
    </el-dialog>

    <!-- ─── 任务详情对话框 ─── -->
    <el-dialog
      v-model="showDetailDialog"
      title="任务详情"
      width="900px"
      top="5vh"
      class="task-detail-dialog"
    >
      <div v-loading="detailLoading" class="task-detail-body">
        <div v-if="currentTask" class="task-meta">
          <div class="task-meta-grid">
            <div class="task-meta-item task-meta-item--wide">
              <span class="task-meta-label">任务名称</span>
              <span class="task-meta-value">{{ currentTask.task_name }}</span>
            </div>
            <div class="task-meta-item">
              <span class="task-meta-label">状态</span>
              <span class="status-indicator" :class="currentTask.status?.toLowerCase()">
                <span class="status-dot"></span>
                <span class="status-text">
                  {{ taskStatusLabel(currentTask.status?.toLowerCase()) }}
                </span>
              </span>
            </div>
            <div class="task-meta-item">
              <span class="task-meta-label">模型</span>
              <span class="task-meta-value mono">{{ currentTask.ai_model_snapshot }}</span>
            </div>
            <div class="task-meta-item">
              <span class="task-meta-label">生成</span>
              <span class="task-meta-value num">{{ currentTask.generated_count }}</span>
            </div>
            <div class="task-meta-item">
              <span class="task-meta-label">已采纳</span>
              <span class="task-meta-value num success">{{ currentTask.adopted_count }}</span>
            </div>
            <div class="task-meta-item">
              <span class="task-meta-label">已丢弃</span>
              <span class="task-meta-value num muted">{{ currentTask.discarded_count }}</span>
            </div>
            <div v-if="currentTask.fail_reason" class="task-meta-item task-meta-item--full">
              <span class="task-meta-label">失败原因</span>
              <span class="fail-reason">{{ currentTask.fail_reason }}</span>
            </div>
          </div>
        </div>
        <div v-if="currentResults.length > 0" class="results-section">
          <div class="results-heading">
            <h4 class="results-title">生成产物</h4>
            <span class="results-count">{{ currentResults.length }} 条</span>
          </div>
          <div class="result-cards">
            <div
              v-for="result in currentResults"
              :key="result.id"
              class="result-card"
              :class="{ adopted: result.adopted, discarded: result.discarded }"
            >
              <div class="result-header">
                <div class="result-title-row">
                  <span class="result-seq">#{{ result.seq_no }}</span>
                  <span class="result-title-text">{{ result.title }}</span>
                </div>
                <div class="result-header-tags">
                  <span class="result-level" :class="result.level?.toLowerCase()">
                    {{ result.level }}
                  </span>
                  <span v-if="result.adopted" class="result-badge adopted">已采纳</span>
                  <span v-if="result.discarded" class="result-badge discarded">已丢弃</span>
                </div>
              </div>
              <div v-if="result.precondition" class="result-field result-field--precondition">
                <span class="field-label">前置条件</span>
                <span class="field-content">{{ result.precondition }}</span>
              </div>
              <div v-if="parseSteps(result.steps).length" class="result-field">
                <span class="field-label">测试步骤</span>
                <ol class="steps-list">
                  <li v-for="(step, idx) in parseSteps(result.steps)" :key="idx">
                    <span class="step-index">{{ idx + 1 }}</span>
                    <span class="step-action">{{ step.action }}</span>
                    <span v-if="step.expected" class="step-expected">{{ step.expected }}</span>
                  </li>
                </ol>
              </div>
              <div v-if="!result.adopted && !result.discarded" class="result-actions">
                <el-button
                  class="result-action-adopt"
                  type="primary"
                  size="small"
                  @click="handleAdopt(result.id)"
                >
                  采纳
                </el-button>
                <el-button
                  class="result-action-discard"
                  size="small"
                  @click="handleDiscard(result.id)"
                >
                  丢弃
                </el-button>
              </div>
            </div>
          </div>
        </div>
        <div v-else-if="!detailLoading" class="empty-state">
          <p>暂无产物数据</p>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.requirement-gen-page {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 56px - 8px);
  padding: 6px;
  background: transparent;
}

.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 8px 10px 10px;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--tp-text-primary, var(--el-text-color-primary));
  margin: 0 0 4px;
  line-height: var(--tp-line-tight, 1.3);
}

.page-desc {
  font-size: 12px;
  color: var(--tp-text-muted, var(--el-text-color-secondary));
  margin: 0;
  line-height: var(--tp-line-ui, 1.5);
}

.content-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--tp-surface-card);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-md, 8px);
  padding: 12px;
  box-shadow: none;
  overflow: hidden;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 2px 10px;
}

.card-title {
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  color: var(--tp-text-primary, var(--el-text-color-primary));
}

.card-subtitle {
  margin-top: 2px;
  font-size: 12px;
  line-height: 18px;
  color: var(--tp-text-muted, var(--el-text-color-secondary));
}

.card-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
  color: var(--tp-text-secondary, var(--el-text-color-secondary));
  font-size: 12px;
}

/* 流程导航条 - 超扁平流线设计 (SaaS Timeline Track) */
.flow-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 16px;
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-md, 8px);
  background: linear-gradient(180deg, var(--tp-surface-header) 0%, var(--tp-surface-muted) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.flow-step {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--tp-text-subtle, var(--el-text-color-secondary));
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
  transition: all 0.25s ease;
  user-select: none;
}

.flow-step .flow-text {
  font-weight: 500;
}

/* 状态：已完成 (Completed) */
.flow-step.completed {
  color: var(--tp-success, var(--el-color-success));
}

.flow-step.completed .flow-index {
  border-color: var(--tp-success, var(--el-color-success));
  background: var(--tp-success-light, rgba(34, 197, 94, 0.1));
  color: var(--tp-success);
}

/* 状态：进行中/激活 (Active) */
.flow-step.active {
  color: var(--tp-primary, var(--el-color-primary));
  text-shadow: 0 0 12px var(--tp-primary-lighter);
}

.flow-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--tp-border-subtle);
  background: var(--tp-surface-card);
  color: inherit;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  transition: all 0.25s ease;
}

.flow-step.active .flow-index {
  border-color: var(--tp-primary, var(--el-color-primary));
  background: var(--tp-primary, var(--el-color-primary));
  color: var(--tp-btn-text, #ffffff);
  box-shadow: 0 0 8px var(--tp-primary-shadow);
}

/* 流程统计微气泡 */
.flow-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 16px;
  min-width: 16px;
  padding: 0 4px;
  border-radius: 99px;
  background: var(--tp-border-strong, var(--tp-primary-lighter));
  color: var(--tp-primary);
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.flow-divider {
  flex: 1;
  height: 1px;
  min-width: 16px;
  background: repeating-linear-gradient(
    90deg,
    var(--tp-border-subtle) 0,
    var(--tp-border-subtle) 4px,
    transparent 4px,
    transparent 8px
  );
}

/* 展开行内容 - 深度嵌套的 IDE 风格 */
.expand-content {
  position: relative;
  padding: 12px 14px 14px;
  min-height: 60px;
  background: rgba(20, 24, 33, 0.45) !important;
  border: 1px solid rgba(255, 255, 255, 0.05) !important;
  border-radius: var(--tp-radius-sm, 6px);
  /* IDE左侧提示线，赋予代码块般精致的嵌套感 */
  border-left: 3px solid var(--tp-primary-light, var(--tp-primary)) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.01),
    0 4px 20px rgba(0, 0, 0, 0.15) !important;
}

.expand-header {
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.expand-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--tp-text-secondary, var(--el-text-color-secondary));
}

.expand-empty {
  text-align: center;
  padding: 20px 0;
  color: var(--tp-text-muted, var(--el-text-color-secondary));
  font-size: 11px;
  border: 1px dashed var(--tp-border-subtle);
  border-radius: var(--tp-radius-sm, 6px);
  background: var(--tp-surface-card);
}

/* 让嵌套子表格（Inner Table）呈现极致轻量、流线型、无多余黑框的现代化质感 */
.inner-table {
  border: none !important;
  background-color: transparent !important;
  box-shadow: none !important;
}

:deep(.inner-table) {
  border: none !important;
  background-color: transparent !important;
}

:deep(.inner-table .el-table__inner-wrapper::before),
:deep(.inner-table::before),
:deep(.inner-table::after) {
  display: none !important;
}

:deep(.inner-table th.el-table__cell) {
  background-color: rgba(255, 255, 255, 0.012) !important;
  color: var(--tp-text-secondary, #94a3b8) !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  height: 32px !important;
  padding: 0 !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
}

:deep(.inner-table td.el-table__cell) {
  background-color: transparent !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03) !important;
  height: 36px !important;
  padding: 0 !important;
  color: var(--tp-text-primary) !important;
}

:deep(.inner-table .el-table__row) {
  background-color: transparent !important;
  transition: all 0.2s ease !important;
}

:deep(.inner-table .el-table__row:hover > td.el-table__cell) {
  background-color: rgba(167, 139, 250, 0.045) !important;
}

/* 消除子表格首列的 VS Code 聚焦线，子表格应该保持绝对低调 */
:deep(.inner-table .el-table__row:hover > td.el-table__cell:first-child) {
  box-shadow: none !important;
}

/* 操作列布局 */
.row-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  white-space: nowrap;
  width: 100%;
}

/* 明星 AI 操作按钮 */
:deep(.ai-generate-btn) {
  position: relative;
  color: var(--tp-primary) !important;
  border: 1px solid var(--tp-primary-lighter) !important;
  background: var(--tp-primary-lighter) !important;
  font-weight: 600 !important;
  font-size: 11px !important;
  padding: 2px 10px !important;
  border-radius: 99px !important;
  transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
}

:deep(.ai-generate-btn:hover) {
  color: var(--tp-btn-text, #ffffff) !important;
  border-color: var(--tp-primary) !important;
  background: var(--tp-primary) !important;
  box-shadow: 0 0 10px rgba(167, 139, 250, 0.25) !important;
}

/* 优雅的删除按钮 */
:deep(.delete-btn) {
  color: var(--tp-text-muted) !important;
  font-size: 11px !important;
  padding: 2px 8px !important;
  transition: all 0.2s ease !important;
}

:deep(.delete-btn:hover) {
  color: var(--tp-danger) !important;
  background: var(--tp-accent-danger-soft) !important;
  border-radius: 4px !important;
}

/* 子表格状态指示灯 - 超轻盈状态芯片 (Premium Status Chips) */
.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
  padding: 2px 8px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* 状态：已完成 (Success) */
.status-indicator.success {
  color: var(--tp-success, #22c55e) !important;
  background: rgba(34, 197, 94, 0.08) !important;
  border-color: rgba(34, 197, 94, 0.16) !important;
}
.status-indicator.success .status-dot {
  background-color: var(--tp-success, #22c55e);
  box-shadow: 0 0 6px var(--tp-success);
}

/* 状态：运行中 (Running/Generating) */
.status-indicator.running {
  color: var(--tp-warning, #f59e0b) !important;
  background: rgba(245, 158, 11, 0.08) !important;
  border-color: rgba(245, 158, 11, 0.16) !important;
}
.status-indicator.running .status-dot {
  background-color: var(--tp-warning, #f59e0b);
  box-shadow: 0 0 6px var(--tp-warning);
  animation: pulse-dot 1.5s infinite ease-in-out;
}

/* 状态：等待中 (Pending) */
.status-indicator.pending {
  color: var(--tp-text-subtle, #94a3b8) !important;
  background: rgba(148, 163, 184, 0.06) !important;
  border-color: rgba(148, 163, 184, 0.12) !important;
}
.status-indicator.pending .status-dot {
  background-color: var(--tp-text-disabled, #64748b);
}

/* 状态：失败 (Failed) */
.status-indicator.failed {
  color: var(--tp-danger, #ef4444) !important;
  background: rgba(239, 68, 68, 0.08) !important;
  border-color: rgba(239, 68, 68, 0.16) !important;
}
.status-indicator.failed .status-dot {
  background-color: var(--tp-danger, #ef4444);
  box-shadow: 0 0 6px var(--tp-danger);
}

@keyframes pulse-dot {
  0%,
  100% {
    opacity: 0.4;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1.15);
  }
}

/* AI模型标签 */
.model-badge {
  display: inline-block;
  font-family: var(--tp-font-family-mono), monospace;
  font-size: 10.5px;
  color: var(--tp-text-secondary);
  background: var(--tp-surface-input);
  border: 1px solid var(--tp-border-subtle);
  border-radius: 4px;
  padding: 1px 6px;
  white-space: nowrap;
}

/* 用例微胶囊统计芯片组 (Metric Capsules) */
.metrics-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.metric-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  min-width: 22px;
  padding: 0 6px;
  border-radius: 99px !important; /* 纯圆角胶囊 */
  font-size: 10.5px;
  font-weight: 600;
  font-family: var(--tp-font-family-mono), monospace;
  border: 1px solid transparent;
}

/* 已生成 (Total) */
.metric-chip.total {
  background: var(--tp-surface-input);
  border-color: var(--tp-border-subtle);
  color: var(--tp-text-secondary);
}

/* 已采纳 (Adopted) */
.metric-chip.adopt {
  background: var(--tp-accent-success-soft, rgba(34, 197, 94, 0.1));
  border-color: var(--tp-accent-success-border, rgba(34, 197, 94, 0.2));
  color: var(--tp-success, #22c55e);
}

/* 已丢弃 (Discarded) */
.metric-chip.discard {
  background: rgba(100, 116, 139, 0.08);
  border-color: rgba(100, 116, 139, 0.16);
  color: var(--tp-text-subtle);
}

/* 精准耗时徽章 */
.duration-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--tp-text-secondary);
  font-family: var(--tp-font-family-mono), monospace;
}

.duration-badge.empty {
  color: var(--tp-text-disabled);
}

.duration-badge .clock-icon {
  font-size: 12px;
  color: var(--tp-text-subtle);
}

.duration-badge .unit {
  font-size: 9px;
  opacity: 0.6;
  margin-left: 0.5px;
  font-family: var(--tp-font-family-sans);
}

/* 文档单元格设计 */
.doc-title-cell {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  line-height: 18px;
}

.doc-title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tp-text-primary, var(--el-text-color-primary));
  font-weight: 600;
  font-size: 13px;
}

.doc-title-hint {
  margin-top: 1px;
  color: var(--tp-text-subtle, var(--el-text-color-secondary));
  font-size: 10.5px;
}

.source-badge {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border: 1px solid var(--tp-border-subtle);
  border-radius: 4px;
  background: var(--tp-surface-muted, var(--el-fill-color-light));
  color: var(--tp-text-secondary, var(--el-text-color-secondary));
  font-size: 11px;
}

.num-text {
  font-variant-numeric: tabular-nums;
  color: var(--tp-text-primary, var(--el-text-color-primary));
}

.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  padding: 24px;
}

.table-empty-title {
  color: var(--tp-text-primary, var(--el-text-color-primary));
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
}

.table-empty-desc {
  margin-top: 4px;
  color: var(--tp-text-muted, var(--el-text-color-secondary));
  font-size: 12px;
  line-height: 20px;
}

.table-empty-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

/* 分页 */
.pagination-wrap {
  margin-top: 10px;
  padding: 8px 0 0;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--tp-border-subtle, var(--el-border-color-lighter));
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 48px 0;
  color: var(--tp-text-muted, var(--el-text-color-secondary));
  font-size: 13px;
}

/* 智能生成对话框 */
.smart-doc-info {
  padding: 8px 12px;
  border-radius: var(--tp-radius-sm, 6px);
  background: var(--tp-surface-muted, var(--el-fill-color-light));
  font-size: 13px;
}

.smart-doc-label {
  color: var(--tp-text-secondary);
  font-weight: 500;
}

.smart-doc-name {
  color: var(--tp-text-primary);
  font-weight: 600;
}

.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.smart-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 4px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 13px;
  line-height: 1.5;
  margin-top: 8px;
}

.smart-hint .el-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.smart-result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 500;
  margin-bottom: 16px;
  color: var(--el-text-color-primary);
}

.smart-result-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.smart-result-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  background: var(--el-fill-color-blank);
}

.rec-reason {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.task-detail-body {
  min-height: 420px;
}

.task-meta {
  margin-bottom: 14px;
}

.task-meta-grid {
  display: grid;
  grid-template-columns: minmax(220px, 2fr) minmax(96px, 0.9fr) minmax(140px, 1.3fr) repeat(
      3,
      minmax(72px, 0.72fr)
    );
  gap: 8px;
}

.task-meta-item {
  min-height: 62px;
  padding: 10px 12px;
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-sm, 8px);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0.008));
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  overflow: hidden;
}

.task-meta-item--full {
  grid-column: 1 / -1;
  min-height: auto;
  align-items: flex-start;
}

.task-meta-label {
  font-size: 11px;
  line-height: 14px;
  color: var(--tp-text-subtle);
  font-weight: 600;
}

.task-meta-value {
  min-width: 0;
  color: var(--tp-text-primary);
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-meta-value.mono {
  font-family: var(--tp-font-family-mono), monospace;
  font-size: 12px;
}

.task-meta-value.num {
  font-family: var(--tp-font-family-mono), monospace;
  font-size: 18px;
  line-height: 20px;
}

.task-meta-value.success {
  color: var(--tp-success);
}

.task-meta-value.muted {
  color: var(--tp-text-muted);
}

.results-section {
  margin-top: 12px;
}

.results-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.results-title {
  font-size: 13px;
  font-weight: 600;
  margin: 0;
  color: var(--tp-text-primary);
}

.results-count {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  color: var(--tp-text-muted);
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid var(--tp-border-subtle);
  font-size: 11px;
}

.result-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 55vh;
  overflow-y: auto;
  padding-right: 6px;
}

.result-cards::-webkit-scrollbar {
  width: 4px;
}

.result-cards::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12) !important;
  border-radius: 99px !important;
}

.result-cards::-webkit-scrollbar-track {
  background: transparent !important;
}

.result-card {
  border: 1px solid rgba(255, 255, 255, 0.055);
  background: rgba(8, 10, 16, 0.34);
  border-radius: var(--tp-radius-md, 10px);
  padding: 13px 15px;
  transition: all 0.25s ease;
}

.result-card:hover {
  border-color: var(--tp-primary-light);
  background: rgba(167, 139, 250, 0.04);
}

.result-card.adopted {
  border-color: var(--tp-accent-success-border);
  background: rgba(34, 197, 94, 0.055);
}

.result-card.discarded {
  border-color: var(--tp-border-subtle);
  background-color: transparent;
  opacity: 0.5;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.result-title-row {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.result-header-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.result-seq {
  font-family: var(--tp-font-family-mono), monospace;
  font-size: 11px;
  color: var(--tp-text-muted, var(--el-text-color-secondary));
  font-weight: 500;
}

.result-title-text {
  font-weight: 600;
  color: var(--tp-text-primary, var(--el-text-color-primary));
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-level {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  font-family: var(--tp-font-family-mono), monospace;
  color: var(--tp-primary-light);
  background: var(--tp-p2-bg);
  border: 1px solid var(--tp-accent-primary-border);
}

.result-level.p0 {
  color: var(--tp-p0);
  background: var(--tp-p0-bg);
}

.result-level.p1 {
  color: var(--tp-p1);
  background: var(--tp-p1-bg);
}

.result-level.p3 {
  color: var(--tp-p3);
  background: var(--tp-p3-bg);
}

.result-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
}

.result-badge.adopted {
  background: var(--tp-accent-success-soft);
  color: var(--tp-success);
}

.result-badge.discarded {
  background: var(--tp-surface-input);
  color: var(--tp-text-muted);
}

.result-field {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 10px;
  font-size: 12px;
  color: var(--tp-text-secondary, var(--el-text-color-regular));
  margin-bottom: 8px;
}

.result-field--precondition {
  padding: 8px 10px;
  border-radius: var(--tp-radius-sm, 8px);
  background: rgba(255, 255, 255, 0.018);
}

.field-content {
  min-width: 0;
  line-height: 20px;
}

.field-label {
  font-weight: 700;
  color: var(--tp-text-subtle, var(--el-text-color-secondary));
  font-size: 11px;
}

.steps-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.steps-list li {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  column-gap: 8px;
  row-gap: 3px;
  padding: 5px 0;
}

.step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  color: var(--tp-text-muted);
  background: rgba(255, 255, 255, 0.035);
  font-family: var(--tp-font-family-mono), monospace;
  font-size: 10px;
}

.step-action {
  min-width: 0;
  line-height: 20px;
}

.step-expected {
  grid-column: 2;
  position: relative;
  padding-left: 14px;
  color: var(--tp-success, var(--el-color-success));
  font-weight: 500;
  line-height: 20px;
}

.step-expected::before {
  content: '→';
  position: absolute;
  left: 0;
  color: var(--tp-success);
  opacity: 0.75;
}

.result-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}

.fail-reason {
  color: var(--tp-danger);
  line-height: 20px;
}

:deep(.result-action-adopt) {
  height: 30px !important;
  padding: 0 14px !important;
  border-radius: var(--tp-radius-sm, 8px) !important;
}

:deep(.result-action-discard) {
  height: 30px !important;
  padding: 0 14px !important;
  border-radius: var(--tp-radius-sm, 8px) !important;
  color: var(--tp-text-secondary) !important;
}

/* ─── 统一组件高阶微观样式 (Premium Data Workspace) ─── */

/* 1. 工具栏 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 12px;
  padding: 8px 10px;
  background: var(--tp-surface-muted);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-sm, 6px);
}

.toolbar-left {
  display: flex;
  gap: 8px;
  align-items: center;
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

/* 2. 表单输入框 & 下拉选择 */
:deep(.el-input__wrapper) {
  border: 1px solid var(--tp-border-subtle) !important;
  background-color: var(--tp-surface-input) !important;
  box-shadow: none !important;
  border-radius: var(--tp-radius-sm, 6px) !important;
  padding: 0 10px !important;
  height: 32px !important;
  transition: all 0.2s ease !important;
}

:deep(.el-input__wrapper:hover) {
  border-color: var(--tp-border-strong, var(--tp-primary-light)) !important;
  background-color: var(--tp-surface-hover) !important;
}

:deep(.el-input__wrapper.is-focus) {
  border-color: var(--tp-primary) !important;
  box-shadow: 0 0 0 2px var(--tp-primary-lighter) !important;
  background-color: var(--tp-surface-hover) !important;
}

:deep(.el-select__wrapper) {
  border: 1px solid var(--tp-border-subtle) !important;
  background-color: var(--tp-surface-input) !important;
  box-shadow: none !important;
  border-radius: var(--tp-radius-sm, 6px) !important;
  height: 32px !important;
  transition: all 0.2s ease !important;
}

:deep(.el-select__wrapper:hover) {
  border-color: var(--tp-border-strong, var(--tp-primary-light)) !important;
  background-color: var(--tp-surface-hover) !important;
}

:deep(.el-select__wrapper.is-focus) {
  border-color: var(--tp-primary) !important;
  box-shadow: 0 0 0 2px var(--tp-primary-lighter) !important;
  background-color: var(--tp-surface-hover) !important;
}

/* 3. 按钮系列 */
:deep(.el-button--primary) {
  background: var(--tp-btn-bg, var(--tp-primary)) !important;
  border: none !important;
  border-radius: var(--tp-radius-sm, 6px) !important;
  font-weight: 500 !important;
  height: 32px !important;
  padding: 0 16px !important;
  color: var(--tp-btn-text, #ffffff) !important;
  box-shadow: var(--tp-btn-shadow) !important;
  transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
}

:deep(.el-button--primary:hover) {
  background: var(--tp-btn-bg-hover, var(--tp-primary-dark)) !important;
  box-shadow: var(--tp-btn-shadow-hover) !important;
}

:deep(.el-button--primary:active) {
  transform: none;
}

:deep(.el-button:not(.el-button--primary):not(.el-button--text):not(.el-button--danger)) {
  background-color: var(--tp-btn-plain-bg, var(--tp-surface-card)) !important;
  border: 1px solid var(--tp-btn-plain-border, var(--tp-border-subtle)) !important;
  border-radius: var(--tp-radius-sm, 6px) !important;
  color: var(--tp-btn-plain-text, var(--tp-text-primary)) !important;
  font-weight: 500 !important;
  height: 32px !important;
  padding: 0 16px !important;
  transition: all 0.2s ease !important;
}

:deep(.el-button:not(.el-button--primary):not(.el-button--text):not(.el-button--danger):hover) {
  border-color: var(--tp-primary) !important;
  background-color: rgba(139, 92, 246, 0.06) !important;
  color: var(--tp-primary) !important;
}

/* 4. 精密数据表格 */
:deep(.el-table) {
  border: 1px solid var(--tp-border-subtle) !important;
  border-radius: var(--tp-radius-md, 8px) !important;
  overflow: hidden !important;
  background-color: var(--tp-surface-card) !important;
}

.main-table {
  flex: 0 0 auto;
}

:deep(.el-table th.el-table__cell) {
  background-color: var(--tp-surface-header) !important;
  color: var(--tp-text-primary) !important;
  font-weight: 600 !important;
  font-size: 12px !important;
  border-bottom: 1px solid var(--tp-border-subtle) !important;
  height: 36px !important;
  padding: 0 !important;
}

:deep(.el-table td.el-table__cell) {
  border-bottom: 1px solid var(--tp-border-subtle) !important;
  font-size: 12px !important;
  color: var(--tp-text-secondary) !important;
  height: 40px !important;
  padding: 0 !important;
}

:deep(.el-table__expanded-cell) {
  padding: 8px 12px !important;
  background: var(--tp-surface-card) !important;
}

:deep(.el-table__expand-icon) {
  color: var(--tp-text-muted, var(--el-text-color-secondary));
}

:deep(.el-table .cell) {
  line-height: 20px !important;
}

:deep(.el-table .el-table__cell:last-child .cell) {
  padding-right: 10px !important;
}

:deep(.el-table .el-table__cell:first-child .cell) {
  padding-left: 10px !important;
}

:deep(.el-table__row) {
  transition: background-color 0.25s ease !important;
}

:deep(.el-table__row:hover > td.el-table__cell) {
  background-color: var(--tp-surface-row-hover, rgba(139, 92, 246, 0.04)) !important;
}

:deep(.el-table__row:hover > td.el-table__cell:first-child) {
  box-shadow: inset 3px 0 0 0 var(--tp-primary) !important;
}

:deep(.el-button--text),
:deep(.el-button--danger.is-link) {
  font-weight: 500 !important;
  font-size: 12px !important;
  padding: 4px 6px !important;
  border-radius: 4px !important;
  transition: all 0.2s ease !important;
}

:deep(.el-button--text) {
  color: var(--tp-primary) !important;
}

:deep(.el-button--text:hover) {
  background-color: var(--tp-primary-lighter) !important;
}

:deep(.el-button--danger.is-link) {
  color: var(--tp-danger) !important;
}

:deep(.el-button--danger.is-link:hover) {
  background-color: var(--tp-accent-danger-soft) !important;
}

/* 6. 对话框 & 表单 */
:deep(.el-dialog) {
  background-color: var(--tp-surface-elevated, var(--tp-surface-card)) !important;
  border: 1px solid var(--tp-border-subtle) !important;
  border-radius: var(--tp-radius-md, 12px) !important;
  box-shadow: var(--tp-shadow-md) !important;
}

:deep(.el-dialog__title) {
  font-size: 15px !important;
  font-weight: 600 !important;
  color: var(--tp-text-primary) !important;
}

:deep(.el-dialog__body) {
  padding: 16px 20px !important;
}

:deep(.el-dialog__footer) {
  border-top: 1px solid var(--tp-border-subtle) !important;
  padding: 10px 20px !important;
}

:deep(.el-form-item__label) {
  color: var(--tp-text-primary) !important;
  font-size: 13px !important;
  font-weight: 500 !important;
}

:deep(.el-textarea__inner) {
  background-color: var(--tp-surface-input) !important;
  border: 1px solid var(--tp-border-subtle) !important;
  border-radius: var(--tp-radius-sm, 6px) !important;
  color: var(--tp-text-primary) !important;
  box-shadow: none !important;
  font-size: 13px !important;
  padding: 8px 10px !important;
}

:deep(.el-textarea__inner:hover) {
  border-color: var(--tp-border-strong) !important;
}

:deep(.el-textarea__inner:focus) {
  border-color: var(--tp-primary) !important;
  box-shadow: 0 0 0 2px var(--tp-primary-lighter) !important;
}

/* 底部统计聚合卡片 (Consistent with "测试智编" / ai-script style) */
.ai-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 14px;
}

.ai-stat-card,
.ai-quickstart-card {
  padding: 16px;
  border-radius: var(--tp-radius-lg, 12px);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--tp-border-subtle);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: all var(--tp-transition, 0.25s);
}

.ai-stat-card:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--tp-primary-light);
}

.ai-stat-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  color: var(--tp-text-secondary);
}

.ai-stat-label .material-symbols-outlined {
  font-size: 15px;
  opacity: 0.8;
}

.ai-stat-value {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 2px;
  color: var(--tp-text-primary);
  font-family: var(--tp-font-family-mono), monospace;
}

.ai-stat-desc {
  font-size: 11px;
  color: var(--tp-text-muted);
}

.ai-stat-bar {
  height: 4px;
  background: var(--tp-surface-input);
  border-radius: 4px;
  overflow: hidden;
  margin-top: 12px;
}

.ai-stat-bar-fill {
  height: 100%;
  border-radius: 4px;
  background: var(--tp-primary);
  transition: width 0.6s ease;
}

.ai-stat-segments {
  display: flex;
  gap: 4px;
  margin-top: 12px;
}

.ai-stat-segment {
  flex: 1;
  height: 4px;
  background: var(--tp-surface-input);
  border-radius: 2px;
  transition: all 0.3s ease;
}

.ai-stat-segment.is-active {
  background: var(--tp-primary);
  box-shadow: 0 0 6px var(--tp-primary);
}

/* 快速入口卡片 */
.ai-quickstart-card {
  background: linear-gradient(135deg, rgba(167, 139, 250, 0.05) 0%, rgba(214, 179, 106, 0.02) 100%);
  border-color: rgba(167, 139, 250, 0.15);
  cursor: pointer;
}

.ai-quickstart-card:hover {
  border-color: var(--tp-primary);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  transform: translateY(-1px);
}

.ai-quickstart-content h4 {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--tp-text-primary);
}

.ai-quickstart-content p {
  margin: 0;
  font-size: 11.5px;
  color: var(--tp-text-muted);
  line-height: 1.5;
}

@media (max-width: 960px) {
  .card-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .card-stats {
    justify-content: flex-start;
  }

  .flow-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .flow-divider {
    display: none;
  }

  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .toolbar-left,
  .toolbar-right {
    width: 100%;
    flex-wrap: wrap;
  }

  .ai-stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
