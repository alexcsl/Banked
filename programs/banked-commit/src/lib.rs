#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked},
};

declare_id!("BXbCRa6rLmCK3ZXGCrFmks4AGjR1ovBNbqbJhwqNbPD1");

const BPS_DENOMINATOR: u128 = 10_000;
const SECONDS_PER_DAY: i64 = 86_400;

#[program]
pub mod banked_commit {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        reserve_bps: u16,
        daily_limit_raw: u64,
        executor: Pubkey,
        recipient: Pubkey,
        deployment_domain: [u8; 32],
    ) -> Result<()> {
        require!(reserve_bps <= 10_000, CommitError::InvalidReserveBps);
        require!(executor != Pubkey::default(), CommitError::InvalidExecutor);
        require!(recipient != Pubkey::default(), CommitError::InvalidRecipient);

        let vault = &mut ctx.accounts.vault;
        vault.schema_version = 1;
        vault.program_version = 1;
        vault.deployment_domain = deployment_domain;
        vault.owner = ctx.accounts.owner.key();
        vault.executor = executor;
        vault.recipient = recipient;
        vault.mint = ctx.accounts.mint.key();
        vault.token_program = ctx.accounts.token_program.key();
        vault.policy_version = 1;
        vault.next_sequence = 1;
        vault.paused = false;
        vault.executor_enabled = true;
        vault.reserve_bps = reserve_bps;
        vault.daily_limit_raw = daily_limit_raw;
        vault.period_id = current_period()?;
        vault.period_spent_raw = 0;
        vault.reserved_raw = 0;
        vault.operating_raw = 0;
        vault.decimals = ctx.accounts.mint.decimals;
        vault.vault_bump = ctx.bumps.vault;
        vault.reserve_authority_bump = ctx.bumps.reserve_authority;
        vault.operating_authority_bump = ctx.bumps.operating_authority;
        emit!(VaultInitialized { vault: vault.key(), owner: vault.owner, mint: vault.mint });
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, expected_sequence: u64, amount: u64) -> Result<()> {
        let vault_key = ctx.accounts.vault.key();
        assert_owner(&ctx.accounts.vault, &ctx.accounts.owner)?;
        assert_sequence(&ctx.accounts.vault, expected_sequence)?;
        require!(amount > 0, CommitError::InvalidAmount);

        let reserve_amount = reserve_share(amount, ctx.accounts.vault.reserve_bps)?;
        let operating_amount = amount.checked_sub(reserve_amount).ok_or(CommitError::ArithmeticOverflow)?;
        let reserve_before = ctx.accounts.reserve_token_account.amount;
        let operating_before = ctx.accounts.operating_token_account.amount;
        transfer_from_owner(&ctx, reserve_amount, true)?;
        transfer_from_owner(&ctx, operating_amount, false)?;
        ctx.accounts.reserve_token_account.reload()?;
        ctx.accounts.operating_token_account.reload()?;
        require!(ctx.accounts.reserve_token_account.amount.checked_sub(reserve_before) == Some(reserve_amount), CommitError::UnexpectedTransferFee);
        require!(ctx.accounts.operating_token_account.amount.checked_sub(operating_before) == Some(operating_amount), CommitError::UnexpectedTransferFee);

        let vault = &mut ctx.accounts.vault;
        vault.reserved_raw = vault.reserved_raw.checked_add(reserve_amount).ok_or(CommitError::ArithmeticOverflow)?;
        vault.operating_raw = vault.operating_raw.checked_add(operating_amount).ok_or(CommitError::ArithmeticOverflow)?;
        write_receipt(&mut ctx.accounts.receipt, vault_key, vault, ReceiptAction::Deposit, ctx.accounts.owner.key(), amount, reserve_amount, operating_amount, ctx.accounts.owner.key())?;
        vault.next_sequence = vault.next_sequence.checked_add(1).ok_or(CommitError::ArithmeticOverflow)?;
        Ok(())
    }

    pub fn pay(
        ctx: Context<Pay>,
        expected_sequence: u64,
        expected_policy_version: u64,
        amount: u64,
        expires_at: i64,
    ) -> Result<()> {
        let vault_key = ctx.accounts.vault.key();
        let vault = &mut ctx.accounts.vault;
        require_keys_eq!(vault.executor, ctx.accounts.executor.key(), CommitError::Unauthorized);
        require!(vault.executor_enabled, CommitError::ExecutorRevoked);
        require!(!vault.paused, CommitError::Paused);
        assert_sequence(vault, expected_sequence)?;
        require!(vault.policy_version == expected_policy_version, CommitError::StalePolicy);
        let now = Clock::get()?.unix_timestamp;
        require!(now < expires_at && expires_at <= now.checked_add(300).ok_or(CommitError::ArithmeticOverflow)?, CommitError::ExpiredRequest);
        require!(amount > 0, CommitError::InvalidAmount);
        reset_period(vault, now)?;
        let remaining = vault.daily_limit_raw.checked_sub(vault.period_spent_raw).unwrap_or(0);
        require!(amount <= remaining, CommitError::AllowanceExceeded);
        require!(amount <= vault.operating_raw, CommitError::OperatingBalanceExceeded);

        let seeds: &[&[u8]] = &[b"operating", vault_key.as_ref(), &[vault.operating_authority_bump]];
        let signer = &[seeds];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.operating_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.recipient_token_account.to_account_info(),
                    authority: ctx.accounts.operating_authority.to_account_info(),
                },
                signer,
            ),
            amount,
            vault.decimals,
        )?;
        vault.operating_raw = vault.operating_raw.checked_sub(amount).ok_or(CommitError::OperatingBalanceExceeded)?;
        vault.period_spent_raw = vault.period_spent_raw.checked_add(amount).ok_or(CommitError::ArithmeticOverflow)?;
        write_receipt(&mut ctx.accounts.receipt, vault_key, vault, ReceiptAction::Payment, ctx.accounts.executor.key(), amount, 0, amount, vault.recipient)?;
        vault.next_sequence = vault.next_sequence.checked_add(1).ok_or(CommitError::ArithmeticOverflow)?;
        emit!(PaymentSettled { vault: vault_key, sequence: expected_sequence, amount, recipient: vault.recipient });
        Ok(())
    }

    pub fn update_policy(
        ctx: Context<UpdatePolicy>,
        expected_sequence: u64,
        expected_policy_version: u64,
        reserve_bps: u16,
        daily_limit_raw: u64,
        executor: Pubkey,
        recipient: Pubkey,
    ) -> Result<()> {
        let vault_key = ctx.accounts.vault.key();
        let vault = &mut ctx.accounts.vault;
        assert_owner(vault, &ctx.accounts.owner)?;
        assert_sequence(vault, expected_sequence)?;
        require!(vault.policy_version == expected_policy_version, CommitError::StalePolicy);
        require!(reserve_bps <= 10_000, CommitError::InvalidReserveBps);
        require!(executor != Pubkey::default(), CommitError::InvalidExecutor);
        require!(recipient != Pubkey::default(), CommitError::InvalidRecipient);
        reset_period(vault, Clock::get()?.unix_timestamp)?;
        vault.reserve_bps = reserve_bps;
        vault.daily_limit_raw = daily_limit_raw;
        vault.executor = executor;
        vault.recipient = recipient;
        vault.executor_enabled = true;
        vault.policy_version = vault.policy_version.checked_add(1).ok_or(CommitError::ArithmeticOverflow)?;
        write_receipt(&mut ctx.accounts.receipt, vault_key, vault, ReceiptAction::PolicyUpdated, ctx.accounts.owner.key(), 0, 0, 0, recipient)?;
        vault.next_sequence = vault.next_sequence.checked_add(1).ok_or(CommitError::ArithmeticOverflow)?;
        Ok(())
    }

    pub fn set_paused(ctx: Context<OwnerAction>, expected_sequence: u64, paused: bool) -> Result<()> {
        let vault_key = ctx.accounts.vault.key();
        let vault = &mut ctx.accounts.vault;
        assert_owner(vault, &ctx.accounts.owner)?;
        assert_sequence(vault, expected_sequence)?;
        vault.paused = paused;
        vault.policy_version = vault.policy_version.checked_add(1).ok_or(CommitError::ArithmeticOverflow)?;
        write_receipt(&mut ctx.accounts.receipt, vault_key, vault, ReceiptAction::PauseChanged, ctx.accounts.owner.key(), 0, 0, 0, vault.owner)?;
        vault.next_sequence = vault.next_sequence.checked_add(1).ok_or(CommitError::ArithmeticOverflow)?;
        Ok(())
    }

    pub fn revoke_executor(ctx: Context<OwnerAction>, expected_sequence: u64) -> Result<()> {
        let vault_key = ctx.accounts.vault.key();
        let vault = &mut ctx.accounts.vault;
        assert_owner(vault, &ctx.accounts.owner)?;
        assert_sequence(vault, expected_sequence)?;
        vault.executor_enabled = false;
        vault.policy_version = vault.policy_version.checked_add(1).ok_or(CommitError::ArithmeticOverflow)?;
        write_receipt(&mut ctx.accounts.receipt, vault_key, vault, ReceiptAction::ExecutorRevoked, ctx.accounts.owner.key(), 0, 0, 0, vault.owner)?;
        vault.next_sequence = vault.next_sequence.checked_add(1).ok_or(CommitError::ArithmeticOverflow)?;
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, expected_sequence: u64, bucket: Bucket, amount: u64) -> Result<()> {
        let vault_key = ctx.accounts.vault.key();
        let vault = &mut ctx.accounts.vault;
        assert_owner(vault, &ctx.accounts.owner)?;
        assert_sequence(vault, expected_sequence)?;
        require!(amount > 0, CommitError::InvalidAmount);
        let (source, authority, bump, inventory) = match bucket {
            Bucket::Reserve => (&ctx.accounts.reserve_token_account, &ctx.accounts.reserve_authority, vault.reserve_authority_bump, vault.reserved_raw),
            Bucket::Operating => (&ctx.accounts.operating_token_account, &ctx.accounts.operating_authority, vault.operating_authority_bump, vault.operating_raw),
        };
        require!(amount <= inventory, CommitError::OperatingBalanceExceeded);
        let label: &[u8] = match bucket { Bucket::Reserve => b"reserve", Bucket::Operating => b"operating" };
        let seeds: &[&[u8]] = &[label, vault_key.as_ref(), &[bump]];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked { from: source.to_account_info(), mint: ctx.accounts.mint.to_account_info(), to: ctx.accounts.owner_token_account.to_account_info(), authority: authority.to_account_info() },
                &[seeds],
            ), amount, vault.decimals,
        )?;
        match bucket { Bucket::Reserve => vault.reserved_raw = vault.reserved_raw.checked_sub(amount).ok_or(CommitError::ArithmeticOverflow)?, Bucket::Operating => vault.operating_raw = vault.operating_raw.checked_sub(amount).ok_or(CommitError::ArithmeticOverflow)? };
        write_receipt(&mut ctx.accounts.receipt, vault_key, vault, ReceiptAction::Withdrawal, ctx.accounts.owner.key(), amount, 0, amount, vault.owner)?;
        vault.next_sequence = vault.next_sequence.checked_add(1).ok_or(CommitError::ArithmeticOverflow)?;
        Ok(())
    }

    pub fn recover_all(ctx: Context<RecoverAll>, expected_sequence: u64) -> Result<()> {
        let vault_key = ctx.accounts.vault.key();
        let vault = &mut ctx.accounts.vault;
        assert_owner(vault, &ctx.accounts.owner)?;
        assert_sequence(vault, expected_sequence)?;
        let reserve_amount = ctx.accounts.reserve_token_account.amount;
        let operating_amount = ctx.accounts.operating_token_account.amount;
        transfer_from_vault(&ctx.accounts.token_program, &ctx.accounts.mint, &ctx.accounts.reserve_token_account, &ctx.accounts.owner_token_account, &ctx.accounts.reserve_authority, vault_key, b"reserve", vault.reserve_authority_bump, reserve_amount, vault.decimals)?;
        transfer_from_vault(&ctx.accounts.token_program, &ctx.accounts.mint, &ctx.accounts.operating_token_account, &ctx.accounts.owner_token_account, &ctx.accounts.operating_authority, vault_key, b"operating", vault.operating_authority_bump, operating_amount, vault.decimals)?;
        vault.reserved_raw = 0;
        vault.operating_raw = 0;
        vault.executor_enabled = false;
        vault.paused = true;
        vault.policy_version = vault.policy_version.checked_add(1).ok_or(CommitError::ArithmeticOverflow)?;
        write_receipt(&mut ctx.accounts.receipt, vault_key, vault, ReceiptAction::Recovered, ctx.accounts.owner.key(), reserve_amount.checked_add(operating_amount).ok_or(CommitError::ArithmeticOverflow)?, reserve_amount, operating_amount, vault.owner)?;
        vault.next_sequence = vault.next_sequence.checked_add(1).ok_or(CommitError::ArithmeticOverflow)?;
        Ok(())
    }
}

