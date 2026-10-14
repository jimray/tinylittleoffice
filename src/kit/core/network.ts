/**
 * Every place on the web the site can reach, in one list: what each request is for, when it happens, what
 * it carries, and what stops it. Every module that asks the web takes its host from here (`origin`), so a
 * host named anywhere else in src/ fails test/network.test.ts; the Content-Security-Policy's connect-src
 * and img-src are written from the `csp` field (scripts/headers.ts), and docs/network.md and /network
 * (public/network.html) are written from the whole list by scripts/network-doc.ts. A document fetches
 * nothing from any other site: every request here is the site's own, the map's, or one the person asks for.
 *
 * A host is a name, a "*." name (every host under it), or "*": any https address, for a place the person
 * names (their own Mastodon server). Pure data: no DOM.
 */

/** When the request is made: only after the person taps something, while a thing is on the screen, or when they share. */
export type When = 'after a tap' | 'while shown' | 'on share';
/** The CSP directive a host is allowed by (connect-src, img-src); none: the browser never asks it from a page (a new tab). */
export type Directive = 'connect' | 'img';

export interface Reach {
  host: string;
  /** What the request is for, in one line. */
  what: string;
  when: When;
  /** What the request holds. */
  carries: string;
  /** The switch or the action that prevents it. */
  stops: string;
  /** The module that makes it. */
  by: string;
  csp?: readonly Directive[];
}

const compose = (host: string, what: string): Reach => ({
  host,
  what,
  when: 'on share',
  carries: 'The document’s title and its link, which is the whole document (it is in the link)',
  stops: 'Not choosing that service in Share; it opens in a new tab, which you then post from or close',
  by: 'kit/share/share.ts',
});

export const NETWORK = {
  site: {
    host: 'tinylittleoffice.com',
    what: 'The site’s own files: the page, the app file (every app, the English words, the icons, the emoji and the math), its stylesheet, an app’s templates when its list opens, a language when a page is in it, and the type (IBM Plex, a face when a page’s words need it), each fetched once and kept a year',
    when: 'while shown',
    carries: 'Which file; never the document, which is after the "#" and stays in the browser',
    stops: 'Nothing to stop but not opening the site: these files are the app itself',
    by: 'the whole site',
  },
  worker: {
    host: 'tinylittleoffice.com',
    what: 'The service worker, /sw.js, with Save in browser on: it keeps the pages, the app file, its stylesheet, the Latin faces and each file a page fetches after, so the site opens offline',
    when: 'after a tap',
    carries: 'Which file, as the pages ask; never the document, which is after the "#" and never reaches the worker, and never a page’s "?c=" card',
    stops: 'Save in browser, turned off: the worker is unregistered and everything it kept is deleted; while it is off there is none',
    by: 'kit/share/offline.ts, sw.ts',
  },
  card: {
    host: 'tinylittleoffice.com',
    what: 'A preview card, at the site’s own /card: posted when you share with a network (Bluesky, Mastodon, X, LinkedIn or the share sheet) with “Show a preview of the first page” on; fetched later by that network',
    when: 'on share',
    carries: 'A picture of the first page, the title and the first words, kept readable for a month so the network can fetch them; never the document, never its link',
    stops: 'The switch “Show a preview of the first page” in Share, turned off; Edit link, Present link and Email never make one, nor does a document with a password',
    by: 'kit/share/card.ts',
  },
  tiles: {
    host: 'tile.openstreetmap.org',
    what: 'The map’s pictures (tiles), asked directly as OpenStreetMap’s policy asks: in the Trip Planner, and under a trip’s map drawn anywhere (a slide, a page, an item, a card, an export), only the tiles its box needs; a picture made of that map (a card, a PDF, a PNG, a PowerPoint) asks them again to write them into it',
    when: 'while shown',
    carries:
      'Which squares of the map are on the screen or in the picture, and the site’s name as the referrer (the origin alone, as OpenStreetMap’s tile policy asks of a web page; never the page’s path or anything of the document)',
    stops: 'Map, in the Trip Planner’s bar, turned off: no map then asks for them, in the Trip Planner or anywhere a trip is drawn; the home page’s pictures of the templates never do',
    by: 'apps/trip/editor.ts, apps/trip/view.ts, kit/draw/raster.ts',
    csp: ['img', 'connect'],
  },
  placeSearch: {
    host: 'nominatim.openstreetmap.org',
    what: 'Place search in the Trip Planner',
    when: 'after a tap',
    carries: 'The words searched for, and the site’s name as the referrer (the origin alone, as Nominatim’s usage policy asks of an application; never the page’s path or anything of the document)',
    stops: 'Not searching: typing a stop’s place by hand asks no one',
    by: 'apps/trip/editor.ts',
    csp: ['connect'],
  },
  osm: {
    host: 'www.openstreetmap.org',
    what: 'The credit to OpenStreetMap under the Trip Planner’s map and in the corner of a trip’s map drawn on its tiles, a link',
    when: 'after a tap',
    carries: 'Nothing of the document: it opens OpenStreetMap’s copyright page in a new tab',
    stops: 'Not following the link',
    by: 'apps/trip/editor.ts, apps/trip/view.ts',
  },
  tinier: {
    host: 'tinier.tinylittleoffice.com',
    what: 'Short links: made or opened',
    when: 'after a tap',
    carries: 'The long link encrypted here, which the service cannot read, and how long to keep it',
    stops: 'Not making a short link: the long link needs no one',
    by: 'kit/share/short.ts',
    csp: ['connect'],
  },
  source: {
    host: 'github.com',
    what: 'The site’s source: the repository, “GitHub” at the home page’s foot; the commit this copy was built from, in About; links',
    when: 'after a tap',
    carries: 'Which page of the source; it opens in a new tab, and nothing of the document goes with it',
    stops: 'Not following the link: the commit’s name comes from the site’s own /version.json',
    by: 'kit/ui/home.ts, kit/ui/drawer.ts, kit/core/version.ts',
  },
  maker: {
    host: 'aboard.com',
    what: 'Aboard, who made the site, named at the home page’s foot and in About, a link',
    when: 'after a tap',
    carries: 'Nothing: it opens in a new tab, and nothing of the document goes with it',
    stops: 'Not following the link',
    by: 'kit/ui/home.ts, kit/ui/drawer.ts',
  },
  bskyShare: compose('bsky.app', 'Bluesky’s compose box'),
  xShare: compose('x.com', 'X’s compose box'),
  linkedin: compose('www.linkedin.com', 'LinkedIn’s share box'),
  mastodon: compose('*', 'A Mastodon server’s compose box: the one you name'),
} as const satisfies Record<string, Reach>;

