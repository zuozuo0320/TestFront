<script setup lang="ts">
import {
  LayoutDashboard,
  ListChecks,
  Play,
  Bug,
  BarChart3,
  Settings,
} from 'lucide-vue-next'

type TopMenu = 'workbench' | 'project' | 'plan' | 'testcases' | 'e2e' | 'system'
type SystemMenu = 'users' | 'roles' | 'projects'

defineProps<{
  topMenu: TopMenu
  activeMenu: SystemMenu
}>()

defineEmits<{
  (e: 'update:topMenu', value: TopMenu): void
  (e: 'update:activeMenu', value: SystemMenu): void
  (e: 'logout'): void
}>()

const navItems: { key: TopMenu; label: string; icon: any }[] = [
  { key: 'workbench', label: '仪表盘', icon: LayoutDashboard },
  { key: 'testcases', label: '测试用例', icon: ListChecks },
  { key: 'e2e', label: '执行记录', icon: Play },
  { key: 'project', label: '缺陷管理', icon: Bug },
  { key: 'plan', label: '数据分析', icon: BarChart3 },
  { key: 'system', label: '设置', icon: Settings },
]

const systemNavItems: { key: SystemMenu; label: string }[] = [
  { key: 'users', label: '用户管理' },
  { key: 'roles', label: '角色管理' },
  { key: 'projects', label: '项目管理' },
]
</script>

<template>
  <aside class="main-nav" role="navigation" aria-label="主导航">
    <div
      v-for="item in navItems"
      :key="item.key"
      class="main-nav-item"
      :class="{ active: topMenu === item.key }"
      role="button"
      tabindex="0"
      :aria-current="topMenu === item.key ? 'page' : undefined"
      @click="$emit('update:topMenu', item.key)"
      @keydown.enter="$emit('update:topMenu', item.key)"
    >
      <component :is="item.icon" :size="18" class="nav-icon" />
      {{ item.label }}
    </div>

    <div v-if="topMenu === 'system'" class="sub-nav">
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
  </aside>
</template>
