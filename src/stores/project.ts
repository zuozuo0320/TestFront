import { ref } from 'vue'
import { defineStore } from 'pinia'
import { listProjects, createProject } from '../api/project'
import type { Project } from '../api/types'

const NAV_STATE_KEY = 'tp-nav-state-v1'
const topMenus = ['workbench', 'project', 'plan', 'testcases', 'e2e', 'system'] as const
const systemMenus = ['users', 'roles', 'projects'] as const

export type TopMenu = (typeof topMenus)[number]
export type SystemMenu = (typeof systemMenus)[number]

type NavState = {
  topMenu: TopMenu
  activeMenu: SystemMenu
  projectId: number | null
}

function restoreNavState(): Partial<NavState> {
  try {
    const raw = localStorage.getItem(NAV_STATE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<NavState>
    const state: Partial<NavState> = {}
    if (parsed.topMenu && (topMenus as readonly string[]).includes(parsed.topMenu)) {
      state.topMenu = parsed.topMenu
    }
    if (parsed.activeMenu && (systemMenus as readonly string[]).includes(parsed.activeMenu)) {
      state.activeMenu = parsed.activeMenu
    }
    if (typeof parsed.projectId === 'number' && Number.isFinite(parsed.projectId)) {
      state.projectId = parsed.projectId
    }
    return state
  } catch {
    return {}
  }
}

export const useProjectStore = defineStore('project', () => {
  const initialNav = restoreNavState()

  const projects = ref<Project[]>([])
  const selectedProjectId = ref<number | null>(null)
  const topMenu = ref<TopMenu>(initialNav.topMenu || 'testcases')
  const activeMenu = ref<SystemMenu>(initialNav.activeMenu || 'users')

  function persistNavState() {
    const payload: NavState = {
      topMenu: topMenu.value,
      activeMenu: activeMenu.value,
      projectId: selectedProjectId.value,
    }
    localStorage.setItem(NAV_STATE_KEY, JSON.stringify(payload))
  }

  async function fetchProjects() {
    projects.value = await listProjects()
    const first = projects.value[0]
    if (first) {
      const exists = projects.value.some((p) => p.id === selectedProjectId.value)
      if (!exists) selectedProjectId.value = first.id
    } else {
      selectedProjectId.value = null
    }
  }

  async function addProject(payload: { name: string; description?: string }) {
    const project = await createProject(payload)
    projects.value.push(project)
    return project
  }

  function restoreProjectFromNav() {
    const restored = restoreNavState()
    if (restored.topMenu) topMenu.value = restored.topMenu
    if (restored.activeMenu) activeMenu.value = restored.activeMenu
    if (
      typeof restored.projectId === 'number' &&
      projects.value.some((p) => p.id === restored.projectId)
    ) {
      selectedProjectId.value = restored.projectId
    } else {
      const first = projects.value[0]
      selectedProjectId.value = first ? first.id : null
    }
  }

  return {
    projects,
    selectedProjectId,
    topMenu,
    activeMenu,
    persistNavState,
    fetchProjects,
    addProject,
    restoreProjectFromNav,
  }
})
