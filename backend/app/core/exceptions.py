class AppException(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class UnauthorizedException(AppException):
    def __init__(self, message: str = "Unauthorized"):
        super().__init__("UNAUTHORIZED", message, 401)


class ForbiddenException(AppException):
    def __init__(self, message: str = "Forbidden"):
        super().__init__("FORBIDDEN", message, 403)


class NotFoundException(AppException):
    def __init__(self, resource: str = "Resource"):
        super().__init__("NOT_FOUND", f"{resource} not found", 404)


class QuotaExceededException(AppException):
    def __init__(self, message: str = "Quota exceeded"):
        super().__init__("QUOTA_EXCEEDED", message, 429)


class LLMServiceException(AppException):
    def __init__(self, message: str = "AI service temporarily unavailable"):
        super().__init__("LLM_ERROR", message, 503)


class RateLimitedException(AppException):
    def __init__(self, message: str = "请求太频繁，请稍后再试"):
        super().__init__("RATE_LIMITED", message, 429)


class ValidationException(AppException):
    def __init__(self, message: str = "Invalid input"):
        super().__init__("VALIDATION_ERROR", message, 422)
