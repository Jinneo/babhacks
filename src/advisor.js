const COIN_PROFILES = [
  ['AUSD','Agora Dollar',4,3,72,65,88,8,false,'stablecoin'],
  ['BTC','Bitcoin',58,62,98,96,94,67,false,'store-of-value'],
  ['ETH','Ether',66,70,95,90,92,76,false,'smart-contract'],
  ['SOL','Solana',82,88,84,68,78,91,true,'smart-contract'],
  ['LINK','Chainlink',76,80,78,78,82,83,true,'oracle'],
  ['AVAX','Avalanche',81,87,76,70,76,86,true,'smart-contract'],
  ['ADA','Cardano',73,78,82,85,80,68,false,'smart-contract'],
  ['DOT','Polkadot',77,82,74,80,77,72,true,'interoperability'],
  ['ATOM','Cosmos',78,83,72,80,76,73,true,'interoperability'],
  ['NEAR','NEAR Protocol',81,86,75,68,75,84,true,'smart-contract'],
  ['SUI','Sui',88,94,75,45,68,94,true,'smart-contract'],
  ['APT','Aptos',87,93,72,48,67,90,true,'smart-contract'],
  ['ARB','Arbitrum',83,89,80,55,74,82,true,'layer-2'],
  ['OP','Optimism',83,89,77,58,74,81,true,'layer-2'],
  ['POL','Polygon',76,82,82,80,79,73,true,'layer-2'],
  ['BNB','BNB',67,72,91,88,82,67,false,'exchange'],
  ['XRP','XRP',69,76,92,94,82,64,false,'payments'],
  ['DOGE','Dogecoin',88,95,90,92,71,82,true,'meme'],
  ['SHIB','Shiba Inu',94,99,80,62,60,86,true,'meme'],
  ['LTC','Litecoin',64,69,87,96,84,52,false,'payments'],
  ['BCH','Bitcoin Cash',69,75,82,94,78,55,false,'payments'],
  ['UNI','Uniswap',78,84,84,76,81,78,true,'defi'],
  ['AAVE','Aave',76,82,78,78,82,79,true,'defi'],
  ['MKR','Maker',75,80,70,84,80,72,true,'defi'],
  ['LDO','Lido DAO',82,88,74,65,75,81,true,'defi'],
  ['CRV','Curve DAO',88,94,67,73,66,76,true,'defi'],
  ['SNX','Synthetix',88,94,65,76,68,78,true,'defi'],
  ['COMP','Compound',82,88,68,82,76,69,true,'defi'],
  ['INJ','Injective',87,93,73,56,71,90,true,'defi'],
  ['TIA','Celestia',91,97,70,38,63,94,true,'infrastructure'],
  ['SEI','Sei',91,97,66,38,61,92,true,'smart-contract'],
  ['ICP','Internet Computer',80,86,78,70,73,75,true,'infrastructure'],
  ['FIL','Filecoin',80,86,78,80,76,70,true,'storage'],
  ['GRT','The Graph',82,88,72,72,73,80,true,'data'],
  ['RENDER','Render',86,92,78,63,72,91,true,'compute'],
  ['TAO','Bittensor',93,99,67,42,58,98,true,'compute'],
  ['HBAR','Hedera',75,81,78,78,76,69,true,'smart-contract'],
  ['ALGO','Algorand',77,83,72,82,74,65,true,'smart-contract'],
  ['XLM','Stellar',68,74,84,94,81,60,false,'payments'],
  ['TRX','TRON',69,75,88,90,75,62,false,'payments'],
  ['TON','Toncoin',82,88,82,58,72,86,true,'smart-contract'],
  ['KAS','Kaspa',88,94,70,50,64,90,true,'proof-of-work'],
  ['STX','Stacks',86,92,72,66,70,87,true,'layer-2'],
  ['IMX','Immutable',86,92,72,55,68,87,true,'gaming'],
  ['ENS','Ethereum Name Service',84,90,72,69,74,80,true,'identity'],
  ['RUNE','THORChain',89,95,72,70,67,86,true,'defi'],
  ['PENDLE','Pendle',91,97,71,43,63,94,true,'defi'],
  ['JUP','Jupiter',90,96,75,38,64,92,true,'defi'],
  ['ONDO','Ondo',88,94,76,42,66,91,true,'real-world-assets'],
  ['PEPE','Pepe',97,100,82,35,52,94,true,'meme']
];

