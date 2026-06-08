<script setup lang="ts">
/**
 * AI 模型配置页面
 *
 * 管理 LLM 模型提供商（GPT / Claude）的 API Key、Base URL 和模型版本。
 * 仅 admin 用户可见此页面。
 */
import { onMounted, reactive, ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import {
  listAIModelConfigs,
  createAIModelConfig,
  updateAIModelConfig,
  deleteAIModelConfig,
  activateAIModel,
  testAIModelConnection,
  listAIModelOptions,
  type AIModelConfig,
  type CreateAIModelInput,
  type AIModelOption,
  type AIModelStrength,
} from '../../api/aiModelConfig'
import EmptyState from '../../components/EmptyState.vue'

/** 提供商选项 */
const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', icon: 'smart_toy' },
  { value: 'anthropic', label: 'Anthropic (Claude)', icon: 'psychology' },
  { value: 'custom', label: '自定义兼容', icon: 'tune' },
]

const MODEL_STRENGTHS: Array<{
  value: AIModelStrength
  label: string
  desc: string
  icon: string
}> = [
  { value: 'low', label: '低强度', desc: '更快响应，适合简单任务', icon: 'speed' },
  { value: 'medium', label: '中强度', desc: '质量与速度平衡，推荐默认', icon: 'tune' },
  { value: 'high', label: '高强度', desc: '更强推理，适合复杂生成', icon: 'psychology' },
]

const loading = ref(false)
const configs = ref<AIModelConfig[]>([])
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const testing = ref(false)
const testResult = ref<{ status: string; message: string } | null>(null)
const modelLoading = ref(false)
const modelOptions = ref<AIModelOption[]>([])

/** 表单引用与规则校验 */
const formRef = ref<FormInstance>()

