import { LinkfoxSkillCliService } from '../src/shared/linkfox-skill/linkfox-skill-cli.service.js';

describe('LinkfoxSkillCliService project-local runtime', () => {
  it('executes the pinned project-local CLI instead of depending on a host-global install', async () => {
    const service = new LinkfoxSkillCliService();

    const result = await service.version();

    expect(result.stdout).toBe('0.1.13');
    expect(result.command).toBe('linkfoxskill --version');
    expect(result.cliPath.replaceAll('\\', '/')).toContain(
      '/node_modules/linkfoxskill/src/index.js',
    );
  });
});
