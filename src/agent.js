import { BrowserProvider } from 'ethers';
import { executeRebalance, mandate, quoteRebalance, readPortfolio, requestTestFunds, routeConfig } from './rebalance.js';
import './agent.css';

const $ = (id) => document.getElementById(id);
const route = routeConfig(import.meta.env);
let account = null;
let currentQuote = null;
let busy = false;

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
  $('route-state').textContent = route.ready ? 'Verified-config route loaded' : 'Execution blocked';
  $('route-state').className = route.ready ? 'ready' : 'blocked';
  $('route-detail').textContent = route.ready ? `${route.networkName} pair ${short(route.router)} · AUSD/CTK · ${route.quoteTtl}s quote TTL` : route.reason;
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
for (const id of ['target','threshold','reserve','cap','slippage']) $(id).onchange = () => { currentQuote = null; $('execute').disabled = true; $('plan-badge').textContent = 'MANDATE CHANGED'; status('Mandate changed. Build a new quote before rebalancing.'); };
if (window.ethereum?.on) {
  window.ethereum.on('accountsChanged', (accounts) => { account = accounts[0] || null; currentQuote = null; $('connect').textContent = account ? `Wallet ${short(account)} ↗` : 'Connect wallet ↗'; $('execute').disabled = true; status(account ? 'Wallet changed. Refresh balances.' : 'Wallet disconnected.'); });
  window.ethereum.on('chainChanged', () => { currentQuote = null; $('execute').disabled = true; status(`Network changed. Reconnect on ${route.networkName}.`); });
}
showRoute();
if (!route.ready) { $('execute').disabled = true; status(route.reason, true); }
