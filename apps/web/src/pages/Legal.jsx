import { Link } from 'react-router-dom';
import { TERMS_VERSION, prettyDate } from '@siteflow/shared';
import { useTitle } from '../lib/hooks';
import Brand from '../components/Brand';

// The Terms of Service and the Privacy Policy, open to everyone (linked from sign-up and the landing page).
// A plain-language draft: the bracketed details are filled in and a lawyer reads both before launch.
// A change that matters to customers gets a new TERMS_VERSION (shared/schemas), so new agreements are recorded against it.

const WHO = {
  company: '[Company legal name]',
  address: '[Registered address]',
  email: '[privacy@your-domain]',
  law: '[Ghana]',
};

const updated = `Last updated ${prettyDate(TERMS_VERSION)} ${TERMS_VERSION.slice(0, 4)}`;

function Page({ title, children }) {
  return (
    <main className="legal">
      <header className="legal-top"><Brand home /><nav aria-label="Legal"><Link to="/terms">Terms of Service</Link><Link to="/privacy">Privacy Policy</Link></nav></header>
      <article className="legal-body">
        <h1>{title}</h1>
        <p className="muted">{updated}</p>
        {children}
      </article>
    </main>
  );
}

export function Terms() {
  useTitle('Terms of Service');
  return (
    <Page title="Terms of Service">
      <p>These terms are an agreement between {WHO.company} ("we") and the company that creates a SiteFlow account ("you"). By creating an account you agree to them on behalf of your company.</p>
      <h2>1. The service</h2>
      <p>SiteFlow is construction project management software: daily reports and photos, issues, progress, materials, labour, budgets, drawings and the other tools you switch on. Tools marked "coming soon" are not part of the service until they are released.</p>
      <h2>2. Your account and your team</h2>
      <ul>
        <li>The person who creates the account is its owner. The owner decides who joins, what role each person has and which projects they see.</li>
        <li>Keep logins private. You are responsible for what happens under your account and for removing people who no longer work with you.</li>
        <li>You confirm you may share the information you put into SiteFlow, including details of workers, clients and subcontractors, and that you have told those people where it is needed.</li>
      </ul>
      <h2>3. Your data</h2>
      <ul>
        <li>Everything your company records in SiteFlow stays yours. We use it only to run the service for you, as set out in the <Link to="/privacy">Privacy Policy</Link>.</li>
        <li>You can ask us for a copy of your data, or to delete your company's account, at any time. After deletion it is removed within 30 days, and from backups within 14 weeks.</li>
      </ul>
      <h2>4. Acceptable use</h2>
      <p>Don't use SiteFlow to break the law, to send spam, to upload harmful files, to try to reach other companies' data, or to overload or copy the service.</p>
      <h2>5. Messages and AI</h2>
      <ul>
        <li>SiteFlow can send emails and WhatsApp messages (reports, reminders, alerts) to the people you choose. Each person can change or stop the messages they get.</li>
        <li>AI overviews are written by a computer from your reports and can be wrong. Check anything important before acting on it.</li>
      </ul>
      <h2>6. Fees</h2>
      <p>SiteFlow is free during the pilot. Before any charge starts, we tell the owner the price in writing and the owner chooses whether to continue.</p>
      <h2>7. Availability and changes</h2>
      <p>We work to keep SiteFlow running and your data safe, with daily backups, but we can't promise it will never be interrupted. We may improve or change features; if we remove one you rely on, we tell you first.</p>
      <h2>8. Responsibility</h2>
      <p>SiteFlow helps you manage your projects; decisions on site, safety, payments and contracts stay yours. As far as the law allows, we are not liable for indirect losses, and our total liability is limited to the fees you paid us in the 12 months before the claim.</p>
      <h2>9. Ending the agreement</h2>
      <p>You can stop using SiteFlow at any time. We may suspend an account that breaks these terms, after warning you where we can.</p>
      <h2>10. Law and contact</h2>
      <p>These terms are governed by the laws of {WHO.law}. Questions: {WHO.email}, {WHO.company}, {WHO.address}.</p>
    </Page>
  );
}

export function Privacy() {
  useTitle('Privacy Policy');
  return (
    <Page title="Privacy Policy">
      <p>This policy explains what information SiteFlow holds, why, who can see it and what you can ask us to do with it. {WHO.company} runs SiteFlow.</p>
      <h2>1. What we hold</h2>
      <ul>
        <li><b>Account details:</b> names, email addresses, phone numbers, roles and preferences of the people in each company.</li>
        <li><b>Project records your company enters:</b> projects and their clients, daily reports and photos, issues, progress, materials, attendance and wages of workers, expenses and budgets, drawings, 3D models and documents.</li>
        <li><b>Technical records:</b> sign-in times, the device and browser used, and errors, to keep the service secure and working.</li>
      </ul>
      <h2>2. Who decides and why we use it</h2>
      <p>For project records, your company decides what is recorded and who sees it; we hold and process them on its behalf, only to provide SiteFlow. For account details, we use them to run your account, send the messages you choose and keep the service secure. We don't sell personal information and we don't use it for advertising.</p>
      <h2>3. Who can see it</h2>
      <ul>
        <li>Inside your company, people see what their role allows. For example, site teams see only their projects, and only finance roles see money.</li>
        <li>We use these providers to run SiteFlow: Google Cloud and Firebase (hosting, database, files and sign-in; data is stored in the European Union, in Belgium), Resend (emails), Meta's WhatsApp Business service (WhatsApp messages, if switched on) and Anthropic (AI overviews, if the SiteFlow AI module is switched on). They may only use the information to provide their service to us.</li>
        <li>We share information with authorities only when the law requires it.</li>
      </ul>
      <h2>4. How long we keep it</h2>
      <p>While the company's account is open. When an account is deleted, its records are removed within 30 days and from backups within 14 weeks.</p>
      <h2>5. How it is protected</h2>
      <p>Connections are encrypted, data is encrypted where it is stored, access follows each person's role, and the database is backed up daily.</p>
      <h2>6. Your rights</h2>
      <p>You can ask to see, correct or delete your information, or object to how it is used. Workers and clients whose details a company recorded can ask that company, or us at {WHO.email}. You can also complain to the data protection authority where you live (in Ghana, the Data Protection Commission).</p>
      <h2>7. Cookies and storage on your device</h2>
      <p>SiteFlow stores only what it needs on your device: your sign-in, your settings (such as light or dark mode) and reports waiting to be sent when you're offline. No advertising or tracking cookies.</p>
      <h2>8. Changes and contact</h2>
      <p>If this policy changes in a way that matters, we tell company owners by email before it applies. Questions: {WHO.email}, {WHO.company}, {WHO.address}.</p>
    </Page>
  );
}
