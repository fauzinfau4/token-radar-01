// Token Radar, model "radar-2": one sealed snapshot in, one ranked board out.
//
// The board ranks genuine pre-token protocols only. A protocol is pre-token
// when its DefiLlama record carries no token at all (no market cap, no
// CoinGecko id, no symbol) -- "records no token", never "has none", because
// the record is not proof. Wrapped, staked and bridged products, exchanges
// and versioned pools are set aside with the live-token protocols: none of
// them is a protocol still waiting on a launch of its own.
//
// Implied value is a claim about what a token would be worth if the
// protocol's record stayed as it is. It is NOT a prediction of whether or
// when a token is issued. It follows only from the snapshot's own figures:
//
//   base       = median(mcap_usd / tvl_usd) over live-token protocols
//                -- the market's own FDV/TVL multiple, read from this
//                snapshot (0.246 here, n = 119, CEX excluded), clamped to [0.05, 0.50].
//                No multiple is asserted from outside the data.
//   growth     = 1 + 0.55 * tanh(clamp(change_7d, -80, 300) / 60)
//                -- saturating: a +4,448% week (the snapshot's max) cannot
//                outrank a sound protocol, and a -70% week costs at most
//                ~half. The median week here is -8.2%.
//   maturity   = 0.65 + 0.35 * ln(1 + min(age_days, 1460)) / ln(1461)
//                -- log age: surviving with no token earns value, but the
//                second year is worth less than the first. Unknown age is
//                scored as 90 days (young and uncertain), never as old.
//   breadth    = 1 + 0.02 * min(chains - 1, 8)   (max 1.16)
//                -- multi-chain TVL is harder to lose to one chain's fate.
//   data       = 0.97 when change_7d is unreported, else 1.00
//                -- a small haircut for a missing figure.
//   implied    = max(1, round(tvl_usd * base * growth * maturity
//                              * breadth * data))
//
// No protocol name is ever special-cased: the same function scores every
// row, and the dashboard recomputes each row from these inputs so the page
// and board.json visibly agree.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_scale: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_extra: number;
  missing_growth_haircut: number;
  base_clamp_low: number;
  base_clamp_high: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.55,
  growth_scale: 60,
  growth_floor: -80,
  growth_cap: 300,
  maturity_floor: 0.65,
  maturity_range: 0.35,
  maturity_days: 1460,
  unknown_age_days: 90,
  breadth_per_chain: 0.02,
  breadth_max_extra: 8,
  missing_growth_haircut: 0.97,
  base_clamp_low: 0.05,
  base_clamp_high: 0.5,
};

export const MODEL_VERSION = 'radar-2';

/** Live-token protocols shown as market comparables, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    data_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row; farm steps travel verbatim. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  base_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  data_multiplier: number;
  watch: boolean;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl_ratio: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  base_multiple: number;
  calibration_n: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * The base multiple, calibrated from this snapshot alone: the median
 * mcap/TVL of live-token protocols with both figures. The median is used
 * because the mean is wrecked by tiny-TVL outliers (this snapshot's mean
 * ratio is ~5.0, its median 0.246). Returns the multiple and how many
 * protocols calibrated it.
 */
export function calibrateBase(snapshot: Snapshot): { base: number; n: number } {
  const ratios = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX')
    .map((p) => (p.mcap_usd as number) / p.tvl_usd)
    .sort((a, b) => a - b);
  if (ratios.length === 0) return { base: 0.2, n: 0 };
  const mid = ratios.length >> 1;
  const median = ratios.length % 2 === 1 ? ratios[mid]! : (ratios[mid - 1]! + ratios[mid]!) / 2;
  const base = Math.min(MODEL.base_clamp_high, Math.max(MODEL.base_clamp_low, median));
  return { base: round4(base), n: ratios.length };
}

