<script setup lang="ts">
defineProps<{
  description?: string
  imageSize?: number
  showAction?: boolean
  actionText?: string
}>()

defineEmits<{
  (e: 'action'): void
}>()
</script>

<template>
  <div class="empty-state-wrap">
    <el-empty :description="description || '暂无数据'" :image-size="imageSize || 140">
      <el-button v-if="showAction" type="primary" plain @click="$emit('action')">
        {{ actionText || '去新建' }}
      </el-button>
    </el-empty>
  </div>
</template>