fn transfer_from_owner(ctx: &Context<Deposit>, amount: u64, reserve: bool) -> Result<()> {
    if amount == 0 { return Ok(()); }
    let target = if reserve { ctx.accounts.reserve_token_account.to_account_info() } else { ctx.accounts.operating_token_account.to_account_info() };
    token_interface::transfer_checked(CpiContext::new(ctx.accounts.token_program.to_account_info(), TransferChecked { from: ctx.accounts.owner_token_account.to_account_info(), mint: ctx.accounts.mint.to_account_info(), to: target, authority: ctx.accounts.owner.to_account_info() }), amount, ctx.accounts.mint.decimals)
}

fn transfer_from_vault<'info>(token_program: &Interface<'info, TokenInterface>, mint: &InterfaceAccount<'info, Mint>, source: &InterfaceAccount<'info, TokenAccount>, destination: &InterfaceAccount<'info, TokenAccount>, authority: &UncheckedAccount<'info>, vault: Pubkey, label: &[u8], bump: u8, amount: u64, decimals: u8) -> Result<()> {
    if amount == 0 { return Ok(()); }
    let seeds: &[&[u8]] = &[label, vault.as_ref(), &[bump]];
    token_interface::transfer_checked(CpiContext::new_with_signer(token_program.to_account_info(), TransferChecked { from: source.to_account_info(), mint: mint.to_account_info(), to: destination.to_account_info(), authority: authority.to_account_info() }, &[seeds]), amount, decimals)
}

