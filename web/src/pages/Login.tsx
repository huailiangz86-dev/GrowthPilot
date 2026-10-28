import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import { loginDestination } from '../learning/knowledgeNavigation';

type LoginTab = 'phone' | 'wechat';

interface AuthResult {
  access_token: string;
  user_id: string;
  is_new_user?: boolean;
}

export default function Login() {
  const navigate = useNavigate();
  const nextPage = new URLSearchParams(location.search).get('next');
  const afterLogin = loginDestination(nextPage);
  const [tab, setTab] = useState<LoginTab>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [wxQrUrl, setWxQrUrl] = useState('');
  const [wxPolling, setWxPolling] = useState(false);

  const [authOptions, setAuthOptions] = useState<{development_login: boolean; phone_login: boolean; wechat_web_login: boolean} | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const sendingRef = useRef(false);
  const smsTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrSequence = useRef(0);
  const localDevelopment = import.meta.env.DEV && ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);

  const stopPolling = () => {
    qrSequence.current++;
    if (pollTimer.current) clearInterval(pollTimer.current);
    if (pollTimeout.current) clearTimeout(pollTimeout.current);
    setWxPolling(false);
  };
  useEffect(() => {
    let active = true;
    const sequence = qrSequence;
    void api.get<NonNullable<typeof authOptions>>('/auth/options').then(value => {if (active) setAuthOptions(value);}).catch(() => {});
    const params = new URLSearchParams(window.location.search);
    if (params.has('token')) {
      params.delete('token');
      window.history.replaceState({}, '', `/login${params.size ? `?${params}` : ''}`);
      setError('旧的登录回执已失效，请重新发起扫码登录。');
    } else if (params.get('wx') === 'confirmed') {
      setNotice('微信已确认，请回到发起扫码的页面继续。');
    } else if (params.has('error')) {
      setError('本次微信登录未完成，请重新加载二维码。');
    }
    return () => {
      active = false; sequence.current++;
      if (smsTimer.current) clearInterval(smsTimer.current);
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (pollTimeout.current) clearTimeout(pollTimeout.current);
    };
  }, []);

  const handleSendCode = async () => {
    if (sendingRef.current || countdown > 0) return;
    if (!phone.match(/^1[3-9]\d{9}$/)) {
      setError('请输入正确的手机号');
      return;
    }
    sendingRef.current = true; setSendingCode(true);
    setError('');
    try {
      await api.post('/auth/sms/send-code', { phone });
      setCodeSent(true);
      setCountdown(60);
      if (smsTimer.current) clearInterval(smsTimer.current);
      smsTimer.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) { if (smsTimer.current) clearInterval(smsTimer.current); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '发送失败');
    } finally {sendingRef.current = false; setSendingCode(false);}
  };

  const handlePhoneLogin = async () => {
    if (!phone.match(/^1[3-9]\d{9}$/)) {
      setError('请输入正确的手机号');
      return;
    }
    if (code.length !== 6) {
      setError('请输入6位验证码');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.post<AuthResult>('/auth/phone-login', { phone, code });
      const token = res.access_token;
      if (token) {
        localStorage.setItem('gp_token', token);
        navigate(afterLogin);
      } else {
        setError('登录失败，请重试');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '登录失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDevLogin = async () => {
    if (!localDevelopment || !authOptions?.development_login) {setError('当前环境未开启开发登录'); return;}
    setLoading(true);
    setError('');
    try {
      const trial = new URLSearchParams(location.search).get('trial');
      const isolatedTrial = import.meta.env.DEV && ['127.0.0.1', 'localhost'].includes(location.hostname) && ['c1', 'd1', 'd2', 'd3'].includes(trial || '');
      const res = await api.post<AuthResult>('/auth/dev-login', { code: isolatedTrial ? `dev_${trial}_acceptance` : 'dev_auto_login' });
      const token = res.access_token;
      if (token) {
        localStorage.setItem('gp_token', token);
        navigate(afterLogin);
      } else {
        setError('登录失败，请重试');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '登录失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const loadWxQr = async () => {
    stopPolling();
    const sequence = qrSequence.current;
    setWxQrUrl(''); setError('');
    try {
      const res = await api.get<{qr_url: string; state: string}>('/auth/wx-web/qr-url');
      if (sequence !== qrSequence.current) return;
      if (!res.qr_url || !res.state) {setError('微信登录未配置，请使用其他登录方式'); return;}
      setWxQrUrl(res.qr_url);
      startPolling(res.state, sequence);
    } catch (error) {
      if (sequence === qrSequence.current) setError(error instanceof Error ? error.message : '获取二维码失败');
    }
  };

  const startPolling = (state: string, sequence: number) => {
    setWxPolling(true);
    let reading = false;
    pollTimer.current = setInterval(async () => {
      if (reading || sequence !== qrSequence.current) return;
      reading = true;
      try {
        const res = await api.get<{status: string; token?: string}>('/auth/wx-web/poll', {state});
        if (sequence !== qrSequence.current) return;
        if (res.status === 'ok' && res.token) {
          stopPolling();
          localStorage.setItem('gp_token', res.token);
          navigate(afterLogin);
        } else if (res.status === 'expired') {
          stopPolling(); setError('二维码已过期，请刷新');
        }
      } catch (error) {
        if (sequence === qrSequence.current) {stopPolling(); setError(error instanceof Error ? error.message : '登录状态读取失败，请刷新二维码');}
      } finally {reading = false;}
    }, 2000);
    pollTimeout.current = setTimeout(() => {
      if (sequence === qrSequence.current) {stopPolling(); setError('二维码已过期，请刷新');}
    }, 300000);
  };

  return (
    <div style={pageStyle}>
      <div style={bgOverlayStyle} />
      <div style={cardContainerStyle}>
        {/* Logo */}
        <div style={logoSectionStyle}>
          <Link to="/" style={logoLinkStyle}>
            <span style={logoIconStyle}>🚀</span>
            <span style={logoTextStyle}>GrowthPilot</span>
          </Link>
          <p style={logoSubtitleStyle}>你的个人成长工作台，正在慢慢理解你</p>
        </div>

        {/* Login card */}
        <div style={cardStyle}>
          {/* Tabs */}
          <div style={tabBarStyle}>
            <button
              type="button"
              style={tab === 'phone' ? activeTabStyle : tabBtnStyle}
              onClick={() => { stopPolling(); setTab('phone'); setError(''); }}
            >
              手机号登录
            </button>
            <button
              type="button"
              style={tab === 'wechat' ? activeTabStyle : tabBtnStyle}
              onClick={() => { setTab('wechat'); setError(''); }}
            >
              微信扫码登录
            </button>
          </div>

          {/* Error */}
          {error && (
            <div role="alert" style={errorStyle}>{error}</div>
          )}
          {notice && <p role="status" style={qrHintStyle}>{notice}</p>}

          {tab === 'phone' && authOptions?.phone_login === false && <p role="status" style={qrHintStyle}>短信登录尚未配置，请使用其他登录方式。</p>}
          {/* Phone tab */}
          {tab === 'phone' && (
            <div style={formStyle}>
              <div style={inputGroupStyle}>
                <label style={labelStyle}>手机号</label>
                <input
                  type="tel"
                  placeholder="请输入手机号"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={inputStyle}
                  maxLength={11}
                />
              </div>
              <div style={inputGroupStyle}>
                <label style={labelStyle}>验证码</label>
                <div style={codeRowStyle}>
                  <input
                    type="text"
                    placeholder="请输入验证码"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                    maxLength={6}
                  />
                  <button
                    type="button"
                    style={{
                      ...codeBtnStyle,
                      opacity: countdown > 0 ? 0.5 : 1,
                      cursor: countdown > 0 ? 'default' : 'pointer',
                    }}
                    onClick={handleSendCode}
                    disabled={sendingCode || countdown > 0 || authOptions?.phone_login === false}
                  >
                    {sendingCode ? '发送中…' : countdown > 0 ? `${countdown}s` : codeSent ? '重新发送' : '获取验证码'}
                  </button>
                </div>
              </div>
              <button
                type="button"
                style={{
                  ...loginBtnStyle,
                  opacity: loading ? 0.6 : 1,
                }}
                onClick={handlePhoneLogin}
                disabled={loading}
              >
                {loading ? '登录中...' : '登录'}
              </button>
            </div>
          )}

          {/* WeChat tab */}
          {tab === 'wechat' && (
            <div style={wechatAreaStyle}>
              <div style={qrPlaceholderStyle}>
                <p style={qrTextStyle}>微信扫码登录</p>
                <p style={qrSubStyle}>请使用微信扫描二维码登录</p>

                {wxQrUrl ? (
                  <>
                    <div style={qrBoxStyle}>
                      <iframe
                        src={wxQrUrl}
                        style={{ width: 200, height: 200, border: 'none' }}
                        title="微信登录"
                      />
                    </div>
                    <p style={qrHintStyle}>
                      {wxPolling ? '等待扫码中...' : '二维码已加载'}
                    </p>
                    <button type="button" style={{ ...codeBtnStyle, marginTop: 10 }} onClick={loadWxQr}>
                      刷新二维码
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ ...qrBoxStyle, padding: 30, flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#43a047" strokeWidth="2">
                        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
                      </svg>
                      <button type="button" style={{ ...loginBtnStyle, background: '#43a047', boxShadow: '0 4px 15px rgba(67,160,71,0.3)', padding: '10px 30px', fontSize: 14 }} onClick={loadWxQr}>
                        加载微信二维码
                      </button>
                    </div>
                    <p style={qrHintStyle}>
                      需配置微信开放平台网站应用 AppID 后生效
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {localDevelopment && authOptions?.development_login && <>
          {/* Divider */}
          <div style={dividerStyle}>
            <span style={dividerLineStyle} />
            <span style={dividerTextStyle}>开发调试</span>
            <span style={dividerLineStyle} />
          </div>

          {/* Dev login */}
          <button
            type="button"
            style={{
              ...devBtnStyle,
              opacity: loading ? 0.6 : 1,
            }}
            onClick={handleDevLogin}
            disabled={loading}
          >
            {loading ? '登录中...' : '开发者登录 (Dev Mode)'}
          </button>
          </>}
        </div>

        <p style={footerTextStyle}>
          登录即表示同意 <a href="#" style={linkStyle}>用户协议</a> 和 <a href="#" style={linkStyle}>隐私政策</a>
        </p>
      </div>
    </div>
  );
}

/* ── Styles ── */

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#205456',
  position: 'relative',
  padding: '40px 20px',
};

const bgOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'transparent',
  pointerEvents: 'none',
};

const cardContainerStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  width: '100%',
  maxWidth: 420,
};

const logoSectionStyle: React.CSSProperties = {
  textAlign: 'center',
  marginBottom: 32,
};

const logoLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  textDecoration: 'none',
  color: '#fff',
};

const logoIconStyle: React.CSSProperties = {
  fontSize: 36,
};

const logoTextStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: -0.5,
};

const logoSubtitleStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.6)',
  fontSize: 14,
  marginTop: 8,
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: '32px 28px',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 0,
  marginBottom: 24,
  borderBottom: '2px solid #f0f0f0',
};

const tabBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px 0',
  border: 'none',
  background: 'none',
  fontSize: 15,
  fontWeight: 500,
  color: '#999',
  cursor: 'pointer',
  borderBottom: '2px solid transparent',
  marginBottom: -2,
  transition: 'color 0.2s',
  fontFamily: 'inherit',
};

const activeTabStyle: React.CSSProperties = {
  ...tabBtnStyle,
  color: '#e74c3c',
  fontWeight: 600,
  borderBottomColor: '#e74c3c',
};

const errorStyle: React.CSSProperties = {
  background: '#fff2f0',
  border: '1px solid #ffccc7',
  color: '#cf1322',
  padding: '10px 14px',
  borderRadius: 8,
  fontSize: 14,
  marginBottom: 16,
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
};

const inputGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: '#555',
};

const inputStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: 10,
  border: '1px solid #e0e0e0',
  fontSize: 15,
  outline: 'none',
  transition: 'border-color 0.2s',
  background: '#fafafa',
};

const codeRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
};

const codeBtnStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: 10,
  border: '1px solid #e74c3c',
  background: '#fff',
  color: '#e74c3c',
  fontSize: 14,
  fontWeight: 500,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.2s',
};

const loginBtnStyle: React.CSSProperties = {
  padding: '14px 0',
  borderRadius: 10,
  border: 'none',
  background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
  color: '#fff',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'opacity 0.2s, transform 0.2s',
  boxShadow: '0 4px 15px rgba(231,76,60,0.3)',
  fontFamily: 'inherit',
};

