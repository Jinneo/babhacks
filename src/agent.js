import { BrowserProvider } from 'ethers';
import { executeRebalance, mandate, quoteRebalance, readPortfolio, requestTestFunds, routeConfig } from './rebalance.js';
import { buildHermesStrategy, COIN_LIBRARY } from './advisor.js';
import './agent.css';
import './advisor.css';
import './bagbalancer.css';

const $ = (id) => document.getElementById(id);
const route = routeConfig(import.meta.env);
let account = null;
let currentQuote = null;
let busy = false;
let advisorStrategy = null;
const selectedAdvisorCoins = new Set(['BTC','ETH']);

const number = (value, decimals = 2) => Number(value).toLocaleString(undefined, { maximumFractionDigits: decimals });
const short = (value) => `${value.slice(0, 6)}…${value.slice(-4)}`;
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function setBusy(value) { busy = value; for (const element of document.querySelectorAll('button,input')) element.disabled = value; if (!value) $('execute').disabled = !currentQuote || !route.ready || currentQuote.plan.action === 'none' || currentQuote.plan.action === 'blocked'; }
function policy() {
  const targetAusd = Number($('target').value);
  if (!Number.isFinite(targetAusd) || targetAusd < 0 || targetAusd > 100) throw new Error('AUSD target must be between 0% and 100%.');
  return mandate({ reserve:$('reserve').value, targetAsset:100 - targetAusd, threshold:$('threshold').value, runCap:$('cap').value, slippageBps:Math.round(Number($('slippage').value) * 100) });
}
function activity(message, hash) {
  const row = document.createElement('div'); row.className = 'event';
  const time = document.createElement('time'); time.textContent = new Date().toLocaleTimeString();
  const text = document.createElement('span'); text.textContent = message; row.append(time, text);
  if (hash) { const link = document.createElement('a'); link.href = `${route.explorerUrl}/tx/${hash}`; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = `View ${route.networkName} ↗`; row.append(link); }
  if ($('activity').querySelector('.hint')) $('activity').replaceChildren();
  $('activity').prepend(row);
}
function advisorInput() {
  return {
    goal:$('advisor-goal').value,
    horizonMonths:Number($('advisor-horizon').value),
    maxDrawdown:Number($('advisor-drawdown').value),
    priority:$('advisor-priority').value,
    regime:$('advisor-regime').value,
    frequency:$('advisor-frequency').value,
    minimumAusd:Number($('advisor-reserve').value),
    maximumAssetWeight:Number($('advisor-max-weight').value),
    speculativeLimit:Number($('advisor-speculative-limit').value),
    maximumSpending:Number($('advisor-max-spend').value),
    allowSpeculative:$('advisor-speculative').checked,
    approvalRequired:$('advisor-approval').checked,
    coins:[...selectedAdvisorCoins]
  };
}
function showCoinLibrary(query='') {
  const normalized=query.trim().toLowerCase();
  const library=$('advisor-coins'); library.replaceChildren();
  for(const coin of COIN_LIBRARY.filter(coin=>coin.symbol!=='AUSD'&&(!normalized||coin.symbol.toLowerCase().includes(normalized)||coin.name.toLowerCase().includes(normalized)))) {
    const label=document.createElement('label'); const input=document.createElement('input'); input.type='checkbox'; input.name='advisor-coin'; input.value=coin.symbol; input.checked=selectedAdvisorCoins.has(coin.symbol); input.onchange=()=>input.checked?selectedAdvisorCoins.add(coin.symbol):selectedAdvisorCoins.delete(coin.symbol); const text=document.createElement('span'); text.textContent=`${coin.symbol} · ${coin.name}`; label.append(input,text); library.append(label);
  }
}
function renderAdvisor(strategy) {
  const output=$('advisor-output'); output.replaceChildren();
  const summary=document.createElement('div'); summary.className='strategy-summary';
  for(const [label,value] of [['Risk score',`${strategy.mandate.riskScore}/100`],['AUSD target',`${strategy.allocation[0].weight.toFixed(1)}%`],['Research confidence',`${strategy.research.confidence}/100`]]) { const chip=document.createElement('div'); chip.className='strategy-chip'; const small=document.createElement('small'); small.textContent=label; const strong=document.createElement('strong'); strong.textContent=value; chip.append(small,strong); summary.append(chip); }
  output.append(summary);
  for(const asset of strategy.allocation) { const row=document.createElement('div'); row.className='allocation-row'; const symbol=document.createElement('span'); symbol.textContent=asset.symbol; const track=document.createElement('div'); track.className='allocation-track'; const fill=document.createElement('div'); fill.className='allocation-fill'; fill.style.width=`${asset.weight}%`; fill.title=asset.role; track.append(fill); const weight=document.createElement('strong'); weight.textContent=`${asset.weight.toFixed(1)}%`; row.append(symbol,track,weight); output.append(row); }
  const details=document.createElement('div'); details.className='strategy-details';
  const why=document.createElement('article'); const whyTitle=document.createElement('h3'); whyTitle.textContent='WHY THIS MIX'; const list=document.createElement('ul'); for(const reason of strategy.reasoning){const item=document.createElement('li');item.textContent=reason;list.append(item);} why.append(whyTitle,list);
  const stress=document.createElement('article'); const stressTitle=document.createElement('h3'); stressTitle.textContent='ILLUSTRATIVE SCENARIOS'; stress.append(stressTitle); for(const scenario of strategy.scenarioResults){const row=document.createElement('div');row.className='scenario';const name=document.createElement('span');name.textContent=scenario.label;const change=document.createElement('strong');change.className=scenario.changePercent<0?'negative':'positive';change.textContent=`${scenario.changePercent>0?'+':''}${scenario.changePercent.toFixed(1)}%`;row.append(name,change);stress.append(row);} details.append(why,stress); output.append(details);
  const warning=document.createElement('p'); warning.className='research-warning'; warning.textContent=`${strategy.research.source}. Scenarios are what-ifs, not forecasts. Nothing moved.`; output.append(warning);
  const apply=document.createElement('button'); apply.type='button'; apply.className='secondary apply-strategy'; apply.textContent='Use these guardrails →'; apply.onclick=()=>{ $('target').value=strategy.allocation[0].weight; $('threshold').value=strategy.controls.driftThreshold; $('cap').value=strategy.controls.maximumSpendingAusd; currentQuote=null; $('execute').disabled=true; $('plan-badge').textContent='BAG RULES APPLIED'; status('Bag guardrails applied. The demo can still move only AUSD/CTK after a fresh quote and your wallet approval.'); }; output.append(apply);
}
function generateStrategy() {
  advisorStrategy=buildHermesStrategy(advisorInput());
  renderAdvisor(advisorStrategy);
}
async function baseProvider() {
  if (!route.ready) throw new Error(route.reason);
  if (!window.ethereum) throw new Error(`Install a browser wallet such as MetaMask to use ${route.networkName}.`);
  const chainHex = `0x${route.chainId.toString(16)}`;
  if (Number(await window.ethereum.request({method:'eth_chainId'})) !== route.chainId) {
    try { await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:chainHex}]}); }
    catch (error) {
      if ((error.code ?? error.data?.originalError?.code) !== 4902) throw error;
      await window.ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:chainHex,chainName:route.networkName,nativeCurrency:{name:'Sepolia Ether',symbol:'ETH',decimals:18},rpcUrls:[route.rpcUrl],blockExplorerUrls:[route.explorerUrl]}]});
      await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:chainHex}]});
    }
  }
  if (Number(await window.ethereum.request({method:'eth_chainId'})) !== route.chainId) throw new Error(`${route.networkName} is required.`);
  return new BrowserProvider(window.ethereum);
}
async function connect() {
  const provider = await baseProvider();
  const accounts = await provider.send('eth_requestAccounts', []);
  account = accounts[0];
  $('connect').textContent = `Wallet ${short(account)} ↗`;
  status('Wallet connected. Refresh balances to build a real onchain plan.');
}
function showRoute() {
  $('route-state').textContent = route.ready ? 'Verified route ready ✓' : 'Moves are paused';
  $('route-state').className = route.ready ? 'ready' : 'blocked';
  $('route-detail').textContent = route.ready ? `${route.networkName} · AUSD/CTK · quotes stay fresh for ${route.quoteTtl}s` : route.reason;
}
function showPortfolio(portfolio) {
  $('ausd-balance').textContent = `${number(portfolio.ausd, 6)} AUSD`;
  $('asset-balance').textContent = `${number(portfolio.asset, 6)} ${portfolio.assetSymbol}`;
  $('asset-symbol').textContent = `Onchain value: ${number(portfolio.assetValueAusd)} AUSD`;
}
function showPlan(quote, portfolio) {
  const plan = quote.plan;
  $('drift').textContent = `${number(Math.abs(plan.drift), 2)} pp`;
  $('proposal').replaceChildren();
  const rows = [
    ['Current allocation', `AUSD ${number(100 - plan.assetWeight, 2)}% · ${portfolio.assetSymbol} ${number(plan.assetWeight, 2)}%`],
    ['Policy', `AUSD target ${number(policy().targetAusd, 2)}% · protected reserve ${number(policy().reserve)} AUSD`],
    ['Decision', plan.reason]
  ];
  if (plan.action === 'buy' || plan.action === 'sell') rows.push(['Proposed trade', `${plan.action === 'buy' ? 'Buy' : 'Sell'} up to ${number(plan.amountAusd)} AUSD value; cap and slippage enforced.`], ['Quote expiry', new Date(quote.expiresAt).toLocaleTimeString()]);
  for (const [label, value] of rows) { const row = document.createElement('div'); row.className = 'plan-row'; const left = document.createElement('div'); left.textContent = label; const right = document.createElement('strong'); right.textContent = value; row.append(left, right); $('proposal').append(row); }
  const blocked = plan.action === 'blocked';
  $('plan-badge').textContent = blocked ? 'RESERVE BLOCKED' : plan.action === 'none' ? 'IN THRESHOLD' : 'QUOTE READY';
  $('plan-badge').className = blocked ? 'blocked' : 'ready';
  $('execute').disabled = blocked || plan.action === 'none';
}
async function refresh() {
  if (!account) await connect();
  if (!route.ready) throw new Error(route.reason);
  const provider = await baseProvider();
  const portfolio = await readPortfolio(provider, account, route);
  showPortfolio(portfolio);
  $('drift').textContent = '—';
  status('Real wallet balances refreshed. Build a fresh router quote before rebalancing.');
  return {provider, portfolio};
}
async function buildPlan() {
  const {provider, portfolio} = await refresh();
  currentQuote = await quoteRebalance(provider, route, policy(), portfolio);
  showPlan(currentQuote, portfolio);
  if (currentQuote.plan.action === 'none') status('No transaction was sent: allocation is within your drift threshold.');
  else if (currentQuote.plan.action === 'blocked') status(`${currentQuote.plan.reason} No transaction was sent.`, true);
  else status(`Fresh onchain quote ready until ${new Date(currentQuote.expiresAt).toLocaleTimeString()}. Rebalance will request wallet confirmation.`);
}
async function claim(symbol) {
  if (!account) await connect();
  const provider = await baseProvider();
  const signer = await provider.getSigner();
  status(`Confirm the ${symbol} faucet request in your wallet. Sepolia ETH is required for gas.`);
  const submitted = await requestTestFunds(signer, account, route, symbol);
  activity(`${symbol} test funds confirmed on ${route.networkName}.`, submitted.hash);
  currentQuote = null;
  await refresh();
  status(`${symbol} test funds received. Your onchain balances have been refreshed.`);
}
async function execute() {
  if (!currentQuote) throw new Error('Build a fresh quote before rebalancing.');
  if (Date.now() >= currentQuote.expiresAt) throw new Error('Quote expired. Build a new quote; no transaction was sent.');
  if (currentQuote.plan.action !== 'buy' && currentQuote.plan.action !== 'sell') throw new Error('No executable rebalance is available.');
  const provider = await baseProvider();
  const signer = await provider.getSigner();
  status('Confirm the wallet requests. Testnet swapper allowlisting and an exact token approval may be requested before the swap.');
  const submitted = await executeRebalance(signer, account, route, currentQuote);
  for (const item of submitted) activity(`Real ${route.networkName} ${item.kind} confirmed.`, item.hash);
  currentQuote = null;
  $('execute').disabled = true;
  await refresh();
  status(`Rebalance confirmed on ${route.networkName}; real balances were refreshed.`);
}
async function guarded(fn) { if (busy) return; setBusy(true); try { await fn(); } catch (error) { const message = error.code === 4001 || error.code === 'ACTION_REJECTED' ? 'Wallet request cancelled. No transaction was sent.' : (error.shortMessage || error.message || 'Request failed.'); status(message, true); } finally { setBusy(false); } }