const rules = reactive<FormRules>({
  provider: [{ required: true, message: '请选择提供商', trigger: 'change' }],
  name: [{ required: true, message: '请输入显示名称', trigger: 'blur' }],
  model_id: [{ required: true, message: '请选择模型', trigger: 'change' }],
  api_key: [
    {
      required: true,
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (!editingId.value && !value.trim()) {
          callback(new Error('请输入 API Key'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
})

const form = reactive<CreateAIModelInput>({
  provider: 'openai',
  name: '',
  model_id: '',
  model_strength: 'medium',
  base_url: '',
  api_key: '',
})

/** 当前启用的模型 */
const activeConfig = computed(() => configs.value.find((c) => c.is_active))

/** 统计信息 */
const totalConfigs = computed(() => configs.value.length)
const providerCount = computed(() => new Set(configs.value.map((c) => c.provider)).size)

/** 提供商显示名 */
function providerLabel(provider: string): string {
  return PROVIDERS.find((p) => p.value === provider)?.label ?? provider
}

/** 提供商图标 */
function providerIcon(provider: string): string {
  return PROVIDERS.find((p) => p.value === provider)?.icon ?? 'tune'
}

function modelStrengthLabel(strength: AIModelStrength | string): string {
  return MODEL_STRENGTHS.find((item) => item.value === strength)?.label ?? '中强度'
}

/** 加载列表 */
async function loadConfigs() {
  loading.value = true
  try {
    configs.value = await listAIModelConfigs()
  } catch {
    // 表可能尚未创建或首次加载，视为空列表即可
    configs.value = []
  } finally {
    loading.value = false
  }
}

/** 打开新建弹窗 */
function openCreate() {
  editingId.value = null
  form.provider = 'openai'
  form.name = ''
  form.model_id = ''
  form.model_strength = 'medium'
  form.base_url = ''
  form.api_key = ''
  modelOptions.value = []
  testResult.value = null
  dialogVisible.value = true
  // 异步清空表单校验历史
  setTimeout(() => {
    formRef.value?.clearValidate()
  }, 0)
}

/** 打开编辑弹窗 */
function openEdit(row: AIModelConfig) {
  editingId.value = row.id
  form.provider = row.provider
  form.name = row.name
  form.model_id = row.model_id
  form.model_strength = row.model_strength || 'medium'
  form.base_url = row.base_url
  form.api_key = ''
  modelOptions.value = [{ id: row.model_id, name: row.model_id }]
  testResult.value = null
  dialogVisible.value = true
  // 异步清空表单校验历史
  setTimeout(() => {
    formRef.value?.clearValidate()
  }, 0)
}

function onProviderChange() {
  form.model_id = ''
  form.name = ''
  modelOptions.value = []
  testResult.value = null
  formRef.value?.clearValidate(['model_id', 'name'])
}

function onModelChange(modelId: string) {
  const selected = modelOptions.value.find((item) => item.id === modelId)
  form.name = selected?.name || modelId
  testResult.value = null
  formRef.value?.clearValidate(['name'])
}

async function onFetchModels() {
  if (!form.api_key.trim() && !editingId.value) {
    ElMessage.warning('请先填写 API Key')
    return
  }
  modelLoading.value = true
  testResult.value = null
  try {
    const models = await listAIModelOptions({
      provider: form.provider,
      api_key: form.api_key,
      base_url: form.base_url,
      ...(editingId.value ? { config_id: editingId.value } : {}),
    })
    modelOptions.value = models
    if (models.length === 0) {
      ElMessage.warning('未获取到可用模型')
      return
    }
    const current = models.find((item) => item.id === form.model_id)
    if (!current) {
      const firstModel = models[0]
      if (!firstModel) return
      form.model_id = firstModel.id
      form.name = firstModel.name || firstModel.id
    }
    ElMessage.success(`已获取 ${models.length} 个模型`)
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      '获取模型列表失败'
    ElMessage.error(msg)
  } finally {
    modelLoading.value = false
  }
}

/** 测试连接 */
async function onTestConnection() {
  if (!form.model_id.trim()) {
    ElMessage.warning('请先获取并选择模型')
    return
  }
  if (!form.api_key.trim() && !editingId.value) {
    ElMessage.warning('请填写 API Key')
    return
  }
  testing.value = true
  testResult.value = null
  try {
    console.warn('[ai-model] testing connection...', form.model_id)
    const res = await testAIModelConnection({
      provider: form.provider,
      api_key: form.api_key,
      base_url: form.base_url,
      model_id: form.model_id,
      ...(editingId.value ? { config_id: editingId.value } : {}),
    })
    console.warn('[ai-model] test result:', res)
    testResult.value = { status: 'ok', message: res?.message ?? '连接成功' }
    ElMessage.success(testResult.value.message)
  } catch (err: unknown) {
    console.error('[ai-model] test error:', err)
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message || '连接失败'
    testResult.value = { status: 'error', message: msg }
    ElMessage.error(msg)
  } finally {
    testing.value = false
  }
}

/** 提交：保存 + 启用 */
async function submitForm() {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    if (!testResult.value || testResult.value.status !== 'ok') {
      ElMessage.warning('请先测试连接通过后再保存')
      return
    }
    saving.value = true
    try {
      let savedId: number
      if (editingId.value) {
        const updated = await updateAIModelConfig(editingId.value, {
          provider: form.provider,
          name: form.name,
          model_id: form.model_id,
          model_strength: form.model_strength,
          base_url: form.base_url,
          ...(form.api_key ? { api_key: form.api_key } : {}),
        })
        savedId = updated.id
      } else {
        const created = await createAIModelConfig(form)
        savedId = created.id
      }
      // 保存成功后自动启用
      await activateAIModel(savedId)
      ElMessage.success('模型配置已保存并启用')
      dialogVisible.value = false
      await loadConfigs()
    } catch {
      ElMessage.error('保存失败')
    } finally {
      saving.value = false
    }
  })
}

/** 删除 */
async function onDelete(row: AIModelConfig) {
  try {
    await ElMessageBox.confirm(`确认删除模型「${row.name}」？`, '删除确认', {
      type: 'warning',
    })
    await deleteAIModelConfig(row.id)
    ElMessage.success('已删除')
    await loadConfigs()
  } catch {
    /* 用户取消 */
  }
}

/** 启用 */
async function onActivate(row: AIModelConfig) {
  try {
    await activateAIModel(row.id)
    ElMessage.success(`已启用「${row.name}」`)
    await loadConfigs()
  } catch {
    ElMessage.error('启用失败')
  }
}

onMounted(() => loadConfigs())
</script>

<template>
  <div v-loading="loading" class="amc-page">
    <!-- 页头 -->
    <header class="amc-header">
      <div class="amc-stat-pills">
        <span class="amc-pill">
          <span class="material-symbols-outlined">dns</span>
          {{ totalConfigs }} 个模型
        </span>
        <span class="amc-pill">
          <span class="material-symbols-outlined">hub</span>
          {{ providerCount }} 个提供商
        </span>
        <span v-if="activeConfig" class="amc-pill amc-pill--active">
          <span class="material-symbols-outlined">check_circle</span>
          {{ activeConfig.name }}
        </span>
      </div>
      <div class="amc-header-right">
        <button class="amc-btn amc-btn--primary" @click="openCreate">
          <span class="material-symbols-outlined">add</span>
          新增模型
        </button>
      </div>
    </header>

    <!-- 模型卡片列表 -->
    <div v-if="configs.length > 0" class="amc-grid">
      <div
        v-for="cfg in configs"
        :key="cfg.id"
        class="amc-card"
        :class="{ 'amc-card--active': cfg.is_active }"
      >
        <!-- 悬浮侧边高亮条 -->
        <div class="amc-card-accent"></div>

        <div class="amc-card-header">
          <span
            class="amc-provider-icon material-symbols-outlined"
            :class="`amc-provider-icon--${cfg.provider}`"
          >
            {{ providerIcon(cfg.provider) }}
          </span>
          <div class="amc-card-title">
            <strong>{{ cfg.name }}</strong>
            <span class="amc-provider-label">{{ providerLabel(cfg.provider) }}</span>
          </div>
          <span v-if="cfg.is_active" class="amc-active-badge">
            <span class="material-symbols-outlined">check_circle</span>
            启用中
          </span>
        </div>

        <div class="amc-card-body">
          <div class="amc-field">
            <label>
              <span class="material-symbols-outlined amc-field-icon">terminal</span>
              模型标识
            </label>
            <code>{{ cfg.model_id }}</code>
          </div>
          <div class="amc-field">
            <label>
              <span class="material-symbols-outlined amc-field-icon">bolt</span>
              模型强度
            </label>
            <code>{{ modelStrengthLabel(cfg.model_strength) }}</code>
          </div>
          <div class="amc-field amc-field--url">
            <label>
              <span class="material-symbols-outlined amc-field-icon">lan</span>
              Base URL
            </label>
            <code>{{ cfg.base_url || '—' }}</code>
          </div>
          <div class="amc-field amc-field--key">
            <label>
              <span class="material-symbols-outlined amc-field-icon">vpn_key</span>
              API Key
            </label>
            <code>{{ cfg.api_key || '••••••••••••••••' }}</code>
          </div>
        </div>

        <div class="amc-card-actions">
          <button v-if="!cfg.is_active" class="amc-btn amc-btn--activate" @click="onActivate(cfg)">
            <span class="material-symbols-outlined">power_settings_new</span>
            启用
          </button>
          <button class="amc-btn amc-btn--edit" @click="openEdit(cfg)">
            <span class="material-symbols-outlined">edit</span>
            编辑
          </button>
          <button v-if="!cfg.is_active" class="amc-btn amc-btn--delete" @click="onDelete(cfg)">
            <span class="material-symbols-outlined">delete</span>
            删除
          </button>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!loading" class="amc-empty-container">
      <EmptyState
        type="aimodel"
        description="暂无模型配置"
        show-action
        action-text="新增模型"
        @action="openCreate"
      />
    </div>

    <!-- 新建/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      class="amc-config-dialog"
      width="680px"
      :close-on-click-modal="false"
    >
      <template #header>
        <div class="amc-dialog-titlebar">
          <div class="amc-dialog-title-icon">
            <span class="material-symbols-outlined">model_training</span>
          </div>
          <div>
            <h2>{{ editingId ? '编辑模型配置' : '新增模型配置' }}</h2>
            <p>先验证供应商连接，再从接口返回的模型列表中选择启用模型。</p>
          </div>
        </div>
      </template>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="amc-form">
        <section class="amc-form-section">
          <div class="amc-section-head">
            <span class="material-symbols-outlined">settings_ethernet</span>
            <div>
              <strong>连接信息</strong>
              <p>配置模型服务商的 API 连接凭证。</p>
            </div>
          </div>
          <div class="amc-form-grid">
            <el-form-item prop="provider" label="提供商">
              <el-select
                v-model="form.provider"
                placeholder="选择提供商"
                @change="onProviderChange"
              >
                <el-option v-for="p in PROVIDERS" :key="p.value" :value="p.value" :label="p.label">
                  <span class="amc-provider-option">
                    <span class="material-symbols-outlined">{{ p.icon }}</span>
                    {{ p.label }}
                  </span>
                </el-option>
              </el-select>
            </el-form-item>
            <el-form-item prop="base_url" label="Base URL">
              <el-input v-model="form.base_url" placeholder="如：https://api.openai.com/v1" />
            </el-form-item>
          </div>
          <el-form-item prop="api_key" label="API Key">
            <el-input
              v-model="form.api_key"
              type="password"
              show-password
              :placeholder="editingId ? '留空则不修改，获取模型时使用已保存密钥' : '输入 API Key'"
            />
          </el-form-item>
        </section>
        <section class="amc-form-section">
          <div class="amc-section-head">
            <span class="material-symbols-outlined">account_tree</span>
            <div>
              <strong>模型与强度</strong>
              <p>从服务商返回的可用模型列表中选择，并设置显示名称与强度属性。</p>
            </div>
          </div>
          <div class="amc-model-panel">
            <el-form-item prop="model_id" label="模型">
              <div class="amc-model-select-row">
                <el-select
                  v-model="form.model_id"
                  class="amc-model-select"
                  popper-class="amc-model-popper"
                  filterable
                  :loading="modelLoading"
                  :disabled="modelOptions.length === 0 && !form.model_id"
                  placeholder="请先获取模型列表"
                  @change="onModelChange"
                >
                  <el-option
                    v-for="model in modelOptions"
                    :key="model.id"
                    :value="model.id"
                    :label="model.name === model.id ? model.id : `${model.name} (${model.id})`"
                  >
                    <div class="amc-model-option">
                      <span class="amc-model-option-icon material-symbols-outlined">memory</span>
                      <span class="amc-model-option-main">
                        <strong>{{ model.name }}</strong>
                        <small v-if="model.name !== model.id">{{ model.id }}</small>
                      </span>
                      <span
                        v-if="form.model_id === model.id"
                        class="amc-model-option-check material-symbols-outlined"
                      >
                        check
                      </span>
                    </div>
                  </el-option>
                </el-select>
                <button
                  type="button"
                  class="amc-btn amc-btn--fetch"
                  :disabled="modelLoading || (!form.api_key.trim() && !editingId)"
                  @click="onFetchModels"
                >
                  <span v-if="modelLoading" class="amc-spinner" />
                  <span v-else class="material-symbols-outlined">cloud_download</span>
                  {{ modelLoading ? '获取中...' : '获取模型' }}
                </button>
              </div>
            </el-form-item>
            <el-form-item prop="name" label="显示名称">
              <el-input v-model="form.name" placeholder="显示名称" />
            </el-form-item>
          </div>
          <el-form-item label="模型强度" class="amc-strength-item">
            <div class="amc-strength-options">
              <button
                v-for="item in MODEL_STRENGTHS"
                :key="item.value"
                type="button"
                class="amc-strength-option"
                :class="{ 'amc-strength-option--active': form.model_strength === item.value }"
                @click="form.model_strength = item.value"
              >
                <span class="material-symbols-outlined">{{ item.icon }}</span>
                <span>
                  <strong>{{ item.label }}</strong>
                  <small>{{ item.desc }}</small>
                </span>
              </button>
            </div>
            <span class="amc-helper-text">
              推理类模型会使用该强度；普通模型会保持兼容参数，避免供应商接口报错。
            </span>
          </el-form-item>
          <div class="amc-test-area">
            <button
              type="button"
              class="amc-btn amc-btn--test"
              :disabled="testing"
              @click="onTestConnection"
            >
              <span v-if="testing" class="amc-spinner" />
              <span v-else class="material-symbols-outlined">wifi_tethering</span>
              {{ testing ? '测试中...' : '测试连接' }}
            </button>
            <span
              v-if="testResult"
              class="amc-test-result"
              :class="testResult.status === 'ok' ? 'amc-test-ok' : 'amc-test-fail'"
            >
              <span class="material-symbols-outlined">
                {{ testResult.status === 'ok' ? 'check_circle' : 'error' }}
              </span>
              {{ testResult.message }}
            </span>
          </div>
        </section>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="!testResult || testResult.status !== 'ok'"
          @click="submitForm"
        >
          {{ editingId ? '保存并启用' : '创建并启用' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.amc-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0;
  display: flex;
  flex-direction: column;
}

/* ── 页头 ── */
.amc-page .amc-header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 16px !important;
  margin-bottom: 24px !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
  min-height: 0 !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.amc-page .amc-header-right {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
}

.amc-page .amc-stat-pills {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  min-height: 0 !important;
  box-shadow: none !important;
}

.amc-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  color: var(--tp-gray-600);
  background: var(--tp-gray-50);
  border: 1px solid var(--tp-gray-200);
}

.amc-pill .material-symbols-outlined {
  font-size: 14px;
}

.amc-pill--active {
  color: var(--tp-primary);
  background: var(--tp-primary-lighter);
  border-color: rgba(139, 92, 246, 0.22);
}

/* ── 按钮 ── */
.amc-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--tp-gray-200);
  background: white;
  color: var(--tp-gray-700);
  cursor: pointer;
  transition: all 0.15s ease-out;
}

.amc-btn .material-symbols-outlined {
  font-size: 16px;
}

.amc-btn:hover {
  background: var(--tp-gray-50);
  border-color: var(--tp-gray-300);
}

.amc-btn--primary {
  background: var(--tp-btn-bg) !important;
  color: white !important;
  border: none !important;
  box-shadow: var(--tp-btn-shadow);
}

.amc-btn--primary:hover,
.amc-btn--primary:focus,
.amc-btn--primary:active {
  background: var(--tp-btn-bg-hover) !important;
  color: white !important;
  box-shadow: var(--tp-btn-shadow-hover);
  transform: translateY(-1px);
}

.amc-btn--activate {
  color: #059669;
  border-color: #a7f3d0;
  background: #ecfdf5;
}

.amc-btn--activate:hover {
  background: #d1fae5;
}

.amc-btn--edit {
  color: var(--tp-primary);
  border-color: rgba(139, 92, 246, 0.22);
}

.amc-btn--edit:hover {
  background: var(--tp-primary-lighter);
}

.amc-btn--delete {
  color: #dc2626;
  border-color: #fecaca;
}

.amc-btn--delete:hover {
  background: #fef2f2;
}

/* ── 卡片网格 ── */
.amc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 24px;
  margin-top: 12px;
  min-height: 200px;
  max-width: 1280px;
}

