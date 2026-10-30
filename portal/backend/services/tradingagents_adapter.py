"""The only Portal module allowed to import core modules.

Never construct a graph/client or call a provider here. Settings are an explicit
public projection: new core keys are private until deliberately reviewed.
"""

from importlib import import_module

from pydantic import JsonValue, TypeAdapter

from portal.backend.models import (
    CapabilitiesResponse,
    LanguageCapability,
    Option,
    Provider,
    RuntimeCapabilities,
    SettingDescriptor,
    SettingsResponse,
)

PUBLIC_SETTINGS = frozenset(
    {
        "llm_provider",
        "deep_think_llm",
        "quick_think_llm",
        "deep_think_provider",
        "quick_think_provider",
        "output_language",
        "google_thinking_level",
        "openai_reasoning_effort",
        "anthropic_effort",
        "temperature",
        "llm_max_retries",
        "max_tokens",
        "checkpoint_enabled",
        "max_debate_rounds",
        "max_risk_discuss_rounds",
        "max_recur_limit",
        "max_tool_rounds",
        "news_article_limit",
        "global_news_article_limit",
        "global_news_lookback_days",
        "global_news_queries",
        "data_vendors",
        "tool_vendors",
        "holding_period_days",
        "benchmark_ticker",
        "benchmark_map",
        "memory_log_max_entries",
    }
)
_json_values = TypeAdapter(dict[str, JsonValue])


class TradingAgentsAdapter:
    def check_core(self) -> None:
        # Import the real execution module, not just the lightweight package.
        # Instantiation would create clients/directories, so it is deliberately absent.
        graph_class = import_module("tradingagents.graph.trading_graph").TradingAgentsGraph
        if not callable(graph_class):
            raise ImportError("Core graph class is unavailable")

    def version(self) -> str:
        return str(import_module("tradingagents").__version__)

    def settings(self) -> SettingsResponse:
        module = import_module("tradingagents.default_config")
        config = module.build_default_config()
        values = _json_values.validate_python(
            {key: value for key, value in config.items() if key in PUBLIC_SETTINGS}
        )
        return SettingsResponse(values=values)

    def capabilities(self) -> CapabilitiesResponse:
        catalog = import_module("tradingagents.llm_clients.model_catalog").MODEL_OPTIONS
        # Azure uses deployment names; OpenRouter discovers models live. Neither
        # appears in MODEL_OPTIONS. Reuse the CLI's existing provider table rather
        # than duplicating native-provider lists or making live discovery calls.
        provider_table = import_module("cli.prompts")._llm_provider_table()
        providers = dict.fromkeys([*catalog, *(key for _, key, _ in provider_table)])
        analysts = import_module("tradingagents.graph.analyst_execution").ANALYST_NODE_SPECS
        settings = self.settings()
        return CapabilitiesResponse(
            providers=[
                Provider(
                    id=provider,
                    models={
                        mode: [
                            Option(id=value, label=label)
                            for label, value in options
                            if value != "custom"
                        ]
                        for mode, options in modes.items()
                    },
                    allows_custom_model=not modes
                    or any(value == "custom" for options in modes.values() for _, value in options),
                )
                for provider in providers
                for modes in [catalog.get(provider, {})]
            ],
            analysts=[Option(id=spec.key, label=spec.agent_node) for spec in analysts.values()],
            configurable_settings=[
                SettingDescriptor(key=key, value_type=type(value).__name__)
                for key, value in settings.values.items()
            ],
            output_languages=LanguageCapability(
                suggestions=[str(settings.values["output_language"])]
            ),
            runtime=RuntimeCapabilities(),
        )
