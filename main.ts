// SOLANO HEAT 3D — hand-in program for make.fun's gta6-01 bounty.
//
// Node 22, standard library only. Run it and it hands the entry in: the
// game/ folder and the screenshots/ folder beside this file are copied
// into the output directory, measured against the bounty's caps as it
// goes (an entry the scorer would refuse fails here first, naming the
// cap it broke), and dossier.json is written there with the kit's own
// buildDossier, so the dossier the judge reads is built from exactly
// the bytes that were copied.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// MAKEFUN_OUTPUT_DIR says where to write; /output is the default the
// grader uses.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

function refuse(reason: string): never {
  console.error(`solano-heat-3d: refusing to hand in — ${reason}`);
  process.exit(1);
}

function suffix(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** All paths below dir, relative to it, directories among them. */
function tree(dir: string, base: string, acc: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    acc.push(relative(base, full));
    if (statSync(full).isDirectory()) tree(full, base, acc);
  }
  return acc;
}

/** The screenshots, audited: PNG/JPEG only, each under the byte cap. */
function auditShots(dir: string): string[] {
  if (!existsSync(dir)) refuse('there is no screenshots/ folder beside main.ts');
  const names = readdirSync(dir).sort();
  const kept: string[] = [];
  for (const name of names) {
    const full = join(dir, name);
    if (!statSync(full).isFile()) refuse(`screenshots/${name} is not a plain file`);
    if (suffix(name) !== 'png' && suffix(name) !== 'jpg' && suffix(name) !== 'jpeg') {
      refuse(`screenshots/${name} is not a PNG or JPEG image`);
    }
    const size = statSync(full).size;
    if (size > LIMITS.screenshots.max_bytes) {
      refuse(`screenshots/${name} weighs ${size} bytes, over the ${LIMITS.screenshots.max_bytes} cap`);
    }
    kept.push(name);
  }
  if (kept.length < 3) refuse(`screenshots/ holds ${kept.length} images; the bounty wants 3 or 4`);
  if (kept.length > LIMITS.screenshots.max) {
    refuse(`screenshots/ holds ${kept.length} images, over the cap of ${LIMITS.screenshots.max}`);
  }
  return kept;
}

/** The game folder, audited: entry count, byte total, path lengths. */
function auditGame(dir: string): { entries: number; bytes: number } {
  if (!existsSync(dir)) refuse('there is no game/ folder beside main.ts');
  if (!existsSync(join(dir, 'index.html'))) refuse('game/index.html is missing');
  const rels = tree(dir, dir, []);
  let bytes = 0;
  for (const rel of rels) {
    const shown = rel.split(sep).join('/');
    if (Buffer.byteLength(shown, 'utf8') > LIMITS.game_path_max_bytes) {
      refuse(`game/${shown} has a path over ${LIMITS.game_path_max_bytes} UTF-8 bytes`);
    }
    const full = join(dir, rel);
    if (statSync(full).isFile()) bytes += statSync(full).size;
  }
  if (rels.length > LIMITS.game_max_files) {
    refuse(`game/ holds ${rels.length} entries, over the cap of ${LIMITS.game_max_files}`);
  }
  if (bytes > LIMITS.game_max_bytes) {
    refuse(`game/ weighs ${bytes} bytes, over the ${LIMITS.game_max_bytes} cap`);
  }
  return { entries: rels.length, bytes };
}

function copyOver(name: string): void {
  const dest = join(outDir, name);
  rmSync(dest, { recursive: true, force: true });
  cpSync(join(here, name), dest, { recursive: true });
}

function handIn(): void {
  const shots = auditShots(join(here, 'screenshots'));
  const game = auditGame(join(here, 'game'));

  mkdirSync(outDir, { recursive: true });
  copyOver('game');
  copyOver('screenshots');

  const dossier = buildDossier(outDir, {
    text_max_bytes: LIMITS.text_max_bytes,
    screenshots: { max: LIMITS.screenshots.max, max_bytes: LIMITS.screenshots.max_bytes },
    game_max_files: LIMITS.game_max_files,
    game_max_bytes: LIMITS.game_max_bytes,
    game_path_max_bytes: LIMITS.game_path_max_bytes,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  console.log(
    `solano-heat-3d: handed in game/ (${game.entries} entries, ${game.bytes} bytes), ` +
    `${shots.length} screenshots (${shots.join(', ')}) and dossier.json to ${outDir}`,
  );
}

handIn();