.amc-card {
  position: relative;
  overflow: hidden;
  background: white;
  border: 1px solid var(--tp-gray-200);
  border-radius: 16px;
  padding: 24px;
  transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.amc-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--tp-shadow-card-hover);
  border-color: var(--tp-primary-light);
}

.amc-card--active {
  border-color: var(--tp-primary);
  box-shadow:
    0 0 20px rgba(139, 92, 246, 0.08),
    inset 0 0 0 1px var(--tp-primary);
}

.amc-card--active:hover {
  border-color: var(--tp-primary);
  box-shadow:
    0 0 24px rgba(139, 92, 246, 0.12),
    var(--tp-shadow-card-hover);
}

/* 激活态顶部渐变光条 */
.amc-card-accent {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: transparent;
  transition: background 0.25s ease;
}

.amc-card--active .amc-card-accent {
  background: linear-gradient(90deg, var(--tp-primary), var(--tp-secondary));
}

.amc-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.amc-provider-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  font-size: 22px;
  line-height: 1;
  background: var(--tp-gray-50);
  border: 1px solid var(--tp-gray-100);
  flex-shrink: 0;
  transition: all 0.2s ease;
}

/* OpenAI 专属品牌配色 */
.amc-provider-icon--openai {
  color: #10a37f !important;
  background: rgba(16, 163, 127, 0.08) !important;
  border-color: rgba(16, 163, 127, 0.18) !important;
}
.amc-card--active .amc-provider-icon--openai {
  background: rgba(16, 163, 127, 0.15) !important;
  border-color: rgba(16, 163, 127, 0.3) !important;
}