export const COIN_LIBRARY = Object.freeze(COIN_PROFILES.map(([symbol,name,risk,volatility,liquidity,maturity,confidence,upside,speculative,group]) => Object.freeze({symbol,name,risk,volatility,liquidity,maturity,confidence,upside,speculative,group})));

const GOAL_RISK = {preserve:12, income:28, balanced:50, growth:72, aggressive:92};
const DRAWDOWN_RISK = {5:8, 15:35, 30:68, 50:95};
const HORIZON_RISK = {3:10, 12:30, 36:62, 60:86};
const REGIME_RESERVE = {normal:0, volatile:8, risk_off:16};
const CORRELATION = {
  BTC:{ETH:.78,SOL:.66,LINK:.62}, ETH:{BTC:.78,SOL:.76,LINK:.72},
  SOL:{BTC:.66,ETH:.76,LINK:.68}, LINK:{BTC:.62,ETH:.72,SOL:.68}
};
const SCENARIOS = {
  crash:{label:'Crypto stress', returns:{AUSD:0,BTC:-45,ETH:-55,SOL:-70,LINK:-65}},
  sideways:{label:'Sideways market', returns:{AUSD:0,BTC:1,ETH:2,SOL:-4,LINK:-2}},
  rally:{label:'Risk-on rally', returns:{AUSD:0,BTC:35,ETH:48,SOL:72,LINK:58}}
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, places = 1) => Number(value.toFixed(places));

function scenarioReturn(kind, symbol, scenario) {
  if (scenario.returns[symbol] != null) return scenario.returns[symbol];
  const asset=COIN_LIBRARY.find(item=>item.symbol===symbol);
  if (!asset || symbol==='AUSD') return 0;
  if (kind==='crash') return -clamp(asset.risk*.75,30,80);
  if (kind==='sideways') return clamp((65-asset.risk)/8,-6,3);
  return clamp(asset.upside*.75,20,75);
}

function finite(value, label, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return parsed;
}

export function deriveInvestorMandate(input = {}) {
  const goal = GOAL_RISK[input.goal] == null ? 'balanced' : input.goal;
  const drawdown = String(input.maxDrawdown ?? 15);
  const horizon = String(input.horizonMonths ?? 36);
  const regime = REGIME_RESERVE[input.regime] == null ? 'normal' : input.regime;
  const minimumAusd = finite(input.minimumAusd ?? 20, 'Minimum AUSD allocation', 0, 95);
  const maximumAssetWeight = finite(input.maximumAssetWeight ?? 35, 'Maximum asset weight', 5, 80);
  const speculativeLimit = finite(input.speculativeLimit ?? 10, 'Speculative allocation limit', 0, 60);
  const maximumSpending = finite(input.maximumSpending ?? 500, 'Maximum spending', 0, 1_000_000_000);
  const goalRisk = GOAL_RISK[goal];
  const drawdownRisk = DRAWDOWN_RISK[drawdown] ?? clamp(Number(drawdown) * 2, 0, 100);
  const horizonRisk = HORIZON_RISK[horizon] ?? clamp(Number(horizon) * 1.4, 0, 100);
  const speculationRisk = input.allowSpeculative ? 80 : 20;
  const riskScore = Math.round(goalRisk * .35 + drawdownRisk * .4 + horizonRisk * .15 + speculationRisk * .1);
  const modelReserve = clamp(68 - riskScore * .58 + REGIME_RESERVE[regime], 8, 85);
  const ausdTarget = round(Math.max(minimumAusd, modelReserve));
  const frequency = ['weekly','monthly','quarterly'].includes(input.frequency) ? input.frequency : 'monthly';
  const thresholdBase = {weekly:3,monthly:5,quarterly:7}[frequency];
  return {
    goal, regime, riskScore, ausdTarget, minimumAusd, maximumAssetWeight,
    speculativeLimit:input.allowSpeculative ? speculativeLimit : 0,
    maximumSpending, frequency, driftThreshold:round(thresholdBase + (regime === 'volatile' ? 1 : regime === 'risk_off' ? 2 : 0)),
    approvalRequired:input.approvalRequired !== false,
    priority:['low_volatility','diversification','upside'].includes(input.priority) ? input.priority : 'diversification'
  };
}