/** The five multipliers and the implied value one protocol gets. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  base: number,
  model: ModelConstants = MODEL,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; dataMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + model.growth_weight * Math.tanh(growthPct / model.growth_scale);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    model.maturity_range * (Math.log1p(Math.min(Math.max(ageForModel, 0), model.maturity_days)) / Math.log1p(model.maturity_days));
  const breadthMult = 1 + model.breadth_per_chain * Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_extra);
  const dataMult = protocol.change_7d === null ? model.missing_growth_haircut : 1;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * base * growthMult * maturityMult * breadthMult * dataMult));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, dataMult, age };
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Categories that are a wrapped, staked or bridged product, not a launch of their own. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Exchange names a genuine pre-token protocol never starts with. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
/** A whole word that marks a wrapped or staked product. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * Whether a protocol is one the board may rank: pre-token, and not a
 * wrapped/staked/bridged product, exchange or versioned pool. This is the
 * watchlist's own exclusion rule, applied to every row -- not only to the
 * 40 above the floor -- so the early radar below the floor is held to the
 * same standard as the watchlist.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** Every rankable pre-token protocol, strongest implied value first, ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; base: number; calibrationN: number } {
  const { base, n } = calibrateBase(snapshot);
  const scored = snapshot.protocols
    .filter(isRankable)
    .map((p) => {
      const v = impliedValue(p, snapshot.as_of, base, model);
      return { p, ...v };
    });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: base,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      data_multiplier: s.dataMult,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
  return { board, base, calibrationN: n };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 20_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's primary action and its second leg, in words a farmer can follow. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): { primary: string; second: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      primary: `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open so it accrues interest.`,
      second: `Borrow $20 of a stablecoin against the supply, hold it for a week, then repay it in full.`,
    };
  }
  if (c.includes('dex') || c.includes('liquidity manager') || c.includes('leveraged farm')) {
    return {
      primary: `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} in the pair it lists first.`,
      second: `Swap $25 through that same pool once a week so the wallet shows both LP and trading activity.`,
    };
  }
  if (c.includes('yield aggregator') || c.includes('yield')) {
    return {
      primary: `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and keep the vault shares.`,
      second: `Claim any harvest or rewards the vault pays, then redeposit them into the same vault.`,
    };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis') || c.includes('option')) {
    return {
      primary: `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position.`,
      second: `Close the position after a week and open one new small position, keeping size under $50 each time.`,
    };
  }
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) {
    return {
      primary: `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the vault shares.`,
      second: `Split a second $50 deposit across a different ${name} vault or strategy on the same chain.`,
    };
  }
  if (c.includes('rwa')) {
    return {
      primary: `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the farming wallet.`,
      second: `Top the position up by $25 once a month and keep the receipt tokens untouched between top-ups.`,
    };
  }
  if (c.includes('stable')) {
    return {
      primary: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`,
      second: `Use $25 of that stable asset in one other app on ${chain} each week, then bring it back.`,
    };
  }
  if (c.includes('chain')) {
    return {
      primary: `Bridge $${capital} of USDC to ${chain} and use ${name}'s flagship app with the bridged funds.`,
      second: `Make one on-chain transaction on ${chain} each week, such as a swap or a transfer, from the same wallet.`,
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      primary: `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token.`,
      second: `Restake or delegate the receipt token once, then leave the whole position untouched for the hold period.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      primary: `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the hold period.`,
      second: `Extend or renew the cover once before it lapses so the wallet shows continuous cover.`,
    };
  }
  if (c.includes('prediction')) {
    return {
      primary: `Fund $${capital} on ${name} and place one small position on a market that settles within a month.`,
      second: `Place one more small position each week on a different market, keeping each under $25.`,
    };
  }
  return {
    primary: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
    second: `Use the protocol's second main feature once a week, such as a swap, a vote or a claim, from the same wallet.`,
  };
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a
 * time. The plan is derived from the protocol's own record (category,
 * chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const { primary, second } = actionsFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, keep its seed phrase offline, and open the protocol's official page from its DefiLlama listing.`,
      cost: 'no fee to set up the wallet',
      time: '10 minutes',
    },
    {
      text: `Move $${capital} of USDC to ${chain} for this farm, using the bridge or exchange route the protocol itself recommends.`,
      cost: `about $${capital >= 150 ? 8 : 4} of gas and bridge fees`,
      time: '15 minutes to arrive',
    },
    { text: primary, cost: `$${capital} of capital and about $3 of gas`, time: '15 minutes to set up' },
    { text: second, cost: 'about $2 of gas, plus the $20 to $50 moved', time: '10 minutes' },
    {
      text: `Repeat one qualifying action each week -- a deposit, a swap, a trade or a vote -- so the wallet shows steady use, not one day of activity.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity spans more than one snapshot, and check the protocol's own points or rewards page before you withdraw.`,
      cost: `the $${capital} stays in the position; never pay to claim`,
      time: `${hold} days`,
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log, and plan the unwind first: withdraw in two parts so a stuck transaction never strands the whole position.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's comparables view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl_ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js; the farm plan travels verbatim so page and board agree. */
export function radarRow(row: BoardRow, watch: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    base_multiple: row.model.base_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    data_multiplier: row.model.data_multiplier,
    watch,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, base, calibrationN } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    base_multiple: base,
    calibration_n: calibrationN,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, snapshot.watchlist.includes(r.slug))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, fewer than 100`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board.every((r) => r.implied_value_usd === board[0]!.implied_value_usd)) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
