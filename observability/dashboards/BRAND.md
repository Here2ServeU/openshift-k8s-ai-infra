# Dashboards — brand alignment

The Grafana dashboards in this directory use the same visual language as the T2S operator UI in [`workloads/t2s-platform/ui/`](../../workloads/t2s-platform/ui/). The brand identity that motivates these choices lives in [`workloads/t2s-platform/ui/BRAND.md`](../../workloads/t2s-platform/ui/BRAND.md). The summary below is the implementation contract for any new dashboard or panel.

## Naming

| Pattern | Example |
|---|---|
| `T2S · <Area>` | `T2S · LLM Serving — vLLM` |
| UID `t2s-<slug>` | `t2s-llm-serving`, `t2s-cost`, `t2s-slo`, `t2s-gpu-fleet` |
| Tag set includes `t2s` plus area-specific tags | `["t2s", "slo", "llm", "sli"]` |
| `"description"` set on every dashboard | Names the platform and the audience |
| `"style": "dark"` | Always dark — the operator surface is dark |

## Color palette (single source of truth)

Threshold colors in panel `fieldConfig.defaults.thresholds.steps[]` use the hex values below. Named colors (`"green"`, `"yellow"`, `"red"`) are not used in T2S dashboards — they're routed through Grafana's theme and don't match the UI palette one-to-one.

| Role | Hex | Use |
|---|---|---|
| Success | `#4ADE80` | In-budget SLO, healthy queue depth, passing eval |
| Accent | `#5EEAD4` | Brand teal. Headline values, single-metric stat panels, time series for "primary" series |
| Info | `#60A5FA` | Secondary time series, neutral status |
| Warning | `#FBBF24` | First threshold above target — "regard this" |
| Danger | `#F87171` | Hard failure threshold — "act now" |
| Sub-warning | `#FB923C` | Reserved for "approaching warning"; rarely needed |
| Surface | `#131A2E` | Dashboard background where overridden |
| Border | `#2B375A` | Panel border where overridden |
| Text dim | `#94A3C2` | Axis labels, captions |

If you find yourself reaching for a color that isn't on the list, propose an ADR. The palette is deliberately small so a viewer never has to wonder what a color means.

## Panel conventions

- **Stat panels** for headline KPIs. Single sparkline, no gradient fill at this scale.
- **Time series** for everything trending. Line width 1.5, no shadow, no fancy interpolation. Lines, not bars.
- **Thresholds expressed as absolute values, not percentages of max** — the eye should be able to read the SLO target as a line on the chart, not a relative position.
- **Tabular numerals everywhere.** Set `unit` per panel; the brand depends on every column of numbers aligning.
- **Annotations** for releases and policy events. Use the brand accent (`#5EEAD4`) for release annotations, warning (`#FBBF24`) for policy.

## Topology — how dashboards relate to the operator UI

| Grafana dashboard | Operator UI counterpart |
|---|---|
| `t2s-slo` — multi-burn-rate SLO view | Mission Control · "Service-level objectives" ring gauges |
| `t2s-llm-serving` — inference-path telemetry | (planned) deep-link from a Mission Control sparkline |
| `t2s-cost` — workload cost allocation | (planned) Compliance · "cost of evidence" line item |
| `t2s-gpu-fleet` — accelerator utilization | (planned) deep-link from an eval-run detail page |

Operators move between the UI and Grafana frequently; the visual language stays consistent on both sides on purpose. A blue line on Grafana means the same thing as a blue line in the UI.
