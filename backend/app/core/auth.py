# password hashing
from passlib.context import CryptContext

password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(plain: str) -> str:
    return password_context.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    return password_context.verify(plain, hashed)


# token exception
class TokenError(Exception):
    """JWT validation failure"""


# access and refresh token creation
import uuid
from jose import jwt, ExpiredSignatureError, JWTError
from datetime import datetime, timedelta, timezone
from app.core.config import settings
from app.core.redis import get_redis

BLOCKLIST_PREFIX = "blocklist:"

def _make_token(user_id: str, token_type: str, expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        claims={
            "sub": user_id,
            "type": token_type,
            "iat": now,
            "exp": now + expires_delta,
            "jti": str(uuid.uuid4()),
        },
        key=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )

def create_access_token(user_id: str) -> str:
    return _make_token(user_id, "access", timedelta(minutes=settings.jwt_access_expire_minutes))

def create_refresh_token(user_id: str) -> str:
    return _make_token(user_id, "refresh", timedelta(days=settings.jwt_refresh_expire_days))


# token decoding
def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except ExpiredSignatureError:
        raise TokenError("Token has expired")
    except JWTError:
        raise TokenError("Invalid token")


# token revocation
async def revoke_token(claims: dict) -> None:
    jti = claims.get("jti")
    exp = claims.get("exp")
    if not jti or not exp:
        return
    ttl = int(exp - datetime.now(timezone.utc).timestamp())
    if ttl > 0:
        r = await get_redis()
        await r.setex(f"{BLOCKLIST_PREFIX}{jti}", ttl, "1")

async def _check_blocklist(payload: dict) -> None:
    jti = payload.get("jti")
    if not jti:
        raise TokenError("Invalid token payload")
    r = await get_redis()
    if await r.exists(f"{BLOCKLIST_PREFIX}{jti}"):
        raise TokenError("Token has been revoked")


# fastapi dependencies
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.models.user import User

bearer = HTTPBearer(auto_error=False)

def _401(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )

async def _validated_payload(
    credentials: HTTPAuthorizationCredentials | None,
    expected_type: str,
) -> dict:
    if credentials is None:
        raise _401("Not authenticated")
    try:
        payload = decode_token(credentials.credentials)
    except TokenError as e:
        raise _401(str(e))
    if payload.get("type") != expected_type:
        raise _401("Invalid token type")
    user_id = payload.get("sub")
    if not user_id:
        raise _401("Invalid token payload")
    try:
        await _check_blocklist(payload)
    except TokenError as e:
        raise _401(str(e))
    return payload

async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> User:
    payload = await _validated_payload(credentials, "access")
    user = await User.get(payload["sub"])
    if not user:
        raise _401("User not found")
    if not user.is_active:
        raise _401("Account is deactivated")
    # If the user changed their password (or an admin force-invalidated sessions),
    # tokens issued before that moment are no longer valid.
    if user.tokens_invalidated_at is not None:
        token_iat = payload.get("iat")
        if token_iat is not None:
            invalidated_ts = user.tokens_invalidated_at.timestamp()
            if token_iat < invalidated_ts:
                raise _401("Session expired — please log in again")
    return user

async def get_refresh_payload(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    return await _validated_payload(credentials, "refresh")

def assert_ownership(resource, user_id: str, name: str = "Resource") -> None:
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{name} not found")
    if str(resource.user_id) != str(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
