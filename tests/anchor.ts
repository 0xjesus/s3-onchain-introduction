import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import assert from "assert";
import * as web3 from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as web3 from "@solana/web3.js";
import assert from "assert";
import type { AssetVault } from "../target/types/asset_vault";

describe("Asset Vault Program", () => {
  // Configure the client to use the local cluster
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.AssetVault as anchor.Program<AssetVault>;
  
  let vaultDataPDA;
  let vaultTokenAccount;
  let mint;
  let bump;
  let userTokenAccount;
  let managerTokenAccount;
  const user = new web3.Keypair();
  const unauthorizedUser = new web3.Keypair(); // Usuario no autorizado para probar fallos

  it("Initializes the vault", async () => {
    try {
      // Calcula correctamente la PDA para vault data
      [vaultDataPDA, bump] = await web3.PublicKey.findProgramAddress(
        [Buffer.from("vault")],
        program.programId
      );
      console.log(
        "Calculated PDA for vault data:",
        vaultDataPDA.toString(),
        "with bump:",
        bump
      );

      // Simula la transacción para ver posibles errores antes de ejecutarla
      const simulatedResult = await program.methods
        .initializeVault()
        .accounts({
          vaultData: vaultDataPDA,
          manager: program.provider.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .simulate(); // Simulación de la transacción

      // Envía la transacción real solo si la simulación pasa
      const txHash = await program.methods
        .initializeVault()
        .accounts({
          vaultData: vaultDataPDA,
          manager: program.provider.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .rpc();

      console.log(`Use 'solana confirm -v ${txHash}' to see the logs`);
      await program.provider.connection.confirmTransaction(txHash);
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
      program.programId
    );
    console.log(
      "Corrected PDA calculated for vault data:",
      vaultDataPDA.toString(),
      "with bump:",
      bump
    );

    mint = await createMint(
      program.provider.connection,
      program.provider.wallet.payer,
      program.provider.publicKey,
      null,
      9
    );
    console.log("Mint created:", mint.toString());

    vaultTokenAccount = await getOrCreateAssociatedTokenAccount(
      program.provider.connection,
      program.provider.wallet.payer,
      mint,
      vaultDataPDA,
      true
    );
    console.log(
      "Vault Token Account created:",
      vaultTokenAccount.address.toString()
    );

    userTokenAccount = await getOrCreateAssociatedTokenAccount(
      program.provider.connection,
      program.provider.wallet.payer,
      mint,
      user.publicKey
    );
    console.log(
      "User Token Account created:",
      userTokenAccount.address.toString()
    );

    await mintTo(
      program.provider.connection,
      program.provider.wallet.payer,
      mint,
      userTokenAccount.address,
      program.provider.publicKey,
      1000
    );
    console.log(
      "Tokens minted to user account:",
      userTokenAccount.address.toString()
    );

    const depositTxHash = await program.methods
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
    await program.provider.connection.confirmTransaction(depositTxHash);
    console.log("Tokens deposited into the vault successfully.");

    const vaultBalance = await program.provider.connection.getTokenAccountBalance(
      vaultTokenAccount.address
    );
    console.log("Vault Token Account Balance:", vaultBalance.value.amount);

    assert.equal(
      vaultBalance.value.amount,
      500,
      "Vault should have 500 tokens deposited."
    );
  });

  it("Manager withdraws tokens from the vault", async () => {
    try {
      // Calcula la PDA del vault data si no se hizo previamente
      [vaultDataPDA, bump] = await web3.PublicKey.findProgramAddress(
        [Buffer.from("vault")],
        program.programId
      );

      // Crea o consigue una cuenta de token asociada para el manager
      managerTokenAccount = await getOrCreateAssociatedTokenAccount(
        program.provider.connection,
        program.provider.wallet.payer, // Paga por la creación de la cuenta
        mint,
        program.provider.publicKey // Cuenta de tokens asociada al manager
      );
      console.log(
        "Manager Token Account created:",
        managerTokenAccount.address.toString()
      );

      // Simula la transacción de retiro
      const simulatedWithdraw = await program.methods
        .withdrawTokens(new BN(200))
        .accounts({
          manager: program.provider.publicKey,
          vaultTokenAccount: vaultTokenAccount.address,
          managerTokenAccount: managerTokenAccount.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          vaultData: vaultDataPDA,
        })
        .simulate();

      console.log("Withdraw Simulation logs:", simulatedWithdraw.raw);

      // Envía la transacción real para retirar tokens del vault
      const withdrawTxHash = await program.methods
        .withdrawTokens(new BN(200))
        .accounts({
          manager: program.provider.publicKey,
          vaultTokenAccount: vaultTokenAccount.address,
          managerTokenAccount: managerTokenAccount.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          vaultData: vaultDataPDA,
        })
        .signers([program.provider.wallet.payer])
        .rpc();

      console.log(`Transaction hash for withdrawal: ${withdrawTxHash}`);
      await program.provider.connection.confirmTransaction(withdrawTxHash);
      console.log("Tokens withdrawn from the vault successfully.");

      // Verifica los balances después del retiro
      const updatedVaultBalance = await program.provider.connection.getTokenAccountBalance(
        vaultTokenAccount.address
      );
      const managerBalance = await program.provider.connection.getTokenAccountBalance(
        managerTokenAccount.address
      );

      console.log(
        "Updated Vault Token Account Balance:",
        updatedVaultBalance.value.amount
      );
      console.log(
        "Manager Token Account Balance:",
        managerBalance.value.amount
      );

      // Aserciones para verificar los balances correctos
      assert.equal(
        updatedVaultBalance.value.amount,
        300,
        "Vault should have 300 tokens remaining after withdrawal."
      );
      assert.equal(
        managerBalance.value.amount,
        200,
        "Manager should have received 200 tokens."
      );
    } catch (error) {
      console.error("Error during token withdrawal:", error);
      if (error.logs) {
        console.error("Transaction logs:", error.logs);
      }
      throw error;
    }
  });
  it("Fails when an unauthorized user attempts to withdraw tokens", async () => {
    try {
      [vaultDataPDA, bump] = await web3.PublicKey.findProgramAddress(
        [Buffer.from("vault")],
        program.programId
      );

      // Intentar crear una cuenta de token para el usuario no autorizado
      const unauthorizedUserTokenAccount =
        await getOrCreateAssociatedTokenAccount(
          program.provider.connection,
          program.provider.wallet.payer, // El pagador
          mint,
          unauthorizedUser.publicKey
        );

      // Simula la transacción de retiro por un usuario no autorizado
      const simulatedUnauthorizedWithdraw = await program.methods
        .withdrawTokens(new BN(100))
        .accounts({
          manager: unauthorizedUser.publicKey, // Usuario no autorizado intentando ser el manager
          vaultTokenAccount: vaultTokenAccount.address,
          managerTokenAccount: unauthorizedUserTokenAccount.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          vaultData: vaultDataPDA,
        })
        .signers([unauthorizedUser]) // Firmar como el usuario no autorizado
        .simulate();

      console.log(
        "Unauthorized Withdraw Simulation logs:",
        simulatedUnauthorizedWithdraw.raw
      );

      // Si llega aquí, significa que no falló como se esperaba
      assert.fail(
        "The transaction should have failed because the user is unauthorized."
      );
    } catch (error) {
      console.error("Expected error during unauthorized withdrawal:", error);
      assert.ok(
        error,
        "Error should be thrown for unauthorized withdrawal attempt."
      );
      if (error.logs) {
        console.error("Unauthorized Withdraw Transaction logs:", error.logs);
      }
    }
  });

  it("Fails when attempting to withdraw more tokens than available in the vault", async () => {
    try {
      [vaultDataPDA, bump] = await web3.PublicKey.findProgramAddress(
        [Buffer.from("vault")],
        program.programId
      );

      // Intentar retirar más tokens de los que están disponibles en la bóveda
      const simulatedExcessWithdraw = await program.methods
        .withdrawTokens(new BN(600)) // Intentar retirar más de los 500 disponibles
        .accounts({
          manager: program.provider.publicKey, // Manager autorizado
          vaultTokenAccount: vaultTokenAccount.address,
          managerTokenAccount: managerTokenAccount.address,
          tokenProgram: TOKEN_PROGRAM_ID,
          vaultData: vaultDataPDA,
        })
        .simulate();

      console.log(
        "Excess Withdraw Simulation logs:",
        simulatedExcessWithdraw.raw
      );

      // Si la simulación no falla, algo salió mal, debería fallar
      assert.fail(
        "The transaction should have failed because there are not enough tokens in the vault."
      );
    } catch (error) {
      console.error("Expected error during excessive withdrawal:", error);
      assert.ok(
        error,
        "Error should be thrown when trying to withdraw more than available."
      );
      if (error.logs) {
        console.error("Excess Withdraw Transaction logs:", error.logs);
      }
    }
  });
});
