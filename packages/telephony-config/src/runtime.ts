import { readFile } from 'node:fs/promises';
import { generatedPaths } from './paths.js';

export async function readActivePjsipConfig(repoRoot: string): Promise<string | null> {
  try {
    return await readFile(generatedPaths(repoRoot).activePjsip, 'utf8');
  } catch {
    return null;
  }
}

export function isSipUsernameInPjsipConfig(content: string, sipUsername: string): boolean {
  return (
    content.includes(`username=${sipUsername}\n`) &&
    content.includes(`[${sipUsername}]\n`) &&
    content.includes(`[${sipUsername}_auth]`)
  );
}

export async function isSipUsernameInActiveConfig(
  repoRoot: string,
  sipUsername: string,
): Promise<boolean> {
  const content = await readActivePjsipConfig(repoRoot);
  if (!content) return false;
  return isSipUsernameInPjsipConfig(content, sipUsername);
}
