import uuid

from pydantic import ValidationError

from app.api.goals import GoalCreateRequest, GoalUpdateRequest


def test_goal_requests_allow_missing_enrichment_but_reject_blank_title() -> None:
    goal = GoalCreateRequest(workspace_id=str(uuid.uuid4()), title="完成第一版")
    assert goal.due_at is None
    assert goal.target_metric is None

    try:
        GoalCreateRequest(workspace_id=str(uuid.uuid4()), title="   ")
    except ValidationError as error:
        assert "title" in str(error)
    else:
        raise AssertionError("a blank goal title should be rejected")


def test_goal_update_requires_at_least_one_field() -> None:
    try:
        GoalUpdateRequest()
    except ValidationError as error:
        assert "至少提供一项" in str(error)
    else:
        raise AssertionError("an empty goal patch should be rejected")
