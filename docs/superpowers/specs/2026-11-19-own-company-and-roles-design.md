# Every account can start a company; see your roles everywhere

## Why
Contractors, consultants and site staff are often invited into someone else's SiteFlow company, and may also run their own jobs. Today an account can only create a company at sign-up, so an invited person can never set up their own projects. They also can't see, in one place, which companies they're in and what role they play.

## Goals
- Any signed-in account that doesn't own a company can **start its own company** and becomes its Owner. Its other memberships are untouched.
- A **"Your companies and projects"** section on the Account page lists every company the person belongs to, their **role** there, and the projects that role covers. Selecting a company switches to it.
- The sidebar company switcher shows the role next to each company name ("Mensah Builders · Site supervisor").

## Non-goals
- Roles per project. Roles stay per company (security rules, functions and menus all depend on it); a company already limits site roles to chosen projects, which covers the need.
- More than one owned company per account (the server uses the owner's uid as the company id).
- Leaving a company yourself, or merging companies.

## Approaches
1. **Web screens only, reusing the existing `createCompany` function (chosen).** The function already handles "someone already in another company starting their own": it adds the company to `companyIds` and switches to it. Rules already let a person read their own membership and, as a member, that company's projects.
2. Per-project roles: rejected above, weeks of rules and function changes.
3. A separate "personal workspace" type: adds a second kind of company for no gain over a normal company the person owns.

## Design
- **Start your own company:** a shared `CompanySetupForm` (company name, your name, country, terms), taken out of `FinishSetup.jsx` and used there and on the Account page. Shown on Account as a card "Run your own projects? Start your own company" only when the account has no company whose id is its uid. On success the app switches to the new company and opens Home (the welcome wizard follows, as for any new owner).
- **Your companies and projects** (Account page): one row per company in `companyIds`: name, role, and either "All projects (N)" for all-projects roles or the names of assigned projects (open ones first, at most 5, then "and N more"). The current company is marked "You're here"; other rows have "Switch". A switched-off membership shows "Access switched off" and no Switch button. A paused company shows "Paused".
- **Company switcher:** option text `Company · Role`.
- **Data:** read `companies/{cid}`, `companies/{cid}/members/{uid}` and the needed sites per company, once when the page opens (no live listeners).

## Left to the builder
Exact wording of hints; layout within the Account page's existing `acct-sec` style.