$('connect').onclick = () => guarded(connect);
$('refresh').onclick = () => guarded(refresh);
$('faucet-ausd').onclick = () => guarded(() => claim('AUSD'));
$('faucet-ctk').onclick = () => guarded(() => claim('CTK'));
$('plan').onclick = () => guarded(buildPlan);
$('execute').onclick = () => guarded(execute);
$('clear').onclick = () => $('activity').replaceChildren();
$('advisor-form').onsubmit = event => { event.preventDefault(); try { generateStrategy(); } catch(error) { status(error.message,true); } };
$('advisor-coin-search').oninput = event => showCoinLibrary(event.target.value);
for (const id of ['target','threshold','reserve','cap','slippage']) $(id).onchange = () => { currentQuote = null; $('execute').disabled = true; $('plan-badge').textContent = 'MANDATE CHANGED'; status('Mandate changed. Build a new quote before rebalancing.'); };
if (window.ethereum?.on) {
  window.ethereum.on('accountsChanged', (accounts) => { account = accounts[0] || null; currentQuote = null; $('connect').textContent = account ? `Wallet ${short(account)} ↗` : 'Connect wallet ↗'; $('execute').disabled = true; status(account ? 'Wallet changed. Refresh balances.' : 'Wallet disconnected.'); });
  window.ethereum.on('chainChanged', () => { currentQuote = null; $('execute').disabled = true; status(`Network changed. Reconnect on ${route.networkName}.`); });
}
showRoute();
showCoinLibrary();
if (!route.ready) { $('execute').disabled = true; status(route.reason, true); }
