// ============================================================
// 测试智编模块 — 类型定义 & Mock API
// ============================================================

// ── 枚举 ──

/** 任务状态常量。 */
export const TaskStatus = {
  DRAFT: 'DRAFT',
  PENDING_EXECUTE: 'PENDING_EXECUTE',
  RUNNING: 'RUNNING',
  GENERATE_SUCCESS: 'GENERATE_SUCCESS',
  GENERATE_FAILED: 'GENERATE_FAILED',
  PENDING_CONFIRM: 'PENDING_CONFIRM',
  PENDING_REVALIDATE: 'PENDING_REVALIDATE',
  CONFIRMED: 'CONFIRMED',
  DISCARDED: 'DISCARDED',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
} as const
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus]

/** 脚本状态常量。 */
export const ScriptStatus = {
  DRAFT: 'DRAFT',
  PENDING_CONFIRM: 'PENDING_CONFIRM',
  PENDING_REVALIDATE: 'PENDING_REVALIDATE',
  CONFIRMED: 'CONFIRMED',
  DISCARDED: 'DISCARDED',
} as const
export type ScriptStatus = (typeof ScriptStatus)[keyof typeof ScriptStatus]

/** 验证状态常量。 */
export const ValidationStatus = {
  NOT_VALIDATED: 'NOT_VALIDATED',
  VALIDATING: 'VALIDATING',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  ERROR: 'ERROR',
} as const
export type ValidationStatus = (typeof ValidationStatus)[keyof typeof ValidationStatus]

/** 生成来源常量。 */
export const SourceType = {
  PLAYWRIGHT_RECORDED: 'PLAYWRIGHT_RECORDED',
  AI_ENHANCED_FROM_RECORDING: 'AI_ENHANCED_FROM_RECORDING',
  AI_GENERATED: 'AI_GENERATED',
  HUMAN_EDITED: 'HUMAN_EDITED',
  MIXED: 'MIXED',
} as const
export type SourceType = (typeof SourceType)[keyof typeof SourceType]

/** 生成模式常量。 */
export const GenerationMode = {
  RECORDING_ENHANCED: 'RECORDING_ENHANCED',
  AI_DIRECT: 'AI_DIRECT',
} as const
export type GenerationMode = (typeof GenerationMode)[keyof typeof GenerationMode]

/** 轨迹动作类型常量。 */
export const TraceActionType = {
  NAVIGATE: 'NAVIGATE',
  CLICK: 'CLICK',
  INPUT: 'INPUT',
  SELECT: 'SELECT',
  UPLOAD: 'UPLOAD',
  SCROLL: 'SCROLL',
  WAIT: 'WAIT',
  ASSERT_CANDIDATE: 'ASSERT_CANDIDATE',
  CUSTOM: 'CUSTOM',
} as const
export type TraceActionType = (typeof TraceActionType)[keyof typeof TraceActionType]

// ── 中文映射 ──

export const TaskStatusLabel: Record<TaskStatus, string> = {
  [TaskStatus.DRAFT]: '待配置',
  [TaskStatus.PENDING_EXECUTE]: '待执行',
  [TaskStatus.RUNNING]: '执行中',
  [TaskStatus.GENERATE_SUCCESS]: '生成成功',
  [TaskStatus.GENERATE_FAILED]: '生成失败',
  [TaskStatus.PENDING_CONFIRM]: '待确认',
  [TaskStatus.PENDING_REVALIDATE]: '待重新验证',
  [TaskStatus.CONFIRMED]: '已确认',
  [TaskStatus.DISCARDED]: '已废弃',
  [TaskStatus.MANUAL_REVIEW]: '人工审核',
}

export const ScriptStatusLabel: Record<ScriptStatus, string> = {
  [ScriptStatus.DRAFT]: '草稿',
  [ScriptStatus.PENDING_CONFIRM]: '待确认',
  [ScriptStatus.PENDING_REVALIDATE]: '待重验',
  [ScriptStatus.CONFIRMED]: '已确认',
  [ScriptStatus.DISCARDED]: '已废弃',
}

export const ValidationStatusLabel: Record<ValidationStatus, string> = {
  [ValidationStatus.NOT_VALIDATED]: '未验证',
  [ValidationStatus.VALIDATING]: '验证中',
  [ValidationStatus.PASSED]: '验证通过',
  [ValidationStatus.FAILED]: '验证失败',
  [ValidationStatus.ERROR]: '验证异常',
}

export const SourceTypeLabel: Record<SourceType, string> = {
  [SourceType.PLAYWRIGHT_RECORDED]: 'Playwright 录制',
  [SourceType.AI_ENHANCED_FROM_RECORDING]: 'AI 增强',
  [SourceType.AI_GENERATED]: 'AI 生成',
  [SourceType.HUMAN_EDITED]: '人工编写',
  [SourceType.MIXED]: '混合',
}

export const GenerationModeLabel: Record<GenerationMode, string> = {
  [GenerationMode.RECORDING_ENHANCED]: '录制增强',
  [GenerationMode.AI_DIRECT]: 'AI 直生',
}

export const TraceActionLabel: Record<TraceActionType, string> = {
  [TraceActionType.NAVIGATE]: '页面跳转',
  [TraceActionType.CLICK]: '点击',
  [TraceActionType.INPUT]: '输入',
  [TraceActionType.SELECT]: '选择',
  [TraceActionType.UPLOAD]: '上传',
  [TraceActionType.SCROLL]: '滚动',
  [TraceActionType.WAIT]: '等待',
  [TraceActionType.ASSERT_CANDIDATE]: '断言候选',
  [TraceActionType.CUSTOM]: '自定义',
}

// ── 状态颜色映射 ──

export type StatusColor = 'success' | 'warning' | 'danger' | 'info' | 'primary'

export const TaskStatusColor: Record<TaskStatus, StatusColor> = {
  [TaskStatus.DRAFT]: 'info',
  [TaskStatus.PENDING_EXECUTE]: 'info',
  [TaskStatus.RUNNING]: 'primary',
  [TaskStatus.GENERATE_SUCCESS]: 'success',
  [TaskStatus.GENERATE_FAILED]: 'danger',
  [TaskStatus.PENDING_CONFIRM]: 'warning',
  [TaskStatus.PENDING_REVALIDATE]: 'warning',
  [TaskStatus.CONFIRMED]: 'success',
  [TaskStatus.DISCARDED]: 'info',
  [TaskStatus.MANUAL_REVIEW]: 'warning',
}

export const ScriptStatusColor: Record<ScriptStatus, StatusColor> = {
  [ScriptStatus.DRAFT]: 'info',
  [ScriptStatus.PENDING_CONFIRM]: 'warning',
  [ScriptStatus.PENDING_REVALIDATE]: 'warning',
  [ScriptStatus.CONFIRMED]: 'success',
  [ScriptStatus.DISCARDED]: 'info',
}

export const ValidationStatusColor: Record<ValidationStatus, StatusColor> = {
  [ValidationStatus.NOT_VALIDATED]: 'info',
  [ValidationStatus.VALIDATING]: 'primary',
  [ValidationStatus.PASSED]: 'success',
  [ValidationStatus.FAILED]: 'danger',
  [ValidationStatus.ERROR]: 'danger',
}

/** 固定场景状态常量。 */
export const FlowAssetStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const
export type FlowAssetStatus = (typeof FlowAssetStatus)[keyof typeof FlowAssetStatus]

export const FlowAssetStatusLabel: Record<FlowAssetStatus, string> = {
  [FlowAssetStatus.DRAFT]: '草稿',
  [FlowAssetStatus.PUBLISHED]: '已发布',
  [FlowAssetStatus.ARCHIVED]: '已归档',
}

