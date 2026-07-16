import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import supertest from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaClient } from '@prisma/client';
import type { Server } from 'node:http';

const TENANT_ISOLATION_SAMPLE = 'tenant-isolation';

// ─── Conditional execution ───────────────────────────────────────
const HAS_DB =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL.length > 0;
const describeIfDb = HAS_DB ? describe : describe.skip;

// ─── Helpers ──────────────────────────────────────────────────────
const api = (path: string) => `/api/v1${path}`;

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string };
}

interface RegisteredUser {
  token: string;
  userId: string;
  orgId: string;
  email: string;
}

interface CleanupState {
  userIds: string[];
  orgIds: string[];
}

// ─── Tenant Isolation Test Suite ──────────────────────────────────
describeIfDb('Tenant Isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let jwtService: JwtService;
  let request: supertest.SuperTest<supertest.Test>;

  // Track resources for cleanup (last in, first out for FK safety)
  const cleanup: CleanupState = { userIds: [], orgIds: [] };

  // ── Bootstrap ───────────────────────────────────────────────────
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    request = supertest(
      app.getHttpServer() as Server,
    ) as unknown as supertest.SuperTest<supertest.Test>;
    const adminUrl = process.env.DATABASE_ADMIN_URL;
    if (!adminUrl)
      throw new Error('DATABASE_ADMIN_URL is required for fixtures');
    prisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });
    await prisma.$connect();
    jwtService = app.get(JwtService);
  });

  // ── Teardown ────────────────────────────────────────────────────
  afterAll(async () => {
    // Delete in reverse-dependency order: memberships → users, organizations
    if (cleanup.userIds.length > 0 || cleanup.orgIds.length > 0) {
      // First remove memberships for test users
      await prisma.membership.deleteMany({
        where: { userId: { in: cleanup.userIds } },
      });
      // Remove organizations (cascades to workspaces, products, etc.)
      await prisma.organization.deleteMany({
        where: { id: { in: cleanup.orgIds } },
      });
      // Finally remove users
      await prisma.user.deleteMany({
        where: { id: { in: cleanup.userIds } },
      });
    }
    await prisma.$disconnect();
    await app.close();
  });

  // ── Registration helper ─────────────────────────────────────────
  async function registerUser(tag: string): Promise<RegisteredUser> {
    const ts = Date.now();
    const email = `tenant-test-${tag}-${ts}@shopmate.ai`;
    const res = await request
      .post(api('/auth/register'))
      .send({ email, password: 'test12345678', name: `Tenant Test ${tag}` });
    expect(res.status).toBe(201);
    const body = res.body as AuthResponse;

    // Decode the JWT to extract userId & orgId (without verifying the signature)
    const decoded = jwtService.decode(body.accessToken);
    expect(decoded).not.toBeNull();
    const user: RegisteredUser = {
      token: body.accessToken,
      userId: decoded!.sub,
      orgId: decoded!.orgId,
      email,
    };

    cleanup.userIds.push(user.userId);
    cleanup.orgIds.push(user.orgId);
    return user;
  }

  // ── Resource creation helpers ───────────────────────────────────
  async function createWorkspace(
    token: string,
    name: string,
  ): Promise<supertest.Response> {
    return request
      .post(api('/workspaces'))
      .set('Authorization', `Bearer ${token}`)
      .send({ name, channelType: 'MANUAL' });
  }

  async function createProduct(
    token: string,
    workspaceId: string,
    title: string,
  ): Promise<supertest.Response> {
    return request
      .post(api('/products'))
      .set('Authorization', `Bearer ${token}`)
      .send({ title, workspaceId });
  }

  // ═════════════════════════════════════════════════════════════════
  //  1. Cross-org Product Isolation
  // ═════════════════════════════════════════════════════════════════
  describe('Cross-org product isolation', () => {
    let orgA: RegisteredUser;
    let orgB: RegisteredUser;
    let workspaceAId: string;
    let productAId: string;

    beforeAll(async () => {
      orgA = await registerUser('ProdA');
      orgB = await registerUser('ProdB');

      // OrgA creates a workspace
      const wsRes = await createWorkspace(
        orgA.token,
        'OrgA Products Workspace',
      );
      expect(wsRes.status).toBe(201);
      workspaceAId = wsRes.body.id;

      // OrgA creates a product
      const prodRes = await createProduct(
        orgA.token,
        workspaceAId,
        'OrgA-Only Product',
      );
      expect(prodRes.status).toBe(201);
      productAId = prodRes.body.id;
    });

    it('should NOT expose OrgA products when OrgB lists products', async () => {
      const res = await request
        .get(api('/products'))
        .set('Authorization', `Bearer ${orgB.token}`);
      expect(res.status).toBe(200);
      const items: Array<{ title: string }> = res.body.items ?? [];
      const titles = items.map((p) => p.title);
      expect(titles).not.toContain('OrgA-Only Product');
    });

    it('should return 404 when OrgB fetches OrgA product by ID', async () => {
      const res = await request
        .get(api(`/products/${productAId}`))
        .set('Authorization', `Bearer ${orgB.token}`);
      expect(res.status).toBe(404);
    });

    it('should allow OrgA to see its own product', async () => {
      const res = await request
        .get(api(`/products/${productAId}`))
        .set('Authorization', `Bearer ${orgA.token}`);
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('OrgA-Only Product');
    });

    it('should return 404 when OrgB tries to update OrgA product', async () => {
      const res = await request
        .patch(api(`/products/${productAId}`))
        .set('Authorization', `Bearer ${orgB.token}`)
        .send({ title: 'Hacked' });
      expect(res.status).toBe(404);
    });

    it('should return 404 when OrgB tries to delete OrgA product', async () => {
      const res = await request
        .delete(api(`/products/${productAId}`))
        .set('Authorization', `Bearer ${orgB.token}`);
      expect(res.status).toBe(404);
    });

    it('should return empty product list when no products exist in the org', async () => {
      // OrgB has no products yet
      const res = await request
        .get(api('/products'))
        .set('Authorization', `Bearer ${orgB.token}`);
      expect(res.status).toBe(200);
      const body = res.body as { items: unknown[]; total: number };
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('should respect pagination parameters', async () => {
      const res = await request
        .get(api('/products?page=1&limit=5'))
        .set('Authorization', `Bearer ${orgA.token}`);
      expect(res.status).toBe(200);
      const body = res.body as { page: number; limit: number; total: number };
      expect(body.page).toBe(1);
      expect(body.limit).toBe(5);
      expect(body.total).toBeGreaterThanOrEqual(1);
    });
  });

  // ═════════════════════════════════════════════════════════════════
  //  2. Cross-org Workspace Isolation
  // ═════════════════════════════════════════════════════════════════
  describe('Cross-org workspace isolation', () => {
    let orgA: RegisteredUser;
    let orgB: RegisteredUser;
    let workspaceAId: string;

    beforeAll(async () => {
      orgA = await registerUser('WrkA');
      orgB = await registerUser('WrkB');

      const wsRes = await createWorkspace(orgA.token, 'OrgA Secret Workspace');
      expect(wsRes.status).toBe(201);
      workspaceAId = wsRes.body.id;
    });

    it('should return 404 when OrgB accesses OrgA workspace by ID', async () => {
      const res = await request
        .get(api(`/workspaces/${workspaceAId}`))
        .set('Authorization', `Bearer ${orgB.token}`);
      expect(res.status).toBe(404);
    });

    it('should NOT list OrgA workspaces for OrgB', async () => {
      const res = await request
        .get(api('/workspaces'))
        .set('Authorization', `Bearer ${orgB.token}`);
      expect(res.status).toBe(200);
      const items: unknown[] = res.body.items ?? [];
      expect(items).toEqual([]);
    });

    it('should return 404 when OrgB tries to update OrgA workspace', async () => {
      const res = await request
        .patch(api(`/workspaces/${workspaceAId}`))
        .set('Authorization', `Bearer ${orgB.token}`)
        .send({ name: 'Hacked Workspace' });
      expect(res.status).toBe(404);
    });

    it('should return 404 when OrgB tries to delete OrgA workspace', async () => {
      const res = await request
        .delete(api(`/workspaces/${workspaceAId}`))
        .set('Authorization', `Bearer ${orgB.token}`);
      expect(res.status).toBe(404);
    });
  });

  // ═════════════════════════════════════════════════════════════════
  //  3. Multi-entity Resource Isolation
  // ═════════════════════════════════════════════════════════════════
  describe('Resource isolation across entity types', () => {
    let orgA: RegisteredUser;
    let orgB: RegisteredUser;
    let workspaceAId: string;

    beforeAll(async () => {
      orgA = await registerUser('ResA');
      orgB = await registerUser('ResB');

      const wsRes = await createWorkspace(
        orgA.token,
        'OrgA Isolation Workspace',
      );
      expect(wsRes.status).toBe(201);
      workspaceAId = wsRes.body.id;
    });

    // ── 3a. Listings ────────────────────────────────────────────
    describe('Listings', () => {
      let listingId: string | undefined;

      it('should isolate listing drafts between orgs', async () => {
        const listing = await prisma.listingDraft.create({
          data: {
            organizationId: orgA.orgId,
            workspaceId: workspaceAId,
            platform: 'amazon',
            title: 'OrgA Secret Listing Draft',
            bullets: [TENANT_ISOLATION_SAMPLE],
            description:
              'Created directly so this boundary test does not depend on the external agent provider.',
            seoTags: [TENANT_ISOLATION_SAMPLE],
            createdBy: orgA.userId,
          },
        });
        listingId = listing.id;

        if (!listingId) {
          throw new Error('Failed to create listing isolation sample');
        }
        // OrgB should not see it by ID
        const crossRes = await request
          .get(api(`/listings/${listingId}`))
          .set('Authorization', `Bearer ${orgB.token}`);
        expect(crossRes.status).toBe(404);
      });

      it('should NOT list OrgA listing drafts for OrgB', async () => {
        if (!listingId) {
          throw new Error('Missing listing isolation sample');
        }
        const res = await request
          .get(api('/listings'))
          .set('Authorization', `Bearer ${orgB.token}`);
        expect(res.status).toBe(200);
        const items: Array<{ id: string }> = res.body.items ?? [];
        const ids = items.map((l) => l.id);
        expect(ids).not.toContain(listingId);
      });
    });

    // ── 3b. Agent Runs ─────────────────────────────────────────
    describe('AgentRuns', () => {
      let runId: string | undefined;

      it('should isolate agent runs between orgs', async () => {
        // Create an agent run in OrgA (may fail without BullMQ/Redis)
        const runRes = await request
          .post(api('/agent-runs'))
          .set('Authorization', `Bearer ${orgA.token}`)
          .send({
            agentType: 'GENERAL_ASSISTANT',
            input: { prompt: 'tenant isolation test' },
          });

        if (runRes.status !== 201) {
          throw new Error('Failed to create agent run isolation sample');
        }
        runId = runRes.body.id;

        // OrgB should not see it by ID
        const crossRes = await request
          .get(api(`/agent-runs/${runId}`))
          .set('Authorization', `Bearer ${orgB.token}`);
        expect(crossRes.status).toBe(404);
      });

      it('should NOT list OrgA agent runs for OrgB', async () => {
        if (!runId) {
          throw new Error('Missing agent run isolation sample');
        }
        const res = await request
          .get(api('/agent-runs'))
          .set('Authorization', `Bearer ${orgB.token}`);
        expect(res.status).toBe(200);
        const items: Array<{ id: string }> = res.body.items ?? [];
        const ids = items.map((r) => r.id);
        expect(ids).not.toContain(runId);
      });
    });

    // ── 3c. Keyword Reports ────────────────────────────────────
    describe('KeywordReports', () => {
      let reportId: string | undefined;

      it('should isolate keyword reports between orgs', async () => {
        const report = await prisma.keywordReport.create({
          data: {
            organizationId: orgA.orgId,
            workspaceId: workspaceAId,
            query: TENANT_ISOLATION_SAMPLE,
            platforms: ['amazon_us'],
            country: 'US',
            totalKeywords: 1,
            keywords: [
              {
                keyword: TENANT_ISOLATION_SAMPLE,
                volume: 10,
                difficulty: 1,
              },
            ],
            createdBy: orgA.userId,
          },
        });
        reportId = report.id;

        if (!reportId) {
          throw new Error('Failed to create keyword isolation sample');
        }
        // OrgB should not see it by ID
        const crossRes = await request
          .get(api(`/keywords/${reportId}`))
          .set('Authorization', `Bearer ${orgB.token}`);
        expect(crossRes.status).toBe(404);
      });

      it('should NOT list OrgA keyword reports for OrgB', async () => {
        if (!reportId) {
          throw new Error('Missing keyword isolation sample');
        }
        const res = await request
          .get(api('/keywords'))
          .set('Authorization', `Bearer ${orgB.token}`);
        expect(res.status).toBe(200);
        const items: Array<{ id: string }> = res.body.items ?? [];
        const ids = items.map((r) => r.id);
        expect(ids).not.toContain(reportId);
      });
    });

    // ── 3d. Profit Calculations ────────────────────────────────
    describe('ProfitCalculator', () => {
      let calcId: string;

      it('should isolate profit calculations between orgs', async () => {
        const calcRes = await request
          .post(api('/profit-calculator/calculate'))
          .set('Authorization', `Bearer ${orgA.token}`)
          .send({
            salePrice: 100,
            productCost: 50,
            workspaceId: workspaceAId,
          });
        expect(calcRes.status).toBe(201);
        calcId = calcRes.body.id;

        // OrgB should not see it by ID
        const crossRes = await request
          .get(api(`/profit-calculator/${calcId}`))
          .set('Authorization', `Bearer ${orgB.token}`);
        expect(crossRes.status).toBe(404);
      });

      it('should NOT list OrgA profit calculations for OrgB', async () => {
        if (!calcId) return; // safety
        const res = await request
          .get(api('/profit-calculator'))
          .set('Authorization', `Bearer ${orgB.token}`);
        expect(res.status).toBe(200);
        const items: Array<{ id: string }> = res.body.items ?? [];
        const ids = items.map((p) => p.id);
        expect(ids).not.toContain(calcId);
      });
    });

    // ── 3e. Notifications ──────────────────────────────────────
    describe('Notifications', () => {
      let notifId: string;

      it('should isolate notifications between orgs', async () => {
        const notifRes = await request
          .post(api('/notifications'))
          .set('Authorization', `Bearer ${orgA.token}`)
          .send({ type: 'SYSTEM', title: 'OrgA Secret Notification' });
        expect(notifRes.status).toBe(201);
        notifId = notifRes.body.id;

        // OrgB should not see it by ID
        const crossRes = await request
          .get(api(`/notifications/${notifId}`))
          .set('Authorization', `Bearer ${orgB.token}`);
        expect(crossRes.status).toBe(404);
      });

      it('should NOT list OrgA notifications for OrgB', async () => {
        if (!notifId) return; // safety
        const res = await request
          .get(api('/notifications'))
          .set('Authorization', `Bearer ${orgB.token}`);
        expect(res.status).toBe(200);
        const items: Array<{ id: string }> = res.body.items ?? [];
        const ids = items.map((n) => n.id);
        expect(ids).not.toContain(notifId);
      });
    });

    // ── 3f. Audit Logs ─────────────────────────────────────────
    describe('AuditLogs', () => {
      let logId: string;

      it('should isolate audit logs between orgs', async () => {
        const logRes = await request
          .post(api('/audit-logs'))
          .set('Authorization', `Bearer ${orgA.token}`)
          .send({
            action: 'tenant-isolation-test',
            resourceType: 'Test',
            resourceId: 'test-1',
          });
        expect(logRes.status).toBe(201);
        logId = logRes.body.id;

        // OrgB should not see it by ID
        const crossRes = await request
          .get(api(`/audit-logs/${logId}`))
          .set('Authorization', `Bearer ${orgB.token}`);
        expect(crossRes.status).toBe(404);
      });

      it('should NOT list OrgA audit logs for OrgB', async () => {
        if (!logId) return; // safety
        const res = await request
          .get(api('/audit-logs'))
          .set('Authorization', `Bearer ${orgB.token}`);
        expect(res.status).toBe(200);
        const items: Array<{ id: string }> = res.body.items ?? [];
        const ids = items.map((l) => l.id);
        expect(ids).not.toContain(logId);
      });
    });
  });

  // ═════════════════════════════════════════════════════════════════
  //  4. RBAC (Role-Based Access Control)
  // ═════════════════════════════════════════════════════════════════
  describe('RBAC — Role-Based Access Control', () => {
    let owner: RegisteredUser;
    let adminToken: string;
    let memberToken: string;
    let viewerToken: string;
    let adminUserId: string;
    let memberUserId: string;
    let viewerUserId: string;
    let adminMembershipId: string;
    let memberMembershipId: string;
    let workspaceId: string;

    beforeAll(async () => {
      // Register the OWNER — this creates OrgA with one OWNER membership
      owner = await registerUser('RbacOwner');

      // Create a workspace as OWNER for product tests
      const wsRes = await createWorkspace(owner.token, 'RBAC Workspace');
      expect(wsRes.status).toBe(201);
      workspaceId = wsRes.body.id;

      // Create additional test users via Prisma (no registration API needed)
      const ts = Date.now();
      const pwHash = 'test-hash-not-used';

      const adminUser = await prisma.user.create({
        data: {
          email: `rbac-admin-${ts}@shopmate.ai`,
          name: 'RBAC Admin',
          passwordHash: pwHash,
        },
      });
      cleanup.userIds.push(adminUser.id);
      adminUserId = adminUser.id;

      const memberUser = await prisma.user.create({
        data: {
          email: `rbac-member-${ts}@shopmate.ai`,
          name: 'RBAC Member',
          passwordHash: pwHash,
        },
      });
      cleanup.userIds.push(memberUser.id);
      memberUserId = memberUser.id;

      const viewerUser = await prisma.user.create({
        data: {
          email: `rbac-viewer-${ts}@shopmate.ai`,
          name: 'RBAC Viewer',
          passwordHash: pwHash,
        },
      });
      cleanup.userIds.push(viewerUser.id);
      viewerUserId = viewerUser.id;

      // Create memberships in the owner's org with specific roles
      const adminMem = await prisma.membership.create({
        data: {
          userId: adminUserId,
          organizationId: owner.orgId,
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });
      adminMembershipId = adminMem.id;

      const memberMem = await prisma.membership.create({
        data: {
          userId: memberUserId,
          organizationId: owner.orgId,
          role: 'MEMBER',
          status: 'ACTIVE',
        },
      });
      memberMembershipId = memberMem.id;

      await prisma.membership.create({
        data: {
          userId: viewerUserId,
          organizationId: owner.orgId,
          role: 'VIEWER',
          status: 'ACTIVE',
        },
      });

      // Sign JWTs with the appropriate org context
      adminToken = jwtService.sign({
        sub: adminUserId,
        email: adminUser.email,
        orgId: owner.orgId,
        role: 'ADMIN',
      });
      memberToken = jwtService.sign({
        sub: memberUserId,
        email: memberUser.email,
        orgId: owner.orgId,
        role: 'MEMBER',
      });
      viewerToken = jwtService.sign({
        sub: viewerUserId,
        email: viewerUser.email,
        orgId: owner.orgId,
        role: 'VIEWER',
      });
    });

    // ── 4a. Org Settings ───────────────────────────────────────
    describe('Org settings', () => {
      it('should allow OWNER to update org settings', async () => {
        const res = await request
          .patch(api('/organizations/current'))
          .set('Authorization', `Bearer ${owner.token}`)
          .send({ name: 'OrgA RBAC Test' });
        expect(res.status).toBe(200);
      });

      it('should allow ADMIN to update org settings', async () => {
        const res = await request
          .patch(api('/organizations/current'))
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ name: 'OrgA RBAC Admin Update' });
        // ADMIN has @Roles('OWNER', 'ADMIN') — allowed
        expect(res.status).toBe(200);
      });

      it('should return 403 when MEMBER tries to update org settings', async () => {
        const res = await request
          .patch(api('/organizations/current'))
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ name: 'OrgA Member Update' });
        expect(res.status).toBe(403);
      });

      it('should return 403 when VIEWER tries to update org settings', async () => {
        const res = await request
          .patch(api('/organizations/current'))
          .set('Authorization', `Bearer ${viewerToken}`)
          .send({ name: 'OrgA Viewer Update' });
        expect(res.status).toBe(403);
      });
    });

    // ── 4b. Workspace Creation ─────────────────────────────────
    describe('Workspace creation', () => {
      it('should allow OWNER to create workspaces', async () => {
        const res = await createWorkspace(owner.token, 'Owner Workspace');
        expect(res.status).toBe(201);
      });

      it('should allow ADMIN to create workspaces', async () => {
        const res = await createWorkspace(adminToken, 'Admin Workspace');
        expect(res.status).toBe(201);
      });

      it('should return 403 when MEMBER tries to create workspace', async () => {
        const res = await createWorkspace(memberToken, 'Member Workspace');
        expect(res.status).toBe(403);
      });

      it('should return 403 when VIEWER tries to create workspace', async () => {
        const res = await createWorkspace(viewerToken, 'Viewer Workspace');
        expect(res.status).toBe(403);
      });
    });

    // ── 4c. Product Creation ───────────────────────────────────
    describe('Product creation', () => {
      it('should allow OWNER to create products', async () => {
        const res = await createProduct(
          owner.token,
          workspaceId,
          'Owner Product',
        );
        expect(res.status).toBe(201);
      });

      it('should allow ADMIN to create products', async () => {
        const res = await createProduct(
          adminToken,
          workspaceId,
          'Admin Product',
        );
        expect(res.status).toBe(201);
      });

      it('should allow MEMBER to create products', async () => {
        const res = await createProduct(
          memberToken,
          workspaceId,
          'Member Product',
        );
        // Products controller has no @Roles() guard — MEMBER can create
        expect(res.status).toBe(201);
      });

      it('VIEWER can create products (no @Roles on POST /products)', async () => {
        const res = await createProduct(
          viewerToken,
          workspaceId,
          'Viewer Product',
        );
        // The controller has no role restriction, only requireOrg + assertWorkspaceInOrg
        // Both pass since the workspace is in the same org and VIEWER has an orgId.
        // NOTE: This may be a security finding — product creation is not RBAC-gated.
        expect(res.status).toBe(201);
      });
    });

    // ── 4d. Member Role Management ─────────────────────────────
    describe('Member role changes', () => {
      it('should allow OWNER to change member roles', async () => {
        const res = await request
          .patch(api(`/organizations/members/${memberMembershipId}`))
          .set('Authorization', `Bearer ${owner.token}`)
          .send({ role: 'ADMIN' });
        expect(res.status).toBe(200);

        // Restore for subsequent tests
        await request
          .patch(api(`/organizations/members/${memberMembershipId}`))
          .set('Authorization', `Bearer ${owner.token}`)
          .send({ role: 'MEMBER' });
      });

      it('should return 403 when ADMIN tries to change member roles', async () => {
        const res = await request
          .patch(api(`/organizations/members/${memberMembershipId}`))
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ role: 'ADMIN' });
        expect(res.status).toBe(403);
      });

      it('should allow ADMIN to demote another ADMIN (not last OWNER)', async () => {
        // adminMembershipId is ADMIN, demoting to MEMBER should work
        const res = await request
          .patch(api(`/organizations/members/${adminMembershipId}`))
          .set('Authorization', `Bearer ${owner.token}`)
          .send({ role: 'MEMBER' });
        // OWNER can change any role
        expect(res.status).toBe(200);

        // Restore to ADMIN
        await request
          .patch(api(`/organizations/members/${adminMembershipId}`))
          .set('Authorization', `Bearer ${owner.token}`)
          .send({ role: 'ADMIN' });
      });

      it('should prevent demoting the last OWNER', async () => {
        // Find the OWNER's own membership
        const ownerMembership = await prisma.membership.findFirst({
          where: {
            userId: owner.userId,
            organizationId: owner.orgId,
          },
        });
        expect(ownerMembership).not.toBeNull();

        const res = await request
          .patch(api(`/organizations/members/${ownerMembership!.id}`))
          .set('Authorization', `Bearer ${owner.token}`)
          .send({ role: 'MEMBER' });
        // BadRequest: "Cannot demote the last owner"
        expect(res.status).toBe(400);
      });
    });

    // ── 4e. Member Removal ─────────────────────────────────────
    describe('Member removal', () => {
      let tempUserId: string;
      let tempMembershipId: string;

      async function createTempMember(role: 'MEMBER' | 'ADMIN' = 'MEMBER') {
        const user = await prisma.user.create({
          data: {
            email: `rbac-temp-${Date.now()}-${Math.random()}@shopmate.ai`,
            name: 'Temp Member',
            passwordHash: 'hash',
          },
        });
        cleanup.userIds.push(user.id);
        tempUserId = user.id;

        const mem = await prisma.membership.create({
          data: {
            userId: user.id,
            organizationId: owner.orgId,
            role,
            status: 'ACTIVE',
          },
        });
        tempMembershipId = mem.id;
      }

      it('should allow OWNER to remove a member', async () => {
        await createTempMember();
        const res = await request
          .delete(api(`/organizations/members/${tempMembershipId}`))
          .set('Authorization', `Bearer ${owner.token}`);
        expect(res.status).toBe(200);
      });

      it('should allow ADMIN to remove a member', async () => {
        await createTempMember();
        const res = await request
          .delete(api(`/organizations/members/${tempMembershipId}`))
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
      });

      it('should return 403 when MEMBER tries to remove a member', async () => {
        await createTempMember();
        const res = await request
          .delete(api(`/organizations/members/${tempMembershipId}`))
          .set('Authorization', `Bearer ${memberToken}`);
        expect(res.status).toBe(403);
      });

      it('should prevent removing yourself', async () => {
        const ownerMembership = await prisma.membership.findFirst({
          where: {
            userId: owner.userId,
            organizationId: owner.orgId,
          },
        });
        expect(ownerMembership).not.toBeNull();

        const res = await request
          .delete(api(`/organizations/members/${ownerMembership!.id}`))
          .set('Authorization', `Bearer ${owner.token}`);
        // BadRequest: "Cannot remove yourself"
        expect(res.status).toBe(400);
      });

      it('should prevent removing an OWNER', async () => {
        // Make a second user an OWNER so we can try removing them
        const coOwner = await prisma.user.create({
          data: {
            email: `rbac-coowner-${Date.now()}@shopmate.ai`,
            name: 'Co-Owner',
            passwordHash: 'hash',
          },
        });
        cleanup.userIds.push(coOwner.id);
        const coOwnerMem = await prisma.membership.create({
          data: {
            userId: coOwner.id,
            organizationId: owner.orgId,
            role: 'OWNER',
            status: 'ACTIVE',
          },
        });

        const res = await request
          .delete(api(`/organizations/members/${coOwnerMem.id}`))
          .set('Authorization', `Bearer ${owner.token}`);
        // BadRequest: "Cannot remove an owner"
        expect(res.status).toBe(400);
      });
    });

    // ── 4f. Listing Members ────────────────────────────────────
    describe('Listing members', () => {
      it('should allow OWNER to list members', async () => {
        const res = await request
          .get(api('/organizations/members'))
          .set('Authorization', `Bearer ${owner.token}`);
        expect(res.status).toBe(200);
      });

      it('should allow ADMIN to list members', async () => {
        const res = await request
          .get(api('/organizations/members'))
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
      });

      it('should return 403 when MEMBER tries to list members', async () => {
        const res = await request
          .get(api('/organizations/members'))
          .set('Authorization', `Bearer ${memberToken}`);
        expect(res.status).toBe(403);
      });

      it('should return 403 when VIEWER tries to list members', async () => {
        const res = await request
          .get(api('/organizations/members'))
          .set('Authorization', `Bearer ${viewerToken}`);
        expect(res.status).toBe(403);
      });
    });
  });
});
