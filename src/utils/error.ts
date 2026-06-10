/**
 * 错误处理通用工具
 *
 * 职责：消除 composable / view 层中大量重复的 `catch (e: any)` 与
 * `e?.response?.data?.message || '默认失败'` 模式，统一错误消息提取，
 * 同时提供 Element Plus MessageBox 取消判断与 Axios AbortError 判断。
 *
 * 使用约束：
 *   - 只在 composable 层使用，API 层保持无 UI 逻辑（见 AGENTS.md 前端铁律）
 *   - 永远把 catch 捕获物声明成 `unknown`，再用本模块的工具收窄
 *
 * @module utils/error
 */

/** 后端字段级校验错误。 */
export interface FieldError {
  field: string
  message: string
}

interface ErrorResponseData {
  message?: unknown
  error?: unknown
  errors?: unknown
}

function isFieldError(value: unknown): value is FieldError {
  if (typeof value !== 'object' || value === null) return false
  const maybe = value as { field?: unknown; message?: unknown }
  return typeof maybe.field === 'string' && typeof maybe.message === 'string'
}

/**
 * 从未知错误对象中提取用户可读的消息。
 *
 * 优先顺序：
 *   1. 后端响应体 `{ message }`（经 Axios 拦截器解包前的形态）
 *   2. 后端字段级 errors 中的第一条错误
 *   3. 后端响应体 `{ error }`（兼容旧版接口）
 *   4. Error 实例的 `message`
 *   5. 传入的兜底文案
 *
 * @param err      - 未知错误，通常来自 try/catch 的捕获物
 * @param fallback - 兜底文案，默认 "操作失败"
 */
export function extractErrorMessage(err: unknown, fallback = '操作失败'): string {
  if (!err) return fallback

  if (typeof err === 'object' && err !== null) {
    // Axios 风格：err.response.data.{message|error}
    const maybe = err as {
      response?: { data?: ErrorResponseData }
      message?: unknown
    }
    const respMsg = maybe.response?.data?.message
    if (typeof respMsg === 'string' && respMsg.trim()) return respMsg

    const fieldError = extractFieldErrors(err)[0]
    if (fieldError) return fieldError.message

    const respErr = maybe.response?.data?.error
    if (typeof respErr === 'string' && respErr.trim()) return respErr

    if (typeof maybe.message === 'string' && maybe.message.trim()) return maybe.message
  }

  if (typeof err === 'string' && err.trim()) return err

  return fallback
}

/**
 * 从未知错误对象中提取后端字段级校验错误。
 *
 * 兼容后端标准响应 `{ errors: [{ field, message }] }`，也兼容拦截器或测试中
 * 直接把同结构挂在错误对象顶层的情况。
 */
export function extractFieldErrors(err: unknown): FieldError[] {
  if (typeof err !== 'object' || err === null) return []
  const maybe = err as { response?: { data?: ErrorResponseData }; errors?: unknown }
  const rawErrors = maybe.response?.data?.errors ?? maybe.errors
  if (!Array.isArray(rawErrors)) return []
  return rawErrors.filter(isFieldError).map((item) => ({
    field: item.field,
    message: item.message,
  }))
}

/**
 * 判断错误是否为 Element Plus MessageBox / MessageBoxConfirm 的用户取消动作。
 *
 * Element Plus 在用户点击"取消"或关闭按钮时 reject 字符串 `'cancel'` 或 `'close'`，
 * 这并不是真正的业务错误，不应弹出失败提示。
 */
export function isElMessageBoxCancel(err: unknown): boolean {
  if (err === 'cancel' || err === 'close') return true
  if (typeof err === 'object' && err !== null) {
    const maybe = err as { toString?: () => string }
    const str = typeof maybe.toString === 'function' ? maybe.toString() : ''
    return str === 'cancel' || str === 'close'
  }
  return false
}

/**
 * 判断错误是否为主动取消的请求（AbortController.abort）。
 *
 * Axios 将 abort 错误包装为 `{ name: 'CanceledError', code: 'ERR_CANCELED' }`，
 * 原生 fetch 则抛出 `DOMException` 且 `name === 'AbortError'`。
 * 搜索类接口在切换关键词时会主动取消前一次请求，此错误必须静默。
 */
export function isAbortError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const maybe = err as { name?: unknown; code?: unknown }
  if (maybe.name === 'AbortError' || maybe.name === 'CanceledError') return true
  if (maybe.code === 'ERR_CANCELED') return true
  return false
}
