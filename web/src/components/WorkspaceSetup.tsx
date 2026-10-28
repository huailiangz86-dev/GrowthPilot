import { Link } from 'react-router-dom';

export default function WorkspaceSetup({ pending = false, prototype = false }: { pending?: boolean; prototype?: boolean }) {
  return <section className="workspace-panel workspace-setup" aria-label="建立工作空间">
    <span className="section-kicker">FIRST WORKSPACE</span>
    <h2>{pending ? '继续保存你的工作空间' : '从你的第一句话开始'}</h2>
    <p>{pending ? '原话和确认选择已经保留。继续完成保存后，就能记录、对话和查看分析。' : '说说你正在做什么、想推进哪个目标。确认后，你的记录、行动和分析会在这里开始积累。'}</p>
    <div className="intro-actions">
      <Link className="primary-action" to={prototype ? '/prototype/onboarding' : '/app/onboarding'}>{pending ? '继续确认首次方案 →' : '建立我的工作空间 →'}</Link>
      <Link className="outline-action" to="/prototype">先看看示例</Link>
    </div>
    <small>示例体验使用独立数据；这里会显示你确认保存的内容。</small>
  </section>;
}
