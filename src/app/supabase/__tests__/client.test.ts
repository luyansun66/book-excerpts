// @vitest-environment jsdom
// 前端连的是本站的 /api/supa（同源反代），不是 supabase.co。
//
// 这里盯的不是「拼出来的 URL 好不好看」，而是两件会真出事的事：
//   1. 主机名一变，supabase-js 的默认 storageKey 会跟着变 —— 那会把所有已登录用户
//      当场登出。所以 storageKey 必须写死成原来那个值。
//   2. 非 http(s) 环境（file:// 之类）没有同源后端，要退回到直连项目地址。
import { describe, expect, it } from 'vitest'
import { supabase, describeAuthError, SUPABASE_STORAGE_KEY } from '../client'

/**
 * storageKey 在类型定义里是 protected（只给 GoTrueClient 内部看），但运行时它确实挂在
 * auth 实例上 —— 而「这个值有没有被写死」正是要盯的事，所以照上面读 supabaseUrl 的
 * 老办法转一下类型，不用 any 蒙混过去。
 */
function authStorageKey(): string {
  return (supabase.auth as unknown as { storageKey: string }).storageKey
}

describe('supabase 客户端', () => {
  it('走本站同源反代', () => {
    expect(window.location.origin).toBe('http://localhost:3000')
    expect((supabase as unknown as { supabaseUrl: string }).supabaseUrl).toBe(
      'http://localhost:3000/api/supa',
    )
  })

  it('storageKey 保持迁移前那个值，老用户不会被登出', () => {
    expect(authStorageKey()).toBe('sb-vnbudeahnuysdbqxtzgk-auth-token')
    expect(SUPABASE_STORAGE_KEY).toBe(authStorageKey())
  })
})

describe('describeAuthError', () => {
  it('把三种浏览器的网络失败文案翻成人话', () => {
    for (const raw of [
      'Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'Load failed',
      'fetch failed',
    ]) {
      expect(describeAuthError(new Error(raw))).toContain('连不上服务器')
    }
  })

  it('账号密码之类的真错误原样透出，别被改写成网络问题', () => {
    expect(describeAuthError(new Error('Invalid login credentials'))).toBe('Invalid login credentials')
  })
})
