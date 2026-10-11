https://x.com/BagBalancer

# AUSD Ethereum Sepolia Rebalancer

A local wallet-first MVP for planning and executing a protected AUSD/CTK rebalance through Agora's canonical Instant Settlement pair on Ethereum Sepolia. It never manufactures a success state: balances are read from the connected wallet, and a completed rebalance is shown only after an on-chain receipt has `status === 1`.

The original AUSD faucet and transfer playground is unchanged at `/transfer.html`.

## Run locally

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Use a browser wallet on Ethereum Sepolia. The configured Agora test contracts are:

- AUSD: `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`
- CTK: `0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D`
- AUSD/CTK pair: `0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae`
- Testnet whitelister: `0x7c10F56d6f04a51376393a1C3670e966863F6BD5`
- AUSD faucet: `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C`
- CTK faucet: `0xf8A143b3406faF59FD9A34891076104B10200B1D`

You need Ethereum Sepolia ETH for gas and at least one of the test tokens. Follow Agora's test-token guide linked below. Do not put a private key in `.env`; all transactions are initiated and confirmed in the connected browser wallet.

## Rebalancing safety controls

The main page reads the connected wallet's AUSD balance and, only when an adapter is enabled, the configured allowlisted asset balance. A plan enforces:

- AUSD target weight and drift threshold
- protected AUSD reserve
- per-run AUSD notional cap
- one allowlisted asset and one allowlisted direct-pair contract
- a quote that expires after 90 seconds
- user-selected maximum slippage, capped at 10%
- a fresh quote immediately before the pair swap

The only execution flow is direct, wallet-confirmed on-chain calls:

1. Read the pair quote from chain.
2. If needed, request an ERC-20 approval to the allowlisted pair.
3. Re-quote and request `swapExactTokensForTokens` on that pair.
4. Wait for a successful Ethereum Sepolia receipt, then re-read balances.

No relayer, simulated security trade, fake credit, background transfer, or server-side private key is used for portfolio swaps. The optional x402 research-payment service uses a separate Base Sepolia relayer that cannot execute portfolio trades.

## Route configuration

The checked-in example uses Agora's published Ethereum Sepolia AUSD/CTK pair. Copy `.env.example` to the ignored `.env`, preserving any existing `PROPOSAL_API_TOKEN`. These public values enable the route:

```dotenv
VITE_REBALANCE_ROUTER=0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae
VITE_REBALANCE_ASSET=0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D
VITE_REBALANCE_WHITELISTER=0x7c10F56d6f04a51376393a1C3670e966863F6BD5
VITE_REBALANCE_ROUTER_ALLOWLIST=0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae
VITE_REBALANCE_TOKEN_ALLOWLIST=0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC,0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D
VITE_REBALANCE_QUOTE_TTL_SECONDS=60
VITE_REBALANCE_CHAIN_ID=11155111
VITE_REBALANCE_NETWORK_NAME=Ethereum Sepolia
VITE_REBALANCE_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
VITE_REBALANCE_EXPLORER_URL=https://sepolia.etherscan.io
```

On the first rebalance, the wallet may request up to three Ethereum Sepolia transactions: self-allowlist as a testnet swapper, exact ERC-20 approval, then the swap. Later swaps normally need only approval (when the prior exact allowance has been consumed) and the swap. The UI checks the connected chain, deployed bytecode, pair tokens, explicit allowlists, quote expiry, reserve, cap, and slippage before execution.

If the route is missing or not attested, the Rebalance button remains disabled and the UI says why. This is intentional.

## Test and build

```sh
npm test
npm run build
```

## Proposal-only research API

### Live-researched goal-based strategy

The Strategy Lab runs fresh web research for every submission. The local research agent receives the questionnaire answers and selected coins, assesses current market conditions and every selected asset, and returns timestamped scores, a market-regime assessment, explanations, and source links. Those validated research inputs feed the allocation engine; no research response can directly execute a payment or wallet transaction.

The research CLI must be installed, authenticated, and able to use its web tools. Set `RESEARCH_AGENT_BIN` in the ignored `.env` file:

```dotenv
RESEARCH_AGENT_BIN=/absolute/path/to/local-research-agent
```

Open the local UI and submit the Strategy Lab form. The browser calls `POST /api/research-strategy`, which is intentionally available only through this localhost app. A run commonly takes around a minute. The server accepts only complete HTTPS-cited research produced within the last 24 hours; malformed, incomplete, stale, concurrent, or timed-out runs fail closed and do not generate a strategy.

The response remains proposal-only: `mode` is `proposal_only`, `paymentsExecuted` is `false`, and the user must separately choose whether to apply the suggested portfolio. Applying a proposal updates the on-page allocation chart but cannot move assets—the wallet flow still requires a fresh verified AUSD/CTK quote and explicit wallet approval.

