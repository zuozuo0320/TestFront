<script setup lang="ts">
/**
 * 生成任务列表 + 智能生成 + 详情子组件
 */
import { ref, computed } from 'vue'
import { InfoFilled, SuccessFilled } from '@element-plus/icons-vue'
import { useGenTasks } from '@/composables/useRequirementGen'
import type { SmartGeneratePayload, SmartGenerateResult } from '@/api/requirementGen'
import type { RequirementDoc } from '@/api/requirementDoc'
import { useRequirementDocs } from '@/composables/useRequirementGen'

const {
  tasks,
  total,
  loading,
  page,
  pageSize,
  statusFilter,
  currentTask,
  currentResults,
  detailLoading,
  smartGenerating,
  fetchTasks,
  handleSmartGenerate,
  fetchTaskDetail,
  handleAdopt,
  handleDiscard,
  handleClose,
} = useGenTasks()

const { docs } = useRequirementDocs()

// 智能生成对话框
const showSmartDialog = ref(false)
const smartForm = ref<SmartGeneratePayload>({
  requirement_doc_id: 0,
  task_name_prefix: '',
  max_cases_per_skill: 20,
  default_level: 'P2',
  extra_prompt: '',
})
const smartResultData = ref<SmartGenerateResult | null>(null)

// 详情对话框
const showDetailDialog = ref(false)

/** 可选的文档列表（仅已解析） */
const parsedDocs = computed(() =>
  docs.value.filter((d: RequirementDoc) => d.parse_status === 'parsed'),
)

function openSmartGenerate() {
  smartForm.value = {
    requirement_doc_id: 0,
    task_name_prefix: '',
    max_cases_per_skill: 20,
    default_level: 'P2',
    extra_prompt: '',
  }
  smartResultData.value = null
  showSmartDialog.value = true
}

async function submitSmartGenerate() {
  if (!smartForm.value.requirement_doc_id) return
  const result = await handleSmartGenerate(smartForm.value)
  if (result) {
    smartResultData.value = result
  }
}

function openDetail(taskId: number) {
  fetchTaskDetail(taskId)
  showDetailDialog.value = true
}

function handlePageChange(p: number) {
  page.value = p
  fetchTasks()
}

function onFilterChange() {
  page.value = 1
  fetchTasks()
}

