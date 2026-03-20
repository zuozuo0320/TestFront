<script setup lang="ts">
import { Clock } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const titleMap: Record<string, string> = {
  project: '项目管理',
  plan: '测试计划',
  e2e: 'E2E测试',
}

const descMap: Record<string, string> = {
  project: '项目配置、成员管理、集成设置等功能',
  plan: '测试计划创建、进度追踪、报告生成等功能',
  e2e: '端到端自动化测试管理与回报',
}

const pathKey = String(route.params.pathMatch || 'e2e')
  .replace(/^\//, '')
  .split('/')[0]
const title = titleMap[pathKey] || '功能模块'
const desc = descMap[pathKey] || '该功能'
</script>

<template>
  <div class="module-card">
    <div class="empty-state-card">
      <div class="empty-state-icon">
        <el-icon><Clock /></el-icon>
      </div>
      <div class="empty-state-title">{{ title }}</div>
      <div class="empty-state-desc">{{ desc }}即将上线</div>
      <div class="empty-state-badge">
        <el-icon><Clock /></el-icon>
        即将推出
      </div>
    </div>
  </div>
</template>
