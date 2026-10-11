import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRebalancePlan, mandate, rebalancePlan, routeConfig, scaleUnitQuote, validateExecutionConfig} from '../src/rebalance.js';
import {TOKEN} from '../src/payment.js';

const enabled = {
  enabled: true,
  pair: '0x1111111111111111111111111111111111111111',
  asset: '0x2222222222222222222222222222222222222222',
  ausd: '0xa9012a055bd4e0edff8ce09f960291c09d5322dc',
  verification: true,
};

test('blocks execution until an attested route is configured', () => {
  const result = validateExecutionConfig({...enabled, verification: false});
  assert.equal(result.ready, false);
  assert.match(result.reason, /not verified/i);
});

test('plans an AUSD-to-asset rebalance without spending the protected reserve', () => {
  const plan = buildRebalancePlan({
    ausdBalance: 1_000_000_000n,
    assetBalance: 0n,
    assetValueInAusd: 0n,
    targetAusdWeight: 20,
    driftThreshold: 2,
    protectedReserve: 200_000_000n,
    perRunCap: 500_000_000n,
  });
  assert.equal(plan.direction, 'AUSD_TO_ASSET');
  assert.equal(plan.ausdNotional, 500_000_000n);
  assert.equal(plan.blocked, false);
});

test('blocks a plan whose required AUSD spend would cross the reserve', () => {
  const plan = buildRebalancePlan({
    ausdBalance: 400_000_000n,
    assetBalance: 0n,
    assetValueInAusd: 0n,
    targetAusdWeight: 10,
    driftThreshold: 1,
    protectedReserve: 300_000_000n,
    perRunCap: 500_000_000n,
  });
  assert.equal(plan.blocked, true);
  assert.match(plan.reason, /reserve/i);
});

test('does not create a trade when allocation drift is within threshold', () => {
  const plan = buildRebalancePlan({
    ausdBalance: 500_000_000n,
    assetBalance: 500_000_000n,
    assetValueInAusd: 500_000_000n,
    targetAusdWeight: 50,
    driftThreshold: 2,
    protectedReserve: 100_000_000n,
    perRunCap: 500_000_000n,
  });
  assert.equal(plan.direction, 'NONE');
  assert.equal(plan.blocked, false);
});

test('requires explicit router and token allowlists before wallet execution', () => {
  const router = '0x1111111111111111111111111111111111111111';
  const asset = '0x2222222222222222222222222222222222222222';
  assert.equal(routeConfig({}).ready, false);
  const whitelister = '0x3333333333333333333333333333333333333333';
  const config = routeConfig({VITE_REBALANCE_ROUTER:router,VITE_REBALANCE_ASSET:asset,VITE_REBALANCE_WHITELISTER:whitelister,VITE_REBALANCE_ROUTER_ALLOWLIST:router,VITE_REBALANCE_TOKEN_ALLOWLIST:`${TOKEN},${asset}`,VITE_REBALANCE_QUOTE_TTL_SECONDS:'60'});
  assert.equal(config.ready, true);
  assert.equal(config.chainId, 11155111);
  assert.match(routeConfig({VITE_REBALANCE_ROUTER:router,VITE_REBALANCE_ASSET:asset,VITE_REBALANCE_WHITELISTER:whitelister,VITE_REBALANCE_ROUTER_ALLOWLIST:asset,VITE_REBALANCE_TOKEN_ALLOWLIST:`${TOKEN},${asset}`}).reason,/ALLOWLIST/);
});

test('wallet policy enforces cap, reserve, target weight, and drift threshold', () => {
  const policy = mandate({reserve:'100',targetAsset:'50',threshold:'2',runCap:'300',slippageBps:'50'});
  const buy = rebalancePlan({ausd:1000,assetValueAusd:0,policy});
  assert.equal(buy.action, 'buy');
  assert.equal(buy.amountAusd, 300);
  const blocked = rebalancePlan({ausd:100,assetValueAusd:0,policy});
  assert.equal(blocked.action, 'blocked');
  const balanced = rebalancePlan({ausd:500,assetValueAusd:500,policy});
  assert.equal(balanced.action, 'none');
});

test('values a large wallet balance from a small executable unit quote', () => {
  const walletCtk = 20_000n * 10n ** 18n;
  const oneCtk = 10n ** 18n;
  const oneCtkInAusd = 1_000_000n;
  assert.equal(scaleUnitQuote(walletCtk, oneCtk, oneCtkInAusd), 20_000n * 1_000_000n);
});
