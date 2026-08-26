import uuid

from pydantic import ValidationError

from app.api.growth_plans import GrowthPlanCreateRequest, GrowthPlanUpdateRequest


def test_growth_plan_request_normalizes_milestones() -> None:
    payload = GrowthPlanCreateRequest(
        workspace_id=str(uuid.uuid4()),
        goal_id=str(uuid.uuid4()),
        title="第一周行动计划",
        milestones=["明确主线", "  ", "完成一次复盘"],
    )

    assert payload.milestones == ["明确主线", "完成一次复盘"]
    assert payload.period_type == "weekly"


def test_growth_plan_update_rejects_empty_patch() -> None:
    try:
        GrowthPlanUpdateRequest()
    except ValidationError as error:
        assert "至少提供一项" in str(error)
    else:
        raise AssertionError("an empty growth plan patch should be rejected")
