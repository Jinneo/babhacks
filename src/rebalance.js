import { Contract, formatUnits, isAddress, parseUnits } from 'ethers';
import { TOKEN } from './payment.js';

export const AUSD_DECIMALS = 6;
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
export const ERC20_ABI = [
  'function balanceOf(address) view returns(uint256)',
  'function decimals() view returns(uint8)',
  'function symbol() view returns(string)',
  'function allowance(address,address) view returns(uint256)',
  'function approve(address,uint256) returns(bool)'
];
export const V2_ROUTER_ABI = [
  'error InsufficientLiquidity()',
  'function token0() view returns(address)',
  'function token1() view returns(address)',
  'function hasRole(string,address) view returns(bool)',
  'function getAmountsOut(uint256,address[]) view returns(uint256[])',
  'function getAmountsIn(uint256,address[]) view returns(uint256[])',
  'function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns(uint256[])',
  'function swapTokensForExactTokens(uint256,uint256,address[],address,uint256) returns(uint256[])'
];
export const WHITELISTER_ABI = ['function setApprovedSwapper(address)'];
export const FAUCET_ABI = ['function requestFunds(address)'];

export function validateExecutionConfig(config) {
  if (!config?.enabled) return {ready:false, reason:'Execution is blocked: no verified AUSD swap route is configured.'};
  if (!config.verification) return {ready:false, reason:'Execution is blocked: the configured route is not verified by the operator.'};
  if (![config.pair, config.asset, config.ausd].every(value => ADDRESS.test(value || ''))) return {ready:false, reason:'Execution is blocked: pair, asset, and AUSD must be valid contract addresses.'};
  if (new Set([config.pair, config.asset, config.ausd].map(value => value.toLowerCase())).size !== 3) return {ready:false, reason:'Execution is blocked: pair, asset, and AUSD must be distinct allowlisted addresses.'};
  return {ready:true, reason:'Verified direct-pair adapter configured.'};
}

export function buildRebalancePlan({ausdBalance, assetValueInAusd, targetAusdWeight, driftThreshold, protectedReserve, perRunCap}) {
  for (const [name, value] of Object.entries({ausdBalance, assetValueInAusd, protectedReserve, perRunCap})) if (typeof value !== 'bigint' || value < 0n) throw new Error(`${name} must be a nonnegative bigint.`);
  if (!Number.isFinite(targetAusdWeight) || targetAusdWeight < 0 || targetAusdWeight > 100) throw new Error('AUSD target must be between 0% and 100%.');
  if (!Number.isFinite(driftThreshold) || driftThreshold < 0 || driftThreshold > 100) throw new Error('Drift threshold must be between 0% and 100%.');
  const total = ausdBalance + assetValueInAusd;
  if (total === 0n) return {direction:'NONE', blocked:true, reason:'No allowlisted wallet balances are available to rebalance.', total, ausdNotional:0n, drift:0};
  const target = BigInt(Math.round(targetAusdWeight * 1000)) * total / 100000n;
  const drift = Math.abs(Number(ausdBalance * 100000n / total) / 1000 - targetAusdWeight);
  if (drift <= driftThreshold) return {direction:'NONE', blocked:false, reason:'Allocation is within the drift threshold.', total, ausdNotional:0n, drift};
  if (ausdBalance > target) {
    const desired = ausdBalance - target, safeSpend = ausdBalance > protectedReserve ? ausdBalance - protectedReserve : 0n;
    if (desired > safeSpend) return {direction:'AUSD_TO_ASSET', blocked:true, reason:'Target cannot be reached without spending the protected AUSD reserve.', total, ausdNotional:0n, drift};
    return {direction:'AUSD_TO_ASSET', blocked:false, reason:'AUSD is above target.', total, ausdNotional:desired > perRunCap ? perRunCap : desired, drift};
  }
  const desired = target - ausdBalance;
  return {direction:'ASSET_TO_AUSD', blocked:false, reason:'AUSD is below target.', total, ausdNotional:desired > perRunCap ? perRunCap : desired, drift};
}