export const FlowAssetStatusColor: Record<FlowAssetStatus, StatusColor> = {
  [FlowAssetStatus.DRAFT]: 'info',
  [FlowAssetStatus.PUBLISHED]: 'success',
  [FlowAssetStatus.ARCHIVED]: 'info',
}

/** 断言资产状态常量。 */
export const AssertionAssetStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const
export type AssertionAssetStatus = (typeof AssertionAssetStatus)[keyof typeof AssertionAssetStatus]

/** 断言类型常量。 */
export const AssertionAssetType = {
  UI_VISIBLE: 'UI_VISIBLE',
  UI_HIDDEN: 'UI_HIDDEN',
  TEXT_CONTAINS: 'TEXT_CONTAINS',
  URL_CONTAINS: 'URL_CONTAINS',
  TABLE_ROW_EXISTS: 'TABLE_ROW_EXISTS',
  TABLE_CELL_EQUALS: 'TABLE_CELL_EQUALS',
  API_FIELD_EQUALS: 'API_FIELD_EQUALS',
  CUSTOM_CODE: 'CUSTOM_CODE',
} as const
export type AssertionAssetType = (typeof AssertionAssetType)[keyof typeof AssertionAssetType]

export const AssertionAssetStatusLabel: Record<AssertionAssetStatus, string> = {
  [AssertionAssetStatus.DRAFT]: '草稿',
  [AssertionAssetStatus.PUBLISHED]: '已发布',
  [AssertionAssetStatus.ARCHIVED]: '已归档',
}

export const AssertionAssetStatusColor: Record<AssertionAssetStatus, StatusColor> = {
  [AssertionAssetStatus.DRAFT]: 'info',
  [AssertionAssetStatus.PUBLISHED]: 'success',
  [AssertionAssetStatus.ARCHIVED]: 'info',
}

export const AssertionAssetTypeLabel: Record<AssertionAssetType, string> = {
  [AssertionAssetType.UI_VISIBLE]: '元素可见',
  [AssertionAssetType.UI_HIDDEN]: '元素不可见',
  [AssertionAssetType.TEXT_CONTAINS]: '文本存在',
  [AssertionAssetType.URL_CONTAINS]: 'URL 包含',
  [AssertionAssetType.TABLE_ROW_EXISTS]: '表格行存在',
  [AssertionAssetType.TABLE_CELL_EQUALS]: '单元格等于',
  [AssertionAssetType.API_FIELD_EQUALS]: '接口字段等于',
  [AssertionAssetType.CUSTOM_CODE]: '自定义代码',
}

/** 场景编排状态常量。 */
export const ScenarioCompositionStatus = {
  DRAFT: 'DRAFT',
  GENERATED: 'GENERATED',
  VALIDATING: 'VALIDATING',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const
export type ScenarioCompositionStatus =
  (typeof ScenarioCompositionStatus)[keyof typeof ScenarioCompositionStatus]

/** 编排生成代码治理状态常量。 */
export const ScenarioCodeEditStatus = {
  AUTO_GENERATED: 'AUTO_GENERATED',
  MANUAL_PATCHED: 'MANUAL_PATCHED',
  LOCKED: 'LOCKED',
} as const
export type ScenarioCodeEditStatus =
  (typeof ScenarioCodeEditStatus)[keyof typeof ScenarioCodeEditStatus]

/** 场景编排步骤类型常量。 */
export const ScenarioStepType = {
  FLOW_CALL: 'FLOW_CALL',
  ASSERTION: 'ASSERTION',
  ATOMIC_ACTION: 'ATOMIC_ACTION',
  CODE_BLOCK: 'CODE_BLOCK',
  AI_GENERATED: 'AI_GENERATED',
} as const
export type ScenarioStepType = (typeof ScenarioStepType)[keyof typeof ScenarioStepType]

/** 编排验证状态常量。 */
export const CompositionValidationStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
} as const
export type CompositionValidationStatus =
  (typeof CompositionValidationStatus)[keyof typeof CompositionValidationStatus]

export const ScenarioCompositionStatusLabel: Record<ScenarioCompositionStatus, string> = {
  [ScenarioCompositionStatus.DRAFT]: '草稿',
  [ScenarioCompositionStatus.GENERATED]: '已生成',
  [ScenarioCompositionStatus.VALIDATING]: '验证中',
  [ScenarioCompositionStatus.PASSED]: '验证通过',
  [ScenarioCompositionStatus.FAILED]: '验证失败',
  [ScenarioCompositionStatus.PUBLISHED]: '已发布',
  [ScenarioCompositionStatus.ARCHIVED]: '已归档',
}

export const ScenarioCompositionStatusColor: Record<ScenarioCompositionStatus, StatusColor> = {
  [ScenarioCompositionStatus.DRAFT]: 'info',
  [ScenarioCompositionStatus.GENERATED]: 'primary',
  [ScenarioCompositionStatus.VALIDATING]: 'primary',
  [ScenarioCompositionStatus.PASSED]: 'success',
  [ScenarioCompositionStatus.FAILED]: 'danger',
  [ScenarioCompositionStatus.PUBLISHED]: 'success',
  [ScenarioCompositionStatus.ARCHIVED]: 'info',
}

export const ScenarioCodeEditStatusLabel: Record<ScenarioCodeEditStatus, string> = {
  [ScenarioCodeEditStatus.AUTO_GENERATED]: '自动生成',
  [ScenarioCodeEditStatus.MANUAL_PATCHED]: '人工修改',
  [ScenarioCodeEditStatus.LOCKED]: '已锁定',
}

export const ScenarioCodeEditStatusColor: Record<ScenarioCodeEditStatus, StatusColor> = {
  [ScenarioCodeEditStatus.AUTO_GENERATED]: 'info',
  [ScenarioCodeEditStatus.MANUAL_PATCHED]: 'warning',
  [ScenarioCodeEditStatus.LOCKED]: 'danger',
}

export const ScenarioStepTypeLabel: Record<ScenarioStepType, string> = {
  [ScenarioStepType.FLOW_CALL]: '固定场景',
  [ScenarioStepType.ASSERTION]: '断言',
  [ScenarioStepType.ATOMIC_ACTION]: '原子操作',
  [ScenarioStepType.CODE_BLOCK]: '代码块',
  [ScenarioStepType.AI_GENERATED]: 'AI 临时',
}

export const CompositionValidationStatusLabel: Record<CompositionValidationStatus, string> = {
  [CompositionValidationStatus.PENDING]: '待验证',
  [CompositionValidationStatus.RUNNING]: '验证中',
  [CompositionValidationStatus.PASSED]: '通过',
  [CompositionValidationStatus.FAILED]: '失败',
  [CompositionValidationStatus.CANCELED]: '已取消',
}

export const CompositionValidationStatusColor: Record<CompositionValidationStatus, StatusColor> = {
  [CompositionValidationStatus.PENDING]: 'info',
  [CompositionValidationStatus.RUNNING]: 'primary',
  [CompositionValidationStatus.PASSED]: 'success',
  [CompositionValidationStatus.FAILED]: 'danger',
  [CompositionValidationStatus.CANCELED]: 'info',
}

// ── 核心接口 ──

export interface ActionPermissions {
  canExecute: boolean
  canValidate: boolean
  canEdit: boolean
  canConfirm: boolean
  canExport: boolean
  canDiscard: boolean
  canDelete: boolean
}

/** 任务列表查询参数 */
export interface AiScriptTaskListQuery {
  projectId?: number
  taskStatus?: TaskStatus
  keyword?: string
  pageNo?: number
  pageSize?: number
}

/** 批量选择模式 */
export type BatchTaskSelectionMode = 'IDS' | 'FILTER_ALL'

/** 任务筛选快照 */
export interface TaskFilterSnapshot {
  projectId?: number
  keyword?: string
  taskStatus?: TaskStatus
}

