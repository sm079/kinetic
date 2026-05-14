"""Tests for register / login / refresh / logout endpoints."""
import pytest


REG_PAYLOAD = {
    "email": "user@example.com",
    "display_name": "Test User",
    "password": "TestPass1!",
    "password_confirm": "TestPass1!",
}


async def test_register_returns_tokens(client):
    res = await client.post("/api/auth/register", json=REG_PAYLOAD)
    assert res.status_code == 201
    body = res.json()
    assert "access_token" in body
    assert "refresh_token" in body


async def test_register_duplicate_email(client):
    await client.post("/api/auth/register", json=REG_PAYLOAD)
    res = await client.post("/api/auth/register", json=REG_PAYLOAD)
    assert res.status_code == 409


async def test_login_success(client):
    await client.post("/api/auth/register", json=REG_PAYLOAD)
    res = await client.post("/api/auth/login", json={
        "email": REG_PAYLOAD["email"],
        "password": REG_PAYLOAD["password"],
    })
    assert res.status_code == 200
    assert "access_token" in res.json()


async def test_login_wrong_password(client):
    await client.post("/api/auth/register", json=REG_PAYLOAD)
    res = await client.post("/api/auth/login", json={
        "email": REG_PAYLOAD["email"],
        "password": "WrongPass1!",
    })
    assert res.status_code == 401


async def test_refresh_token(client):
    reg = await client.post("/api/auth/register", json=REG_PAYLOAD)
    refresh_token = reg.json()["refresh_token"]
    res = await client.post(
        "/api/auth/refresh",
        headers={"Authorization": f"Bearer {refresh_token}"},
    )
    assert res.status_code == 200
    assert "access_token" in res.json()


async def test_logout_blocks_token(client):
    reg = await client.post("/api/auth/register", json=REG_PAYLOAD)
    body = reg.json()
    access = body["access_token"]
    refresh = body["refresh_token"]

    res = await client.post(
        "/api/auth/logout",
        json={"refresh_token": refresh},
        headers={"Authorization": f"Bearer {access}"},
    )
    assert res.status_code == 204

    # After logout, the refresh token should be rejected
    res2 = await client.post(
        "/api/auth/refresh",
        headers={"Authorization": f"Bearer {refresh}"},
    )
    assert res2.status_code == 401


async def test_me_requires_auth(client):
    res = await client.get("/api/users/me")
    assert res.status_code == 401


async def test_me_returns_profile(client, auth_headers):
    res = await client.get("/api/users/me", headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["email"] == "test@example.com"
    assert body["display_name"] == "Test User"
