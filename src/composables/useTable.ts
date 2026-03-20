import { ref } from 'vue'

/**
 * 通用表格逻辑：分页、加载、刷新
 *
 * @param fetchFn - 获取数据的异步函数，接收 { page, pageSize } 返回 { items, total, page, pageSize }
 * @returns 表格状态和操作方法
 *
 * @example
 * const { rows, total, loading, loadData } = useTable((p) => listTestCases(projectId, p))
 */
export function useTable<T>(
  fetchFn: (params: {
    page: number
    pageSize: number
  }) => Promise<{ items: T[]; total: number; page: number; pageSize: number }>,
) {
  const rows = ref<T[]>([]) as ReturnType<typeof ref<T[]>>
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(10)
  const loading = ref(false)
  const error = ref('')

  async function loadData() {
    loading.value = true
    error.value = ''
    try {
      const result = await fetchFn({ page: page.value, pageSize: pageSize.value })
      rows.value = result.items
      total.value = result.total
      page.value = result.page
      pageSize.value = result.pageSize
    } catch (e: any) {
      error.value = e?.response?.data?.error || '加载失败，请重试'
    } finally {
      loading.value = false
    }
  }

  function onPageChange(newPage: number) {
    page.value = newPage
    loadData()
  }

  function onPageSizeChange(newSize: number) {
    pageSize.value = newSize
    page.value = 1
    loadData()
  }

  function refresh() {
    loadData()
  }

  return { rows, total, page, pageSize, loading, error, loadData, onPageChange, onPageSizeChange, refresh }
}
