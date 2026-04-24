import { ref, reactive } from 'vue'
import type { ModuleTreeNode } from '../api/types'

/**
 * 带 path 字段的模块树节点：在原 API 节点上补 path（从根拼接的路径）
 * 与 children 同步收敛到带 path 的类型，方便 Sidebar 过滤/高亮。
 */
export type ModuleTreeNodeWithPath = Omit<ModuleTreeNode, 'children'> & {
  path: string
  children: ModuleTreeNodeWithPath[]
}

// Global states holding the tree data derived from TestCasePage (when mounted/loaded)
export const globalModuleTree = ref<ModuleTreeNodeWithPath[]>([])
export const globalModuleCaseCount = ref<Record<string, number>>({})
export const globalUnplannedCount = ref(0)
export const globalTotalCaseCount = ref(0)
export const globalSelectedModulePath = ref('')
export const globalSelectedModuleId = ref<number | 0>(0)
export const globalTreeExpanded = ref(true)

// Actions and form state that AppSidebar can trigger or open
export const globalTreeActions = reactive({
  onModuleClick: (_path: string) => {},
  openCreateDirectory: () => {},
  onAddRootModule: () => {},
  onNodeMenuCommand: (_cmd: string, _path: string, _name: string, _id?: number) => {},

  // Expose the refs directly so sidebar can manage forms if needed,
  // or Sidebar can just render its own form and call the API?
  // It's safer to just let TestCasePage handle the dialogs and API calls
  // The sidebar just triggers the open action.
  openRenameDialog: (_path: string, _currentName: string, _id?: number) => {},
  deleteDirectory: (_path: string, _id?: number) => {},
})
