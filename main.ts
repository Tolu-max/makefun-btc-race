import { runBars, type OrderInput } from './vendor/makefun-bars.ts';

const LOOKBACK = 2;
const ENTRY_THRESH_BPS = 30n;     // +0.30% in 2 bars
const EXIT_THRESH_BPS = -50n;     // -0.50% in 2 bars
const TAKE_PROFIT_BPS = 120n;     // +1.20% take profit
const STOP_LOSS_BPS = 200n;       // -2.00% stop loss
const MAX_SLIPPAGE_BPS = 10_000;
const BPS = 10_000n;

const closes: bigint[] = [];
let buyPrice: bigint | null = null;

await runBars({
  onBatch(state, batch) {
    const symbol = state.hello.symbols[0]?.symbol;
    if (!symbol) return [];
    
    const currentClose = state.close(symbol);
    if (currentClose !== null && currentClose !== undefined) {
      closes.push(currentClose);
    }
    
    const pos = state.positions.get(symbol);
    const hasPosition = pos && pos.qty > 0n;
    
    if (closes.length <= LOOKBACK) return [];
    
    const lastClose = closes[closes.length - 1]!;
    const prevClose = closes[closes.length - 1 - LOOKBACK]!;
    const rocBps = ((lastClose - prevClose) * BPS) / prevClose;
    
    if (!hasPosition) {
      buyPrice = null;
      if (rocBps >= ENTRY_THRESH_BPS && state.cash >= BigInt(state.hello.fees.min_notional_quote_units)) {
        buyPrice = lastClose;
        return [{
          side: 'buy',
          symbol,
          notional_quote_units: state.cash,
          max_slippage_bps: MAX_SLIPPAGE_BPS,
        }];
      }
      return [];
    }
    
    let shouldSell = false;
    
    if (buyPrice !== null && buyPrice > 0n) {
      if (lastClose >= buyPrice) {
        const gainBps = ((lastClose - buyPrice) * BPS) / buyPrice;
        if (gainBps >= TAKE_PROFIT_BPS) shouldSell = true;
      } else {
        const lossBps = ((buyPrice - lastClose) * BPS) / buyPrice;
        if (lossBps >= STOP_LOSS_BPS) shouldSell = true;
      }
    }
    
    if (rocBps <= EXIT_THRESH_BPS) {
      shouldSell = true;
    }
    
    if (shouldSell) {
      buyPrice = null;
      return [{
        side: 'sell',
        symbol,
        qty: pos.qty,
        max_slippage_bps: MAX_SLIPPAGE_BPS,
      }];
    }
    
    return [];
  },
});
