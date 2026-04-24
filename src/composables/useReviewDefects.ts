/**
 * useReviewDefects：单评审项下的 Action Items（缺陷）加载与状态变更
 *
 * 为什么独立成 composable：
 *   - CaseReviewDetail 左栏的 AI 门禁面板、Action Items 清单、未来的批量操作都需要复用
 *   - 按前端规范 §3 严禁在 api/ 层出现 UI 提示，这里统一消化 try/catch 与 ElMessage
 */

import { computed, ref, shallowRef } from 'vue'

import { ElMessage } from 'element-plus'

import {
  listItemDefects,
  resolveDefect as apiResolveDefect,
  disputeDefect as apiDisputeDefect,
  reopenDefect as apiReopenDefect,
  rerunAIGate as apiRerunAIGate,
  type CaseReviewDefect,
  type RuleRunReport,
} from '@/api/caseReviewV02'
import { isAbortError } from '@/utils/error'

/** AbortController 竞态控制：防止快速切换评审项时旧请求覆盖新数据 */
function makeAbortable() {
  let ctrl: AbortController | null = null
  return {
    next() {
      if (ctrl) ctrl.abort()
      ctrl = new AbortController()
      return ctrl.signal
    },
    cancel() {
      if (ctrl) ctrl.abort()
      ctrl = null
    },
  }
}

export function useReviewDefects() {
  const defects = shallowRef<CaseReviewDefect[]>([])
  const loading = ref(false)
  const runningRerun = ref(false)
  const abortable = makeAbortable()

  const openCount = computed(() => defects.value.filter((d) => d.status === 'open').length)
  const criticalCount = computed(
    () => defects.value.filter((d) => d.severity === 'critical').length,
  )

  /** 拉取指定评审项的 Action Items */
  async function fetchDefects(projectId: number, reviewId: number, itemId: number) {
    loading.value = true
    try {
      const signal = abortable.next()
      const resp = await listItemDefects(projectId, reviewId, itemId, { signal })
      // listItemDefects 响应：{ items: CaseReviewDefect[] }
      defects.value = resp.items ?? []
    } catch (err) {
      if (isAbortError(err)) return
      defects.value = []
      ElMessage.error('加载 Action Items 失败')
    } finally {
      loading.value = false
    }
  }

  /** 手动触发规则引擎 rerun，完成后刷新列表 */
  async function rerun(
    projectId: number,
    reviewId: number,
    itemId: number,
  ): Promise<RuleRunReport | null> {
    runningRerun.value = true
    try {
      const report = await apiRerunAIGate(projectId, reviewId, itemId)
      await fetchDefects(projectId, reviewId, itemId)
      const tip = report.passed
        ? 'AI 门禁通过'
        : `AI 门禁未通过：critical ${report.critical_count}，major ${report.major_count}`
      if (report.passed) ElMessage.success(tip)
      else ElMessage.warning(tip)
      return report
    } catch {
      ElMessage.error('规则引擎执行失败')
      return null
    } finally {
      runningRerun.value = false
    }
  }

  /** Author 标记缺陷为 resolved */
  async function resolve(projectId: number, defectId: number, note: string) {
    try {
      await apiResolveDefect(projectId, defectId, note)
      ElMessage.success('已标记为已解决')
      return true
    } catch {
      ElMessage.error('操作失败')
      return false
    }
  }

  /** Author 对缺陷提异议 */
  async function dispute(projectId: number, defectId: number, reason: string) {
    if (!reason.trim()) {
      ElMessage.warning('请填写异议理由')
      return false
    }
    try {
      await apiDisputeDefect(projectId, defectId, reason)
      ElMessage.success('已提交异议，等待 Moderator 裁决')
      return true
    } catch {
      ElMessage.error('操作失败')
      return false
    }
  }

  /** Moderator 重开缺陷 */
  async function reopen(projectId: number, defectId: number) {
    try {
      await apiReopenDefect(projectId, defectId)
      ElMessage.success('已重开')
      return true
    } catch {
      ElMessage.error('操作失败')
      return false
    }
  }

  /** 组件卸载或切换数据源时调用，取消未完成的请求 */
  function cancel() {
    abortable.cancel()
  }

  return {
    defects,
    loading,
    runningRerun,
    openCount,
    criticalCount,
    fetchDefects,
    rerun,
    resolve,
    dispute,
    reopen,
    cancel,
  }
}
