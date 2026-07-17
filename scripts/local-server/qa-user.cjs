const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
const argon2 = require('argon2');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const action = process.argv[2];
const credentialPath = process.env.QA_LOGIN_FILE || '/tmp/qa-login.json';

async function runInTenantContext(organizationId, operation) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "SELECT set_config('app.current_organization_id', $1, true)",
      organizationId,
    );
    const rows = await tx.$queryRawUnsafe(
      "SELECT current_setting('app.current_organization_id', true) AS organization_id",
    );
    if (rows[0]?.organization_id !== organizationId) {
      throw new Error('Tenant context verification failed.');
    }
    return operation(tx);
  });
}

async function main() {
  if (!['create', 'rotate', 'remove', 'purge-local-qa'].includes(action)) {
    throw new Error(
      'Usage: node qa-user.cjs <create|rotate|remove|purge-local-qa>',
    );
  }

  if (action === 'purge-local-qa') {
    const users = await prisma.user.findMany({
      where: { name: 'Local QA' },
      select: { id: true },
    });
    for (const user of users) {
      await prisma.membership.deleteMany({ where: { userId: user.id } });
      try {
        await prisma.user.delete({ where: { id: user.id } });
      } catch {
        await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
        await prisma.user.update({
          where: { id: user.id },
          data: {
            status: 'SUSPENDED',
            passwordHash: await argon2.hash(`qa-disabled-${Date.now()}`),
          },
        });
      }
    }
    console.log(`Local QA accounts cleaned: ${users.length}`);
    return;
  }

  const credentials = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
  if (!credentials.email || !credentials.password || !credentials.organizationId) {
    throw new Error('QA credential file is incomplete.');
  }

  if (action === 'rotate') {
    // Generate inside the trusted helper so the replacement secret never
    // appears in a shell command, process argument, or console output.
    credentials.password = `Qa!${randomBytes(36).toString('base64url')}`;
    fs.writeFileSync(
      credentialPath,
      `${JSON.stringify(credentials, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
  }

  if (action === 'create' || action === 'rotate') {
    const passwordHash = await argon2.hash(credentials.password);
    await runInTenantContext(credentials.organizationId, async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: credentials.organizationId },
        select: { id: true },
      });
      if (!organization) throw new Error('QA organization does not exist.');

      if (credentials.grantEnterprise !== false) {
        await tx.organization.update({
          where: { id: credentials.organizationId },
          data: { plan: 'ENTERPRISE', trialEndsAt: null },
        });
      }

      const user = await tx.user.upsert({
        where: { email: credentials.email },
        update: {
          passwordHash,
          name: 'Local QA',
          status: 'ACTIVE',
          locale: 'zh-CN',
          timezone: 'Asia/Shanghai',
          twoFactorEnabled: false,
          twoFactorSecret: null,
        },
        create: {
          email: credentials.email,
          passwordHash,
          name: 'Local QA',
          status: 'ACTIVE',
          locale: 'zh-CN',
          timezone: 'Asia/Shanghai',
        },
      });
      await tx.membership.upsert({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: credentials.organizationId,
          },
        },
        update: { role: 'OWNER', status: 'ACTIVE' },
        create: {
          userId: user.id,
          organizationId: credentials.organizationId,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });
      if (action === 'rotate') {
        await tx.refreshToken.deleteMany({ where: { userId: user.id } });
      }
    });
    if (action === 'rotate') {
      console.log('Local QA credential rotated and refresh tokens revoked.');
    } else {
      console.log(
        credentials.grantEnterprise === false
          ? 'Local QA account created without changing organization entitlement.'
          : 'Local QA account created with ENTERPRISE test entitlement.',
      );
    }
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email: credentials.email },
    select: { id: true },
  });
  if (!user) {
    console.log('Local QA account is already absent.');
    return;
  }

  await runInTenantContext(credentials.organizationId, (tx) =>
    tx.membership.deleteMany({ where: { userId: user.id } }),
  );
  try {
    await prisma.user.delete({ where: { id: user.id } });
    console.log('Local QA account deleted.');
  } catch {
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'SUSPENDED', passwordHash: await argon2.hash(credentials.password + Date.now()) },
    });
    console.log('Local QA account suspended because linked audit data prevents deletion.');
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
