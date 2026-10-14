// A document's versions in an atproto space (kit/share/versions.ts): each save a record holding the whole payload and
// the versions it came from; the heads are the branches; any version is a link again. Records from another member's
// host are untrusted and read strictly.
import { test, expect } from 'vitest';
import { makeVersion, readVersion, heads, ancestry, versionHash, spaceUri, versionUri, parseVersionUri, SPACE_TYPE, COLLECTION, type Version } from '../src/kit/share/versions.ts';
import { encodeDoc, decodeDoc } from '../src/kit/core/codec.ts';
import { parseHash } from '../src/kit/core/route.ts';

const ALICE = 'did:plc:alice',
  BOB = 'did:plc:bob';
const SKEY = '6f1c2a90-1b7e-4c11-9d1e-2a4b5c6d7e8f';
const T0 = Date.UTC(2026, 9, 14, 12, 0);

/** A version as a host returns it: its uri, its cid, its author and the record. */
function v(author: string, rkey: string, prev: Version[], text = rkey, at = T0): Version {
  const record = makeVersion({ app: 'write', payload: encodeDoc(text), title: text, prev: prev.map((p) => ({ uri: p.uri, cid: p.cid })), now: at });
  return { uri: versionUri(ALICE, SKEY, author, rkey), cid: `bafy${author.slice(-3)}${rkey}`, author, record };
}

test('a space and a version have their URIs, and a version URI reads back', () => {
  expect(spaceUri(ALICE, SKEY)).toBe(`at://${ALICE}/space/${SPACE_TYPE}/${SKEY}`);
  const uri = versionUri(ALICE, SKEY, BOB, '3lzy2ji4nms2z');
  expect(uri).toBe(`at://${ALICE}/space/${SPACE_TYPE}/${SKEY}/${BOB}/${COLLECTION}/3lzy2ji4nms2z`);
  expect(parseVersionUri(uri)).toEqual({ authority: ALICE, skey: SKEY, author: BOB, rkey: '3lzy2ji4nms2z' });
  expect(parseVersionUri(`at://${ALICE}/${COLLECTION}/3lzy2ji4nms2z`)).toBeNull();
  expect(parseVersionUri(`at://${ALICE}/space/com.other.thing/${SKEY}/${BOB}/${COLLECTION}/3lzy`)).toBeNull();
  expect(parseVersionUri(`at://${ALICE}/space/${SPACE_TYPE}/${SKEY}/${BOB}/com.other.record/3lzy`)).toBeNull();
  expect(() => spaceUri(ALICE, 'has a space')).toThrow();
  expect(() => spaceUri('alice', SKEY)).toThrow();
});

test('a version holds the payload without its periods, and opens as the same document', () => {
  // Words that do not repeat, so the payload runs past a period.
  const text = Array.from({ length: 120 }, (_, i) => `line ${i * 7919} of ${(i * 104729).toString(36)}`).join('\n');
  const link = encodeDoc(text);
  expect(link).toContain('.');
  const record = makeVersion({ app: 'write', payload: link, title: 'Letter', prev: [], now: T0 });
  expect(record).toEqual({ $type: COLLECTION, app: 'write', payload: link.replaceAll('.', ''), title: 'Letter', prev: [], createdAt: '2026-10-14T12:00:00.000Z' });
  const route = parseHash(versionHash(record));
  expect(route.app).toBe('write');
  expect(route.payload).toBe(link);
  expect(decodeDoc(route.payload)).toBe(text);
});

test('a document under a password, an empty one, or a bad app is never made a version', () => {
  expect(() => makeVersion({ app: 'write', payload: 'EabcDEF', prev: [], now: T0 })).toThrow(/password/);
  expect(() => makeVersion({ app: 'write', payload: '', prev: [], now: T0 })).toThrow();
  expect(() => makeVersion({ app: 'Write!', payload: encodeDoc('x'), prev: [], now: T0 })).toThrow();
});

