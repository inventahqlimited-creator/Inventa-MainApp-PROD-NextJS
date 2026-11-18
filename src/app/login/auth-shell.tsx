// src/app/login/auth-shell.tsx — the sign-in look (dark brand panel on the left, form card on the right),
// shared by the login page and the invite / password-reset confirmation page.
import type { ReactNode } from 'react'

export const AUTH_CSS = `
        .login-page { display: flex; height: 100vh; font-family: var(--font-ui); background: var(--slate); }
        .left-panel {
          flex: 1; background: var(--slate); display: flex; flex-direction: column;
          justify-content: space-between; padding: 48px 93px; overflow: hidden; position: relative;
        }
        .left-panel::before {
          content: ''; position: absolute; inset: 0;
          background-image: linear-gradient(rgba(13,148,136,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(13,148,136,0.18) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse 80% 80% at 30% 50%, black 30%, transparent 80%);
          -webkit-mask-image: radial-gradient(ellipse 80% 80% at 30% 50%, black 30%, transparent 80%);
        }
        .left-panel::after {
          content: ''; position: absolute; width: 600px; height: 600px; border-radius: 50%;
          background: radial-gradient(circle, rgba(13,148,136,0.18) 0%, transparent 65%);
          top: -100px; left: -200px; pointer-events: none;
        }
        .left-top { position: relative; z-index: 2; }
        .left-body { position: relative; z-index: 2; flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 0; }
        .left-bottom { position: relative; z-index: 2; font-size: 12px; color: rgba(255,255,255,0.25); }
        .tagline-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 0.14em; color: var(--teal-light); margin-bottom: 16px; opacity: 0.7; text-transform: uppercase; }
        .tagline { font-family: var(--font-display); font-size: 61px; font-weight: 800; line-height: 1.08; letter-spacing: -0.03em; color: white; max-width: 702px; }
        .tagline em { font-style: normal; color: var(--teal-light); }
        .tagline-sub { font-size: 15px; color: rgba(255,255,255,0.45); margin-top: 20px; line-height: 1.6; max-width: 460px; }
        .stat-row { display: flex; gap: 36px; margin-top: 40px; }
        .stat { display: flex; flex-direction: column; gap: 4px; }
        .stat-val { font-family: var(--font-display); font-size: 22px; font-weight: 800; letter-spacing: -0.03em; color: white; }
        .stat-label { font-size: 11.5px; color: rgba(255,255,255,0.35); font-weight: 500; }
        .stat-divider { width: 1px; background: rgba(255,255,255,0.1); align-self: stretch; margin: 4px 0; }
        .right-panel {
          width: 597px; flex-shrink: 0; background: var(--gray-50);
          display: flex; align-items: center; justify-content: center;
          padding: 40px 20px; position: relative;
        }
        .right-panel::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px;
          background: linear-gradient(90deg, var(--teal) 0%, var(--teal-light) 100%);
        }
        .form-card { width: 100%; max-width: 380px; }
        .form-welcome { font-family: var(--font-display); font-size: 24px; font-weight: 800; letter-spacing: -0.025em; color: var(--slate); margin-bottom: 6px; }
        .form-sub { font-size: 13.5px; color: var(--gray-400); margin-bottom: 32px; }
        .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
        .field label { font-size: 12px; font-weight: 600; color: var(--slate); }
        .field input { height: 47px; padding: 0 14px; border: 1.5px solid var(--gray-200); border-radius: 13px; background: white; font-family: var(--font-ui); font-size: 14px; color: var(--gray-900); outline: none; width: 100%; transition: border-color 150ms, box-shadow 150ms; }
        .field input:focus { border-color: var(--teal); box-shadow: 0 0 0 3px rgba(13,148,136,0.12); }
        .pw-wrap { position: relative; }
        .pw-wrap input { padding-right: 44px; }
        .pw-toggle { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--gray-400); display: flex; align-items: center; }
        .remforg { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
        .remember { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: var(--gray-400); }
        .remember input { accent-color: var(--teal); }
        .forgot-link { font-size: 13px; color: var(--teal); background: none; border: none; cursor: pointer; font-weight: 500; }
        .btn-signin { width: 100%; height: 48px; background: var(--teal); color: white; border: none; border-radius: 13px; font-family: var(--font-display); font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 14px rgba(13,148,136,0.28); transition: background 150ms; }
        .btn-signin:hover { background: var(--teal-hover); }
        .btn-signin:disabled { opacity: 0.7; cursor: not-allowed; }
        .notice-box { background: #F0FDFA; border: 1.5px solid #99F6E4; border-radius: 13px; padding: 12px 14px; font-size: 13px; color: #0F766E; margin-bottom: 18px; }
        .error-box { background: #FEF2F2; border: 1.5px solid #FECACA; border-radius: 13px; padding: 12px 14px; font-size: 13px; color: #B91C1C; margin-bottom: 18px; }
        .back-btn { background: none; border: none; cursor: pointer; font-size: 13px; color: var(--gray-400); display: flex; align-items: center; gap: 6px; padding: 0; margin-bottom: 24px; }
        .sent-icon { width: 52px; height: 52px; border-radius: 50%; background: var(--teal-surface); border: 1.5px solid var(--teal-pale); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--teal); }
        .hub-badge { display: inline-flex; align-items: center; gap: 7px; background: rgba(13,148,136,0.08); border: 1px solid rgba(13,148,136,0.2); border-radius: 8px; padding: 6px 12px; margin-bottom: 20px; }
        .hub-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--teal); }
        .hub-badge-text { font-size: 11px; font-weight: 700; color: var(--teal); letter-spacing: 0.08em; text-transform: uppercase; }
        .hub-badge-sub { font-size: 11px; color: var(--gray-400); }
        @media (max-width: 900px) { .left-panel { display: none; } .right-panel { width: 100%; } }
      `

