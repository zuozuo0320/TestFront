<script setup lang="ts">
/**
 * 场景编排工作台页面。
 *
 * 使用三栏资产编排布局，围绕 DSL、生成代码、验证记录和 AI 建议形成闭环。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  AssertionAssetTypeLabel,
  CompositionValidationStatusColor,
  CompositionValidationStatusLabel,
  FlowAssetStatusLabel,
  ScenarioCodeEditStatus,
  ScenarioCodeEditStatusColor,
  ScenarioCodeEditStatusLabel,
  ScenarioCompositionStatusColor,
  ScenarioCompositionStatusLabel,
  ScenarioStepType,
  ScenarioStepTypeLabel,
  ValidationStatusColor,
  ValidationStatusLabel,
  type AiScenarioStep,
} from '@/api/aiScript'
import { useAiCompositionWorkbench } from '@/composables/useAiCompositionWorkbench'
import { formatBeijingDateTime } from '@/utils/time'

const route = useRoute()
const router = useRouter()
const compositionId = Number(route.params.compositionId)

const {
  ScenarioStepType: StepType,
  composition,
  flows,
  assertions,
  versions,
  validations,
  references,
  versionDiff,
  aiPlan,
  visibleAiPlanSteps,
  selectedStep,
  activeAssetTab,
  activeBottomTab,
  loading,
  assetLoading,
  saving,
  generating,
  validating,
  publishing,
  aiPlanning,
  versionDiffLoading,
  errorMessage,
  stepDialogVisible,
  versionDiffVisible,
  isEditingStep,
  codeEditMode,
  codeDraft,
  codeChangeSummary,
  lockCodeAfterSave,
  scenarioForm,
  stepForm,
  steps,
  dslText,
  generatedCode,
  latestValidationLogs,
  dirty,
  codeDirty,
  locked,
  permissionDenied,
  canGenerate,
  canValidate,
  canPublish,
  canDeleteComposition,
  canSaveScenario,
  canToggleCodeLock,
  hasBlockingStepIssues,
  stepIssueMap,
  selectedStepIssues,
  validationForm,
  validationFormErrors,
  loadWorkbench,
  saveScenario,
  openStepDialog,
  openEditStepDialog,
  submitStep,
  removeStep,
  moveStep,
  reorderStepsByIds,
  generateCode,
  enterCodeEditMode,
  cancelCodeEditMode,
  saveManualCode,
  toggleCodeLock,
  validateComposition,
  publishComposition,
  showVersionDiff,
  rollbackVersion,
  archiveComposition,
  deleteComposition,
  loadAiOptimization,
  loadAiSuggestions,
  acceptAiStep,
  ignoreAiStep,
  isLowConfidenceStep,
  scenarioFieldError,
  stepFieldError,
  validationFieldError,
  selectStep,
} = useAiCompositionWorkbench(compositionId)

const atomicActions = [
  { key: 'goto', label: '页面跳转', desc: '打开指定 URL' },
  { key: 'click', label: '点击元素', desc: '通过选择器点击' },
  { key: 'fill', label: '输入文本', desc: '填写表单字段' },
  { key: 'wait', label: '等待', desc: '等待毫秒数' },
] as const

const canShowWorkbench = computed(() => Boolean(composition.value))
const draggingStepId = ref<number | null>(null)

onMounted(() => {
  loadWorkbench()
})

function getStepSubTitle(step: AiScenarioStep) {
  if (step.stepType === ScenarioStepType.FLOW_CALL)
    return step.flowName || `固定场景 #${step.refFlowId}`
  if (step.stepType === ScenarioStepType.ASSERTION)
    return step.assertionName || `断言 #${step.refAssertionId}`
  if (step.stepType === ScenarioStepType.ATOMIC_ACTION) return step.atomicAction || '原子操作'
  if (step.stepType === ScenarioStepType.CODE_BLOCK)
    return step.manualReviewed ? '已审核代码块' : '待审核代码块'
  return `${Math.round((step.aiConfidence || 0) * 100)}% 置信度`
}

function getStatusLabel(status?: string) {
  if (!status) return '-'
  return (
    ScenarioCompositionStatusLabel[status as keyof typeof ScenarioCompositionStatusLabel] || status
  )
}

function getStatusColor(status?: string) {
  if (!status) return 'info'
  return (
    ScenarioCompositionStatusColor[status as keyof typeof ScenarioCompositionStatusColor] || 'info'
  )
}

function getValidationLabel(status?: string) {
  if (!status) return '-'
  return ValidationStatusLabel[status as keyof typeof ValidationStatusLabel] || status
}

function getValidationColor(status?: string) {
  if (!status) return 'info'
  return ValidationStatusColor[status as keyof typeof ValidationStatusColor] || 'info'
}

function getRunStatusLabel(status?: string) {
  if (!status) return '-'
  return (
    CompositionValidationStatusLabel[status as keyof typeof CompositionValidationStatusLabel] ||
    status
  )
}

function getRunStatusColor(status?: string) {
  if (!status) return 'info'
  return (
    CompositionValidationStatusColor[status as keyof typeof CompositionValidationStatusColor] ||
    'info'
  )
}

function diffLinePrefix(kind: string) {
  if (kind === 'added') return '+'
  if (kind === 'removed') return '-'
  return ' '
}

function diffLineClass(kind: string) {
  return {
    added: kind === 'added',
    removed: kind === 'removed',
  }
}

function getStepIssuesFor(step: AiScenarioStep) {
  return stepIssueMap.value.get(step.id) || []
}

function hasStepError(step: AiScenarioStep) {
  return getStepIssuesFor(step).some((issue) => issue.level === 'error')
}

function handleStepDragStart(step: AiScenarioStep, event: DragEvent) {
  draggingStepId.value = step.id
  event.dataTransfer?.setData('text/plain', String(step.id))
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

async function handleStepDrop(targetStep: AiScenarioStep) {
  const sourceId = draggingStepId.value
  draggingStepId.value = null
  if (!sourceId || sourceId === targetStep.id) return
  const nextSteps = [...steps.value]
  const sourceIndex = nextSteps.findIndex((item) => item.id === sourceId)
  const targetIndex = nextSteps.findIndex((item) => item.id === targetStep.id)
  if (sourceIndex < 0 || targetIndex < 0) return
  const [removed] = nextSteps.splice(sourceIndex, 1)
  if (!removed) return
  nextSteps.splice(targetIndex, 0, removed)
  await reorderStepsByIds(nextSteps.map((item) => item.id))
}
</script>

<template>
  <div class="workbench-page">
    <section class="workbench-topbar">
      <div class="workbench-title">
        <el-button link type="primary" @click="router.push('/ai-script/compositions')">
          <span class="material-symbols-outlined">arrow_back</span>
          返回
        </el-button>
        <div>
          <span class="workbench-eyebrow">场景编排工作台</span>
          <h1>{{ composition?.scenarioName || '场景编排' }}</h1>
        </div>
        <div v-if="composition" class="status-row">
          <el-tag :type="getStatusColor(composition.status)" effect="light">
            {{ getStatusLabel(composition.status) }}
          </el-tag>
          <el-tag :type="getValidationColor(composition.latestValidationStatus)" effect="light">
            {{ getValidationLabel(composition.latestValidationStatus) }}
          </el-tag>
          <el-tag
            :type="
              ScenarioCodeEditStatusColor[
                composition.codeEditStatus || ScenarioCodeEditStatus.AUTO_GENERATED
              ]
            "
            effect="light"
          >
            {{
              ScenarioCodeEditStatusLabel[
                composition.codeEditStatus || ScenarioCodeEditStatus.AUTO_GENERATED
              ]
            }}
          </el-tag>
          <el-tag v-if="dirty" type="warning" effect="light">未保存</el-tag>
          <el-tag v-if="permissionDenied" type="info" effect="light">只读</el-tag>
          <span>R{{ composition.revision }}</span>
        </div>
      </div>
      <div class="workbench-actions">
        <el-button :loading="saving" :disabled="!canSaveScenario" @click="saveScenario">
          保存
        </el-button>
        <el-button :loading="aiPlanning" :disabled="!canShowWorkbench" @click="loadAiOptimization">
          AI 优化
        </el-button>
        <el-button :loading="aiPlanning" :disabled="!canShowWorkbench" @click="loadAiSuggestions">
          断言建议
        </el-button>
        <el-button :loading="generating" :disabled="!canGenerate" @click="generateCode">
          生成代码
        </el-button>
        <el-button :loading="validating" :disabled="!canValidate" @click="validateComposition">
          验证
        </el-button>
        <el-button
          type="primary"
          :loading="publishing"
          :disabled="!canPublish"
          @click="publishComposition"
        >
          发布
        </el-button>
      </div>
    </section>

    <el-alert v-if="errorMessage" type="error" :title="errorMessage" show-icon :closable="false" />

    <el-alert
      v-if="hasBlockingStepIssues"
      class="workbench-warning"
      type="warning"
      title="编排存在未处理的阻断项，请先修复缺失引用、参数或审核状态后再生成代码。"
      show-icon
      :closable="false"
    />

    <el-skeleton v-if="loading" :rows="12" animated />

    <section v-else-if="composition" class="workbench-main">
      <aside class="asset-library">
        <el-tabs v-model="activeAssetTab" stretch>
          <el-tab-pane label="固定场景" name="flows" />
          <el-tab-pane label="断言" name="assertions" />
          <el-tab-pane label="原子操作" name="atomic" />
        </el-tabs>

        <div v-loading="assetLoading" class="asset-list">
          <template v-if="activeAssetTab === 'flows'">
            <button
              v-for="flow in flows"
              :key="flow.id"
              class="asset-card"
              type="button"
              @click="openStepDialog(StepType.FLOW_CALL, flow)"
            >
              <strong>{{ flow.flowName }}</strong>
              <span>{{ flow.flowKey }}</span>
              <small>
                {{ FlowAssetStatusLabel[flow.status] }}
                ·
                {{ ValidationStatusLabel[flow.latestValidationStatus] }}
              </small>
            </button>
            <div v-if="flows.length === 0" class="empty-line">暂无已发布固定场景</div>
          </template>

          <template v-else-if="activeAssetTab === 'assertions'">
            <button
              v-for="assertion in assertions"
              :key="assertion.id"
              class="asset-card"
              type="button"
              @click="openStepDialog(StepType.ASSERTION, assertion)"
            >
              <strong>{{ assertion.assertionName }}</strong>
              <span>{{ assertion.assertionKey }}</span>
              <small>{{ AssertionAssetTypeLabel[assertion.assertionType] }}</small>
            </button>
            <div v-if="assertions.length === 0" class="empty-line">暂无已发布断言</div>
          </template>

          <template v-else>
            <button
              v-for="action in atomicActions"
              :key="action.key"
              class="asset-card"
              type="button"
              @click="openStepDialog(StepType.ATOMIC_ACTION)"
            >
              <strong>{{ action.label }}</strong>
              <span>{{ action.key }}</span>
              <small>{{ action.desc }}</small>
            </button>
            <button class="asset-card" type="button" @click="openStepDialog(StepType.CODE_BLOCK)">
              <strong>自定义代码块</strong>
              <span>CODE_BLOCK</span>
              <small>需要人工审核后才能生成</small>
            </button>
          </template>
        </div>
      </aside>

      <section class="step-stage">
        <div class="scenario-editor">
          <el-form label-position="top" :model="scenarioForm">
            <el-form-item
              label="场景名称"
              :error="scenarioFieldError('scenario_name', 'ScenarioName')"
            >
              <el-input v-model="scenarioForm.scenarioName" />
            </el-form-item>
            <el-form-item label="描述">
              <el-input v-model="scenarioForm.description" type="textarea" :rows="2" />
            </el-form-item>
          </el-form>
        </div>

        <div class="steps-panel">
          <div class="panel-heading">
            <h2>编排步骤</h2>
            <el-button size="small" @click="openStepDialog(StepType.ATOMIC_ACTION)">
              添加原子操作
            </el-button>
          </div>
          <div v-if="steps.length === 0" class="empty-steps">
            <span class="material-symbols-outlined">schema</span>
            <p>从左侧资产库添加固定场景、断言或原子操作。</p>
          </div>
          <div v-else class="step-list">
            <button
              v-for="(step, index) in steps"
              :key="step.id"
              class="step-card"
              :class="{
                active: selectedStep?.id === step.id,
                disabled: !step.enabled,
                dragging: draggingStepId === step.id,
                'has-error': hasStepError(step),
              }"
              type="button"
              draggable="true"
              @click="selectStep(step)"
              @dragstart="handleStepDragStart(step, $event)"
              @dragover.prevent
              @drop.prevent="handleStepDrop(step)"
              @dragend="draggingStepId = null"
            >
              <span class="step-no">{{ index + 1 }}</span>
              <div class="step-main">
                <strong>{{ step.stepName }}</strong>
                <small>
                  {{ ScenarioStepTypeLabel[step.stepType] }} · {{ getStepSubTitle(step) }}
                </small>
              </div>
              <el-tag
                v-if="getStepIssuesFor(step).length"
                class="step-issue-badge"
                :type="hasStepError(step) ? 'danger' : 'warning'"
                effect="light"
                size="small"
              >
                {{ getStepIssuesFor(step).length }} {{ hasStepError(step) ? '待处理' : '提示' }}
              </el-tag>
              <div class="step-actions">
                <el-button
                  link
                  size="small"
                  :disabled="index === 0"
                  @click.stop="moveStep(step, -1)"
                >
                  上移
                </el-button>
                <el-button
                  link
                  size="small"
                  :disabled="index === steps.length - 1"
                  @click.stop="moveStep(step, 1)"
                >
                  下移
                </el-button>
              </div>
            </button>
          </div>
        </div>
      </section>

      <aside class="config-panel">
        <div class="panel-heading">
          <h2>步骤配置</h2>
          <el-button
            v-if="selectedStep"
            link
            type="primary"
            @click="openEditStepDialog(selectedStep)"
          >
            编辑
          </el-button>
        </div>
        <template v-if="selectedStep">
          <div class="config-summary">
            <strong>{{ selectedStep.stepName }}</strong>
            <el-tag effect="light">{{ ScenarioStepTypeLabel[selectedStep.stepType] }}</el-tag>
          </div>
          <div v-if="selectedStepIssues.length" class="issue-list" aria-live="polite">
            <div
              v-for="issue in selectedStepIssues"
              :key="issue.message"
              class="issue-item"
              :class="issue.level"
            >
              <span class="material-symbols-outlined">
                {{ issue.level === 'error' ? 'error' : 'warning' }}
              </span>
              <span>{{ issue.message }}</span>
            </div>
          </div>
          <dl class="config-list">
            <div>
              <dt>引用资产</dt>
              <dd>{{ getStepSubTitle(selectedStep) }}</dd>
            </div>
            <div>
              <dt>启用状态</dt>
              <dd>{{ selectedStep.enabled ? '启用' : '禁用' }}</dd>
            </div>
            <div>
              <dt>人工审核</dt>
              <dd>{{ selectedStep.manualReviewed ? '已审核' : '未审核' }}</dd>
            </div>
          </dl>
          <div class="config-block">
            <h3>参数映射</h3>
            <pre>{{ JSON.stringify(selectedStep.paramMapping || {}, null, 2) }}</pre>
          </div>
          <div class="config-block">
            <h3>输出映射</h3>
            <pre>{{ JSON.stringify(selectedStep.outputMapping || {}, null, 2) }}</pre>
          </div>
          <div class="config-actions">
            <el-button type="primary" plain @click="openEditStepDialog(selectedStep)">
              编辑步骤
            </el-button>
            <el-button type="danger" plain @click="removeStep(selectedStep)">删除步骤</el-button>
          </div>
        </template>
        <div v-else class="empty-line">请选择一个步骤</div>
      </aside>
    </section>

    <section v-if="composition" class="bottom-panel">
      <el-tabs v-model="activeBottomTab">
        <el-tab-pane label="DSL" name="dsl">
          <pre class="code-preview">{{ dslText }}</pre>
        </el-tab-pane>
        <el-tab-pane label="生成代码" name="code">
          <section class="code-panel">
            <div class="code-panel-toolbar">
              <div class="code-state">
                <el-tag
                  :type="
                    ScenarioCodeEditStatusColor[
                      composition.codeEditStatus || ScenarioCodeEditStatus.AUTO_GENERATED
                    ]
                  "
                  effect="light"
                >
                  {{
                    ScenarioCodeEditStatusLabel[
                      composition.codeEditStatus || ScenarioCodeEditStatus.AUTO_GENERATED
                    ]
                  }}
                </el-tag>
                <span v-if="composition.codeChangeSummary">
                  {{ composition.codeChangeSummary }}
                </span>
                <span v-if="composition.manualPatchedAt">
                  {{ formatBeijingDateTime(composition.manualPatchedAt) }}
                </span>
              </div>
              <div class="code-actions">
                <template v-if="codeEditMode">
                  <el-button :disabled="saving" @click="cancelCodeEditMode">取消编辑</el-button>
                  <el-button
                    type="primary"
                    :loading="saving"
                    :disabled="!codeDirty"
                    @click="saveManualCode"
                  >
                    保存人工代码
                  </el-button>
                </template>
                <template v-else>
                  <el-button :disabled="permissionDenied" @click="enterCodeEditMode">
                    编辑代码
                  </el-button>
                  <el-button
                    v-if="locked"
                    :loading="saving"
                    :disabled="!canToggleCodeLock"
                    @click="toggleCodeLock(false)"
                  >
                    解除锁定
                  </el-button>
                  <el-button
                    v-else
                    :loading="saving"
                    :disabled="!canToggleCodeLock"
                    @click="toggleCodeLock(true)"
                  >
                    锁定代码
                  </el-button>
                </template>
              </div>
            </div>
            <template v-if="codeEditMode">
              <el-input
                v-model="codeDraft"
                class="code-editor"
                type="textarea"
                :rows="18"
                spellcheck="false"
              />
              <div class="code-edit-options">
                <el-input
                  v-model="codeChangeSummary"
                  placeholder="变更说明"
                  maxlength="500"
                  show-word-limit
                />
                <el-checkbox v-model="lockCodeAfterSave">保存后锁定</el-checkbox>
              </div>
            </template>
            <pre v-else class="code-preview">{{ generatedCode || '暂无生成代码' }}</pre>
          </section>
        </el-tab-pane>
        <el-tab-pane label="执行日志" name="logs">
          <div v-if="latestValidationLogs.length === 0" class="empty-line">暂无执行日志</div>
          <div v-else class="log-list">
            <div v-for="(log, index) in latestValidationLogs" :key="index" class="log-item">
              <el-tag size="small" effect="light">{{ log.level || 'INFO' }}</el-tag>
              <span>{{ log.timestamp || '-' }}</span>
              <strong>{{ log.message || JSON.stringify(log) }}</strong>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="验证历史" name="validations">
          <section class="validation-config">
            <div class="validation-config-title">
              <strong>验证参数</strong>
              <span>执行前可指定环境和变量，变量需保持 JSON 对象。</span>
            </div>
            <el-form label-position="top" :model="validationForm">
              <el-form-item
                label="执行环境"
                :error="validationFieldError('environment', 'Environment')"
              >
                <el-input v-model="validationForm.environment" placeholder="test" />
              </el-form-item>
              <el-form-item
                label="变量 JSON"
                :error="
                  validationFormErrors.variablesText ||
                  validationFieldError('variables', 'Variables')
                "
              >
                <el-input
                  v-model="validationForm.variablesText"
                  type="textarea"
                  :rows="4"
                  spellcheck="false"
                  placeholder='{"taskName":"自动化任务"}'
                />
              </el-form-item>
            </el-form>
          </section>
          <div v-if="validations.length === 0" class="empty-line">暂无验证记录</div>
          <div v-else class="history-list">
            <div v-for="item in validations" :key="item.id" class="validation-card">
              <div class="history-item">
                <el-tag :type="getRunStatusColor(item.status)" effect="light">
                  {{ getRunStatusLabel(item.status) }}
                </el-tag>
                <strong>{{ item.executorJobId }}</strong>
                <span>{{ formatBeijingDateTime(item.createdAt) }}</span>
                <span>{{ item.durationMs }} ms</span>
              </div>
              <div v-if="item.assertionResults?.length" class="assertion-result-list">
                <span v-for="result in item.assertionResults" :key="result.id">
                  {{ result.stepId }} · {{ getRunStatusLabel(result.status) }}
                </span>
              </div>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="AI 建议" name="ai">
          <div v-if="!aiPlan" class="empty-line">
            暂无 AI 建议，可点击顶部“AI 优化”或“断言建议”获取。
          </div>
          <div v-else-if="visibleAiPlanSteps.length === 0" class="empty-line">建议已全部处理。</div>
          <div v-else class="ai-suggestion-list">
            <div
              v-for="(step, index) in visibleAiPlanSteps"
              :key="`${step.type}-${index}`"
              class="ai-suggestion"
              :class="{ caution: isLowConfidenceStep(step) }"
            >
              <div>
                <strong>{{ step.flowKey || step.assertionKey || step.type }}</strong>
                <span>{{ step.reason }}</span>
                <small v-if="isLowConfidenceStep(step)">置信度偏低，采纳即确认该步骤可用。</small>
              </div>
              <em>{{ Math.round(step.confidence * 100) }}%</em>
              <el-button size="small" type="primary" plain @click="acceptAiStep(step)">
                采纳
              </el-button>
              <el-button size="small" @click="ignoreAiStep(step)">忽略</el-button>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="引用关系" name="references">
          <div v-if="references.length === 0" class="empty-line">暂无引用关系</div>
          <div v-else class="history-list">
            <div v-for="assetRef in references" :key="assetRef.id" class="history-item">
              <el-tag
                :type="assetRef.impactLevel === 'INDIRECT' ? 'warning' : 'info'"
                effect="light"
              >
                {{ assetRef.impactLevel === 'INDIRECT' ? '间接' : '直接' }}
              </el-tag>
              <strong>{{ assetRef.targetName || `#${assetRef.targetId}` }}</strong>
              <span>版本 {{ assetRef.targetVersionId || '-' }}</span>
              <span>{{ assetRef.targetType }}</span>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="版本" name="versions">
          <div v-if="versions.length === 0" class="empty-line">暂无发布版本</div>
          <div v-else class="history-list">
            <div v-for="version in versions" :key="version.id" class="history-item">
              <el-tag effect="light">V{{ version.versionNo }}</el-tag>
              <strong>{{ version.changeSummary || '发布版本' }}</strong>
              <span>{{ formatBeijingDateTime(version.createdAt) }}</span>
              <div class="version-actions">
                <el-button
                  size="small"
                  :loading="versionDiffLoading"
                  @click="showVersionDiff(version)"
                >
                  Diff
                </el-button>
                <el-button
                  size="small"
                  type="warning"
                  :disabled="permissionDenied"
                  :loading="saving"
                  @click="rollbackVersion(version)"
                >
                  回滚
                </el-button>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>

    <el-dialog
      v-model="versionDiffVisible"
      title="版本 Diff"
      width="920px"
      class="workbench-dialog"
      destroy-on-close
    >
      <div v-if="versionDiff" class="version-diff">
        <div class="diff-summary">
          <el-tag effect="light">
            V{{ versionDiff.baseVersion.versionNo }} -> V{{ versionDiff.targetVersion.versionNo }}
          </el-tag>
          <span v-for="item in versionDiff.summary" :key="item">{{ item }}</span>
        </div>
        <div class="diff-grid">
          <section>
            <h3>DSL</h3>
            <div class="diff-stats">
              <span>+{{ versionDiff.dslStats.addedLines }}</span>
              <span>-{{ versionDiff.dslStats.removedLines }}</span>
              <span>{{ versionDiff.dslStats.truncated ? '已截断' : '完整预览' }}</span>
            </div>
            <pre class="diff-preview"><code
              v-for="(line, index) in versionDiff.dslStats.preview"
              :key="`dsl-${index}`"
              :class="diffLineClass(line.kind)"
            >{{ diffLinePrefix(line.kind) }} {{ line.text }}
</code></pre>
          </section>
          <section>
            <h3>生成代码</h3>
            <div class="diff-stats">
              <span>+{{ versionDiff.codeStats.addedLines }}</span>
              <span>-{{ versionDiff.codeStats.removedLines }}</span>
              <span>{{ versionDiff.codeStats.truncated ? '已截断' : '完整预览' }}</span>
            </div>
            <pre class="diff-preview"><code
              v-for="(line, index) in versionDiff.codeStats.preview"
              :key="`code-${index}`"
              :class="diffLineClass(line.kind)"
            >{{ diffLinePrefix(line.kind) }} {{ line.text }}
</code></pre>
          </section>
        </div>
      </div>
      <div v-else class="empty-line">暂无 Diff 数据</div>
    </el-dialog>

    <el-dialog
      v-model="stepDialogVisible"
      :title="isEditingStep ? '编辑步骤' : '添加步骤'"
      width="760px"
      class="workbench-dialog"
      destroy-on-close
    >
      <el-form label-width="112px" :model="stepForm">
        <el-form-item label="步骤类型" required :error="stepFieldError('step_type', 'StepType')">
          <el-select v-model="stepForm.stepType" style="width: 100%">
            <el-option
              :label="ScenarioStepTypeLabel[StepType.FLOW_CALL]"
              :value="StepType.FLOW_CALL"
            />
            <el-option
              :label="ScenarioStepTypeLabel[StepType.ASSERTION]"
              :value="StepType.ASSERTION"
            />
            <el-option
              :label="ScenarioStepTypeLabel[StepType.ATOMIC_ACTION]"
              :value="StepType.ATOMIC_ACTION"
            />
            <el-option
              :label="ScenarioStepTypeLabel[StepType.CODE_BLOCK]"
              :value="StepType.CODE_BLOCK"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="步骤名称" required :error="stepFieldError('step_name', 'StepName')">
          <el-input v-model="stepForm.stepName" />
        </el-form-item>
        <el-form-item
          v-if="stepForm.stepType === StepType.FLOW_CALL"
          label="固定场景"
          required
          :error="stepFieldError('ref_flow_id', 'RefFlowID')"
        >
          <el-select v-model="stepForm.refFlowId" filterable style="width: 100%">
            <el-option v-for="flow in flows" :key="flow.id" :label="flow.flowName" :value="flow.id">
              <div class="asset-option">
                <span>{{ flow.flowName }}</span>
                <small>
                  {{ FlowAssetStatusLabel[flow.status] }}
                  ·
                  {{ ValidationStatusLabel[flow.latestValidationStatus] }}
                </small>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item
          v-if="stepForm.stepType === StepType.ASSERTION"
          label="断言"
          required
          :error="stepFieldError('ref_assertion_id', 'RefAssertionID')"
        >
          <el-select v-model="stepForm.refAssertionId" filterable style="width: 100%">
            <el-option
              v-for="assertion in assertions"
              :key="assertion.id"
              :label="assertion.assertionName"
              :value="assertion.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          v-if="stepForm.stepType === StepType.ATOMIC_ACTION"
          label="原子操作"
          required
          :error="stepFieldError('atomic_action', 'AtomicAction')"
        >
          <el-select v-model="stepForm.atomicAction" style="width: 100%">
            <el-option
              v-for="action in atomicActions"
              :key="action.key"
              :label="action.label"
              :value="action.key"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="参数映射" :error="stepFieldError('param_mapping', 'ParamMapping')">
          <el-input
            v-model="stepForm.paramMappingText"
            type="textarea"
            :rows="5"
            spellcheck="false"
          />
        </el-form-item>
        <el-form-item label="输出映射" :error="stepFieldError('output_mapping', 'OutputMapping')">
          <el-input
            v-model="stepForm.outputMappingText"
            type="textarea"
            :rows="4"
            spellcheck="false"
          />
        </el-form-item>
        <el-form-item
          v-if="stepForm.stepType === StepType.CODE_BLOCK"
          label="代码块"
          :error="stepFieldError('code_block', 'CodeBlock')"
        >
          <el-input v-model="stepForm.codeBlock" type="textarea" :rows="6" spellcheck="false" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="stepForm.enabled" active-text="启用" inactive-text="禁用" />
        </el-form-item>
        <el-form-item v-if="stepForm.stepType === StepType.CODE_BLOCK" label="人工审核">
          <el-switch
            v-model="stepForm.manualReviewed"
            active-text="已审核"
            inactive-text="未审核"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="stepDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitStep">保存</el-button>
      </template>
    </el-dialog>

    <div v-if="composition" class="archive-row">
      <el-button link type="warning" @click="archiveComposition">归档当前编排</el-button>
      <el-button
        v-if="canDeleteComposition"
        link
        type="danger"
        :loading="saving"
        @click="deleteComposition"
      >
        删除草稿
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.workbench-page {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: var(--tp-space-4);
  box-sizing: border-box;
}

.workbench-topbar,
.workbench-main,
.bottom-panel {
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-lg);
  background: var(--tp-surface-card);
  box-shadow: var(--tp-shadow-sm);
}

.workbench-topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--tp-space-4);
  padding: var(--tp-space-4) var(--tp-space-5);
}

.workbench-title {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: var(--tp-space-3);
}

.workbench-title h1 {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 22px;
  font-weight: 700;
}

.workbench-eyebrow {
  color: var(--tp-primary);
  font-size: 12px;
  font-weight: 700;
}

.status-row,
.workbench-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--tp-space-2);
}

.status-row {
  margin-left: var(--tp-space-2);
  color: var(--tp-text-muted);
  font-size: 12px;
}

.workbench-warning {
  border-color: var(--tp-warning);
}

.workbench-main {
  display: grid;
  min-height: 560px;
  grid-template-columns: 260px minmax(360px, 1fr) 320px;
  overflow: hidden;
}

.asset-library,
.step-stage,
.config-panel {
  min-width: 0;
  padding: var(--tp-space-4);
}

.asset-library,
.config-panel {
  background: var(--tp-surface-muted);
}

.asset-library {
  border-right: 1px solid var(--tp-border-subtle);
}

.config-panel {
  border-left: 1px solid var(--tp-border-subtle);
}

.asset-list,
.step-list,
.history-list,
.ai-suggestion-list,
.log-list {
  display: flex;
  flex-direction: column;
  gap: var(--tp-space-2);
}

.asset-list {
  max-height: 480px;
  overflow: auto;
  padding-top: var(--tp-space-3);
}

.asset-card,
.step-card {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  background: var(--tp-surface-card);
  color: var(--tp-text-secondary);
  cursor: pointer;
  text-align: left;
  transition: var(--tp-transition);
}

.asset-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--tp-space-3);
}

.asset-card:hover,
.step-card:hover,
.step-card.active {
  border-color: var(--tp-border-strong);
  background: var(--tp-surface-hover);
}

.asset-card strong,
.step-card strong,
.config-summary strong,
.history-item strong,
.ai-suggestion strong {
  overflow: hidden;
  color: var(--tp-text-primary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-card span,
.asset-card small,
.step-card small,
.empty-line,
.history-item span,
.ai-suggestion span {
  color: var(--tp-text-muted);
  font-size: 12px;
}

.scenario-editor {
  margin-bottom: var(--tp-space-4);
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--tp-space-3);
  margin-bottom: var(--tp-space-3);
}

.panel-heading h2 {
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 15px;
  font-weight: 700;
}

.empty-steps {
  display: grid;
  min-height: 260px;
  place-items: center;
  border: 1px dashed var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  color: var(--tp-text-muted);
  text-align: center;
}

.empty-steps .material-symbols-outlined {
  color: var(--tp-primary);
  font-size: 36px;
}

.step-card {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--tp-space-3);
  min-height: 68px;
  padding: var(--tp-space-3);
  cursor: grab;
}

.step-card.has-error {
  border-color: var(--tp-danger);
  background: var(--tp-accent-danger-soft);
}

.step-card.disabled {
  opacity: 0.56;
}

.step-card.dragging {
  border-style: dashed;
  opacity: 0.72;
}

.step-no {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--tp-primary-lighter);
  color: var(--tp-primary);
  font-size: 12px;
  font-weight: 700;
}

.step-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.step-actions {
  display: flex;
  gap: var(--tp-space-1);
}

.step-issue-badge {
  white-space: nowrap;
}

.config-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--tp-space-2);
  padding-bottom: var(--tp-space-3);
  border-bottom: 1px solid var(--tp-border-subtle);
}

.issue-list {
  display: flex;
  flex-direction: column;
  gap: var(--tp-space-2);
  margin-top: var(--tp-space-3);
}

.issue-item {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: var(--tp-space-2);
  padding: var(--tp-space-2);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-sm);
  color: var(--tp-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.issue-item.error {
  border-color: var(--tp-danger);
  background: var(--tp-accent-danger-soft);
  color: var(--tp-danger);
}

.issue-item.warning {
  border-color: var(--tp-warning);
  background: var(--tp-accent-warning-soft);
  color: var(--tp-warning);
}

.issue-item .material-symbols-outlined {
  font-size: 17px;
}

.config-list {
  display: flex;
  flex-direction: column;
  gap: var(--tp-space-2);
  margin: var(--tp-space-4) 0;
}

.config-list div {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: var(--tp-space-2);
}

.config-list dt {
  color: var(--tp-text-muted);
  font-size: 12px;
}

.config-list dd {
  overflow: hidden;
  margin: 0;
  color: var(--tp-text-primary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.config-block {
  margin-top: var(--tp-space-3);
}

.config-block h3 {
  margin: 0 0 var(--tp-space-2);
  color: var(--tp-text-primary);
  font-size: 13px;
}

.config-block pre,
.code-preview {
  overflow: auto;
  margin: 0;
  padding: var(--tp-space-3);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  background: var(--tp-surface-muted);
  color: var(--tp-text-secondary);
  font-family: var(--tp-font-family-mono);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.config-block pre {
  max-height: 160px;
}

.config-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--tp-space-2);
  margin-top: var(--tp-space-4);
}

.bottom-panel {
  padding: 0 var(--tp-space-4) var(--tp-space-4);
}

.code-preview {
  max-height: 360px;
}

.code-panel {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--tp-space-3);
}

.code-panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--tp-space-3);
  padding: var(--tp-space-3);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  background: var(--tp-surface-muted);
}

.code-state,
.code-actions,
.code-edit-options {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--tp-space-2);
}

.code-state {
  flex-wrap: wrap;
  color: var(--tp-text-muted);
  font-size: 12px;
}

.code-actions {
  flex-shrink: 0;
}

.code-editor {
  font-family: var(--tp-font-family-mono);
}

.code-edit-options {
  align-items: flex-start;
}

.code-edit-options .el-input {
  flex: 1;
}

.validation-config {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: var(--tp-space-4);
  margin-bottom: var(--tp-space-4);
  padding: var(--tp-space-4);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  background: var(--tp-surface-muted);
}

.validation-config-title {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--tp-space-1);
}

.validation-config-title strong {
  color: var(--tp-text-primary);
  font-size: 14px;
}

.validation-config-title span {
  color: var(--tp-text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.history-item,
.ai-suggestion {
  display: grid;
  align-items: center;
  gap: var(--tp-space-3);
  padding: var(--tp-space-3);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  background: var(--tp-surface-muted);
}

.history-item {
  grid-template-columns: auto minmax(0, 1fr) auto auto;
}

.version-actions,
.diff-summary,
.diff-stats {
  display: flex;
  align-items: center;
  gap: var(--tp-space-2);
}

.version-actions {
  justify-content: flex-end;
}

.version-diff {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--tp-space-4);
}

.diff-summary {
  flex-wrap: wrap;
  color: var(--tp-text-muted);
  font-size: 12px;
}

.diff-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--tp-space-4);
}

.diff-grid section {
  min-width: 0;
}

.diff-grid h3 {
  margin: 0 0 var(--tp-space-2);
  color: var(--tp-text-primary);
  font-size: 13px;
}

.diff-stats {
  margin-bottom: var(--tp-space-2);
  color: var(--tp-text-muted);
  font-size: 12px;
}

.diff-preview {
  overflow: auto;
  max-height: 420px;
  margin: 0;
  padding: var(--tp-space-3);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  background: var(--tp-surface-muted);
  color: var(--tp-text-secondary);
  font-family: var(--tp-font-family-mono);
  font-size: 12px;
  line-height: 1.5;
}

.diff-preview code {
  display: block;
  min-height: 18px;
  white-space: pre-wrap;
}

.diff-preview code.added {
  color: var(--tp-success);
}

.diff-preview code.removed {
  color: var(--tp-danger);
}

.validation-card {
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  background: var(--tp-surface-muted);
}

.validation-card .history-item {
  border: 0;
  background: transparent;
}

.assertion-result-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--tp-space-2);
  padding: 0 var(--tp-space-3) var(--tp-space-3);
}

.assertion-result-list span {
  border-radius: var(--tp-radius-sm);
  background: var(--tp-surface-card);
  color: var(--tp-text-muted);
  font-size: 12px;
  padding: 2px var(--tp-space-2);
}

.ai-suggestion {
  grid-template-columns: minmax(0, 1fr) auto auto auto;
}

.log-item {
  display: grid;
  grid-template-columns: auto 180px minmax(0, 1fr);
  align-items: center;
  gap: var(--tp-space-3);
  padding: var(--tp-space-3);
  border: 1px solid var(--tp-border-subtle);
  border-radius: var(--tp-radius-md);
  background: var(--tp-surface-muted);
}

.log-item span {
  color: var(--tp-text-muted);
  font-size: 12px;
}

.log-item strong {
  min-width: 0;
  color: var(--tp-text-primary);
  font-size: 12px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.ai-suggestion div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.ai-suggestion.caution {
  border-color: var(--tp-warning);
  background: var(--tp-accent-warning-soft);
}

.ai-suggestion em {
  color: var(--tp-primary);
  font-size: 12px;
  font-style: normal;
  font-weight: 700;
}

.ai-suggestion small {
  color: var(--tp-warning);
  font-size: 12px;
}

.asset-option {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.asset-option small {
  color: var(--tp-text-muted);
}

.archive-row {
  display: flex;
  gap: var(--tp-space-3);
  justify-content: flex-end;
}

:deep(.el-tabs__nav-wrap::after) {
  background: var(--tp-border-subtle);
}

:deep(.el-input__wrapper),
:deep(.el-select__wrapper),
:deep(.el-textarea__inner) {
  background: var(--tp-surface-input);
  box-shadow: 0 0 0 1px var(--tp-border-subtle) inset;
}

:deep(.el-input__wrapper.is-focus),
:deep(.el-select__wrapper.is-focused),
:deep(.el-textarea__inner:focus) {
  box-shadow: 0 0 0 1px var(--tp-border-strong) inset;
}

:global(.workbench-dialog .el-dialog) {
  background: var(--tp-surface-card);
  color: var(--tp-text-primary);
}

:global(.workbench-dialog .el-dialog__title) {
  color: var(--tp-text-primary);
  font-weight: 700;
}

@media (max-width: 1180px) {
  .workbench-main {
    grid-template-columns: 240px minmax(320px, 1fr);
  }

  .config-panel {
    grid-column: 1 / -1;
    border-top: 1px solid var(--tp-border-subtle);
    border-left: 0;
  }
}

@media (max-width: 820px) {
  .workbench-topbar {
    flex-direction: column;
  }

  .workbench-main {
    grid-template-columns: 1fr;
  }

  .asset-library {
    border-right: 0;
    border-bottom: 1px solid var(--tp-border-subtle);
  }

  .step-card,
  .validation-config {
    grid-template-columns: 1fr;
  }
}
</style>
