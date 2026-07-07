# ShopMate AI — k6 Load Testing

This directory contains k6 load test scripts for the ShopMate AI backend API.

## Prerequisites

### Install k6

**Windows (Chocolatey):**
```powershell
choco install k6
```

**Windows (winget):**
```powershell
winget install k6
```

**macOS (Homebrew):**
```bash
brew install k6
```

**Linux (Debian/Ubuntu):**
```bash
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Linux (Fedora/CentOS):**
```bash
sudo dnf install https://dl.k6.io/rpm/repo.rpm
sudo dnf install k6
```

**Docker:**
```bash
docker pull grafana/k6
docker run --rm -i grafana/k6 run - <script.js
```

Verify installation:
```bash
k6 version
```

## Scripts Overview

| Script | Scenario | VUs | Duration | Thresholds |
|---|---|---|---|---|
| `scenarios/smoke-test.js` | Health + readiness probes | 5 | 30s | P95 < 500ms, error < 1% |
| `scenarios/auth-scenario.js` | Register → Login → Profile → Refresh | Ramp 5→10 | 40s | P95 < 2000ms, error < 2% |
| `scenarios/api-scenario.js` | Login → Products → Listings → Dashboard → Keywords → Trends → Tasks → Notifications | Ramp 10→20 | 2m | P95 < 3000ms, error < 2% |

## Running Tests

### Quick Start (all tests)

```bash
# Default: uses http://localhost:3000
./run-local.sh

# Custom base URL
BASE_URL=https://staging.example.com ./run-local.sh

# Custom credentials (for api-scenario)
TEST_EMAIL=admin@example.com TEST_PASSWORD=secret ./run-local.sh
```

### Run Individual Test

```bash
# From the test/k6 directory
k6 run scenarios/smoke-test.js
k6 run scenarios/auth-scenario.js
k6 run scenarios/api-scenario.js
```

### With Custom Base URL

```bash
k6 run -e BASE_URL=https://staging.example.com scenarios/smoke-test.js
```

### With Custom Credentials (api-scenario only)

```bash
k6 run -e TEST_EMAIL=admin@example.com -e TEST_PASSWORD=secret scenarios/api-scenario.js
```

### Save Results to File

```bash
k6 run --out json=results/smoke-test.json scenarios/smoke-test.js
k6 run --out csv=results/smoke-test.csv scenarios/smoke-test.js
```

### HTML Report (using k6-reporter)

```bash
# Install k6-reporter
npm install -g k6-reporter

# Run with HTML output
k6 run --out json=results/smoke-test.json scenarios/smoke-test.js
k6-reporter results/smoke-test.json results/report.html
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | Target API base URL |
| `TEST_EMAIL` | `loadtest@shopmate-test.example` | Email for api-scenario login |
| `TEST_PASSWORD` | `TestPass123!` | Password for api-scenario login |

## Adding New Scenarios

1. Create a new `.js` file in `scenarios/`
2. Define `export const options` with VUs, duration, and thresholds
3. Implement `export default function()` with the test flow
4. Add the run command to `run-local.sh`

## Interpreting Results

Key metrics to watch:

- **http_req_duration** — Request latency (aim for P95 < 2000ms)
- **http_req_failed** — Error rate (aim for < 2%)
- **http_reqs** — Throughput (requests/second)
- **vus** — Concurrent virtual users
- **iterations** — Total iterations completed

Threshold violations cause a non-zero exit code (useful for CI/CD pipelines).
