"""D7 user's source-linked knowledge library, derived from saved records without copies."""
import uuid
from datetime import datetime
from typing import Annotated
from fastapi import APIRouter,Depends,Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.personal_work import scope,owned,document
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import AppException,NotFoundException,ValidationException
from app.engines.knowledge_search import retrieve,search_terms
from app.models.personal_work import PersonalDocument,DocumentRevision
from app.models.workspace_learning_item import WorkspaceLearningItem
from app.models.learning_material import LearningMaterial
from app.models.workspace_knowledge_card import WorkspaceKnowledgeCard
from app.schemas.common import ApiResponse
router=APIRouter(prefix='/learning-knowledge',tags=['learning-knowledge'])
FIELDS={'content':'学习内容','notes':'学习笔记','insights':'学习心得','questions':'学习疑问','exercise':'练习','outcome':'应用成果'}

def summary(key,kind,title,text,item_id,source,updated_at,terms):
    found=retrieve(title,text,terms)
    if found is None:return None
    return {'key':key,'kind':kind,'title':title,'item_id':str(item_id) if item_id else None,
        'characters':len(text),'source':source,'updated_at':updated_at.isoformat(),**found}

async def library(s,uid,wid,q='',kind='all',page=1,page_size=30,mode='literal',order='newest'):
    await scope(s,uid,wid)
    try:terms=search_terms(q,mode)
    except ValueError as error:raise ValidationException(str(error)) from error
    entries=[]
    def add(*args):
        entry=summary(*args,terms)
        if entry is not None:entries.append(entry)
    docs=await s.stream(select(PersonalDocument,WorkspaceLearningItem.title).join(WorkspaceLearningItem,PersonalDocument.learning_item_id==WorkspaceLearningItem.id).where(
        PersonalDocument.user_id==uid,PersonalDocument.workspace_id==wid,WorkspaceLearningItem.archived_at.is_(None),WorkspaceLearningItem.user_id==uid,WorkspaceLearningItem.workspace_id==wid).execution_options(yield_per=20))
    async for doc,title in docs:
        source={'kind':'document','document_id':str(doc.id),'version':doc.version,'title':title}
        for field,label in FIELDS.items():
            text=str(doc.content.get(field,''))
            if text.strip():add(f'doc:{doc.learning_item_id}:{field}',field,f'{title} · {label}',text,doc.learning_item_id,{**source,'field':field},doc.updated_at)
        for entry in doc.content.get('journal',[]):
            text=entry.get('body','');label='学习笔记' if entry['kind']=='note' else '学习心得'
            if text.strip():add(f'entry:{doc.learning_item_id}:{entry["id"]}', 'notes' if entry['kind']=='note' else 'insights',f'{title} · {entry["date"]} · {entry.get("title") or label}',text,doc.learning_item_id,{**source,'field':'journal','entry_id':entry['id'],'date':entry['date']},doc.updated_at)
    materials=await s.stream(select(LearningMaterial,WorkspaceLearningItem.title).join(WorkspaceLearningItem,LearningMaterial.item_id==WorkspaceLearningItem.id).where(
        LearningMaterial.user_id==uid,LearningMaterial.workspace_id==wid,LearningMaterial.status=='ready',WorkspaceLearningItem.archived_at.is_(None),WorkspaceLearningItem.user_id==uid,WorkspaceLearningItem.workspace_id==wid).execution_options(yield_per=10))
    async for m,title in materials:
        text=(m.extraction or {}).get('text','')
        add(f'material:{m.id}', 'material',m.title,text,m.item_id,{'kind':'material','title':title,'material_id':str(m.id),'checksum':m.checksum,'page_count':(m.extraction or {}).get('page_count')},m.updated_at)
    cards=await s.stream_scalars(select(WorkspaceKnowledgeCard).where(WorkspaceKnowledgeCard.user_id==uid,WorkspaceKnowledgeCard.workspace_id==wid,WorkspaceKnowledgeCard.archived_at.is_(None)).execution_options(yield_per=20))
    async for c in cards:
        text=c.content or c.ai_summary or ''
        add(f'card:{c.id}','card',c.title,text,None,{'kind':'card','card_id':str(c.id),'source_url':c.source_url,'status':c.status,'ai_status':c.ai_status},c.updated_at)
    counts={}
    for e in entries:counts[e['kind']]=counts.get(e['kind'],0)+1
    rows=sorted((e for e in entries if kind=='all' or e['kind']==kind),key=lambda e:(e['updated_at'],e['key']),reverse=True)
    if order=='relevance' and terms:rows.sort(key=lambda e:e['rank'],reverse=True)
    start=(page-1)*page_size
    return {'items':[{k:v for k,v in e.items() if k!='rank'} for e in rows[start:start+page_size]],'total':len(rows),'counts':counts,'page':page,'page_size':page_size,'search_mode':mode,'order':order,'terms':terms,'query':q}

