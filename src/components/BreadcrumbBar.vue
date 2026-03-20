<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const breadcrumbs = computed(() => {
  const map: Record<string, string[]> = {
    '/': ['工作台'],
    '/testcases': ['测试用例'],
    '/project': ['项目管理'],
    '/plan': ['测试计划'],
    '/e2e': ['E2E测试'],
    '/system/users': ['系统管理', '用户管理'],
    '/system/roles': ['系统管理', '角色管理'],
    '/system/projects': ['系统管理', '项目管理'],
  }
  return map[route.path] || ['未知页面']
})
</script>

<template>
  <nav class="breadcrumb-bar" aria-label="面包屑">
    <span
      v-for="(crumb, i) in breadcrumbs"
      :key="i"
      class="breadcrumb-item"
      :class="{ active: i === breadcrumbs.length - 1 }"
    >
      {{ crumb }}
      <span v-if="i < breadcrumbs.length - 1" class="breadcrumb-sep">/</span>
    </span>
  </nav>
</template>

<style scoped>
.breadcrumb-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 12px;
  font-size: 13px;
}
.breadcrumb-item {
  color: var(--tp-gray-400);
  font-weight: 500;
}
.breadcrumb-item.active {
  color: var(--tp-gray-800);
  font-weight: 600;
}
.breadcrumb-sep {
  margin: 0 4px;
  color: var(--tp-gray-300);
}
</style>
