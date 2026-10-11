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

No relayer, simulated security trade, fake credit, background transfer, or server-side private key is used.

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

## Proposal-only Hermes HTTP API

`POST /api/hermes/proposals` accepts holdings, target allocations, a drift threshold, and a maximum gross AUSD buy amount. It returns a deterministic proposal and reasoning only. It never calls the x402/payment routes or submits wallet transactions.

Set `PROPOSAL_API_TOKEN` in ignored `.env`, restart the server, and authenticate with `Authorization: Bearer <token>`.

```sh
curl -X POST http://127.0.0.1:5173/api/hermes/proposals \
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