export function minAmountOut(quotedAmountOut, slippageBps) {
  if (typeof quotedAmountOut !== 'bigint' || quotedAmountOut <= 0n) throw new Error('Quote output must be positive.');
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 1000) throw new Error('Slippage must be between 0 and 10%.');
  return quotedAmountOut * BigInt(10_000 - slippageBps) / 10_000n;
}

const setOf = (value) => new Set(String(value || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean));
const nonnegative = (value, label) => { const number = Number(value); if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be a nonnegative number.`); return number; };
const toAUSD = (value) => Number(formatUnits(value, AUSD_DECIMALS));

export function scaleUnitQuote(balanceRaw, unitRaw, quotedUnitRaw) {
  if (![balanceRaw, unitRaw, quotedUnitRaw].every(value => typeof value === 'bigint')) throw new Error('Quote values must be bigint amounts.');
  if (balanceRaw < 0n || unitRaw <= 0n || quotedUnitRaw < 0n) throw new Error('Quote values are invalid.');
  return balanceRaw * quotedUnitRaw / unitRaw;
}

export function routeConfig(env = {}) {
  const router = String(env.VITE_REBALANCE_ROUTER || '').trim().toLowerCase();
  const asset = String(env.VITE_REBALANCE_ASSET || '').trim().toLowerCase();
  const whitelister = String(env.VITE_REBALANCE_WHITELISTER || '').trim().toLowerCase();
  const ausdFaucet = String(env.VITE_AUSD_FAUCET || '0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C').trim().toLowerCase();
  const ctkFaucet = String(env.VITE_CTK_FAUCET || '0xf8A143b3406faF59FD9A34891076104B10200B1D').trim().toLowerCase();
  const routers = setOf(env.VITE_REBALANCE_ROUTER_ALLOWLIST), tokens = setOf(env.VITE_REBALANCE_TOKEN_ALLOWLIST);
  const quoteTtl = Number(env.VITE_REBALANCE_QUOTE_TTL_SECONDS || 60);
  const chainId = Number(env.VITE_REBALANCE_CHAIN_ID || 11155111);
  const networkName = String(env.VITE_REBALANCE_NETWORK_NAME || 'Ethereum Sepolia').trim();
  const rpcUrl = String(env.VITE_REBALANCE_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com').trim();
  const explorerUrl = String(env.VITE_REBALANCE_EXPLORER_URL || 'https://sepolia.etherscan.io').replace(/\/$/, '');
  if (!router || !asset || !whitelister || !routers.size || !tokens.size) return {ready:false, reason:'No verified AUSD swap route is configured. Set the rebalance pair, asset, whitelister, and allowlists, then rebuild. No transaction was sent.'};
  if (![router, asset, whitelister, ausdFaucet, ctkFaucet].every(isAddress)) return {ready:false, reason:'A configured pair, asset, whitelister, or faucet is not an EVM address. No transaction was sent.'};
  if (!routers.has(router)) return {ready:false, reason:'The configured router is not in VITE_REBALANCE_ROUTER_ALLOWLIST. No transaction was sent.'};
  if (!tokens.has(TOKEN) || !tokens.has(asset)) return {ready:false, reason:'The AUSD route contains a token outside VITE_REBALANCE_TOKEN_ALLOWLIST. No transaction was sent.'};
  if (!Number.isInteger(quoteTtl) || quoteTtl < 15 || quoteTtl > 300) return {ready:false, reason:'VITE_REBALANCE_QUOTE_TTL_SECONDS must be an integer from 15 through 300. No transaction was sent.'};
  if (!Number.isSafeInteger(chainId) || chainId <= 0 || !networkName || !rpcUrl || !explorerUrl) return {ready:false, reason:'The configured rebalance network is incomplete. No transaction was sent.'};
  return {ready:true, router, asset, whitelister, ausdFaucet, ctkFaucet, path:[TOKEN,asset], quoteTtl, chainId, networkName, rpcUrl, explorerUrl};
}

export async function requestTestFunds(signer, account, config, symbol) {
  if (!config.ready) throw new Error(config.reason);
  const normalized = String(symbol).toUpperCase();
  const faucetAddress = normalized === 'AUSD' ? config.ausdFaucet : normalized === 'CTK' ? config.ctkFaucet : null;
  if (!faucetAddress) throw new Error('Only AUSD and CTK test funds are supported.');
  const provider = signer.provider;
  if (!provider || await provider.getCode(faucetAddress) === '0x') throw new Error(`The ${normalized} faucet is not deployed on ${config.networkName}. No transaction was sent.`);
  const faucet = new Contract(faucetAddress, FAUCET_ABI, signer);
  const tx = await faucet.requestFunds(account);
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error(`${normalized} faucet transaction failed on ${config.networkName}.`);
  return {kind:`${normalized} faucet`,hash:tx.hash};
}

export function mandate(values) {
  const reserve = nonnegative(values.reserve, 'Protected AUSD reserve'), targetAsset = nonnegative(values.targetAsset, 'Asset target weight'), threshold = nonnegative(values.threshold, 'Drift threshold'), runCap = nonnegative(values.runCap, 'Per-run AUSD cap'), slippageBps = nonnegative(values.slippageBps, 'Slippage');
  if (targetAsset > 100 || threshold > 100) throw new Error('Weights and drift threshold cannot exceed 100%.');
  if (slippageBps > 1000) throw new Error('Slippage cannot exceed 1,000 bps (10%).');
  if (!runCap) throw new Error('Per-run AUSD cap must be greater than zero.');
  return {reserve,targetAsset,targetAusd:100-targetAsset,threshold,runCap,slippageBps};
}

export function rebalancePlan({ausd, assetValueAusd, policy}) {
  const total = ausd + assetValueAusd;
  if (total <= 0) throw new Error('Wallet has no configured rebalance assets.');
  const assetWeight = assetValueAusd / total * 100, drift = assetWeight - policy.targetAsset;
  if (Math.abs(drift) <= policy.threshold) return {action:'none',total,assetWeight,drift,amountAusd:0,reason:'Allocation is within the configured drift threshold.'};
  const amount = Math.min(Math.abs(total * policy.targetAsset / 100 - assetValueAusd), policy.runCap);
  if (drift < 0) {
    const spendable = Math.max(0, ausd - policy.reserve);
    if (!spendable) return {action:'blocked',total,assetWeight,drift,amountAusd:0,reason:`Protected reserve keeps ${policy.reserve.toFixed(2)} AUSD unavailable; no AUSD is spendable.`};
    return {action:'buy',total,assetWeight,drift,amountAusd:Math.min(amount,spendable),reason:'Buy the configured asset with AUSD.'};
  }
  return {action:'sell',total,assetWeight,drift,amountAusd:amount,reason:'Sell the configured asset for AUSD.'};
}

export async function readPortfolio(provider, account, config) {
  if (!config.ready) throw new Error(config.reason);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== config.chainId) throw new Error(`${config.networkName} is required. No transaction was sent.`);
  const ausd = new Contract(TOKEN, ERC20_ABI, provider), asset = new Contract(config.asset, ERC20_ABI, provider), router = new Contract(config.router, V2_ROUTER_ABI, provider);
  const [ausdCode, assetCode, routerCode, ausdRaw, assetRaw, decimals, symbol, token0, token1] = await Promise.all([
    provider.getCode(TOKEN), provider.getCode(config.asset), provider.getCode(config.router),
    ausd.balanceOf(account), asset.balanceOf(account), asset.decimals(), asset.symbol(), router.token0(), router.token1()
  ]);
  if ([ausdCode, assetCode, routerCode].some(code => code === '0x')) throw new Error(`A configured contract is not deployed on ${config.networkName}. No transaction was sent.`);
  const pairTokens = new Set([token0.toLowerCase(), token1.toLowerCase()]);
  if (!pairTokens.has(TOKEN) || !pairTokens.has(config.asset)) throw new Error('The configured pair does not contain exactly the allowlisted AUSD and asset contracts. No transaction was sent.');
  // Agora's pair rejects quotes larger than its current reserves. Portfolio
  // valuation only needs a unit price; execution is quoted separately against
  // real liquidity immediately before a wallet transaction.
  const assetUnitRaw = 10n ** BigInt(decimals);
  const quotedUnitRaw = assetRaw ? (await router.getAmountsOut(assetUnitRaw,[config.asset,TOKEN])).at(-1) : 0n;
  const assetValueRaw = assetRaw ? scaleUnitQuote(assetRaw,assetUnitRaw,quotedUnitRaw) : 0n;
  return {ausd:toAUSD(ausdRaw),ausdRaw,asset:Number(formatUnits(assetRaw,decimals)),assetRaw,assetValueAusd:toAUSD(assetValueRaw),assetValueRaw,assetDecimals:Number(decimals),assetSymbol:symbol};
}

export async function quoteRebalance(provider, config, policy, portfolio) {
  const plan = rebalancePlan({ausd:portfolio.ausd,assetValueAusd:portfolio.assetValueAusd,policy});
  const expiresAt = Date.now() + config.quoteTtl * 1000;
  if (plan.action === 'none' || plan.action === 'blocked') return {plan,expiresAt};
  const router = new Contract(config.router,V2_ROUTER_ABI,provider), capRaw = parseUnits(plan.amountAusd.toFixed(AUSD_DECIMALS),AUSD_DECIMALS);
  if (plan.action === 'buy') {
    const reserveRaw = parseUnits(policy.reserve.toFixed(AUSD_DECIMALS),AUSD_DECIMALS), spendable = portfolio.ausdRaw > reserveRaw ? portfolio.ausdRaw-reserveRaw : 0n;
    if (capRaw > spendable) throw new Error('Protected AUSD reserve would be breached. Refresh balances or reduce the cap; no transaction was sent.');
    const out = (await router.getAmountsOut(capRaw,config.path)).at(-1);
    return {plan,direction:'buy',amountIn:capRaw,amountOutMin:minAmountOut(out,Math.round(policy.slippageBps)),expiresAt};
  }
  const amounts = await router.getAmountsIn(capRaw,[config.asset,TOKEN]);
  if (amounts[0] > portfolio.assetRaw) throw new Error('The configured asset balance cannot fund the proposed sell. Refresh balances and lower the per-run cap.');
  return {plan,direction:'sell',amountOut:capRaw,amountInMax:(amounts[0]*BigInt(10000+Math.round(policy.slippageBps))+9999n)/10000n,expiresAt};
}

export async function executeRebalance(signer, account, config, quote) {
  if (Date.now() >= quote.expiresAt) throw new Error('Quote expired before confirmation. Refresh balances to obtain a new quote; no transaction was sent.');
  const submitted=[];
  const router = new Contract(config.router,V2_ROUTER_ABI,signer);
  if (!(await router.hasRole('APPROVED_SWAPPER', account))) {
    const whitelister = new Contract(config.whitelister,WHITELISTER_ABI,signer);
    const approval = await whitelister.setApprovedSwapper(account), receipt = await approval.wait();
    if (receipt.status !== 1) throw new Error(`Swapper allowlisting failed on ${config.networkName}. No swap was submitted.`);
    submitted.push({kind:'swapper allowlist',hash:approval.hash});
    if (!(await router.hasRole('APPROVED_SWAPPER', account))) throw new Error('The pair still does not recognize this wallet as an approved swapper. No swap was submitted.');
  }
  const input = quote.direction === 'buy' ? TOKEN : config.asset, amount = quote.direction === 'buy' ? quote.amountIn : quote.amountInMax, token = new Contract(input,ERC20_ABI,signer);
  if (await token.allowance(account,config.router) < amount) {
    const approval = await token.approve(config.router,amount), receipt = await approval.wait();
    if (receipt.status !== 1) throw new Error(`Token approval failed on ${config.networkName}. No swap was submitted.`);
    submitted.push({kind:'approval',hash:approval.hash});
  }
  if (Date.now() >= quote.expiresAt) throw new Error('Quote expired after approval. Refresh balances before submitting a swap.');
  const deadline = BigInt(Math.floor(Date.now()/1000)+config.quoteTtl);
  const tx = quote.direction === 'buy' ? await router.swapExactTokensForTokens(quote.amountIn,quote.amountOutMin,config.path,account,deadline) : await router.swapTokensForExactTokens(quote.amountOut,quote.amountInMax,[config.asset,TOKEN],account,deadline);
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error(`Swap transaction reverted on ${config.networkName}. Check the transaction in the explorer.`);
  submitted.push({kind:'swap',hash:tx.hash});
  return submitted;
}
