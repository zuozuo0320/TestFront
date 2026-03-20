<script setup lang="ts">
/**
 * LoginPage — 登录页面（优化版）
 * 深色背景 + 密集粒子网络 + 左侧全息球体 + 右侧毛玻璃表单
 * 输入框聚焦紫色发光 · 渐变按钮 · 登录成功过渡动画 · Remember me
 */
import { nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { loginByEmail } from '../api/auth'
import HoloOrb from '../components/HoloOrb.vue'

const passwordFocused = ref(false)
const router = useRouter()
const loginLoading = ref(false)
const loginSuccess = ref(false)   // 登录成功过渡动画
const rememberMe = ref(true)      // 记住密码
const bgCanvas = ref<HTMLCanvasElement | null>(null)
let animId = 0

const loginForm = reactive({
  email: localStorage.getItem('tp-remember-email') || 'admin@testpilot.local',
  password: 'TestPilot@2026',
})

async function doLogin() {
  if (!loginForm.email.trim()) { ElMessage.warning('请输入邮箱地址'); return }
  if (!loginForm.password) { ElMessage.warning('请输入密码'); return }
  loginLoading.value = true
  try {
    const data = await loginByEmail(loginForm.email, loginForm.password)
    localStorage.setItem('tp-token', data.access_token)
    localStorage.setItem('tp-user-id', String(data.user_id))
    // 记住邮箱
    if (rememberMe.value) {
      localStorage.setItem('tp-remember-email', loginForm.email)
    } else {
      localStorage.removeItem('tp-remember-email')
    }
    ElMessage.success('登录成功')
    // 触发成功过渡动画，延迟跳转
    loginSuccess.value = true
    setTimeout(() => router.push('/'), 600)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || '登录失败')
    loginLoading.value = false
  }
}

function onKeyEnter(e: KeyboardEvent) {
  if (e.key === 'Enter' && !loginLoading.value) doLogin()
}

/** 密集粒子网络背景 */
function initBg() {
  const c = bgCanvas.value
  if (!c) return
  const ctx = c.getContext('2d')!
  let w = (c.width = c.offsetWidth)
  let h = (c.height = c.offsetHeight)
  // 粒子结构：位置、速度、半径、透明度、颜色类型
  const dots: { x: number; y: number; vx: number; vy: number; r: number; a: number; color: number }[] = []
  const count = 120
  for (let i = 0; i < count; i++) {
    dots.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.8 + 0.4,
      a: Math.random() * 0.5 + 0.15,
      color: Math.random(), // 0-0.33=蓝, 0.33-0.66=紫, 0.66-1=青
    })
  }
  function getColor(c: number, a: number): string {
    if (c < 0.33) return `rgba(100,140,255,${a})`      // 蓝
    if (c < 0.66) return `rgba(160,100,255,${a * 0.8})` // 紫
    return `rgba(80,220,255,${a * 0.7})`                // 青
  }
  function draw() {
    ctx.clearRect(0, 0, w, h)
    // 两处径向光晕 — 增加层次
    const g1 = ctx.createRadialGradient(w * 0.3, h * 0.5, 0, w * 0.3, h * 0.5, w * 0.4)
    g1.addColorStop(0, 'rgba(100,60,200,0.04)')
    g1.addColorStop(1, 'transparent')
    ctx.fillStyle = g1; ctx.fillRect(0, 0, w, h)
    const g2 = ctx.createRadialGradient(w * 0.7, h * 0.4, 0, w * 0.7, h * 0.4, w * 0.35)
    g2.addColorStop(0, 'rgba(60,100,200,0.03)')
    g2.addColorStop(1, 'transparent')
    ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h)

    ctx.lineWidth = 0.5
    for (let i = 0; i < count; i++) {
      const p = dots[i]
      p.x += p.vx; p.y += p.vy
      if (p.x < 0 || p.x > w) p.vx *= -1
      if (p.y < 0 || p.y > h) p.vy *= -1
      // 粒子圆点（彩色）
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = getColor(p.color, p.a); ctx.fill()
      // 连线
      for (let j = i + 1; j < count; j++) {
        const q = dots[j]
        const dx = p.x - q.x, dy = p.y - q.y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < 140) {
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y)
          ctx.strokeStyle = `rgba(140,160,255,${0.12 * (1 - d / 140)})`
          ctx.stroke()
        }
      }
    }
    animId = requestAnimationFrame(draw)
  }
  draw()
  window.addEventListener('resize', () => { w = c.width = c.offsetWidth; h = c.height = c.offsetHeight })
}

onMounted(() => nextTick(() => initBg()))
onUnmounted(() => cancelAnimationFrame(animId))
</script>

<template>
  <div class="lp" :class="{ 'fade-out': loginSuccess }" @keydown="onKeyEnter">
    <canvas ref="bgCanvas" class="bg-canvas"></canvas>

    <div class="main">
      <div class="orb-area">
        <HoloOrb :password-focused="passwordFocused" />
      </div>

      <div class="card">
        <h1>Log in to Aisight</h1>
        <p class="sub">Welcome back!</p>

        <el-input v-model="loginForm.email" placeholder="Username" class="field" :prefix-icon="User" size="large" />
        <el-input v-model="loginForm.password" placeholder="Password" show-password class="field" :prefix-icon="Lock" size="large" @focus="passwordFocused = true" @blur="passwordFocused = false" />

        <!-- Remember me -->
        <div class="remember-row">
          <label class="remember-label">
            <input type="checkbox" v-model="rememberMe" class="remember-check" />
            <span class="check-box"></span>
            <span>Remember me</span>
          </label>
        </div>

        <button class="btn-signin" :disabled="loginLoading" @click="doLogin">
          <span v-if="loginLoading" class="btn-loading">
            <span class="spinner"></span> Signing in...
          </span>
          <span v-else>Sign In</span>
        </button>

        <div class="bottom-row">
          <span class="demo">admin@testpilot.local / TestPilot@2026</span>
          <a class="forgot" href="javascript:void(0)">Forgot Password?</a>
        </div>
      </div>
    </div>

    <div class="copy">© 2026 Aisight · Industrial-Grade Test Management</div>
  </div>
