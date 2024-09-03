import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as web3 from "@solana/web3.js";
import assert from "assert";

describe("Asset Vault Program", () => {
  let vaultDataPDA;
  let vaultTokenAccount;
  let mint;
  let bump;
  let userTokenAccount;
  const user = new web3.Keypair();

  it("Initializes the vault", async () => {
    try {
      // Calcula correctamente la PDA para vault data
      [vaultDataPDA, bump] = await web3.PublicKey.findProgramAddress(
        [Buffer.from("vault")],
        pg.program.programId
      );
      console.log(
        "Calculated PDA for vault data:",
        vaultDataPDA.toString(),
        "with bump:",
        bump
      );

      // Simula la transacción para ver posibles errores antes de ejecutarla
      const simulatedResult = await pg.program.methods
        .initializeVault()
        .accounts({
          vaultData: vaultDataPDA,
          manager: pg.wallet.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .simulate(); // Simulación de la transacción

      // Envía la transacción real solo si la simulación pasa
      const txHash = await pg.program.methods
        .initializeVault()
        .accounts({
          vaultData: vaultDataPDA,
          manager: pg.wallet.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();

      console.log(`Use 'solana confirm -v ${txHash}' to see the logs`);
      await pg.connection.confirmTransaction(txHash);
      console.log("Vault initialized successfully.");
    } catch (error) {
      console.error("Error during vault initialization:", error);
      if (error.logs) {
        console.error("Transaction logs:", error.logs);
      }
      throw error; // Re-throw the error to ensure the test fails as expected
    }
  });

  it("Deposits tokens into the vault", async () => {
    [vaultDataPDA, bump] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("vault")],
      pg.program.programId
    );
    console.log(
      "Corrected PDA calculated for vault data:",
      vaultDataPDA.toString(),
      "with bump:",
      bump
    );

    mint = await createMint(
      pg.connection,
      pg.wallet.keypair,
      pg.wallet.publicKey,
      null,
      9
    );
    console.log("Mint created:", mint.toString());

    vaultTokenAccount = await getOrCreateAssociatedTokenAccount(
      pg.connection,
      pg.wallet.keypair,
      mint,
      vaultDataPDA,
      true
    );
    console.log(
      "Vault Token Account created:",
      vaultTokenAccount.address.toString()
    );

    userTokenAccount = await getOrCreateAssociatedTokenAccount(
      pg.connection,
      pg.wallet.keypair,
      mint,
      user.publicKey
    );
    console.log(
      "User Token Account created:",
      userTokenAccount.address.toString()
    );

    await mintTo(
      pg.connection,
      pg.wallet.keypair,
      mint,
      userTokenAccount.address,
      pg.wallet.publicKey,
      1000
    );
    console.log(
      "Tokens minted to user account:",
      userTokenAccount.address.toString()
    );

    const depositTxHash = await pg.program.methods
      .depositTokens(new BN(500))
      .accounts({
        user: user.publicKey,
        userTokenAccount: userTokenAccount.address,
        vaultTokenAccount: vaultTokenAccount.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        vaultData: vaultDataPDA,
      })
      .signers([user])
      .rpc();

    console.log(`Transaction hash for deposit: ${depositTxHash}`);
    await pg.connection.confirmTransaction(depositTxHash);
    console.log("Tokens deposited into the vault successfully.");

    const vaultBalance = await pg.connection.getTokenAccountBalance(
      vaultTokenAccount.address
    );
    console.log("Vault Token Account Balance:", vaultBalance.value.amount);

    assert.equal(
      vaultBalance.value.amount,
      500,
      "Vault should have 500 tokens deposited."
    );
  });
});
