import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface LinkfoxSkillCommandResult {
  command: string;
  stdout: string;
  stderr: string;
  cliPath: string;
}

@Injectable()
export class LinkfoxSkillCliService {
  async version(): Promise<LinkfoxSkillCommandResult> {
    return this.run(['--version'], { timeoutMs: 15_000 });
  }

  async agentlist(): Promise<LinkfoxSkillCommandResult> {
    return this.run(['agentlist'], { timeoutMs: 20_000 });
  }

  async search(
    params: Record<string, unknown>,
  ): Promise<LinkfoxSkillCommandResult> {
    const query = this.requiredText(params.query, 'query', 120);
    const args = ['search', query];
    const page = this.optionalPositiveInteger(params.page, 'page', 100);
    const limit = this.optionalPositiveInteger(params.limit, 'limit', 50);

    if (page !== undefined) {
      args.push('--page', String(page));
    }
    if (limit !== undefined) {
      args.push('--limit', String(limit));
    }

    return this.run(args, { timeoutMs: 45_000 });
  }

  async install(
    params: Record<string, unknown>,
  ): Promise<LinkfoxSkillCommandResult> {
    const slug = this.safeSlug(params.slug, 'slug');
    const args = ['install', slug, '--agents', this.safeAgents(params.agents)];
    const workdir = this.optionalPath(params.workdir);
    if (workdir) {
      args.push('--workdir', workdir);
    }
    if (params.force === true) {
      args.push('--force');
    }
    return this.run(args, { timeoutMs: 120_000 });
  }

  async update(
    params: Record<string, unknown>,
  ): Promise<LinkfoxSkillCommandResult> {
    const args = ['update'];
    const slug = this.optionalSlug(params.slug, 'slug');
    if (slug) {
      args.push(slug);
    }
    const workdir = this.optionalPath(params.workdir);
    if (workdir) {
      args.push('--workdir', workdir);
    }
    return this.run(args, { timeoutMs: 120_000 });
  }

  private run(
    args: string[],
    options: { timeoutMs: number },
  ): Promise<LinkfoxSkillCommandResult> {
    const cliPath = this.cliPath();
    return new Promise((resolvePromise, reject) => {
      execFile(
        process.execPath,
        [cliPath, ...args],
        {
          timeout: options.timeoutMs,
          maxBuffer: 1024 * 1024 * 2,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(
              new BadRequestException({
                message: 'LinkfoxSkill CLI command failed',
                command: this.displayCommand(args),
                stdout: stdout.trim(),
                stderr: stderr.trim(),
              }),
            );
            return;
          }
          resolvePromise({
            command: this.displayCommand(args),
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            cliPath,
          });
        },
      );
    });
  }

  private cliPath(): string {
    const configured = process.env.LINKFOXSKILL_CLI_PATH?.trim();
    const candidates = [
      configured,
      resolve(process.cwd(), 'node_modules', 'linkfoxskill', 'src', 'index.js'),
      process.platform === 'win32'
        ? join(
            homedir(),
            'AppData',
            'Roaming',
            'npm',
            'node_modules',
            'linkfoxskill',
            'src',
            'index.js',
          )
        : '/usr/local/lib/node_modules/linkfoxskill/src/index.js',
    ].filter((candidate): candidate is string => Boolean(candidate));
    const candidate = candidates.find((item) => existsSync(item));

    if (!candidate) {
      throw new InternalServerErrorException(
        'LinkfoxSkill CLI entry not found in configured, project-local, or global locations',
      );
    }
    return candidate;
  }

  private displayCommand(args: string[]): string {
    return `linkfoxskill ${args.join(' ')}`.trim();
  }

  private requiredText(
    value: unknown,
    field: string,
    maxLength: number,
  ): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${field} is required`);
    }
    const text = value.trim();
    if (text.length > maxLength) {
      throw new BadRequestException(`${field} is too long`);
    }
    if (text.includes('\0')) {
      throw new BadRequestException(`${field} is invalid`);
    }
    return text;
  }

  private optionalPositiveInteger(
    value: unknown,
    field: string,
    max: number,
  ): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
      throw new BadRequestException(`${field} must be between 1 and ${max}`);
    }
    return parsed;
  }

  private safeSlug(value: unknown, field: string): string {
    const slug = this.requiredText(value, field, 120);
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
      throw new BadRequestException(`${field} is invalid`);
    }
    return slug;
  }

  private optionalSlug(value: unknown, field: string): string | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    return this.safeSlug(value, field);
  }

  private safeAgents(value: unknown): string {
    const agents =
      typeof value === 'string' && value.trim().length > 0
        ? value.trim()
        : 'codex';
    if (!/^[a-zA-Z0-9_-]+(,[a-zA-Z0-9_-]+)*$/.test(agents)) {
      throw new BadRequestException('agents is invalid');
    }
    return agents;
  }

  private optionalPath(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException('workdir must be a string');
    }
    if (value.includes('\0')) {
      throw new BadRequestException('workdir is invalid');
    }
    return resolve(value);
  }
}
