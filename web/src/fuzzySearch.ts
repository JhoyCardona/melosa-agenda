// Name search for the public catalogs. Ignores case, accents and punctuation,
// matches while the client is still typing (prefixes), and forgives small
// typos ("corason" → "Corazón"). When nothing matches it can still suggest the
// closest names, so a misspelled search never ends in a blank page.

// "Corazón Vintage!" → "corazon vintage". Accents are stripped (ñ becomes n
// on both sides, so it still matches).
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Edit distance counting a swap of two neighbouring letters ("cOraozn") as a
// single mistake, which is the most common typo on a phone keyboard.
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// How many mistakes a typed word may have: none up to 3 letters (too short to
// tell apart — "enc" would also hit "ena…"), 1 up to 5 letters, 2 from there.
function allowedMistakes(word: string): number {
  if (word.length <= 3) return 0;
  return word.length <= 5 ? 1 : 2;
}

// Mistakes between a typed word and one word of the name. The typed word may
// be the beginning of the name word (still typing), so it's also compared
// against the name word cut to the same length.
function wordDistance(typed: string, nameWord: string): number {
  if (nameWord.startsWith(typed)) return 0;
  const full = editDistance(typed, nameWord);
  if (nameWord.length <= typed.length) return full;
  return Math.min(full, editDistance(typed, nameWord.slice(0, typed.length)));
}

// Total mistakes of a search against a name: each typed word against its
// closest word in the name. Also tries the whole thing without spaces, so
// "corazonvintage" finds "Corazón Vintage" and the other way round.
function searchDistance(query: string, name: string): { total: number; withinLimit: boolean } {
  const typedWords = query.split(' ');
  const nameWords = name.split(' ');
  let total = 0;
  let withinLimit = true;
  for (const typed of typedWords) {
    const best = Math.min(...nameWords.map((w) => wordDistance(typed, w)));
    total += best;
    if (best > allowedMistakes(typed)) withinLimit = false;
  }

  const typedJoined = query.replace(/ /g, '');
  const nameJoined = name.replace(/ /g, '');
  const joined = wordDistance(typedJoined, nameJoined);
  if (joined <= allowedMistakes(typedJoined) && joined < total) return { total: joined, withinLimit: true };
  return { total, withinLimit };
}

export interface SearchResult<T> {
  // Items that match, best match first.
  matches: T[];
  // Only when there are no matches: the closest names, as "¿Quisiste decir…?".
  suggestions: T[];
}

// Filters `items` by `query` against each item's name. An empty query returns
// every item untouched (original order).
export function searchByName<T>(items: T[], query: string, getName: (item: T) => string, maxSuggestions = 3): SearchResult<T> {
  const q = normalizeText(query);
  if (q === '') return { matches: items, suggestions: [] };

  const scored = items.map((item, index) => ({ item, index, ...searchDistance(q, normalizeText(getName(item))) }));
  const byScore = (a: (typeof scored)[number], b: (typeof scored)[number]) => a.total - b.total || a.index - b.index;

  const matches = scored.filter((s) => s.withinLimit).sort(byScore);
  if (matches.length > 0) return { matches: matches.map((s) => s.item), suggestions: [] };

  // Nothing close enough: offer the nearest names, as long as at most a third
  // of what was typed is wrong (otherwise it's not a typo, it's not there).
  // Searches under 4 letters are too short to guess from.
  const typedLength = q.replace(/ /g, '').length;
  if (typedLength < 4) return { matches: [], suggestions: [] };
  const maxTotal = Math.floor(typedLength / 3);
  const suggestions = scored
    .filter((s) => s.total <= maxTotal)
    .sort(byScore)
    .slice(0, maxSuggestions)
    .map((s) => s.item);
  return { matches: [], suggestions };
}
