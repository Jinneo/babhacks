import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStrategy, COIN_LIBRARY, deriveInvestorMandate} from '../src/advisor.js';

test('ships 50 unique, bounded coin profiles', () => {
  assert.equal(COIN_LIBRARY.length,50);
  assert.equal(new Set(COIN_LIBRARY.map(asset=>asset.symbol)).size,50);
  assert.ok(COIN_LIBRARY.every(asset=>['risk','volatility','liquidity','maturity','confidence','upside'].every(key=>asset[key]>=0&&asset[key]<=100)));
});

test('derives a more defensive mandate from a low loss tolerance', () => {
  const defensive = deriveInvestorMandate({goal:'preserve',maxDrawdown:5,horizonMonths:3,minimumAusd:20,regime:'normal'});
  const growth = deriveInvestorMandate({goal:'growth',maxDrawdown:30,horizonMonths:60,minimumAusd:10,regime:'normal',allowSpeculative:true});
  assert.ok(defensive.riskScore < growth.riskScore);
  assert.ok(defensive.ausdTarget > growth.ausdTarget);
});

test('produces an allocation that totals 100 and respects caps', () => {
  const strategy = buildStrategy({goal:'growth',maxDrawdown:30,horizonMonths:60,minimumAusd:10,maximumAssetWeight:30,speculativeLimit:12,allowSpeculative:true,coins:['BTC','ETH','SOL','LINK']});
  assert.equal(strategy.allocation.reduce((sum,row)=>sum+row.weight,0),100);
  assert.ok(strategy.allocation.every(row=>row.symbol==='AUSD'||row.weight<=30));
  assert.ok(strategy.allocation.filter(row=>['SOL','LINK'].includes(row.symbol)).reduce((sum,row)=>sum+row.weight,0)<=12);
  assert.equal(strategy.paymentsExecuted,false);
});

test('reallocates speculative overflow to uncapped core assets before AUSD', () => {
  const strategy = buildStrategy({goal:'growth',maxDrawdown:30,horizonMonths:60,minimumAusd:15,maximumAssetWeight:30,speculativeLimit:10,allowSpeculative:true,regime:'volatile',coins:['BTC','ETH','SOL','LINK']});
  assert.ok(Math.abs(strategy.allocation[0].weight-strategy.mandate.ausdTarget)<=.1);
  assert.equal(strategy.allocation.filter(row=>['SOL','LINK'].includes(row.symbol)).reduce((sum,row)=>sum+row.weight,0),10);
});

test('excludes speculative assets unless explicitly allowed', () => {
  const strategy = buildStrategy({coins:['BTC','SOL'],allowSpeculative:false});
  assert.deepEqual(strategy.diagnostics.eligibleCoins,['BTC']);
  assert.equal(strategy.allocation.some(row=>row.symbol==='SOL'),false);
});

test('widens the drift threshold and raises AUSD in risk-off conditions', () => {
  const normal = buildStrategy({coins:['BTC','ETH'],regime:'normal'});
  const riskOff = buildStrategy({coins:['BTC','ETH'],regime:'risk_off'});
  assert.ok(riskOff.allocation[0].weight > normal.allocation[0].weight);
  assert.ok(riskOff.controls.driftThreshold > normal.controls.driftThreshold);
});

test('rejects a universe with no eligible risk asset', () => {
  assert.throws(()=>buildStrategy({coins:['SOL'],allowSpeculative:false}),/outside the speculative policy/);
});

test('uses validated live research metrics and preserves citations', () => {
  const researchSnapshot={asOf:new Date().toISOString(),summary:'Live test snapshot',assets:[{symbol:'BTC',risk:35,volatility:40,liquidity:99,confidence:96,upside:55}],citations:[{title:'Source',url:'https://example.com',supports:'metrics'}],warnings:[]};
  const strategy=buildStrategy({coins:['BTC'],researchSnapshot});
  assert.equal(strategy.research.live,true);
  assert.equal(strategy.research.citations[0].url,'https://example.com');
  assert.equal(strategy.research.summary,'Live test snapshot');
});

test('rejects malformed live research scores', () => {
  const researchSnapshot={assets:[{symbol:'BTC',risk:999,volatility:40,liquidity:99,confidence:96,upside:55}]};
  assert.throws(()=>buildStrategy({coins:['BTC'],researchSnapshot}),/invalid metrics/);
});

test('diversification priority spreads a broad bag across many coins', () => {
  const strategy=buildStrategy({priority:'diversification',maximumAssetWeight:20,coins:['BTC','ETH','ADA','BNB','XRP','LTC','XLM','TRX']});
  const riskAssets=strategy.allocation.filter(asset=>asset.symbol!=='AUSD');
  assert.equal(riskAssets.length,8);
  assert.ok(Math.max(...riskAssets.map(asset=>asset.weight))<=strategy.diagnostics.effectiveAssetCap+.1);
  assert.ok(strategy.diagnostics.effectiveAssetCap<20);
});
