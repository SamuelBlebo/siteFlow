# Every account has its own space

## Why
An invited person's account feels like a dummy: they land in someone else's company as, say, "Site supervisor, 0 projects", with nothing of their own. Every login should be a real account that can create projects. Your role then depends on where you are: Owner in your own space, the role you were given in companies that invited you.

## Goals
- Every account owns a company ("your own space") from the moment it exists, invited or not.
- New invitees get it when they accept their invitation. Accounts that already exist without one are offered it in one click.
- You can always reach your own space from the company switcher, and create projects there.

## Non-goals
- Roles per project (option B, rejected 2026-11-23: rewrites permissions and rules while prod is live).
- Changing how invited companies work, their roles, or their project assignments.

## Approaches
1. **Create the own company automatically when the invitation is accepted (chosen).** Reuses the company the `createCompany` function already builds (id = the person's uid, Owner membership, starter plan, default modules).
2. Create it on the person's first "New project": no empty companies, but the account keeps the dummy feel until then. Rejected by the owner.
3. A separate "personal workspace" type: a second kind of company for no gain. Rejected in the 2026-11-19 design too.

## Design
- **Terms at acceptance.** Owning a company needs the Terms of Service and Privacy Policy agreed (recorded as on sign-up). The Accept invitation page gets the same "I agree" checkbox; `acceptInviteInput` gets `acceptTerms: true`.
- **acceptInvite** (invitations, not password resets): after setting the password, if no company with id = uid exists, create it in the same way `createCompany` does: name "<first name>'s projects", country, currency and time zone copied from the inviting company, terms recorded. Add it to `companyIds` but keep `companyId` on the inviting company, so the person opens where they were invited. The shared creation code moves into one helper used by both functions.
- **Existing accounts without their own company** (invited before this change): a card on Home and in the "+ New" menu, "Create your own projects", with a name field prefilled "<first name>'s projects", country prefilled, and the terms checkbox. It calls `createCompany` (unchanged) and switches to the new space.
- **Switcher:** your own company is listed first, labelled "Your projects · Owner". The sidebar shows the switcher whenever you are in more than one company (already the case).
- **Getting started:** the welcome wizard and checklist show only when you open your own space, as for any new owner.

## Left to the builder
Exact wording; where the Home card sits; tests for acceptInvite creating the company once (safe to retry) and not for password-reset links.
