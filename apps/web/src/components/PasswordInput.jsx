import { useState } from 'react';

// Password box with a Show / Hide button, so people can check what they typed.
export default function PasswordInput({ id, ...props }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="pw">
      <input id={id} type={shown ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false} {...props} />
      <button type="button" className="pw-toggle" aria-controls={id} aria-pressed={shown} onClick={() => setShown(!shown)}>
        {shown ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
