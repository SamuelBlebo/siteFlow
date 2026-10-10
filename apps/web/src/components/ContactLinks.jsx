import { waPhone } from '@siteflow/shared';

// Call and WhatsApp for a person: calls go to their call number, or their WhatsApp number when they
// have no separate one. Local numbers get the company's dialling code.
export default function ContactLinks({ person, compact = false }) {
  const wa = person?.phone ? waPhone(person.phone) : '';
  const call = person?.callPhone ? waPhone(person.callPhone) : wa;
  if (!wa && !call) return null;
  const first = (person?.name || '').split(' ')[0];
  return (
    <span className={`contact-links ${compact ? 'compact' : ''}`}>
      {call && <a className="btn ghost sm" href={`tel:+${call}`} aria-label={`Call ${person.name}`} title={`+${call}`}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M3.6 1.2 5.8 3.4c.4.4.4 1 0 1.4L4.7 5.9a9.6 9.6 0 0 0 5.4 5.4l1.1-1.1c.4-.4 1-.4 1.4 0l2.2 2.2c.4.4.4 1 0 1.4l-1.3 1.3c-.6.6-1.6.8-2.4.5A15 15 0 0 1 .4 4.8C.1 4 .3 3 .9 2.4L2.2 1.2c.4-.4 1-.4 1.4 0Z" /></svg>
        {compact ? 'Call' : `Call ${first}`}</a>}
      {wa && <a className="btn ghost sm" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${person.name}`}>WhatsApp</a>}
    </span>
  );
}