export type Place = keyof typeof NETWORK;

/**
 * What a Spaces build reaches besides (VITE_SPACES=1; Jim, 2026-10-14): a document kept in an atproto space is read and
 * written at hosts no list can name before a person signs in, each member's own, so that build's connect-src allows any
 * https address. Never the site's: scripts/check-build.ts refuses a build that allows it, so a deploy cannot ship one;
 * it is served from an origin of its own. Nothing in src/ reaches these yet.
 */
const SPACES = {
  atproto: {
    host: '*',
    what: 'Your atproto account’s hosts, when you sign in and keep a document in a space: your PDS and its authorization server, the space’s host, and the PDS of each member of the space, whose versions are read from where they keep them',
    when: 'after a tap',
    carries:
      'The document, every version of it saved to the space, in the clear over TLS: a space decides who may read it, and does not hide it from the hosts that keep it (every member’s PDS reads what it holds); your account’s tokens; which spaces you are in',
    stops: 'Never choosing Sign in: a document that is only its link asks no one; a document under a password is never kept in a space',
    by: 'kit/share/versions.ts',
    csp: ['connect'],
  },
} as const satisfies Record<string, Reach>;

/** Every entry, in the order above; a Spaces build's after them. */
export const reaches = ({ spaces = false }: { spaces?: boolean } = {}): Reach[] => [...Object.values(NETWORK), ...(spaces ? Object.values(SPACES) : [])];

/** An entry's https origin, without a trailing slash. */
export const origin = (place: Place): string => `https://${NETWORK[place].host}`;

/** Whether `host` is one `pattern` names: the name itself, or any host under a "*." name. "*" names no host. */
export function hostMatches(pattern: string, host: string): boolean {
  host = host.toLowerCase();
  if (pattern === '*') return false;
  if (pattern.startsWith('*.')) return host.endsWith(pattern.slice(1));
  return host === pattern;
}

/** Whether a host is one the list names. */
export function listed(host: string): boolean {
  return reaches({ spaces: true }).some((r) => hostMatches(r.host, host));
}