function correlationPenalty(symbol, selected) {
  const peers = selected.filter(peer => peer !== symbol);
  if (!peers.length) return 0;
  const asset = COIN_LIBRARY.find(item => item.symbol === symbol);
  return peers.reduce((sum, peer) => {
    const peerAsset = COIN_LIBRARY.find(item => item.symbol === peer);
    const groupEstimate = asset?.group === peerAsset?.group ? .75 : asset?.group === 'stablecoin' || peerAsset?.group === 'stablecoin' ? .1 : .5;
    return sum + (CORRELATION[symbol]?.[peer] ?? CORRELATION[peer]?.[symbol] ?? groupEstimate);
  }, 0) / peers.length * 25;
}

function distributeWithCaps(items, total, cap) {
  const weights = Object.fromEntries(items.map(item => [item.symbol, 0]));
  let remaining = total;
  let active = [...items];
  for (let pass = 0; pass < items.length + 1 && remaining > .0001 && active.length; pass += 1) {
    const scoreTotal = active.reduce((sum, item) => sum + item.score, 0);
    const next = [];
    let assigned = 0;
    for (const item of active) {
      const proposed = remaining * item.score / scoreTotal;
      const room = cap - weights[item.symbol];
      const amount = Math.min(proposed, room);
      weights[item.symbol] += amount;
      assigned += amount;
      if (room - amount > .0001) next.push(item);
    }
    if (assigned < .0001) break;
    remaining -= assigned;
    active = next;
  }
  return {weights, remainder:remaining};
}

