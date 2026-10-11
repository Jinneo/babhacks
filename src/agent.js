import { BrowserProvider } from 'ethers';
import { executeRebalance, mandate, quoteRebalance, readPortfolio, requestTestFunds, routeConfig } from './rebalance.js';
import { COIN_LIBRARY } from './advisor.js';
import { payForResearch } from './x402.js';
import './agent.css';
import './advisor.css';
import './bagbalancer.css';

const $ = (id) => document.getElementById(id);
const route = routeConfig(import.meta.env);
let account = null;
let currentQuote = null;
let busy = false;
let advisorStrategy = null;
let x402Service = {ready:false,amountAusd:0.10,reason:'Checking x402 settlement.'};
let activePolicy = {targetAusd:20,threshold:2,reserve:100,cap:500,slippage:1};
const selectedAdvisorCoins = new Set(['BTC','ETH','ADA','BNB','XRP','LTC','XLM','TRX']);
const chartColors=['#c8ff4d','#8467ff','#ff8a5b','#49b7a5','#f6c85f','#df72c5','#5b8ff9','#8ccf67','#d56b6b','#9c83d8','#58a7c7','#d29a4a'];

const number = (value, decimals = 2) => Number(value).toLocaleString(undefined, { maximumFractionDigits: decimals });
const short = (value) => `${value.slice(0, 6)}…${value.slice(-4)}`;
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function balanceStatus(message, error = false) { $('balance-status').textContent = message; $('balance-status').classList.toggle('error', error); }
function errorMessage(error) { return error.code === 4001 || error.code === 'ACTION_REJECTED' ? 'Wallet request cancelled. No transaction was sent.' : (error.shortMessage || error.message || 'Request failed.'); }
function setBusy(value) { busy = value; for (const element of document.querySelectorAll('button,input')) element.disabled = value; if (!value) $('execute').disabled = !currentQuote || !route.ready || currentQuote.plan.action === 'none' || currentQuote.plan.action === 'blocked'; }
function policy() {
  const targetAusd = Number(activePolicy.targetAusd);
  if (!Number.isFinite(targetAusd) || targetAusd < 0 || targetAusd > 100) throw new Error('AUSD target must be between 0% and 100%.');
  return mandate({ reserve:activePolicy.reserve, targetAsset:100-targetAusd, threshold:activePolicy.threshold, runCap:activePolicy.cap, slippageBps:Math.round(activePolicy.slippage*100) });
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
    const label=document.createElement('label'); const input=document.createElement('input'); input.type='checkbox'; input.name='advisor-coin'; input.value=coin.symbol; input.checked=selectedAdvisorCoins.has(coin.symbol); input.onchange=()=>{input.checked?selectedAdvisorCoins.add(coin.symbol):selectedAdvisorCoins.delete(coin.symbol);updateDiversityHint();}; const text=document.createElement('span'); text.textContent=`${coin.symbol} · ${coin.name}`; label.append(input,text); library.append(label);
  }
}
function updateDiversityHint(){const count=selectedAdvisorCoins.size,hint=$('coin-diversity-hint');hint.textContent=count>=6?`${count} coins selected · broad bag ready`:`${count} coin${count===1?'':'s'} selected · choose at least 6 for a broader bag`;hint.classList.toggle('ready',count>=6);}
function renderPortfolioChart(allocation){
  const pie=$('portfolio-pie'),legend=$('portfolio-legend'),segments=[];let cursor=0;
  legend.replaceChildren();pie.classList.remove('empty');
  allocation.forEach((asset,index)=>{const start=cursor;cursor+=asset.weight;const color=chartColors[index%chartColors.length];segments.push(`${color} ${start}% ${cursor}%`);const row=document.createElement('div');row.className='legend-row';const swatch=document.createElement('i');swatch.style.background=color;const name=document.createElement('span');name.textContent=`${asset.symbol} · ${asset.name}`;const weight=document.createElement('strong');weight.textContent=`${asset.weight.toFixed(1)}%`;row.append(swatch,name,weight);legend.append(row);});
  pie.style.background=`conic-gradient(${segments.join(',')})`;
  pie.setAttribute('aria-label',allocation.map(asset=>`${asset.symbol} ${asset.weight.toFixed(1)} percent`).join(', '));
  $('portfolio-coin-count').textContent=allocation.filter(asset=>asset.symbol!=='AUSD').length;
  $('chart-state').textContent='PROPOSAL APPLIED';$('chart-state').className='chart-state ready';
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
  if(strategy.research.summary){const summary=document.createElement('p');summary.className='research-summary';summary.textContent=strategy.research.summary;output.append(summary);}
  if(strategy.research.citations?.length){const sources=document.createElement('div');sources.className='research-sources';const label=document.createElement('strong');label.textContent='Sources';sources.append(label);for(const citation of strategy.research.citations){const link=document.createElement('a');link.href=citation.url;link.target='_blank';link.rel='noreferrer';link.textContent=`${citation.title} ↗`;link.title=citation.supports;sources.append(link);}output.append(sources);}
  const warning=document.createElement('p'); warning.className='research-warning'; warning.textContent=strategy.research.live?`Live data checked at ${new Date(strategy.research.asOf).toLocaleString()}. Scenarios are what-ifs, not forecasts. Nothing moved.`:`${strategy.research.source}. Scenarios are what-ifs, not forecasts. Nothing moved.`; output.append(warning);
  if(strategy.x402Payment){const receipt=document.createElement('a');receipt.className='x402-receipt';receipt.href=strategy.x402Payment.explorerUrl;receipt.target='_blank';receipt.rel='noreferrer';receipt.textContent=`x402 paid · ${strategy.x402Payment.amountAusd.toFixed(2)} test AUSD ↗`;output.append(receipt);}
  const apply=document.createElement('button'); apply.type='button'; apply.className='secondary apply-strategy'; apply.textContent='Apply this proposal →'; apply.onclick=()=>{ activePolicy={...activePolicy,targetAusd:strategy.allocation[0].weight,threshold:strategy.controls.driftThreshold,cap:strategy.controls.maximumSpendingAusd};renderPortfolioChart(strategy.allocation);currentQuote=null;$('execute').disabled=true;$('plan-badge').textContent='PROPOSAL APPLIED';status('Proposal applied and portfolio chart updated. Nothing moved; any testnet transaction still needs a fresh quote and wallet approval.'); }; output.append(apply);
}
async function generateStrategy() {
  const button=$('generate-strategy'),output=$('advisor-output'),original=button.textContent;button.disabled=true;button.textContent='Balencing your bag…';output.innerHTML='<div class="researching-state"><div class="balance-loader" aria-hidden="true"><i></i><span></span><b></b></div><strong>Balencing your bag</strong><small>Checking real market data across every selected coin.</small></div>';
  try{let x402Payment=null;if(x402Service.ready){const stage=output.querySelector('small');x402Payment=await payForResearch({onProgress:message=>{stage.textContent=message;status(message);}});$('x402-indicator').textContent='x402 paid · testnet';$('x402-indicator').classList.add('paid');stage.textContent='Payment settled. Checking real market data across every selected coin.';}const response=await fetch('/api/research-strategy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(advisorInput())});let result={};try{result=await response.json();}catch{}if(!response.ok){if(response.status===404)throw new Error('The local server is still running the old code. Stop it, run npm run dev again, then retry.');throw new Error(result.error||`Live research failed (${response.status}).`);}advisorStrategy={...result,x402Payment};renderAdvisor(advisorStrategy);status('Fresh market research is ready. Review the sources and apply the proposal when it feels right.');}
  finally{button.disabled=false;button.textContent=original;}
}
async function loadX402Config(){try{const response=await fetch('/api/config'),config=await response.json();x402Service={ready:!!config.x402?.ready,amountAusd:Number(config.x402?.amountAusd||0.10),reason:config.x402?.reason||''};const indicator=$('x402-indicator');indicator.textContent=x402Service.ready?`x402 · ${x402Service.amountAusd.toFixed(2)} test AUSD`:'x402-ready · testnet';indicator.title=x402Service.ready?'Live research uses a Base Sepolia x402 test payment.':x402Service.reason;}catch{$('x402-indicator').textContent='x402-ready · testnet';}}
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
  balanceStatus(account ? 'Reading fresh balances from Ethereum Sepolia…' : 'Open your wallet and approve the connection request…');
  if (!account) await connect();
  if (!route.ready) throw new Error(route.reason);
  const provider = await baseProvider();
  const portfolio = await readPortfolio(provider, account, route);
  showPortfolio(portfolio);
  $('drift').textContent = '—';
  balanceStatus(`Balances updated at ${new Date().toLocaleTimeString()}.`);
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
async function guarded(fn) { if (busy) return; setBusy(true); try { await fn(); } catch (error) { status(errorMessage(error), true); } finally { setBusy(false); } }

async function refreshFromButton() {
  const button=$('refresh'),label=button.textContent;button.textContent='Refreshing…';
  try { await refresh(); }
  catch(error) { balanceStatus(errorMessage(error),true); throw error; }
  finally { button.textContent=label; }
}

$('connect').onclick = () => guarded(connect);
$('faucet-ausd').onclick = () => guarded(() => claim('AUSD'));
$('faucet-ctk').onclick = () => guarded(() => claim('CTK'));
$('refresh').onclick = () => guarded(refreshFromButton);
$('plan').onclick = () => guarded(buildPlan);
$('execute').onclick = () => guarded(execute);
$('clear').onclick = () => $('activity').replaceChildren();
$('advisor-form').onsubmit = async event => { event.preventDefault(); try { await generateStrategy(); } catch(error) { const output=$('advisor-output');output.replaceChildren();const message=document.createElement('p');message.className='empty-state research-error';message.textContent='Research stopped.';const detail=document.createElement('span');detail.textContent=error.message||'Live research failed.';message.append(document.createElement('br'),detail);output.append(message);status(error.message,true); } };
$('advisor-coin-search').oninput = event => showCoinLibrary(event.target.value);
if (window.ethereum?.on) {
  window.ethereum.on('accountsChanged', (accounts) => { account = accounts[0] || null; currentQuote = null; $('connect').textContent = account ? `Wallet ${short(account)} ↗` : 'Connect wallet ↗'; $('execute').disabled = true; status(account ? 'Wallet changed. Refresh balances.' : 'Wallet disconnected.'); });
  window.ethereum.on('chainChanged', () => { currentQuote = null; $('execute').disabled = true; status(`Network changed. Reconnect on ${route.networkName}.`); });
}
showRoute();
showCoinLibrary();
updateDiversityHint();
loadX402Config();
if (!route.ready) { $('execute').disabled = true; status(route.reason, true); }
