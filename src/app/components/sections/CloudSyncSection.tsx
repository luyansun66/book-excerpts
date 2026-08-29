import { useState, useEffect } from 'react';
import { Cloud, CloudOff, LogIn, LogOut, UserPlus } from 'lucide-react';
import { supabase, signUp, signIn, signOut, getCurrentUser } from '../../supabase/client';
import { pushAllData, pullAllData } from '../../supabase/sync';
import { useApp } from '../../store';
import { exportAllData, importAllData } from '../../db';

export default function CloudSyncSection() {
  const { refreshData } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    getCurrentUser().then(u => setLoggedIn(!!u));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setLoggedIn(true);
        setMsg('✅ 登录成功');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) return;
    try {
      setMsg('正在登录…');
      await signIn(email, password);
      setMsg('✅ 登录成功');
    } catch (e: any) {
      setMsg('❌ 登录失败：' + (e?.message || String(e)));
    }
  };

  const handleSignUp = async () => {
    if (!email || !password) return;
    if (password.length < 6) {
      setMsg('密码至少 6 位');
      return;
    }
    try {
      setMsg('正在注册…');
      await signUp(email, password);
      setMsg('✅ 注册成功，已自动登录');
    } catch (e: any) {
      setMsg('❌ 注册失败：' + (e?.message || String(e)));
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setMsg('');
    try {
      const data = await exportAllData();
      await pushAllData(data.categories, data.books, data.quotes);
      setMsg('✅ 同步成功');
    } catch (e: any) {
      setMsg('❌ 同步失败：' + (e?.message || String(e)));
    }
    setSyncing(false);
  };

  const handlePull = async () => {
    setSyncing(true);
    setMsg('');
    try {
      const remote = await pullAllData();
      // 检查数据完整性
      const missingCategoryBooks = remote.books.filter(b => !b.categoryId);
      const missingCategoryCount = missingCategoryBooks.length;
      await importAllData({ exportDate: '', version: 1, ...remote });
      refreshData();
      if (missingCategoryCount > 0) {
        setMsg('⚠️ 已从云端恢复，但 ' + missingCategoryCount + ' 本书的分类数据丢失，已自动归入默认分类');
      } else {
        setMsg('✅ 已从云端恢复');
      }
    } catch (e: any) {
      setMsg('❌ 恢复失败：' + (e?.message || String(e)));
    }
    setSyncing(false);
  };

  const handleLogout = async () => {
    await signOut();
    setLoggedIn(false);
    setMsg('已退出登录');
  };

  return (
    <div>
      <div style={{
        background: 'var(--color-bg-card)',
        borderRadius: 14,
        padding: '28px 16px',
        border: '1px solid var(--color-border-light)',
        boxShadow: 'var(--shadow-card)',
        marginTop: 4,
        marginBottom: 12,
      }}>
        {!loggedIn ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', fontFamily: '-apple-system, sans-serif' }}>
              <Cloud size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              云同步
            </div>
            <input
              type="email"
              placeholder="邮箱地址"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                fontSize: 12,
                width: 220,
                textAlign: 'center',
                fontFamily: '-apple-system, sans-serif',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
              }}
            />
            <input
              type="password"
              placeholder="密码（至少 6 位）"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                fontSize: 12,
                width: 220,
                textAlign: 'center',
                fontFamily: '-apple-system, sans-serif',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
              }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleLogin}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 24px', borderRadius: 8, border: '1px solid #d4c4a0',
                  background: '#fffcf5', color: 'var(--color-text-secondary)', fontSize: 12,
                  fontWeight: 600, fontFamily: '-apple-system, sans-serif', cursor: 'pointer',
                }}
              >
                <LogIn size={13} strokeWidth={1.8} />
                登录
              </button>
              <button
                onClick={handleSignUp}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 24px', borderRadius: 8, border: '1px solid #d4c4a0',
                  background: '#fffcf5', color: 'var(--color-text-secondary)', fontSize: 12,
                  fontWeight: 600, fontFamily: '-apple-system, sans-serif', cursor: 'pointer',
                }}
              >
                <UserPlus size={13} strokeWidth={1.8} />
                注册
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', fontFamily: '-apple-system, sans-serif' }}>
              <Cloud size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              云同步
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleSync}
                disabled={syncing}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 24px', borderRadius: 8, border: '1px solid #d4c4a0',
                  background: '#fffcf5', color: 'var(--color-text-secondary)', fontSize: 12,
                  fontWeight: 600, fontFamily: '-apple-system, sans-serif', cursor: syncing ? 'not-allowed' : 'pointer',
                  opacity: syncing ? 0.6 : 1,
                }}
              >
                <Cloud size={13} strokeWidth={1.8} />
                {syncing ? '同步中…' : '备份到云端'}
              </button>
              <button
                onClick={handlePull}
                disabled={syncing}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 24px', borderRadius: 8, border: '1px solid #d4c4a0',
                  background: '#fffcf5', color: 'var(--color-text-secondary)', fontSize: 12,
                  fontWeight: 600, fontFamily: '-apple-system, sans-serif', cursor: syncing ? 'not-allowed' : 'pointer',
                  opacity: syncing ? 0.6 : 1,
                }}
              >
                <CloudOff size={13} strokeWidth={1.8} />
                从云端恢复
              </button>
            </div>
            <button
              onClick={handleLogout}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '6px 16px', borderRadius: 6, border: 'none',
                background: 'transparent', color: 'var(--color-text-muted)', fontSize: 11,
                fontFamily: '-apple-system, sans-serif', cursor: 'pointer',
              }}
            >
              <LogOut size={11} strokeWidth={1.8} />
              退出登录
            </button>
          </div>
        )}
        {msg && (
          <div style={{
            marginTop: 10,
            fontSize: 11,
            color: msg.startsWith('✅') ? '#3a7a3a' : msg.startsWith('❌') ? '#c0392b' : 'var(--color-text-muted)',
            textAlign: 'center',
            fontFamily: '-apple-system, sans-serif',
            lineHeight: 1.5,
          }}>
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}
