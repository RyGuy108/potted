//! Potted escrow.
//!
//! One `Challenge` account per challenge, with a USDC vault it controls.
//! Fans pledge into the vault. The verifier key reports the result once:
//! success pays the whole pot to the streamer, failure makes every pledge
//! refundable. If no result arrives by `settle_by`, anyone can trigger the
//! refunds, so fans never depend on our servers to get their money back.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("2ppLCjxK534szs3T9o1vw3wW4gD9C6s2Dg5Coe2tqgNV");

/// Longest evidence reference stored on-chain (a game id or a short URL).
pub const MAX_EVIDENCE_LEN: usize = 96;
/// The verifier gets at most this long after the deadline to report.
pub const MAX_SETTLE_WINDOW_SECS: i64 = 7 * 24 * 60 * 60;
/// The most of a pot that can go to the streamer when the attempt starts.
/// The rest is paid only on success, and refunded on a miss.
pub const MAX_UPFRONT_PCT: u8 = 50;

#[program]
pub mod escrow {
    use super::*;

    /// Opens a challenge and its vault. `condition_hash` commits to the
    /// exact condition text so it cannot be changed after fans pledge.
    pub fn create_challenge(
        ctx: Context<CreateChallenge>,
        id: u64,
        verifier_kind: u8,
        condition_hash: [u8; 32],
        deadline: i64,
        settle_by: i64,
        pledge_cap: u64,
        upfront_pct: u8,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(deadline > now, EscrowError::DeadlineInPast);
        require!(
            settle_by >= deadline && settle_by - deadline <= MAX_SETTLE_WINDOW_SECS,
            EscrowError::BadSettleWindow
        );
        require!(pledge_cap > 0, EscrowError::ZeroAmount);
        require!(upfront_pct <= MAX_UPFRONT_PCT, EscrowError::UpfrontTooHigh);

        let challenge = &mut ctx.accounts.challenge;
        challenge.streamer = ctx.accounts.streamer.key();
        challenge.verifier = ctx.accounts.verifier.key();
        challenge.mint = ctx.accounts.mint.key();
        challenge.id = id;
        challenge.verifier_kind = verifier_kind;
        challenge.condition_hash = condition_hash;
        challenge.deadline = deadline;
        challenge.settle_by = settle_by;
        challenge.pledge_cap = pledge_cap;
        challenge.upfront_pct = upfront_pct;
        challenge.upfront_paid = 0;
        challenge.total_pledged = 0;
        challenge.total_refunded = 0;
        challenge.status = Status::Open;
        challenge.evidence_hash = [0; 32];
        challenge.evidence_ref = String::new();
        challenge.bump = ctx.bumps.challenge;
        challenge.vault_bump = ctx.bumps.vault;

        emit!(ChallengeCreated {
            challenge: challenge.key(),
            streamer: challenge.streamer,
            id,
            deadline,
            settle_by,
        });
        Ok(())
    }