/** 批量任务选择请求体 */
export interface BatchTaskSelectionPayload {
  selectionMode: BatchTaskSelectionMode
  taskIds: number[]
  excludedTaskIds: number[]
  filterSnapshot?: TaskFilterSnapshot | null
  expectedTotal: number
}

/** 批量任务原因统计 */
export interface BatchTaskReasonStat {
  reason: string
  count: number
}

/** 批量任务操作结果 */
export interface BatchTaskActionResult {
  matched: number
  success: number
  skipped: number
  failed: number
  skipReasons?: BatchTaskReasonStat[]
  failedReasons?: BatchTaskReasonStat[]
}

export interface RecordingSession {
  id: number
  taskId: number
  recorderType: string
  recordingStatus: string
  rawScriptContent?: string
  stepModelJson?: Record<string, unknown>
  createdAt: string
  finishedAt?: string
}

export interface AiScriptTask {
  id: number
  projectId: number
  projectName: string
  projectKey: string // V1 项目标识
  taskName: string
  generationMode: GenerationMode
  caseIds: number[]
  caseTags: string[]
  caseCount: number
  scenarioDesc: string
  startUrl: string
  accountRef?: string
  envConfig?: Record<string, unknown>
  taskStatus: TaskStatus
  frameworkType: string
  latestRecordingId?: number
  currentVersionNo?: number
  latestValidationStatus?: ValidationStatus
  permissions?: ActionPermissions
  errorMessage?: string
  createdBy: number
  createdName: string
  createdAt: string
  updatedAt: string
}

export interface AiScriptVersion {
  id: number
  taskId: number
  versionNo: number
  frameworkType: string
  scriptName?: string
  scriptStatus: ScriptStatus
  validationStatus: ValidationStatus
  sourceType: SourceType
  sourceRecordingId?: number
  scriptContent: string
  stepModelJson?: Record<string, unknown>
  commentText?: string
  basedOnVersionId?: number
  isCurrentFlag: boolean
  confirmedBy?: number
  confirmedAt?: string
  createdBy: number
  createdName: string
  createdAt: string
  // V1 多文件工程化字段
  projectKeySnapshot?: string
  versionStatus?: string
  generationSummary?: string
  registrySnapshotJson?: string
  baseFixtureHash?: string
  manualReviewItems?: string[]
  files?: AiScriptFile[]
}

/** V1 生成文件明细 */
export interface AiScriptFile {
  id: number
  projectId: number
  taskId: number
  versionId: number
  fileType: 'page' | 'spec' | 'fixture' | 'shared'
  relativePath: string
  content: string
  contentHash: string
  sourceKind: 'create' | 'update' | 'merge'
  createdAt: string
}

export interface AiScriptValidation {
  id: number
  scriptVersionId: number
  taskId: number
  triggerType: string
  validationStatus: ValidationStatus
  totalStepCount: number
  passedStepCount: number
  failedStepNo?: number
  failReason?: string
  assertionSummary: AssertionItem[]
  startedAt: string
  finishedAt?: string
  durationMs?: number
  triggeredBy: number
  triggeredName: string
  logs: ValidationLog[]
  screenshots: EvidenceScreenshot[]
}

export interface AssertionItem {
  name: string
  passed: boolean
  skipped?: boolean
}

export interface ValidationLog {
  level: 'INFO' | 'WARN' | 'ERROR'
  message: string
  timestamp?: string
}

export interface EvidenceScreenshot {
  id: number
  taskId: number
  scriptVersionId?: number
  validationId?: number
  evidenceType: string
  fileName: string
  fileUrl: string
  contentText?: string
  traceNo?: number
  caption?: string
  createdBy?: number
  createdAt?: string
}

export interface AiScriptTrace {
  id: number
  taskId: number
  traceNo: number
  actionType: TraceActionType
  pageUrl?: string
  targetSummary?: string
  locatorUsed?: string
  inputValueMasked?: string
  actionResult?: string
  errorMessage?: string
  screenshotUrl?: string
  occurredAt: string
}

/** 固定场景列表查询参数。 */
export interface AiFlowAssetListQuery {
  projectId: number
  keyword?: string
  status?: FlowAssetStatus | ''
  validationStatus?: ValidationStatus | ''
  pageNo?: number
  pageSize?: number
}

/** 固定场景资产。 */
export interface AiFlowAsset {
  id: number
  projectId: number
  projectName?: string
  flowKey: string
  flowName: string
  description?: string
  sourceTaskId?: number
  sourceTaskName?: string
  sourceVersionId?: number
  status: FlowAssetStatus
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  preconditions?: string[]
  postconditions?: string[]
  dsl?: Record<string, unknown>
  codeSnapshot?: string
  tags?: string[]
  allowAiReuse: boolean
  latestValidationStatus: ValidationStatus
  createdBy: number
  createdName?: string
  createdAt: string
  updatedBy: number
  updatedAt: string
  compileHealth?: FlowCompileHealth
  compileFailures?: FlowCompileFailure[]
  outdatedFlowRefs?: AiAssetReference[]
}

/** 固定场景编译健康度。 */
export type FlowCompileHealth = 'OK' | 'PARTIAL'

/** 固定场景 DSL 支持的步骤类型兜底清单，与后端 supportedFlowDSLStepTypes 保持一致。 */
export const FLOW_DSL_SUPPORTED_STEP_TYPES = [
  'NAVIGATE',
  'GOTO',
  'CLICK',
  'INPUT',
  'FILL',
  'SELECT',
  'KEY_PRESS',
  'WAIT',
  'ASSERT',
  'ASSERT_CANDIDATE',
  'FLOW_CALL',
] as const

/** 固定场景 DSL 编译失败项。 */
export interface FlowCompileFailure {
  stepNo: number
  stepType: string
  reason: string
}

/** 固定场景发布前自检结果。 */
export interface FlowCompileCheckResult {
  flowId: number
  compileHealth: FlowCompileHealth
  supportedStepTypes: string[]
  compileFailures: FlowCompileFailure[]
}

/** 固定场景版本。 */
export interface AiFlowAssetVersion {
  id: number
  flowId: number
  versionNo: number
  versionStatus: FlowAssetStatus
  dsl?: Record<string, unknown>
  codeSnapshot?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  changeSummary?: string
  sourceTaskId?: number
  sourceVersionId?: number
  validationStatus: ValidationStatus
  createdBy: number
  createdAt: string
}

export interface PublishFlowAssetPayload {
  projectId: number
  flowKey: string
  flowName: string
  description?: string
  tags: string[]
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  preconditions: string[]
  postconditions: string[]
  allowAiReuse: boolean
  changeSummary?: string
}

export interface PublishFlowAssetResult {
  flowId: number
  flowVersionId: number
  status: FlowAssetStatus
}

/** 固定场景保存参数。 */
export interface SaveFlowAssetPayload {
  projectId: number
  flowKey?: string
  flowName: string
  description?: string
  tags: string[]
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  preconditions: string[]
  postconditions: string[]
  dsl?: Record<string, unknown>
  codeSnapshot?: string
  allowAiReuse: boolean
  changeSummary?: string
}

/** 资产引用关系。 */
export interface AiAssetReference {
  id: number
  sourceType: string
  sourceId: number
  targetType: string
  targetId: number
  targetVersionId?: number
  sourceName?: string
  targetName?: string
  impactLevel?: 'DIRECT' | 'INDIRECT' | string
  impactPath?: string[]
  refOutdated?: boolean
  lockedVersionNo?: number
  latestVersionId?: number
  latestVersionNo?: number
  createdAt: string
}

/** 断言资产列表查询参数。 */
export interface AiAssertionAssetListQuery {
  projectId: number
  keyword?: string
  status?: AssertionAssetStatus | ''
  assertionType?: AssertionAssetType | ''
  pageNo?: number
  pageSize?: number
}