/* Anthropic 专属品牌配色 */
.amc-provider-icon--anthropic {
  color: #cc7b5c !important;
  background: rgba(204, 123, 92, 0.08) !important;
  border-color: rgba(204, 123, 92, 0.18) !important;
}
.amc-card--active .amc-provider-icon--anthropic {
  background: rgba(204, 123, 92, 0.15) !important;
  border-color: rgba(204, 123, 92, 0.3) !important;
}

/* 自定义兼容 专属品牌配色 */
.amc-provider-icon--custom {
  color: var(--tp-primary) !important;
  background: var(--tp-primary-lighter) !important;
  border-color: rgba(139, 92, 246, 0.18) !important;
}
.amc-card--active .amc-provider-icon--custom {
  background: rgba(139, 92, 246, 0.18) !important;
  border-color: rgba(139, 92, 246, 0.35) !important;
}

.amc-card-title {
  flex: 1;
  min-width: 0;
}

.amc-card-title strong {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: var(--tp-gray-900);
  line-height: 1.3;
}

.amc-provider-label {
  font-size: 12px;
  color: var(--tp-gray-500);
  margin-top: 2px;
}

.amc-active-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  color: var(--tp-primary);
  background: var(--tp-primary-lighter);
  flex-shrink: 0;
}

.amc-active-badge .material-symbols-outlined {
  font-size: 14px;
}

