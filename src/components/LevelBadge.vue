<script setup lang="ts">
defineProps<{
  level: string
}>()
</script>

<template>
  <span class="level-badge" :class="level.toLowerCase()">{{ level }}</span>
</template>