fn assert_owner(vault: &Vault, owner: &Signer<'_>) -> Result<()> { require_keys_eq!(vault.owner, owner.key(), CommitError::Unauthorized); Ok(()) }
fn assert_sequence(vault: &Vault, sequence: u64) -> Result<()> { require!(vault.next_sequence == sequence, CommitError::SequenceMismatch); Ok(()) }
fn current_period() -> Result<i64> { Ok(Clock::get()?.unix_timestamp.div_euclid(SECONDS_PER_DAY)) }
fn reset_period(vault: &mut Vault, now: i64) -> Result<()> { let period = now.div_euclid(SECONDS_PER_DAY); require!(period >= vault.period_id, CommitError::InvalidPeriod); if period > vault.period_id { vault.period_id = period; vault.period_spent_raw = 0; } Ok(()) }
fn reserve_share(amount: u64, bps: u16) -> Result<u64> { let numerator = (amount as u128).checked_mul(bps as u128).ok_or(CommitError::ArithmeticOverflow)?.checked_add(BPS_DENOMINATOR - 1).ok_or(CommitError::ArithmeticOverflow)?; u64::try_from(numerator / BPS_DENOMINATOR).map_err(|_| error!(CommitError::ArithmeticOverflow)) }
fn write_receipt(receipt: &mut Receipt, vault_key: Pubkey, vault: &Vault, action: ReceiptAction, actor: Pubkey, amount: u64, reserved_delta: u64, operating_delta: u64, recipient: Pubkey) -> Result<()> { receipt.vault = vault_key; receipt.sequence = vault.next_sequence; receipt.action = action; receipt.actor = actor; receipt.policy_version = vault.policy_version; receipt.timestamp = Clock::get()?.unix_timestamp; receipt.amount = amount; receipt.reserved_delta = reserved_delta; receipt.operating_delta = operating_delta; receipt.recipient = recipient; Ok(()) }

#[derive(Accounts)]
#[instruction(reserve_bps: u16, daily_limit_raw: u64, executor: Pubkey, recipient: Pubkey, deployment_domain: [u8; 32])]
pub struct Initialize<'info> {
    #[account(mut)] pub owner: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    #[account(init, payer = owner, space = Vault::LEN, seeds = [b"commit", owner.key().as_ref()], bump)] pub vault: Account<'info, Vault>,
    #[account(seeds = [b"reserve", vault.key().as_ref()], bump)] pub reserve_authority: UncheckedAccount<'info>,
    #[account(seeds = [b"operating", vault.key().as_ref()], bump)] pub operating_authority: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = owner, associated_token::mint = mint, associated_token::authority = reserve_authority, associated_token::token_program = token_program)] pub reserve_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(init_if_needed, payer = owner, associated_token::mint = mint, associated_token::authority = operating_authority, associated_token::token_program = token_program)] pub operating_token_account: InterfaceAccount<'info, TokenAccount>,
    pub associated_token_program: Program<'info, AssociatedToken>, pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(expected_sequence: u64, amount: u64)]
pub struct Deposit<'info> {
    #[account(mut)] pub owner: Signer<'info>,
    pub mint: InterfaceAccount<'info, Mint>, pub token_program: Interface<'info, TokenInterface>,
    #[account(mut, seeds = [b"commit", vault.owner.as_ref()], bump = vault.vault_bump, constraint = vault.mint == mint.key() @ CommitError::WrongMint, constraint = vault.token_program == token_program.key() @ CommitError::WrongTokenProgram)] pub vault: Account<'info, Vault>,
    #[account(mut, token::mint = mint, token::authority = owner, token::token_program = token_program)] pub owner_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(seeds = [b"reserve", vault.key().as_ref()], bump = vault.reserve_authority_bump)] pub reserve_authority: UncheckedAccount<'info>,
    #[account(seeds = [b"operating", vault.key().as_ref()], bump = vault.operating_authority_bump)] pub operating_authority: UncheckedAccount<'info>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = reserve_authority, associated_token::token_program = token_program)] pub reserve_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = operating_authority, associated_token::token_program = token_program)] pub operating_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(init, payer = owner, space = Receipt::LEN, seeds = [b"receipt", vault.key().as_ref(), &expected_sequence.to_le_bytes()], bump)] pub receipt: Account<'info, Receipt>, pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(expected_sequence: u64, expected_policy_version: u64, amount: u64, expires_at: i64)]
pub struct Pay<'info> {
    #[account(mut)] pub executor: Signer<'info>, pub mint: InterfaceAccount<'info, Mint>, pub token_program: Interface<'info, TokenInterface>,
    #[account(mut, seeds = [b"commit", vault.owner.as_ref()], bump = vault.vault_bump, constraint = vault.mint == mint.key() @ CommitError::WrongMint, constraint = vault.token_program == token_program.key() @ CommitError::WrongTokenProgram)] pub vault: Account<'info, Vault>,
    #[account(seeds = [b"operating", vault.key().as_ref()], bump = vault.operating_authority_bump)] pub operating_authority: UncheckedAccount<'info>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = operating_authority, associated_token::token_program = token_program)] pub operating_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(address = vault.recipient @ CommitError::WrongRecipient)] pub recipient: UncheckedAccount<'info>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = recipient, associated_token::token_program = token_program)] pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(init, payer = executor, space = Receipt::LEN, seeds = [b"receipt", vault.key().as_ref(), &expected_sequence.to_le_bytes()], bump)] pub receipt: Account<'info, Receipt>, pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(expected_sequence: u64, expected_policy_version: u64, reserve_bps: u16, daily_limit_raw: u64, executor: Pubkey, recipient: Pubkey)]
pub struct UpdatePolicy<'info> { #[account(mut)] pub owner: Signer<'info>, #[account(mut, seeds = [b"commit", vault.owner.as_ref()], bump = vault.vault_bump)] pub vault: Account<'info, Vault>, #[account(init, payer = owner, space = Receipt::LEN, seeds = [b"receipt", vault.key().as_ref(), &expected_sequence.to_le_bytes()], bump)] pub receipt: Account<'info, Receipt>, pub system_program: Program<'info, System> }

#[derive(Accounts)]
#[instruction(expected_sequence: u64)]
pub struct OwnerAction<'info> { #[account(mut)] pub owner: Signer<'info>, #[account(mut, seeds = [b"commit", vault.owner.as_ref()], bump = vault.vault_bump)] pub vault: Account<'info, Vault>, #[account(init, payer = owner, space = Receipt::LEN, seeds = [b"receipt", vault.key().as_ref(), &expected_sequence.to_le_bytes()], bump)] pub receipt: Account<'info, Receipt>, pub system_program: Program<'info, System> }

#[derive(Accounts)]
#[instruction(expected_sequence: u64, bucket: Bucket, amount: u64)]
pub struct Withdraw<'info> { #[account(mut)] pub owner: Signer<'info>, pub mint: InterfaceAccount<'info, Mint>, pub token_program: Interface<'info, TokenInterface>, #[account(mut, seeds = [b"commit", vault.owner.as_ref()], bump = vault.vault_bump, constraint = vault.mint == mint.key() @ CommitError::WrongMint, constraint = vault.token_program == token_program.key() @ CommitError::WrongTokenProgram)] pub vault: Account<'info, Vault>, #[account(seeds = [b"reserve", vault.key().as_ref()], bump = vault.reserve_authority_bump)] pub reserve_authority: UncheckedAccount<'info>, #[account(seeds = [b"operating", vault.key().as_ref()], bump = vault.operating_authority_bump)] pub operating_authority: UncheckedAccount<'info>, #[account(mut, associated_token::mint = mint, associated_token::authority = reserve_authority, associated_token::token_program = token_program)] pub reserve_token_account: InterfaceAccount<'info, TokenAccount>, #[account(mut, associated_token::mint = mint, associated_token::authority = operating_authority, associated_token::token_program = token_program)] pub operating_token_account: InterfaceAccount<'info, TokenAccount>, #[account(mut, token::mint = mint, token::authority = owner, token::token_program = token_program)] pub owner_token_account: InterfaceAccount<'info, TokenAccount>, #[account(init, payer = owner, space = Receipt::LEN, seeds = [b"receipt", vault.key().as_ref(), &expected_sequence.to_le_bytes()], bump)] pub receipt: Account<'info, Receipt>, pub system_program: Program<'info, System> }

#[derive(Accounts)]
#[instruction(expected_sequence: u64)]
pub struct RecoverAll<'info> { #[account(mut)] pub owner: Signer<'info>, pub mint: InterfaceAccount<'info, Mint>, pub token_program: Interface<'info, TokenInterface>, #[account(mut, seeds = [b"commit", vault.owner.as_ref()], bump = vault.vault_bump, constraint = vault.mint == mint.key() @ CommitError::WrongMint, constraint = vault.token_program == token_program.key() @ CommitError::WrongTokenProgram)] pub vault: Account<'info, Vault>, #[account(seeds = [b"reserve", vault.key().as_ref()], bump = vault.reserve_authority_bump)] pub reserve_authority: UncheckedAccount<'info>, #[account(seeds = [b"operating", vault.key().as_ref()], bump = vault.operating_authority_bump)] pub operating_authority: UncheckedAccount<'info>, #[account(mut, associated_token::mint = mint, associated_token::authority = reserve_authority, associated_token::token_program = token_program)] pub reserve_token_account: InterfaceAccount<'info, TokenAccount>, #[account(mut, associated_token::mint = mint, associated_token::authority = operating_authority, associated_token::token_program = token_program)] pub operating_token_account: InterfaceAccount<'info, TokenAccount>, #[account(mut, token::mint = mint, token::authority = owner, token::token_program = token_program)] pub owner_token_account: InterfaceAccount<'info, TokenAccount>, #[account(init, payer = owner, space = Receipt::LEN, seeds = [b"receipt", vault.key().as_ref(), &expected_sequence.to_le_bytes()], bump)] pub receipt: Account<'info, Receipt>, pub system_program: Program<'info, System> }

#[account]
pub struct Vault { pub schema_version: u16, pub program_version: u16, pub deployment_domain: [u8; 32], pub owner: Pubkey, pub executor: Pubkey, pub recipient: Pubkey, pub mint: Pubkey, pub token_program: Pubkey, pub policy_version: u64, pub next_sequence: u64, pub paused: bool, pub executor_enabled: bool, pub reserve_bps: u16, pub daily_limit_raw: u64, pub period_id: i64, pub period_spent_raw: u64, pub reserved_raw: u64, pub operating_raw: u64, pub decimals: u8, pub vault_bump: u8, pub reserve_authority_bump: u8, pub operating_authority_bump: u8, pub reserved: [u8; 270] }
impl Vault { pub const LEN: usize = 8 + 512; }

#[account]
pub struct Receipt { pub vault: Pubkey, pub sequence: u64, pub action: ReceiptAction, pub actor: Pubkey, pub policy_version: u64, pub timestamp: i64, pub amount: u64, pub reserved_delta: u64, pub operating_delta: u64, pub recipient: Pubkey, pub reserved: [u8; 102] }
impl Receipt { pub const LEN: usize = 8 + 256; }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)] pub enum Bucket { Reserve, Operating }
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)] pub enum ReceiptAction { Deposit, Payment, PolicyUpdated, PauseChanged, ExecutorRevoked, Withdrawal, Recovered }

