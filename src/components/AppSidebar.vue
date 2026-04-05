<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useProjectStore } from '../stores/project'
import {
  globalModuleTree,
  globalModuleCaseCount,
  globalUnplannedCount,
  globalSelectedModulePath,
  globalSelectedModuleId,
  globalTreeExpanded,
  globalTreeActions,
} from '../composables/useTestCaseTree'

type TopMenu = 'workbench' | 'project' | 'plan' | 'testcases' | 'e2e' | 'system'
type SystemMenu = 'users' | 'roles' | 'projects'

/** 无权访问系统管理的角色集合（FR-02-22） */
const NO_SYSTEM_ROLES = new Set(['readonly', 'developer', 'reviewer'])

const props = defineProps<{
  topMenu: TopMenu
  activeMenu: SystemMenu
  collapsed?: boolean
  userRole?: string
}>()

defineEmits<{
  (e: 'update:topMenu', value: TopMenu): void
  (e: 'update:activeMenu', value: SystemMenu): void
  (e: 'toggle-collapse'): void
  (e: 'logout'): void
}>()

// ── 项目切换器 ──
const projectStore = useProjectStore()
const dropdownOpen = ref(false)

const currentProject = computed(() =>
  projectStore.projects.find((p) => p.id === projectStore.selectedProjectId),
)

const currentProjectName = computed(() => currentProject.value?.name || 'Select Project')

/** 头像 URL 解析 */
function resolveAvatarUrl(avatar?: string) {
  const raw = (avatar || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
  if (envBase && /^https?:\/\//i.test(envBase)) {
    const origin = envBase.replace(/\/api\/v1\/?$/, '')
    return `${origin}${raw.startsWith('/') ? '' : '/'}${raw}`
  }
  return `http://localhost:8080${raw.startsWith('/') ? '' : '/'}${raw}`
}

const currentProjectAvatar = computed(() => resolveAvatarUrl(currentProject.value?.avatar))

function selectProject(id: number) {
  projectStore.selectedProjectId = id
  projectStore.persistNavState()
  dropdownOpen.value = false
}

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value
}

// 点击外部关闭
function onModuleClick(node: any) {
  const path = node.path || ''
  const id = node.id

  // 如果是虚拟节点且 id=0 (全部用例)，重置选择
  if (id === 0) {
    globalSelectedModulePath.value = ''
    globalSelectedModuleId.value = 0
    return
  }

  if (globalSelectedModuleId.value === id && id !== 0) {
    globalSelectedModulePath.value = ''
    globalSelectedModuleId.value = 0
  } else {
    globalSelectedModulePath.value = path
    globalSelectedModuleId.value = id
  }
}

/** 聚合目录树：包含“全部用例”和“未规划用例”作为顶层节点，确保对齐 */
const combinedTree = computed(() => {
  return [
    { id: 0, name: '全部用例', path: '', icon: 'grid_view', isVirtual: true },
    { id: -1, name: '未规划用例', path: '/未规划用例', icon: 'description', isVirtual: true },
    ...globalModuleTree.value,
  ]
})

function handleClickOutside(e: MouseEvent) {
  const el = document.querySelector('.nav-header')
  if (el && !el.contains(e.target as Node)) {
    dropdownOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside, true)
})

/** 根据用户角色判断是否显示系统管理菜单 */
const showSystemMenu = computed(() => {
  if (!props.userRole) return true
  return !NO_SYSTEM_ROLES.has(props.userRole.toLowerCase())
})

const navItems: { key: TopMenu; label: string; icon: string }[] = [
  { key: 'workbench', label: '仪表盘', icon: 'dashboard' },
  { key: 'testcases', label: '测试用例', icon: 'rule' },
  { key: 'plan', label: '用例评审', icon: 'analytics' },
  { key: 'e2e', label: '测试智编', icon: 'history_edu' },
  { key: 'project', label: '缺陷管理', icon: 'bug_report' },
]