/** 断言资产。 */
export interface AiAssertionAsset {
  id: number
  projectId: number
  projectName?: string
  assertionKey: string
  assertionName: string
  assertionType: AssertionAssetType
  description?: string
  paramSchema?: Record<string, unknown>
  implementation?: Record<string, unknown>
  failureMessageTpl?: string
  evidenceConfig?: Record<string, unknown>
  status: AssertionAssetStatus
  allowAiReuse: boolean
  latestValidationStatus: ValidationStatus
  createdBy: number
  createdName?: string
  createdAt: string
  updatedBy: number
  updatedAt: string
  refCount?: number
}

/** 断言资产保存参数。 */
export interface SaveAssertionAssetPayload {
  projectId: number
  assertionKey?: string
  assertionName: string
  assertionType: AssertionAssetType
  description?: string
  paramSchema?: Record<string, unknown>
  implementation?: Record<string, unknown>
  failureMessageTpl?: string
  evidenceConfig?: Record<string, unknown>
  allowAiReuse: boolean
}

/** 场景编排列表查询参数。 */
export interface AiScenarioCompositionListQuery {
  projectId: number
  keyword?: string
  status?: ScenarioCompositionStatus | ''
  validationStatus?: ValidationStatus | ''
  pageNo?: number
  pageSize?: number
}

/** 场景编排。 */
export interface AiScenarioComposition {
  id: number
  projectId: number
  projectName?: string
  scenarioKey: string
  scenarioName: string
  description?: string
  status: ScenarioCompositionStatus
  dsl?: Record<string, unknown>
  generatedCode?: string
  codeEditStatus?: ScenarioCodeEditStatus
  codeChangeSummary?: string
  manualPatchedBy?: number
  manualPatchedAt?: string
  codeLockedBy?: number
  codeLockedAt?: string
  currentVersionId?: number
  latestValidationId?: number
  latestValidationStatus: ValidationStatus
  revision: number
  createdBy: number
  createdName?: string
  createdAt: string
  updatedBy: number
  updatedAt: string
  flowRefCount?: number
  assertionRefCount?: number
  steps?: AiScenarioStep[]
  outdatedFlowRefs?: AiAssetReference[]
}

/** 场景编排步骤。 */
export interface AiScenarioStep {
  id: number
  scenarioId: number
  dslStepId?: string
  stepNo: number
  stepType: ScenarioStepType
  stepName: string
  refFlowId?: number
  refFlowVersionId?: number
  refAssertionId?: number
  paramMapping?: Record<string, unknown>
  outputMapping?: Record<string, unknown>
  atomicAction?: string
  codeBlock?: string
  manualReviewed: boolean
  aiConfidence: number
  enabled: boolean
  flowName?: string
  assertionName?: string
  createdAt: string
  updatedAt: string
}

/** 新建场景编排参数。 */
export interface CreateScenarioCompositionPayload {
  projectId: number
  scenarioKey: string
  scenarioName: string
  description?: string
}

/** 更新场景编排参数。 */
export interface UpdateScenarioCompositionPayload {
  projectId: number
  scenarioName: string
  description?: string
  dsl?: Record<string, unknown>
  expectedRevision?: number
}

/** 保存编排步骤参数。 */
export interface SaveScenarioStepPayload {
  projectId: number
  stepType: ScenarioStepType
  stepName?: string
  refFlowId?: number
  refFlowVersionId?: number
  refAssertionId?: number
  paramMapping?: Record<string, unknown>
  outputMapping?: Record<string, unknown>
  atomicAction?: string
  codeBlock?: string
  manualReviewed?: boolean
  aiConfidence?: number
  enabled?: boolean
}

/** 场景编排版本。 */
export interface AiScenarioCompositionVersion {
  id: number
  compositionId: number
  versionNo: number
  versionStatus: ScenarioCompositionStatus
  dsl?: Record<string, unknown>
  generatedCode?: string
  changeSummary?: string
  createdBy: number
  createdAt: string
}

/** 编排版本 Diff 单行摘要。 */
export interface ScenarioVersionDiffLine {
  kind: 'context' | 'added' | 'removed' | string
  text: string
}

/** 编排版本 Diff 统计。 */
export interface ScenarioVersionDiffStats {
  baseLineCount: number
  targetLineCount: number
  addedLines: number
  removedLines: number
  unchangedLines: number
  preview: ScenarioVersionDiffLine[]
  truncated: boolean
}

/** 编排版本 Diff 结果。 */
export interface AiScenarioVersionDiffResult {
  compositionId: number
  baseVersion: AiScenarioCompositionVersion
  targetVersion: AiScenarioCompositionVersion
  dslChanged: boolean
  codeChanged: boolean
  dslStats: ScenarioVersionDiffStats
  codeStats: ScenarioVersionDiffStats
  summary: string[]
}

/** 编排验证记录。 */
export interface AiCompositionValidation {
  id: number
  compositionId: number
  compositionVersionId?: number
  projectId: number
  status: CompositionValidationStatus
  executorJobId?: string
  workspaceId?: string
  logUrl?: string
  reportUrl?: string
  traceUrl?: string
  logs?: Array<Record<string, unknown>>
  startedAt?: string
  finishedAt?: string
  durationMs: number
  createdBy: number
  createdAt: string
  assertionResults?: AiCompositionAssertionResult[]
}

/** 编排断言验证结果。 */
export interface AiCompositionAssertionResult {
  id: number
  validationId: number
  stepId: string
  assertionId: number
  status: CompositionValidationStatus
  expected?: Record<string, unknown>
  actual?: Record<string, unknown>
  failureMessage?: string
  evidence?: Record<string, unknown>
  durationMs: number
  createdAt: string
}

/** 代码生成结果。 */
export interface GenerateCompositionCodeResult {
  compositionId: number
  status: ScenarioCompositionStatus
  files: Array<{ path: string; operation: string }>
  warnings: string[]
  generatedCode: string
}

/** AI 规划模式常量。 */
export const PlannerMode = {
  AUTO: 'auto',
  LLM: 'llm',
  HEURISTIC: 'heuristic',
} as const
export type PlannerMode = (typeof PlannerMode)[keyof typeof PlannerMode]

export const PlannerModeLabel: Record<PlannerMode, string> = {
  [PlannerMode.AUTO]: '自动',
  [PlannerMode.LLM]: '大模型',
  [PlannerMode.HEURISTIC]: '启发式',
}

/** 实际生效的规划器常量。 */
export const PlannerUsed = {
  LLM: 'LLM',
  HEURISTIC: 'HEURISTIC',
} as const
export type PlannerUsed = (typeof PlannerUsed)[keyof typeof PlannerUsed]

export const PlannerUsedLabel: Record<PlannerUsed, string> = {
  [PlannerUsed.LLM]: '大模型规划',
  [PlannerUsed.HEURISTIC]: '启发式规划',
}

export const PlannerUsedColor: Record<PlannerUsed, StatusColor> = {
  [PlannerUsed.LLM]: 'primary',
  [PlannerUsed.HEURISTIC]: 'info',
}

/** AI 编排建议。 */
export interface AiCompositionPlanResult {
  planId: string
  confidence: number
  summary: string
  steps: AiCompositionPlanStep[]
  warnings: string[]
  plannerUsed?: PlannerUsed
  degradedReason?: string
}

/** AI 编排建议步骤。 */
export interface AiCompositionPlanStep {
  type: ScenarioStepType
  flowId?: number
  flowVersionId?: number
  flowKey?: string
  assertionId?: number
  assertionKey?: string
  confidence: number
  reason: string
  inputs?: Record<string, unknown>
}

// ── 真实 API 方法 ──