const wechatAreaStyle: React.CSSProperties = {
  padding: '10px 0 20px',
};

const qrPlaceholderStyle: React.CSSProperties = {
  textAlign: 'center',
};

// qrIconStyle removed (unused)

const qrTextStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: '#333',
  margin: '0 0 4px',
};

const qrSubStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#999',
  margin: '0 0 20px',
};

const qrBoxStyle: React.CSSProperties = {
  display: 'inline-flex',
  padding: 16,
  background: '#f8f8f8',
  borderRadius: 12,
  border: '1px solid #e8e8e8',
  marginBottom: 12,
};

// qrPatternStyle removed (unused)

const qrHintStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#bbb',
  margin: 0,
};

const dividerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  margin: '24px 0 16px',
};

const dividerLineStyle: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: '#e8e8e8',
};

const dividerTextStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#bbb',
  whiteSpace: 'nowrap',
};

const devBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 0',
  borderRadius: 10,
  border: '1px dashed #ccc',
  background: '#fafafa',
  color: '#888',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'background 0.2s, border-color 0.2s',
  fontFamily: 'inherit',
};

const footerTextStyle: React.CSSProperties = {
  textAlign: 'center',
  fontSize: 13,
  color: 'rgba(255,255,255,0.45)',
  marginTop: 20,
};

const linkStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.65)',
  textDecoration: 'underline',
};
