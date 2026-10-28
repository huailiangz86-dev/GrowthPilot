import uuid
from fastapi import APIRouter,Depends,Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.engines.learning_diagnosis import evidence_rows
from app.schemas.common import ApiResponse
router=APIRouter(prefix='/learning-diagnosis',tags=['learning-diagnosis'])
@router.get('/{workspace_id}/{item_id}/sources')
async def sources(workspace_id:uuid.UUID,item_id:uuid.UUID,user_id:str=Depends(get_current_user_id),session:AsyncSession=Depends(get_db),cursor:int=Query(0,ge=0)):
    doc,rows=await evidence_rows(session,uuid.UUID(user_id),workspace_id,item_id,offset=cursor)
    return ApiResponse(success=True,data={'version':doc.version,'next_cursor':cursor+100 if len(rows)>100 else None,'items':[{k:v for k,v in r.items() if k!='text'}|{'characters':len(r['text']),'preview':r['text'][:200]} for r in rows[:100]]})
