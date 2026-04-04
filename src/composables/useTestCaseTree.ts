import { ref, reactive } from 'vue'

// Global states holding the tree data derived from TestCasePage (when mounted/loaded)
export const globalModuleTree = ref<any[]>([])
export const globalModuleCaseCount = ref<Record<string, number>>({})
export const globalUnplannedCount = ref(0)
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
