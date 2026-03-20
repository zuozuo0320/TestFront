<script setup lang="ts">
import type { Project } from '../api/types'
import { Bell, Settings } from 'lucide-vue-next'

defineProps<{
  projects: Project[]
  selectedProject: number | null
  userName: string
  avatarUrl: string
}>()

defineEmits<{
  (e: 'update:selectedProject', value: number): void
  (e: 'open-profile'): void
  (e: 'logout'): void
}>()
</script>

<template>
  <header class="top-header">
    <div class="brand">
      <div class="logo">AI</div>
      <div class="brand-text">
        <div class="name">Aisight</div>
      </div>
    </div>

    <div class="header-breadcrumb">
      <el-select
        :model-value="selectedProject"
        class="project-select-inline"
        popper-class="project-select-popper"
        @update:model-value="$emit('update:selectedProject', $event as number)"
      >
        <el-option v-for="p in projects" :key="p.id" :label="p.name" :value="p.id" />
      </el-select>
    </div>

    <div class="header-right">
      <button class="header-icon-btn" title="通知">
        <Bell :size="18" />
      </button>
      <button class="header-icon-btn" title="设置">
        <Settings :size="18" />
      </button>
      <div class="user-box">
        <div class="header-user-info">
          <span class="header-user-name">{{ userName || 'User' }}</span>
        </div>
        <div class="user-avatar-wrap">
          <img class="user-avatar" :src="avatarUrl" alt="avatar" />
          <div class="user-hover-card">
            <div class="hover-user-row">
              <img class="hover-avatar" :src="avatarUrl" alt="avatar" />
              <div class="hover-user-meta">
                <div class="hover-name">{{ userName || '示例用户' }}</div>
              </div>
            </div>
            <div class="hover-actions">
              <button class="hover-action-btn" @click="$emit('open-profile')">个人中心</button>
              <button class="hover-action-btn danger" @click="$emit('logout')">退出登录</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
