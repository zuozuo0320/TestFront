<script setup lang="ts">
import { Bell } from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'

const props = defineProps<{
  userName: string
  avatarUrl: string
}>()

defineEmits<{
  (e: 'open-profile'): void
  (e: 'logout'): void
}>()

const authStore = useAuthStore()

function onAvatarError(event: Event) {
  authStore.handleAvatarError(event, props.userName)
}
</script>

<template>
  <header class="top-header">
    <div class="brand">
      <img class="logo" src="/images/logo.png" alt="Aisight" />
      <div class="brand-text">
        <div class="name">Aisight</div>
      </div>
    </div>

    <div class="header-right">
      <button class="header-icon-btn" title="通知">
        <Bell :size="18" />
      </button>

      <!-- User Avatar & Dropdown via Popover -->
      <el-popover
        placement="bottom-end"
        :width="240"
        trigger="click"
        popper-class="user-popover-popper"
      >
        <template #reference>
          <div class="user-box" style="cursor: pointer">
            <div class="header-user-info">
              <span class="header-user-name">{{ userName || 'User' }}</span>
            </div>
            <div class="user-avatar-wrap">
              <img class="user-avatar" :src="avatarUrl" alt="avatar" @error="onAvatarError" />
            </div>
          </div>
        </template>

        <div class="user-popover-card">
          <div class="hover-user-row">
            <img class="hover-avatar" :src="avatarUrl" alt="avatar" @error="onAvatarError" />
            <div class="hover-user-meta">
              <div class="hover-name">{{ userName || '示例用户' }}</div>
            </div>
          </div>
          <div class="hover-actions">
            <button class="hover-action-btn" @click="$emit('open-profile')">个人中心</button>
            <button class="hover-action-btn danger" @click="$emit('logout')">退出登录</button>
          </div>
        </div>
      </el-popover>
    </div>
  </header>
</template>
