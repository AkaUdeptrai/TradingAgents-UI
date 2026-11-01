"""The only TradingAgents UI module allowed to import core modules.

Never construct a graph/client or call a provider here. Settings are an explicit
public projection: new core keys are private until deliberately reviewed.
"""

import re
from collections.abc import Callable
from importlib import import_module
from threading import Lock

from pydantic import JsonValue, TypeAdapter

from backend.models import (
    AnalysisMessage,
    AnalysisProgress,
    AnalysisResult,
    AnalysisStep,
    CapabilitiesResponse,
    LanguageCapability,
    Option,
    Provider,
    RuntimeCapabilities,
    SettingDescriptor,
    SettingsResponse,
)
from backend.services.settings_store import SettingsStore

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
_analysis_lock = Lock()


class TradingAgentsAdapter:
    def __init__(self, settings_store: SettingsStore | None = None) -> None:
        self.settings_store = settings_store

    def validate_analysis_date(self, trade_date: str) -> None:
        current_date = import_module("tradingagents.dataflows.date_window").get_current_date()
        if trade_date > current_date:
            raise ValueError("Analysis date cannot be in the future.")

    def run_analysis(
        self,
        ticker: str,
        trade_date: str,
        asset_type: str,
        analysts: list[str],
        *,
        on_progress: Callable[[AnalysisProgress], None] | None = None,
    ) -> AnalysisResult:
        """Stream the existing graph, report real step progress, and save its artifacts."""
        from cli.prompts import normalize_ticker_symbol
        from tradingagents.agents.rating import run_rating
        from tradingagents.dataflows.symbols import safe_ticker_component
        from tradingagents.default_config import build_default_config
        from tradingagents.graph.analyst_execution import build_analyst_execution_plan
        from tradingagents.graph.trading_graph import TradingAgentsGraph

        ticker = normalize_ticker_symbol(ticker.strip().upper())
        safe_ticker_component(ticker)
        if asset_type == "crypto":
            analysts = [analyst for analyst in analysts if analyst != "fundamentals"]
        plan = build_analyst_execution_plan(analysts)
        selected = [spec.key for spec in plan.specs]
        analyst_report_keys = {spec.report_key: spec.key for spec in plan.specs}
        analyst_labels = {spec.key: spec.agent_node for spec in plan.specs}
        step_labels = {
            "research": "Research Team",
            "trader": "Trader",
            "risk": "Risk Management Team",
            "portfolio": "Portfolio Manager",
        }
        step_status = {f"analyst-{key}": "running" for key in selected}
        step_status.update(dict.fromkeys(step_labels, "waiting"))
        partial_reports: dict[str, str] = {}
        live_messages: list[AnalysisMessage] = []
        seen_messages: set[str] = set()
        phase, phase_label = "analysts", "Đang chạy các tác tử phân tích"

        def report_preview(value: object) -> str:
            text = str(value)
            return (
                text if len(text) <= 6000 else text[:6000] + "\n\n… Báo cáo tiếp tục được cập nhật."
            )

        def publish_progress() -> None:
            if on_progress is None:
                return
            steps = [
                AnalysisStep(
                    key=f"analyst-{key}",
                    label=analyst_labels[key],
                    status=step_status[f"analyst-{key}"],
                )
                for key in selected
            ]
            steps.extend(
                AnalysisStep(key=key, label=label, status=step_status[key])
                for key, label in step_labels.items()
            )
            on_progress(
                AnalysisProgress(
                    phase=phase,
                    label=phase_label,
                    steps=steps,
                    reports=dict(partial_reports),
                    messages=list(live_messages),
                )
            )

        def message_text(message: object) -> str:
            content = getattr(message, "content", "")
            if isinstance(content, str):
                text = content
            elif isinstance(content, list):
                text = " ".join(
                    part if isinstance(part, str) else str(part.get("text", ""))
                    for part in content
                    if isinstance(part, str | dict)
                )
            else:
                text = ""
            text = re.sub(
                r"(?i)(sk-[a-z0-9]{12,}|AIza[a-z0-9_-]{20,}|GOCSPX-[a-z0-9_-]{12,}|Bearer\s+[a-z0-9._~-]{12,})",
                "[đã ẩn thông tin nhạy cảm]",
                text,
            )
            return text.strip()

        # Core config uses process-wide context for data tools; serialize web runs
        # so separate requests cannot cross-contaminate that context.
        with _analysis_lock:
            run_config = build_default_config()
            if self.settings_store is not None:
                run_config.update(self.settings_store.read())
            # Keep provider requests bounded in the UI runtime. The core/CLI
            # leaves this unset and retains each SDK's default behavior.
            run_config["llm_timeout_seconds"] = 120
            if run_config.get("llm_max_retries") is None:
                run_config["llm_max_retries"] = 1
            graph = TradingAgentsGraph(selected, config=run_config)
            publish_progress()
            initial_state = graph.create_run_state(ticker, trade_date, asset_type)
            args = graph.propagator.get_graph_args()
            checkpoint_tid = graph.begin_checkpoint(ticker, trade_date, asset_type)
            if checkpoint_tid is not None:
                args.setdefault("config", {}).setdefault("configurable", {})["thread_id"] = (
                    checkpoint_tid
                )
            final_state: dict = {}
            try:
                for messages, chunk in graph.stream_run(
                    graph.checkpoint_input(initial_state), **args
                ):
                    added_message = False
                    for message in messages:
                        message_type = getattr(message, "type", "")
                        if message_type != "ai" and type(message).__name__ != "AIMessage":
                            continue
                        content = message_text(message)
                        if not content:
                            continue
                        message_id = getattr(message, "id", None)
                        identity = (
                            str(message_id)
                            if message_id
                            else f"{getattr(message, 'name', '')}:{content}"
                        )
                        if identity in seen_messages:
                            continue
                        seen_messages.add(identity)
                        speaker = str(getattr(message, "name", None) or "Tác tử AI")[:80]
                        live_messages.append(
                            AnalysisMessage(speaker=speaker, content=content[:5000])
                        )
                        added_message = True
                    if len(live_messages) > 30:
                        del live_messages[:-30]
                    if chunk is None:
                        if added_message:
                            publish_progress()
                        continue
                    final_state.update(chunk)

                    for report_key, analyst_key in analyst_report_keys.items():
                        value = final_state.get(report_key)
                        if value:
                            step_status[f"analyst-{analyst_key}"] = "completed"
                            partial_reports[report_key] = report_preview(value)

                    debate = final_state.get("investment_debate_state") or {}
                    if debate.get("bull_history") or debate.get("bear_history"):
                        phase, phase_label = (
                            "research",
                            "Research Team đang tranh luận các phát hiện",
                        )
                        step_status["research"] = "running"
                        if all(step_status[f"analyst-{key}"] == "completed" for key in selected):
                            for key in selected:
                                step_status[f"analyst-{key}"] = "completed"

                    investment_plan = final_state.get("investment_plan")
                    if investment_plan:
                        step_status["research"] = "completed"
                        partial_reports["investment_plan"] = report_preview(investment_plan)
                        if step_status["trader"] == "waiting":
                            step_status["trader"] = "running"
                            phase, phase_label = "trader", "Trader đang lập kế hoạch đầu tư"

                    trader_plan = final_state.get("trader_investment_plan")
                    if trader_plan:
                        step_status["trader"] = "completed"
                        partial_reports["trader_investment_plan"] = report_preview(trader_plan)
                        if step_status["risk"] == "waiting":
                            phase, phase_label = (
                                "risk",
                                "Risk Management Team đang đánh giá kế hoạch",
                            )
                            step_status["risk"] = "running"

                    risk_state = final_state.get("risk_debate_state") or {}
                    if risk_state.get("history"):
                        if step_status["risk"] == "waiting":
                            phase, phase_label = (
                                "risk",
                                "Risk Management Team đang đánh giá kế hoạch",
                            )
                            step_status["risk"] = "running"
                        risk_limit = 3 * int(graph.config.get("max_risk_discuss_rounds", 1))
                        if risk_state.get("count", 0) >= risk_limit:
                            step_status["risk"] = "completed"
                            step_status["portfolio"] = "running"
                            phase, phase_label = (
                                "portfolio",
                                "Portfolio Manager đang đưa ra quyết định",
                            )

                    decision = final_state.get("final_trade_decision")
                    if decision:
                        step_status["risk"] = "completed"
                        step_status["portfolio"] = "completed"
                        partial_reports["final_trade_decision"] = report_preview(decision)
                        phase, phase_label = "complete", "Phân tích đã hoàn tất"
                    publish_progress()

                for key in step_status:
                    step_status[key] = "completed"
                phase, phase_label = "complete", "Phân tích đã hoàn tất"
                partial_reports.clear()
                publish_progress()
                graph.record_decision(ticker, trade_date, final_state)
                graph.clear_checkpoint_on_success(ticker, trade_date, asset_type)
            finally:
                graph.end_checkpoint()

            report_path = graph.default_report_path(ticker)
            graph.save_reports(final_state, ticker, report_path, html=True)
        keys = (
            "market_report",
            "sentiment_report",
            "news_report",
            "fundamentals_report",
            "investment_plan",
            "trader_investment_plan",
            "final_trade_decision",
        )
        reports = {key: str(final_state[key]) for key in keys if final_state.get(key)}
        return AnalysisResult(
            final_rating=str(run_rating(final_state)),
            final_trade_decision=str(final_state.get("final_trade_decision") or ""),
            reports=reports,
        )

    def check_core(self) -> None:
        # Import the real execution module, not just the lightweight package.
        # Instantiation would create clients/directories, so it is deliberately absent.
        graph_class = import_module("tradingagents.graph.trading_graph").TradingAgentsGraph
        if not callable(graph_class):
            raise ImportError("Core graph class is unavailable")

    def version(self) -> str:
        return str(import_module("tradingagents").__version__)

    def settings(self) -> SettingsResponse:
        config = self.default_config()
        if self.settings_store is not None:
            config.update(self.settings_store.read())
        values = _json_values.validate_python(
            {key: value for key, value in config.items() if key in PUBLIC_SETTINGS}
        )
        has_overrides = bool(self.settings_store and self.settings_store.read())
        source = (
            "core_defaults_environment_and_admin_overrides"
            if has_overrides
            else "core_defaults_and_environment"
        )
        return SettingsResponse(values=values, source=source)

    @staticmethod
    def default_config() -> dict[str, object]:
        return import_module("tradingagents.default_config").build_default_config()

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
            runtime=RuntimeCapabilities(settings_write=True),
            current_trade_date=import_module(
                "tradingagents.dataflows.date_window"
            ).get_current_date(),
        )
