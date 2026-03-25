import { ref, reactive } from 'vue'
import type { ModuleTreeNode } from '../api/types'

// Global states holding the tree data derived from TestCasePage (when mounted/loaded)
export const globalModuleTree = ref<any[]>([])
export const globalModuleCaseCount = ref<Record<string, number>>({})
export const globalUnplannedCount = ref(0)
export const globalSelectedModulePath = ref('')
export const globalTreeExpanded = ref(true)

// Actions and form state that AppSidebar can trigger or open
export const globalTreeActions = reactive({
  onModuleClick: (path: string) => {},
  openCreateDirectory: () => {},
  onNodeMenuCommand: (cmd: string, path: string, name: string) => {},
  
  // Expose the refs directly so sidebar can manage forms if needed,
  // or Sidebar can just render its own form and call the API?
  // It's safer to just let TestCasePage handle the dialogs and API calls
  // The sidebar just triggers the open action.
  openRenameDialog: (path: string, currentName: string) => {},
  deleteDirectory: (path: string) => {}
})
