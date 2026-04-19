/**
 * useTagManagement — 标签管理业务逻辑 Composable
 *
 * 职责：封装标签模块的全部业务逻辑，供 TagManagement.vue 页面编排层消费。
 * 包括：
 *   - 标签 CRUD（创建、更新、删除）
 *   - 分页加载与搜索（带 AbortController 竞态防护）
 *   - 排序切换（用例数 / 名称 / 创建时间）
 *   - 批量创建（自动分配互斥色）
 *   - 统计数据计算（总用例数、最热标签、未使用数）
 *   - 对话框状态管理（新建/编辑标签）
 *
 * @module useTagManagement
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useProjectStore } from '../stores/project'
import { listTags, createTag, updateTag, deleteTag } from '../api/tag'
import type { Tag } from '../api/tag'
import { apiClient } from '../api/client'
import {
  presetColors,
  nextAvailableColor as getNextColor,
  allocateBatchColors,
} from '../utils/tagColor'

export function useTagManagement() {
  // ── 项目上下文 ──
  const projectStore = useProjectStore()
  const selectedProject = computed(() => projectStore.selectedProjectId) // 当前选中的项目 ID
  // 构造服务端基础地址（去除 /api/v1 后缀），用于拼接头像等静态资源 URL
  const apiBaseUrl = apiClient.defaults.baseURL || 'http://localhost:8080/api/v1'
  const serverUrl = apiBaseUrl.replace(/\/api\/v1\/?$/, '')

  // ── 列表状态 ──
  const loading = ref(false) // 加载中标志
  const tags = ref<Tag[]>([]) // 当前页标签列表
  const total = ref(0) // 符合条件的标签总数（分页用）
  const page = ref(1) // 当前页码
  const pageSize = ref(20) // 每页条数
  const keyword = ref('') // 搜索关键词
  const activeTab = ref<'all' | 'recent'>('all') // 当前选中的 Tab（全部 / 最近更新）
  const sortBy = ref<'case_count' | 'name' | 'created_at'>('case_count') // 排序字段

  // ── 对话框状态（新建/编辑标签共用） ──
  const dialogVisible = ref(false) // 对话框是否可见
  const editingId = ref<number | null>(null) // 编辑模式时的标签 ID，null 表示新建
  const saving = ref(false) // 提交中标志（防止重复提交）
  const tagForm = reactive({ name: '', color: '#3B82F6', description: '' }) // 表单数据

  // ── 批量创建状态 ──
  const batchInput = ref('') // 批量输入框内容（逗号或空格分隔）
  const batchAutoColor = ref(true) // 是否自动分配互斥颜色

  // ── 搜索竞态控制器 ──
  // 每次发起搜索时取消上一次未完成的请求，避免旧结果覆盖新结果
  let searchController: AbortController | null = null

  // ── 计算属性 ──

  /** 批量输入预览：按逗号/中文逗号/空格拆分后的标签名数组 */
  const batchPreviewNames = computed(() =>
    batchInput.value
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  )

  /** 热度 TOP5：按用例数降序取前 5 个标签，用于热度统计卡片 */
  const topTags = computed(() =>
    [...tags.value].sort((a, b) => b.case_count - a.case_count).slice(0, 5),
  )

  /** 排序后的标签列表：“最近更新” Tab 下只显示 7 天内更新的标签 */
  const sortedTags = computed(() => {
    let list = [...tags.value]
    if (activeTab.value === 'recent') {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      list = list.filter(
        (t) => new Date(t.updated_at || t.created_at || 0).getTime() >= sevenDaysAgo,
      )
    }
    return list
  })

  /** 所有标签关联的用例总数（用于概览卡片） */
  const totalCaseCount = computed(() => tags.value.reduce((s, t) => s + (t.case_count || 0), 0))

  /** 单个标签的最大用例数（用于热度条百分比计算，最小为 1 防除零） */
  const maxCaseCount = computed(() => Math.max(...tags.value.map((t) => t.case_count || 0), 1))

  /** 未被任何用例引用的标签数量 */
  const unusedCount = computed(() => tags.value.filter((t) => t.case_count === 0).length)

  // ── 数据加载 ──

  /**
   * 加载标签列表（支持搜索 + 分页 + 排序）
   * 如果传入 AbortSignal，在请求被取消时不会更新状态，避免旧数据覆盖新数据
   *
   * @param signal - 可选的 AbortSignal，用于搜索竞态控制
   */
  async function loadTags(signal?: AbortSignal) {
    if (!selectedProject.value) {
      tags.value = []
      total.value = 0
      return
    }
    loading.value = true
    try {
      const resp = await listTags(selectedProject.value, {
        keyword: keyword.value.trim() || undefined,
        page: page.value,
        pageSize: pageSize.value,
        sortBy: sortBy.value,
      })
      // 请求已被取消则不更新状态，防止旧结果覆盖新结果
      if (signal?.aborted) return
      tags.value = resp.items ?? []
      total.value = resp.total ?? 0
    } catch {
      // 主动取消的请求不显示错误提示
      if (!signal?.aborted) {
        ElMessage.error('加载标签列表失败')
      }
    } finally {
      if (!signal?.aborted) {
        loading.value = false
      }
    }
  }

  // ── 侦听器 ──

  // 切换项目时重置搜索条件并重新加载
  watch(selectedProject, () => {
    keyword.value = ''
    page.value = 1
    loadTags()
  })

  // 分页、每页条数、排序变化时自动重新加载
  watch([page, pageSize, sortBy], () => loadTags())

  // 组件挂载时加载初始数据
  onMounted(() => {
    if (selectedProject.value) loadTags()
  })

  // ── 搜索（带防抖和竞态控制） ──
  let searchTimer: ReturnType<typeof setTimeout> | null = null

  /** 立即搜索：取消上一次请求 + 发起新请求 */
  function onSearch() {
    page.value = 1
    searchController?.abort()
    searchController = new AbortController()
    loadTags(searchController.signal)
  }

  /** 防抖搜索：输入停顿 300ms 后触发，减少 API 调用频率 */
  function onSearchDebounce() {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      onSearch()
    }, 300)
  }

  // ── CRUD 操作 ──

  /** 获取下一个未被占用的预设颜色，确保新标签颜色不与已有标签重复 */
  function nextAvailableColor(): string {
    return getNextColor(tags.value.map((t) => t.color || ''))
  }

  /** 打开新建标签对话框：重置表单并自动分配下一个可用颜色 */
  function openCreate() {
    editingId.value = null
    tagForm.name = ''
    tagForm.color = nextAvailableColor()
    tagForm.description = ''
    dialogVisible.value = true
  }

  /** 打开编辑标签对话框：以现有标签数据填充表单 */
  function openEdit(tag: Tag) {
    editingId.value = tag.id
    tagForm.name = tag.name
    tagForm.color = tag.color
    tagForm.description = tag.description || ''
    dialogVisible.value = true
  }

  /**
   * 提交标签表单（新建或更新）
   * 前端校验：名称长度 2-50、颜色格式 #RRGGBB
   * 校验通过后调用对应 API，失败时提取后端错误消息显示
   */
  async function submitTag() {
    if (!selectedProject.value) return
    const trimmedName = tagForm.name.trim()
    // 前端校验：与后端规则保持一致（名称 2-50 字符）
    if (!trimmedName) {
      ElMessage.warning('标签名称不能为空')
      return
    }
    if (trimmedName.length < 2 || trimmedName.length > 50) {
      ElMessage.warning('标签名称长度须在 2-50 个字符之间')
      return
    }
    // 前端校验：颜色必须为 #RRGGBB 格式
    if (!/^#[0-9A-Fa-f]{6}$/.test(tagForm.color)) {
      ElMessage.warning('颜色格式不正确，请使用 #RRGGBB 格式')
      return
    }
    saving.value = true
    try {
      if (editingId.value) {
        // 编辑模式：调用更新接口
        await updateTag(selectedProject.value, editingId.value, {
          name: trimmedName,
          color: tagForm.color,
          description: tagForm.description.trim(),
        })
        ElMessage.success('标签更新成功')
      } else {
        // 新建模式：调用创建接口
        await createTag(selectedProject.value, {
          name: trimmedName,
          color: tagForm.color,
          description: tagForm.description.trim(),
        })
        ElMessage.success('标签创建成功')
      }
      dialogVisible.value = false
      await loadTags() // 刷新列表
    } catch (e: unknown) {
      // 提取后端返回的错误消息显示给用户
      const msg =
        (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
          ?.message ||
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        '操作失败'
      ElMessage.error(msg)
    } finally {
      saving.value = false
    }
  }

  /**
   * 删除标签（带确认对话框）
   * 如果标签已被用例引用，提示用户“删除后将自动解除关联”
   */
  async function onDelete(tag: Tag) {
    if (!selectedProject.value) return
    // 转义 HTML 特殊字符，防止 XSS
    const esc = (s: string) =>
      s.replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c,
      )
    const safeName = esc(tag.name)
    // 颜色圆点 + 标签名称，让确认对话框更直观
    const colorDot = `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${tag.color};vertical-align:middle;margin-right:4px"></span>`
    const msg =
      tag.case_count > 0
        ? `${colorDot}标签「${safeName}」已被 ${tag.case_count} 个用例使用，删除后将自动解除关联，是否继续？`
        : `${colorDot}确认删除标签「${safeName}」？`
    try {
      await ElMessageBox.confirm(msg, '删除确认', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        dangerouslyUseHTMLString: true,
      })
      await deleteTag(selectedProject.value, tag.id)
      ElMessage.success('删除成功')
      await loadTags() // 刷新列表
    } catch (e: unknown) {
      // 用户点击“取消”时 e === 'cancel'，不需要提示
      if (e !== 'cancel') {
        const errMsg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          '删除失败'
        ElMessage.error(errMsg)
      }
    }
  }

  /**
   * 批量创建标签
   * 按逗号/空格分割输入，为每个标签分配互斥颜色后逐个调用创建 API
   * 重复名称的标签会被静默跳过
   */
  async function batchCreate() {
    if (!selectedProject.value) return
    const names = batchInput.value
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (names.length === 0) {
      ElMessage.warning('请输入至少一个标签名')
      return
    }
    saving.value = true
    // 收集已有标签颜色，用于计算互斥色分配方案
    const usedTagColors = tags.value.map((t) => t.color || '')
    const batchColors = allocateBatchColors(names.length, usedTagColors)
    let successCount = 0
    for (let i = 0; i < names.length; i++) {
      // 如果开启自动配色则使用互斥色，否则使用默认蓝色
      const color = batchAutoColor.value ? batchColors[i]! : '#3B82F6'
      try {
        await createTag(selectedProject.value, { name: names[i] ?? '', color, description: '' })
        successCount++
      } catch {
        /* 静默跳过重复名称等错误，继续创建下一个 */
      }
    }
    saving.value = false
    if (successCount > 0) {
      ElMessage.success(`成功创建 ${successCount} 个标签`)
      batchInput.value = ''
      await loadTags() // 刷新列表
    } else {
      ElMessage.warning('所有标签均已存在或创建失败')
    }
  }

  // ── 辅助函数 ──

  /**
   * 根据标签关联的用例数量返回对应的 Material 图标名称
   * 用例数越多图标越“醒目”，体现标签的重要程度
   */
  function getTagIcon(tag: Tag): string {
    const c = tag.case_count || 0
    if (c > 100) return 'verified' // > 100 用例：金牌认证图标
    if (c > 50) return 'check_circle' // > 50 用例：勾选图标
    if (c > 10) return 'sell' // > 10 用例：价签图标
    return 'label' // 其他：普通标签图标
  }

  return {
    // ── 响应式状态 ──
    loading,
    tags,
    total,
    page,
    pageSize,
    keyword,
    activeTab,
    sortBy,
    dialogVisible,
    editingId,
    saving,
    tagForm,
    batchInput,
    batchAutoColor,
    serverUrl,
    // ── 计算属性 ──
    batchPreviewNames,
    topTags,
    sortedTags,
    totalCaseCount,
    maxCaseCount,
    unusedCount,
    selectedProject,
    // ── 方法 ──
    loadTags,
    onSearch,
    onSearchDebounce,
    openCreate,
    openEdit,
    submitTag,
    onDelete,
    batchCreate,
    getTagIcon,
    // ── 常量重导出 ──
    presetColors,
  }
}
