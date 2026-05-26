/**
 * 需求智生 Composable
 *
 * 封装需求文档管理 + 生成任务管理 + Skill 管理的完整业务逻辑。
 * 包括 loading/error/data 三态管理、列表刷新、分页、操作反馈。
 */
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import {
  listRequirementDocs,
  uploadRequirementDoc,
  pasteRequirementDoc,
  deleteRequirementDoc,
  getRequirementDoc,
  type RequirementDoc,
  type DocListParams,
} from '@/api/requirementDoc'
import {
  listGenTasks,
  createGenTask,
  getGenTask,
  deleteGenTask,
  listGenResults,
  adoptResult,
  discardResult,
  closeGenTask,
  smartGenerate,
  type GenTask,
  type GenResult,
  type CreateGenTaskPayload,
  type GenTaskListParams,
  type SmartGeneratePayload,
  type SmartGenerateResult,
} from '@/api/requirementGen'
import { listAISkills, type AISkill } from '@/api/aiSkill'

interface ApiErrorLike {
  response?: {
    data?: {
      message?: string
    }
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  const apiError = error as ApiErrorLike
  return apiError.response?.data?.message || fallback
}

/** 需求文档管理逻辑 */
export function useRequirementDocs() {
  const projectStore = useProjectStore()
  const projectId = computed(() => projectStore.selectedProjectId)

  const docs = ref<RequirementDoc[]>([])
  const total = ref(0)
  const loading = ref(false)
  const page = ref(1)
  const pageSize = ref(20)
  const keyword = ref('')
  const parseStatusFilter = ref('')

  async function fetchDocs() {
    if (!projectId.value) return
    loading.value = true
    try {
      const params: DocListParams = {
        page: page.value,
        page_size: pageSize.value,
      }
      if (keyword.value) params.keyword = keyword.value
      if (parseStatusFilter.value) params.parse_status = parseStatusFilter.value

      const result = await listRequirementDocs(projectId.value, params)
      docs.value = result.items || []
      total.value = result.total
    } catch (e: unknown) {
      ElMessage.error(getErrorMessage(e, '加载文档列表失败'))
    } finally {
      loading.value = false
    }
  }

  async function handleUpload(file: File, title: string, remark?: string) {
    if (!projectId.value) return
    try {
      await uploadRequirementDoc(projectId.value, file, title, remark)
      ElMessage.success('文档上传成功，正在解析中...')
      await fetchDocs()
    } catch (e: unknown) {
      ElMessage.error(getErrorMessage(e, '上传失败'))
    }
  }

  async function handlePaste(title: string, content: string, remark?: string) {
    if (!projectId.value) return
    try {
      await pasteRequirementDoc(projectId.value, { title, raw_content: content, remark })
      ElMessage.success('文档创建成功')
      await fetchDocs()
    } catch (e: unknown) {
      ElMessage.error(getErrorMessage(e, '创建失败'))
    }
  }

  async function handleDelete(docId: number) {
    if (!projectId.value) return
    try {
      await ElMessageBox.confirm('确定删除该需求文档？删除后不可恢复。', '删除确认', {
        type: 'warning',
      })
      await deleteRequirementDoc(projectId.value, docId)
      ElMessage.success('删除成功')
      await fetchDocs()
    } catch {
      // 用户取消
    }
  }

  async function getDocDetail(docId: number): Promise<RequirementDoc | null> {
    if (!projectId.value) return null
    try {
      return await getRequirementDoc(projectId.value, docId)
    } catch (e: unknown) {
      ElMessage.error(getErrorMessage(e, '获取文档详情失败'))
      return null
    }
  }

  // 项目切换时自动刷新
  watch(
    projectId,
    () => {
      page.value = 1
      fetchDocs()
    },
    { immediate: true },
  )

  return {
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
    getDocDetail,
  }
}

/** 生成任务管理逻辑 */
export function useGenTasks() {
  const projectStore = useProjectStore()
  const projectId = computed(() => projectStore.selectedProjectId)

  const tasks = ref<GenTask[]>([])
  const total = ref(0)
  const loading = ref(false)
  const batchDeleting = ref(false)
  const page = ref(1)
  const pageSize = ref(20)
  const statusFilter = ref('')

  // 当前查看的任务
  const currentTask = ref<GenTask | null>(null)
  const currentResults = ref<GenResult[]>([])
  const detailLoading = ref(false)

  // Skill 列表
  const skills = ref<AISkill[]>([])
  const skillsLoading = ref(false)

  async function fetchTasks() {
    if (!projectId.value) return
    loading.value = true
    try {
      const params: GenTaskListParams = {
        page: page.value,
        page_size: pageSize.value,
      }
      if (statusFilter.value) params.status = statusFilter.value

      const result = await listGenTasks(projectId.value, params)
      tasks.value = result.items || []
      total.value = result.total
    } catch (e: unknown) {
      ElMessage.error(getErrorMessage(e, '加载任务列表失败'))
    } finally {
      loading.value = false
    }
  }

  /** 按文档 ID 获取关联的生成任务 */
  async function fetchTasksByDocId(docId: number): Promise<GenTask[]> {
    if (!projectId.value) return []
    try {
      const result = await listGenTasks(projectId.value, {
        requirement_doc_id: docId,
        page: 1,
        page_size: 100,
      })
      return result.items || []
    } catch (e: unknown) {
      ElMessage.error(getErrorMessage(e, '加载文档任务失败'))
      return []
    }
  }

  async function fetchSkills() {
    if (!projectId.value) return
    skillsLoading.value = true
    try {
      skills.value = await listAISkills(projectId.value)
    } catch (e: unknown) {
      ElMessage.error(getErrorMessage(e, '加载 Skill 列表失败'))
    } finally {
      skillsLoading.value = false
    }
  }

  async function handleCreate(payload: CreateGenTaskPayload) {
    if (!projectId.value) return
    try {
      await createGenTask(projectId.value, payload)
      ElMessage.success('生成任务已创建，正在处理中...')
      await fetchTasks()
    } catch (e: unknown) {
      ElMessage.error(getErrorMessage(e, '创建任务失败'))
    }
  }

  async function fetchTaskDetail(taskId: number) {
    if (!projectId.value) return
    detailLoading.value = true
    try {
      currentTask.value = await getGenTask(projectId.value, taskId)
      currentResults.value = await listGenResults(projectId.value, taskId)
    } catch (e: unknown) {
      ElMessage.error(getErrorMessage(e, '加载任务详情失败'))
    } finally {
      detailLoading.value = false
    }
  }

  async function handleAdopt(resultId: number) {
    if (!projectId.value || !currentTask.value) return
    try {
      await adoptResult(projectId.value, resultId)
      ElMessage.success('产物已采纳')
      await fetchTaskDetail(currentTask.value.id)
    } catch (e: unknown) {
      ElMessage.error(getErrorMessage(e, '采纳失败'))
    }
  }

  async function handleDiscard(resultId: number) {
    if (!projectId.value || !currentTask.value) return
    try {
      await discardResult(projectId.value, resultId)
      ElMessage.success('产物已丢弃')
      await fetchTaskDetail(currentTask.value.id)
    } catch (e: unknown) {
      ElMessage.error(getErrorMessage(e, '丢弃失败'))
    }
  }

  async function handleClose(taskId: number) {
    if (!projectId.value) return
    try {
      await ElMessageBox.confirm(
        '关闭任务后，未处理的产物将自动标记为丢弃。确定关闭？',
        '关闭任务',
        { type: 'warning' },
      )
      await closeGenTask(projectId.value, taskId)
      ElMessage.success('任务已关闭')
      await fetchTasks()
    } catch {
      // 用户取消
    }
  }

  async function handleDeleteTask(taskId: number) {
    if (!projectId.value) return
    try {
      await ElMessageBox.confirm('删除后任务记录不可恢复，已生成的测试用例不受影响。', '删除任务', {
        type: 'warning',
      })
      await deleteGenTask(projectId.value, taskId)
      ElMessage.success('任务已删除')
      if (tasks.value.length === 1 && page.value > 1) {
        page.value -= 1
      }
      await fetchTasks()
    } catch (e: unknown) {
      if (e === 'cancel' || e === 'close') return
      ElMessage.error(getErrorMessage(e, '删除任务失败'))
    }
  }

  async function handleBatchDeleteTasks(selectedTasks: GenTask[]): Promise<boolean> {
    if (!projectId.value || selectedTasks.length === 0) return false
    try {
      await ElMessageBox.confirm(
        '删除后任务记录不可恢复，已生成的测试用例不受影响。',
        '批量删除任务',
        { type: 'warning' },
      )
      batchDeleting.value = true
      const currentProjectId = projectId.value
      for (const task of selectedTasks) {
        await deleteGenTask(currentProjectId, task.id)
      }
      ElMessage.success(`已删除 ${selectedTasks.length} 个任务`)
      if (selectedTasks.length >= tasks.value.length && page.value > 1) {
        page.value -= 1
      }
      await fetchTasks()
      return true
    } catch (e: unknown) {
      if (e === 'cancel' || e === 'close') return false
      ElMessage.error(getErrorMessage(e, '批量删除任务失败'))
      await fetchTasks()
      return false
    } finally {
      batchDeleting.value = false
    }
  }

  // 智能生成状态
  const smartGenerating = ref(false)
  const smartResult = ref<SmartGenerateResult | null>(null)

  async function handleSmartGenerate(
    payload: SmartGeneratePayload,
  ): Promise<SmartGenerateResult | null> {
    if (!projectId.value) return null
    smartGenerating.value = true
    smartResult.value = null
    try {
      const result = await smartGenerate(projectId.value, payload)
      smartResult.value = result
      const taskCount = result.created_tasks?.length || 0
      ElMessage.success(
        `AI 已分析需求，匹配 ${result.recommended_skills.length} 个测试策略，创建 ${taskCount} 个生成任务`,
      )
      await fetchTasks()
      return result
    } catch (e: unknown) {
      ElMessage.error(getErrorMessage(e, '智能生成失败'))
      return null
    } finally {
      smartGenerating.value = false
    }
  }

  // 项目切换时自动刷新
  watch(
    projectId,
    () => {
      page.value = 1
      fetchTasks()
      fetchSkills()
    },
    { immediate: true },
  )

  return {
    tasks,
    total,
    loading,
    batchDeleting,
    page,
    pageSize,
    statusFilter,
    currentTask,
    currentResults,
    detailLoading,
    skills,
    skillsLoading,
    smartGenerating,
    smartResult,
    fetchTasks,
    fetchTasksByDocId,
    fetchSkills,
    handleCreate,
    handleSmartGenerate,
    fetchTaskDetail,
    handleAdopt,
    handleDiscard,
    handleClose,
    handleDeleteTask,
    handleBatchDeleteTasks,
  }
}
