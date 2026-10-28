"""Personal Agent durability and evidence boundaries, using isolated PostgreSQL."""
import asyncio
import json
import os
import unittest
import uuid
from datetime import UTC, date, datetime, timedelta
from unittest.mock import patch

from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.ai import llm_service
from app.ai.base_provider import LLMResponse
from app.ai.prompt_router import PromptVariant
from app.api.personal_agent import (ConfirmRequest, ConversationRequest, ModelReply, TurnRequest,
    confirm_action, create_conversation, get_conversation, get_source, list_conversations, send_turn)
from app.core.database import Base
from app.core.exceptions import AppException, NotFoundException
from app.api.tasks import list_tasks
from app.engines.agent_context import build_context, settings_for
from app.models.agent_conversation import AgentConversation, AgentTurn
from app.models.goal import Goal
from app.models.growth_plan import GrowthPlan
from app.models.llm_call import LLMCall
from app.models.memory import MemoryEntry
from app.models.onboarding_submission import OnboardingSubmission
from app.models.task import Task
from app.models.user import User
from app.models.workspace import Project, Workspace, WorkspaceEvent
from app.models.workspace_knowledge_card import WorkspaceKnowledgeCard
from app.models.workspace_learning_item import WorkspaceLearningItem
from app.models.workspace_reflection import WorkspaceReflection
from app.models.workspace_fact import WorkspaceFact, AnalysisSnapshot


class AgentContractTests(unittest.TestCase):
    def test_strict_model_output_and_explicit_confirmation(self):
        for payload in ({"reply":"","citation_keys":[],"suggestion":None},
                        {"reply":"回复","citation_keys":"fake","suggestion":None},
                        {"reply":"回复","citation_keys":[],"suggestion":{"title":"行动","description":"","priority":"urgent","time_block":15}}):
            with self.assertRaises(ValidationError): ModelReply.model_validate(payload)
        with self.assertRaises(ValidationError):
            ConfirmRequest(title="行动",description="",priority="medium",time_block=15,confirmed=False)
        with self.assertRaises(ValidationError): TurnRequest(client_request_id=uuid.uuid4(),question="  ")

    def test_provider_preferences_match_actual_provider(self):
        for name, model in (("qwen","qwen-plus"),("deepseek","deepseek-chat")):
            provider, selected=llm_service._select_provider(PromptVariant("test","v1",{"model_preference":model}))
            self.assertEqual((provider.name,selected),(name,model))


