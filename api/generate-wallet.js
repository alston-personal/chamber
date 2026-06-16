/**
 * One-time script: Generate a new ETH wallet for Chamber Protocol
 * Run: node generate-wallet.js
 * Copy the output into .env
 */
const { ethers } = require("ethers");
const crypto = require("crypto");

const wallet = ethers.Wallet.createRandom();
const hashSecret = crypto.randomBytes(16).toString("hex");

console.log("=".repeat(60));
console.log("🔐 Chamber Protocol - New Custodial Wallet Generated");
console.log("=".repeat(60));
console.log();
console.log("Copy these values into your .env file:");
console.log();
console.log(`CHAMBER_WALLET_ADDRESS=${wallet.address}`);
console.log(`CHAMBER_WALLET_PRIVATE_KEY=${wallet.privateKey}`);
console.log(`CHAMBER_HASH_SECRET=${hashSecret}`);
console.log();
console.log("=".repeat(60));
console.log("⚠️  BACKUP YOUR MNEMONIC (store safely offline):");
console.log(`MNEMONIC: ${wallet.mnemonic.phrase}`);
console.log("=".repeat(60));
console.log();
console.log("Next steps:");
console.log("1. Save the MNEMONIC phrase in a safe place");
console.log("2. Copy the 3 env vars above into api/.env");
console.log("3. Start the server: pm2 start server.js --name chamber-api");
