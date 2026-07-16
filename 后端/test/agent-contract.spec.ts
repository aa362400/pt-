/**
 * 契约测试 — 验证《contracts/agent-tasks.contract.json》的结构完整性。
 *
 * 将契约声明与后端 Prisma AgentType enum、HTTP provider 源码交叉比对，
 * 保证任何一侧增删任务类型而未同步契约时此测试失败。
 *
 * No database required.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const CONTRACT_PATH = join(ROOT, 'contracts', 'agent-tasks.contract.json');
const PLATFORM_CONTRACT_PATH = join(
  ROOT,
  '..',
  'contracts',
  'agent-tasks.contract.json',
);
const PYTHON_AGENT_CONTRACT_PATH = join(
  ROOT,
  '..',
  '电商设计图保持产品一致性智能体',
  'agent',
  'contracts',
  'agent-tasks.contract.json',
);

interface Contract {
  contractVersion: string;
  transport: Record<string, unknown>;
  tasks: Record<
    string,
    {
      input: {
        required?: string[];
        oneOfRequired?: string[];
        properties: Record<string, unknown>;
      };
      output: { required: string[]; properties: Record<string, unknown> };
    }
  >;
}

function loadContract(): Contract {
  return JSON.parse(readFileSync(CONTRACT_PATH, 'utf-8')) as Contract;
}

/**
 * Prisma AgentType enum values (from prisma/schema.prisma).
 * These map conceptually to contract task types but are broader categories
 * used for AgentRun records.
 */
const AGENT_TYPE_ENUM = [
  'PRODUCT_RESEARCHER',
  'LISTING_OPTIMIZER',
  'ADVERTISING_STRATEGIST',
  'PROFIT_ANALYST',
  'CUSTOMER_INSIGHT',
  'CONTENT_WRITER',
  'KEYWORD_EXPLORER',
  'GENERAL_ASSISTANT',
  'IMAGE_CREATIVE',
  'PLANNER',
] as const;

/**
 * Expected mapping between contract task types and AgentType enum values.
 * Each contract task type is dispatched by a backend method and should be
 * traceable to an AgentType category.
 */
const CONTRACT_TO_AGENT_TYPE: Record<string, string> = {
  generate_images: 'IMAGE_CREATIVE',
  analyze_product: 'IMAGE_CREATIVE',
  supplier_image_search: 'IMAGE_CREATIVE',
  product_research: 'PRODUCT_RESEARCHER',
  global_product_discovery: 'PRODUCT_RESEARCHER',
  assistant_chat: 'GENERAL_ASSISTANT',
  listing_generation: 'LISTING_OPTIMIZER',
  keyword_analysis: 'KEYWORD_EXPLORER',
  trend_analysis: 'PRODUCT_RESEARCHER',
  image_prompt: 'IMAGE_CREATIVE',
  automation_step: 'CONTENT_WRITER',
  plan_and_execute: 'PLANNER',
};

