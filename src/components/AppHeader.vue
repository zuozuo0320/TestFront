<script setup lang="ts">
import { Bell, LogOut as LogOutIcon, User as UserIcon } from 'lucide-vue-next'
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
        :width="236"
        trigger="click"
        popper-class="user-popover-popper"
      >
        <template #reference>
          <button type="button" class="user-box" aria-label="打开用户菜单">
            <span class="header-user-info">
              <span class="header-user-name">{{ userName || 'User' }}</span>
            </span>
            <span class="user-avatar-wrap">
              <img class="user-avatar" :src="avatarUrl" alt="avatar" @error="onAvatarError" />
            </span>
          </button>
        </template>

        <div class="user-popover-card">
          <div class="hover-user-row">
            <img class="hover-avatar" :src="avatarUrl" alt="avatar" @error="onAvatarError" />
            <div class="hover-user-meta">
              <div class="hover-name">{{ userName || '示例用户' }}</div>
              <div class="hover-subline">
                <span class="hover-status-dot"></span>
                <span>当前账号</span>
              </div>
            </div>
          </div>
          <div class="hover-actions">
            <button type="button" class="hover-action-btn" @click="$emit('open-profile')">
              <UserIcon :size="15" />
              <span>个人中心</span>
            </button>
            <button type="button" class="hover-action-btn danger" @click="$emit('logout')">
              <LogOutIcon :size="15" />
              <span>退出登录</span>
            </button>
          </div>
        </div>
      </el-popover>
    </div>
  </header>
</template>
