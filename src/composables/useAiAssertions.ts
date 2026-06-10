/**
 * 断言库业务逻辑 Composable。
 *
 * 管理断言资产列表、详情、保存、发布和归档流程；页面层只负责呈现。
 */
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import { extractErrorMessage, isElMessageBoxCancel } from '@/utils/error'
import {
  AssertionAssetStatus,
  AssertionAssetType,
  archiveAssertionAsset,
  createAssertionAsset,
  deleteAssertionAsset,
  fetchAssertionAssetDetail,
  fetchAssertionAssetList,
  fetchAssertionAssetReferences,
  publishAssertionAsset,
  updateAssertionAsset,
  type AiAssertionAsset,
  type AiAssetReference,
  type AssertionAssetStatus as AssertionAssetStatusType,
  type AssertionAssetType as AssertionAssetTypeType,
  type SaveAssertionAssetPayload,
} from '@/api/aiScript'

interface AssertionFilters {
  keyword: string
  status: AssertionAssetStatusType | ''
  assertionType: AssertionAssetTypeType | ''
}

interface AssertionForm {
  id?: number
  assertionKey: string
  assertionName: string
  assertionType: AssertionAssetTypeType
  description: string
  paramSchemaText: string
  implementationText: string
  failureMessageTpl: string
  evidenceConfigText: string
  allowAiReuse: boolean
}

function normalizeAssetKey(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase()
}

function stringifyObject(value: Record<string, unknown> | undefined, fallback: string) {
  if (!value || Object.keys(value).length === 0) return fallback
  return JSON.stringify(value, null, 2)
}