export function buildHermesStrategy(input = {}) {
  const mandate = deriveInvestorMandate(input);
  const selectedSymbols = [...new Set((input.coins || ['BTC','ETH']).map(value => String(value).toUpperCase()))]
    .filter(symbol => symbol !== 'AUSD' && COIN_LIBRARY.some(asset => asset.symbol === symbol));
  if (!selectedSymbols.length) throw new Error('Select at least one non-AUSD coin.');
  const eligible = COIN_LIBRARY.filter(asset => selectedSymbols.includes(asset.symbol) && (mandate.speculativeLimit > 0 || !asset.speculative));
  if (!eligible.length) throw new Error('The selected coins are outside the speculative policy.');
  const scored = eligible.map(asset => {
    const fit = Math.max(4, 100 - Math.abs(asset.risk - mandate.riskScore) * 1.3);
    const quality = (asset.liquidity + asset.maturity + asset.confidence) / 3;
    const diversification = 100 - correlationPenalty(asset.symbol, eligible.map(item => item.symbol));
    let score = fit * .45 + quality * .35 + diversification * .2;
    if (mandate.priority === 'low_volatility') score *= (115 - asset.volatility) / 70;
    if (mandate.priority === 'upside') score *= (.65 + asset.upside / 100);
    if (mandate.priority === 'diversification') score *= asset.group === 'store-of-value' ? 1.08 : 1;
    return {...asset, score:Math.max(1, score)};
  });
  const riskyTotal = 100 - mandate.ausdTarget;
  const capped = distributeWithCaps(scored, riskyTotal, mandate.maximumAssetWeight);
  let weights = capped.weights;
  const speculative = scored.filter(asset => asset.speculative);
  const speculativeWeight = speculative.reduce((sum, asset) => sum + weights[asset.symbol], 0);
  let movedToAusd = capped.remainder;
  if (speculativeWeight > mandate.speculativeLimit) {
    const scale = mandate.speculativeLimit / speculativeWeight;
    let reclaimed = 0;
    for (const asset of speculative) {
      const before = weights[asset.symbol];
      weights[asset.symbol] *= scale;
      reclaimed += before - weights[asset.symbol];
    }
    let active = scored.filter(asset => !asset.speculative && weights[asset.symbol] < mandate.maximumAssetWeight);
    while (reclaimed > .0001 && active.length) {
      const scoreTotal = active.reduce((sum, asset) => sum + asset.score, 0);
      let assigned = 0;
      const next = [];
      for (const asset of active) {
        const room = mandate.maximumAssetWeight - weights[asset.symbol];
        const amount = Math.min(room, reclaimed * asset.score / scoreTotal);
        weights[asset.symbol] += amount;
        assigned += amount;
        if (room - amount > .0001) next.push(asset);
      }
      if (assigned < .0001) break;
      reclaimed -= assigned;
      active = next;
    }
    movedToAusd += reclaimed;
  }
  const allocation = [
    {symbol:'AUSD', name:'Agora Dollar', weight:round(mandate.ausdTarget + movedToAusd), role:'Protected liquidity and dry powder'},
    ...scored.map(asset => ({symbol:asset.symbol,name:asset.name,weight:round(weights[asset.symbol]),role:asset.speculative?'Capped satellite exposure':asset.group === 'store-of-value'?'Core crypto exposure':'Diversified growth exposure'}))
  ].filter(row => row.weight > 0);
  const difference = round(100 - allocation.reduce((sum, row) => sum + row.weight, 0));
  allocation[0].weight = round(allocation[0].weight + difference);
  const scenarioResults = Object.entries(SCENARIOS).map(([kind,scenario]) => ({
    label:scenario.label,
    changePercent:round(allocation.reduce((sum, row) => sum + row.weight / 100 * scenarioReturn(kind,row.symbol,scenario), 0))
  }));
  const averageConfidence = round(scored.reduce((sum, asset) => sum + asset.confidence, 0) / scored.length);
  const maxWeight = Math.max(...allocation.map(row => row.weight));
  return {
    mode:'proposal_only', mandate, allocation, scenarioResults,
    diagnostics:{averageResearchConfidence:averageConfidence,largestPositionWeight:maxWeight,selectedCoins:selectedSymbols,eligibleCoins:eligible.map(asset=>asset.symbol)},
    reasoning:[
      `Risk score ${mandate.riskScore}/100 combines goal, loss tolerance, time horizon, and speculative preference.`,
      `${allocation[0].weight.toFixed(1)}% stays in AUSD after the user floor, risk model, market regime, and any binding caps.`,
      `Risk assets are confidence-weighted, penalized for correlation, and capped at ${mandate.maximumAssetWeight.toFixed(1)}% each.`,
      `Speculative assets are capped at ${mandate.speculativeLimit.toFixed(1)}% in total.`,
      `Rebalance only beyond ${mandate.driftThreshold.toFixed(1)} percentage points, with a ${mandate.maximumSpending.toFixed(2)} AUSD per-run limit.`
    ],
    controls:{approvalRequired:mandate.approvalRequired,frequency:mandate.frequency,maximumSpendingAusd:mandate.maximumSpending,driftThreshold:mandate.driftThreshold},
    research:{source:'Curated demo assumptions—not live market research',confidence:averageConfidence,live:false},
    paymentsExecuted:false
  };
}