/* ── 卡片内容 ── */
.amc-card-body {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-bottom: 20px;
  background: var(--tp-gray-50);
  border-radius: 10px;
  padding: 2px 0;
  overflow: hidden;
}

.amc-field {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 12px 16px;
  transition: background 0.2s ease;
}

.amc-field:hover {
  background: rgba(139, 92, 246, 0.035);
}

.amc-field + .amc-field {
  border-top: 1px solid var(--tp-gray-100);
}

.amc-field label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--tp-gray-500);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.amc-field-icon {
  font-size: 14px !important;
  color: var(--tp-primary);
  opacity: 0.85;
}

.amc-field code {
  font-size: 13px;
  font-family: 'SF Mono', 'Cascadia Code', 'JetBrains Mono', monospace;
  color: var(--tp-gray-800);
  background: transparent;
  padding: 0;
  word-break: break-all;
  width: 100%;
}

.amc-provider-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.amc-provider-option .material-symbols-outlined {
  font-size: 16px;
  color: var(--tp-primary);
}

/* ── 卡片操作 ── */
.amc-card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* ── 空状态 ── */
.amc-empty-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 24px;
  width: 100%;
}

.amc-empty .material-symbols-outlined {
  font-size: 56px;
  margin-bottom: 12px;
  color: var(--tp-gray-300);
}