import { apiClient } from './client'

type PlainObject = Record<string, unknown>

function isPlainObject(value: unknown): value is PlainObject {
  return value !== null && typeof value === 'object' && !(value instanceof Date)
}

/**
 * snake_case 对象键转 camelCase（单层 + 数组递归）
 * 用于将后端 JSON 响应映射到前端 Interface
 */
function toCamel(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(toCamel)
  if (isPlainObject(obj)) {
    return Object.keys(obj).reduce((acc: PlainObject, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
      acc[camelKey] = toCamel(obj[key])
      return acc
    }, {})
  }
  return obj
}

/**
 * camelCase 对象键转 snake_case（用于发送请求体）
 */
function toSnake(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(toSnake)
  if (isPlainObject(obj)) {
    return Object.keys(obj).reduce((acc: PlainObject, key) => {
      const snakeKey = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
      acc[snakeKey] = toSnake(obj[key])
      return acc
    }, {})
  }
  return obj
}

/** 获取任务列表 */
export async function fetchTaskList(
  params?: AiScriptTaskListQuery,
): Promise<{ list: AiScriptTask[]; total: number }> {
  const query: Record<string, number | string> = {}
  if (params?.projectId) query.project_id = params.projectId
  if (params?.taskStatus) query.task_status = params.taskStatus
  if (params?.keyword) query.keyword = params.keyword
  if (params?.pageNo) query.page = params.pageNo
  if (params?.pageSize) query.pageSize = params.pageSize

  const { data } = await apiClient.get('/ai-script/tasks', { params: query })

  // apiClient 拦截器会把分页响应转为 { items, total, page, pageSize }
  const items = data?.items ?? data ?? []
  const total = data?.total ?? items.length

  return {
    list: toCamel(items) as AiScriptTask[],
    total,
  }
}

/** 获取任务详情 */
export async function fetchTaskDetail(taskId: number): Promise<AiScriptTask | undefined> {
  try {
    const { data } = await apiClient.get(`/ai-script/tasks/${taskId}`)
    return toCamel(data) as AiScriptTask
  } catch {
    return undefined
  }
}

/** 创建生成任务 */
export async function createTask(payload: {
  projectId: number
  taskName: string
  generationMode?: GenerationMode
  scenarioDesc: string
  startUrl: string
  accountRef?: string
  caseIds: number[]
  frameworkType?: string
}): Promise<AiScriptTask> {
  const { data } = await apiClient.post('/ai-script/tasks', toSnake(payload))
  return toCamel(data) as AiScriptTask
}

/** 触发执行生成 */
export async function executeTask(taskId: number): Promise<void> {
  await apiClient.post(`/ai-script/tasks/${taskId}/execute`)
}

export async function regenerateFromLatestRecording(taskId: number): Promise<void> {
  await apiClient.post(`/ai-script/tasks/${taskId}/recording/regenerate`)
}

/** 获取脚本版本列表 */
export async function fetchScriptVersions(taskId: number): Promise<AiScriptVersion[]> {
  const { data } = await apiClient.get(`/ai-script/tasks/${taskId}/versions`)
  return toCamel(Array.isArray(data) ? data : []) as AiScriptVersion[]
}

/** 获取当前脚本版本 */
export async function fetchCurrentScript(taskId: number): Promise<AiScriptVersion | undefined> {
  try {
    const { data } = await apiClient.get(`/ai-script/tasks/${taskId}/current-script`)
    return toCamel(data) as AiScriptVersion
  } catch {
    return undefined
  }
}

/** 编辑脚本（生成新版本） */
export async function editScript(
  taskId: number,
  payload: { scriptContent: string; commentText?: string },
): Promise<AiScriptVersion> {
  const { data } = await apiClient.post(`/ai-script/tasks/${taskId}/edit-script`, toSnake(payload))
  return toCamel(data) as AiScriptVersion
}

/** 触发回放验证 */
export async function triggerValidation(
  taskId: number,
  scriptVersionId: number,
): Promise<AiScriptValidation> {
  const { data } = await apiClient.post(`/ai-script/tasks/${taskId}/validate`, {
    script_version_id: scriptVersionId,
  })
  return toCamel(data) as AiScriptValidation
}

/** 获取操作轨迹 */
export async function fetchTraces(taskId: number): Promise<AiScriptTrace[]> {
  const { data } = await apiClient.get(`/ai-script/tasks/${taskId}/traces`)
  return toCamel(Array.isArray(data) ? data : []) as AiScriptTrace[]
}

/** 获取最近验证结果 */
export async function fetchLatestValidation(
  scriptVersionId: number,
): Promise<AiScriptValidation | undefined> {
  try {
    const { data } = await apiClient.get('/ai-script/validations/latest', {
      params: { script_version_id: scriptVersionId },
    })
    return toCamel(data) as AiScriptValidation
  } catch {
    return undefined
  }
}

/** 获取证据列表 */
export async function fetchEvidences(taskId: number): Promise<EvidenceScreenshot[]> {
  const { data } = await apiClient.get(`/ai-script/tasks/${taskId}/evidences`)
  return toCamel(Array.isArray(data) ? data : []) as EvidenceScreenshot[]
}

// ── 新增 API 方法（阶段三） ──

/** 确认脚本 */
export async function confirmScript(scriptId: number): Promise<void> {
  await apiClient.post(`/ai-script/scripts/${scriptId}/confirm`)
}

/** 废弃脚本版本 */
export async function discardScript(scriptId: number, reason: string): Promise<void> {
  await apiClient.post(`/ai-script/scripts/${scriptId}/discard`, { reason })
}

/** 废弃任务 */
export async function discardTask(taskId: number, reason: string): Promise<void> {
  await apiClient.post(`/ai-script/tasks/${taskId}/discard`, { reason })
}

/** 批量废弃任务 */
export async function batchDiscardTasks(
  payload: BatchTaskSelectionPayload & { reason: string },
): Promise<BatchTaskActionResult> {
  const { data } = await apiClient.post('/ai-script/tasks/batch-discard', toSnake(payload))
  return toCamel(data) as BatchTaskActionResult
}

/** 删除已废弃任务 */
export async function deleteTask(taskId: number): Promise<void> {
  await apiClient.delete(`/ai-script/tasks/${taskId}`)
}

/** 批量删除任务 */
export async function batchDeleteTasks(
  payload: BatchTaskSelectionPayload,
): Promise<BatchTaskActionResult> {
  const { data } = await apiClient.post('/ai-script/tasks/batch-delete', toSnake(payload))
  return toCamel(data) as BatchTaskActionResult
}

/** 克隆任务 */
export async function cloneTask(taskId: number, taskName: string): Promise<AiScriptTask> {
  const { data } = await apiClient.post(`/ai-script/tasks/${taskId}/clone`, { task_name: taskName })
  return toCamel(data) as AiScriptTask
}

/** 开始录制 */
export async function startRecording(taskId: number): Promise<RecordingSession> {
  const { data } = await apiClient.post(`/ai-script/tasks/${taskId}/recording/start`)
  return toCamel(data) as RecordingSession
}

/** 结束录制 */
export async function finishRecording(
  taskId: number,
  payload: { recordingId: number; rawScriptContent: string; triggerAiRefactor?: boolean },
): Promise<void> {
  await apiClient.post(`/ai-script/tasks/${taskId}/recording/finish`, toSnake(payload))
}

/** 标记录制失败，释放异常卡住的录制会话 */
export async function failRecording(
  taskId: number,
  payload: { recordingId: number; reason: string },
): Promise<void> {
  await apiClient.post(`/ai-script/tasks/${taskId}/recording/fail`, toSnake(payload))
}

