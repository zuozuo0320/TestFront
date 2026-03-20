<script setup lang="ts">
/**
 * HoloOrb — 全息AI悬浮球吉祥物
 * 纯黑背景无脸球体图片 + CSS动态眼睛叠加
 * 丝滑 lerp 跟随 · 自动眨眼 · 输入密码时闭眼
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  passwordFocused?: boolean
}>()

const orbRef = ref<HTMLDivElement | null>(null)
const leftEyeX = ref(0)
const leftEyeY = ref(0)
const rightEyeX = ref(0)
const rightEyeY = ref(0)
const eyeScaleY = ref(1)
const floatY = ref(0)
const orbTiltX = ref(0)
const orbTiltY = ref(0)

// lerp 目标值（鼠标瞬时计算，渲染帧平滑插值）
const target = { lx: 0, ly: 0, rx: 0, ry: 0, tx: 0, ty: 0 }

/** 鼠标移动 → 更新目标值 */
function onMouseMove(e: MouseEvent) {
  if (!orbRef.value || props.passwordFocused) return
  const rect = orbRef.value.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height * 0.40
  const dx = e.clientX - cx
  const dy = e.clientY - cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  const maxOffset = 14
  const factor = Math.min(dist / 250, 1)
  const angle = Math.atan2(dy, dx)
  const ox = Math.cos(angle) * maxOffset * factor
  const oy = Math.sin(angle) * maxOffset * factor
  target.lx = ox * 0.85;  target.ly = oy * 0.85
  target.rx = ox * 1.15;  target.ry = oy * 1.15
  target.tx = ox * 1.5;   target.ty = oy * 1.0
}

watch(() => props.passwordFocused, (f) => {
  eyeScaleY.value = f ? 0.08 : 1
  if (f) {
    target.lx = 0; target.ly = 0
    target.rx = 0; target.ry = 0
    target.tx = 0; target.ty = 0
  }
})

/** lerp 工具 */
function lerp(cur: number, tgt: number, t: number) {
  return cur + (tgt - cur) * t
}

/** 自动眨眼 */
let blinkTimer: ReturnType<typeof setTimeout>
function scheduleBlink() {
  const delay = 3000 + Math.random() * 2000  // 3~5秒
  blinkTimer = setTimeout(() => {
    if (!props.passwordFocused) {
      eyeScaleY.value = 0.05
      setTimeout(() => {
        if (!props.passwordFocused) eyeScaleY.value = 1
      }, 150)
    }
    scheduleBlink()
  }, delay)
}

let animId = 0
function animate() {
  floatY.value = Math.sin(Date.now() / 1200) * 8
  // lerp 平滑插值（0.08 = 很丝滑）
  const t = 0.08
  leftEyeX.value = lerp(leftEyeX.value, target.lx, t)
  leftEyeY.value = lerp(leftEyeY.value, target.ly, t)
  rightEyeX.value = lerp(rightEyeX.value, target.rx, t)
  rightEyeY.value = lerp(rightEyeY.value, target.ry, t)
  orbTiltX.value = lerp(orbTiltX.value, target.tx, t * 0.6)
  orbTiltY.value = lerp(orbTiltY.value, target.ty, t * 0.6)
  animId = requestAnimationFrame(animate)
}

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove)
  animate()
  scheduleBlink()
})
onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  cancelAnimationFrame(animId)
  clearTimeout(blinkTimer)
})
</script>

<template>
  <div ref="orbRef" class="holo-orb" :style="{ transform: `translate(${orbTiltX}px, ${floatY + orbTiltY}px)` }">
    <img src="/images/holo-orb.png" alt="AI Orb" class="orb-img" draggable="false" />

    <!-- 脸部暗色底板 —— 让五官有归属感 -->
    <div class="face"></div>

    <!-- 动态眼睛 -->
    <div class="eyes">
      <div class="eye" :style="{ transform: `translate(${leftEyeX}px, ${leftEyeY}px) scaleY(${eyeScaleY})` }">
        <div class="eye-bg"></div>
        <div class="iris"></div>
        <div class="pupil"></div>
        <div class="shine"></div>
        <div class="shine-sm"></div>
      </div>
      <div class="eye" :style="{ transform: `translate(${rightEyeX}px, ${rightEyeY}px) scaleY(${eyeScaleY})` }">
        <div class="eye-bg"></div>
        <div class="iris"></div>
        <div class="pupil"></div>
        <div class="shine"></div>
        <div class="shine-sm"></div>
      </div>
    </div>

    <!-- 嘴巴 -->
    <div class="mouth-area">
      <div class="smile" :class="{ hide: passwordFocused }"></div>
      <div class="flat" :class="{ show: passwordFocused }"></div>
    </div>
  </div>
