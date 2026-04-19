/**
 * 标签颜色互斥分配工具
 *
 * 提供两个核心函数：
 *   - nextAvailableColor: 获取下一个未被占用的预设色（用于新建单个标签）
 *   - allocateBatchColors: 为批量创建生成互斥颜色列表（用于批量创建）
 *
 * 颜色比较均不区分大小写，确保 #3b82f6 和 #3B82F6 被视为相同颜色。
 * 当所有预设色均被占用时，会循环复用预设色序列。
 */

/** 预设颜色序列（12 色）：蓝、绿、琥、红、紫、粉、青、橙、水鸭绿、靖蓝、青柠、石墨 */
export const presetColors = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#F97316',
  '#14B8A6',
  '#6366F1',
  '#84CC16',
  '#78716C',
]

/**
 * 获取下一个未被占用的预设颜色
 *
 * 遍历预设色序列，返回第一个不在 usedColors 中的颜色。
 * 如果所有预设色均被占用，则按 usedColors 长度取模循环复用。
 *
 * @param usedColors - 已占用的颜色列表（比较时不区分大小写）
 * @returns 未使用的颜色（#RRGGBB 格式）
 */
export function nextAvailableColor(usedColors: string[]): string {
  // 将已用颜色统一转大写后放入 Set，方便快速查找
  const usedSet = new Set(usedColors.map((c) => c.toUpperCase()))
  for (const c of presetColors) {
    if (!usedSet.has(c.toUpperCase())) return c
  }
  // 所有预设色均已占用，循环复用
  return presetColors[usedColors.length % presetColors.length] ?? '#3B82F6'
}

/**
 * 为批量创建生成互斥颜色列表
 *
 * 策略：
 *   1. 从预设色中排除已占用的颜色，得到可用色池
 *   2. 如果可用色池为空（所有颜色都已被用），回退到完整预设色序列
 *   3. 按顺序循环取色（当需求量超过可用数时自动循环复用）
 *
 * @param count      - 需要分配的颜色数量
 * @param usedColors - 已占用的颜色列表（比较时不区分大小写）
 * @returns 分配的颜色数组（长度 = count）
 */
export function allocateBatchColors(count: number, usedColors: string[]): string[] {
  const usedSet = new Set(usedColors.map((c) => c.toUpperCase()))
  // 过滤出未被占用的预设色作为可用色池
  const available = presetColors.filter((c) => !usedSet.has(c.toUpperCase()))
  // 可用色池为空时回退到完整预设色序列
  const pool = available.length > 0 ? available : presetColors
  // 按顺序循环取色
  return Array.from({ length: count }, (_, i) => pool[i % pool.length] ?? '#3B82F6')
}
