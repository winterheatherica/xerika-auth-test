# Benchmark — Actix (Rust) vs Quarkus (Java)

Two auth-server implementations of the same OAuth/OIDC surface, running on
identical Postgres 17 + Redis 7 + Debian bookworm-slim base. The only
moving part is the language runtime + framework.

## Setup checklist

- [ ] Both images built: `docker compose build`
- [ ] Observability stack up: `cd observability && docker compose up -d`
- [ ] Prometheus reachable at <http://localhost:9090>
- [ ] Grafana reachable at <http://localhost:3004> (admin/admin), Prometheus
  added as a data source pointing at `http://prometheus:9090`
- [ ] k6 available (either `choco install k6`, native binary, or via
  `docker run --rm -i grafana/k6 ...`)

## Sequential run pattern

Each side gets the full 4 vCPU + 8 GB envelope (see `docker-compose.yml`
limits). Run them one at a time so they don't compete:

```powershell
# --- Java side ---
docker compose up -d auth-server-java
# wait for healthy
docker compose ps auth-server-java
# warm up briefly so JIT + connection pools settle
TARGET=http://localhost:8080 k6 run --duration 30s bench/bench.js
# actual measurement
TARGET=http://localhost:8080 k6 run bench/bench.js | tee bench/results-java.txt
docker compose stop auth-server-java

# --- Rust side ---
docker compose up -d auth-server-rust
docker compose ps auth-server-rust
TARGET=http://localhost:8081 k6 run --duration 30s bench/bench.js
TARGET=http://localhost:8081 k6 run bench/bench.js | tee bench/results-rust.txt
docker compose stop auth-server-rust
```

## What the workload exercises

Mix (per request, randomised):

| Weight | Endpoint | What it stresses |
|--------|----------|------------------|
| 70% | `POST /oauth/token` (client_credentials) | Argon2 verify (~50ms by design) + role lookup + JWT sign + refresh-token persist. **Most expensive path** — best signal for GC vs no-GC. |
| 20% | `GET /q/health/ready` | DB ping (cheap end-to-end). |
| 10% | `GET /.well-known/openid-configuration` | Static JSON. Stresses serialisation + HTTP layer only. |

## Where the numbers come from

Two parallel sources during a run:

### k6 (synthetic latency + throughput from outside)

The `k6` summary printed at the end of each run gives:
- `http_req_duration` p50/p95/p99 latency
- `http_reqs` total throughput (RPS via rate())
- `http_req_failed` error rate
- Custom `token_latency_ms`, `token_success_rate`

### Prometheus (in-process metrics scraped every 5s)

Both auth-servers expose `/q/metrics` — Prometheus jobs are configured in
[`observability/prometheus.yml`](../observability/prometheus.yml). PromQL
queries for the five parameters you're measuring:

| Parameter | Java (Quarkus / Micrometer) | Rust (Actix / actix-web-prom) |
|---|---|---|
| **CPU** | `process_cpu_usage{job="auth-server-java"}` | `rate(process_cpu_seconds_total{job="auth-server-rust"}[1m])` |
| **Memory (RSS)** | `process_resident_memory_bytes{job="auth-server-java"}` | `process_resident_memory_bytes{job="auth-server-rust"}` |
| **Latency p95** | `histogram_quantile(0.95, rate(http_server_requests_seconds_bucket{job="auth-server-java"}[1m]))` | `histogram_quantile(0.95, rate(auth_server_http_requests_duration_seconds_bucket{job="auth-server-rust"}[1m]))` |
| **Throughput** | `sum(rate(http_server_requests_seconds_count{job="auth-server-java"}[1m]))` | `sum(rate(auth_server_http_requests_total{job="auth-server-rust"}[1m]))` |
| **Error rate** | `sum(rate(http_server_requests_seconds_count{job="auth-server-java",status=~"5.."}[1m])) / sum(rate(http_server_requests_seconds_count{job="auth-server-java"}[1m]))` | `sum(rate(auth_server_http_requests_total{job="auth-server-rust",status=~"5.."}[1m])) / sum(rate(auth_server_http_requests_total{job="auth-server-rust"}[1m]))` |

Bonus JVM-only signals (Java side, useful for the discussion section of
your write-up):

```promql
jvm_gc_pause_seconds_max{job="auth-server-java"}                 # GC pause time (peak)
sum(rate(jvm_gc_pause_seconds_count{job="auth-server-java"}[1m]))  # GC frequency
jvm_memory_used_bytes{job="auth-server-java", area="heap"}        # heap usage
```

## Knobs you can tweak

| File | Knob | Notes |
|------|------|-------|
| `bench.js` `options.scenarios` | VU count, duration | Default 50 VUs × 3 min. Bump for stress, lower for sanity check. |
| `bench.js` `default()` mix | 70/20/10 | If you want a discovery-heavy or token-heavy slant. |
| `auth-server-but-java/Dockerfile` `JAVA_OPTS_APPEND` | `-Xms / -Xmx / GC` | Currently `-Xms512m -Xmx512m +AlwaysPreTouch` + default G1. Try `-XX:+UseZGC` for low-pause variant. |
| `docker-compose.yml` `deploy.resources.limits` | CPU / memory | Currently 4 CPU + 8 GB per side. Lower to provoke contention earlier. |
