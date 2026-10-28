"""Create a sourced learning flow atomically from a person-owned frozen version."""
import uuid
from fastapi import APIRouter, Depends
from pydantic import Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.personal_work import Strict
from app.api.personal_sources import owned_version
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import ValidationException
from app.engines.learning_engine import create_learning_item
from app.engines.mutation_receipts import prepare_mutation, record_mutation
from app.engines.workspace_engine import get_workspace, append_event
from app.models.learning_review import LearningReviewUnit
from app.schemas.common import ApiResponse
from app.core.exceptions import NotFoundException

router = APIRouter(prefix='/source-learning', tags=['source-learning'])

class SourceLearningCreate(Strict):
    request_id: uuid.UUID
    workspace_id: uuid.UUID
    source_id: uuid.UUID
    version: int = Field(ge=1)
    checksum: str = Field(pattern=r'^[a-f0-9]{64}$')
    chunk_id: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=240)
    question: str = Field(min_length=1, max_length=2000)
    application_goal: str = Field(min_length=1, max_length=2000)

    @field_validator('title', 'question', 'application_goal')
    @classmethod
    def nonblank(cls, value):
        if not value.strip(): raise ValueError('请填写学习标题、实际应用目标和问题')
        return value.strip()

async def create_from_source(session, uid, payload):
    workspace = await get_workspace(session, uid, payload.workspace_id)
    if not workspace: raise NotFoundException('Workspace')
    fp, receipt = await prepare_mutation(session, uid, workspace.id, payload.request_id, 'source_learning_create', payload)
    if receipt is not None: return receipt
    version = await owned_version(session, uid, payload.source_id, payload.version)
    if version.status != 'ready' or version.checksum != payload.checksum:
        raise ValidationException('原版本未就绪或校验值不一致，请重新读取资料')
    chunk = next((c for c in (version.extraction or {}).get('chunks', []) if c['id'] == payload.chunk_id), None)
    if not chunk or not chunk['text'].strip() or len(chunk['text']) > 12000:
        raise ValidationException('请选择真实原文片段，最多 12000 字')
    item = await create_learning_item(session, workspace=workspace, values={
        'title': payload.title, 'summary': payload.application_goal, 'kind': 'note', 'source_url': version.source_url})
    await session.flush()
    unit = LearningReviewUnit(id=uuid.uuid5(item.id, str(payload.request_id)), user_id=uid, workspace_id=workspace.id,
        item_id=item.id, question=payload.question, kind='question', source={
            'kind': 'personal_source', 'source_id': str(version.source_id), 'revision_id': str(version.id),
            'version': version.version, 'checksum': version.checksum, 'chunk_id': chunk['id'],
            'title': version.title, 'page': chunk['page'], 'start': chunk['start'], 'end': chunk['end'],
            'quote': chunk['text'], 'application_goal': payload.application_goal, 'flow_version': 1})
    session.add(unit)
    await append_event(session, user_id=uid, workspace_id=workspace.id, event_type='learning_review_unit_created',
        source_type='learning_review', source_id=unit.id, payload={'source_id': str(version.source_id), 'version': version.version})
    await session.flush()
    result = {'item_id': str(item.id), 'unit_id': str(unit.id), 'workspace_id': str(workspace.id),
        'source_id': str(version.source_id), 'source_version': version.version}
    record_mutation(session, uid, workspace.id, payload.request_id, fp, ApiResponse(success=True, data=result))
    # Keep the receipt shape identical to the endpoint's first response.
    await session.commit()
    return ApiResponse(success=True, data=result).model_dump(mode='json')

@router.post('')
async def create(payload: SourceLearningCreate, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    result = await create_from_source(session, uuid.UUID(user_id), payload)
    return result
