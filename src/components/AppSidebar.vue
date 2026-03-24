<script setup lang="ts">
import { computed } from 'vue'

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

const navItems: { key: TopMenu; label: string; icon: string; iconFilled: string }[] = [
  { key: 'workbench', label: '仪表盘', icon: 'dashboard', iconFilled: 'dashboard' },
  { key: 'testcases', label: '测试用例', icon: 'rule', iconFilled: 'rule' },
  { key: 'e2e', label: '执行记录', icon: 'history_edu', iconFilled: 'history_edu' },
  { key: 'project', label: '缺陷管理', icon: 'bug_report', iconFilled: 'bug_report' },
  { key: 'plan', label: '数据分析', icon: 'analytics', iconFilled: 'analytics' },
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
        <div class="nav-header-card">
          <div class="nav-header-icon">
            <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1; font-size: 22px; color: #fff;">rocket_launch</span>
          </div>
          <div class="nav-header-info">
            <span class="nav-header-title">TestPilot</span>
            <span class="nav-header-sub">Aisight Platform</span>
          </div>
        </div>
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
            :style="topMenu === item.key ? { fontVariationSettings: `'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 24` } : { fontVariationSettings: `'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24` }"
          >{{ item.icon }}</span>
          <span v-if="!collapsed" class="nav-label">{{ item.label }}</span>
        </a>
      </nav>

      <!-- Bottom group: system + collapse -->
      <div class="nav-bottom-group">
        <!-- 系统管理：readonly/developer/reviewer 角色不可见 -->
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
            <span class="material-symbols-outlined nav-icon" style="font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;">settings</span>
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

        <div class="nav-collapse-btn" @click="$emit('toggle-collapse')" :title="collapsed ? '展开侧栏' : '收起侧栏'">
          <span
            class="material-symbols-outlined nav-icon"
            :style="{ transform: collapsed ? 'rotate(180deg)' : 'none', fontVariationSettings: `'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24` }"
          >menu_open</span>
          <span v-if="!collapsed" class="nav-label">收起侧栏</span>
        </div>
      </div>
    </div>
  </aside>
</template>
