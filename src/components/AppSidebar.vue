<script setup lang="ts">
import { computed } from 'vue'
import {
  LayoutDashboard,
  ListChecks,
  Play,
  Bug,
  BarChart3,
  Settings,
  PanelLeftClose,
} from 'lucide-vue-next'

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

/** 根据用户角色判断是否显示系统管理菜单 */
const showSystemMenu = computed(() => {
  if (!props.userRole) return true // 角色未加载时默认显示
  return !NO_SYSTEM_ROLES.has(props.userRole.toLowerCase())
})

const navItems: { key: TopMenu; label: string; icon: any }[] = [
  { key: 'workbench', label: '仪表盘', icon: LayoutDashboard },
  { key: 'testcases', label: '测试用例', icon: ListChecks },
  { key: 'e2e', label: '执行记录', icon: Play },
  { key: 'project', label: '缺陷管理', icon: Bug },
  { key: 'plan', label: '数据分析', icon: BarChart3 },
]

const systemNavItems: { key: SystemMenu; label: string }[] = [
  { key: 'users', label: '用户管理' },
  { key: 'roles', label: '角色管理' },
  { key: 'projects', label: '项目管理' },
]
</script>

<template>
  <aside class="main-nav" :class="{ collapsed }" role="navigation" aria-label="主导航">
    <div
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
      <component :is="item.icon" :size="18" class="nav-icon" />
      <span v-if="!collapsed" class="nav-label">{{ item.label }}</span>
    </div>

    <!-- Bottom group: system + collapse -->
    <div class="nav-bottom-group">
      <!-- 系统管理：readonly/developer/reviewer 角色不可见 -->
      <template v-if="showSystemMenu">
        <div
          class="main-nav-item"
          :class="{ active: topMenu === 'system' }"
          role="button"
          tabindex="0"
          :title="collapsed ? '系统管理' : undefined"
          @click="$emit('update:topMenu', 'system')"
          @keydown.enter="$emit('update:topMenu', 'system')"
        >
          <Settings :size="18" class="nav-icon" />
          <span v-if="!collapsed" class="nav-label">系统管理</span>
        </div>

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

      <div class="nav-collapse-btn" @click="$emit('toggle-collapse')" :title="collapsed ? '展开侧栏' : '收起侧栏'">
        <PanelLeftClose :size="18" class="nav-icon" :style="{ transform: collapsed ? 'rotate(180deg)' : 'none' }" />
        <span v-if="!collapsed" class="nav-label">收起侧栏</span>
      </div>
    </div>
  </aside>
</template>

