<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import AppHeader from './components/AppHeader.vue'
import AppSidebar from './components/AppSidebar.vue'
import { listProjects } from './api/project'
import { updateMyProfile, uploadMyAvatar, getMyProfile } from './api/user'
import type { Project, User } from './api/types'

type TopMenu = 'workbench' | 'project' | 'plan' | 'testcases' | 'e2e' | 'system'
type SystemMenu = 'users' | 'roles' | 'projects'

const route = useRoute()
const router = useRouter()

// ── Auth ──

const loggedIn = computed(() => !!localStorage.getItem('tp-token'))
const currentUser = ref<User | null>(null)

const userAvatarUrl = computed(() => {
  const avatar = (currentUser.value as any)?.avatar || ''
  if (avatar && /^https?:\/\//i.test(avatar)) return avatar
  if (avatar) {
    const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
    if (envBase && /^https?:\/\//i.test(envBase)) {
      const origin = envBase.replace(/\/api\/v1\/?$/, '')
      return `${origin}${avatar.startsWith('/') ? '' : '/'}${avatar}`
    }
    return `http://localhost:8080${avatar.startsWith('/') ? '' : '/'}${avatar}`
  }
  const seed = encodeURIComponent((currentUser.value?.name || 'Aisight').trim() || 'Aisight')
  return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}`
})

function logout() {
  localStorage.removeItem('tp-token')
  localStorage.removeItem('tp-user-id')
  currentUser.value = null
  router.push('/login')
}

// ── Projects ──

const projects = ref<Project[]>([])
const selectedProject = ref<number | null>(null)

async function loadProjects() {
  try {
    projects.value = await listProjects()
    const first = projects.value[0]
    if (first && !selectedProject.value) {
      selectedProject.value = first.id
    }
  } catch {
    // silently fail — pages handle their own loading
  }
}

function onProjectChange(id: number) {
  selectedProject.value = id
}

// ── Navigation ──

const topMenu = ref<TopMenu>('workbench')
const activeMenu = ref<SystemMenu>('users')

const routeToMenu: Record<string, TopMenu> = {
  '/': 'workbench',
  '/testcases': 'testcases',
  '/system/users': 'system',
  '/system/roles': 'system',
  '/system/projects': 'system',
}

const routeToSystemMenu: Record<string, SystemMenu> = {
  '/system/users': 'users',
  '/system/roles': 'roles',
  '/system/projects': 'projects',
}

// Sync topMenu/activeMenu from route
watch(
  () => route.path,
  (path) => {
    if (routeToMenu[path]) topMenu.value = routeToMenu[path]
    if (routeToSystemMenu[path]) activeMenu.value = routeToSystemMenu[path]
  },
  { immediate: true },
)

function switchTopMenu(menu: TopMenu) {
  topMenu.value = menu
  const menuRoutes: Record<TopMenu, string> = {
    workbench: '/',
    testcases: '/testcases',
    system: `/system/${activeMenu.value}`,
    project: '/project',
    plan: '/plan',
    e2e: '/e2e',
  }
  router.push(menuRoutes[menu])
}

function switchMenu(menu: SystemMenu) {
  activeMenu.value = menu
  router.push(`/system/${menu}`)
}

// ── Profile Dialog ──

const profileDialogVisible = ref(false)
const savingProfile = ref(false)
const profileForm = ref({ name: '', phone: '', avatar: '' })

function openProfileCenter() {
  profileForm.value.name = currentUser.value?.name || ''
  profileForm.value.phone = (currentUser.value as any)?.phone || ''
  profileForm.value.avatar = (currentUser.value as any)?.avatar || ''
  profileDialogVisible.value = true
}

async function saveProfile() {
  savingProfile.value = true
  try {
    const data = await updateMyProfile({
      name: profileForm.value.name.trim() || undefined,
      phone: profileForm.value.phone.trim() || undefined,
      avatar: profileForm.value.avatar.trim() || undefined,
    })
    currentUser.value = { ...currentUser.value!, ...data }
    ElMessage.success('个人中心更新成功')
    profileDialogVisible.value = false
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '更新失败')
  } finally {
    savingProfile.value = false
  }
}

async function onAvatarFileChange(file: any) {
  const raw = file?.raw as File | undefined
  if (!raw) return
  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(raw.type)) { ElMessage.warning('仅支持 JPG/PNG/WEBP'); return }
  if (raw.size > 2 * 1024 * 1024) { ElMessage.warning('头像不能超过 2MB'); return }
  try {
    savingProfile.value = true
    const data = await uploadMyAvatar(raw)
    profileForm.value.avatar = data.avatar
    currentUser.value = { ...(currentUser.value as any), avatar: data.avatar }
    ElMessage.success('头像上传成功')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '上传失败')
  } finally {
    savingProfile.value = false
  }
}

// ── Init ──

const isLoginRoute = computed(() => route.path === '/login')
const routerReady = ref(false)

router.isReady().then(() => {
  routerReady.value = true
})

onMounted(async () => {
  if (loggedIn.value) {
    await loadProjects()
    try {
      currentUser.value = await getMyProfile()
    } catch {
      // silently fail — user stays as fallback
    }
  }
})
</script>

<template>
  <div class="page" v-if="routerReady">
    <!-- Login page: no shell, just RouterView -->
    <template v-if="isLoginRoute">
      <RouterView />
    </template>

    <!-- Authenticated layout shell -->
    <template v-else>
      <div class="layout">
        <AppHeader
          :projects="projects"
          :selected-project="selectedProject"
          :user-name="currentUser?.name || ''"
          :avatar-url="userAvatarUrl"
          @update:selected-project="onProjectChange"
          @open-profile="openProfileCenter"
          @logout="logout"
        />

        <div class="main">
          <AppSidebar
            :top-menu="topMenu"
            :active-menu="activeMenu"
            @update:top-menu="switchTopMenu"
            @update:active-menu="switchMenu"
            @logout="logout"
          />

          <section class="content-wrap">
            <RouterView />
          </section>
        </div>
      </div>

      <!-- Profile dialog -->
      <el-dialog v-model="profileDialogVisible" title="个人中心" width="520px">
        <el-form label-position="top" class="profile-form">
          <el-form-item label="头像">
            <div class="profile-avatar-uploader">
              <img class="profile-avatar-preview" :src="userAvatarUrl" alt="avatar" />
              <el-upload
                class="avatar-upload"
                :show-file-list="false"
                :auto-upload="false"
                :on-change="onAvatarFileChange"
                accept=".jpg,.jpeg,.png,.webp"
              >
                <el-button size="small">上传头像</el-button>
              </el-upload>
            </div>
          </el-form-item>
          <el-form-item label="姓名">
            <el-input v-model="profileForm.name" />
          </el-form-item>
          <el-form-item label="手机号">
            <el-input v-model="profileForm.phone" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="profileDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="savingProfile" @click="saveProfile">保存资料</el-button>
        </template>
      </el-dialog>
    </template>
  </div>
</template>