</template>

<style scoped>
/* ========== 页面 ========== */
.lp {
  min-height: 100vh;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  transition: opacity 0.5s ease, transform 0.5s ease;
}
.lp.fade-out {
  opacity: 0;
  transform: scale(1.02);
}
.bg-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

/* ========== 主体 ========== */
.main {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 1400px;
  min-height: 420px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 40px;
}

/* 球体 — 融入页面左侧场景 */
.orb-area {
  position: absolute;
  left: 5%;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
  transition: transform 0.3s ease;
}

/* ========== 卡片 — 可辨识的毛玻璃 ========== */
.card {
  position: relative;
  z-index: 2;
  width: 460px;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 36px 28px 28px;
  animation: cardIn 0.6s ease-out;
}
@keyframes cardIn {
  from { opacity: 0; transform: translateX(30px); }
  to   { opacity: 1; transform: translateX(0); }
}

.card h1 {
  margin: 0 0 2px;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
}
.card .sub {
  margin: 0 0 22px;
  color: rgba(255, 255, 255, 0.35);
  font-size: 13px;
}

/* ========== 输入框 + 聚焦发光 ========== */
.field {
  margin-bottom: 14px;
}
.field :deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.05) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  box-shadow: none !important;
  border-radius: 8px !important;
  min-height: 44px;
  transition: all 0.3s ease !important;
}
.field :deep(.el-input__wrapper:hover) {
  border-color: rgba(255, 255, 255, 0.15) !important;
}
.field :deep(.el-input__wrapper.is-focus) {
  border-color: rgba(140, 100, 255, 0.6) !important;
  box-shadow: 0 0 0 3px rgba(140, 100, 255, 0.12), 0 0 20px rgba(140, 100, 255, 0.08) !important;
  animation: focusPulse 2s ease-in-out infinite !important;
}
@keyframes focusPulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(140, 100, 255, 0.12), 0 0 20px rgba(140, 100, 255, 0.08); }
  50%      { box-shadow: 0 0 0 4px rgba(140, 100, 255, 0.18), 0 0 28px rgba(140, 100, 255, 0.12); }
}
.field :deep(.el-input__inner) {
  color: #fff !important;
  font-size: 13px;
}
.field :deep(.el-input__inner::placeholder) {
  color: rgba(255, 255, 255, 0.25) !important;
}
.field :deep(.el-input__prefix) {
  color: rgba(255, 255, 255, 0.3) !important;
}
.field :deep(.el-input__suffix) {
  color: rgba(255, 255, 255, 0.35) !important;
}
/* 密码可见切换图标 hover 效果 */
.field :deep(.el-input__suffix:hover) {
  color: rgba(255, 255, 255, 0.7) !important;
}
.field :deep(.el-input__suffix .el-input__icon) {
  cursor: pointer;
  transition: color 0.2s;
}

/* ========== Remember me ========== */
.remember-row {
  margin-bottom: 16px;
}
.remember-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255,255,255,0.4);
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}
.remember-check {
  display: none;
}
.check-box {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid rgba(255,255,255,0.2);
  background: rgba(255,255,255,0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}
.remember-check:checked + .check-box {
  background: linear-gradient(135deg, #a855f7, #6366f1);
  border-color: transparent;
}
.remember-check:checked + .check-box::after {
  content: '✓';
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}
.remember-label:hover .check-box {
  border-color: rgba(140,100,255,0.5);
}

/* ========== 渐变按钮（紫粉→青） ========== */
.btn-signin {
  width: 100%;
  height: 44px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #c026d3, #a855f7, #7c3aed, #6366f1, #06b6d4);
  background-size: 200% 200%;
  animation: grad 4s ease infinite;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 20px rgba(140, 80, 255, 0.3);
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn-signin:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(140, 80, 255, 0.45);
}
.btn-signin:active:not(:disabled) {
  transform: translateY(0);
}
.btn-signin:disabled {
  opacity: 0.7;
  cursor: wait;
}
@keyframes grad {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
.btn-loading {
  display: flex;
  align-items: center;
  gap: 8px;
}
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ========== 底部 ========== */
.bottom-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.demo { color: rgba(255,255,255,0.18); font-size: 10px; }
.forgot {
  color: rgba(255,255,255,0.4);
  font-size: 12px;
  text-decoration: none;
  transition: color 0.2s;
}
.forgot:hover { color: rgba(140,100,255,0.8); text-decoration: underline; }

.copy {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255,255,255,0.12);
  font-size: 11px;
  z-index: 1;
}

/* ========== 响应式 ========== */
@media (max-width: 860px) {
  .main {
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 0 20px;
  }
  .orb-area {
    position: relative;
    left: auto;
    top: auto;
    transform: none;
    margin-bottom: -40px;
  }
  .orb-area:hover { transform: scale(1.03); }
  .card { width: 90vw; max-width: 380px; }
}
</style>
