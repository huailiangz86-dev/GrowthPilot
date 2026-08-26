import type React from 'react';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface OnboardingStatus {
  completed: boolean;
  onboarded: boolean;
  current_day: number;
  path_id: string;
  path_name: string;
  total_days: number;
  completed_days: number[];
}

interface DayTask {
  day: number;
  type: string;
  title: string;
  description: string;
  article_title?: string;
}

interface Stage {
  name: string;
  days: DayTask[];
}

interface PathDetail {
  id: string;
  name: string;
  description: string;
  total_days: number;
  stages: Stage[];
}

const STEPS = [
  { title: '你的交易经验？', key: 'level', options: [
    { value: 'beginner', emoji: '🌱', label: '刚入市', desc: '不到1年' },
    { value: 'intermediate', emoji: '📈', label: '有经验', desc: '1-3年' },
    { value: 'advanced', emoji: '🏆', label: '老手', desc: '3年以上' },
  ]},
  { title: '你最想改进什么？', key: 'focus', options: [
    { value: 'review', emoji: '📋', label: '建立复盘习惯', desc: '不知道怎么系统复盘' },
    { value: 'psychology', emoji: '🧠', label: '控制情绪', desc: '追涨杀跌、拿不住' },
    { value: 'risk', emoji: '🛡', label: '仓位/风控', desc: '止损混乱、仓位过重' },
    { value: 'strategy', emoji: '📚', label: '学交易策略', desc: '缺少系统方法论' },
  ]},
];