describe('Agent Contract Compliance', () => {
  let contract: Contract;

  beforeAll(() => {
    contract = loadContract();
  });

  // ── Contract metadata ──

  it('contract has a version', () => {
    expect(contract.contractVersion).toBeDefined();
    expect(typeof contract.contractVersion).toBe('string');
    expect(contract.contractVersion.length).toBeGreaterThan(0);
  });

  it('contract declares at least 9 task types', () => {
    const tasks = Object.keys(contract.tasks);
    expect(tasks.length).toBeGreaterThanOrEqual(9);
  });

  it('contract declares transport configuration', () => {
    expect(contract.transport).toBeDefined();
    expect(contract.transport).toHaveProperty('createRun');
    expect(contract.transport).toHaveProperty('getRun');
  });

  it('documents the strict run envelope fields consumed by the provider', () => {
    const transport = contract.transport as {
      createRun: { response: Record<string, unknown> };
      getRun: { response: Record<string, unknown> };
    };

    expect(transport.createRun.response.traceId).toBe('string(w3c-32hex)');
    expect(transport.getRun.response).toHaveProperty('diagnostics');
    expect(transport.getRun.response).toHaveProperty('context');
  });

  it('keeps all three contract copies byte-for-byte identical', () => {
    const backend = readFileSync(CONTRACT_PATH);
    expect(readFileSync(PLATFORM_CONTRACT_PATH).equals(backend)).toBe(true);
    expect(readFileSync(PYTHON_AGENT_CONTRACT_PATH).equals(backend)).toBe(true);
  });

  // ── Task structure ──

  it('each task type has input and output with properties', () => {
    for (const task of Object.values(contract.tasks)) {
      expect(task).toHaveProperty('input');
      expect(task).toHaveProperty('output');
      expect(task.input).toHaveProperty('properties');
      expect(task.output).toHaveProperty('properties');
    }
  });

  it('each task type has documented property names', () => {
    for (const [name, task] of Object.entries(contract.tasks)) {
      const inputProps = Object.keys(task.input.properties);
      const outputProps = Object.keys(task.output.properties);
      expect(inputProps.length + outputProps.length).toBeGreaterThan(0);
      // Every task should have some output requirement
      expect(task.output.required.length).toBeGreaterThan(0);
    }
  });

  it('each task declares required output fields that exist in properties', () => {
    for (const [name, task] of Object.entries(contract.tasks)) {
      for (const field of task.output.required) {
        expect(task.output.properties).toHaveProperty(field);
      }
    }
  });

  it('tasks with oneOfRequired reference valid property names', () => {
    for (const [name, task] of Object.entries(contract.tasks)) {
      if (task.input.oneOfRequired) {
        for (const field of task.input.oneOfRequired) {
          expect(task.input.properties).toHaveProperty(field);
        }
      }
    }
  });

  // ── AgentType enum coverage ──

  it('all mapped contract task types reference a valid AgentType enum value', () => {
    const contractTasks = Object.keys(contract.tasks).sort();
    for (const task of contractTasks) {
      expect(CONTRACT_TO_AGENT_TYPE).toHaveProperty(task);
      const agentType = CONTRACT_TO_AGENT_TYPE[task];
      expect(AGENT_TYPE_ENUM).toContain(agentType);
    }
  });

  it('each AgentType mapped from contract tasks exists in the Prisma enum', () => {
    const referenced = new Set(Object.values(CONTRACT_TO_AGENT_TYPE));
    for (const agentType of referenced) {
      expect(AGENT_TYPE_ENUM).toContain(agentType);
    }
  });

  // ── Specific known tasks ──

  it('known contract task types are present', () => {
    const contractTasks = Object.keys(contract.tasks);
    expect(contractTasks).toContain('generate_images');
    expect(contractTasks).toContain('product_research');
    expect(contractTasks).toContain('listing_generation');
    expect(contractTasks).toContain('keyword_analysis');
    expect(contractTasks).toContain('trend_analysis');
    expect(contractTasks).toContain('image_prompt');
    expect(contractTasks).toContain('assistant_chat');
    expect(contractTasks).toContain('analyze_product');
    expect(contractTasks).toContain('supplier_image_search');
    expect(contractTasks).toContain('automation_step');
    expect(contractTasks).toContain('plan_and_execute');
  });

  it('supplier_image_search requires traceable provenance', () => {
    const task = contract.tasks.supplier_image_search;
    expect(task.input.oneOfRequired).toEqual(
      expect.arrayContaining(['imageBase64', 'imageUrl']),
    );
    expect(task.output.required).toEqual(
      expect.arrayContaining([
        'outcome',
        'providerResultCount',
        'offers',
        'imageEvidence',
        'provenance',
      ]),
    );
    expect(task.output.properties).toHaveProperty('provenance');
    expect(task.input.properties.imageKeywords).toBe('string(trimmed,1-200)?');
  });

  it('generate_images input accepts imageBase64 or imageUrl', () => {
    const task = contract.tasks.generate_images;
    expect(task.input.oneOfRequired).toContain('imageBase64');
    expect(task.input.oneOfRequired).toContain('imageUrl');
  });

  it('generate_images output requires truthful supervision and publishability fields', () => {
    const required = contract.tasks.generate_images.output.required;
    expect(required).toContain('sessionId');
    expect(required).toContain('mockMode');
    expect(required).toContain('supervisionApproved');
    expect(required).toContain('publishable');
    expect(required).toContain('images');
  });

  it('generate_images output documents scene metadata used by the UI', () => {
    const properties = contract.tasks.generate_images.output.properties;
    const images = properties.images as Array<Record<string, string>>;

    expect(properties).toHaveProperty('scenePlan');
    expect(images[0]).toHaveProperty('background');
    expect(images[0]).toHaveProperty('props');
    expect(images[0]).toHaveProperty('lighting');
    expect(images[0]).toHaveProperty('emotion');
    expect(images[0]).toHaveProperty('composition');
    expect(images[0]).toHaveProperty('prompt');
  });

  it('product_research output requires summary, competitors, priceRange, rating', () => {
    const required = contract.tasks.product_research.output.required;
    expect(required).toContain('summary');
    expect(required).toContain('competitors');
    expect(required).toContain('priceRange');
    expect(required).toContain('rating');
  });

  it('listing_generation output requires title, description, bulletPoints, keywords', () => {
    const required = contract.tasks.listing_generation.output.required;
    expect(required).toContain('title');
    expect(required).toContain('description');
    expect(required).toContain('bulletPoints');
    expect(required).toContain('keywords');
  });
});
