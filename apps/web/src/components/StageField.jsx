import { useState } from 'react';
import { STAGE_MAX, WORK_TYPES, stagesFor, workTypeOf } from '@siteflow/shared';

const TYPE_IN = '__type_in';

// Current stage: pick from the usual stages for the kind of work, or type any stage in.
// withType adds a "Type of work" choice (site form); otherwise the list follows the current stage.
export default function StageField({ id, value, onChange, withType }) {
  const [type, setType] = useState(() => workTypeOf(value));
  const list = stagesFor(type);
  const [typing, setTyping] = useState(() => !list.length || (!!value && !list.includes(value)));

  function pickType(t) {
    const next = stagesFor(t);
    setType(t);
    setTyping(!next.length);
    onChange(next[0] || '');
  }

  return (
    <>
      {withType && (
        <div className="field"><label htmlFor={`${id}-type`}>Type of work</label>
          <select id={`${id}-type`} value={type} onChange={(e) => pickType(e.target.value)}>
            {WORK_TYPES.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
          </select></div>
      )}
      <div className="field"><label htmlFor={id}>Current stage</label>
        {typing ? (
          <>
            <input id={id} value={value || ''} maxLength={STAGE_MAX} placeholder="e.g. Kerb laying" onChange={(e) => onChange(e.target.value)} />
            {list.length > 0 && <button type="button" className="link-btn" onClick={() => { setTyping(false); onChange(list[0]); }}>Choose from the list</button>}
          </>
        ) : (
          <select id={id} value={value} onChange={(e) => {
            if (e.target.value === TYPE_IN) { setTyping(true); onChange(''); } else onChange(e.target.value);
          }}>
            {list.map((s) => <option key={s}>{s}</option>)}
            <option value={TYPE_IN}>Other: type it in…</option>
          </select>
        )}
      </div>
    </>
  );
}
