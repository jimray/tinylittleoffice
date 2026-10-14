/**
 * The site's headers, filled at the end of the build (vite.config.ts): public/_headers holds placeholders
 * the Content-Security-Policy is written from. {{scripts}} is the hash of every script the apps' pages
 * carry (src/kit/draw/page.ts) and of every inline script of the built pages (the theme script in index.html);
 * {{img}} and {{connect}} are the hosts src/kit/core/network.ts allows by each directive, so the policy allows what
 * docs/network.md lists and nothing else.
 */
import { createHash } from 'node:crypto';
import { reaches, type Directive } from '../src/kit/core/network.ts';

/** A script's hash as the policy names it: 'sha256-…'. */
export const scriptHash = (code: string) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`;

/**
 * The inline scripts of a page that run: every <script> without a src and not data (JSON-LD), with something in it. The
 * build hashes these into the policy (vite.config.ts) and scripts/check-build.ts holds every page to it, by this one
 * reading.
 */
export const inlineScripts = (page: string): string[] =>
  [...page.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/(?:ld\+)?json")[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((code) => code.trim());

/** The sources the registry allows by one directive: "https://host", and "https:" for an entry that is any https address (a Spaces build's). */
export function sources(directive: Directive, spaces = false): string[] {
  return reaches({ spaces })
    .filter((r) => r.csp?.includes(directive))
    .map((r) => (r.host === '*' ? 'https:' : `https://${r.host}`))
    .filter((s, i, all) => all.indexOf(s) === i);
}

/** The headers file with its placeholders filled; `spaces` for a Spaces build (VITE_SPACES), whose connect-src is any https address. */
export function fillHeaders(text: string, { scripts, spaces = false }: { scripts: string[]; spaces?: boolean }): string {
  return text.replaceAll('{{scripts}}', scripts.join(' ')).replaceAll('{{img}}', sources('img').join(' ')).replaceAll('{{connect}}', sources('connect', spaces).join(' '));
}

/**
 * The headers _headers gives a path, as Cloudflare reads the file: every rule whose pattern matches ("*" any rest of
 * the path, ":name" one segment), in order; "Name: value" sets a header (a second rule's value joins the first's
 * with ", "), and "! Name" drops what the rules before set. `npm run preview` serves the build with these, so the
 * smoke run sees what the site's cache sees (vite.config.ts).
 */
export function headersFor(text: string, path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let on = false;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const pattern = line
        .trim()
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/:\w+/g, '[^/]+');
      on = new RegExp(`^${pattern}$`).test(path);
    } else if (on) {
      const drop = /^\s*!\s*(.+)$/.exec(line);
      const set = /^\s*([^:]+):\s*(.*)$/.exec(line);
      if (drop) delete out[drop[1].trim()];
      else if (set) out[set[1]] = out[set[1]] ? `${out[set[1]]}, ${set[2]}` : set[2];
    }
  }
  return out;
}
