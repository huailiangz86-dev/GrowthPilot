import {Link,NavLink,Outlet} from 'react-router-dom';
import {KNOWLEDGE_ROUTES} from './knowledgeNavigation';
import './knowledge.css';

export default function KnowledgeLayout() {
  return <div className="knowledge-workspace">
    <header className="knowledge-heading">
      <div><span className="section-kicker">MY KNOWLEDGE</span><h2>把资料留下，把知识用起来</h2><p>保存原文，核对总结的依据，再带着出处继续使用。</p></div>
      <Link className="outline-action" to="/app/learning">继续学习 →</Link>
    </header>
    <nav className="knowledge-tabs" aria-label="知识库内容">
      <NavLink to={KNOWLEDGE_ROUTES.records} end>学习记录</NavLink>
      <NavLink to={KNOWLEDGE_ROUTES.sources}>个人资料</NavLink>
      <NavLink to={KNOWLEDGE_ROUTES.summaries}>总结与成果</NavLink>
    </nav>
    <Outlet />
    <details className="knowledge-tools"><summary>更多知识工具</summary><div>
      <Link to="/app/knowledge/cards">知识卡与捕获 →</Link>
      <Link to="/app/sources/cloud">百炼资料导入 →</Link>
      <Link to="/app/knowledge/bailian">百炼切片与检索测试 →</Link>
    </div></details>
  </div>;
}
