import { BrowserProvider, Contract, formatUnits, parseUnits, isAddress, ZeroAddress } from 'ethers';
import './style.css';
import './bagbalancer-transfer.css';
const CHAIN = 84532;
const TOKEN = '0xa9012a055bd4e0edff8ce09f960291c09d5322dc';
const FAUCET = '0xd236c18d274e54faccc3dd9dda4b27965a73ee6c';
const ABI = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)', 'function transfer(address,uint256) returns (bool)'];
const $ = (id) => document.getElementById(id);
let account, busy = false, decimals = 6;
let history;
try { history = JSON.parse(localStorage.getItem('ausd-history') || '[]'); if (!Array.isArray(history)) history = []; } catch { history = []; }
const short = (value) => `${value.slice(0,6)}…${value.slice(-4)}`;
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function controls() { for (const id of ['send','mint']) $(id).disabled = !account || busy; $('connect').disabled = busy; $('refresh').disabled = busy; }
function renderHistory() {
  $('activity').replaceChildren();
  if (!history.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'Your transfers and faucet requests will appear here.'; $('activity').append(p); }
  for (const item of history.slice(0,10)) {
    const row = document.createElement('div'); row.className = 'transaction';
    const label = document.createElement('div'); label.textContent = item.label;
    const detail = document.createElement('small'); detail.textContent = `${item.state} · ${new Date(item.time).toLocaleString()}`; label.append(detail);
    const link = document.createElement('a'); link.textContent = 'View transaction ↗'; link.target = '_blank'; link.rel = 'noreferrer'; link.href = `https://sepolia.basescan.org/tx/${item.hash}`;
    row.append(label,link); $('activity').append(row);
  }
}
function persistHistory() { localStorage.setItem('ausd-history', JSON.stringify(history)); renderHistory(); }
async function onBase() {
  if (!window.ethereum) throw new Error('Install a browser wallet such as MetaMask, then reload this page.');
  const chain = await window.ethereum.request({method:'eth_chainId'});
  if (Number(chain) !== CHAIN) {
    try { await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x14a34'}]}); }
    catch (e) {
      if ((e.code ?? e.data?.originalError?.code) !== 4902) throw e;
      await window.ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:'0x14a34',chainName:'Base Sepolia',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:['https://sepolia.base.org'],blockExplorerUrls:['https://sepolia.basescan.org']}]});
      await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x14a34'}]});
    }
  }
  if (Number(await window.ethereum.request({method:'eth_chainId'})) !== CHAIN) throw new Error('Switch your wallet to Base Sepolia.');
  return new BrowserProvider(window.ethereum);
}
async function refresh() {
  if (!account) return;
  const provider = await onBase();
  const token = new Contract(TOKEN, ABI, provider);
  const address = account;
  const [balance, eth, precision] = await Promise.all([token.balanceOf(address), provider.getBalance(address), token.decimals()]);
  if (address !== account) return;
  decimals = Number(precision);
  $('balance').textContent = `${Number(formatUnits(balance,decimals)).toLocaleString(undefined,{maximumFractionDigits:6})}`;
  $('gas').textContent = `${Number(formatUnits(eth,18)).toLocaleString(undefined,{maximumFractionDigits:6})}`;
}
function setAccount(value) {
  account = value;
  $('connected').textContent = account ? `Connected: ${account}` : 'Connect your browser wallet to get started.';
  $('connect').textContent = account ? `Wallet ${short(account)} ↗` : 'Connect wallet ↗';
  $('balance').textContent = '—'; $('gas').textContent = '—'; controls();
}
async function connect() {
  await onBase();
  const accounts = await window.ethereum.request({method:'eth_requestAccounts'});
  setAccount(accounts[0]); await refresh(); status('Wallet ready. Choose a recipient and amount.');
}
function errorMessage(e) { return e.code === 'ACTION_REJECTED' || e.code === 4001 ? 'Request cancelled in your wallet.' : (e.shortMessage || e.message || 'Something went wrong. Please try again.'); }
async function guarded(fn) { try { await fn(); } catch(e) { status(errorMessage(e),true); } }
async function transact(kind) {
  if (busy) return;
  busy = true; controls();
  let item;
  try {
    const provider = await onBase(); const signer = await provider.getSigner();
    setAccount(await signer.getAddress());
    let tx;
    if (kind === 'send') {
      const recipient = $('recipient').value.trim(); const amount = $('amount').value.trim();
      if (!isAddress(recipient) || recipient.toLowerCase() === ZeroAddress) throw new Error('Enter a valid, nonzero recipient address.');
      if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error('Enter a positive AUSD amount.');
      const token = new Contract(TOKEN,ABI,signer); decimals = Number(await token.decimals());
      const units = parseUnits(amount,decimals);
      if (units <= 0n) throw new Error('Amount must be greater than zero.');
      if (units > await token.balanceOf(account)) throw new Error('Not enough AUSD. Request test funds first.');
      status('Confirm the AUSD transfer in your wallet…');
      tx = await token.transfer(recipient,units);
      item = {label:`${amount} AUSD · ${short(account)} → ${short(recipient)}`};
    } else {
      status('Confirm the faucet request in your wallet…');
      tx = await new Contract(FAUCET,['function requestFunds(address)'],signer).requestFunds(account);
      item = {label:`AUSD faucet · ${short(account)}`};
    }
    Object.assign(item,{hash:tx.hash,state:'Pending',time:Date.now()}); history.unshift(item); history = history.slice(0,30); persistHistory();
    status('Transaction submitted. Waiting for Base Sepolia confirmation…');
    const receipt = await tx.wait(); item.state = receipt.status === 1 ? 'Confirmed' : 'Failed'; persistHistory();
    status('Transaction confirmed. Balances updated.'); await refresh();
  } catch(e) { if(item) { item.state = 'Check explorer'; persistHistory(); } status(errorMessage(e),true); }
  finally { busy = false; controls(); }
}
$('connect').onclick = () => guarded(connect);
$('send-form').onsubmit = (event) => { event.preventDefault(); transact('send'); };
$('mint').onclick = () => transact('mint');
$('refresh').onclick = () => guarded(async () => { await refresh(); status(account ? 'Balances refreshed.' : 'Connect your wallet first.'); });
for (const button of document.querySelectorAll('[data-amount]')) button.onclick = () => { $('amount').value = button.dataset.amount; };
for (const slot of ['a','b']) {
  const field = $(`wallet-${slot}`); field.value = localStorage.getItem(`ausd-wallet-${slot}`) || '';
  field.oninput = () => localStorage.setItem(`ausd-wallet-${slot}`,field.value.trim());
  document.querySelector(`[data-save="${slot}"]`).onclick = () => { if (!account) return status('Connect your wallet first.',true); field.value = account; field.oninput(); };
  $(`to-${slot}`).onclick = () => { if (!isAddress(field.value.trim())) return status(`Add a valid address for Wallet ${slot.toUpperCase()}.`,true); $('recipient').value = field.value.trim(); status(`Ready to send to Wallet ${slot.toUpperCase()}.`); };
}
$('swap').onclick = () => { const a = $('wallet-a'); const b = $('wallet-b'); [a.value,b.value] = [b.value,a.value]; a.oninput(); b.oninput(); };
if (window.ethereum?.on) {
  window.ethereum.on('accountsChanged', (accounts) => { setAccount(accounts[0]); if(account) guarded(refresh); });
  window.ethereum.on('chainChanged', () => { $('balance').textContent = '—'; $('gas').textContent = '—'; status('Network changed. Connect or refresh to use Base Sepolia.'); });
}
renderHistory();
