import re
from typing import Self
from pydantic import BaseModel, EmailStr, field_validator, model_validator, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AccessTokenResponse(BaseModel):
    """Returned by the refresh endpoint — issues a new access token only."""
    access_token: str
    token_type: str = "bearer"


class LogoutRequest(BaseModel):
    """Client must send the refresh token so it can also be revoked on logout."""
    refresh_token: str


_PASSWORD_RE = re.compile(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$')
_PASSWORD_RULES_MSG = (
    "Password must be at least 8 characters and include "
    "an uppercase letter, a lowercase letter, and a digit."
)


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordValidationMixin(BaseModel):
    """Reusable validators for any model that has a new password + confirmation field."""

    password: str
    password_confirm: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not _PASSWORD_RE.match(v):
            raise ValueError(_PASSWORD_RULES_MSG)
        return v

    @model_validator(mode="after")
    def passwords_match(self) -> Self:
        if self.password != self.password_confirm:
            raise ValueError("Passwords do not match.")
        return self


class UserRegisterRequest(PasswordValidationMixin):
    email: EmailStr
    password: str = Field(alias="password")
    password_confirm: str = Field(alias="password_confirm")
    display_name: str | None = None

    model_config = {"populate_by_name": True}


class PasswordChangeRequest(PasswordValidationMixin):
    email: EmailStr


class PasswordResetConfirm(PasswordValidationMixin):
    token: str