// k6 benchmark script — Actix (Rust) vs Quarkus (Java) auth-server.
//
// Targets the *same workload* against either side by switching TARGET:
//   TARGET=http://localhost:8080 k6 run bench.js   # Java (Quarkus)
//   TARGET=http://localhost:8081 k6 run bench.js   # Rust (Actix)
//
// What the workload exercises:
//   1. /q/health/ready                 → cheap end-to-end (DB ping)
//   2. /.well-known/openid-configuration → static JSON, fast path
//   3. /oauth/token (client_credentials) → realistic: Argon2 verify (expensive
//      on purpose) + role lookup + JWT sign + refresh-token persist
//
// Workload mix is 70% token / 20% health / 10% discovery — biased toward the
// expensive path so the GC/runtime difference shows up. Adjust the `exec`
// weights below if you want a different profile.
//
// SCENARIO SHAPE (default):
//   - ramp-up   0 → 50 VUs over 30s    (warm caches, JIT, connection pools)
//   - steady    50 VUs for 3 minutes   (the actual measurement window)
//   - ramp-down 50 → 0 over 30s
//
// To run without installing k6 locally:
//   docker run --rm -i --network host -v "${PWD}:/scripts" \
//       -e TARGET=http://localhost:8080 \
//       grafana/k6 run /scripts/bench.js

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

const TARGET = __ENV.TARGET || 'http://localhost:8080';

// Bootstrap creds — see auth-server/src/bootstrap/web_app_client.rs and
// auth-server-but-java's WebAppClientBootstrap.java. Confidential client
// configured for client_credentials grant.
const CLIENT_ID = __ENV.CLIENT_ID || 'service-client';
const CLIENT_SECRET = __ENV.CLIENT_SECRET || 'service-secret-change-me';

// Custom metrics — Prometheus will scrape the auth-server's /q/metrics, but
// these stay inside k6's summary so you can sanity-check from the CLI too.
const tokenLatency = new Trend('token_latency_ms');
const healthLatency = new Trend('health_latency_ms');
const tokenErrors = new Counter('token_errors');
const tokenSuccessRate = new Rate('token_success_rate');

export const options = {
    scenarios: {
        // Single ramping-VU scenario — matches what a Grafana panel labelled
        // "throughput at steady-state 50 concurrent users" would expect.
        steady_load: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 50 },  // ramp-up + warm-up
                { duration: '3m',  target: 50 },  // measurement window
                { duration: '30s', target: 0 },   // ramp-down
            ],
            gracefulRampDown: '10s',
        },
    },
    // Discard pre-warm samples from summary so percentiles reflect the
    // steady-state window only.
    summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
    // Fail the run if these thresholds are missed — useful when looking at
    // the final summary to spot a regression at a glance.
    thresholds: {
        'http_req_failed':         ['rate<0.01'],   // <1% failures
        'http_req_duration{name:token}': ['p(95)<500'], // p95 < 500ms for token
        'token_success_rate':      ['rate>0.99'],
    },
};

export default function () {
    // Workload mix — coin-flip selection so all VUs exercise all paths.
    const dice = Math.random();
    if (dice < 0.7) {
        tokenFlow();
    } else if (dice < 0.9) {
        healthCheck();
    } else {
        discovery();
    }
}

function tokenFlow() {
    group('oauth_token_client_credentials', () => {
        const payload = {
            grant_type: 'client_credentials',
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            scope: 'openid',
        };
        const params = {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            tags: { name: 'token' },
        };
        const res = http.post(`${TARGET}/oauth/token`, payload, params);
        tokenLatency.add(res.timings.duration);
        const ok = check(res, {
            'token status 200': (r) => r.status === 200,
            'token has access_token': (r) => {
                try { return !!r.json('access_token'); } catch { return false; }
            },
        });
        tokenSuccessRate.add(ok);
        if (!ok) {
            tokenErrors.add(1);
        }
    });
}

function healthCheck() {
    group('health_ready', () => {
        const res = http.get(`${TARGET}/q/health/ready`, { tags: { name: 'health' } });
        healthLatency.add(res.timings.duration);
        check(res, {
            'health 200': (r) => r.status === 200,
        });
    });
}

function discovery() {
    group('openid_discovery', () => {
        const res = http.get(`${TARGET}/.well-known/openid-configuration`, { tags: { name: 'discovery' } });
        check(res, {
            'discovery 200': (r) => r.status === 200,
            'discovery has issuer': (r) => {
                try { return !!r.json('issuer'); } catch { return false; }
            },
        });
    });
}