test('a record from another host is read strictly: anything malformed is nothing', () => {
  const good = makeVersion({ app: 'sheet', payload: encodeDoc('a,b'), prev: [{ uri: versionUri(ALICE, SKEY, ALICE, 'a'), cid: 'bafyx' }], now: T0 });
  expect(readVersion(JSON.parse(JSON.stringify(good)))).toEqual(good);
  expect(readVersion({ ...good, title: undefined })).toEqual({ ...good, title: undefined });
  const bad: unknown[] = [
    null,
    'a string',
    { ...good, $type: 'com.other.thing' },
    { ...good, app: '../../x' },
    { ...good, payload: 'Esealed' },
    { ...good, payload: 'y<script>' },
    { ...good, payload: 'y' + 'A'.repeat(200 * 1024) },
    { ...good, title: 42 },
    { ...good, title: 'x'.repeat(1001) },
    { ...good, prev: 'not a list' },
    { ...good, prev: [{ uri: 'https://example.com/', cid: 'bafyx' }] },
    { ...good, prev: [{ uri: versionUri(ALICE, SKEY, ALICE, 'a') }] },
    { ...good, prev: Array.from({ length: 9 }, (_, i) => ({ uri: versionUri(ALICE, SKEY, ALICE, `a${i}`), cid: `c${i}` })) },
    { ...good, createdAt: 'yesterday' },
  ];
  for (const b of bad) expect(readVersion(b), JSON.stringify(b)?.slice(0, 80)).toBeNull();
});

test('one line of saves has one head, and its ancestry runs back to the first', () => {
  const a = v(ALICE, 'a', []);
  const b = v(ALICE, 'b', [a], 'b', T0 + 1000);
  const c = v(ALICE, 'c', [b], 'c', T0 + 2000);
  const all = [c, a, b];
  expect(heads(all).map((h) => h.uri)).toEqual([c.uri]);
  expect(ancestry(all, c).map((x) => x.uri)).toEqual([c.uri, b.uri, a.uri]);
});

test('two people saving from the same version are two branches, newest first', () => {
  const a = v(ALICE, 'a', []);
  const mine = v(ALICE, 'b', [a], 'mine', T0 + 1000);
  const theirs = v(BOB, 'b', [a], 'theirs', T0 + 2000);
  const all = [a, mine, theirs];
  expect(heads(all).map((h) => h.author)).toEqual([BOB, ALICE]);
  expect(ancestry(all, mine).map((x) => x.uri)).toEqual([mine.uri, a.uri]);
  expect(ancestry(all, theirs).map((x) => x.uri)).toEqual([theirs.uri, a.uri]);
});

test('a version whose cid has changed since it was pointed at is not the one pointed at', () => {
  const a = v(ALICE, 'a', []);
  const b = v(ALICE, 'b', [a], 'b', T0 + 1000);
  const rewritten = { ...a, cid: 'bafyrewritten' };
  const all = [rewritten, b];
  // b points at the old a: the rewritten one is not b's parent, so it is a head of its own and b's line stops at b.
  expect(
    heads(all)
      .map((h) => h.uri)
      .sort(),
  ).toEqual([a.uri, b.uri].sort());
  expect(ancestry(all, b).map((x) => x.uri)).toEqual([b.uri]);
});

test('a parent not fetched (a member gone, a host down) ends the ancestry there, and a loop of claimed parents ends', () => {
  const a = v(ALICE, 'a', []);
  const b = v(BOB, 'b', [a], 'b', T0 + 1000);
  expect(ancestry([b], b).map((x) => x.uri)).toEqual([b.uri]);
  // Records name whatever cid they like: two that claim each other are walked once each.
  const x: Version = { ...v(ALICE, 'x', []), cid: 'cx' };
  const y: Version = { ...v(ALICE, 'y', []), cid: 'cy' };
  x.record = { ...x.record, prev: [{ uri: y.uri, cid: 'cy' }] };
  y.record = { ...y.record, prev: [{ uri: x.uri, cid: 'cx' }] };
  expect(ancestry([x, y], x).map((z) => z.uri)).toEqual([x.uri, y.uri]);
});

test('a version under another space, or claiming to be by someone else, is not one of this document', () => {
  const a = v(ALICE, 'a', []);
  const elsewhere = { ...v(ALICE, 'z', []), uri: versionUri(ALICE, 'other-doc', ALICE, 'z') };
  const forged = { ...v(BOB, 'f', [a]), author: ALICE };
  expect(heads([a, elsewhere, forged], { authority: ALICE, skey: SKEY }).map((h) => h.uri)).toEqual([a.uri]);
});
