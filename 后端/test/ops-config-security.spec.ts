import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Operations configuration security', () => {
  const workspace = join(process.cwd(), '..');

  it('uses separate shallow liveness and dependency readiness probes', () => {
    const backend = readFileSync(
      join(workspace, 'k8s', 'backend-deployment.yml'),
      'utf8',
    );
    const agent = readFileSync(
      join(workspace, 'k8s', 'agent-deployment.yml'),
      'utf8',
    );

    expect(backend).toMatch(/startupProbe:[\s\S]*?path: \/api\/v1\/health/);
    expect(backend).toMatch(/livenessProbe:[\s\S]*?path: \/api\/v1\/health/);
    expect(backend).toMatch(/readinessProbe:[\s\S]*?path: \/api\/v1\/ready/);
    expect(agent).toMatch(/startupProbe:[\s\S]*?path: \/api\/health/);
    expect(agent).toMatch(/livenessProbe:[\s\S]*?path: \/api\/live/);
    expect(agent).toMatch(/readinessProbe:[\s\S]*?path: \/api\/ready/);
  });

  it('never runs a destructive recovery drill with implicit credentials', () => {
    const script = readFileSync(
      join(workspace, 'scripts', 'db-disaster-recovery.sh'),
      'utf8',
    );

    expect(script).not.toMatch(/DATABASE_URL:-postgresql:/);
    expect(script).toContain('DRILL_CONFIRM_DATABASE');
    expect(script).toContain('DROP_AND_RESTORE');
    expect(script).toContain('pg_restore --list');
    expect(script).toContain('current_database()');
  });

  it('routes Prometheus alerts through Alertmanager without claiming delivery', () => {
    const prometheus = readFileSync(
      join(process.cwd(), 'monitoring', 'prometheus', 'prometheus.yml'),
      'utf8',
    );
    const alertmanager = readFileSync(
      join(process.cwd(), 'monitoring', 'alertmanager', 'alertmanager.yml'),
      'utf8',
    );

    expect(prometheus).toContain("targets: ['alertmanager:9093']");
    expect(alertmanager).toContain(
      'empty receiver is intentionally not a notification proof',
    );
  });

  it('waits for the gateway container health before declaring startup ready', () => {
    const common = readFileSync(
      join(workspace, 'scripts', 'local-server', 'common.ps1'),
      'utf8',
    );
    const start = readFileSync(
      join(workspace, 'scripts', 'local-server', 'start.ps1'),
      'utf8',
    );

    expect(common).toContain('function Wait-ContainerHealthy');
    expect(common).toContain("if ($health -eq 'healthy')");
    expect(common).toContain("if ($health -eq 'unhealthy')");
    expect(start).toContain(
      "Wait-ContainerHealthy -ContainerName 'shopmate-local-nginx'",
    );
  });

  it('creates local QA membership atomically inside a verified tenant context', () => {
    const script = readFileSync(
      join(workspace, 'scripts', 'local-server', 'qa-user.cjs'),
      'utf8',
    );

    expect(script).toContain('prisma.$transaction(async (tx) =>');
    expect(script).toContain(
      "set_config('app.current_organization_id', $1, true)",
    );
    expect(script).toContain(
      "current_setting('app.current_organization_id', true)",
    );
    expect(script).toContain('Tenant context verification failed');
  });

  it('keeps the agent primary organization separate from a multi-organization pilot allowlist', () => {
    const compose = readFileSync(
      join(workspace, 'docker-compose.local-server.yml'),
      'utf8',
    );
    const example = readFileSync(
      join(workspace, '.env.local-server.example'),
      'utf8',
    );

    expect(compose).toContain('PLATFORM_ORG_ID: ${PLATFORM_ORG_ID:-}');
    expect(compose).not.toContain(
      'PLATFORM_ORG_ID: ${DAILY_PRODUCT_RESEARCH_PILOT_ORGANIZATION_IDS:-}',
    );
    expect(example).toMatch(/^PLATFORM_ORG_ID=$/m);
    expect(example).toMatch(
      /^DAILY_PRODUCT_RESEARCH_PILOT_ORGANIZATION_IDS=$/m,
    );
  });
});
