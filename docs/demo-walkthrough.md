# T2S demo — 5 minutes

## Start

```bash
make ui-dev UI_PORT=3010
```

## Two URLs (side by side)

| Window | URL | Role |
| --- | --- | --- |
| Left | `http://localhost:3010` | **Engineer** — platform dashboard |
| Right | `http://localhost:3010/lab` | **Researcher** — lab |

Two different browsers (or Chrome + incognito) so sessions are independent.

## 5-minute script

1. **Pitch (30s).** *"Vendors ship AI agents weekly; hospitals can't certify weekly. T2S evaluates every candidate against regulatory suites + clinical personas, signs the result, gates promotion."*

2. **Engineer view (90s)** — left window:
   - `/` Mission Control → KPIs, SLOs, audit feed
   - `/compliance` → click a clause → citation
   - `/audit-trail` → signed events (cosign + GitHub OIDC)

3. **Researcher view (2 min)** — right window:
   - Click **Launch eval**, walk the 5 steps fast: agent → suite → personas → compute → sign+launch.
   - **Money moment:** on Launch, glance left — new event appears in the audit feed within ~2s.

4. **Result (1 min).** Open a completed run → verdict + transcript + **Compare → Prior prod** diff.

## If it breaks

`curl http://localhost:3010/api/healthz` should return `{"service":"t2s-ui",...}`. If not → `UI_PORT=3020`.

## Remote demo

```bash
make ui-share   # prints https://<random>.trycloudflare.com
```

Send `<url>/` and `<url>/lab`.
