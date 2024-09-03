use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("hovazRyg1bRYjcb9qtyhYWCzx8CNNgeUDf3BqTzMym1");

#[program]
pub mod asset_vault {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        msg!(
            "Initializing vault with manager: {:?}",
            ctx.accounts.manager.key()
        );
        ctx.accounts.vault_data.manager = ctx.accounts.manager.key();
        Ok(())
    }

    pub fn deposit_tokens(ctx: Context<DepositTokens>, amount: u64) -> Result<()> {
        msg!("Depositing tokens: Amount = {}", amount);
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        token::transfer(cpi_ctx, amount)?;
        msg!("Tokens deposited successfully");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init_if_needed,
        payer = manager,
        space = 8 + 32,
        seeds = [b"vault".as_ref()],
        bump
    )]
    pub vault_data: Account<'info, VaultData>,
    #[account(mut)]
    pub manager: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositTokens<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        constraint = user_token_account.owner == user.key(),
        constraint = user_token_account.mint == vault_token_account.mint
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    #[account(
        seeds = [b"vault".as_ref()],
        bump
    )]
    pub vault_data: Account<'info, VaultData>,
}

#[account]
pub struct VaultData {
    pub manager: Pubkey,
}
