import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './App.css';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Layout from './pages/app/Layout';
import Memory from './pages/app/Memory';
import Onboarding from './pages/app/Onboarding';
import LegacyKnowledge from './pages/app/Knowledge';
import AiCoach from './pages/app/AiCoach';
import PersonalAgent from './pages/app/PersonalAgent';
import Records from './pages/app/Records';
import Review from './pages/app/Review';
import LearningPath from './pages/app/LearningPath';
import GrowthReport from './pages/app/GrowthReport';
import MyNotes from './pages/app/MyNotes';
import Holdings from './pages/app/Holdings';
import Market from './pages/app/Market';
import Workspace from './pages/app/Workspace';
import {ProjectDetail} from './projects/Projects';
import GrowthPlan from './pages/app/GrowthPlan';
import KnowledgeHub from './pages/app/KnowledgeHub';
import PersonalKnowledge from './learning/PersonalKnowledge';
import KnowledgeLayout from './learning/KnowledgeLayout';
import Capabilities from './pages/app/Capabilities';
import Insights from './pages/app/Insights';
import Mine from './pages/app/Mine';
import Reflection from './pages/app/Reflection';
import Focus from './pages/app/Focus';
import CaptureTimeline from './pages/app/CaptureTimeline';
import Execution from './pages/app/Execution';
import {PersonalHome, PersonalWork, PersonalTask, PersonalLearning, PersonalReview} from './personal/PersonalPages';

