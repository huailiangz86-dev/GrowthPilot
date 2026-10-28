"""Full-sample analytics and feedback, verified against isolated PostgreSQL."""
import asyncio
import json
import os
import unittest
import uuid
from datetime import UTC, date, datetime, timedelta
from unittest.mock import patch
from app.ai import llm_service
from app.ai.base_provider import LLMResponse
from app.models.llm_call import LLMCall
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.api.personal_agent import ConfirmRequest, TurnRequest, confirm_action, get_conversation, send_turn
from app.api.workspace_analysis import DiscussRequest, FactRequest, discuss, list_facts, report, save_fact
from app.core.exceptions import AppException, NotFoundException
from app.engines.agent_context import resolve_source
from app.engines.workspace_analysis import build_report, period_window
from app.models.agent_conversation import AgentConversation, AgentTurn
from app.models.task import Task
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceEvent
from app.models.workspace_fact import AnalysisSnapshot, WorkspaceFact
from app.models.workspace_learning_item import WorkspaceLearningItem
from app.models.workspace_reflection import WorkspaceReflection

class AnalysisContractTests(unittest.TestCase):
    def test_calendar_boundaries_and_dst(self):
        settings={"daily_preferences":{"timezone":"America/New_York"}}
        a=period_window("day",date(2026,3,8),settings,datetime(2026,3,9,tzinfo=UTC))
        self.assertEqual((a[3]-a[2]).total_seconds(),23*3600)
        b=period_window("day",date(2026,11,1),settings,datetime(2026,11,2,tzinfo=UTC))
        self.assertEqual((b[3]-b[2]).total_seconds(),25*3600)
        w=period_window("week",date(2026,10,7),{},datetime(2026,10,7,12,tzinfo=UTC))
        self.assertEqual((w[0],w[1],w[5]),(date(2026,10,5),date(2026,10,12),3))
        m=period_window("month",date(2028,2,29),{},datetime(2028,3,1,tzinfo=UTC))
        self.assertEqual((m[1]-m[0]).days,29)
        self.assertEqual(period_window("month",date(2027,1,1),{},datetime(2026,10,7,tzinfo=UTC))[5],0)

    def test_actual_minutes_and_feedback_shape(self):
        base={"id":uuid.uuid4(),"kind":"learning","entry_date":date(2026,10,7),"note":"学习内容"}
        for value in (None,0,1441,3.5,True,"30"):
            with self.assertRaises(ValidationError):FactRequest(**base,minutes=value)
        with self.assertRaises(ValidationError):FactRequest(**{**base,"kind":"feedback"},minutes=30,task_id=uuid.uuid4())
        with self.assertRaises(ValidationError):FactRequest(**{**base,"note":"  "},minutes=30)