</template>

<style scoped>
.holo-orb {
  position: relative;
  width: 520px;
  height: 520px;
  flex-shrink: 0;
  transition: transform 0.08s linear;
  /* 呼吸脉冲光晕 */
  animation: orbPulse 3s ease-in-out infinite;
}
@keyframes orbPulse {
  0%, 100% { filter: drop-shadow(0 0 20px rgba(120, 80, 255, 0.15)); }
  50%      { filter: drop-shadow(0 0 40px rgba(120, 100, 255, 0.3)) drop-shadow(0 0 80px rgba(80, 60, 200, 0.1)); }
}
.orb-img {
  width: 100%; height: 100%;
  object-fit: contain;
  display: block;
  user-select: none;
  pointer-events: none;
  /* 径向遮罩 → 图片边缘渐隐，消除黑色矩形边框 */
  -webkit-mask-image: radial-gradient(circle, black 55%, transparent 80%);
  mask-image: radial-gradient(circle, black 55%, transparent 80%);
}

/* ===== 脸部底板 — 柔和暗色区域承托五官 ===== */
.face {
  position: absolute;
  top: 38%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 190px;
  height: 170px;
  border-radius: 50%;
  background: radial-gradient(circle,
    rgba(12, 8, 35, 0.9) 0%,
    rgba(18, 14, 45, 0.7) 45%,
    rgba(25, 18, 55, 0.3) 75%,
    transparent 100%
  );
  z-index: 1;
}

/* ===== 可爱大眼睛 ===== */
.eyes {
  position: absolute;
  top: 35%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  gap: 14px;
  z-index: 2;
}
.eye {
  position: relative;
  width: 72px;
  height: 72px;
  transition: transform 0.2s ease-out;
}
/* 眼窝 — 柔和深色 + 厚紫色描边 */
.eye-bg {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 45% 38%,
    rgba(55, 40, 100, 0.9),
    rgba(18, 12, 45, 0.97)
  );
  border: 5px solid rgba(170, 150, 255, 0.45);
  box-shadow:
    0 0 28px rgba(150, 120, 255, 0.35),
    0 0 10px rgba(120, 160, 255, 0.25),
    inset 0 0 18px rgba(120, 100, 255, 0.1);
}
/* 虹膜 — 柔和薰衣草紫 */
.iris {
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  background: radial-gradient(circle at 45% 42%,
    rgba(200, 180, 255, 0.55) 0%,
    rgba(160, 140, 240, 0.4) 40%,
    rgba(120, 100, 200, 0.2) 70%,
    rgba(80, 60, 160, 0.1) 100%
  );
}
/* 瞳孔 — 大而明亮 */
.pupil {
  position: absolute;
  width: 28px; height: 28px;
  top: 48%; left: 48%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle at 45% 40%,
    rgba(255, 255, 255, 1) 0%,
    rgba(220, 240, 255, 0.97) 25%,
    rgba(170, 210, 255, 0.9) 50%,
    rgba(130, 180, 255, 0.8) 100%
  );
  box-shadow:
    0 0 22px rgba(150, 210, 255, 0.8),
    0 0 8px rgba(255, 255, 255, 0.5);
}
/* 高光 — 大（偏左上 → 可爱天真感） */
.shine {
  position: absolute;
  width: 14px; height: 14px;
  top: 12px; left: 12px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
}
/* 高光 — 小（偏右下） */
.shine-sm {
  position: absolute;
  width: 6px; height: 6px;
  bottom: 16px; right: 14px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.45);
  box-shadow: 0 0 3px rgba(255, 255, 255, 0.3);
}

/* ===== 微笑 — 柔和可爱 ===== */
.mouth-area {
  position: absolute;
  top: 53%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
}
.smile {
  width: 40px; height: 16px;
  border-bottom: 3px solid rgba(120, 220, 255, 0.6);
  border-radius: 0 0 50% 50%;
  transition: all 0.3s;
  filter: drop-shadow(0 0 6px rgba(100, 200, 255, 0.4));
}
.smile.hide { opacity: 0; transform: scaleY(0); }
.flat {
  position: absolute;
  top: 6px; left: 50%;
  transform: translateX(-50%) scaleX(0);
  width: 24px; height: 0;
  border-top: 2.5px solid rgba(100,200,255,0.35);
  transition: all 0.3s;
}
.flat.show { transform: translateX(-50%) scaleX(1); }
</style>
