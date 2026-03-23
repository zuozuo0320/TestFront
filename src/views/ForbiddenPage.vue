<script setup lang="ts">
import { Lock } from '@element-plus/icons-vue'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

/** 解析来源页面，便于给用户更明确的上下文提示。 */
const fromPath = computed(() => {
  const from = route.query.from
  return typeof from === 'string' ? from : ''
})

/** 返回工作台，避免用户卡在无权限页面。 */
function goHome() {
  router.push('/')
}

/** 优先返回上一页；若没有历史记录则退回工作台。 */
function goBack() {
  if (window.history.length > 1) {
    router.back()
    return
  }
  router.push('/')
}
</script>

<template>
  <div class="module-card forbidden-page">
    <div class="empty-state-card forbidden-card">
      <div class="empty-state-icon forbidden-icon">
        <el-icon><Lock /></el-icon>
      </div>
      <div class="empty-state-title">无权限访问</div>
      <div class="empty-state-desc">请联系管理员开通系统管理权限</div>
      <div v-if="fromPath" class="forbidden-from">目标页面：{{ fromPath }}</div>
      <div class="forbidden-actions">
        <el-button @click="goBack">返回上一页</el-button>
        <el-button type="primary" @click="goHome">回到工作台</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.forbidden-page {
  display: flex;
  align-items: stretch;
}

.forbidden-card {
  width: 100%;
}

.forbidden-icon {
  color: #f59e0b;
}

.forbidden-from {
  margin-top: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.48);
}

.forbidden-actions {
  margin-top: 20px;
  display: flex;
  justify-content: center;
  gap: 12px;
}
</style>
