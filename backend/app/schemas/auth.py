from pydantic import BaseModel, Field


class SmsCodeRequest(BaseModel):
    phone: str = Field(..., min_length=11, max_length=11, pattern=r"^1[3-9]\d{9}$")


class PhoneLoginRequest(SmsCodeRequest):
    code: str = Field(..., min_length=6, max_length=6)


class WxLoginRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=128)
    nickname: str = Field(default="", max_length=64)
    avatar_url: str = Field(default="", max_length=512)
    markets: list[str] = Field(default=["A"])  # ["A","HK","US","CRYPTO"]
    review_schedule: str = Field(default="manual", pattern=r"^(post_trade|daily|manual)$")


class AuthResponse(BaseModel):
    access_token: str
    user_id: str
    is_new_user: bool
    is_beta_user: bool
    beta_number: int | None = None


class UserMeResponse(BaseModel):
    id: str
    nickname: str
    avatar_url: str
    markets: list[str]
    review_schedule: str
    is_beta_user: bool
    beta_number: int | None


class UserUpdateRequest(BaseModel):
    nickname: str | None = None
    markets: list[str] | None = None
    review_schedule: str | None = Field(None, pattern=r"^(post_trade|daily|manual)$")
    review_time: str | None = None