.amc-empty p {
  margin: 0 0 20px;
  font-size: 14px;
  color: var(--tp-gray-500);
}

/* ── 表单 ── */
:deep(.amc-config-dialog .el-dialog__header) {
  padding: 18px 22px 14px;
  margin-right: 0;
  border-bottom: 1px solid var(--tp-gray-100);
}

:deep(.amc-config-dialog .el-dialog__body) {
  padding: 16px 22px;
}

:deep(.amc-config-dialog .el-dialog__footer) {
  padding: 14px 22px 18px;
  border-top: 1px solid var(--tp-gray-100);
}

.amc-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.amc-dialog-titlebar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.amc-dialog-title-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  color: var(--tp-primary);
  background: var(--tp-primary-lighter);
  border: 1px solid rgba(139, 92, 246, 0.16);
}

.amc-dialog-title-icon .material-symbols-outlined {
  font-size: 20px;
}

.amc-dialog-titlebar h2 {
  margin: 0;
  font-size: 16px;
  line-height: 1.3;
  color: var(--tp-gray-900);
}

.amc-dialog-titlebar p {
  margin: 3px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--tp-gray-500);
}

.amc-form-section {
  padding: 14px;
  border: 1px solid var(--tp-gray-200);
  border-radius: 14px;
  background: var(--tp-gray-50);
}

