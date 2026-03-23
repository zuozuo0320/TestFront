import { ref, onMounted, onUnmounted } from 'vue'

/**
 * Canvas 粒子动画 Composable
 *
 * @param count - 粒子数量，默认 80
 * @returns canvas ref（需绑定到 canvas 元素）
 *
 * @example
 * const { canvasRef } = useParticles()
 * // <canvas ref="canvasRef" class="login-particles"></canvas>
 */
export function useParticles(count = 80) {
  const canvasRef = ref<HTMLCanvasElement | null>(null)
  let animId = 0

  function init() {
    const canvas = canvasRef.value
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = (canvas.width = canvas.offsetWidth)
    let h = (canvas.height = canvas.offsetHeight)
    const particles: { x: number; y: number; vx: number; vy: number; r: number }[] = []

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 1.5 + 0.5,
      })
    }

    function draw() {
      ctx.clearRect(0, 0, w, h)
      for (let i = 0; i < count; i++) {
        const p = particles[i]
        if (!p) continue
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.fill()
        for (let j = i + 1; j < count; j++) {
          const q = particles[j]
          if (!q) continue
          const dx = p.x - q.x
          const dy = p.y - q.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 120) {
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(q.x, q.y)
            ctx.strokeStyle = `rgba(255,255,255,${0.08 * (1 - dist / 120)})`
            ctx.stroke()
          }
        }
      }
      animId = requestAnimationFrame(draw)
    }

    draw()

    const onResize = () => {
      w = canvas.width = canvas.offsetWidth
      h = canvas.height = canvas.offsetHeight
    }
    window.addEventListener('resize', onResize)
  }

  onMounted(() => {
    setTimeout(() => init(), 0)
  })

  onUnmounted(() => {
    cancelAnimationFrame(animId)
  })

  return { canvasRef }
}
