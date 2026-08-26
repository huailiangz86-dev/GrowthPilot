import { Link } from 'react-router-dom';
import './Landing.css';

const LOOP_STEPS = [
  { number: '01', title: '说出此刻', description: '用一句话留下正在发生的事。' },
  { number: '02', title: '接住行动', description: '把目标和任务放回真实节奏里。' },
  { number: '03', title: '留下 Memory', description: '让每次复盘都成为下一次理解的依据。' },
];

const WORKSPACE_ITEMS = [
  { label: '今日工作台', detail: '今天先做什么' },
  { label: '个人 Memory', detail: '系统记得什么' },
  { label: '目标与任务', detail: '下一步往哪里走' },
  { label: 'Global AI', detail: '带着上下文对话' },
];

export default function Landing() {
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <Link to="/" className="landing-brand">
          <span className="landing-brand-mark">GP</span>
          <span>GrowthPilot</span>
        </Link>
        <nav className="landing-nav-links" aria-label="主导航">
          <a href="#how-it-works">怎么工作</a>
          <a href="#workspace">工作台</a>
          <Link to="/login" className="landing-login">进入工作台 <span aria-hidden="true">→</span></Link>
        </nav>
      </header>

      <main>
        <section className="landing-hero">
          <div className="hero-copy">
            <span className="landing-eyebrow">PERSONAL GROWTH OS</span>
            <h1>让成长<br /><em>开始拥有上下文。</em></h1>
            <p>
              GrowthPilot 是一张会慢慢理解你的个人工作台。
              记录目标、行动、知识和情绪，让每天的下一步不再从空白开始。
            </p>
            <div className="hero-actions">
              <Link to="/login" className="hero-primary">开始建立我的空间 <span aria-hidden="true">↗</span></Link>
              <span className="hero-note">Web 主工作台 · 小程序轻入口</span>
            </div>
          </div>

          <div className="hero-index" aria-label="GrowthPilot 工作台模块">
            <div className="hero-index-top">
              <span>THE WORKSPACE</span>
              <span>2026 / NOW</span>
            </div>
            {WORKSPACE_ITEMS.map((item, index) => (
              <div className="hero-index-row" key={item.label}>
                <span className="hero-index-number">0{index + 1}</span>
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
                <span className="hero-index-arrow" aria-hidden="true">↗</span>
              </div>
            ))}
            <div className="hero-index-footer">
              <span className="signal-dot" />
              <span>从一句话开始，逐步建立自己的系统</span>
            </div>
          </div>
        </section>

        <section className="landing-intro" id="workspace">
          <div className="section-label">A QUIET SYSTEM FOR A BUSY LIFE</div>
          <div className="intro-grid">
            <h2>不是更多工具，<br />而是更少的重复解释。</h2>
            <p>
              你的项目、目标、任务、知识和复盘，本来就属于同一个人。
              GrowthPilot 把它们放回同一份个人上下文里，再交给 AI 帮你看见联系、找到重点。
            </p>
          </div>
        </section>

        <section className="landing-loop" id="how-it-works">
          <div className="section-label">THE DAILY LOOP</div>
          <div className="loop-grid">
            {LOOP_STEPS.map((step) => (
              <article className="loop-item" key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-cta">
          <div>
            <span className="landing-eyebrow">YOUR NEXT MILESTONE</span>
            <h2>先写下此刻，<br />剩下的路一起整理。</h2>
          </div>
          <Link to="/login" className="cta-link">进入 GrowthPilot <span aria-hidden="true">→</span></Link>
        </section>
      </main>

      <footer className="landing-footer">
        <span>© 2026 GrowthPilot</span>
        <span>Personal context, one step at a time.</span>
      </footer>
    </div>
  );
}
