import http from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createServer as createViteServer} from 'vite';
import {JsonRpcProvider,Wallet,Contract,parseUnits,Signature,verifyTypedData,TypedDataEncoder} from 'ethers';
import {TOKEN,CHAIN,ABI,types} from './src/payment.js';
import {planRebalance} from './src/portfolio.js';
if(existsSync('.env')) for(const line of readFileSync('.env','utf8').split('\n')) {const m=line.match(/^([A-Z_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim();}
const rpc=new JsonRpcProvider(process.env.BASE_SEPOLIA_RPC||'https://sepolia.base.org',CHAIN,{staticNetwork:true});
const wallet=process.env.RELAYER_PRIVATE_KEY ? new Wallet(process.env.RELAYER_PRIVATE_KEY,rpc) : null;
const token=wallet ? new Contract(TOKEN,ABI,wallet) : null;
mkdirSync('.local',{recursive:true});
const journal='.local/settlements.json';
const quotes=new Map(existsSync(journal)?JSON.parse(readFileSync(journal,'utf8')):[]);
for(const q of quotes.values())q.promise=false;
function save(){writeFileSync(journal+'.tmp',JSON.stringify([...quotes]),{mode:0o600});renameSync(journal+'.tmp',journal);}
let settling=false;
const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64');
async function domain() {
  let name,version;
  try {const d=await token.eip712Domain();name=d[1];version=d[2];}catch{ name=await token.name();version='1'; }
  const d={name,version,chainId:CHAIN,verifyingContract:TOKEN};
  if(TypedDataEncoder.hashDomain(d)!==await token.DOMAIN_SEPARATOR())throw new Error('AUSD signing domain could not be verified.');
  if(Number(await token.decimals())!==6)throw new Error('Unexpected AUSD decimals.');return d;
}
function send(res,code,data,headers={}) {res.writeHead(code,{'Content-Type':'application/json',...headers});res.end(JSON.stringify(data));}
async function body(req){let s='';for await(const chunk of req){s+=chunk;if(s.length>64000)throw new Error('Request too large.');}return JSON.parse(s||'{}');}
const vite=await createViteServer({server:{middlewareMode:true},appType:'mpa'});
const server=http.createServer(async(req,res)=>{
  if(!req.url.startsWith('/api/'))return vite.middlewares(req,res);
  // Local demo signer must not be exposed to cross-origin requests.
  if(req.headers.origin && !['http://127.0.0.1:5173','http://localhost:5173'].includes(req.headers.origin))return send(res,403,{error:'Local origin required.'});
  try {
    const path=new URL(req.url,'http://localhost:5173').pathname;
    if(path==='/api/config'&&req.method==='GET')return send(res,200,{liveReady:!!wallet,broker:wallet?.address,network:CHAIN});
    if(req.method!=='POST')return send(res,405,{error:'POST required.'});
    const input=await body(req);
    if(path==='/api/cancel') {
      const q=quotes.get(input.id);
      if(q?.tx||q?.promise)return send(res,409,{error:'Payment submitted. Retry the original action to reconcile it.'});
      quotes.delete(input.id);save();return send(res,200,{cancelled:true});
    }
    if(path==='/api/plan') return send(res,200,planRebalance(input.holdings,input.targets,input.threshold));
    if(path==='/api/quote') {
      if(!wallet)return send(res,503,{error:'Configure RELAYER_PRIVATE_KEY in .env to enable testnet x402 settlement.'});
      const kind=input.kind;if(!['data','rebalance'].includes(kind))throw new Error('Unknown service.');
      const plan=kind==='rebalance'?planRebalance(input.holdings,input.targets,input.threshold):null;
      if(plan && !plan.trades.length)throw new Error('No trades required.');
      const amount=kind==='data'?'0.10':(plan.buy+0.05).toFixed(2);
      const d=await domain(),nonce='0x'+randomBytes(32).toString('hex'),id=randomBytes(16).toString('hex');
      const accepted={scheme:'exact',network:'eip155:84532',amount:parseUnits(amount,6).toString(),asset:TOKEN,payTo:wallet.address,maxTimeoutSeconds:300,extra:{name:d.name,version:d.version,assetTransferMethod:'eip3009'}};
      const required={x402Version:2,resource:{url:`http://localhost:5173/api/paid/${id}`,description:kind==='data'?'Demo market snapshot':'Simulated rebalance settlement',mimeType:'application/json'},accepts:[accepted]};
      for(const [key,q] of quotes)if(q.expires<Date.now()&&!q.promise&&!q.tx)quotes.delete(key);
      if(quotes.size>200)throw new Error('Too many active quotes. Try later.');
      quotes.set(id,{required,plan,kind,nonce,domain:d,expires:Date.now()+300000});save();
      return send(res,402,{...required,quoteId:id,nonce,refund:plan?.sell||0},{'PAYMENT-REQUIRED':encode(required)});
    }
    if(path.startsWith('/api/paid/')) {
      const q=quotes.get(path.split('/').pop());if(!q)throw new Error('Quote not found.');
      if(!req.headers['payment-signature'])return send(res,402,q.required,{'PAYMENT-REQUIRED':encode(q.required)});
      const payment=JSON.parse(Buffer.from(req.headers['payment-signature'],'base64').toString());const a=payment.payload?.authorization,r=q.required.accepts[0];
      if(payment.x402Version!==2||JSON.stringify(payment.accepted)!==JSON.stringify(r)||payment.resource?.url!==q.required.resource.url||!a||a.nonce!==q.nonce||a.to.toLowerCase()!==r.payTo.toLowerCase()||a.value!==r.amount)throw new Error('Payment does not match this quote.');
      if(verifyTypedData(q.domain,types,a,payment.payload.signature).toLowerCase()!==a.from.toLowerCase())throw new Error('Invalid payer signature.');
      if(q.result)return send(res,200,q.result,{'PAYMENT-RESPONSE':encode(q.result.settlement)});
      if(q.promise)return send(res,409,{error:'Settlement in progress. Retry the same signed quote.'});
      const now=Math.floor(Date.now()/1000);
      if(!q.tx && (q.expires<Date.now()||Number(a.validAfter)>now||Number(a.validBefore)<now+15||Number(a.validBefore)>now+360))throw new Error('Quote or authorization expired.');
      if(settling)return send(res,409,{error:'Broker is busy. Retry this quote shortly.'});
      if(Number((await rpc.getNetwork()).chainId)!==CHAIN)throw new Error('RPC must point to Base Sepolia.');
      settling=true;q.promise=true;
      try {
        const args=[a.from,a.to,a.value,a.validAfter,a.validBefore,a.nonce,...(()=>{const s=Signature.from(payment.payload.signature);return [s.v,s.r,s.s];})()];
        if(!q.tx){
          if(q.plan && await token.balanceOf(wallet.address)+BigInt(a.value)<parseUnits(q.plan.sell.toFixed(2),6))throw new Error('Broker needs more test AUSD to fund sell refunds.');
          await token.transferWithAuthorization.staticCall(...args);
          const tx=await token.transferWithAuthorization(...args);q.tx=tx.hash;save();
        }
        const receipt=await rpc.waitForTransaction(q.tx,1,90000);if(!receipt||receipt.status!==1)throw new Error('Payment confirmation pending or failed. Retry this same quote.');
        if(q.plan?.sell){if(!q.refundTx){const tx=await token.transfer(a.from,parseUnits(q.plan.sell.toFixed(2),6));q.refundTx=tx.hash;save();}
          const refund=await rpc.waitForTransaction(q.refundTx,1,90000);if(!refund||refund.status!==1)throw new Error('Sell refund confirmation pending. Retry this same quote.');}
        const settlement={success:true,transaction:q.tx,network:'eip155:84532',payer:a.from};
        q.result={settlement,refundTransaction:q.refundTx,plan:q.plan,snapshot:q.kind==='data'?{source:'Demo snapshot — imported prices',asOf:new Date().toISOString()}:null};
        save();return send(res,200,q.result,{'PAYMENT-RESPONSE':encode(settlement)});
      }finally{settling=false;q.promise=false;}
    }
    send(res,404,{error:'Not found.'});
  }catch(e){send(res,400,{error:e.shortMessage||e.message});}
});
server.listen(5173,'127.0.0.1',()=>console.log('Portfolio Agent: http://127.0.0.1:5173'));
