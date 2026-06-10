<script setup lang="ts">
/**
 * AI Skill 管理子组件
 *
 * 展示系统级 + 项目级 Skill，支持创建、编辑、启用/禁用、删除。
 */
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useProjectStore } from '@/stores/project'
import { extractErrorMessage } from '@/utils/error'
import {
  listAISkills,
  createAISkill,
  updateAISkill,
  deleteAISkill,
  toggleAISkill,
  type AISkill,
  type CreateSkillPayload,
  type UpdateSkillPayload,
} from '@/api/aiSkill'

const projectStore = useProjectStore()
const projectId = computed(() => projectStore.selectedProjectId)

const skills = ref<AISkill[]>([])
const loading = ref(false)

async function fetchSkills() {
  if (!projectId.value) return
  loading.value = true
  try {
    skills.value = await listAISkills(projectId.value)
  } catch (error: unknown) {
    ElMessage.error(extractErrorMessage(error, '加载 Skill 失败'))
  } finally {
    loading.value = false
  }
}

// 初始加载
fetchSkills()

// 创建/编辑对话框
const showFormDialog = ref(false)
const isEditing = ref(false)
const editingSkill = ref<AISkill | null>(null)
const formData = ref<CreateSkillPayload & { lock_version?: number }>({
  skill_key: '',
  name: '',
  scope: 'functional',
  description: '',
  prompt_template: '',
  output_schema: '',
})

function openCreate() {
  isEditing.value = false
  editingSkill.value = null
  formData.value = {
    skill_key: '',
    name: '',
    scope: 'functional',
    description: '',
    prompt_template: '请根据以下需求文本生成测试用例：\n\n{{requirement_text}}',
    output_schema: '',
  }
  showFormDialog.value = true
}

function openEdit(skill: AISkill) {
  if (skill.is_system) {
    ElMessage.warning('系统 Skill 不可编辑')
    return
  }
  isEditing.value = true
  editingSkill.value = skill
  formData.value = {
    skill_key: skill.skill_key,
    name: skill.name,
    scope: skill.scope,
    description: skill.description,
    prompt_template: skill.prompt_template,
    output_schema: skill.output_schema,
    lock_version: skill.lock_version,
  }
  showFormDialog.value = true
}

async function submitForm() {
  if (!projectId.value) return
  try {
    if (isEditing.value && editingSkill.value) {
      const payload: UpdateSkillPayload = {
        name: formData.value.name,
        scope: formData.value.scope,
        description: formData.value.description,
        prompt_template: formData.value.prompt_template,
        output_schema: formData.value.output_schema,
        lock_version: formData.value.lock_version ?? 0,
      }
      await updateAISkill(projectId.value, editingSkill.value.id, payload)
      ElMessage.success('Skill 已更新')
    } else {
      await createAISkill(projectId.value, formData.value)
      ElMessage.success('Skill 已创建')
    }
    showFormDialog.value = false
    await fetchSkills()
  } catch (error: unknown) {
    ElMessage.error(extractErrorMessage(error, '操作失败'))
  }
}

async function handleToggle(skill: AISkill) {
  if (!projectId.value) return
  try {
    await toggleAISkill(projectId.value, skill.id, !skill.is_active)
    ElMessage.success(skill.is_active ? '已禁用' : '已启用')
    await fetchSkills()
  } catch (error: unknown) {
    ElMessage.error(extractErrorMessage(error, '操作失败'))
  }
}

async function handleDelete(skill: AISkill) {
  if (!projectId.value) return
  if (skill.is_system) {
    ElMessage.warning('系统 Skill 不可删除')
    return
  }
  try {
    await ElMessageBox.confirm(`确定删除 Skill "${skill.name}"？`, '删除确认', { type: 'warning' })
    await deleteAISkill(projectId.value, skill.id)
    ElMessage.success('已删除')
    await fetchSkills()
  } catch {
    // 用户取消
  }
}

// 占位符展示文本（避免模板中嵌套花括号解析错误）
const placeholderTip = '支持占位符：{{requirement_text}}、{{max_cases}}、{{default_level}}'

function scopeLabel(scope: string) {
  const map: Record<string, string> = {
    functional: '功能测试',
    api: '接口测试',
    boundary: '边界值测试',
    state: '状态流转测试',
    security: '安全测试',
    compat: '兼容性测试',
    performance: '性能测试',
    e2e: '端到端测试',
    custom: '自定义测试',
  }
  return map[scope] || scope
}
</script>

<template>
  <div class="skill-list-container">
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="skill-count">共 {{ skills.length }} 个 Skill</span>
      </div>
      <div class="toolbar-right">
        <el-button type="primary" @click="openCreate">创建 Skill</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="skills" stripe style="width: 100%">
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column label="Key" width="160" prop="skill_key" show-overflow-tooltip />
      <el-table-column label="类型" width="100">
        <template #default="{ row }">
          {{ scopeLabel(row.scope) }}
        </template>
      </el-table-column>
      <el-table-column label="来源" width="80">
        <template #default="{ row }">
          <el-tag :type="row.is_system ? '' : 'success'" size="small">
            {{ row.is_system ? '系统' : '项目' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
            {{ row.is_active ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button link size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link size="small" @click="handleToggle(row)">
            {{ row.is_active ? '禁用' : '启用' }}
          </el-button>
          <el-button
            v-if="!row.is_system"
            type="danger"
            link
            size="small"
            @click="handleDelete(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建/编辑对话框 -->
    <el-dialog
      v-model="showFormDialog"
      :title="isEditing ? '编辑 Skill' : '创建 Skill'"
      width="650px"
    >
      <el-form :model="formData" label-width="110px">
        <el-form-item v-if="!isEditing" label="Skill Key" required>
          <el-input v-model="formData.skill_key" placeholder="小写字母开头，支持字母/数字/下划线" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="formData.name" placeholder="Skill 显示名称" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="formData.scope" style="width: 200px">
            <el-option label="功能测试" value="functional" />
            <el-option label="接口测试" value="api" />
            <el-option label="边界值测试" value="boundary" />
            <el-option label="状态流转测试" value="state" />
            <el-option label="安全测试" value="security" />
            <el-option label="兼容性测试" value="compat" />
            <el-option label="性能测试" value="performance" />
            <el-option label="端到端测试" value="e2e" />
            <el-option label="自定义测试" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="formData.description" placeholder="Skill 用途描述" />
        </el-form-item>
        <el-form-item label="Prompt 模板" required>
          <el-input
            v-model="formData.prompt_template"
            type="textarea"
            :rows="8"
            placeholder="必须包含 requirement_text 占位符"
          />
          <div class="form-tip" v-text="placeholderTip"></div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showFormDialog = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="!formData.name || !formData.prompt_template"
          @click="submitForm"
        >
          {{ isEditing ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.skill-list-container {
  min-height: 200px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.toolbar-left {
  display: flex;
  align-items: center;
}

.skill-count {
  font-size: 12px;
  color: var(--tp-text-muted, var(--el-text-color-secondary));
}

.toolbar-right {
  display: flex;
  gap: 6px;
}

.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.form-tip code {
  background: var(--el-fill-color-light);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: monospace;
}
</style>
