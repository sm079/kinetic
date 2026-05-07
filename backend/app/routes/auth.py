import secrets

from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import HTTPAuthorizationCredentials

from app.core.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_refresh_payload,
    decode_token,
    revoke_token,
    bearer,
    TokenError,
)
from app.core.redis import get_redis
from app.schemas.auth import (
    UserRegisterRequest,
    LoginRequest,
    LogoutRequest,
    TokenResponse,
    AccessTokenResponse,
    PasswordResetRequest,
    PasswordResetConfirm,
)
from app.models.user import User

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

_RESET_TTL = 900  # 15 minutes
_RESET_KEY  = "pwd_reset:{}"


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: UserRegisterRequest) -> TokenResponse:
    if await User.find_one(User.email == body.email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        display_name=body.display_name,
        email=body.email,
        password_hash=hash_password(body.password),
    )
    await user.insert()

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest) -> TokenResponse:
    user = await User.find_one(User.email == body.email)
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh(payload: dict = Depends(get_refresh_payload)) -> AccessTokenResponse:
    return AccessTokenResponse(access_token=create_access_token(payload["sub"]))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    body: LogoutRequest,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    _user: User = Depends(get_current_user),
) -> None:
    try:
        access_payload = decode_token(credentials.credentials)
        await revoke_token(access_payload)
    except TokenError:
        pass

    try:
        refresh_payload = decode_token(body.refresh_token)
        if refresh_payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid refresh token")
        await revoke_token(refresh_payload)
    except TokenError:
        pass


@router.post("/password-reset/request", status_code=status.HTTP_200_OK)
async def request_password_reset(body: PasswordResetRequest) -> dict:
    user = await User.find_one(User.email == body.email)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No account with that email.")

    token = secrets.token_urlsafe(32)
    r = await get_redis()
    await r.setex(_RESET_KEY.format(token), _RESET_TTL, str(user.id))
    return {"token": token}


@router.post("/password-reset/confirm", status_code=status.HTTP_200_OK)
async def confirm_password_reset(body: PasswordResetConfirm) -> dict:
    r = await get_redis()
    key = _RESET_KEY.format(body.token)
    user_id = await r.get(key)

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset link is invalid or has expired.",
        )

    user = await User.get(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset link is invalid or has expired.",
        )

    user.password_hash = hash_password(body.password)
    await user.save()
    await r.delete(key)

    return {"message": "Password updated. You can now sign in."}