    /// Moves `amount` from the fan into the vault. A fan can pledge more
    /// than once, up to the per-fan cap.
    pub fn pledge(ctx: Context<PledgeFunds>, amount: u64) -> Result<()> {
        require!(amount > 0, EscrowError::ZeroAmount);
        let now = Clock::get()?.unix_timestamp;
        let challenge = &mut ctx.accounts.challenge;
        require!(challenge.status == Status::Open, EscrowError::NotOpen);
        require!(now < challenge.deadline, EscrowError::DeadlinePassed);

        let pledge = &mut ctx.accounts.pledge;
        let new_amount = pledge
            .amount
            .checked_add(amount)
            .ok_or(EscrowError::Overflow)?;
        require!(new_amount <= challenge.pledge_cap, EscrowError::OverPledgeCap);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.fan_token.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.fan.to_account_info(),
                },
            ),
            amount,
        )?;

        pledge.challenge = challenge.key();
        pledge.fan = ctx.accounts.fan.key();
        pledge.amount = new_amount;
        pledge.refunded = false;
        pledge.bump = ctx.bumps.pledge;
        challenge.total_pledged = challenge
            .total_pledged
            .checked_add(amount)
            .ok_or(EscrowError::Overflow)?;

        emit!(Pledged {
            challenge: challenge.key(),
            fan: pledge.fan,
            amount,
            total_pledged: challenge.total_pledged,
        });
        Ok(())
    }

    /// Closes pledging when the attempt starts. The streamer or the
    /// verifier can call it.
    pub fn lock(ctx: Context<LockChallenge>) -> Result<()> {
        let authority = ctx.accounts.authority.key();
        let (upfront, streamer, id, bump) = {
            let challenge = &mut ctx.accounts.challenge;
            require!(
                authority == challenge.streamer || authority == challenge.verifier,
                EscrowError::Unauthorized
            );
            require!(challenge.status == Status::Open, EscrowError::NotOpen);
            challenge.status = Status::Locked;
            // Starting the attempt releases the up-front share, rounded down.
            let upfront = ((challenge.total_pledged as u128)
                .checked_mul(challenge.upfront_pct as u128)
                .ok_or(EscrowError::Overflow)?
                / 100) as u64;
            challenge.upfront_paid = upfront;
            (upfront, challenge.streamer, challenge.id, challenge.bump)
        };

        if upfront > 0 {
            let id_bytes = id.to_le_bytes();
            let seeds: &[&[u8]] = &[b"challenge", streamer.as_ref(), &id_bytes, &[bump]];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.streamer_token.to_account_info(),
                        authority: ctx.accounts.challenge.to_account_info(),
                    },
                    &[seeds],
                ),
                upfront,
            )?;
        }

        let challenge = &ctx.accounts.challenge;
        emit!(Locked {
            challenge: challenge.key(),
            total_pledged: challenge.total_pledged,
            upfront_paid: upfront,
        });
        Ok(())
    }

    pub fn cancel(ctx: Context<CancelChallenge>) -> Result<()> {
        let challenge = &mut ctx.accounts.challenge;
        require!(
            challenge.status == Status::Open || challenge.status == Status::Locked,
            EscrowError::AlreadySettled
        );
        challenge.status = Status::Failed;
        emit!(Cancelled {
            challenge: challenge.key(),
            total_pledged: challenge.total_pledged,
        });
        Ok(())
    }

    pub fn settle(
        ctx: Context<Settle>,
        success: bool,
        evidence_ref: String,
        evidence_hash: [u8; 32],
    ) -> Result<()> {
        require!(
            evidence_ref.len() <= MAX_EVIDENCE_LEN,
            EscrowError::EvidenceTooLong
        );
        let now = Clock::get()?.unix_timestamp;
        let challenge = &ctx.accounts.challenge;
        require!(
            challenge.status == Status::Open || challenge.status == Status::Locked,
            EscrowError::AlreadySettled
        );
        require!(now <= challenge.settle_by, EscrowError::SettleWindowClosed);

        let paid_out = if success {
            let amount = ctx.accounts.vault.amount;
            let id_bytes = challenge.id.to_le_bytes();
            let seeds: &[&[u8]] = &[
                b"challenge",
                challenge.streamer.as_ref(),
                &id_bytes,
                &[challenge.bump],
            ];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.streamer_token.to_account_info(),
                        authority: ctx.accounts.challenge.to_account_info(),
                    },
                    &[seeds],
                ),
                amount,
            )?;
            amount
        } else {
            0
        };

        let challenge = &mut ctx.accounts.challenge;
        challenge.status = if success { Status::Paid } else { Status::Failed };
        challenge.evidence_ref = evidence_ref.clone();
        challenge.evidence_hash = evidence_hash;

        emit!(Settled {
            challenge: challenge.key(),
            success,
            paid_out,
            evidence_ref,
        });
        Ok(())
    }

    /// Returns one fan's pledge. Anyone can call this once the challenge
    /// has failed, or once `settle_by` has passed with no result.
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let challenge = &ctx.accounts.challenge;
        let timed_out = challenge.status != Status::Paid && now > challenge.settle_by;
        require!(
            challenge.status == Status::Failed || timed_out,
            EscrowError::NotRefundable
        );
        let pledge = &ctx.accounts.pledge;
        require!(!pledge.refunded, EscrowError::AlreadyRefunded);
        require!(pledge.amount > 0, EscrowError::ZeroAmount);
        // If the up-front share went out, each fan keeps that share of their
        // pledge with the streamer, rounded up, so refunds can never ask the
        // vault for more than the rounded-down share left in it.
        let kept = if challenge.upfront_paid > 0 {
            ((pledge.amount as u128) * (challenge.upfront_pct as u128)).div_ceil(100) as u64
        } else {
            0
        };
        let amount = pledge.amount - kept;

        let id_bytes = challenge.id.to_le_bytes();
        let seeds: &[&[u8]] = &[
            b"challenge",
            challenge.streamer.as_ref(),
            &id_bytes,
            &[challenge.bump],
        ];
        if amount > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.fan_token.to_account_info(),
                        authority: ctx.accounts.challenge.to_account_info(),
                    },
                    &[seeds],
                ),
                amount,
            )?;
        }

        let pledge = &mut ctx.accounts.pledge;
        pledge.refunded = true;
        let challenge = &mut ctx.accounts.challenge;
        challenge.total_refunded = challenge
            .total_refunded
            .checked_add(amount)
            .ok_or(EscrowError::Overflow)?;

        emit!(Refunded {
            challenge: challenge.key(),
            fan: pledge.fan,
            amount,
        });
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum Status {
    /// Taking pledges.
    Open,
    /// Attempt in progress; no new pledges.
    Locked,
    /// Verified; the pot went to the streamer.
    Paid,
    /// Not achieved; every pledge is refundable.
    Failed,
}