/** 获取最近录制结果 */
export async function fetchLatestRecording(taskId: number): Promise<RecordingSession | undefined> {
  try {
    const { data } = await apiClient.get(`/ai-script/tasks/${taskId}/recordings/latest`)
    return toCamel(data) as RecordingSession
  } catch {
    return undefined
  }
}

/** 导出脚本 */
export async function exportScript(scriptId: number): Promise<Blob> {
  const { data } = await apiClient.get(`/ai-script/scripts/${scriptId}/export`, {
    responseType: 'blob',
  })
  return data
}

/** 获取验证历史 */
export async function fetchValidationHistory(scriptId: number): Promise<AiScriptValidation[]> {
  const { data } = await apiClient.get(`/ai-script/scripts/${scriptId}/validations`)
  return toCamel(Array.isArray(data) ? data : []) as AiScriptValidation[]
}

/** 更新任务基础信息 */
export async function renameTask(
  taskId: number,
  taskName: string,
  scenarioDesc: string,
): Promise<void> {
  await apiClient.put(`/ai-script/tasks/${taskId}/name`, {
    task_name: taskName,
    scenario_desc: scenarioDesc,
  })
}

/** 更新任务关联用例 */
export async function updateTaskCases(taskId: number, caseIds: number[]): Promise<void> {
  await apiClient.post(`/ai-script/tasks/${taskId}/cases/update`, { case_ids: caseIds })
}

/** 获取固定场景列表。 */
export async function fetchFlowAssetList(
  params: AiFlowAssetListQuery,
): Promise<{ list: AiFlowAsset[]; total: number }> {
  const query: Record<string, number | string> = {
    project_id: params.projectId,
  }
  if (params.keyword) query.keyword = params.keyword
  if (params.status) query.status = params.status
  if (params.validationStatus) query.validation_status = params.validationStatus
  if (params.pageNo) query.page = params.pageNo
  if (params.pageSize) query.pageSize = params.pageSize

  const { data } = await apiClient.get('/ai-script/flows', { params: query })
  const items = data?.items ?? data ?? []
  const total = data?.total ?? items.length

  return {
    list: toCamel(items) as AiFlowAsset[],
    total,
  }
}

/** 获取固定场景详情。 */
export async function fetchFlowAssetDetail(
  flowId: number,
  projectId: number,
): Promise<AiFlowAsset> {
  const { data } = await apiClient.get(`/ai-script/flows/${flowId}`, {
    params: { project_id: projectId },
  })
  return toCamel(data) as AiFlowAsset
}

/** 获取固定场景版本列表。 */
export async function fetchFlowAssetVersions(
  flowId: number,
  projectId: number,
): Promise<AiFlowAssetVersion[]> {
  const { data } = await apiClient.get(`/ai-script/flows/${flowId}/versions`, {
    params: { project_id: projectId },
  })
  return toCamel(Array.isArray(data) ? data : []) as AiFlowAssetVersion[]
}

/** 从已验证通过的录制任务发布固定场景。 */
export async function publishFlowFromTask(
  taskId: number,
  payload: PublishFlowAssetPayload,
): Promise<PublishFlowAssetResult> {
  const { data } = await apiClient.post(`/ai-script/tasks/${taskId}/publish-flow`, toSnake(payload))
  return toCamel(data) as PublishFlowAssetResult
}

/** 手动创建固定场景草稿。 */
export async function createFlowAsset(payload: SaveFlowAssetPayload): Promise<AiFlowAsset> {
  const { data } = await apiClient.post('/ai-script/flows', toSnake(payload))
  return toCamel(data) as AiFlowAsset
}

/** 更新固定场景。 */
export async function updateFlowAsset(
  flowId: number,
  payload: SaveFlowAssetPayload,
): Promise<AiFlowAsset> {
  const { data } = await apiClient.put(`/ai-script/flows/${flowId}`, toSnake(payload))
  return toCamel(data) as AiFlowAsset
}

/** 发布固定场景。 */
export async function publishFlowAsset(
  flowId: number,
  projectId: number,
  changeSummary?: string,
): Promise<PublishFlowAssetResult> {
  const { data } = await apiClient.post(
    `/ai-script/flows/${flowId}/publish`,
    toSnake({ projectId, changeSummary }),
  )
  return toCamel(data) as PublishFlowAssetResult
}

/** 固定场景发布前自检（草稿阶段手动触发 dry-run 编译）。 */
export async function compileCheckFlowAsset(
  flowId: number,
  projectId: number,
): Promise<FlowCompileCheckResult> {
  const { data } = await apiClient.post(`/ai-script/flows/${flowId}/compile-check`, {
    project_id: projectId,
  })
  return toCamel(data) as FlowCompileCheckResult
}

/** 归档固定场景。 */
export async function archiveFlowAsset(flowId: number, projectId: number): Promise<AiFlowAsset> {
  const { data } = await apiClient.post(`/ai-script/flows/${flowId}/archive`, {
    project_id: projectId,
  })
  return toCamel(data) as AiFlowAsset
}

/** 删除固定场景草稿。 */
export async function deleteFlowAsset(flowId: number, projectId: number): Promise<void> {
  await apiClient.delete(`/ai-script/flows/${flowId}`, {
    params: { project_id: projectId },
  })
}

/** 获取固定场景引用关系。 */
export async function fetchFlowAssetReferences(
  flowId: number,
  projectId: number,
): Promise<AiAssetReference[]> {
  const { data } = await apiClient.get(`/ai-script/flows/${flowId}/references`, {
    params: { project_id: projectId },
  })
  return toCamel(Array.isArray(data) ? data : []) as AiAssetReference[]
}

/** 获取断言资产列表。 */
export async function fetchAssertionAssetList(
  params: AiAssertionAssetListQuery,
): Promise<{ list: AiAssertionAsset[]; total: number }> {
  const query: Record<string, number | string> = {
    project_id: params.projectId,
  }
  if (params.keyword) query.keyword = params.keyword
  if (params.status) query.status = params.status
  if (params.assertionType) query.assertion_type = params.assertionType
  if (params.pageNo) query.page = params.pageNo
  if (params.pageSize) query.pageSize = params.pageSize

  const { data } = await apiClient.get('/ai-script/assertions', { params: query })
  const items = data?.items ?? data ?? []
  const total = data?.total ?? items.length

  return {
    list: toCamel(items) as AiAssertionAsset[],
    total,
  }
}

/** 获取断言资产详情。 */
export async function fetchAssertionAssetDetail(
  assertionId: number,
  projectId: number,
): Promise<AiAssertionAsset> {
  const { data } = await apiClient.get(`/ai-script/assertions/${assertionId}`, {
    params: { project_id: projectId },
  })
  return toCamel(data) as AiAssertionAsset
}

/** 创建断言资产草稿。 */
export async function createAssertionAsset(
  payload: SaveAssertionAssetPayload,
): Promise<AiAssertionAsset> {
  const { data } = await apiClient.post('/ai-script/assertions', toSnake(payload))
  return toCamel(data) as AiAssertionAsset
}

/** 更新断言资产。 */
export async function updateAssertionAsset(
  assertionId: number,
  payload: SaveAssertionAssetPayload,
): Promise<AiAssertionAsset> {
  const { data } = await apiClient.put(`/ai-script/assertions/${assertionId}`, toSnake(payload))
  return toCamel(data) as AiAssertionAsset
}

/** 发布断言资产。 */
export async function publishAssertionAsset(
  assertionId: number,
  projectId: number,
): Promise<AiAssertionAsset> {
  const { data } = await apiClient.post(`/ai-script/assertions/${assertionId}/publish`, null, {
    params: { project_id: projectId },
  })
  return toCamel(data) as AiAssertionAsset
}