#[event] pub struct VaultInitialized { pub vault: Pubkey, pub owner: Pubkey, pub mint: Pubkey }
#[event] pub struct PaymentSettled { pub vault: Pubkey, pub sequence: u64, pub amount: u64, pub recipient: Pubkey }

#[error_code]
pub enum CommitError { #[msg("Unauthorized signer.")] Unauthorized, #[msg("Reserve percentage must be between 0 and 10,000 basis points.")] InvalidReserveBps, #[msg("Executor is invalid.")] InvalidExecutor, #[msg("Recipient is invalid.")] InvalidRecipient, #[msg("Unexpected vault sequence.")] SequenceMismatch, #[msg("Policy has changed.")] StalePolicy, #[msg("Executor has been revoked.")] ExecutorRevoked, #[msg("Delegated payments are paused.")] Paused, #[msg("Payment request has expired.")] ExpiredRequest, #[msg("Amount must be positive.")] InvalidAmount, #[msg("Daily allowance exceeded.")] AllowanceExceeded, #[msg("Operating inventory exceeded.")] OperatingBalanceExceeded, #[msg("Arithmetic overflow.")] ArithmeticOverflow, #[msg("Token transfer fee or unsupported token behavior detected.")] UnexpectedTransferFee, #[msg("Invalid UTC period.")] InvalidPeriod, #[msg("Wrong token mint.")] WrongMint, #[msg("Wrong token program.")] WrongTokenProgram, #[msg("Wrong recipient.")] WrongRecipient }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deposit_rounding_favors_reserve() {
        assert_eq!(reserve_share(100, 8_000).unwrap(), 80);
        assert_eq!(reserve_share(1, 8_000).unwrap(), 1);
        assert!(reserve_share(1, 3_333).unwrap() * 3 >= reserve_share(3, 3_333).unwrap());
    }

    #[test]
    fn utc_period_is_fixed_length() {
        assert_eq!(86_399i64.div_euclid(SECONDS_PER_DAY), 0);
        assert_eq!(86_400i64.div_euclid(SECONDS_PER_DAY), 1);
    }
}
