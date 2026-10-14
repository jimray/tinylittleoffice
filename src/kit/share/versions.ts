/**
 * A document's versions in an atproto space (Jim, 2026-10-14: access control from Spaces, and "every save writes a
 * record … with the previous hash so you can easily go back through old revisions"). Behind a flag and not yet wired:
 * this is the part that needs no network, held by test/versions.test.ts before any OAuth or space I/O is written.
 *
 * A document is a space of its own (`com.tinylittleoffice.doc`, its skey the library's id for it), because a space is
 * what access is granted to: its members are who may open it. Each save is a record in the saver's own repo in that
 * space, holding the whole payload (the same characters that follow "#/v1/<app>/", so every version is a link again)
 * and strong references to the versions it was made from. Members write only to their own repos, so two people saving
 * from one version make two branches; a version no other version points at is a head. Merging is not in scope; a
 * record with two parents reads as one, and nothing here makes one.
 *
 * Spaces are access control, not confidentiality: each member's host reads every version they hold, in the clear. A
 * document under a password is never made a version. The chain says the order of saves, not who wrote what: a host
 * can rewrite its own records, and a space's commits are deniable by design (proposal 0016's MAC).
 *
 * A record from another member's host is untrusted, and readVersion reads it strictly. A reference is followed only to
 * a version with that URI and that CID: a version rewritten since it was pointed at is not the one pointed at.
 */
import { routeHash } from '../core/route.ts';
import { spaced, isSealed } from '../core/codec.ts';

/** The space type: one space per document. */
export const SPACE_TYPE = 'com.tinylittleoffice.doc';
/** The collection a version is kept in. */
export const COLLECTION = 'com.tinylittleoffice.version';
/** The longest payload a version may hold, in characters: our own bound, until the alpha says what a space record may hold. */
const PAYLOAD_MAX = 128 * 1024;
const TITLE_MAX = 1000;
/** The most versions one may be made from: one is a save, two a merge; more is a record not made by us. */
const PREV_MAX = 8;

const DID = /^did:[a-z]+:[A-Za-z0-9._:%-]*[A-Za-z0-9._-]$/;
/** atproto's record-key syntax, which a space's skey shares; "." and ".." are not keys. */
const KEY = /^(?!\.{1,2}$)[A-Za-z0-9._:~-]{1,512}$/;
const APP = /^[a-z][a-z0-9-]*$/;
/** An unsealed payload as kept: a packing's flag and base64url, no periods. */
const PAYLOAD = /^[yzr][A-Za-z0-9~_-]+$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

export interface Ref {
  uri: string;
  cid: string;
}

export interface VersionRecord {
  $type: typeof COLLECTION;
  app: string;
  payload: string;
  title?: string;
  prev: Ref[];
  createdAt: string;
}

/** A version as its host returns it. */
export interface Version {
  uri: string;
  cid: string;
  author: string;
  record: VersionRecord;
}

/** The document a version belongs to: its space's authority and key. */
interface Scope {
  authority: string;
  skey: string;
}

export function spaceUri(authority: string, skey: string): string {
  if (!DID.test(authority) || !KEY.test(skey)) throw new Error('not a space');
  return `at://${authority}/space/${SPACE_TYPE}/${skey}`;
}

export function versionUri(authority: string, skey: string, author: string, rkey: string): string {
  if (!DID.test(author) || !KEY.test(rkey)) throw new Error('not a version');
  return `${spaceUri(authority, skey)}/${author}/${COLLECTION}/${rkey}`;
}

/** A version's URI read into its parts; null for anything else, a record of another space type or collection among them. */
export function parseVersionUri(uri: string): (Scope & { author: string; rkey: string }) | null {
  const m = /^at:\/\/([^/]+)\/space\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(uri);
  if (!m || m[2] !== SPACE_TYPE || m[5] !== COLLECTION) return null;
  const [, authority, , skey, author, , rkey] = m;
  return DID.test(authority) && KEY.test(skey) && DID.test(author) && KEY.test(rkey) ? { authority, skey, author, rkey } : null;
}

/** The record a save writes: the payload without the periods a link carries, and the versions it was made from. */
export function makeVersion({ app, payload, title, prev, now = Date.now() }: { app: string; payload: string; title?: string; prev: Ref[]; now?: number }): VersionRecord {
  const kept = payload.replaceAll('.', '');
  if (isSealed(kept)) throw new Error('a document under a password is never kept in a space');
  if (!APP.test(app) || !PAYLOAD.test(kept)) throw new Error('not a document');
  return { $type: COLLECTION, app, payload: kept, ...(title ? { title: title.slice(0, TITLE_MAX) } : {}), prev, createdAt: new Date(now).toISOString() };
}

const isRef = (r: unknown): r is Ref =>
  !!r && typeof r === 'object' && typeof (r as Ref).cid === 'string' && !!(r as Ref).cid && typeof (r as Ref).uri === 'string' && !!parseVersionUri((r as Ref).uri);

/** A record from a host, as a version's record, or null when anything in it is not what we write. */
export function readVersion(value: unknown): VersionRecord | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  if (r.$type !== COLLECTION) return null;
  if (typeof r.app !== 'string' || !APP.test(r.app)) return null;
  if (typeof r.payload !== 'string' || r.payload.length > PAYLOAD_MAX || !PAYLOAD.test(r.payload)) return null;
  if (r.title !== undefined && (typeof r.title !== 'string' || r.title.length > TITLE_MAX)) return null;
  if (!Array.isArray(r.prev) || r.prev.length > PREV_MAX || !r.prev.every(isRef)) return null;
  if (typeof r.createdAt !== 'string' || !ISO.test(r.createdAt) || !Number.isFinite(Date.parse(r.createdAt))) return null;
  return {
    $type: COLLECTION,
    app: r.app,
    payload: r.payload,
    ...(r.title ? { title: r.title } : {}),
    prev: r.prev.map(({ uri, cid }) => ({ uri, cid })),
    createdAt: r.createdAt,
  };
}

/** The link's fragment for a version: it opens as the document it was, with the periods a link carries. */
export const versionHash = (record: VersionRecord): string => routeHash(record.app, spaced(record.payload));

/** The versions that are this document's: under its space, by the author their URI names. */
function belonging(versions: Version[], scope?: Scope): Version[] {
  return versions.filter((v) => {
    const at = parseVersionUri(v.uri);
    return !!at && at.author === v.author && (!scope || (at.authority === scope.authority && at.skey === scope.skey));
  });
}

const key = (r: Ref) => `${r.uri} ${r.cid}`;
const newest = (a: Version, b: Version) => Date.parse(b.record.createdAt) - Date.parse(a.record.createdAt) || (a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0);

/** The branches: every version no other version was made from, newest first. */
export function heads(versions: Version[], scope?: Scope): Version[] {
  const mine = belonging(versions, scope);
  const pointed = new Set(mine.flatMap((v) => v.record.prev.map(key)));
  return mine.filter((v) => !pointed.has(key(v))).sort(newest);
}

/** A version and the versions it came from, each once, nearest first; it stops where a parent was not fetched. */
export function ancestry(versions: Version[], from: Version): Version[] {
  const by = new Map(belonging(versions).map((v) => [key(v), v]));
  const out: Version[] = [];
  const seen = new Set<string>();
  const queue = [from];
  while (queue.length) {
    const v = queue.shift()!;
    if (seen.has(key(v))) continue;
    seen.add(key(v));
    out.push(v);
    for (const p of [...v.record.prev.map((r) => by.get(key(r))).filter((x): x is Version => !!x)].sort(newest)) queue.push(p);
  }
  return out;
}