#[account]
#[derive(InitSpace)]
pub struct Challenge {
    pub streamer: Pubkey,
    /// The only key allowed to settle.
    pub verifier: Pubkey,
    pub mint: Pubkey,
    pub id: u64,
    /// Which off-chain adapter decides this challenge (informational).
    pub verifier_kind: u8,
    /// SHA-256 of the canonical condition JSON.
    pub condition_hash: [u8; 32],
    pub deadline: i64,
    pub settle_by: i64,
    pub pledge_cap: u64,
    pub total_pledged: u64,
    pub total_refunded: u64,
    pub status: Status,
    /// SHA-256 of the full evidence record kept off-chain.
    pub evidence_hash: [u8; 32],
    #[max_len(MAX_EVIDENCE_LEN)]
    pub evidence_ref: String,
    pub bump: u8,
    pub vault_bump: u8,
    /// Share of the pot, 0 to MAX_UPFRONT_PCT, paid to the streamer at lock.
    pub upfront_pct: u8,
    /// What lock actually paid out up front.
    pub upfront_paid: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Pledge {
    pub challenge: Pubkey,
    pub fan: Pubkey,
    pub amount: u64,
    pub refunded: bool,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct CreateChallenge<'info> {
    /// Pays rent. Separate from the streamer so the app can sponsor fees.
    #[account(mut)]
    pub payer: Signer<'info>,
    pub streamer: Signer<'info>,
    /// CHECK: Only stored. This key must sign `settle`.
    pub verifier: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = payer,
        space = 8 + Challenge::INIT_SPACE,
        seeds = [b"challenge", streamer.key().as_ref(), &id.to_le_bytes()],
        bump
    )]
    pub challenge: Account<'info, Challenge>,
    #[account(
        init,
        payer = payer,
        seeds = [b"vault", challenge.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = challenge
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PledgeFunds<'info> {
    /// Pays rent for the pledge record, so fans need no SOL.
    #[account(mut)]
    pub payer: Signer<'info>,
    pub fan: Signer<'info>,
    #[account(mut)]
    pub challenge: Account<'info, Challenge>,
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + Pledge::INIT_SPACE,
        seeds = [b"pledge", challenge.key().as_ref(), fan.key().as_ref()],
        bump
    )]
    pub pledge: Account<'info, Pledge>,
    #[account(mut, token::mint = challenge.mint, token::authority = fan)]
    pub fan_token: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"vault", challenge.key().as_ref()], bump = challenge.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LockChallenge<'info> {
    pub authority: Signer<'info>,
    #[account(mut)]
    pub challenge: Account<'info, Challenge>,
    #[account(mut, seeds = [b"vault", challenge.key().as_ref()], bump = challenge.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    /// The streamer's own token account; the up-front share can go nowhere else.
    #[account(mut, token::mint = challenge.mint, token::authority = challenge.streamer)]
    pub streamer_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelChallenge<'info> {
    pub streamer: Signer<'info>,
    #[account(mut, has_one = streamer @ EscrowError::Unauthorized)]
    pub challenge: Account<'info, Challenge>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    pub verifier: Signer<'info>,
    #[account(mut, has_one = verifier @ EscrowError::Unauthorized)]
    pub challenge: Account<'info, Challenge>,
    #[account(mut, seeds = [b"vault", challenge.key().as_ref()], bump = challenge.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    /// The streamer's own token account; the pot can go nowhere else.
    #[account(mut, token::mint = challenge.mint, token::authority = challenge.streamer)]
    pub streamer_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