export function AuthLeftPanel() {
  return (
        <div className="left-panel">
          <div className="left-top">
            <svg style={{ display: 'block', width: '396px' }} viewBox="0 0 480 76" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <clipPath id="ll"><polygon points="0,0 185,0 165,76 0,76"/></clipPath>
                <clipPath id="lr"><polygon points="185,0 480,0 480,76 165,76"/></clipPath>
                <mask id="lm"><rect width="480" height="76" fill="white"/><rect x="3" y="0" width="20" height="17" fill="black"/></mask>
              </defs>
              <text x="3" y="60" fontFamily="'Plus Jakarta Sans',sans-serif" fontSize="54" fontWeight="800" letterSpacing="-2" fill="rgba(255,255,255,0.28)" clipPath="url(#ll)" mask="url(#lm)">inventaHQ</text>
              <text x="3" y="60" fontFamily="'Plus Jakarta Sans',sans-serif" fontSize="54" fontWeight="800" letterSpacing="-2" fill="#5EEAD4" clipPath="url(#lr)" mask="url(#lm)" paintOrder="stroke fill" stroke="#5EEAD4" strokeWidth="1.1" strokeLinejoin="round">inventaHQ</text>
            </svg>
          </div>
          <div className="left-body">
            <div className="tagline-eyebrow">No guessing. Just control.</div>
            <h1 className="tagline">Every unit.<br/>Every location.<br/><em>Always accounted for.</em></h1>
            <p className="tagline-sub">Real-time stock visibility across every warehouse, order, and transfer — so nothing slips through.</p>
            <div className="stat-row">
              <div className="stat"><div className="stat-val">100%</div><div className="stat-label">Stock visibility</div></div>
              <div className="stat-divider"/>
              <div className="stat"><div className="stat-val">Live</div><div className="stat-label">Order tracking</div></div>
              <div className="stat-divider"/>
              <div className="stat"><div className="stat-val">Zero</div><div className="stat-label">Blind spots</div></div>
            </div>
          </div>
          <div className="left-bottom">© 2026 inventaHQ. All rights reserved.</div>
        </div>
  )
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{AUTH_CSS}</style>
      <div className="login-page">
        <AuthLeftPanel />
        <div className="right-panel">
          <div className="form-card">{children}</div>
        </div>
      </div>
    </>
  )
}