@unittest.skipUnless(os.environ.get("GROWTHPILOT_TEST_DATABASE_URL"), "requires isolated PostgreSQL")
class AgentIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url=os.environ["GROWTHPILOT_TEST_DATABASE_URL"]
        if not url.rsplit("/",1)[-1].endswith("_test"):
            raise RuntimeError("Only an explicitly named _test database is permitted")
        self.engine=create_async_engine(url)
        self.sessions=async_sessionmaker(self.engine,expire_on_commit=False)
        models=(User,Workspace,Project,WorkspaceEvent,Task,Goal,GrowthPlan,WorkspaceReflection,WorkspaceLearningItem,WorkspaceKnowledgeCard,MemoryEntry,OnboardingSubmission,LLMCall,WorkspaceFact,AnalysisSnapshot,AgentConversation,AgentTurn)
        async with self.engine.begin() as conn:
            await conn.run_sync(lambda sync: Base.metadata.create_all(sync,tables=[m.__table__ for m in models]))
        self.uid,self.wid,self.other_wid,self.other_uid,self.refid,self.cid=[uuid.uuid4() for _ in range(6)]
        self.seen=[]
        async with self.sessions() as session:
            session.add_all([User(id=self.uid,wx_openid=f"agent-test-{self.uid}",settings={}),User(id=self.other_uid,wx_openid=f"agent-test-{self.other_uid}",settings={})])
            await session.flush()
            session.add_all([Workspace(id=self.wid,user_id=self.uid,name="我的工作台"),Workspace(id=self.other_wid,user_id=self.uid,name="其他工作台")])
            await session.flush()
            session.add_all([
                WorkspaceReflection(id=self.refid,user_id=self.uid,workspace_id=self.wid,reflection_type="micro",reflection_date=date(2026,10,7),content="唯一事实：大任务难开始，15分钟容易开始"),
                Task(id=uuid.uuid4(),user_id=self.uid,workspace_id=self.wid,title="当前空间任务"),
                Task(id=uuid.uuid4(),user_id=self.uid,workspace_id=self.other_wid,title="禁止的其他空间事实"),
                Task(id=uuid.uuid4(),user_id=self.other_uid,workspace_id=self.wid,title="禁止的其他用户事实"),
            ])
            await session.commit()
            await create_conversation(ConversationRequest(id=self.cid,workspace_id=self.wid),str(self.uid),session)

    async def asyncTearDown(self): await self.engine.dispose()

    def payload(self, **updates): return TurnRequest(**{"client_request_id":uuid.uuid4(),"question":"我今天应该先做什么？",**updates})
    def output(self, variables):
        refs=json.loads(variables["context"])
        key=next((ref["key"] for ref in refs if ref["source"]=="reflections"),None)
        return {"reply":"依据快速记录，建议先做一个15分钟的小动作。" if key else "数据不足，可以先记录你想推进的目标。",
                "citation_keys":[key] if key else [],"suggestion":{"title":"整理一条反馈","description":"选一条反馈写下问题","priority":"medium","time_block":15}}
    async def model(self, session, user_id, purpose, variables, variant):
        self.seen.append(variables)
        return self.output(variables)
    async def submit(self,payload=None,model=None):
        with patch("app.api.personal_agent.llm_service.structured_output",new=model or self.model):
            async with self.sessions() as session: return (await send_turn(self.cid,payload or self.payload(),str(self.uid),session)).data
    async def read(self):
        async with self.sessions() as session: return (await get_conversation(self.cid,str(self.uid),session)).data

    async def test_roundtrip_canonical_history_and_idempotent_response_loss(self):
        payload=self.payload()
        first=await self.submit(payload)
        replay=await self.submit(payload)
        self.assertEqual(first,replay)
        self.assertEqual(len(self.seen),1)
        with self.assertRaises(AppException): await self.submit(self.payload(client_request_id=payload.client_request_id,question="不同的原文"))
        await self.submit(self.payload(question="再具体一点？"))
        history=json.loads(self.seen[-1]["history"])
        self.assertEqual(history,[{"role":"user","content":payload.question},{"role":"assistant","content":first["reply"]}])
        self.assertEqual(len((await self.read())["turns"]),2)

    async def test_concurrent_identical_request_has_one_generation(self):
        started,release=asyncio.Event(),asyncio.Event()
        calls=[]
        async def delayed(session,uid,purpose,variables,variant):
            calls.append(variables);started.set();await release.wait();return self.output(variables)
        payload=self.payload()
        with patch("app.api.personal_agent.llm_service.structured_output",new=delayed):
            async def submit():
                async with self.sessions() as session: return (await send_turn(self.cid,payload,str(self.uid),session)).data
            running=asyncio.create_task(submit());await asyncio.wait_for(started.wait(),5)
            second=await submit()
            self.assertEqual(second["status"],"processing")
            release.set();first=await running
        self.assertEqual((len(calls),len((await self.read())["turns"]),first["status"]),(1,1,"completed"))

    async def test_failed_retry_and_confirmed_edited_action_are_single_writes(self):
        async def failure(*args): raise RuntimeError("simulated model outage")
        payload=self.payload()
        failed=await self.submit(payload,failure)
        self.assertEqual(failed["status"],"failed")
        completed=await self.submit(payload)
        self.assertEqual(failed["id"],completed["id"])
        self.assertEqual(len((await self.read())["turns"]),1)
        draft=ConfirmRequest(title="用户编辑后的行动",description="编辑说明",priority="high",time_block=20,confirmed=True)
        async def confirm():
            async with self.sessions() as session: return (await confirm_action(self.cid,uuid.UUID(completed["id"]),draft,str(self.uid),session)).data
        a,b=await asyncio.gather(confirm(),confirm())
        self.assertEqual(a["task"]["id"],b["task"]["id"])
        self.assertEqual((a["task"]["title"],a["task"]["time_block"]),(draft.title,20))
        async with self.sessions() as session:
            tasks=(await list_tasks(str(self.wid),str(self.uid),session)).data
            created=next(task for task in tasks if task.id == a["task"]["id"])
            self.assertEqual(created.agent_source,{"conversation_id":str(self.cid),"turn_id":completed["id"]})
            events=(await session.execute(select(WorkspaceEvent).where(WorkspaceEvent.workspace_id==self.wid,WorkspaceEvent.event_type=="agent_action_confirmed"))).scalars().all()
            self.assertEqual(len(events),1)
            self.assertEqual(events[0].payload["turn_id"],completed["id"])
            self.assertEqual(events[0].payload["citation_keys"],completed["citations"] and [completed["citations"][0]["key"]])

    async def test_context_covers_seven_sources_and_rejects_foreign_or_unscoped_memory(self):
        gid,request_id=uuid.uuid4(),uuid.uuid4()
        async with self.sessions() as session:
            session.add(Goal(id=gid,user_id=self.uid,workspace_id=self.wid,title="发布目标"));await session.flush()
            session.add_all([GrowthPlan(id=uuid.uuid4(),user_id=self.uid,workspace_id=self.wid,goal_id=gid,title="首月计划"),
                WorkspaceLearningItem(id=uuid.uuid4(),user_id=self.uid,workspace_id=self.wid,title="学习队列",duration_minutes=15),
                WorkspaceKnowledgeCard(id=uuid.uuid4(),user_id=self.uid,workspace_id=self.wid,title="原始知识",source_type="text",content="知识原文"),
                WorkspaceKnowledgeCard(id=uuid.uuid4(),user_id=self.uid,workspace_id=self.wid,title="不能读取的链接",source_type="url",source_url="https://example.com"),
                MemoryEntry(id=uuid.uuid4(),user_id=self.uid,source="onboarding",source_id=request_id,content="首次原话"),
                MemoryEntry(id=uuid.uuid4(),user_id=self.uid,source="manual",content="禁止的无空间记忆"),
                OnboardingSubmission(id=uuid.uuid4(),user_id=self.uid,client_request_id=request_id,request_hash="x"*64,result={"objects":[{"key":"workspace","id":str(self.wid)}]}),
            ]);await session.commit()
        await self.submit()
        refs=json.loads(self.seen[-1]["context"])
        self.assertEqual(set(ref["source"] for ref in refs),{"tasks","goals","plans","learning","knowledge_cards","reflections","memories"})
        text=json.dumps(refs,ensure_ascii=False)
        self.assertNotIn("禁止",text);self.assertNotIn("不能读取的链接",text)
        self.assertIn("不等于实际投入",text)

    async def test_closed_scope_redacts_history_source_and_blocks_confirmation(self):
        first=await self.submit()
        async with self.sessions() as session:
            user=await session.get(User,self.uid);user.settings={"privacy_scope":{"enabled_sources":[]}};await session.commit()
        response=await self.read()
        turn=response["turns"][0]
        self.assertTrue(turn["redacted"]);self.assertIsNone(turn["suggestion"])
        self.assertEqual(turn["citations"][0]["title"],"来源不可用")
        async with self.sessions() as session:
            source=(await get_source(self.cid,uuid.UUID(first["id"]),first["citations"][0]["key"],str(self.uid),session)).data
            self.assertFalse(source["available"]);self.assertEqual(source["content"],"")
            with self.assertRaises(AppException):
                await confirm_action(self.cid,uuid.UUID(first["id"]),ConfirmRequest(title="行动",description="",priority="medium",time_block=15,confirmed=True),str(self.uid),session)
        await self.submit()
        self.assertEqual(json.loads(self.seen[-1]["context"]),[])
        self.assertEqual(json.loads(self.seen[-1]["history"]),[])

    async def test_derived_memory_requires_both_scopes_and_tracks_origin_changes(self):
        mid=uuid.uuid4()
        async with self.sessions() as session:
            session.add(MemoryEntry(id=mid,user_id=self.uid,source="micro",source_id=self.refid,content="历史记录记忆"));await session.commit()
        await self.submit()
        self.assertIn(f"memories:{mid}",[ref["key"] for ref in json.loads(self.seen[-1]["context"])])
        async with self.sessions() as session:
            user=await session.get(User,self.uid);user.settings={"privacy_scope":{"enabled_sources":["memories"]}};await session.commit()
            self.assertEqual(await build_context(session,self.uid,self.wid,await settings_for(session,self.uid)),[])
            user.settings={};row=await session.get(WorkspaceReflection,self.refid);row.content="原始来源变化";await session.commit()
        self.assertTrue((await self.read())["turns"][0]["redacted"])

    async def test_privacy_change_during_generation_does_not_publish_stale_result(self):
        async def change_scope(session,uid,purpose,variables,variant):
            async with self.sessions() as other:
                user=await other.get(User,self.uid);user.settings={"privacy_scope":{"enabled_sources":[]}};await other.commit()
            return self.output(variables)
        result=await self.submit(model=change_scope)
        self.assertEqual(result["status"],"failed");self.assertIsNone(result["reply"]);self.assertIsNone(result["suggestion"])

    async def test_changed_or_archived_source_is_unavailable(self):
        result=await self.submit()
        async with self.sessions() as session:
            row=await session.get(WorkspaceReflection,self.refid);row.content="更改后的原文";await session.commit()
        self.assertTrue((await self.read())["turns"][0]["redacted"])
        async with self.sessions() as session:
            source=(await get_source(self.cid,uuid.UUID(result["id"]),result["citations"][0]["key"],str(self.uid),session)).data
            self.assertFalse(source["available"])
            workspace=await session.get(Workspace,self.wid);workspace.archived_at=datetime.now(UTC);await session.commit()
            with self.assertRaises(NotFoundException): await get_conversation(self.cid,str(self.uid),session)

    async def test_context_is_bounded_but_source_expands_full_original(self):
        original="虚构原话"*500
        async with self.sessions() as session:
            row=await session.get(WorkspaceReflection,self.refid);row.content=original;await session.commit()
        result=await self.submit()
        ref=next(ref for ref in json.loads(self.seen[-1]["context"]) if ref["source"]=="reflections")
        self.assertEqual(len(ref["content"]),1800)
        async with self.sessions() as session:
            source=(await get_source(self.cid,uuid.UUID(result["id"]),ref["key"],str(self.uid),session)).data
            self.assertIn(original,source["content"])
            row=await session.get(WorkspaceReflection,self.refid);row.content=original+"末尾变化";await session.commit()
        self.assertTrue((await self.read())["turns"][0]["redacted"])

    async def test_invalid_citation_cannot_become_a_reply_or_an_action(self):
        async def invalid(session,uid,purpose,variables,variant):
            return {**self.output(variables),"citation_keys":[f"tasks:{uuid.uuid4()}"]}
        result=await self.submit(model=invalid)
        self.assertEqual((result["status"],result["reply"],result["suggestion"]),("failed",None,None))

    async def test_user_and_workspace_isolation_applies_to_every_entry_point(self):
        result=await self.submit()
        async with self.sessions() as session:
            self.assertEqual((await list_conversations(self.other_wid,str(self.uid),session)).data,[])
            for call in (lambda: get_conversation(self.cid,str(self.other_uid),session),
                         lambda: get_source(self.cid,uuid.UUID(result["id"]),result["citations"][0]["key"],str(self.other_uid),session),
                         lambda: send_turn(self.cid,self.payload(),str(self.other_uid),session),
                         lambda: create_conversation(ConversationRequest(id=uuid.uuid4(),workspace_id=self.wid),str(self.other_uid),session)):
                with self.assertRaises(NotFoundException): await call()
                await session.rollback()

    async def test_expired_processing_recovers_and_rejects_late_worker(self):
        payload=self.payload()
        started,release=asyncio.Event(),asyncio.Event()
        async def old_model(session,uid,purpose,variables,variant):
            started.set();await release.wait();return {**self.output(variables),"reply":"过期的回复"}
        running=asyncio.create_task(self.submit(payload,old_model));await asyncio.wait_for(started.wait(),5)
        async with self.sessions() as session:
            turn=(await session.execute(select(AgentTurn).where(AgentTurn.conversation_id==self.cid))).scalar_one()
            turn.lease_until=datetime.now(UTC)-timedelta(seconds=1);await session.commit()
        self.assertEqual((await self.read())["turns"][0]["status"],"failed")
        # Explicit nested patch; the newer attempt completes before the old one is released.
        retried=await self.submit(payload,self.model)
        release.set();await running
        self.assertEqual((await self.read())["turns"][0]["reply"],retried["reply"])
        self.assertNotEqual(retried["reply"],"过期的回复")

    async def test_real_llm_boundary_routes_prompt_and_records_audit(self):
        async def provider(**kwargs):
            self.assertEqual(kwargs["model"],"qwen-plus")
            self.assertIn("标准 role/content",kwargs["messages"][1]["content"])
            return LLMResponse(content=json.dumps({"reply":"根据当前记录，先迈出一个小步骤。","citation_keys":[f"reflections:{self.refid}"],"suggestion":None}),model="qwen-plus",input_tokens=100,output_tokens=30,cost_yuan=0.001)
        with patch.object(llm_service._primary,"chat",new=provider):
            async with self.sessions() as session:
                result=(await send_turn(self.cid,self.payload(),str(self.uid),session)).data
                calls=(await session.execute(select(LLMCall).where(LLMCall.user_id==self.uid,LLMCall.purpose=="personal_agent"))).scalars().all()
        self.assertEqual(result["status"],"completed")
        self.assertEqual((len(calls),calls[0].model,calls[0].prompt_version),(1,"qwen-plus","v3"))
