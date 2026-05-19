"""
User Router — Registration, login, and per-user portfolio persistence.

Enables multi-user deployment: each user's portfolio is stored server-side
in data/users/<username>.json so multiple people can use the same instance.

Token: HMAC-SHA256, base64url-encoded, 30-day expiry.
No external JWT library required.
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import List, Any, Optional
import json, os, hashlib, hmac, secrets, time, base64

router = APIRouter(prefix="/api/user", tags=["User"])

# ── Config ──────────────────────────────────────────────────────────────────
USERS_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "users")
os.makedirs(USERS_DIR, exist_ok=True)

# In production, set PORTFOLIO_SECRET env var. The fallback is only for local dev.
_env_secret = os.environ.get("PORTFOLIO_SECRET")
if not _env_secret and os.environ.get("ENV", "dev") not in ("dev", "development", "local"):
    raise RuntimeError("PORTFOLIO_SECRET env var is required in non-dev environments")
SECRET = (_env_secret or "portfolio-analytics-local-dev-only").encode("utf-8")


# ── Token helpers ────────────────────────────────────────────────────────────
def _make_token(username: str) -> str:
    expiry = int(time.time()) + 86400 * 30          # 30-day validity
    payload = f"{username}|{expiry}"
    sig = hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()[:24]
    raw = f"{payload}|{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _verify_token(token: str) -> Optional[str]:
    """Returns username if valid, None otherwise. Uses constant-time comparison."""
    try:
        raw = base64.urlsafe_b64decode(token.encode() + b"==").decode()
        parts = raw.split("|")
        if len(parts) != 3:
            return None
        username, expiry_str, sig = parts
        if time.time() > int(expiry_str):
            return None
        expected = hmac.new(SECRET, f"{username}|{expiry_str}".encode(), hashlib.sha256).hexdigest()[:24]
        if not hmac.compare_digest(sig, expected):
            return None
        return username
    except Exception:
        return None


# ── User file helpers ────────────────────────────────────────────────────────
def _user_path(username: str) -> str:
    safe = "".join(c for c in username.lower() if c.isalnum() or c in "-_")
    return os.path.join(USERS_DIR, f"{safe}.json")


def _load_user(username: str) -> Optional[dict]:
    path = _user_path(username)
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def _save_user(username: str, data: dict) -> None:
    with open(_user_path(username), "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _hash_pw(password: str, salt: Optional[bytes] = None) -> str:
    """
    Hash a password with scrypt + per-user salt.
    Stored format: scrypt$<salt_b64>$<hash_b64>

    Why scrypt: memory-hard, ~100ms per attempt — makes offline brute-force
    impractical even if the users/ directory leaks. The previous SHA-256 hash
    was ~10ns per attempt and shared a global salt, so two users with the
    same password produced identical hashes.
    """
    if salt is None:
        salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=2**14, r=8, p=1,
        dklen=32,
    )
    return f"scrypt${base64.b64encode(salt).decode()}${base64.b64encode(derived).decode()}"


def _verify_pw(password: str, stored: str) -> bool:
    """Constant-time password verification. Supports legacy SHA-256 hashes for migration."""
    if not stored:
        return False
    if stored.startswith("scrypt$"):
        try:
            _, salt_b64, _ = stored.split("$", 2)
            salt = base64.b64decode(salt_b64)
            candidate = _hash_pw(password, salt)
            return hmac.compare_digest(candidate, stored)
        except Exception:
            return False
    # Legacy: bare SHA-256 hex from earlier versions. Verified for migration only.
    legacy = hashlib.sha256(f"{password}|{SECRET.decode()}".encode()).hexdigest()
    return hmac.compare_digest(legacy, stored)


# ── Auth dependency ───────────────────────────────────────────────────────────
_bearer = HTTPBearer(auto_error=False)


def _current_user(creds: HTTPAuthorizationCredentials = Depends(_bearer)) -> str:
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    username = _verify_token(creds.credentials)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired token — please log in again")
    return username


# ── Request / Response models ────────────────────────────────────────────────
class AuthReq(BaseModel):
    username: str
    password: str


class PortfolioSaveReq(BaseModel):
    portfolio: List[Any]


# ── Endpoints ────────────────────────────────────────────────────────────────
@router.post("/register", summary="Create a new account")
def register(req: AuthReq):
    username = req.username.strip().lower()
    if len(username) < 3:
        raise HTTPException(400, "Username must be at least 3 characters")
    if not username.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(400, "Username may only contain letters, numbers, hyphens, and underscores")
    if len(req.password) < 4:
        raise HTTPException(400, "Password must be at least 4 characters")
    if _load_user(username):
        raise HTTPException(409, "Username already taken — please choose another")

    _save_user(username, {
        "username": username,
        "password_hash": _hash_pw(req.password),
        "portfolio": [],
        "created_at": int(time.time()),
    })
    token = _make_token(username)
    return {"token": token, "username": username, "message": "Account created successfully"}


@router.post("/login", summary="Log in to an existing account")
def login(req: AuthReq):
    username = req.username.strip().lower()
    user = _load_user(username)
    if not user or not _verify_pw(req.password, user.get("password_hash", "")):
        raise HTTPException(401, "Invalid username or password")

    # Lazy migration: upgrade legacy SHA-256 hashes to scrypt on successful login.
    if not user.get("password_hash", "").startswith("scrypt$"):
        user["password_hash"] = _hash_pw(req.password)
        _save_user(username, user)

    token = _make_token(username)
    return {
        "token": token,
        "username": username,
        "portfolio": user.get("portfolio", []),
    }


@router.get("/me", summary="Get current user info and portfolio")
def me(username: str = Depends(_current_user)):
    user = _load_user(username)
    if not user:
        raise HTTPException(404, "User data not found")
    return {
        "username": username,
        "portfolio": user.get("portfolio", []),
        "created_at": user.get("created_at"),
    }


@router.put("/portfolio", summary="Save portfolio to server")
def save_portfolio(req: PortfolioSaveReq, username: str = Depends(_current_user)):
    user = _load_user(username)
    if not user:
        raise HTTPException(404, "User data not found")
    user["portfolio"] = req.portfolio
    user["portfolio_updated_at"] = int(time.time())
    _save_user(username, user)
    return {"saved": True, "count": len(req.portfolio), "username": username}
