import { createClient } from '@supabase/supabase-js';

const supabaseAnonKey = 'sb_publishable_N6-EymL11gca5YTCAW9yAA_C0Hc-Az0';

/** Supabase 项目的真实地址，反代的目标（对应 functions/api/supa/[[path]].ts）。 */
const SUPABASE_PROJECT_URL = 'https://vnbudeahnuysdbqxtzgk.supabase.co';
const SUPABASE_PROXY_PATH = '/api/supa';

/**
 * 登录态的 localStorage key。supabase-js 默认按 URL 主机名推（`sb-<主机名第一段>-auth-token`），
 * 改走反代后主机名从 vnbudeahnuysdbqxtzgk 变成自己的域名，默认 key 会跟着变 ——
 * 那等于把所有已登录用户当场登出。写死成原来那个 key，换地址时会话原地保留。
 */
export const SUPABASE_STORAGE_KEY = 'sb-vnbudeahnuysdbqxtzgk-auth-token';

/**
 * supabase-js 只是把 supabaseUrl 当字符串前缀拼（`${url}/auth/v1/token`、`${url}/rest/v1/books`），
 * 所以这里可以直接指到本站的 /api/supa，请求就变成同源的，由 Pages Function 转发给 Supabase。
 *
 * 为什么不直连 supabase.co：那条链路在国内不是「通 / 不通」，而是看设备、看网络 ——
 * 2026-10 的反馈是手机能登、电脑报 Failed to fetch，而页面本身打得开。走本站域名后，
 * 登录/同步只要求「能打开本站」。
 */
function resolveSupabaseUrl(): string {
  // 非浏览器环境（单测）没有 location，直接用项目地址
  if (typeof window === 'undefined') return SUPABASE_PROJECT_URL;
  const { protocol, origin } = window.location;
  // 只在 http(s) 下走反代：file:// 之类没有同源后端可以转发
  if (protocol !== 'http:' && protocol !== 'https:') return SUPABASE_PROJECT_URL;
  return origin + SUPABASE_PROXY_PATH;
}

export const supabase = createClient(resolveSupabaseUrl(), supabaseAnonKey, {
  auth: { storageKey: SUPABASE_STORAGE_KEY },
});

/**
 * 浏览器对「fetch 压根没拿到响应」只有三种说法，且都不带原因：
 * Chrome `Failed to fetch`、Firefox `NetworkError when attempting to fetch resource.`、
 * Safari `Load failed`。原样甩给用户等于没说 —— 他会以为是账号密码错了，
 * 然后反复重试。这里统一翻成「该换网络了」。
 */
const NETWORK_FAILURE = /failed to fetch|networkerror|load failed|fetch failed/i;

export function describeAuthError(e: unknown): string {
  const message = (e as { message?: string })?.message || String(e);
  if (NETWORK_FAILURE.test(message)) {
    return '连不上服务器：请检查网络后重试（换个网络，或关掉广告拦截 / 安全软件的网页防护）';
  }
  return message;
}

export interface SyncUser {
  id: string;
  email: string;
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
  // If session is returned, user is auto-confirmed
  if (data.session) return data;
  // Otherwise, sign them in immediately
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return signInData;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getCurrentUser(): Promise<SyncUser | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email! };
}
