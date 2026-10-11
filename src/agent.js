import {BrowserProvider,Contract,formatUnits,hexlify,randomBytes} from 'ethers';
import {sample,categories,parseCSV,planRebalance} from './portfolio.js';
import {TOKEN,CHAIN,ABI,types} from './payment.js';
import './agent.css';
const $=id=>document.getElementById(id),money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
let holdings=structuredClone(sample),plan=null,account=null,config={},busy=false,pending=null;
const colors={Stocks:'#486a42',Bonds:'#a5bc83',Cash:'#e0e7cd'};
const targets={Stocks:60,Bonds:30,Cash:10};
function status(msg,error=false){$('status').textContent=msg;$('status').classList.toggle('error',error);}
function event(message,hash){const div=document.createElement('div');div.className='event';const time=document.createElement('time');time.textContent=new Date().toLocaleTimeString();const text=document.createElement('div');text.textContent=message;div.append(time,text);if(hash){const a=document.createElement('a');a.href=`https://sepolia.basescan.org/tx/${hash}`;a.target='_blank';a.rel='noreferrer';a.textContent='View on Base Sepolia ↗';div.append(a);}$('feed').prepend(div);}
function lock(value){busy=value;for(const el of document.querySelectorAll('button,input,select'))el.disabled=value;
$('cancel-pending').hidden=!pending;if(!value && pending){for(const el of document.querySelectorAll('button,input,select'))el.disabled=true;$(pending.kind==='data'?'analyze':'execute').disabled=false;$('cancel-pending').disabled=false;}
}
function invalidate(){plan=null;pending=null;$('actions').hidden=true;$('proposal').textContent='Mandate changed. Run the agent to generate a new proposal.';$('plan-badge').textContent='AWAITING ANALYSIS';}
function render(){
  const total=holdings.reduce((n,r)=>n+r.quantity*r.price,0);$('total').textContent=money(total);$('holdings').replaceChildren();
  for(const row of holdings){const tr=document.createElement('tr');for(const v of [row.symbol,row.category,row.quantity.toLocaleString(),money(row.price),money(row.quantity*row.price)]){const td=document.createElement('td');td.textContent=v;tr.append(td);}$('holdings').append(tr);}
  $('allocation-bar').replaceChildren();$('legend').replaceChildren();
  let drift=0;
  for(const category of categories){const pct=total?holdings.filter(r=>r.category===category).reduce((n,r)=>n+r.quantity*r.price,0)/total*100:0;drift=Math.max(drift,Math.abs(pct-targets[category]));const bar=document.createElement('div');bar.style.width=`${pct}%`;bar.style.background=colors[category];$('allocation-bar').append(bar);const label=document.createElement('span'),dot=document.createElement('i');dot.style.background=colors[category];label.append(dot,`${category} ${pct.toFixed(1)}%`);$('legend').append(label);}
  $('drift').textContent=`${drift.toFixed(1)} pp`;$('target-sum').textContent=`Target total: ${categories.reduce((n,c)=>n+targets[c],0)}% · Must equal 100%.`;
}
for(const category of categories){const row=document.createElement('div');row.className='target-row';const label=document.createElement('label');label.textContent=category;label.htmlFor=`target-${category}`;const box=document.createElement('div'),input=document.createElement('input');input.id=label.htmlFor;input.type='number';input.min=0;input.max=100;input.step='0.1';input.value=targets[category];input.oninput=()=>{targets[category]=Number(input.value);invalidate();render();};const unit=document.createElement('span');unit.textContent='%';box.append(input,unit);row.append(label,box);$('targets').append(row);}
async function base(){if(!window.ethereum)throw new Error('Install a browser wallet to use testnet mode.');if(Number(await window.ethereum.request({method:'eth_chainId'}))!==CHAIN){try{await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x14a34'}]});}catch(e){if(e.code!==4902)throw e;await window.ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:'0x14a34',chainName:'Base Sepolia',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:['https://sepolia.base.org'],blockExplorerUrls:['https://sepolia.basescan.org']}]});await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x14a34'}]});}}if(Number(await window.ethereum.request({method:'eth_chainId'}))!==CHAIN)throw new Error('Base Sepolia required.');return new BrowserProvider(window.ethereum);}
async function balance(){if(!account)return;const provider=await base();const n=await new Contract(TOKEN,ABI,provider).balanceOf(account);$('wallet-balance').textContent=`${Number(formatUnits(n,6)).toLocaleString()} AUSD`;}
async function connect(){const provider=await base();await provider.send('eth_requestAccounts',[]);account=await(await provider.getSigner()).getAddress();$('connect').textContent=`${account.slice(0,6)}…${account.slice(-4)}`;$('wallet-status').textContent=`Connected ${account}`;await balance();}
async function post(path,data,headers={}){const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});const body=await res.json();if(!res.ok && res.status!==402)throw new Error(body.error||'Request failed.');return {code:res.status,body};}
async function paid(kind){
  if(!config.liveReady)throw new Error('Set RELAYER_PRIVATE_KEY in .env and restart the server to enable x402.');if(!account)await connect();
  const provider=await base(),signer=await provider.getSigner();
  if(!pending || pending.kind!==kind){
    const {code,body}=await post('/api/quote',{kind,holdings,targets,threshold:Number($('threshold').value)});if(code!==402)throw new Error('Expected HTTP 402 challenge.');
    event(`HTTP 402 · ${kind==='data'?'market snapshot':'rebalance execution'} requires ${formatUnits(body.accepts[0].amount,6)} AUSD.`);
    const r=body.accepts[0];
    if(r.network!=='eip155:84532'||r.asset.toLowerCase()!==TOKEN||r.payTo.toLowerCase()!==config.broker.toLowerCase())throw new Error('Unexpected payment destination.');
    const expected=kind==='data'?0.10:plan.buy+0.05;
    if(Math.abs(Number(formatUnits(r.amount,6))-expected)>0.000001)throw new Error('Unexpected payment amount.');
    const now=Math.floor(Date.now()/1000),authorization={from:await signer.getAddress(),to:r.payTo,value:r.amount,validAfter:String(now-10),validBefore:String(now+300),nonce:body.nonce||hexlify(randomBytes(32))};
    status('Approve the exact AUSD payment authorization in your wallet.');
    const signature=await signer.signTypedData({name:r.extra.name,version:r.extra.version,chainId:CHAIN,verifyingContract:TOKEN},types,authorization);
    pending={kind,id:body.quoteId,payload:{x402Version:2,resource:body.resource,accepted:r,payload:{signature,authorization}}};
    sessionStorage.setItem('agent-pending',JSON.stringify({pending,holdings,plan,targets,threshold:$('threshold').value,budget:$('budget').value,account}));event('Authorization signed · relayer covers settlement gas.');
  }
  event('Retrying paid endpoint with PAYMENT-SIGNATURE.');
  const header=btoa(JSON.stringify(pending.payload));
  const {body}=await post(`/api/paid/${pending.id}`,{}, {'PAYMENT-SIGNATURE':header});
  event('AUSD payment confirmed on Base Sepolia.',body.settlement.transaction);
  if(body.refundTransaction)event('Broker returned AUSD for simulated sells.',body.refundTransaction);
  pending=null;sessionStorage.removeItem('agent-pending');try{await balance();}catch{event('Payment confirmed; wallet balance refresh unavailable.');}return body;
}
function showPlan(){
  $('proposal').replaceChildren();$('plan-badge').textContent=plan.trades.length?'READY FOR REVIEW':'IN BALANCE';
  const summary=document.createElement('p');summary.className='hint';summary.textContent=`Largest drift is ${plan.drift.toFixed(1)} percentage points; your trigger is ${$('threshold').value}. ${plan.trades.length?'These moves restore your target allocation.':'No rebalance required.'}`;$('proposal').append(summary);
  for(const trade of plan.trades){const row=document.createElement('div');row.className='trade';const label=document.createElement('div');label.textContent=`${trade.amount>0?'Buy':'Sell'} ${trade.category}`;const note=document.createElement('small');note.textContent='Simulated category instrument';label.append(note);const amount=document.createElement('strong');amount.className=trade.amount>0?'buy':'sell';amount.textContent=`${Math.abs(trade.amount).toFixed(2)} AUSD`;row.append(label,amount);$('proposal').append(row);}
  $('costs').textContent=`Buy settlement: ${plan.buy.toFixed(2)} AUSD · Sell refund: ${plan.sell.toFixed(2)} AUSD · Execution fee: 0.05 AUSD. Gross buy amount + fee must fit your wallet and mandate. Fees are separate from the simulated portfolio.`;
  $('actions').hidden=!plan.trades.length;
}
async function analyze(){
  const local=planRebalance(holdings,targets,Number($('threshold').value));
  const budget=Number($('budget').value);if(!Number.isFinite(budget)||budget<0)throw new Error('Enter a nonnegative buy budget.');if(local.trades.length && local.buy+0.15>budget)throw new Error(`Buy amount plus data and execution fees exceeds your ${budget} AUSD mandate.`);
  event(`Observed ${holdings.length} holdings totaling ${money(local.total)}.`);
  if($('mode').value==='live')await paid('data');else event('Simulation · market snapshot uses imported prices. No payment or live data feed.');
  const response=await post('/api/plan',{holdings,targets,threshold:Number($('threshold').value)});plan=response.body;showPlan();event(`Planner found ${plan.trades.length} moves; drift ${plan.drift.toFixed(1)} pp.`);status('Review the proposed trades before approving.');
}
async function execute(){
  if(!plan?.trades.length)throw new Error('Run the agent first.');
  if(plan.buy+0.15>Number($('budget').value))throw new Error('Proposal exceeds your buy budget.');
  const live=$('mode').value==='live';
  if(live){const result=await paid('rebalance');holdings=result.plan.after;}
  else {event(`Simulation · would pay ${(plan.buy+0.05).toFixed(2)} AUSD and receive ${plan.sell.toFixed(2)} AUSD. No tokens moved.`);holdings=plan.after;}
  event('Simulated holdings updated to target allocation. No real securities traded.');plan=null;pending=null;$('actions').hidden=true;$('proposal').textContent='Rebalance complete. Run the agent again to check your allocation.';$('plan-badge').textContent='COMPLETED';render();status('Rebalance completed.');
}
async function guarded(fn){if(busy)return;lock(true);try{await fn();}catch(e){const msg=e.code==='ACTION_REJECTED'||e.code===4001?'Wallet request cancelled.':e.shortMessage||e.message;status(msg,true);event(msg);if(pending)event('Signed quote retained. Retry the same action; do not reset while settlement is pending.');}finally{lock(false);}}
$('cancel-pending').onclick=()=>guarded(async()=>{if(!pending)return;await post('/api/cancel',{id:pending.id});sessionStorage.removeItem('agent-pending');invalidate();status('Unsubmitted quote cancelled. Run the agent again.');event('Signed quote cancelled before broadcast.');});
$('connect').onclick=()=>guarded(connect);$('analyze').onclick=()=>guarded(analyze);$('execute').onclick=()=>guarded(execute);
$('import').onclick=()=>$('file').click();$('file').onchange=()=>guarded(async()=>{const file=$('file').files[0];if(!file)return;if(file.size>64000)throw new Error('CSV must be smaller than 64 KB.');holdings=parseCSV(await file.text());invalidate();render();event(`Imported ${holdings.length} holdings from CSV.`);$('file').value='';});
$('sample').onclick=()=>{holdings=structuredClone(sample);invalidate();render();event('Loaded sample portfolio.');};
for(const id of ['mode','threshold','budget'])$(id).onchange=()=>{invalidate();status($('mode').value==='live'?'Testnet mode: wallet signatures and a funded local relayer are required.':'Simulation mode: no tokens will move.');};
$('clear').onclick=()=>$('feed').replaceChildren();
if(window.ethereum?.on){window.ethereum.on('accountsChanged',accounts=>{account=accounts[0]||null;$('wallet-balance').textContent='—';$('connect').textContent=account?`${account.slice(0,6)}…${account.slice(-4)}`:'Connect wallet ↗';$('wallet-status').textContent=account||'Wallet disconnected.';});window.ethereum.on('chainChanged',()=>{$('wallet-balance').textContent='—';});}
fetch('/api/config').then(r=>r.json()).then(data=>{config=data;$('broker-status').textContent=config.liveReady?`Broker ${config.broker.slice(0,6)}…${config.broker.slice(-4)}`:'Relayer not configured · simulation available';}).catch(()=>status('Local backend unavailable. Start with npm run dev.',true));
try {const saved=JSON.parse(sessionStorage.getItem('agent-pending')||'null');if(saved){pending=saved.pending;holdings=saved.holdings;plan=saved.plan;account=saved.account;Object.assign(targets,saved.targets);for(const c of categories)$(`target-${c}`).value=targets[c];$('threshold').value=saved.threshold;$('budget').value=saved.budget;$('mode').value='live';if(plan)showPlan();lock(false);event('Recovered signed quote. Retry the same action to reconcile settlement.');}}catch {sessionStorage.removeItem('agent-pending');}
render();event('Portfolio agent ready · imported prices and simulated assets.');
