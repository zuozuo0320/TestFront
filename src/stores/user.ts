import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  listUsers,
  createUser,
  updateUser,
  deleteUserById,
  listRoles,
  createRole,
  updateRoleById,
  deleteRoleById,
  updateMyProfile,
  uploadMyAvatar,
} from '../api/user'
import type { User, Role } from '../api/types'

export type UserRow = User & {
  roleIds: number[]
  projectIds: number[]
}

export const useUserStore = defineStore('user', () => {
  const users = ref<UserRow[]>([])
  const roles = ref<Role[]>([])
  const usersLoading = ref(false)
  const rolesLoading = ref(false)

  // ── Fetch ──

  async function fetchUsers() {
    usersLoading.value = true
    try {
      const data = await listUsers()
      users.value = data.map((u) => ({ ...u, roleIds: [], projectIds: [] }))
    } finally {
      usersLoading.value = false
    }
  }

  async function fetchRoles() {
    rolesLoading.value = true
    try {
      roles.value = await listRoles()
    } finally {
      rolesLoading.value = false
    }
  }

  // ── User CRUD ──

  async function addUser(payload: Parameters<typeof createUser>[0]) {
    const user = await createUser(payload)
    await fetchUsers()
    return user
  }

  async function editUser(userId: number, payload: Parameters<typeof updateUser>[1]) {
    const user = await updateUser(userId, payload)
    await fetchUsers()
    return user
  }

  async function removeUser(userId: number) {
    await deleteUserById(userId)
    await fetchUsers()
  }

  // ── Role CRUD ──

  async function addRole(payload: { name: string; description?: string }) {
    const role = await createRole(payload)
    await fetchRoles()
    return role
  }

  async function editRole(roleId: number, payload: { name?: string; description?: string }) {
    const role = await updateRoleById(roleId, payload)
    await fetchRoles()
    return role
  }

  async function removeRole(roleId: number) {
    await deleteRoleById(roleId)
    await fetchRoles()
  }

  // ── Profile ──

  async function saveProfile(payload: { name?: string; phone?: string; avatar?: string }) {
    return await updateMyProfile(payload)
  }

  async function saveAvatar(file: File) {
    return await uploadMyAvatar(file)
  }

  return {
    users,
    roles,
    usersLoading,
    rolesLoading,
    fetchUsers,
    fetchRoles,
    addUser,
    editUser,
    removeUser,
    addRole,
    editRole,
    removeRole,
    saveProfile,
    saveAvatar,
  }
})
