<script setup lang="ts">
defineProps<{
  value: string
}>()

function statusClass(value: string): string {
  if (value === '已通过' || value === '通过' || value === '成功') return 'pass'
  if (value === '不通过' || value === '失败') return 'fail'
  if (value === '阻塞') return 'blocked'
  return 'pending'
}
</script>

<template>
  <span class="status-badge" :class="statusClass(value)">{{ value }}</span>
</template>
