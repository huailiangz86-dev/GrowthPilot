import {Link,NavLink,useLocation} from 'react-router-dom';
import { CORE_NAV } from '../workspace/navigation';

export default function CoreNavigation({ current, onSelect }: { current?: string; onSelect?: (path: string) => void }) {
  const {pathname}=useLocation();
  const knowledgePage=pathname==='/app/knowledge'||pathname.startsWith('/app/knowledge/');
  return <nav className="mobile-core-nav" aria-label="主要页面">{CORE_NAV.map(item => onSelect
    ? <a key={item.to} href={`?page=${encodeURIComponent(item.to)}`} aria-current={current === item.to ? 'page' : undefined} onClick={event => {event.preventDefault(); onSelect(item.to);}}><span aria-hidden="true">{item.icon}</span>{item.label}</a>
    : knowledgePage ? <Link key={item.to} to={item.to} aria-current={item.to==='/app/learning'?'page':undefined}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>
    : <NavLink key={item.to} to={item.to} end={item.end}><span aria-hidden="true">{item.icon}</span>{item.label}</NavLink>)}</nav>;
}