@unittest.skipUnless(os.environ.get("GROWTHPILOT_TEST_DATABASE_URL"),"requires isolated PostgreSQL")
class AnalysisIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url=os.environ["GROWTHPILOT_TEST_DATABASE_URL"]
        if not url.rsplit("/",1)[-1].endswith("_test"):raise RuntimeError("Only isolated _test databases are permitted")
        self.engine=create_async_engine(url);self.sessions=async_sessionmaker(self.engine,expire_on_commit=False)
        self.uid,self.wid,self.other,self.other_wid,self.tid=[uuid.uuid4() for _ in range(5)]
        self.today=datetime.now(UTC).astimezone(__import__('zoneinfo').ZoneInfo('Asia/Shanghai')).date()
        self.now=datetime(2026,10,7,12,tzinfo=UTC);self.anchor=date(2026,10,7)
        async with self.sessions() as s:
            s.add_all([User(id=self.uid,wx_openid=str(self.uid),settings={}),User(id=self.other,wx_openid=str(self.other),settings={})]);await s.flush()
            s.add_all([Workspace(id=self.wid,user_id=self.uid,name="事实测试"),Workspace(id=self.other_wid,user_id=self.uid,name="隔离空间")]);await s.flush()
            s.add(Task(id=self.tid,user_id=self.uid,workspace_id=self.wid,title="待确认完成结果",time_block=120,created_at=self.now))
            await s.commit()
    async def asyncTearDown(self):await self.engine.dispose()
    def learning(self,**values):return FactRequest(**{"id":uuid.uuid4(),"kind":"learning","entry_date":self.today,"minutes":30,"note":"实际学习30分钟",**values})
    def feedback(self,**values):return FactRequest(**{"id":uuid.uuid4(),"kind":"feedback","entry_date":self.today,"note":"完成了一条具体反馈","task_id":self.tid,**values})
    async def save(self,payload,wid=None,uid=None):
        async with self.sessions() as s:return (await save_fact(wid or self.wid,payload,str(uid or self.uid),s)).data
    async def stats(self,period="week",anchor=None,ai_scope=False,settings=None):
        async with self.sessions() as s:return (await build_report(s,self.uid,self.wid,settings or {},period,anchor or self.anchor,now=self.now,ai_scope=ai_scope))[0]
    async def handoff(self,payload=None):
        p=payload or DiscussRequest(id=uuid.uuid4(),workspace_id=self.wid,period="week",anchor=self.anchor)
        async with self.sessions() as s:return (await discuss(p,str(self.uid),s)).data

    async def test_full_samples_not_dashboard_slices_or_estimates(self):
        async with self.sessions() as s:
            for i in range(15):
                s.add(WorkspaceReflection(user_id=self.uid,workspace_id=self.wid,reflection_type="micro",reflection_date=self.anchor-timedelta(days=i%3),content=f"原文{i}，学习了999分钟"))
            s.add(WorkspaceLearningItem(user_id=self.uid,workspace_id=self.wid,title="预计120分钟",duration_minutes=120,progress=100))
            s.add(WorkspaceFact(id=uuid.uuid4(),user_id=self.uid,workspace_id=self.wid,kind="learning",entry_date=self.anchor,minutes=30,note="实际学习"))
            s.add(WorkspaceReflection(user_id=self.uid,workspace_id=self.other_wid,reflection_type="micro",reflection_date=self.anchor,content="禁止的其他空间"))
            s.add(WorkspaceReflection(user_id=self.other,workspace_id=self.wid,reflection_type="micro",reflection_date=self.anchor,content="禁止的其他账户"))
            await s.commit()
        r=await self.stats();self.assertEqual((r["metrics"]["captures"],r["metrics"]["learning_minutes"]),(15,30))
        self.assertEqual(r["coverage"],{"days":3,"elapsed_days":3,"samples":17,"state":"ready"})
        self.assertNotIn("禁止",json.dumps(r,ensure_ascii=False))

    async def test_boundaries_backdated_reflections_and_reopened_tasks(self):
        async with self.sessions() as s:
            for stamp in (datetime(2026,10,4,16,tzinfo=UTC),datetime(2026,10,11,16,tzinfo=UTC),datetime(2026,10,4,15,59,tzinfo=UTC)):
                s.add(Task(user_id=self.uid,workspace_id=self.wid,title="边界任务",status="done",created_at=datetime(2026,9,1,tzinfo=UTC),completed_at=stamp))
            s.add(Task(user_id=self.uid,workspace_id=self.wid,title="已重开",status="todo",completed_at=self.now))
            s.add(WorkspaceReflection(user_id=self.uid,workspace_id=self.wid,reflection_type="evening",reflection_date=date(2026,9,30),completion=50,created_at=self.now,is_makeup=True))
            await s.commit()
        r=await self.stats();self.assertEqual((r["metrics"]["completed_tasks"],r["metrics"]["reflections"]),(1,0))
        r=await self.stats("month",date(2026,9,30));self.assertEqual(r["metrics"]["reflections"],1)
        self.assertEqual((await self.stats("month",date(2027,1,1)))["coverage"]["elapsed_days"],0)

    async def test_learning_concurrent_retry_is_one_fact_one_event(self):
        payload=self.learning();a,b=await asyncio.gather(self.save(payload),self.save(payload));self.assertEqual(a["fact"]["id"],b["fact"]["id"])
        with self.assertRaises(AppException):await self.save(self.learning(id=payload.id,minutes=40))
        async with self.sessions() as s:
            self.assertEqual((await s.execute(select(func.count()).select_from(WorkspaceFact).where(WorkspaceFact.user_id==self.uid))).scalar_one(),1)
            self.assertEqual((await s.execute(select(func.count()).select_from(WorkspaceEvent).where(WorkspaceEvent.user_id==self.uid,WorkspaceEvent.event_type=="learning_time_recorded"))).scalar_one(),1)

    async def test_response_loss_replays_across_local_midnight(self):
        p=self.feedback();saved=await self.save(p)
        with patch('app.api.workspace_analysis.user_today',return_value=self.today+timedelta(days=1)):
            replay=await self.save(p)
            self.assertEqual(replay['fact'],saved['fact'])
            with self.assertRaises(AppException):await self.save(self.feedback())
        learning=await self.save(self.learning(entry_date=self.today-timedelta(days=2)))
        self.assertEqual(learning['fact']['entry_date'],str(self.today-timedelta(days=2)))

    async def test_feedback_atomically_completes_and_deduplicates(self):
        p=self.feedback();a,b=await asyncio.gather(self.save(p),self.save(p));self.assertEqual(a["fact"]["id"],b["fact"]["id"]);self.assertEqual(a["task"]["status"],"done")
        with self.assertRaises(AppException):await self.save(self.feedback())
        async with self.sessions() as s:
            events=(await s.execute(select(WorkspaceEvent.event_type).where(WorkspaceEvent.user_id==self.uid))).scalars().all()
            self.assertEqual(events.count("task_completed"),1);self.assertEqual(events.count("action_feedback_recorded"),1)
            r,_=await build_report(s,self.uid,self.wid,{},"day",self.today)
            self.assertEqual((r["metrics"]["completed_tasks"],r["metrics"]["feedback"]),(1,1))
            rows=(await list_facts(self.wid,str(self.uid),s)).data;self.assertEqual(rows[0]["note"],p.note)

    async def test_scope_links_and_future_dates(self):
        with self.assertRaises(NotFoundException):await self.save(self.feedback(),self.other_wid)
        with self.assertRaises(NotFoundException):await self.save(self.learning(),uid=self.other)
        with self.assertRaises(AppException):await self.save(self.learning(entry_date=self.today+timedelta(days=1)))
        p=self.learning();await self.save(p)
        with self.assertRaises(NotFoundException):await self.save(p,uid=self.other)
        async with self.sessions() as s:
            with self.assertRaises(NotFoundException):await report(self.wid,"week",self.anchor,str(self.other),s)

    async def test_snapshot_retry_and_range_fixed(self):
        p=DiscussRequest(id=uuid.uuid4(),workspace_id=self.wid,period="week",anchor=self.anchor)
        a,b=await asyncio.gather(self.handoff(p),self.handoff(p));self.assertEqual(a,b)
        with self.assertRaises(AppException):await self.handoff(p.model_copy(update={"period":"day"}))
        async with self.sessions() as s:
            self.assertEqual((await s.execute(select(func.count()).select_from(AnalysisSnapshot).where(AnalysisSnapshot.user_id==self.uid))).scalar_one(),1)
            source=await resolve_source(s,self.uid,self.wid,f"analysis:{a['snapshot_id']}",{})
            self.assertIn('2026-10-05',source['content'])
            self.assertIsNone(await resolve_source(s,self.other,self.wid,source['key'],{}))
            self.assertIsNone(await resolve_source(s,self.uid,self.other_wid,source['key'],{}))

    async def test_snapshot_excludes_closed_sources_and_invalidates_withdrawal(self):
        await self.save(self.learning())
        async with self.sessions() as s:
            u=await s.get(User,self.uid);u.settings={"privacy_scope":{"enabled_sources":["reflections"]}};await s.commit()
        data=await self.handoff()
        async with self.sessions() as s:
            source=await resolve_source(s,self.uid,self.wid,f"analysis:{data['snapshot_id']}",{"privacy_scope":{"enabled_sources":["reflections"]}})
            self.assertNotIn("实际学习30分钟",source['content']);self.assertIn('"learning_minutes": 0',source['content'])
            self.assertIsNone(await resolve_source(s,self.uid,self.wid,source['key'],{"privacy_scope":{"enabled_sources":[]}}))

    async def test_analysis_model_context_citation_and_feedback_roundtrip(self):
        await self.save(self.learning(entry_date=self.anchor))
        data=await self.handoff();cid=uuid.UUID(data["conversation_id"]);seen=[]
        async def model(session,uid,purpose,variables,variant):
            seen.append(variables);ctx=json.loads(variables['context']);self.assertEqual(len(ctx),1);self.assertEqual(ctx[0]['source'],'analysis')
            self.assertIn('"learning_minutes": 30',ctx[0]['content'])
            return {"reply":"本周记录了30分钟实际学习；先选一个小行动。","citation_keys":[ctx[0]['key']],"suggestion":{"title":"整理反馈","description":"写下结果","priority":"medium","time_block":15}}
        with patch('app.api.personal_agent.llm_service.structured_output',new=model):
            async with self.sessions() as s:
                turn=(await send_turn(cid,TurnRequest(client_request_id=uuid.uuid4(),question="这周为什么推进不顺？"),str(self.uid),s)).data
                self.assertEqual(turn['status'],'completed');confirmed=(await confirm_action(cid,uuid.UUID(turn['id']),ConfirmRequest(title="完成具体的小行动",description="真实步骤",priority="medium",time_block=15,confirmed=True),str(self.uid),s)).data
        result=await self.save(self.feedback(task_id=uuid.UUID(confirmed['task']['id'])));self.assertEqual(result['fact']['conversation_id'],str(cid))
        self.assertEqual(result['task']['agent_source']['conversation_id'],str(cid))
        async with self.sessions() as s:
            r,_=await build_report(s,self.uid,self.wid,{},"day",self.today)
            self.assertEqual((r['metrics']['agent_completed'],r['metrics']['feedback']),(1,1))

    async def test_changed_original_source_redacts_analysis_reply(self):
        data=await self.handoff();cid=uuid.UUID(data['conversation_id'])
        async def model(session,uid,purpose,variables,variant):
            ctx=json.loads(variables['context']);return {"reply":"依据完整统计","citation_keys":[ctx[0]['key']],"suggestion":None}
        with patch('app.api.personal_agent.llm_service.structured_output',new=model):
            async with self.sessions() as s:turn=(await send_turn(cid,TurnRequest(client_request_id=uuid.uuid4(),question="看看事实"),str(self.uid),s)).data
        async with self.sessions() as s:
            task=await s.get(Task,self.tid);task.title="原始任务变更";await s.commit()
        async with self.sessions() as s:
            conv=(await get_conversation(cid,str(self.uid),s)).data
            self.assertFalse(conv['analysis']['available']);self.assertTrue(conv['turns'][0]['redacted'])
            self.assertNotIn('依据完整统计',conv['turns'][0]['reply'])

    async def test_all_snapshot_sources_validate_beyond_excerpt_limit(self):
        ids=[]
        async with self.sessions() as s:
            for i in range(16):
                rid=uuid.uuid4();ids.append(rid);s.add(WorkspaceReflection(id=rid,user_id=self.uid,workspace_id=self.wid,reflection_type='micro',reflection_date=self.anchor,content=f'完整来源 {i}'))
            await s.commit()
        data=await self.handoff()
        async with self.sessions() as s:
            key=f"analysis:{data['snapshot_id']}";source=await resolve_source(s,self.uid,self.wid,key,{})
            original=json.loads(source['content']);self.assertEqual(original['metrics']['captures'],16);self.assertEqual(len(original['evidence']),12)
            displayed={e['key'] for e in original['evidence']};hidden=next(i for i in ids if f'reflections:{i}' not in displayed)
            row=await s.get(WorkspaceReflection,hidden);row.content='摘录外的原始来源也已变更';await s.commit()
            self.assertIsNone(await resolve_source(s,self.uid,self.wid,key,{}))

    async def test_only_snapshot_excerpts_are_independently_citable(self):
        async with self.sessions() as s:
            for i in range(16):s.add(WorkspaceReflection(user_id=self.uid,workspace_id=self.wid,reflection_type='micro',reflection_date=self.anchor,content=f'原始记录{i}'))
            await s.commit()
        data=await self.handoff();cid=uuid.UUID(data['conversation_id'])
        async with self.sessions() as s:
            snapshot=await s.get(AnalysisSnapshot,uuid.UUID(data['snapshot_id']))
            source=await resolve_source(s,self.uid,self.wid,f"analysis:{snapshot.id}",{})
            visible={e['key'] for e in json.loads(source['content'])['evidence']}
            raw=next(k for k in visible if k.startswith('reflections:'))
            hidden=next(e['key'] for e in snapshot.report['evidence'] if e['key'] not in visible)
        async def allowed(session,uid,purpose,variables,variant):
            self.assertIn(raw,json.loads(variables['citation_allowlist']))
            return {'reply':'引用这条原文','citation_keys':[raw],'suggestion':None}
        async def excluded(*args):return {'reply':'禁止引用未提供原文','citation_keys':[hidden],'suggestion':None}
        for model,expected in ((allowed,'completed'),(excluded,'failed')):
            with patch('app.api.personal_agent.llm_service.structured_output',new=model):
                async with self.sessions() as s:
                    turn=(await send_turn(cid,TurnRequest(client_request_id=uuid.uuid4(),question='查看具体原文'),str(self.uid),s)).data
                    self.assertEqual(turn['status'],expected)

    async def test_model_publish_rechecks_snapshot_during_generation(self):
        data=await self.handoff();cid=uuid.UUID(data['conversation_id'])
        async def changed(session,uid,purpose,variables,variant):
            async with self.sessions() as other:
                task=await other.get(Task,self.tid);task.status='blocked';await other.commit()
            return {'reply':'不能发布的旧统计','citation_keys':[f"analysis:{data['snapshot_id']}"],'suggestion':None}
        with patch('app.api.personal_agent.llm_service.structured_output',new=changed):
            async with self.sessions() as s:
                turn=(await send_turn(cid,TurnRequest(client_request_id=uuid.uuid4(),question='分析'),str(self.uid),s)).data
                self.assertEqual(turn['status'],'failed');self.assertIsNone(turn['reply'])

    async def test_feedback_event_failure_rolls_back_completion(self):
        async def failure(*args,**kwargs):raise RuntimeError('simulated atomic write failure')
        with patch('app.api.workspace_analysis.append_event',new=failure):
            with self.assertRaises(RuntimeError):await self.save(self.feedback())
        async with self.sessions() as s:
            self.assertEqual((await s.get(Task,self.tid)).status,'todo')
            self.assertEqual((await s.execute(select(func.count()).select_from(WorkspaceFact).where(WorkspaceFact.user_id==self.uid))).scalar_one(),0)
            self.assertEqual((await s.execute(select(func.count()).select_from(WorkspaceEvent).where(WorkspaceEvent.user_id==self.uid))).scalar_one(),0)

    async def test_analysis_uses_unified_provider_and_audit(self):
        data=await self.handoff();cid=uuid.UUID(data['conversation_id']);seen=[]
        async def provider(messages,model,temperature,max_tokens):
            seen.append(messages)
            return LLMResponse(content=json.dumps({'reply':'按照保存的分析范围解释事实','citation_keys':[f"analysis:{data['snapshot_id']}"],'suggestion':None}),model=model,input_tokens=100,output_tokens=50,cost_yuan=0.001)
        with patch.object(llm_service._primary,'chat',new=provider),patch.object(llm_service._fallback,'chat',new=provider):
            async with self.sessions() as s:
                result=(await send_turn(cid,TurnRequest(client_request_id=uuid.uuid4(),question='解释完整统计'),str(self.uid),s)).data
                self.assertEqual(result['status'],'completed');self.assertIn('analysis:',seen[0][-1]['content'])
                calls=(await s.execute(select(LLMCall).where(LLMCall.user_id==self.uid))).scalars().all();self.assertEqual(len(calls),1);self.assertEqual(calls[0].purpose,'personal_agent')
