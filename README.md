# AUSD transfer playground

A local browser UI for real AUSD test-token transfers on Base Sepolia (chain ID 84532).

## Run

```sh
npm install
npm run dev
```

Open http://localhost:5173 in a browser with MetaMask or another injected Ethereum wallet.

## Test back and forth

1. Create two test wallet accounts (A and B) in your browser wallet.
2. Connect account A. The app requests Base Sepolia and adds the network if needed.
3. Use the ETH faucet link to fund both accounts with Base Sepolia ETH for gas.
4. Click **Request 10,000 AUSD** and confirm the faucet transaction.
5. Save account A with **Use mine**. Switch your wallet to account B and save B with **Use mine**.
6. Switch to A, click **Send to B**, enter an amount, and confirm **Send AUSD**.
7. Switch to B and click **Send to A** to send it back.

Balances come from the connected wallet's RPC. Activity and address slots are saved in this browser's localStorage. Private keys stay in your wallet. Each transfer requires wallet approval and test ETH. This first version uses ERC-20 transfers; gasless ERC-3009 and x402 are not implemented yet.

## Contracts

- AUSD: `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`
- Faucet: `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C`, using `requestFunds(address)`
- [Agora deployments](https://docs.agora.finance/developer/contract-deployments)
- [Agora faucet guide](https://docs.agora.finance/instant-settlement/guides/getting-testnet-tokens)

The UI runs locally; transactions are submitted to the public Base Sepolia testnet, not a local blockchain.
