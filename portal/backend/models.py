"""Public response contracts; OpenAPI is generated from these models."""

from typing import Literal

from pydantic import BaseModel, JsonValue


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    backend: Literal["available"]
    core: Literal["available", "unavailable"]


class VersionResponse(BaseModel):
    portal: str
    core: str


class Option(BaseModel):
    id: str
    label: str


class Provider(BaseModel):
    id: str
    models: dict[str, list[Option]]
    allows_custom_model: bool


class SettingDescriptor(BaseModel):
    key: str
    value_type: str
    read_only: Literal[True] = True


class LanguageCapability(BaseModel):
    mode: Literal["free_text"] = "free_text"
    suggestions: list[str]
    description: str = "Core accepts a language name; suggestions are not an exhaustive list."


class RuntimeCapabilities(BaseModel):
    analysis_execution: Literal[False] = False
    history: Literal[False] = False
    settings_write: Literal[False] = False


class CapabilitiesResponse(BaseModel):
    providers: list[Provider]
    analysts: list[Option]
    configurable_settings: list[SettingDescriptor]
    output_languages: LanguageCapability
    runtime: RuntimeCapabilities


class SettingsResponse(BaseModel):
    source: Literal["core_defaults_and_environment"] = "core_defaults_and_environment"
    read_only: Literal[True] = True
    values: dict[str, JsonValue]


class ErrorResponse(BaseModel):
    detail: str


class UserIdentity(BaseModel):
    subject: str
    email: str
    name: str


class AuthStatus(BaseModel):
    provider: Literal["google"] = "google"
    configured: bool