.amc-section-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
}

.amc-section-head > .material-symbols-outlined {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  font-size: 17px;
  color: var(--tp-primary);
  background: white;
  border: 1px solid var(--tp-gray-200);
}

.amc-section-head strong {
  display: block;
  font-size: 13px;
  line-height: 1.35;
  color: var(--tp-gray-900);
}

.amc-section-head p {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--tp-gray-500);
}

.amc-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 220px) minmax(0, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.amc-form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.amc-form-item label {
  font-size: 13px;
  font-weight: 600;
  color: var(--tp-gray-700);
}

.amc-form-item .required {
  color: var(--tp-danger);
}

.amc-model-panel {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.8fr);
  gap: 12px;
}

.amc-model-select-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.amc-model-select {
  flex: 1;
  min-width: 0;
}

.amc-helper-text {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--tp-gray-500);
}

:deep(.amc-model-select .el-select__wrapper) {
  min-height: 36px;
  border-radius: 12px;
  background: white;
  box-shadow: 0 0 0 1px var(--tp-gray-200) inset;
  outline: none !important;
}

:deep(.amc-model-select .el-input__wrapper),
:deep(.amc-model-select .el-input__wrapper.is-focus),
:deep(.amc-model-select .el-input__wrapper.is-focused) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
  padding: 0 !important;
}

:deep(.amc-model-select .el-input__inner) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
}

:deep(.amc-model-select .el-select__wrapper.is-focused) {
  box-shadow:
    0 0 0 1px var(--tp-primary) inset,
    0 0 0 3px var(--tp-primary-lighter);
  outline: none !important;
}

:deep(.amc-model-select .el-select__input) {
  outline: none !important;
  box-shadow: none !important;
}

:global(.amc-model-popper.el-select__popper) {
  border: 1px solid rgba(139, 92, 246, 0.18);
  border-radius: 14px;
  box-shadow:
    0 12px 28px rgba(17, 24, 39, 0.1),
    0 4px 12px rgba(139, 92, 246, 0.08);
  overflow: hidden;
}

:global(.amc-model-popper .el-select-dropdown) {
  padding: 6px;
}

:global(.amc-model-popper .el-select-dropdown__list) {
  padding: 0;
}

:global(.amc-model-popper .el-select-dropdown__item) {
  height: auto;
  min-height: 48px;
  padding: 0;
  border-radius: 10px;
  color: var(--tp-gray-700);
}

:global(.amc-model-popper .el-select-dropdown__item.hover),
:global(.amc-model-popper .el-select-dropdown__item:hover) {
  background: var(--tp-gray-50);
}

