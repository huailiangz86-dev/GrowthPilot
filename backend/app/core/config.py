from typing import Literal

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "GrowthPilot"
    DEBUG: bool = False
    APP_ENV: Literal["development", "test", "production"] = "production"
    DEV_AUTH_ENABLED: bool = False
    API_V1_PREFIX: str = "/api/v1"
    PUBLIC_BASE_URL: str = ""

    DATABASE_URL: str = "postgresql+asyncpg://zhang@localhost:5432/growthpilot_dev"
    REDIS_URL: str = "redis://localhost:6379/6"

    JWT_SECRET: str = "growthpilot-change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_DAYS: int = 7
    ENCRYPTION_KEY: str = "growthpilot-aes256-key-32-chars!"

    # Mini program
    WX_APP_ID: str = ""
    WX_APP_SECRET: str = ""
    # Open platform (web QR login) — register at open.weixin.qq.com
    WX_WEB_APP_ID: str = ""
    WX_WEB_APP_SECRET: str = ""
    WX_WEB_REDIRECT_URI: str = ""

    QWEN_API_KEY: str = ""
    QWEN_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    # Optional cloud knowledge test connection. Keys stay server-side; an
    # explicit owner binds this shared reference library to one local account.
    BAILIAN_CONFIG_ENV_FILE: str = ""
    BAILIAN_OWNER_USER_ID: str = ""
    BAILIAN_ACCESS_KEY_ID: str = ""
    BAILIAN_ACCESS_KEY_SECRET: str = ""
    BAILIAN_WORKSPACE_ID: str = ""
    BAILIAN_INDEX_ID: str = ""
    BAILIAN_ENDPOINT: str = "bailian.cn-beijing.aliyuncs.com"
    BAILIAN_PERSONAL_IMPORT_ENABLED: bool = False
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"

    OSS_ACCESS_KEY_ID: str = ""
    OSS_ACCESS_KEY_SECRET: str = ""
    OSS_BUCKET: str = "growthpilot-assets"
    OSS_ENDPOINT: str = "oss-cn-hangzhou.aliyuncs.com"

    # Aliyun SMS
    ALIBABA_SMS_ACCESS_KEY_ID: str = ""
    ALIBABA_SMS_ACCESS_KEY_SECRET: str = ""
    ALIBABA_SMS_SIGN_NAME: str = "福文科技"
    ALIBABA_SMS_TEMPLATE_CODE: str = "SMS_504765485"

    ARQ_JOB_TIMEOUT_SECONDS: int = 600
    ARQ_MAX_JOBS: int = 10
    WEB_PUSH_ENABLED: bool = False
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_SUBJECT: str = ""

    EXECUTION_ENABLED: bool = True
    EXECUTION_POLL_SECONDS: int = 15

    BETA_USER_LIMIT: int = 200

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