/// No signer is required: refunds are a public crank.
#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub challenge: Account<'info, Challenge>,
    #[account(
        mut,
        seeds = [b"pledge", challenge.key().as_ref(), pledge.fan.as_ref()],
        bump = pledge.bump,
        has_one = challenge
    )]
    pub pledge: Account<'info, Pledge>,
    /// The fan's own token account; a refund can go nowhere else.
    #[account(mut, token::mint = challenge.mint, token::authority = pledge.fan)]
    pub fan_token: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"vault", challenge.key().as_ref()], bump = challenge.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[event]
pub struct ChallengeCreated {
    pub challenge: Pubkey,
    pub streamer: Pubkey,
    pub id: u64,
    pub deadline: i64,
    pub settle_by: i64,
}

#[event]
pub struct Pledged {
    pub challenge: Pubkey,
    pub fan: Pubkey,
    pub amount: u64,
    pub total_pledged: u64,
}

#[event]
pub struct Locked {
    pub challenge: Pubkey,
    pub total_pledged: u64,
    pub upfront_paid: u64,
}

#[event]
pub struct Cancelled {
    pub challenge: Pubkey,
    pub total_pledged: u64,
}

#[event]
pub struct Settled {
    pub challenge: Pubkey,
    pub success: bool,
    pub paid_out: u64,
    pub evidence_ref: String,
}

#[event]
pub struct Refunded {
    pub challenge: Pubkey,
    pub fan: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum EscrowError {
    #[msg("The deadline must be in the future")]
    DeadlineInPast,
    #[msg("settle_by must be at or after the deadline, within the allowed window")]
    BadSettleWindow,
    #[msg("Amount must be above zero")]
    ZeroAmount,
    #[msg("This challenge is not taking pledges")]
    NotOpen,
    #[msg("The deadline has passed")]
    DeadlinePassed,
    #[msg("That goes over the per-fan pledge cap")]
    OverPledgeCap,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Only the verifier or streamer may do this")]
    Unauthorized,
    #[msg("This challenge was already settled")]
    AlreadySettled,
    #[msg("The settlement window has closed; refunds are open")]
    SettleWindowClosed,
    #[msg("Evidence reference is too long")]
    EvidenceTooLong,
    #[msg("This challenge is not refundable yet")]
    NotRefundable,
    #[msg("This pledge was already refunded")]
    AlreadyRefunded,
    #[msg("At most half the pot can be paid up front")]
    UpfrontTooHigh,
}