:global(.amc-model-popper .el-select-dropdown__item.selected) {
  color: var(--tp-primary);
  background: var(--tp-primary-lighter);
}

.amc-model-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 8px 10px;
}

.amc-model-option-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  font-size: 16px;
  color: var(--tp-primary);
  background: white;
  border: 1px solid rgba(139, 92, 246, 0.16);
  flex-shrink: 0;
}

.amc-model-option-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}

.amc-model-option-main strong {
  overflow: hidden;
  font-size: 13px;
  font-weight: 700;
  color: var(--tp-gray-900);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.amc-model-option-main small {
  overflow: hidden;
  margin-top: 2px;
  font-size: 11px;
  font-family: 'SF Mono', 'Cascadia Code', 'JetBrains Mono', monospace;
  color: var(--tp-gray-500);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.amc-model-option-check {
  font-size: 18px;
  color: var(--tp-primary);
  flex-shrink: 0;
}

.amc-strength-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.amc-strength-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-height: 58px;
  padding: 10px;
  text-align: left;
  border: 1px solid var(--tp-gray-200);
  border-radius: 12px;
  background: white;
  color: var(--tp-gray-700);
  cursor: pointer;
  transition:
    border-color 0.15s ease-out,
    background 0.15s ease-out,
    box-shadow 0.15s ease-out;
}

.amc-strength-option:hover {
  border-color: rgba(139, 92, 246, 0.28);
  background: var(--tp-gray-50);
}

.amc-strength-option--active {
  border-color: var(--tp-primary);
  background: var(--tp-primary-lighter);
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.08);
}

.amc-strength-option > .material-symbols-outlined {
  font-size: 18px;
  color: var(--tp-primary);
  flex-shrink: 0;
}

.amc-strength-option strong {
  display: block;
  font-size: 12px;
  line-height: 1.35;
  color: var(--tp-gray-900);
}

.amc-strength-option small {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.35;
  color: var(--tp-gray-500);
}

.amc-btn--fetch {
  min-height: 32px;
  padding: 6px 14px;
  color: var(--tp-primary);
  border-color: rgba(139, 92, 246, 0.22);
  background: white;
  white-space: nowrap;
}

.amc-btn--fetch:hover {
  background: var(--tp-primary-lighter);
}

.amc-btn--fetch:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ── 测试连接区域 ── */
.amc-test-area {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  margin-top: 12px;
  padding: 12px;
  border-top: 1px dashed var(--tp-gray-200);
  border-radius: 12px;
  background: white;
}

.amc-btn--test {
  color: var(--tp-primary);
  border-color: rgba(139, 92, 246, 0.22);
  background: var(--tp-primary-lighter);
  white-space: nowrap;
}

.amc-btn--test:hover {
  background: rgba(139, 92, 246, 0.15);
}

.amc-btn--test:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.amc-test-result {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}

.amc-test-result .material-symbols-outlined {
  font-size: 16px;
  flex-shrink: 0;
}

.amc-test-ok {
  color: var(--tp-success);
  background: var(--tp-success-light);
}

.amc-test-fail {
  color: var(--tp-danger);
  background: var(--tp-danger-light);
}

/* 纯 CSS 旋转加载指示器 */
.amc-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(139, 92, 246, 0.2);
  border-top-color: var(--tp-primary);
  border-radius: 50%;
  animation: amc-spin-kf 0.6s linear infinite;
}

@media (max-width: 720px) {
  .amc-form-grid,
  .amc-model-panel,
  .amc-strength-options {
    grid-template-columns: 1fr;
  }

  .amc-model-select-row,
  .amc-test-area {
    align-items: stretch;
    flex-direction: column;
  }

  .amc-btn--fetch,
  .amc-btn--test {
    justify-content: center;
    width: 100%;
  }
}

@keyframes amc-spin-kf {
  to {
    transform: rotate(360deg);
  }
}
</style>