/** 归档断言资产。 */
export async function archiveAssertionAsset(
  assertionId: number,
  projectId: number,
): Promise<AiAssertionAsset> {
  const { data } = await apiClient.post(`/ai-script/assertions/${assertionId}/archive`, null, {
    params: { project_id: projectId },
  })
  return toCamel(data) as AiAssertionAsset
}

/** 删除断言草稿。 */
export async function deleteAssertionAsset(assertionId: number, projectId: number): Promise<void> {
  await apiClient.delete(`/ai-script/assertions/${assertionId}`, {
    params: { project_id: projectId },
  })
}

/** 获取断言引用关系。 */
export async function fetchAssertionAssetReferences(
  assertionId: number,
  projectId: number,
): Promise<AiAssetReference[]> {
  const { data } = await apiClient.get(`/ai-script/assertions/${assertionId}/references`, {
    params: { project_id: projectId },
  })
  return toCamel(Array.isArray(data) ? data : []) as AiAssetReference[]
}

/** 获取场景编排列表。 */
export async function fetchScenarioCompositionList(
  params: AiScenarioCompositionListQuery,
): Promise<{ list: AiScenarioComposition[]; total: number }> {
  const query: Record<string, number | string> = {
    project_id: params.projectId,
  }
  if (params.keyword) query.keyword = params.keyword
  if (params.status) query.status = params.status
  if (params.validationStatus) query.validation_status = params.validationStatus
  if (params.pageNo) query.page = params.pageNo
  if (params.pageSize) query.pageSize = params.pageSize

  const { data } = await apiClient.get('/ai-script/compositions', { params: query })
  const items = data?.items ?? data ?? []
  const total = data?.total ?? items.length

  return {
    list: toCamel(items) as AiScenarioComposition[],
    total,
  }
}

/** 创建场景编排。 */
export async function createScenarioComposition(
  payload: CreateScenarioCompositionPayload,
): Promise<AiScenarioComposition> {
  const { data } = await apiClient.post('/ai-script/compositions', toSnake(payload))
  return toCamel(data) as AiScenarioComposition
}

/** 获取场景编排详情。 */
export async function fetchScenarioCompositionDetail(
  compositionId: number,
  projectId: number,
): Promise<AiScenarioComposition> {
  const { data } = await apiClient.get(`/ai-script/compositions/${compositionId}`, {
    params: { project_id: projectId },
  })
  return toCamel(data) as AiScenarioComposition
}

/** 更新场景编排。 */
export async function updateScenarioComposition(
  compositionId: number,
  payload: UpdateScenarioCompositionPayload,
): Promise<AiScenarioComposition> {
  const { data } = await apiClient.put(`/ai-script/compositions/${compositionId}`, toSnake(payload))
  return toCamel(data) as AiScenarioComposition
}

/** 添加编排步骤。 */
export async function addScenarioStep(
  compositionId: number,
  payload: SaveScenarioStepPayload,
): Promise<AiScenarioStep> {
  const { data } = await apiClient.post(
    `/ai-script/compositions/${compositionId}/steps`,
    toSnake(payload),
  )
  return toCamel(data) as AiScenarioStep
}

/** 更新编排步骤。 */
export async function updateScenarioStep(
  compositionId: number,
  stepId: number,
  payload: SaveScenarioStepPayload,
): Promise<AiScenarioStep> {
  const { data } = await apiClient.put(
    `/ai-script/compositions/${compositionId}/steps/${stepId}`,
    toSnake(payload),
  )
  return toCamel(data) as AiScenarioStep
}

/** 删除编排步骤。 */
export async function deleteScenarioStep(
  compositionId: number,
  stepId: number,
  projectId: number,
): Promise<void> {
  await apiClient.delete(`/ai-script/compositions/${compositionId}/steps/${stepId}`, {
    params: { project_id: projectId },
  })
}

/** 调整编排步骤顺序。 */
export async function reorderScenarioSteps(
  compositionId: number,
  projectId: number,
  stepIds: number[],
): Promise<void> {
  await apiClient.put(
    `/ai-script/compositions/${compositionId}/steps/reorder`,
    toSnake({ projectId, stepIds }),
  )
}

/** 生成编排 Playwright 代码。 */
export async function generateScenarioCode(
  compositionId: number,
  projectId: number,
  force = false,
): Promise<GenerateCompositionCodeResult> {
  const { data } = await apiClient.post(
    `/ai-script/compositions/${compositionId}/generate-code`,
    toSnake({ projectId, force, target: 'PLAYWRIGHT' }),
  )
  return toCamel(data) as GenerateCompositionCodeResult
}

/** 升级编排引用的固定场景版本到最新发布版本，flowIds 为空时升级全部过期引用。 */
export async function refreshScenarioFlowRefs(
  compositionId: number,
  projectId: number,
  flowIds?: number[],
): Promise<AiScenarioComposition> {
  const { data } = await apiClient.post(
    `/ai-script/compositions/${compositionId}/refresh-flow-refs`,
    toSnake({ projectId, flowIds: flowIds || [] }),
  )
  return toCamel(data) as AiScenarioComposition
}

/** 保存人工编辑后的编排 Playwright 代码。 */
export async function updateScenarioGeneratedCode(
  compositionId: number,
  payload: {
    projectId: number
    generatedCode: string
    changeSummary?: string
    locked?: boolean
    expectedRevision?: number
  },
): Promise<AiScenarioComposition> {
  const { data } = await apiClient.put(
    `/ai-script/compositions/${compositionId}/generated-code`,
    toSnake(payload),
  )
  return toCamel(data) as AiScenarioComposition
}

/** 锁定或解除人工修改后的生成代码。 */
export async function setScenarioCodeLock(
  compositionId: number,
  payload: {
    projectId: number
    locked: boolean
    changeSummary?: string
  },
): Promise<AiScenarioComposition> {
  const { data } = await apiClient.post(
    `/ai-script/compositions/${compositionId}/code-lock`,
    toSnake(payload),
  )
  return toCamel(data) as AiScenarioComposition
}

/** 触发编排验证。 */
export async function validateScenarioComposition(
  compositionId: number,
  payload: {
    projectId: number
    environment?: string
    variables?: Record<string, unknown>
    idempotencyKey?: string
  },
): Promise<AiCompositionValidation> {
  const { data } = await apiClient.post(
    `/ai-script/compositions/${compositionId}/validate`,
    toSnake(payload),
  )
  return toCamel(data) as AiCompositionValidation
}

/** 发布场景编排。 */
export async function publishScenarioComposition(
  compositionId: number,
  projectId: number,
  changeSummary?: string,
): Promise<AiScenarioCompositionVersion> {
  const { data } = await apiClient.post(
    `/ai-script/compositions/${compositionId}/publish`,
    toSnake({ projectId, changeSummary }),
  )
  return toCamel(data) as AiScenarioCompositionVersion
}

/** 归档场景编排。 */
export async function archiveScenarioComposition(
  compositionId: number,
  projectId: number,
): Promise<AiScenarioComposition> {
  const { data } = await apiClient.post(
    `/ai-script/compositions/${compositionId}/archive`,
    toSnake({ projectId }),
  )
  return toCamel(data) as AiScenarioComposition
}

/** 删除场景编排草稿。 */
export async function deleteScenarioComposition(
  compositionId: number,
  projectId: number,
): Promise<void> {
  await apiClient.delete(`/ai-script/compositions/${compositionId}`, {
    params: { project_id: projectId },
  })
}

/** 获取场景编排版本列表。 */
export async function fetchScenarioCompositionVersions(
  compositionId: number,
  projectId: number,
): Promise<AiScenarioCompositionVersion[]> {
  const { data } = await apiClient.get(`/ai-script/compositions/${compositionId}/versions`, {
    params: { project_id: projectId },
  })
  return toCamel(Array.isArray(data) ? data : []) as AiScenarioCompositionVersion[]
}

