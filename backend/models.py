"""Public response contracts; OpenAPI is generated from these models."""

import re
from datetime import date
from typing import Literal, Self

from pydantic import BaseModel, Field, JsonValue, field_validator, model_validator


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    application: Literal["available"]
    core: Literal["available", "unavailable"]


class VersionResponse(BaseModel):
    ui: str
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
    description: str = "Core nhận tên ngôn ngữ dạng văn bản; danh sách gợi ý không đầy đủ."


class RuntimeCapabilities(BaseModel):
    analysis_execution: Literal[True] = True
    history: Literal[True] = True
    settings_write: bool = False


class AnalysisCreate(BaseModel):
    ticker: str
    trade_date: str
    asset_type: Literal["stock", "crypto"] = "stock"
    analysts: list[Literal["market", "social", "news", "fundamentals"]]

    @field_validator("ticker")
    @classmethod
    def validate_ticker(cls, value: str) -> str:
        value = value.strip().upper()
        if not re.fullmatch(r"[A-Z0-9^][A-Z0-9.^=+\-]{0,31}", value):
            raise ValueError("Enter a valid ticker.")
        return value

    @field_validator("trade_date")
    @classmethod
    def validate_trade_date(cls, value: str) -> str:
        try:
            parsed = date.fromisoformat(value)
        except ValueError:
            raise ValueError("Date must use YYYY-MM-DD format.") from None
        if parsed.isoformat() != value:
            raise ValueError("Date must use YYYY-MM-DD format.")
        return value

    @model_validator(mode="after")
    def validate_asset_analysts(self) -> Self:
        if self.asset_type == "crypto" and "fundamentals" in self.analysts:
            raise ValueError("Fundamentals analysis is not available for crypto.")
        return self


class ScanPlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    tickers: list[str] = Field(min_length=1, max_length=20)
    frequency: Literal["daily", "weekly"] = "daily"
    asset_type: Literal["stock", "crypto"] = "stock"
    analysts: list[Literal["market", "social", "news", "fundamentals"]] = Field(min_length=1)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Enter a name for this scan.")
        return value

    @field_validator("tickers")
    @classmethod
    def clean_tickers(cls, values: list[str]) -> list[str]:
        if len(values) > 20:
            raise ValueError("Enter at most 20 tickers.")
        cleaned = list(dict.fromkeys(value.strip().upper() for value in values if value.strip()))
        if (
            not cleaned
            or len(cleaned) > 20
            or any(not re.fullmatch(r"[A-Z0-9^][A-Z0-9.^=+\-]{0,31}", value) for value in cleaned)
        ):
            raise ValueError("Enter between 1 and 20 valid tickers.")
        return cleaned

    @model_validator(mode="after")
    def validate_asset_analysts(self) -> Self:
        if self.asset_type == "crypto" and "fundamentals" in self.analysts:
            raise ValueError("Fundamentals analysis is not available for crypto.")
        return self


class ScanPlan(ScanPlanCreate):
    id: str
    enabled: bool
    next_run_at: str
    last_run_at: str | None = None


class AnalysisResult(BaseModel):
    final_rating: str | None = None
    final_trade_decision: str | None = None
    reports: dict[str, JsonValue] = Field(default_factory=dict)


class AnalysisStep(BaseModel):
    key: str
    label: str
    status: Literal["waiting", "running", "completed"]


class AnalysisMessage(BaseModel):
    speaker: str
    content: str


class AnalysisProgress(BaseModel):
    phase: str
    label: str
    attempt: int = 1
    max_attempts: int = 2
    steps: list[AnalysisStep] = Field(default_factory=list)
    reports: dict[str, str] = Field(default_factory=dict)
    messages: list[AnalysisMessage] = Field(default_factory=list)


class AnalysisJob(BaseModel):
    id: str
    ticker: str
    trade_date: str
    asset_type: Literal["stock", "crypto"]
    analysts: list[str]
    status: Literal["queued", "running", "completed", "failed"]
    progress: AnalysisProgress | None = None
    error: str | None = None
    result: AnalysisResult | None = None
    created_at: str
    updated_at: str


class CapabilitiesResponse(BaseModel):
    providers: list[Provider]
    analysts: list[Option]
    configurable_settings: list[SettingDescriptor]
    output_languages: LanguageCapability
    runtime: RuntimeCapabilities
    current_trade_date: str


class SettingsResponse(BaseModel):
    source: Literal[
        "core_defaults_and_environment", "core_defaults_environment_and_admin_overrides"
    ] = "core_defaults_and_environment"
    read_only: bool = True
    values: dict[str, JsonValue]


class SettingsUpdate(BaseModel):
    values: dict[str, JsonValue]


class ErrorResponse(BaseModel):
    detail: str


class UserIdentity(BaseModel):
    subject: str
    email: str
    name: str
    role: Literal["user", "admin"] = "user"


class AuthStatus(BaseModel):
    provider: Literal["google"] = "google"
    configured: bool
