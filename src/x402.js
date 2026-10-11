import { BrowserProvider, Contract, formatUnits } from 'ethers';
import { CHAIN, TOKEN, types } from './payment.js';

export const X402_RESEARCH_PRICE_ATOMIC = 100_000n;
export const X402_CHAIN_HEX = `0x${CHAIN.toString(16)}`;
export const X402_EXPLORER = 'https://sepolia.basescan.org';
const BALANCE_ABI = ['function balanceOf(address) view returns(uint256)'];

export function validateResearchPaymentQuote(quote, maximum = X402_RESEARCH_PRICE_ATOMIC) {
  if (quote?.x402Version !== 2 || !quote.quoteId || !quote.nonce || !quote.resource) throw new Error('The x402 research quote is incomplete.');
  const accepted = quote.accepts?.[0];
  if (!accepted || accepted.scheme !== 'exact' || accepted.network !== `eip155:${CHAIN}`) throw new Error('The x402 quote uses an unsupported payment method or network.');
  if (String(accepted.asset).toLowerCase() !== TOKEN.toLowerCase()) throw new Error('The x402 quote requested an unexpected payment token.');
  const amount = BigInt(accepted.amount);
  if (amount <= 0n || amount > maximum) throw new Error('The x402 research price exceeds the 0.10 AUSD safety cap.');
  if (!/^0x[a-fA-F0-9]{40}$/.test(accepted.payTo)) throw new Error('The x402 payment recipient is invalid.');
  if (!/^0x[a-fA-F0-9]{64}$/.test(quote.nonce)) throw new Error('The x402 payment nonce is invalid.');
  return { accepted, amount };
}

export function buildAuthorization({ payer, accepted, nonce, now = Math.floor(Date.now() / 1000) }) {
  return { from:payer, to:accepted.payTo, value:String(accepted.amount), validAfter:String(now - 5), validBefore:String(now + 240), nonce };
}

async function switchToBaseSepolia(ethereum) {
  try { await ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:X402_CHAIN_HEX}]}); }
  catch(error) {
    if ((error.code ?? error.data?.originalError?.code) !== 4902) throw error;
    await ethereum.request({method:'wallet_addEthereumChain',params:[{chainId:X402_CHAIN_HEX,chainName:'Base Sepolia',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:['https://sepolia.base.org'],blockExplorerUrls:[X402_EXPLORER]}]});
    await ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:X402_CHAIN_HEX}]});
  }
}

export async function payForResearch({ ethereum = globalThis.window?.ethereum, fetcher = globalThis.fetch, onProgress = () => {} } = {}) {
  if (!ethereum) throw new Error('A browser wallet is required for the x402 test payment.');
  onProgress('Requesting a capped x402 research quote…');
  const quoteResponse = await fetcher('/api/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'data'})});
  const quote = await quoteResponse.json();
  if (quoteResponse.status !== 402) throw new Error(quote.error || 'The x402 service did not return a payment quote.');
  const {accepted,amount} = validateResearchPaymentQuote(quote);
  const originalChain = await ethereum.request({method:'eth_chainId'});
  try {
    onProgress('Switching briefly to Base Sepolia for the test payment…');
    await switchToBaseSepolia(ethereum);
    await ethereum.request({method:'eth_requestAccounts'});
    const provider = new BrowserProvider(ethereum), signer = await provider.getSigner(), payer = await signer.getAddress();
    const balance = await new Contract(TOKEN,BALANCE_ABI,provider).balanceOf(payer);
    if (balance < amount) throw new Error(`You need ${formatUnits(amount,6)} test AUSD on Base Sepolia for this research payment.`);
    const authorization = buildAuthorization({payer,accepted,nonce:quote.nonce});
    const domain = {name:accepted.extra?.name,version:accepted.extra?.version,chainId:CHAIN,verifyingContract:TOKEN};
    onProgress(`Approve ${formatUnits(amount,6)} test AUSD for live research…`);
    const signature = await signer.signTypedData(domain,types,authorization);
    const payload = {x402Version:2,resource:quote.resource,accepted,payload:{signature,authorization}};
    const encoded = globalThis.btoa(JSON.stringify(payload));
    onProgress('Settling the x402 test payment…');
    const paidResponse = await fetcher(`/api/paid/${quote.quoteId}`,{method:'POST',headers:{'Content-Type':'application/json','PAYMENT-SIGNATURE':encoded},body:'{}'});
    const paid = await paidResponse.json();
    if (!paidResponse.ok || !paid.settlement?.success) throw new Error(paid.error || 'The x402 test payment did not settle.');
    return {amountAusd:Number(formatUnits(amount,6)),transaction:paid.settlement.transaction,network:'Base Sepolia',explorerUrl:`${X402_EXPLORER}/tx/${paid.settlement.transaction}`};
  } finally {
    if (originalChain && originalChain.toLowerCase() !== X402_CHAIN_HEX.toLowerCase()) {
      try { await ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:originalChain}]}); } catch {}
    }
  }
}
