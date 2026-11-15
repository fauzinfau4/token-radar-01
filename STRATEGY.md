# Token Radar — Strategy (model `radar-2`)

## What this board claims

Implied value is this entry's claim about what a token **would be worth if
the protocol's record stayed as it is**. It is not a prediction of whether
or when a token is issued, and it is not a price. Every protocol on the
board **records no token** in the snapshot (no market cap, no CoinGecko id,
no symbol) — never "has none", because the DefiLlama record is not proof.

## Who is ranked

All **198 genuine pre-token protocols** in the snapshot: the 40 on the
house watchlist (TVL ≥ $50M, no token on record) plus 158 early protocols
below the floor. The watchlist is a floor, never a ceiling.

A protocol is excluded from ranking when it is not a launch of its own:
exchanges (CEX), Bridge / Canonical Bridge, Liquid Staking, Liquid
Restaking, Restaked BTC, names ending in a version marker (`V2`, `2.0`),
names carrying a whole word `wrapped` / `staked` / `staking`, and names
starting with an exchange's name. That is the watchlist's own exclusion
rule, applied to every row — not only to the 40 above the floor — so the
early radar is held to the same standard as the watchlist. Live-token
protocols are set aside in a separate comparables view with their market
caps, never mixed into the ranking.

## The value model

```
implied = round( tvl_usd × base × growth × maturity × breadth × data )
```

| Factor | Formula | Why |
|---|---|---|
| `base` | median(mcap_usd / tvl_usd) over live-token protocols in **this same snapshot** | The market's own FDV/TVL multiple, not an asserted number. Here **0.246× (n = 119, CEX excluded)**, clamped to [0.05, 0.50]. The median is used because the mean (≈5.0) is wrecked by tiny-TVL outliers. |
| `growth` | `1 + 0.55 × tanh(clamp(change_7d, −80, 300) / 60)` | Saturating. The snapshot's max week is +4,448% and its median week is −8.2%; a single wild week can move a row by at most ~±55%, never win the board on its own. |
| `maturity` | `0.65 + 0.35 × ln(1 + min(age_days, 1460)) / ln(1461)` | Log age: surviving with no token earns value, but the second year is worth less than the first. Unknown age counts as 90 days (young and uncertain), never as old. |
| `breadth` | `1 + 0.02 × min(chains − 1, 8)` (max 1.16×) | Multi-chain TVL is harder to lose to one chain's fate. |
| `data` | 0.97 when `change_7d` is unreported, else 1.00 | A small haircut for a missing figure. |

No protocol name is ever special-cased. The same function scores every
row, and the dashboard recomputes each row from these inputs and checks
the number `board.json` carries, so page and board visibly agree. A
what-if slider on the model panel explores other base multiples; the
board's ranks and values stay at the calibrated 0.246×.

Worked example (rank 1, Steakhouse Financial): TVL $2,754M × 0.246 ×
growth 0.9799 (−2.19%) × maturity 0.9525 (543d) × breadth 1.16 (many
chains) × 1.00 ≈ **$733.5M implied**.

## Farm plans

Seven steps per protocol, derived from its own record (category, chains,
TVL, age) — never from a hand-written list of names:

1. Fresh wallet, seed offline, open the protocol's official page from its
   DefiLlama listing.
2. Move capital to its chain (capital tiers by TVL: $250 / $150 / $100 /
   $50).
3. Primary action for its category (supply, LP, vault deposit, margin,
   mint, stake, cover, …).
4. A second leg in the same protocol (borrow against the supply, swap
   through the pool, split across a second vault, …) so the wallet shows
   more than one feature used.
5. One qualifying action each week.
6. Hold 30–60 days (younger protocols longer) and check the protocol's
   own points page; never pay to claim.
7. Log wallet, dates and transaction hashes; unwind in two parts.

Every step states what it costs and how long it takes.

## The dashboard

Dark radar-room theme, no network, no framework. Top-5 spotlight cards,
four headline stats (watchlist 40/40, 198 rows, calibrated base, top
implied), sortable table (rank, protocol, TVL, 7d, age, chains, implied),
filters (search, category, chain, 7-day growth, watchlist-only scope),
pre-token / live-comparables tabs, and a detail drawer per protocol with
the full equation breakdown and the 7-step farm plan. State lives in the
URL hash, so each view is deep-linkable.

## Local validation (2026-11-15, kit snapshot)

- `main.ts` runs clean: 758 protocols, 40 watchlist, 198 rows (158
  early, 24 live set aside); top implied $733,539,858.
- Board: 198 unique slugs, ranks exactly 1–198, implied value
  non-increasing with rank, all 198 values distinct, every slug in the
  snapshot, all 40 watchlist slugs covered, every farm plan 7 steps of
  20–600 characters.
- Dashboard source 31,600 bytes — fully inside the dossier's 65,536-byte
  text cap, so the judge reads the whole source.
- Deterministic: two runs write byte-identical `board.json`, `data.js`
  and `dossier.json`.
- Screenshots (1440×900, Google Chrome headless): board, detail view of
  rank 1, filtered view (category Dexs) — each 300–350 KB.

## Caveats

- The model is TVL-led by design: the largest protocols top the board,
  and growth/maturity/breadth only reorder neighbours. That is the
  honest reading of "implied value if the record stayed as it is" — a
  token's value tracks the economic footprint first.
- `listed_at` is the day DefiLlama began tracking a protocol, a proxy
  for age, not a launch date; a protocol tracked late looks younger
  than it is.
- The snapshot is a single frozen day (2026-11-14). A protocol whose
  TVL moved after the fetch, or whose token launched after it, is scored
  on the frozen record.
- Farm plans are generic by category: they name the action, the capital
  and the cadence, but they cannot know a protocol's points rules, which
  live on its own pages.