function parseJsonObject(value: string, fieldName: string): Record<string, unknown> {
  const trimmed = value.trim()
  if (!trimmed) return {}
  const parsed = JSON.parse(trimmed) as unknown
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${fieldName} 必须是 JSON 对象`)
  }
  return parsed as Record<string, unknown>
}

function defaultImplementation(assertionType: AssertionAssetTypeType) {
  return {
    type: assertionType,
    template: 'await expect(page).toBeDefined()',
  }
}

/** 断言库列表和资产治理逻辑。 */
export function useAiAssertions() {
  const projectStore = useProjectStore()
  const projectId = computed(() => projectStore.selectedProjectId)

  const assertions = ref<AiAssertionAsset[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(20)
  const loading = ref(false)
  const submitting = ref(false)
  const detailLoading = ref(false)
  const referenceLoading = ref(false)
  const errorMessage = ref('')
  const dialogVisible = ref(false)
  const detailVisible = ref(false)
  const currentAssertion = ref<AiAssertionAsset | null>(null)
  const references = ref<AiAssetReference[]>([])

  const filters = reactive<AssertionFilters>({
    keyword: '',
    status: '',
    assertionType: '',
  })

  const form = reactive<AssertionForm>({
    assertionKey: '',
    assertionName: '',
    assertionType: AssertionAssetType.UI_VISIBLE,
    description: '',
    paramSchemaText:
      '{\n  "selector": {\n    "type": "string",\n    "description": "稳定选择器"\n  }\n}',
    implementationText: JSON.stringify(
      defaultImplementation(AssertionAssetType.UI_VISIBLE),
      null,
      2,
    ),
    failureMessageTpl: '断言未通过，请检查页面或接口返回',
    evidenceConfigText: '{\n  "screenshot": "ON_FAILURE",\n  "trace": true\n}',
    allowAiReuse: true,
  })

  const hasProject = computed(() => Boolean(projectId.value))
  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
  const dialogTitle = computed(() => (form.id ? '编辑断言' : '新建断言'))

  function resetForm() {
    form.id = undefined
    form.assertionKey = ''
    form.assertionName = ''
    form.assertionType = AssertionAssetType.UI_VISIBLE
    form.description = ''
    form.paramSchemaText =
      '{\n  "selector": {\n    "type": "string",\n    "description": "稳定选择器"\n  }\n}'
    form.implementationText = JSON.stringify(
      defaultImplementation(AssertionAssetType.UI_VISIBLE),
      null,
      2,
    )
    form.failureMessageTpl = '断言未通过，请检查页面或接口返回'
    form.evidenceConfigText = '{\n  "screenshot": "ON_FAILURE",\n  "trace": true\n}'
    form.allowAiReuse = true
  }

  async function fetchAssertions(targetPage = page.value) {
    if (!projectId.value) {
      assertions.value = []
      total.value = 0
      errorMessage.value = '请先选择项目'
      return
    }
    loading.value = true
    errorMessage.value = ''
    try {
      const result = await fetchAssertionAssetList({
        projectId: projectId.value,
        keyword: filters.keyword.trim() || undefined,
        status: filters.status,
        assertionType: filters.assertionType,
        pageNo: targetPage,
        pageSize: pageSize.value,
      })
      assertions.value = result.list
      total.value = result.total
      page.value = targetPage
    } catch (error: unknown) {
      errorMessage.value = extractErrorMessage(error, '加载断言库失败')
      ElMessage.error(errorMessage.value)
    } finally {
      loading.value = false
    }
  }

  async function applyFilters() {
    page.value = 1
    await fetchAssertions(1)
  }

  async function resetFilters() {
    filters.keyword = ''
    filters.status = ''
    filters.assertionType = ''
    await applyFilters()
  }

  async function changePage(targetPage: number) {
    if (targetPage < 1 || targetPage > totalPages.value) return
    await fetchAssertions(targetPage)
  }

  async function changePageSize(size: number) {
    pageSize.value = size
    page.value = 1
    await fetchAssertions(1)
  }

  function openCreateDialog() {
    resetForm()
    dialogVisible.value = true
  }

  function openEditDialog(row: AiAssertionAsset) {
    form.id = row.id
    form.assertionKey = row.assertionKey
    form.assertionName = row.assertionName
    form.assertionType = row.assertionType
    form.description = row.description || ''
    form.paramSchemaText = stringifyObject(row.paramSchema, '{}')
    form.implementationText = stringifyObject(
      row.implementation,
      JSON.stringify(defaultImplementation(row.assertionType), null, 2),
    )
    form.failureMessageTpl = row.failureMessageTpl || '断言未通过，请检查页面或接口返回'
    form.evidenceConfigText = stringifyObject(
      row.evidenceConfig,
      '{\n  "screenshot": "ON_FAILURE",\n  "trace": true\n}',
    )
    form.allowAiReuse = row.allowAiReuse
    dialogVisible.value = true
  }

  async function openDetail(row: AiAssertionAsset) {
    if (!projectId.value) return
    detailVisible.value = true
    currentAssertion.value = row
    detailLoading.value = true
    referenceLoading.value = true
    try {
      currentAssertion.value = await fetchAssertionAssetDetail(row.id, projectId.value)
      references.value = await fetchAssertionAssetReferences(row.id, projectId.value)
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, '加载断言详情失败'))
    } finally {
      detailLoading.value = false
      referenceLoading.value = false
    }
  }

  function buildPayload(): SaveAssertionAssetPayload | null {
    if (!projectId.value) {
      ElMessage.warning('请先选择项目')
      return null
    }
    if (!form.assertionName.trim()) {
      ElMessage.warning('请填写断言名称')
      return null
    }
    if (!form.id && !form.assertionKey.trim()) {
      ElMessage.warning('请填写断言 Key')
      return null
    }
    try {
      return {
        projectId: projectId.value,
        assertionKey: form.id ? undefined : normalizeAssetKey(form.assertionKey),
        assertionName: form.assertionName.trim(),
        assertionType: form.assertionType,
        description: form.description.trim() || undefined,
        paramSchema: parseJsonObject(form.paramSchemaText, '参数 Schema'),
        implementation: parseJsonObject(form.implementationText, '实现模板'),
        failureMessageTpl: form.failureMessageTpl.trim() || undefined,
        evidenceConfig: parseJsonObject(form.evidenceConfigText, '证据配置'),
        allowAiReuse: form.allowAiReuse,
      }
    } catch (error: unknown) {
      ElMessage.warning(extractErrorMessage(error, 'JSON 格式不正确'))
      return null
    }
  }

  async function submitForm() {
    const payload = buildPayload()
    if (!payload) return
    submitting.value = true
    try {
      if (form.id) {
        await updateAssertionAsset(form.id, payload)
        ElMessage.success('断言已更新')
      } else {
        await createAssertionAsset(payload)
        ElMessage.success('断言已创建')
      }
      dialogVisible.value = false
      await fetchAssertions(form.id ? page.value : 1)
    } catch (error: unknown) {
      ElMessage.error(extractErrorMessage(error, '保存断言失败'))
    } finally {
      submitting.value = false
    }
  }

  async function publish(row: AiAssertionAsset) {
    if (!projectId.value) return
    try {
      await ElMessageBox.confirm(`确定发布断言「${row.assertionName}」？`, '发布断言', {
        type: 'warning',
        confirmButtonText: '发布',
        cancelButtonText: '取消',
      })
      await publishAssertionAsset(row.id, projectId.value)
      ElMessage.success('断言已发布')
      await fetchAssertions(page.value)
    } catch (error: unknown) {
      if (!isElMessageBoxCancel(error)) {
        ElMessage.error(extractErrorMessage(error, '发布断言失败'))
      }
    }
  }

  async function archive(row: AiAssertionAsset) {
    if (!projectId.value) return
    try {
      await ElMessageBox.confirm(`确定归档断言「${row.assertionName}」？`, '归档断言', {
        type: 'warning',
        confirmButtonText: '归档',
        cancelButtonText: '取消',
      })
      await archiveAssertionAsset(row.id, projectId.value)
      ElMessage.success('断言已归档')
      await fetchAssertions(page.value)
    } catch (error: unknown) {
      if (!isElMessageBoxCancel(error)) {
        ElMessage.error(extractErrorMessage(error, '归档断言失败'))
      }
    }
  }

  async function deleteDraft(row: AiAssertionAsset) {
    if (!projectId.value) return
    try {
      await ElMessageBox.confirm(`确定删除断言草稿「${row.assertionName}」？`, '删除断言草稿', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      })
      await deleteAssertionAsset(row.id, projectId.value)
      ElMessage.success('断言草稿已删除')
      await fetchAssertions(page.value)
    } catch (error: unknown) {
      if (!isElMessageBoxCancel(error)) {
        ElMessage.error(extractErrorMessage(error, '删除断言草稿失败'))
      }
    }
  }

  watch(
    () => form.assertionType,
    (nextType) => {
      if (!form.id) {
        form.implementationText = JSON.stringify(defaultImplementation(nextType), null, 2)
      }
    },
  )

  watch(projectId, () => {
    page.value = 1
    fetchAssertions(1)
  })

  return {
    AssertionAssetStatus,
    AssertionAssetType,
    assertions,
    total,
    page,
    pageSize,
    loading,
    submitting,
    detailLoading,
    referenceLoading,
    errorMessage,
    dialogVisible,
    detailVisible,
    currentAssertion,
    references,
    filters,
    form,
    hasProject,
    totalPages,
    dialogTitle,
    fetchAssertions,
    applyFilters,
    resetFilters,
    changePage,
    changePageSize,
    openCreateDialog,
    openEditDialog,
    openDetail,
    submitForm,
    publish,
    archive,
    deleteDraft,
  }
}
