import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthorization, validateResearchPaymentQuote, X402_RESEARCH_PRICE_ATOMIC } from '../src/x402.js';
import { CHAIN, TOKEN } from '../src/payment.js';

const quote = {x402Version:2,quoteId:'quote',nonce:`0x${'11'.repeat(32)}`,resource:{url:'http://localhost/api/paid/quote'},accepts:[{scheme:'exact',network:`eip155:${CHAIN}`,amount:X402_RESEARCH_PRICE_ATOMIC.toString(),asset:TOKEN,payTo:`0x${'22'.repeat(20)}`,extra:{name:'AUSD',version:'1'}}]};

test('accepts a capped Base Sepolia AUSD x402 research quote',()=>{
  const result=validateResearchPaymentQuote(quote);
  assert.equal(result.amount,X402_RESEARCH_PRICE_ATOMIC);
});

test('rejects an x402 research quote above the safety cap',()=>{
  assert.throws(()=>validateResearchPaymentQuote({...quote,accepts:[{...quote.accepts[0],amount:'100001'}]}),/safety cap/i);
});

test('builds a short-lived replay-resistant payment authorization',()=>{
  const authorization=buildAuthorization({payer:`0x${'33'.repeat(20)}`,accepted:quote.accepts[0],nonce:quote.nonce,now:1000});
  assert.deepEqual(authorization,{from:`0x${'33'.repeat(20)}`,to:quote.accepts[0].payTo,value:'100000',validAfter:'995',validBefore:'1240',nonce:quote.nonce});
});