### Optional x402 research payment

When x402 settlement is configured, the existing **Research + balance my bag** action first requests a payment quote capped at `0.10` test AUSD on Base Sepolia. The wallet briefly switches networks, signs an EIP-3009 authorization, the local relayer settles it, and the wallet returns to its previous network before the normal research flow continues. A small explorer-linked receipt appears with the proposal. Portfolio rebalancing remains a separate Ethereum Sepolia action requiring its own wallet approval.

Set these only in ignored `.env`:

```dotenv
BASE_SEPOLIA_RPC=https://sepolia.base.org
RELAYER_PRIVATE_KEY=0x...
```

The relayer needs Base Sepolia ETH for gas. The paying wallet needs at least `0.10` Base Sepolia test AUSD. If the relayer is not configured, research continues exactly as before and the UI labels the feature `x402-ready` without claiming that a payment occurred.

### Deterministic strategy API

`POST /api/strategy` turns conversational investor preferences into a proposal-only, multi-coin allocation. The same deterministic engine powers the Strategy Lab on the main page. It combines goal, loss tolerance, time horizon, and speculative preference into a risk score, then applies:

- a minimum and model-derived AUSD reserve
- confidence, liquidity, maturity, volatility, and correlation adjustments
- maximum per-coin and aggregate speculative caps
- wider no-trade bands during volatile or risk-off regimes
- illustrative crash, sideways, and rally sensitivity tests
- mandatory disclosure that this API route uses bundled research metadata rather than live research

The shared library contains 50 profiles: AUSD plus 49 searchable crypto assets across store-of-value, smart-contract, payments, DeFi, infrastructure, data, compute, gaming, identity, interoperability, and meme categories. It is a supported universe, not a claim that these are the current top 50 by market capitalization. The live Strategy Lab overlays fresh market research on these profiles; this deterministic API uses the curated values. Recommendations do not make those assets executable: the wallet adapter remains limited to the separately verified AUSD/CTK Ethereum Sepolia route.

```sh
curl -X POST http://127.0.0.1:5173/api/strategy \
  -H "Authorization: Bearer $PROPOSAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "goal":"balanced",
    "horizonMonths":36,
    "maxDrawdown":15,
    "minimumAusd":20,
    "maximumAssetWeight":20,
    "speculativeLimit":10,
    "maximumSpending":500,
    "allowSpeculative":false,
    "approvalRequired":true,
    "priority":"diversification",
    "regime":"normal",
    "frequency":"monthly",
    "coins":["BTC","ETH"]
  }'
```

The response includes the derived mandate, allocation, explanations, scenario sensitivities, research confidence, and execution controls. `mode` is always `proposal_only` and `paymentsExecuted` is always `false`.

### Holdings-to-target rebalance

`POST /api/proposals` accepts holdings, target allocations, a drift threshold, and a maximum gross AUSD buy amount. It returns a deterministic proposal and reasoning only. It never calls the x402/payment routes or submits wallet transactions.

Set `PROPOSAL_API_TOKEN` in ignored `.env`, restart the server, and authenticate with `Authorization: Bearer <token>`.

```sh
curl -X POST http://127.0.0.1:5173/api/proposals \
  -H "Authorization: Bearer $PROPOSAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "holdings": [
      {"symbol":"VTI","category":"Stocks","quantity":30,"price":250},
      {"symbol":"BND","category":"Bonds","quantity":20,"price":75},
      {"symbol":"AUSD","category":"Cash","quantity":1000,"price":1}
    ],
    "targetAllocations":{"Stocks":60,"Bonds":30,"Cash":10},
    "driftThreshold":2,
    "maximumSpending":2000
  }'
```

The fixed categories are `Stocks`, `Bonds`, and `Cash`; targets must total 100. `executable` means the proposed gross buys fit the spending limit—it does not execute them. `paymentsExecuted` is always `false` on this route.

## Limits

- Execution supports exactly one direct AUSD/asset pair; it does not route through arbitrary routers or multi-hop paths.
- Asset valuation uses that pair's on-chain quote, not an external price oracle. It is suitable only for a testnet MVP.
- Browser wallets can reject, replace, or leave transactions pending. The UI does not call those outcomes successful.
- Test tokens have no monetary value.

## Sources

- Agora contract deployments: https://docs.agora.finance/developer/contract-deployments
- Agora testnet tokens guide: https://docs.agora.finance/instant-settlement/guides/getting-testnet-tokens
- Agora Instant Settlement deployments: https://docs.agora.finance/instant-settlement/protocol-deployments
- Agora swap guide: https://docs.agora.finance/instant-settlement/guides/executing-swap
