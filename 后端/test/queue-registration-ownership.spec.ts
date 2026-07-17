import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTypeScriptFiles(path);
    }
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('queue registration ownership', () => {
  it('centralizes every Bull root and queue registration in QueueModule', () => {
    const sourceRoot = join(process.cwd(), 'src');
    const directBullRegistrations = listTypeScriptFiles(sourceRoot)
      .filter((path) =>
        /BullModule\.(?:forRoot(?:Async)?|registerQueue(?:Async)?)\s*\(/u.test(
          readFileSync(path, 'utf8'),
        ),
      )
      .map((path) => relative(sourceRoot, path).replaceAll('\\', '/'))
      .sort();

    expect(directBullRegistrations).toEqual(['shared/queue/queue.module.ts']);
  });
});
