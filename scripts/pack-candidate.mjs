/** Private source candidate; npm pack still runs the ordinary prepack builds. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(process.argv[2] || path.join(root, 'output/candidates'));
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
if (git('diff', '--name-only', 'HEAD').toString().trim()
    || git('ls-files', '--others', '--exclude-standard', '--', 'src', 'scripts').toString().trim()) {
  throw new Error('Commit candidate source before packaging; unrelated untracked IDE files are excluded.');
}
const marker = path.join(root, 'SOURCE_CANDIDATE.json');
if (existsSync(marker)) throw new Error('An existing candidate marker must be reviewed first.');
const source = {
  kind: 'unpublished-source-candidate', source_commit: git('rev-parse', 'HEAD').toString().trim(),
  source_archive_sha256: createHash('sha256').update(git('archive', '--format=tar', 'HEAD')).digest('hex'),
  registry_release: false,
};
mkdirSync(output, { recursive: true });
try {
  writeFileSync(marker, JSON.stringify(source, null, 2) + '\n');
  const result = execFileSync('npm', ['pack', '--json', '--pack-destination', output], {
    cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  const start = result.lastIndexOf('\n[\n');
  const [packed] = JSON.parse(start < 0 ? result : result.slice(start + 1));
  const artifact = path.join(output, packed.filename);
  console.log(JSON.stringify({ ...source, artifact,
    artifact_sha256: createHash('sha256').update(readFileSync(artifact)).digest('hex'),
    artifact_integrity: packed.integrity,
  }, null, 2));
} finally { unlinkSync(marker); }
