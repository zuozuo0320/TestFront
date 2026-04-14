import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { listProjects, createProject } from '../api/project'
import type { Project } from '../api/types'

const NAV_STATE_KEY = 'tp-nav-state-v1'
const topMenus = ['workbench', 'project', 'plan', 'testcases', 'e2e', 'system'] as const
const systemMenus = ['users', 'roles', 'projects', 'tags'] as const

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

/**
 * 从项目列表中选出更合适的当前项目。
 * 优先使用仍然存在的历史项目；若历史项目失效，则默认回落到首个活跃项目。
 */
function pickPreferredProjectId(projects: Project[], preferredId?: number | null) {
  if (typeof preferredId === 'number' && projects.some((p) => p.id === preferredId)) {
    return preferredId
  }
  const firstActive = projects.find((p) => p.status === 'active')
  return firstActive?.id ?? projects[0]?.id ?? null
}

export const useProjectStore = defineStore('project', () => {
  const initialNav = restoreNavState()

  const projects = ref<Project[]>([])
  const selectedProjectId = ref<number | null>(initialNav.projectId ?? null)
  const topMenu = ref<TopMenu>(initialNav.topMenu || 'testcases')
  const activeMenu = ref<SystemMenu>(initialNav.activeMenu || 'users')

  // ── 侧边栏折叠状态 ──
  const sidebarCollapsed = ref(localStorage.getItem('tp-sidebar-collapsed') === 'true')

  watch(sidebarCollapsed, (v) => {
    localStorage.setItem('tp-sidebar-collapsed', String(v))
  })

  function persistNavState() {
    const payload: NavState = {
      topMenu: topMenu.value,
      activeMenu: activeMenu.value,
      projectId: selectedProjectId.value,
    }
    localStorage.setItem(NAV_STATE_KEY, JSON.stringify(payload))
  }

  /** 加载项目列表，并在历史项目失效时优先回落到活跃项目。 */
  async function fetchProjects() {
    projects.value = await listProjects()
    selectedProjectId.value = pickPreferredProjectId(projects.value, selectedProjectId.value)
  }

  async function addProject(payload: { name: string; description?: string; owner_id?: number }) {
    const project = await createProject(payload)
    projects.value.push(project)
    return project
  }

  /** 从导航缓存恢复当前项目；若缓存项目已失效，则优先使用活跃项目。 */
  function restoreProjectFromNav() {
    const restored = restoreNavState()
    if (restored.topMenu) topMenu.value = restored.topMenu
    if (restored.activeMenu) activeMenu.value = restored.activeMenu
    selectedProjectId.value = pickPreferredProjectId(projects.value, restored.projectId)
  }

  return {
    projects,
    selectedProjectId,
    topMenu,
    activeMenu,
    sidebarCollapsed,
    persistNavState,
    fetchProjects,
    addProject,
    restoreProjectFromNav,
  }
})
