import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ShopMate!2026";

async function main() {
  console.log("🌱 Seeding ShopMate AI database...");

  // ── 1. Create Organization ────────────────────────────
  const org = await prisma.organization.upsert({
    where: { slug: "shopmate-demo" },
    update: {},
    create: {
      name: "ShopMate Demo",
      slug: "shopmate-demo",
      plan: "PROFESSIONAL",
      trialEndsAt: new Date("2026-08-01"),
    },
  });
  console.log(`  ✔ Organization: ${org.name}`);

  // ── 2. Create Admin User ──────────────────────────────
  const adminPasswordHash = await argon2.hash(ADMIN_PASSWORD);
  const admin = await prisma.user.upsert({
    where: { email: "admin@shopmate.ai" },
    update: { passwordHash: adminPasswordHash },
    create: {
      email: "admin@shopmate.ai",
      passwordHash: adminPasswordHash,
      name: "Admin Zhang",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=admin",
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      status: "ACTIVE",
    },
  });
  console.log(`  ✔ User: ${admin.name} (${admin.email})`);

  // ── 3. Create Membership ──────────────────────────────
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: admin.id, organizationId: org.id } },
    update: {},
    create: {
      userId: admin.id,
      organizationId: org.id,
      role: "OWNER",
      status: "ACTIVE",
    },
  });
  console.log("  ✔ Membership: Admin → Organization");

  // ── 4. Create Workspace ───────────────────────────────
  const workspace = await prisma.workspace.upsert({
    where: { id: "workspace_amazon_us" },
    update: {},
    create: {
      id: "workspace_amazon_us",
      organizationId: org.id,
      name: "Amazon 美国站",
      channelType: "AMAZON_US",
      marketplace: "Amazon.com",
      currency: "USD",
      timezone: "America/Los_Angeles",
      status: "ACTIVE",
    },
  });
  console.log(`  ✔ Workspace: ${workspace.name}`);

  // ── 5. Create Products ────────────────────────────────
  const product1 = await prisma.product.upsert({
    where: { id: "prod_bluetooth_earbuds" },
    update: {},
    create: {
      id: "prod_bluetooth_earbuds",
      workspaceId: workspace.id,
      title: "Wireless Bluetooth Earbuds Pro X1",
      sku: "BT-EBUDS-PRO-X1",
      asinOrExternalId: "B0EXAMPLE001",
      images: [
        "https://shopmate-demo.s3.amazonaws.com/products/ebuds-1.jpg",
        "https://shopmate-demo.s3.amazonaws.com/products/ebuds-2.jpg",
      ],
      cost: 8.5,
      price: 29.99,
      currency: "USD",
      status: "ACTIVE",
      metadata: {
        brand: "AudioTech",
        category: "Electronics > Headphones & Earbuds",
        weight: "0.15kg",
        dimensions: "6.5 x 5.0 x 2.8 cm",
      },
    },
  });

  const product2 = await prisma.product.upsert({
    where: { id: "prod_yoga_mat" },
    update: {},
    create: {
      id: "prod_yoga_mat",
      workspaceId: workspace.id,
      title: "Premium Non-Slip Yoga Mat 6mm",
      sku: "YOGA-MAT-6MM-NS",
      asinOrExternalId: "B0EXAMPLE002",
      images: [
        "https://shopmate-demo.s3.amazonaws.com/products/yogamat-1.jpg",
      ],
      cost: 6.2,
      price: 24.99,
      currency: "USD",
      status: "ACTIVE",
      metadata: {
        brand: "ZenFit",
        category: "Sports & Outdoors > Yoga",
        material: "TPE",
        color: "Purple",
      },
    },
  });
  console.log(`  ✔ Products: ${product1.title}, ${product2.title}`);

  // ── 6. Create KnowledgeDocuments ──────────────────────
  const doc1 = await prisma.knowledgeDocument.upsert({
    where: { id: "kdoc_listing_best_practices" },
    update: {},
    create: {
      id: "kdoc_listing_best_practices",
      organizationId: org.id,
      workspaceId: workspace.id,
      title: "Amazon Listing Optimization Best Practices",
      content: `## Listing Optimization Guidelines

1. **Title**: Keep under 200 characters. Include: Brand + Product Type + Key Features + Size/Color.
2. **Bullet Points**: 5 bullet points highlighting key benefits, each 100-200 characters.
3. **Description**: Use HTML formatting (bold, italics, line breaks) for readability.
4. **Images**: At least 7 high-resolution images (1000x1000+). Include infographics.
5. **Backend Keywords**: Fill all 5 search term fields, no commas, no duplicates.
6. **A+ Content**: Use Enhanced Brand Content to improve conversion by 5-10%.

> Reference: Amazon Style Guide 2026`,
      tags: ["listing", "amazon", "optimization", "best-practices"],
      visibility: "WORKSPACE",
      createdBy: admin.id,
    },
  });

  const doc2 = await prisma.knowledgeDocument.upsert({
    where: { id: "kdoc_ppc_strategy" },
    update: {},
    create: {
      id: "kdoc_ppc_strategy",
      organizationId: org.id,
      title: "PPC Advertising Strategy Guide",
      content: `## Amazon PPC Strategy

### Campaign Structure
- **SP (Sponsored Products)**: Target high-converting ASINs and keywords
- **SB (Sponsored Brands)**: Build brand awareness with custom creatives
- **SD (Sponsored Display)**: Retarget and cross-sell

### Bidding Strategies
1. **Dynamic bids - down only**: For cost control
2. **Fixed bids**: For exact-match testing
3. **Dynamic bids - up and down**: For aggressive scaling

### Optimization Rules
- ACOS < 30%: Maintain and scale
- ACOS 30-50%: Analyze and optimize
- ACOS > 50%: Pause or restructure

> Last updated: 2026-06`,
      tags: ["ppc", "advertising", "amazon", "strategy"],
      visibility: "ORGANIZATION",
      createdBy: admin.id,
    },
  });
  console.log(`  ✔ KnowledgeDocuments: ${doc1.title}, ${doc2.title}`);

  // ── 7. Create SOP ─────────────────────────────────────
  const sop = await prisma.sop.upsert({
    where: { id: "sop_product_launch" },
    update: {},
    create: {
      id: "sop_product_launch",
      organizationId: org.id,
      title: "New Product Launch Checklist",
      description: "Step-by-step SOP for launching a new product on Amazon US",
      status: "PUBLISHED",
      steps: [
        {
          step: 1,
          title: "Market Research",
          description: "Conduct competitor analysis and keyword research",
          assignee: "Product Team",
          estimatedHours: 8,
        },
        {
          step: 2,
          title: "Listing Creation",
          description: "Write title, bullet points, description and backend keywords",
          assignee: "Content Team",
          estimatedHours: 4,
        },
        {
          step: 3,
          title: "Image Production",
          description: "Create main image, infographics, lifestyle images",
          assignee: "Design Team",
          estimatedHours: 16,
        },
        {
          step: 4,
          title: "Inventory Preparation",
          description: "Arrange FBA shipment or prepare FBM logistics",
          assignee: "Operations",
          estimatedHours: 8,
        },
        {
          step: 5,
          title: "PPC Campaign Setup",
          description: "Configure auto and manual campaigns with initial bids",
          assignee: "Advertising Team",
          estimatedHours: 4,
        },
        {
          step: 6,
          title: "Launch & Monitor",
          description: "Go live, monitor first 72 hours, adjust bids",
          assignee: "All Teams",
          estimatedHours: 24,
        },
      ],
      createdBy: admin.id,
      publishedAt: new Date("2026-06-15"),
    },
  });
  console.log(`  ✔ SOP: ${sop.title}`);

  // ── 8. Create TeamTasks ────────────────────────────────
  const task1 = await prisma.teamTask.upsert({
    where: { id: "task_q3_keyword_research" },
    update: {},
    create: {
      id: "task_q3_keyword_research",
      organizationId: org.id,
      workspaceId: workspace.id,
      title: "Q3 Keyword Research for Bluetooth Earbuds",
      description: "Run Helium 10 and DataDive to find long-tail keywords with high opportunity score. Target 50+ keywords.",
      priority: "HIGH",
      status: "IN_PROGRESS",
      createdBy: admin.id,
      assigneeId: admin.id,
      dueAt: new Date("2026-07-10"),
    },
  });

  const task2 = await prisma.teamTask.upsert({
    where: { id: "task_yoga_mat_aplus" },
    update: {},
    create: {
      id: "task_yoga_mat_aplus",
      organizationId: org.id,
      workspaceId: workspace.id,
      title: "Update Yoga Mat Listing with A+ Content",
      description: "Create EBC/A+ content module with comparison chart and lifestyle imagery.",
      priority: "MEDIUM",
      status: "TODO",
      createdBy: admin.id,
      assigneeId: admin.id,
      dueAt: new Date("2026-07-20"),
    },
  });
  console.log(`  ✔ TeamTasks: ${task1.title}, ${task2.title}`);

  // ── 9. Create PromptTemplates ─────────────────────────
  const prompt1 = await prisma.promptTemplate.upsert({
    where: { id: "prompt_listing_title" },
    update: {},
    create: {
      id: "prompt_listing_title",
      organizationId: org.id,
      title: "Amazon Listing Title Generator",
      description: "Generates optimized Amazon product titles based on product features",
      category: "listing",
      content: `You are an expert Amazon listing copywriter. Create an optimized product title for the following product:

Product: {{product_name}}
Key Features: {{features}}
Target Keywords: {{keywords}}
Brand: {{brand}}

Rules:
- Max 200 characters
- Format: Brand + Product Type + Key Features + Size/Color/Pack
- Include primary keyword naturally
- No promotional language (Best Seller, #1, etc.)

Generate 3 title variations:`,
      variables: [
        { name: "product_name", type: "string", required: true },
        { name: "features", type: "string", required: true },
        { name: "keywords", type: "string", required: true },
        { name: "brand", type: "string", required: true },
      ],
      usageCount: 47,
      createdBy: admin.id,
    },
  });

  const prompt2 = await prisma.promptTemplate.upsert({
    where: { id: "prompt_ppc_structure" },
    update: {},
    create: {
      id: "prompt_ppc_structure",
      organizationId: org.id,
      title: "PPC Campaign Structure Builder",
      description: "Creates a complete PPC campaign structure for new product launches",
      category: "advertising",
      content: `Design a PPC campaign structure for a new product launch on Amazon {{marketplace}}.

Product: {{product_name}}
Price Point: {{price}}
Category: {{category}}
Key Competitors: {{competitors}}

Generate:
1. 3 Auto campaigns (broad, loose match)
2. 5 Manual targeting campaigns (exact match, phrase match)
3. Recommended bids for each ad group
4. Negative keyword list`,
      variables: [
        { name: "product_name", type: "string", required: true },
        { name: "marketplace", type: "string", required: true },
        { name: "price", type: "number", required: true },
        { name: "category", type: "string", required: true },
        { name: "competitors", type: "string", required: false },
      ],
      usageCount: 31,
      createdBy: admin.id,
    },
  });
  console.log(`  ✔ PromptTemplates: ${prompt1.title}, ${prompt2.title}`);

  // ── 10. Create AutomationFlow ─────────────────────────
  const flow = await prisma.automationFlow.upsert({
    where: { id: "flow_daily_health_check" },
    update: {},
    create: {
      id: "flow_daily_health_check",
      organizationId: org.id,
      workspaceId: workspace.id,
      name: "Daily Store Health Check",
      description: "Checks store metrics daily and sends alerts if anomalies detected",
      status: "ACTIVE",
      triggerType: "SCHEDULE",
      triggerConfig: {
        cron: "0 8 * * *",
        timezone: "America/Los_Angeles",
      },
      steps: [
        {
          step: 1,
          action: "fetch_metrics",
          params: { days: 1 },
        },
        {
          step: 2,
          action: "analyze_trends",
          params: {
            comparePreviousDays: 7,
          },
        },
        {
          step: 3,
          action: "generate_report",
          params: {
            format: "summary",
          },
        },
        {
          step: 4,
          action: "notify_if_anomaly",
          params: {
            channels: ["email", "in_app"],
            thresholds: { salesDrop: 20, acosIncrease: 15 },
          },
        },
      ],
      successRate: 95.5,
      lastRunAt: new Date("2026-07-03T08:05:00Z"),
      nextRunAt: new Date("2026-07-04T08:00:00Z"),
      createdBy: admin.id,
    },
  });
  console.log(`  ✔ AutomationFlow: ${flow.name}`);

  // ── 11. Create StoreMetricSnapshots (4 days) ──────────
  const metricData = [
    { date: "2026-07-01", health: 82, orders: 47, revenue: 1285.5, conv: 0.125, acos: 28.3, reviewRate: 0.042, refundRate: 0.018 },
    { date: "2026-07-02", health: 85, orders: 52, revenue: 1423.75, conv: 0.131, acos: 26.8, reviewRate: 0.038, refundRate: 0.015 },
    { date: "2026-07-03", health: 79, orders: 38, revenue: 1042.2, conv: 0.118, acos: 31.2, reviewRate: 0.051, refundRate: 0.022 },
    { date: "2026-07-04", health: 88, orders: 61, revenue: 1678.9, conv: 0.142, acos: 24.5, reviewRate: 0.045, refundRate: 0.012 },
  ];

  for (const m of metricData) {
    await prisma.storeMetricSnapshot.upsert({
      where: {
        workspaceId_date: {
          workspaceId: workspace.id,
          date: new Date(m.date),
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        date: new Date(m.date),
        healthScore: m.health,
        orders: m.orders,
        revenue: m.revenue,
        conversionRate: m.conv,
        acos: m.acos,
        reviewRate: m.reviewRate,
        refundRate: m.refundRate,
        metadata: {
          source: "Amazon Seller Central",
          currency: "USD",
        },
      },
    });
  }
  console.log("  ✔ StoreMetricSnapshots: 4 days");

  // ── 12. Create Alerts ─────────────────────────────────
  const alerts = [
    {
      id: "alert_yoga_mat_sales_drop",
      type: "SALES_DROP" as const,
      severity: "WARNING" as const,
      title: "Yoga Mat Sales Dropped 25%",
      description: "Sales for Premium Non-Slip Yoga Mat dropped 25% compared to last week. Check competitor pricing.",
      source: "Daily Health Check Automation",
      status: "OPEN" as const,
    },
    {
      id: "alert_account_health_good",
      type: "ACCOUNT_HEALTH" as const,
      severity: "INFO" as const,
      title: "Account Health Rating: Good",
      description: "Your account health rating is 88/100. No action required at this time.",
      source: "Amazon Seller Central",
      status: "RESOLVED" as const,
      resolvedAt: new Date("2026-07-03T10:30:00Z"),
    },
    {
      id: "alert_acos_threshold",
      type: "AD_PERFORMANCE" as const,
      severity: "CRITICAL" as const,
      title: "ACOS Exceeded 30% Threshold",
      description: "Bluetooth Earbuds Sponsored Products campaign ACOS reached 34.7%, exceeding the 30% target.",
      source: "PPC Monitor",
      status: "ACKNOWLEDGED" as const,
    },
  ];

  for (const alert of alerts) {
    await prisma.alert.upsert({
      where: { id: alert.id },
      update: {},
      create: {
        organizationId: org.id,
        workspaceId: workspace.id,
        ...alert,
        metadata: alert.resolvedAt ? { resolvedBy: "system_auto" } : undefined,
      },
    });
  }
  console.log("  ✔ Alerts: 3 created");

  // ── 13. Create ProfitCalculation ──────────────────────
  await prisma.profitCalculation.upsert({
    where: { id: "pcalc_bluetooth_earbuds" },
    update: {},
    create: {
      id: "pcalc_bluetooth_earbuds",
      organizationId: org.id,
      workspaceId: workspace.id,
      productId: product1.id,
      currency: "USD",
      salePrice: 29.99,
      productCost: 8.5,
      packagingCost: 0.85,
      shippingCost: 4.5,
      platformFee: 4.5,
      paymentFee: 0.9,
      adCost: 3.2,
      storageCost: 0.75,
      otherCost: 0.5,
      totalCost: 23.7,
      estimatedProfit: 6.29,
      profitMargin: 20.97,
      roi: 26.5,
      scenarios: [
        {
          name: "Price Drop to $24.99",
          salePrice: 24.99,
          estimatedProfit: 1.29,
          profitMargin: 5.16,
          roi: 5.44,
        },
        {
          name: "Increase Ad Spend 20%",
          salePrice: 29.99,
          adCost: 3.84,
          estimatedProfit: 5.65,
          profitMargin: 18.84,
          roi: 23.81,
        },
        {
          name: "Reduce COGS by 10%",
          salePrice: 29.99,
          productCost: 7.65,
          estimatedProfit: 7.14,
          profitMargin: 23.81,
          roi: 31.26,
        },
      ],
      createdBy: admin.id,
    },
  });
  console.log("  ✔ ProfitCalculation: 1 created");

  console.log("");
  console.log("✅ Seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