@router.get('/{workspace_id}')
async def listing(workspace_id:uuid.UUID,q:str=Query('',max_length=120),kind:str=Query('all',pattern='^(all|content|notes|insights|questions|exercise|outcome|material|card)$'),page:int=Query(1,ge=1),page_size:int=Query(30,ge=1,le=50),mode:str=Query('literal',pattern='^(literal|keywords)$'),order:str=Query('newest',pattern='^(newest|relevance)$'),user_id:str=Depends(get_current_user_id),session:AsyncSession=Depends(get_db)):
    return ApiResponse(success=True,data=await library(session,uuid.UUID(user_id),workspace_id,q.strip(),kind,page,page_size,mode,order))

@router.get('/{workspace_id}/entry')
async def detail(workspace_id:uuid.UUID,key:str=Query(max_length=150),version:int|None=Query(None,ge=1),user_id:str=Depends(get_current_user_id),session:AsyncSession=Depends(get_db),expected_updated_at:Annotated[datetime|None,Query()]=None):
    uid=uuid.UUID(user_id);await scope(session,uid,workspace_id)
    try:parts=key.split(':');entity_id=uuid.UUID(parts[1])
    except (ValueError,IndexError):raise NotFoundException('KnowledgeEntry')
    if parts[0] in ('doc','entry') and len(parts)==3:
        item=await owned(session,WorkspaceLearningItem,uid,workspace_id,entity_id);doc=await document(session,uid,workspace_id,'learning_item',entity_id)
        if not doc:raise NotFoundException('LearningDocument')
        content=doc.content;actual=doc.version
        if version is not None:
            revision=await session.scalar(select(DocumentRevision).where(DocumentRevision.document_id==doc.id,DocumentRevision.version==version))
            if not revision:raise NotFoundException('DocumentRevision')
            content=revision.content;actual=revision.version
        if parts[0]=='doc' and parts[2] in FIELDS:text=content.get(parts[2],'')
        elif parts[0]=='entry':text=next((e.get('body','') for e in content.get('journal',[]) if e['id']==parts[2]),None)
        else:text=None
        if text is None:raise NotFoundException('KnowledgeEntry')
        return ApiResponse(success=True,data={'key':key,'text':text,'title':content.get('title',item.title),'version':actual,'item_id':str(item.id),'source_kind':'document'})
    if parts[0]=='material' and len(parts)==2:
        m=await session.scalar(select(LearningMaterial).where(LearningMaterial.id==entity_id,LearningMaterial.user_id==uid,LearningMaterial.workspace_id==workspace_id,LearningMaterial.status=='ready'))
        if not m:raise NotFoundException('LearningMaterial')
        await owned(session,WorkspaceLearningItem,uid,workspace_id,m.item_id)
        return ApiResponse(success=True,data={'key':key,'text':m.extraction['text'],'title':m.title,'item_id':str(m.item_id),'source_kind':'material','checksum':m.checksum})
    if parts[0]=='card' and len(parts)==2:
        c=await owned(session,WorkspaceKnowledgeCard,uid,workspace_id,entity_id)
        if expected_updated_at is not None and c.updated_at!=expected_updated_at:raise AppException('VERSION_CONFLICT','知识卡已变化，请刷新检索后再核对原文。',409)
        return ApiResponse(success=True,data={'key':key,'text':c.content or c.ai_summary or '', 'title':c.title,'source_kind':'card','source_url':c.source_url})
    raise NotFoundException('KnowledgeEntry')