/** 获取两个编排版本的 DSL 和生成代码差异。 */
export async function fetchScenarioVersionDiff(
  compositionId: number,
  projectId: number,
  baseVersionId: number,
  targetVersionId: number,
): Promise<AiScenarioVersionDiffResult> {
  const { data } = await apiClient.get(`/ai-script/compositions/${compositionId}/versions/diff`, {
    params: {
      project_id: projectId,
      base_version_id: baseVersionId,
      target_version_id: targetVersionId,
    },
  })
  return toCamel(data) as AiScenarioVersionDiffResult
}

/** 回滚当前编排到指定发布版本快照。 */
export async function rollbackScenarioVersion(
  compositionId: number,
  payload: {
    projectId: number
    versionId: number
    overrideLockedCode?: boolean
    changeSummary?: string
  },
): Promise<AiScenarioComposition> {
  const { data } = await apiClient.post(
    `/ai-script/compositions/${compositionId}/versions/rollback`,
    toSnake(payload),
  )
  return toCamel(data) as AiScenarioComposition
}

/** 获取场景编排验证历史。 */
export async function fetchScenarioCompositionValidations(
  compositionId: number,
  projectId: number,
): Promise<AiCompositionValidation[]> {
  const { data } = await apiClient.get(`/ai-script/compositions/${compositionId}/validations`, {
    params: { project_id: projectId },
  })
  return toCamel(Array.isArray(data) ? data : []) as AiCompositionValidation[]
}

/** 获取场景编排引用关系。 */
export async function fetchScenarioCompositionReferences(
  compositionId: number,
  projectId: number,
): Promise<AiAssetReference[]> {
  const { data } = await apiClient.get(`/ai-script/compositions/${compositionId}/references`, {
    params: { project_id: projectId },
  })
  return toCamel(Array.isArray(data) ? data : []) as AiAssetReference[]
}

/** 从录制任务生成 AI 编排建议。 */
export async function createAiPlanFromTask(payload: {
  projectId: number
  taskId: number
  sourceVersionId?: number
  maxSteps?: number
  plannerMode?: PlannerMode
}): Promise<AiCompositionPlanResult> {
  const { data } = await apiClient.post(
    '/ai-script/compositions/ai-plan-from-task',
    toSnake(payload),
  )
  return toCamel(data) as AiCompositionPlanResult
}

/** 获取当前编排的 AI 优化建议。 */
export async function optimizeScenarioComposition(
  compositionId: number,
  projectId: number,
): Promise<AiCompositionPlanResult> {
  const { data } = await apiClient.post(
    `/ai-script/compositions/${compositionId}/ai-optimize`,
    toSnake({ projectId }),
  )
  return toCamel(data) as AiCompositionPlanResult
}

/** 获取当前编排的 AI 断言建议。 */
export async function fetchScenarioAiSuggestions(
  compositionId: number,
  projectId: number,
): Promise<AiCompositionPlanResult> {
  const { data } = await apiClient.post(
    `/ai-script/compositions/${compositionId}/ai-suggest-assertions`,
    toSnake({ projectId }),
  )
  return toCamel(data) as AiCompositionPlanResult
}

// ── Executor Codegen API（直连 Executor 服务） ──

const EXECUTOR_BASE = import.meta.env.VITE_EXECUTOR_URL || 'http://127.0.0.1:8100'

export interface CodegenSession {
  session_id: string
  status: string
}

export interface CodegenPollResult {
  status:
    | 'starting'
    | 'logging_in'
    | 'recording'
    | 'completed'
    | 'cancelled'
    | 'error'
    | 'not_found'
  script_content: string
  error: string
}

/** 启动 Playwright Codegen 录制浏览器（支持 auth_config 自动登录） */
export async function launchCodegen(
  taskId: number,
  startUrl: string,
  authConfig?: Record<string, unknown>,
): Promise<CodegenSession> {
  const body: Record<string, unknown> = { task_id: taskId, start_url: startUrl }
  if (authConfig) {
    body.auth_config = authConfig
  }
  const resp = await fetch(`${EXECUTOR_BASE}/recording/codegen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return resp.json()
}

/** 轮询 Codegen 录制状态 */
export async function pollCodegenStatus(sessionId: string): Promise<CodegenPollResult> {
  const resp = await fetch(`${EXECUTOR_BASE}/recording/codegen/${sessionId}`)
  return resp.json()
}

export async function cancelCodegen(sessionId: string): Promise<void> {
  await fetch(`${EXECUTOR_BASE}/recording/codegen/${sessionId}`, {
    method: 'DELETE',
  })
}

// ── Executor Pending Script API（录制脚本恢复） ──

export interface PendingScriptResult {
  found: boolean
  script_content: string
  session_id: string
  source: 'memory' | 'disk' | ''
  captured_at?: string
}

/** 获取指定任务的待提交录制脚本（页面刷新后恢复用） */
export async function getPendingScript(taskId: number): Promise<PendingScriptResult> {
  const resp = await fetch(`${EXECUTOR_BASE}/recording/codegen/task/${taskId}/pending`)
  return resp.json()
}

/** 清除指定任务的待提交脚本（提交成功后调用） */
export async function clearPendingScript(taskId: number): Promise<void> {
  await fetch(`${EXECUTOR_BASE}/recording/codegen/task/${taskId}/pending`, {
    method: 'DELETE',
  })
}

// ── Executor Auth API（认证状态管理） ──

export interface AuthStateInfo {
  exists: boolean
  valid: boolean
  file_path: string | null
  file_age_hours: number | null
  max_age_hours: number
  remaining_hours: number | null
  cookie_count: number
}

export interface AuthRefreshResult {
  success: boolean
  error: string
  checked_at?: number
  auth_state: AuthStateInfo
}

/** 查询目标 URL 的认证状态 */
export async function checkAuthStatus(startUrl: string): Promise<AuthStateInfo> {
  const resp = await fetch(`${EXECUTOR_BASE}/auth/status?start_url=${encodeURIComponent(startUrl)}`)
  return resp.json()
}

/** 主动探测并刷新目标 URL 的认证状态 */
export async function refreshAuthStatus(startUrl: string): Promise<AuthRefreshResult> {
  const resp = await fetch(
    `${EXECUTOR_BASE}/auth/refresh?start_url=${encodeURIComponent(startUrl)}`,
    {
      method: 'POST',
    },
  )
  return resp.json()
}

/** 手动清除认证状态（强制下次重新登录） */
export async function invalidateAuth(startUrl: string): Promise<void> {
  await fetch(`${EXECUTOR_BASE}/auth/invalidate?start_url=${encodeURIComponent(startUrl)}`, {
    method: 'POST',
  })
}

/** 手动登录获取Token 的响应 */
export interface AuthLoginResult {
  success: boolean
  error: string
  attempts: number
  auth_state: AuthStateInfo
}

/** 手动触发自动登录，获取目标站点的认证 Token */
export async function loginForToken(
  startUrl: string,
  username: string,
  password: string,
): Promise<AuthLoginResult> {
  const resp = await fetch(`${EXECUTOR_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start_url: startUrl, username, password }),
  })
  return resp.json()
}

/** 打开浏览器让用户手动登录 */
export async function manualLoginStart(
  startUrl: string,
): Promise<{ success: boolean; message: string; domain: string; error?: string }> {
  const resp = await fetch(`${EXECUTOR_BASE}/auth/manual-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start_url: startUrl }),
  })
  return resp.json()
}

/** 用户确认登录完成，保存认证状态 */
export async function manualLoginComplete(
  startUrl: string,
): Promise<{ success: boolean; message: string; auth_state?: AuthStateInfo; error?: string }> {
  const resp = await fetch(`${EXECUTOR_BASE}/auth/manual-login/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start_url: startUrl }),
  })
  return resp.json()
}
