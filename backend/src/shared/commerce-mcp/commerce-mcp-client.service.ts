import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalJson } from './commerce-mcp-trust-signature.js';

export interface CommerceMcpToolManifest {
  name: CommerceMcpToolName;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface McpResponse {
  jsonrpc: '2.0';
  id: number;
  result?: {
    content?: Array<{ type: string; text: string }>;
    isError?: boolean;
    tools?: CommerceMcpToolManifest[];
    protocolVersion?: string;
    serverInfo?: { name?: string; version?: string };
    executableHash?: string;
  };
  error?: { code: number; message: string };
}

export type CommerceMcpToolName =
  | 'calc_profit'
  | 'suggest_keywords'
  | 'generate_image_prompts'
  | 'export_listing_csv'
  | 'temu_price_check'
  | 'temu_pricing_engine'
  | 'ozon_pricing_engine'
  | 'check_risk'
  | 'amazon_title_optimizer'
  | 'listing_quality_score'
  | 'export_image_pack'
  | 'analyze_opportunity';

@Injectable()
export class CommerceMcpClientService {
  constructor(private readonly configService: ConfigService) {}

  async callTool(
    toolName: CommerceMcpToolName,
    argumentsPayload: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await this.runJsonRpc({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: argumentsPayload,
      },
    });

    if (response.error) {
      throw new BadGatewayException({
        message: 'Commerce MCP server returned a JSON-RPC error',
        error: response.error,
      });
    }

    const result = response.result;
    const text = result?.content?.find((item) => item.type === 'text')?.text;
    if (!text) {
      throw new BadGatewayException(
        'Commerce MCP server returned an empty tool response',
      );
    }
    if (result?.isError) {
      throw new BadRequestException({
        message: 'Commerce MCP tool rejected the request',
        detail: text,
      });
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { text };
    }
  }

  async getManifest() {
    const [initialized, listed] = await Promise.all([
      this.runJsonRpc({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'initialize',
        params: {},
      }),
      this.runJsonRpc({
        jsonrpc: '2.0',
        id: Date.now() + 1,
        method: 'tools/list',
        params: {},
      }),
    ]);
    if (initialized.error || listed.error) {
      throw new BadGatewayException('Commerce MCP manifest discovery failed');
    }
    const tools = listed.result?.tools ?? [];
    const canonical = canonicalJson(
      tools
        .map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    );
    const httpBaseUrl = this.httpBaseUrl();
    const scriptPath = httpBaseUrl ? undefined : this.serverPath();
    const executableHash = httpBaseUrl
      ? initialized.result?.executableHash
      : createHash('sha256').update(readFileSync(scriptPath!)).digest('hex');
    if (!executableHash) {
      throw new BadGatewayException(
        'Commerce MCP server did not expose an executable integrity hash',
      );
    }
    return {
      server: {
        name: initialized.result?.serverInfo?.name ?? 'unknown',
        version: initialized.result?.serverInfo?.version ?? 'unknown',
        protocolVersion: initialized.result?.protocolVersion ?? 'unknown',
      },
      transport: httpBaseUrl ? ('http' as const) : ('stdio' as const),
      tools,
      manifestHash: createHash('sha256')
        .update(canonical, 'utf8')
        .digest('hex'),
      executableHash,
      discoveredAt: new Date().toISOString(),
    };
  }

  private runJsonRpc(request: Record<string, unknown>): Promise<McpResponse> {
    const httpBaseUrl = this.httpBaseUrl();
    if (httpBaseUrl) {
      return this.runHttpJsonRpc(httpBaseUrl, request);
    }
    return this.runStdioJsonRpc(this.serverPath(), request);
  }

  private async runHttpJsonRpc(
    baseUrl: string,
    request: Record<string, unknown>,
  ): Promise<McpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      const response = await fetch(`${baseUrl}/api/mcp/jsonrpc`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key':
            this.configService.get<string>('AGENT_API_KEY')?.trim() ?? '',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new BadGatewayException({
          message: 'Commerce MCP HTTP transport returned an error',
          status: response.status,
          detail: (await response.text()).slice(0, 2000),
        });
      }
      return (await response.json()) as McpResponse;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException({
        message: 'Commerce MCP HTTP transport failed',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private runStdioJsonRpc(
    scriptPath: string,
    request: Record<string, unknown>,
  ): Promise<McpResponse> {
    const python = this.pythonCommand();
    const timeoutMs = this.timeoutMs();

    return new Promise((resolvePromise, reject) => {
      const child = spawn(python, [scriptPath], {
        cwd: dirname(scriptPath),
        windowsHide: true,
        shell: false,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(
          new BadGatewayException(
            `Commerce MCP tool timed out after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
        if (stdout.length > 1024 * 1024) {
          child.kill();
        }
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
        if (stderr.length > 256 * 1024) {
          child.kill();
        }
      });
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(
          new BadGatewayException({
            message: 'Commerce MCP process failed to start',
            error: error.message,
          }),
        );
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code !== 0) {
          reject(
            new BadGatewayException({
              message: 'Commerce MCP process exited with an error',
              code,
              stderr: stderr.trim(),
            }),
          );
          return;
        }

        const line = stdout
          .split(/\r?\n/)
          .map((item) => item.trim())
          .find((item) => item.length > 0);
        if (!line) {
          reject(
            new BadGatewayException({
              message: 'Commerce MCP process returned no JSON-RPC response',
              stderr: stderr.trim(),
            }),
          );
          return;
        }
        try {
          resolvePromise(JSON.parse(line) as McpResponse);
        } catch (error) {
          reject(
            new BadGatewayException({
              message: 'Commerce MCP process returned invalid JSON',
              error: error instanceof Error ? error.message : String(error),
              stdout: stdout.slice(0, 2000),
              stderr: stderr.trim(),
            }),
          );
        }
      });

      child.stdin.write(`${JSON.stringify(request)}\n`, 'utf8');
      child.stdin.end();
    });
  }

  private serverPath(): string {
    const configured = this.configService
      .get<string>('COMMERCE_AGENT_MCP_SERVER')
      ?.trim();
    const candidate =
      configured ||
      resolve(
        process.cwd(),
        '..',
        'e-commerceenglish_textconsistencyagent',
        'agent',
        'mcp_server.py',
      );
    if (!existsSync(candidate)) {
      throw new InternalServerErrorException(
        `Commerce MCP server not found: ${candidate}`,
      );
    }
    return candidate;
  }

  private httpBaseUrl(): string | undefined {
    const value = this.configService
      .get<string>('COMMERCE_AGENT_MCP_BASE_URL')
      ?.trim()
      .replace(/\/$/, '');
    return value || undefined;
  }

  private pythonCommand(): string {
    return (
      this.configService.get<string>('COMMERCE_AGENT_PYTHON')?.trim() ||
      'python'
    );
  }

  private timeoutMs(): number {
    const configured = Number(
      this.configService.get<number | string>('COMMERCE_AGENT_MCP_TIMEOUT_MS'),
    );
    if (Number.isFinite(configured) && configured >= 1000) {
      return Math.min(configured, 120_000);
    }
    return 30_000;
  }
}