const systemNavItems: { key: SystemMenu; label: string }[] = [
  { key: 'users', label: '用户管理' },
  { key: 'roles', label: '角色管理' },
  { key: 'projects', label: '项目管理' },
]
</script>

<template>
  <aside class="main-nav" :class="{ collapsed }" role="navigation" aria-label="主导航">
    <div class="nav-inner">
      <!-- Project Switcher Header -->
      <div class="nav-header">
        <div class="nav-header-card" :class="{ active: dropdownOpen }" @click="toggleDropdown">
          <div class="nav-header-icon">
            <img
              v-if="currentProjectAvatar"
              :src="currentProjectAvatar"
              class="nav-header-avatar-img"
            />
            <span
              v-else
              class="material-symbols-outlined"
              style="font-variation-settings: 'FILL' 1; font-size: 22px; color: #fff"
            >
              rocket_launch
            </span>
          </div>
          <div v-if="!collapsed" class="nav-header-info">
            <span class="nav-header-title">{{ currentProjectName }}</span>
          </div>
          <span
            v-if="!collapsed"
            class="material-symbols-outlined nav-header-chevron"
            :class="{ rotated: dropdownOpen }"
            style="
              font-variation-settings:
                'FILL' 0,
                'wght' 300,
                'GRAD' 0,
                'opsz' 24;
            "
          >
            unfold_more
          </span>
        </div>

        <!-- Dropdown panel -->
        <Transition name="dropdown-slide">
          <div v-if="dropdownOpen && !collapsed" class="nav-project-dropdown">
            <div class="nav-project-dropdown-label">切换项目</div>
            <div class="nav-project-dropdown-list">
              <div
                v-for="p in projectStore.projects"
                :key="p.id"
                class="nav-project-dropdown-item"
                :class="{
                  selected: p.id === projectStore.selectedProjectId,
                  archived: p.status === 'archived',
                }"
                @click="p.status !== 'archived' && selectProject(p.id)"
              >
                <div class="nav-project-item-icon">
                  <img
                    v-if="resolveAvatarUrl(p.avatar)"
                    :src="resolveAvatarUrl(p.avatar)"
                    class="nav-project-item-avatar"
                  />
                  <span
                    v-else
                    class="material-symbols-outlined"
                    style="font-variation-settings: 'FILL' 1; font-size: 14px; color: #fff"
                  >
                    rocket_launch
                  </span>
                </div>
                <span class="nav-project-name">{{ p.name }}</span>
                <span
                  v-if="p.id === projectStore.selectedProjectId"
                  class="material-symbols-outlined nav-project-check"
                  style="font-size: 16px"
                >
                  check
                </span>
              </div>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Main Navigation -->
      <nav class="nav-links">
        <a
          v-for="item in navItems"
          :key="item.key"
          class="main-nav-item"
          :class="{ active: topMenu === item.key }"
          role="button"
          tabindex="0"
          :aria-current="topMenu === item.key ? 'page' : undefined"
          :title="collapsed ? item.label : undefined"
          @click="$emit('update:topMenu', item.key)"
          @keydown.enter="$emit('update:topMenu', item.key)"
        >
          <span
            class="material-symbols-outlined nav-icon"
            :style="
              topMenu === item.key
                ? { fontVariationSettings: `'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 24` }
                : { fontVariationSettings: `'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24` }
            "
          >
            {{ item.icon }}
          </span>
          <span v-if="!collapsed" class="nav-label">{{ item.label }}</span>
        </a>
      </nav>

      <!-- Test Cases Directory Tree (Visible only when TEST SUITES is active) -->
      <div v-if="topMenu === 'testcases' && !collapsed" class="nav-tree-section">
        <div class="nav-tree-header">
          <span class="tree-root-title">目录树</span>
          <button
            class="nav-tree-add-btn"
            title="新建根目录"
            @click="globalTreeActions.onAddRootModule"
          >
            <span class="material-symbols-outlined" style="font-size: 18px">create_new_folder</span>
          </button>
        </div>

        <div class="nav-tree-scroll">
          <el-tree
            ref="moduleTreeRef"
            class="nav-module-tree"
            :data="combinedTree"
            :props="{ label: 'name', children: 'children' }"
            node-key="id"
            :indent="16"
            :default-expand-all="globalTreeExpanded"
            highlight-current
            @node-click="onModuleClick"
          >
            <template #default="{ node, data }">
              <div
                class="nav-tree-node-row"
                :class="{
                  active: globalSelectedModuleId === data.id,
                  'is-virtual': data.isVirtual,
                }"
                :style="{ paddingLeft: (node.level - 1) * 16 + 8 + 'px' }"
              >
                <div class="nav-tree-node-left">
                  <span
                    class="material-symbols-outlined nav-tree-icon"
                    :style="{ fontVariationSettings: `'FILL' ${data.id === 0 ? 0 : 1}` }"
                  >
                    {{ data.icon || 'folder' }}
                  </span>
                  <span class="nav-tree-node-name">{{ data.name }}</span>
                </div>
                <div class="nav-tree-node-right">
                  <span class="nav-tree-count">
                    {{
                      data.id === -1
                        ? globalUnplannedCount
                        : data.id === 0
                          ? ''
                          : globalModuleCaseCount[data.path] || 0
                    }}
                  </span>
                  <el-dropdown
                    v-if="!data.isVirtual"
                    trigger="click"
                    placement="bottom-end"
                    @command="
                      (cmd: string) =>
                        globalTreeActions.onNodeMenuCommand(cmd, data.path, data.name, data.id)
                    "
                    @click.stop
                  >
                    <span class="material-symbols-outlined nav-tree-more">more_vert</span>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item command="add">新建子目录</el-dropdown-item>
                        <el-dropdown-item command="rename">重命名</el-dropdown-item>
                        <el-dropdown-item command="delete" divided style="color: #ef4444">
                          删除
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>
              </div>
            </template>
          </el-tree>
        </div>
      </div>

      <!-- Bottom group -->
      <div class="nav-bottom-group">
        <template v-if="showSystemMenu">
          <a
            class="main-nav-item"
            :class="{ active: topMenu === 'system' }"
            role="button"
            tabindex="0"
            :title="collapsed ? '系统管理' : undefined"
            @click="$emit('update:topMenu', 'system')"
            @keydown.enter="$emit('update:topMenu', 'system')"
          >
            <span
              class="material-symbols-outlined nav-icon"
              style="
                font-variation-settings:
                  'FILL' 0,
                  'wght' 300,
                  'GRAD' 0,
                  'opsz' 24;
              "
            >
              settings
            </span>
            <span v-if="!collapsed" class="nav-label">系统管理</span>
          </a>

          <div v-if="topMenu === 'system' && !collapsed" class="sub-nav">
            <div
              v-for="sub in systemNavItems"
              :key="sub.key"
              class="sub-nav-item"
              :class="{ active: activeMenu === sub.key }"
              role="button"
              tabindex="0"
              :aria-current="activeMenu === sub.key ? 'page' : undefined"
              @click="$emit('update:activeMenu', sub.key)"
              @keydown.enter="$emit('update:activeMenu', sub.key)"
            >
              {{ sub.label }}
            </div>
          </div>
        </template>

        <div
          class="nav-collapse-btn"
          :title="collapsed ? '展开侧栏' : '收起侧栏'"
          @click="$emit('toggle-collapse')"
        >
          <span
            class="material-symbols-outlined nav-icon"
            :style="{
              transform: collapsed ? 'rotate(180deg)' : 'none',
              fontVariationSettings: `'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24`,
            }"
          >
            menu_open
          </span>
          <span v-if="!collapsed" class="nav-label">收起侧栏</span>
        </div>
      </div>
    </div>
  </aside>
</template>