/** 状态标签 */
function statusLabel(status: string) {
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

function statusType(status: string) {
  const map: Record<string, string> = {
    pending: 'info',
    running: 'warning',
    success: 'success',
    failed: 'danger',
    partially_closed: 'warning',
    fully_closed: 'info',
  }
  return map[status] || 'info'
}

/** 解析步骤 JSON */
function parseSteps(stepsJson: string): Array<{ action: string; expected: string }> {
  try {
    return JSON.parse(stepsJson)
  } catch {
    return []
  }
}
</script>

<template>
  <div class="task-list-container">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-select
          v-model="statusFilter"
          placeholder="任务状态"
          clearable
          style="width: 140px"
          @change="onFilterChange"
        >
          <el-option label="等待中" value="pending" />
          <el-option label="生成中" value="running" />
          <el-option label="已完成" value="success" />
          <el-option label="失败" value="failed" />
          <el-option label="已关闭" value="fully_closed" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <el-button type="primary" @click="openSmartGenerate">智能生成</el-button>
      </div>
    </div>

    <!-- 任务列表 -->
    <el-table v-loading="loading" :data="tasks" stripe style="width: 100%">
      <el-table-column prop="task_name" label="任务名称" min-width="180" show-overflow-tooltip />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="模型" width="140" prop="ai_model_snapshot" show-overflow-tooltip />
      <el-table-column label="生成/采纳/丢弃" width="140">
        <template #default="{ row }">
          {{ row.generated_count }} / {{ row.adopted_count }} / {{ row.discarded_count }}
        </template>
      </el-table-column>
      <el-table-column label="耗时" width="80">
        <template #default="{ row }">
          {{ row.duration_ms ? (row.duration_ms / 1000).toFixed(1) + 's' : '-' }}
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="160">
        <template #default="{ row }">
          {{ row.created_at?.slice(0, 16).replace('T', ' ') }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link size="small" @click="openDetail(row.id)">详情</el-button>
          <el-button
            v-if="row.status === 'success'"
            type="warning"
            link
            size="small"
            @click="handleClose(row.id)"
          >
            关闭
          </el-button>
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

    <!-- 空状态 -->
    <div v-if="!loading && tasks.length === 0" class="empty-state">
      <p>暂无生成任务，点击"新建生成任务"开始</p>
    </div>

    <!-- 智能生成对话框 -->
    <el-dialog
      v-model="showSmartDialog"
      title="智能生成测试用例"
      width="600px"
      :close-on-click-modal="false"
    >
      <!-- 设置表单 -->
      <el-form v-if="!smartResultData" :model="smartForm" label-width="120px">
        <el-form-item label="需求文档" required>
          <el-select
            v-model="smartForm.requirement_doc_id"
            placeholder="选择已解析的文档"
            style="width: 100%"
          >
            <el-option v-for="doc in parsedDocs" :key="doc.id" :label="doc.title" :value="doc.id" />
          </el-select>
          <div v-if="parsedDocs.length === 0" class="form-tip">
            暂无已解析文档，请先上传并等待解析完成
          </div>
        </el-form-item>
        <el-form-item label="任务名前缀">
          <el-input v-model="smartForm.task_name_prefix" placeholder="可选，留空则使用文档标题" />
        </el-form-item>
        <el-form-item label="每类最大条数">
          <el-input-number v-model="smartForm.max_cases_per_skill" :min="5" :max="50" />
          <span class="form-tip" style="margin-left: 8px">每个匹配的测试策略最多生成的用例数</span>
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

      <!-- 生成结果展示 -->
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
          <el-button @click="showSmartDialog = false">取消</el-button>
          <el-button
            type="primary"
            :loading="smartGenerating"
            :disabled="!smartForm.requirement_doc_id"
            @click="submitSmartGenerate"
          >
            {{ smartGenerating ? 'AI 分析中...' : '开始智能生成' }}
          </el-button>
        </template>
        <template v-else>
          <el-button type="primary" @click="showSmartDialog = false">完成</el-button>
        </template>
      </template>
    </el-dialog>

    <!-- 任务详情 & 产物预览对话框 -->
    <el-dialog v-model="showDetailDialog" title="任务详情" width="900px" top="5vh">
      <div v-loading="detailLoading">
        <!-- 任务信息 -->
        <div v-if="currentTask" class="task-meta">
          <el-descriptions :column="3" border size="small">
            <el-descriptions-item label="任务名称">
              {{ currentTask.task_name }}
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="statusType(currentTask.status)" size="small">
                {{ statusLabel(currentTask.status) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="模型">
              {{ currentTask.ai_model_snapshot }}
            </el-descriptions-item>
            <el-descriptions-item label="生成数">
              {{ currentTask.generated_count }}
            </el-descriptions-item>
            <el-descriptions-item label="已采纳">
              {{ currentTask.adopted_count }}
            </el-descriptions-item>
            <el-descriptions-item label="已丢弃">
              {{ currentTask.discarded_count }}
            </el-descriptions-item>
            <el-descriptions-item v-if="currentTask.fail_reason" label="失败原因" :span="3">
              <span class="fail-reason">{{ currentTask.fail_reason }}</span>
            </el-descriptions-item>
          </el-descriptions>
        </div>

        <!-- 用例列表 -->
        <div v-if="currentResults.length > 0" class="results-section">
          <h4 class="section-title">用例列表（{{ currentResults.length }} 条）</h4>
          <div class="result-cards">
            <div
              v-for="result in currentResults"
              :key="result.id"
              class="result-card"
              :class="{ adopted: result.adopted, discarded: result.discarded }"
            >
              <div class="result-header">
                <span class="result-seq">#{{ result.seq_no }}</span>
                <span class="result-title">{{ result.title }}</span>
                <el-tag size="small" class="result-level">{{ result.level }}</el-tag>
                <span v-if="result.adopted" class="result-badge adopted">已采纳</span>
                <span v-if="result.discarded" class="result-badge discarded">已丢弃</span>
              </div>
              <div v-if="result.precondition" class="result-field">
                <span class="field-label">前置条件：</span>
                {{ result.precondition }}
              </div>
              <div v-if="parseSteps(result.steps).length" class="result-field">
                <span class="field-label">测试步骤：</span>
                <ol class="steps-list">
                  <li v-for="(step, idx) in parseSteps(result.steps)" :key="idx">
                    <span>{{ step.action }}</span>
                    <span v-if="step.expected" class="step-expected">→ {{ step.expected }}</span>
                  </li>
                </ol>
              </div>
              <div v-if="!result.adopted && !result.discarded" class="result-actions">
                <el-button type="primary" size="small" @click="handleAdopt(result.id)">
                  采纳
                </el-button>
                <el-button size="small" @click="handleDiscard(result.id)">丢弃</el-button>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="!detailLoading" class="empty-state">
          <p>暂无用例数据</p>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.task-list-container {
  min-height: 200px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 8px;
}

.toolbar-left {
  display: flex;
  gap: 6px;
}

.toolbar-right {
  display: flex;
  gap: 6px;
}

.pagination-wrap {
  margin-top: 10px;
  padding: 8px 0 0;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--tp-border-subtle, var(--el-border-color-lighter));
}

.empty-state {
  text-align: center;
  padding: 48px 0;
  color: var(--tp-text-muted, var(--el-text-color-secondary));
  font-size: 13px;
}

.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.task-meta {
  margin-bottom: 20px;
}

.results-section {
  margin-top: 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px;
}

.result-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 60vh;
  overflow-y: auto;
}

.result-card {
  border: 1px solid var(--tp-border-subtle);
  background-color: var(--tp-surface-muted, #f9fafb);
  border-radius: var(--tp-radius-sm, 6px);
  padding: 12px 16px;
  transition: all 0.25s ease;
}

.result-card:hover {
  border-color: var(--tp-primary-light);
  box-shadow: var(--tp-shadow-sm);
}

.result-card.adopted {
  border-color: var(--tp-success);
  background: var(--tp-accent-success-soft, var(--el-color-success-light-9));
}

.result-card.discarded {
  border-color: var(--tp-border-subtle);
  background-color: transparent;
  opacity: 0.5;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.result-seq {
  font-size: 12px;
  color: var(--tp-text-muted, var(--el-text-color-secondary));
  font-weight: 500;
}

.result-title {
  font-weight: 600;
  color: var(--tp-text-primary, var(--el-text-color-primary));
  flex: 1;
}

.result-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 500;
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
  font-size: 13px;
  color: var(--tp-text-secondary, var(--el-text-color-regular));
  margin-bottom: 6px;
}

.field-label {
  font-weight: 500;
  color: var(--tp-text-primary, var(--el-text-color-primary));
}

.steps-list {
  margin: 4px 0 0 16px;
  padding: 0;
}

.steps-list li {
  margin-bottom: 2px;
}

.step-expected {
  color: var(--tp-success, var(--el-color-success));
  font-weight: 500;
}

.result-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}

.fail-reason {
  color: var(--el-color-danger);
}

/* 智能生成提示 */
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

/* 智能生成结果 */
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
</style>