function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ path_name: string; total_days: number; description: string } | null>(null);

  const current = STEPS[step];
  const canNext = current && !!answers[current.key];

  const handleNext = async () => {
    if (step < STEPS.length - 1) { setStep(step + 1); return; }
    setSubmitting(true);
    try {
      const res = await api.post<{ path_name: string; total_days: number; description: string }>('/onboarding/assess', {
        level: answers.level || 'beginner', market: 'stock', focus: answers.focus || 'review',
      });
      setResult(res);
    } catch { /* handled */ }
    setSubmitting(false);
  };

  if (result) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>学习计划已生成</h2>
        <p style={{ color: '#999', marginBottom: 8 }}>{result.path_name} · {result.total_days}天</p>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 24 }}>{result.description}</p>
        <button onClick={onComplete} style={{ padding: '12px 40px', borderRadius: 10, border: 'none', background: '#e74c3c', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
          开始学习
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 500 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>开始你的学习之旅</h2>
      <p style={{ color: '#999', fontSize: 14, marginBottom: 24 }}>回答几个问题，为你定制学习计划</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {STEPS.map((_, i) => (
          <div key={i} style={{ width: step >= i ? 24 : 10, height: 10, borderRadius: 5, background: step >= i ? '#e74c3c' : '#eee', transition: 'all 0.2s' }} />
        ))}
      </div>

      {current && (
        <>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>{current.title}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {current.options.map((opt) => (
              <div key={opt.value} onClick={() => setAnswers({ ...answers, [current.key]: opt.value })} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 12, cursor: 'pointer',
                background: answers[current.key] === opt.value ? '#fff5f5' : '#fafafa',
                border: answers[current.key] === opt.value ? '2px solid #e74c3c' : '2px solid transparent',
              }}>
                <span style={{ fontSize: 28 }}>{opt.emoji}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{opt.label}</div>
                  <div style={{ fontSize: 13, color: '#999', marginTop: 2 }}>{opt.desc}</div>
                </div>
                {answers[current.key] === opt.value && <span style={{ marginLeft: 'auto', color: '#e74c3c', fontWeight: 700 }}>✓</span>}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            {step > 0 && <button onClick={() => setStep(step - 1)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid #ddd', background: '#fff', fontSize: 15, cursor: 'pointer' }}>上一步</button>}
            <button onClick={handleNext} disabled={!canNext || submitting} style={{
              flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: '#e74c3c', color: '#fff',
              fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: canNext && !submitting ? 1 : 0.4,
            }}>
              {submitting ? '生成中...' : step === STEPS.length - 1 ? '生成学习计划' : '下一步'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function LearningPath() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [pathDetail, setPathDetail] = useState<PathDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [expandedStage, setExpandedStage] = useState<number | null>(null);

  useEffect(() => {
    api.get<OnboardingStatus>('/onboarding/status')
      .then((res) => {
        setStatus(res);
        if (res?.path_id) {
          return api.get<PathDetail>(`/onboarding/path/${res.path_id}`);
        }
        return null;
      })
      .then((detail) => {
        if (detail) setPathDetail(detail);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCompleteDay = async () => {
    if (!status || completing) return;
    setCompleting(true);
    try {
      const res = await api.post<{ completed_day: number; next_day: number; all_completed: boolean }>('/onboarding/complete-day');
      setStatus((prev) => prev ? {
        ...prev,
        current_day: res.next_day ?? prev.current_day,
        completed_days: [...(Array.isArray(prev.completed_days) ? prev.completed_days : []), res.completed_day],
        completed: res.all_completed,
      } : prev);
    } catch {
      // ignore
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return <div style={loadingStyle}>加载中...</div>;
  }

  if (!status?.onboarded || !pathDetail) {
    return <OnboardingFlow onComplete={() => {
      setLoading(true);
      api.get<OnboardingStatus>('/onboarding/status').then((res) => {
        setStatus(res);
        if (res?.path_id) api.get<PathDetail>(`/onboarding/path/${res.path_id}`).then(setPathDetail);
      }).finally(() => setLoading(false));
    }} />;
  }

  const completedCount = Array.isArray(status.completed_days) ? status.completed_days.length : 0;
  const completedSet = new Set(Array.isArray(status.completed_days) ? status.completed_days : []);
  const progressPct = status.total_days > 0
    ? Math.round((completedCount / status.total_days) * 100)
    : 0;

  return (
    <div>
      <h2 style={pageTitleStyle}>学习路径</h2>
      <p style={pageSubStyle}>{pathDetail.description || '系统化的交易学习路径，AI 根据你的水平个性化推荐'}</p>

      {/* Progress overview */}
      <div style={progressCardStyle}>
        <div style={progressHeaderStyle}>
          <div>
            <span style={progressTitleStyle}>{pathDetail.name}</span>
            <span style={progressSubStyle}>
              已完成 {completedCount}/{status.total_days} 天
              {status.completed && ' · 已全部完成!'}
            </span>
          </div>
          <span style={progressPctStyle}>{progressPct}%</span>
        </div>
        <div style={progressBarOuterStyle}>
          <div style={{ ...progressBarInnerStyle, width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Stages */}
      <div style={pathListStyle}>
        {pathDetail.stages.map((stage, stageIdx) => {
          const stageDays = stage.days;
          const stageCompleted = stageDays.every((d) => completedSet.has(d.day));
          const stageCurrent = stageDays.some((d) => d.day === status.current_day);
          const stageLocked = stageDays.length > 0 && stageDays[0].day > status.current_day && !stageCompleted;
          const isExpanded = expandedStage === stageIdx;

          return (
            <div key={stageIdx}>
              {/* Connector line */}
              {stageIdx > 0 && (
                <div style={connectorStyle}>
                  <div style={{
                    ...connectorLineStyle,
                    background: stageLocked ? '#e0e0e0' : '#e74c3c',
                  }} />
                </div>
              )}
              <div
                style={{
                  ...pathCardStyle,
                  ...(stageCurrent ? pathCardCurrentStyle : {}),
                  ...(stageLocked ? pathCardLockedStyle : {}),
                }}
                onClick={() => setExpandedStage(isExpanded ? null : stageIdx)}
              >
                <div style={pathIconWrapStyle}>
                  <div style={{
                    ...pathIconStyle,
                    background: stageCompleted
                      ? 'linear-gradient(135deg, #27ae60, #2ecc71)'
                      : stageCurrent
                      ? 'linear-gradient(135deg, #e74c3c, #c0392b)'
                      : '#e0e0e0',
                  }}>
                    {stageCompleted ? '✓' : stageCurrent ? '📖' : '🔒'}
                  </div>
                </div>
                <div style={pathContentStyle}>
                  <h3 style={{
                    ...pathTitleStyle,
                    color: stageLocked ? '#bbb' : '#1a1a2e',
                  }}>
                    {stage.name}
                  </h3>
                  <div style={pathMetaStyle}>
                    <span style={pathArticleCountStyle}>{stageDays.length} 个任务</span>
                    <span style={{
                      ...pathStatusStyle,
                      background: stageCompleted
                        ? 'rgba(39,174,96,0.1)'
                        : stageCurrent
                        ? 'rgba(231,76,60,0.1)'
                        : '#f0f0f0',
                      color: stageCompleted
                        ? '#27ae60'
                        : stageCurrent
                        ? '#e74c3c'
                        : '#bbb',
                    }}>
                      {stageCompleted ? '已完成' : stageCurrent ? '学习中' : '未解锁'}
                    </span>
                  </div>
                </div>
                <span style={{ fontSize: 14, color: '#ccc', flexShrink: 0 }}>
                  {isExpanded ? '▲' : '▼'}
                </span>
              </div>

              {/* Expanded day tasks */}
              {isExpanded && (
                <div style={dayListStyle}>
                  {stageDays.map((day) => {
                    const isDone = completedSet.has(day.day);
                    const isCurrent = day.day === status.current_day;
                    return (
                      <div key={day.day} style={{
                        ...dayItemStyle,
                        ...(isCurrent ? dayItemCurrentStyle : {}),
                        opacity: day.day > status.current_day && !isDone ? 0.5 : 1,
                      }}>
                        <div style={{
                          ...dayBadgeStyle,
                          background: isDone ? '#27ae60' : isCurrent ? '#e74c3c' : '#e0e0e0',
                          color: isDone || isCurrent ? '#fff' : '#999',
                        }}>
                          {isDone ? '✓' : `D${day.day}`}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={dayTitleStyle}>{day.title}</div>
                          <div style={dayDescStyle}>{day.description}</div>
                          {day.article_title && (
                            <div style={dayArticleStyle}>📖 {day.article_title}</div>
                          )}
                          <div style={dayTypeStyle}>{day.type}</div>
                        </div>
                        {isCurrent && !isDone && (
                          <button
                            type="button"
                            style={completeBtnStyle}
                            onClick={(e) => { e.stopPropagation(); handleCompleteDay(); }}
                            disabled={completing}
                          >
                            {completing ? '...' : '完成'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Styles ── */

const loadingStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'center', alignItems: 'center',
  height: 300, fontSize: 18, color: '#999',
};


const pageTitleStyle: React.CSSProperties = {
  fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: '0 0 8px',
};

const pageSubStyle: React.CSSProperties = {
  fontSize: 15, color: '#888', margin: '0 0 24px',
};

const progressCardStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #1a1a2e, #0f3460)',
  borderRadius: 16, padding: '24px 28px', marginBottom: 32,
  color: '#fff',
};

const progressHeaderStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  marginBottom: 16,
};

const progressTitleStyle: React.CSSProperties = {
  fontSize: 18, fontWeight: 600, display: 'block', marginBottom: 4,
};

const progressSubStyle: React.CSSProperties = {
  fontSize: 14, opacity: 0.7, display: 'block',
};

const progressPctStyle: React.CSSProperties = {
  fontSize: 32, fontWeight: 700,
};

const progressBarOuterStyle: React.CSSProperties = {
  height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.15)',
  overflow: 'hidden',
};

const progressBarInnerStyle: React.CSSProperties = {
  height: '100%', borderRadius: 4,
  background: 'linear-gradient(90deg, #e74c3c, #f39c12)',
  transition: 'width 0.5s ease',
};

const pathListStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
};

const connectorStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'center', padding: '0 0 0 36px',
  height: 24,
};

const connectorLineStyle: React.CSSProperties = {
  width: 3, height: '100%', borderRadius: 2,
};

const pathCardStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 16,
  background: '#fff', borderRadius: 14, padding: '20px 22px',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  cursor: 'pointer', transition: 'all 0.2s',
  border: '1px solid #f0f0f0',
};

const pathCardCurrentStyle: React.CSSProperties = {
  borderColor: '#e74c3c',
  boxShadow: '0 2px 12px rgba(231,76,60,0.12)',
};

const pathCardLockedStyle: React.CSSProperties = {
  opacity: 0.7,
  cursor: 'default',
};

const pathIconWrapStyle: React.CSSProperties = {
  flexShrink: 0,
};

const pathIconStyle: React.CSSProperties = {
  width: 48, height: 48, borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 20, color: '#fff', fontWeight: 700,
};

const pathContentStyle: React.CSSProperties = {
  flex: 1, minWidth: 0,
};

const pathTitleStyle: React.CSSProperties = {
  fontSize: 17, fontWeight: 600, margin: '0 0 8px',
};

const pathMetaStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
};

const pathArticleCountStyle: React.CSSProperties = {
  fontSize: 12, color: '#bbb',
};

const pathStatusStyle: React.CSSProperties = {
  fontSize: 12, padding: '2px 10px', borderRadius: 10, fontWeight: 500,
};

/* Day list */
const dayListStyle: React.CSSProperties = {
  marginLeft: 36, borderLeft: '2px solid #f0f0f0', paddingLeft: 20,
  marginTop: 4, marginBottom: 4,
};

const dayItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 14,
  padding: '14px 18px', background: '#fff', borderRadius: 10,
  marginBottom: 6, border: '1px solid #f0f0f0',
};

const dayItemCurrentStyle: React.CSSProperties = {
  borderColor: '#e74c3c',
  background: 'rgba(231,76,60,0.02)',
};

const dayBadgeStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 11, fontWeight: 700, flexShrink: 0,
};

const dayTitleStyle: React.CSSProperties = {
  fontSize: 15, fontWeight: 600, color: '#333', marginBottom: 4,
};

const dayDescStyle: React.CSSProperties = {
  fontSize: 13, color: '#888', lineHeight: 1.5, marginBottom: 4,
};

const dayArticleStyle: React.CSSProperties = {
  fontSize: 12, color: '#667eea', marginBottom: 2,
};

const dayTypeStyle: React.CSSProperties = {
  fontSize: 11, color: '#bbb',
};

const completeBtnStyle: React.CSSProperties = {
  padding: '6px 16px', borderRadius: 8,
  background: '#e74c3c', color: '#fff',
  fontSize: 13, fontWeight: 500, border: 'none',
  cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
};
