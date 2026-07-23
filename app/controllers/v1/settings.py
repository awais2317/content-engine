"""Settings endpoints — read/update select fields in config.toml."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from app.config import config
from app.controllers.v1.base import new_router

router = new_router()


# Fields safe to expose in a UI; everything else stays in config.toml
# and must be edited manually.
_PUBLIC_KEYS = {
    "video_source": "string",
    "llm_provider": "string",
    "openai_api_key": "secret",
    "openai_base_url": "string",
    "openai_model_name": "string",
    "pexels_api_keys": "secret_list",
    "pixabay_api_keys": "secret_list",
    "replicate_api_key": "secret",
    "replicate_enabled": "boolean",
    "replicate_model": "string",
    "heygen_api_key": "secret",
    "heygen_enabled": "boolean",
    "heygen_default_avatar": "string",
    "heygen_default_voice": "string",
    "youtube_api_key": "secret",
    "youtube_client_id": "secret",
    "youtube_client_secret": "secret",
    "youtube_refresh_token": "secret",
    "youtube_enabled": "boolean",
    "youtube_privacy_status": "string",
}


def _mask(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "•" * len(value)
    return value[:4] + "•" * (len(value) - 8) + value[-4:]


class SettingsPayload(BaseModel):
    video_source: Optional[str] = None
    llm_provider: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_base_url: Optional[str] = None
    openai_model_name: Optional[str] = None
    pexels_api_keys: Optional[List[str]] = None
    pixabay_api_keys: Optional[List[str]] = None
    replicate_api_key: Optional[str] = None
    replicate_enabled: Optional[bool] = None
    replicate_model: Optional[str] = None
    heygen_api_key: Optional[str] = None
    heygen_enabled: Optional[bool] = None
    heygen_default_avatar: Optional[str] = None
    heygen_default_voice: Optional[str] = None
    youtube_api_key: Optional[str] = None
    youtube_client_id: Optional[str] = None
    youtube_client_secret: Optional[str] = None
    youtube_refresh_token: Optional[str] = None
    youtube_enabled: Optional[bool] = None
    youtube_privacy_status: Optional[str] = None


class SettingsResponse(BaseModel):
    data: Dict[str, Any]


def _serialize(reveal_secrets: bool = False) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for key, kind in _PUBLIC_KEYS.items():
        value = config.app.get(key)
        if kind == "secret":
            out[key] = value if reveal_secrets else _mask(value or "")
            out[f"{key}_set"] = bool(value)
        elif kind == "secret_list":
            value = value or []
            if not isinstance(value, list):
                value = [value]
            out[key] = value if reveal_secrets else [_mask(v) for v in value]
            out[f"{key}_set"] = bool(value)
        elif kind == "boolean":
            out[key] = bool(value) if value is not None else False
        else:
            out[key] = value or ""
    return out


@router.get(
    "/settings",
    response_model=SettingsResponse,
    summary="Read current settings (secrets masked)",
)
def get_settings() -> SettingsResponse:
    return SettingsResponse(data=_serialize(reveal_secrets=False))


@router.patch(
    "/settings",
    response_model=SettingsResponse,
    summary="Update settings and persist to config.toml",
)
def update_settings(payload: SettingsPayload) -> SettingsResponse:
    body = payload.model_dump(exclude_none=True)
    for key, value in body.items():
        if key not in _PUBLIC_KEYS:
            continue
        config.app[key] = value
    config.save_config()
    return SettingsResponse(data=_serialize(reveal_secrets=False))
