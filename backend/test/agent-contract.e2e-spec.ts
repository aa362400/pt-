/**
 * english_text — text HttpAgentProvider text《contracts/agent-tasks.contract.json》sync。
 *
 * passedtext provider english_text taskType，english_text，
 * english_texttaskenglish_textsyncenglish_textfailed。
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

interface Contract {
  contractVersion: string;
  tasks: Record<string, { output: { required: string[] } }>;
}

function loadContract(): Contract {
  const raw = readFileSync(
    join(ROOT, '..', 'contracts', 'agent-tasks.contract.json'),
    'utf-8',
  );
  return JSON.parse(raw) as Contract;
}

function providerSource(): string {
  return readFileSync(
    join(ROOT, 'src', 'agents', 'http-agent.provider.ts'),
    'utf-8',
  );
}

describe('Agent API contract', () => {
  const contract = loadContract();
  const source = providerSource();

  it('declares a contract version', () => {
    expect(contract.contractVersion).toBeTruthy();
  });

  it('provider only calls task types declared in the contract', () => {
    const called = new Set<string>();
    for (const match of source.matchAll(/runRemoteTask\(\s*'([a-z_]+)'/g)) {
      called.add(match[1]);
    }
    // runImageGeneration text generate_images
    expect(called.size).toBeGreaterThan(0);
    const declared = new Set(Object.keys(contract.tasks));
    for (const task of called) {
      expect(declared).toContain(task);
    }
  });

  it('contract task types are all reachable from the provider', () => {
    // analyze_product textplatformenglish_text（text generate_images english_text），text
    const exempt = new Set(['analyze_product']);
    for (const task of Object.keys(contract.tasks)) {
      if (exempt.has(task)) continue;
      expect(source).toContain(`'${task}'`);
    }
  });

  it('provider result mapping covers required output fields', () => {
    // english_texttaskenglish_textoutputfields，provider english_textfieldstext
    const checks: Record<string, string[]> = {
      product_research: contract.tasks.product_research.output.required,
      listing_generation: contract.tasks.listing_generation.output.required,
      keyword_analysis: contract.tasks.keyword_analysis.output.required,
      trend_analysis: contract.tasks.trend_analysis.output.required,
      image_prompt: contract.tasks.image_prompt.output.required,
      supplier_image_search:
        contract.tasks.supplier_image_search.output.required,
      assistant_chat: contract.tasks.assistant_chat.output.required,
    };
    for (const [task, fields] of Object.entries(checks)) {
      for (const field of fields) {
        expect(source).toContain(field);
      }
    }
  });
});
