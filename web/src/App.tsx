import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Layout from './pages/app/Layout';
import Dashboard from './pages/app/Dashboard';
import Memory from './pages/app/Memory';
import Onboarding from './pages/app/Onboarding';
import LegacyKnowledge from './pages/app/Knowledge';
import AiCoach from './pages/app/AiCoach';
import Records from './pages/app/Records';
import Review from './pages/app/Review';
import LearningPath from './pages/app/LearningPath';
import GrowthReport from './pages/app/GrowthReport';
import MyNotes from './pages/app/MyNotes';
import Holdings from './pages/app/Holdings';
import Market from './pages/app/Market';
import Workspace from './pages/app/Workspace';
import Tasks from './pages/app/Tasks';
import GrowthPlan from './pages/app/GrowthPlan';
import KnowledgeHub from './pages/app/KnowledgeHub';
import Capabilities from './pages/app/Capabilities';
import Insights from './pages/app/Insights';
import Mine from './pages/app/Mine';
import Reflection from './pages/app/Reflection';
import Focus from './pages/app/Focus';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/app" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="workspace" element={<Workspace />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="focus" element={<Focus />} />
          <Route path="growth" element={<GrowthPlan />} />
          <Route path="knowledge" element={<KnowledgeHub />} />
          <Route path="apps" element={<Capabilities kind="app" />} />
          <Route path="extensions" element={<Capabilities />} />
          <Route path="insights" element={<Insights />} />
          <Route path="mine" element={<Mine />} />
          <Route path="morning" element={<Reflection type="morning" />} />
          <Route path="evening" element={<Reflection type="evening" />} />
          <Route path="memory" element={<Memory />} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="ai-coach" element={<AiCoach />} />
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