const CalendarRemindersPrototype = lazy(() => import('./prototype/CalendarRemindersPrototype'));
const ProjectWorkspacePrototype = lazy(() => import('./prototype/ProjectWorkspacePrototype'));
const MobilePrototype = lazy(() => import('./prototype/MobilePrototype'));
const LearningLoopPrototype = lazy(() => import('./prototype/LearningLoopPrototype'));
const SourceToLearning = lazy(() => import('./sources/SourceToLearning'));
const SourceLibrary = lazy(() => import('./sources/SourceLibrary'));
const SourceSummaries = lazy(() => import('./sources/SourceSummaries'));
const SourcePipeline = lazy(() => import('./sources/SourcePipeline'));
const OnboardingPrototype = lazy(() => import('./prototype/OnboardingPrototype'));
const AgentPrototype = lazy(() => import('./prototype/AgentPrototype'));
const AnalysisPrototype = lazy(() => import('./prototype/AnalysisPrototype'));
const TrialPrototype = lazy(() => import('./prototype/TrialPrototype'));
const PersonalPlatformPrototype = lazy(() => import('./prototype/PersonalPlatformPrototype'));
const HabitPrototype = lazy(() => import('./prototype/HabitPrototype'));
const MaterialsPrototype = lazy(() => import('./prototype/MaterialsPrototype'));
const WebMaterialPrototype = lazy(() => import('./prototype/WebMaterialPrototype'));
const DiagnosisQualityPrototype = lazy(() => import('./prototype/DiagnosisQualityPrototype'));
const KnowledgeSearchPrototype = lazy(() => import('./prototype/KnowledgeSearchPrototype'));
const BailianKnowledge = lazy(() => import('./learning/BailianKnowledge'));
const BailianKnowledgePrototype = lazy(() => import('./prototype/BailianKnowledgePrototype'));
const LearningWorkspacePrototype = lazy(() => import('./prototype/LearningWorkspacePrototype'));
const LearningReviewPrototype = lazy(() => import('./prototype/LearningReviewPrototype'));
const SpacedReviewPrototype = lazy(() => import('./prototype/SpacedReviewPrototype'));
const FitnessPage = lazy(() => import('./life/FitnessPage'));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/prototype/calendar-reminders" element={<Suspense fallback={<p>正在打开日历原型…</p>}><CalendarRemindersPrototype /></Suspense>} />
        <Route path="/prototype/source-to-learning" element={<Suspense fallback={<p>正在打开学习原型…</p>}><SourceToLearning prototype /></Suspense>} />
        <Route path="/prototype/project-workspace" element={<Suspense fallback={<p>正在打开项目原型…</p>}><ProjectWorkspacePrototype /></Suspense>} />
        <Route path="/prototype/learning-loop" element={<Suspense fallback={<div>正在打开完整学习流程原型…</div>}><LearningLoopPrototype /></Suspense>} />
        <Route path="/prototype/source-summaries" element={<Suspense fallback={<div>正在打开资料总结原型…</div>}><SourceSummaries prototype /></Suspense>} />
        <Route path="/app/sources/summaries" element={<KnowledgeRedirect to="/app/knowledge/summaries" />} />
        <Route path="/prototype/source-pipeline" element={<Suspense fallback={<div>正在打开资料导入原型…</div>}><SourcePipeline prototype /></Suspense>} />
        <Route path="/app/sources/cloud" element={<Suspense fallback={<div>正在打开资料导入…</div>}><SourcePipeline /></Suspense>} />
        <Route path="/prototype/personal-sources" element={<Suspense fallback={<div>正在打开个人资料库原型…</div>}><SourceLibrary prototype /></Suspense>} />
        <Route path="/prototype/bailian-knowledge" element={<Suspense fallback={<div>正在打开百炼知识库原型…</div>}><BailianKnowledgePrototype /></Suspense>} />
        <Route path="/prototype/knowledge-search" element={<Suspense fallback={<div>正在打开知识检索原型…</div>}><KnowledgeSearchPrototype /></Suspense>} />
        <Route path="/prototype/learning-workspace" element={<Suspense fallback={<div>正在打开学习工作台原型…</div>}><LearningWorkspacePrototype /></Suspense>} />
        <Route path="/prototype/learning-review" element={<Suspense fallback={<div>正在打开学习复盘原型…</div>}><LearningReviewPrototype /></Suspense>} />
        <Route path="/prototype/spaced-review" element={<Suspense fallback={<div>正在打开复习安排原型…</div>}><SpacedReviewPrototype /></Suspense>} />
        <Route path="/prototype/diagnosis-quality" element={<Suspense fallback={<div>正在打开学习诊断原型…</div>}><DiagnosisQualityPrototype /></Suspense>} />
        <Route path="/prototype/web-material" element={<Suspense fallback={<div>正在打开网页资料原型…</div>}><WebMaterialPrototype /></Suspense>} />
        <Route path="/prototype/materials" element={<Suspense fallback={<div style={{padding:32}}>正在打开资料摄入原型…</div>}><MaterialsPrototype /></Suspense>} />
        <Route path="/prototype/habits" element={<Suspense fallback={<div style={{padding:32}}>正在打开记录与习惯原型…</div>}><HabitPrototype /></Suspense>} />
        <Route path="/prototype/personal" element={<Suspense fallback={<div style={{padding:32}}>正在打开个人平台原型…</div>}><PersonalPlatformPrototype /></Suspense>} />
        <Route path="/prototype/trial" element={<Suspense fallback={<div style={{padding:32}}>正在打开原型…</div>}><TrialPrototype /></Suspense>} />
        <Route path="/prototype/analysis" element={<Suspense fallback={<div style={{padding:32}}>正在打开原型…</div>}><AnalysisPrototype /></Suspense>} />
        <Route path="/prototype/agent" element={<Suspense fallback={<div style={{padding: 32}}>正在打开原型…</div>}><AgentPrototype /></Suspense>} />
        <Route path="/prototype/onboarding" element={<Suspense fallback={<div style={{padding: 32}}>正在打开原型…</div>}><OnboardingPrototype /></Suspense>} />
        <Route path="/prototype" element={<Suspense fallback={<div style={{padding: 32}}>正在打开原型…</div>}><MobilePrototype /></Suspense>} />
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/app/sources" element={<KnowledgeRedirect to="/app/knowledge/sources" />} />
        <Route path="/app/fitness" element={<Suspense fallback={<div style={{padding:32}}>正在打开个人健身档案…</div>}><FitnessPage /></Suspense>} />
        <Route path="/app" element={<Layout />}>
          <Route index element={<PersonalHome />} />
          <Route path="workspace" element={<Workspace />} />
          <Route path="projects/:projectId" element={<ProjectDetail />} />
          <Route path="data" element={<CaptureTimeline />} />
          <Route path="tasks" element={<PersonalWork />} />
          <Route path="tasks/:taskId" element={<PersonalTask />} />
          <Route path="execution" element={<Execution />} />
          <Route path="learning" element={<PersonalLearning />} />
          <Route path="learn/:itemId" element={<PersonalLearning />} />
          <Route path="focus" element={<Focus />} />
          <Route path="growth" element={<GrowthPlan />} />
          <Route path="source-to-learning" element={<Suspense fallback={<p>正在读取原资料…</p>}><SourceToLearning /></Suspense>} />
              <Route path="knowledge" element={<KnowledgeLayout />}>
            <Route index element={<PersonalKnowledge embedded />} />
            <Route path="sources" element={<Suspense fallback={<p role="status">正在打开个人资料…</p>}><SourceLibrary embedded /></Suspense>} />
            <Route path="summaries" element={<Suspense fallback={<p role="status">正在打开总结与成果…</p>}><SourceSummaries embedded /></Suspense>} />
          </Route>
          <Route path="knowledge/bailian" element={<Suspense fallback={<div>正在打开百炼测试连接…</div>}><BailianKnowledge /></Suspense>} />
          <Route path="knowledge/cards" element={<KnowledgeHub />} />
          <Route path="apps" element={<Capabilities kind="app" />} />
          <Route path="extensions" element={<Capabilities />} />
          <Route path="insights" element={<Insights />} />
          <Route path="mine" element={<Mine />} />
          <Route path="morning" element={<Reflection type="morning" />} />
          <Route path="evening" element={<PersonalReview />} />
          <Route path="memory" element={<Memory />} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="agent" element={<PersonalAgent />} />
          <Route path="ai-coach" element={<Navigate to="/app/agent" replace />} />
          <Route path="trading-coach" element={<AiCoach />} />
          <Route path="records" element={<Records />} />
          <Route path="review" element={<Review />} />
          <Route path="holdings" element={<Holdings />} />
          <Route path="market" element={<Market />} />
          <Route path="learning-path" element={<LearningPath />} />
          <Route path="growth-report" element={<GrowthReport />} />
          <Route path="notes" element={<MyNotes />} />
          <Route path="knowledge-base" element={<LegacyKnowledge />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function KnowledgeRedirect({to}:{to:string}) {
  const location=useLocation();
  return <Navigate to={to+location.search+location.hash} replace />;
}
