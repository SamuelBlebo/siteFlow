import { useAuth } from '../auth/AuthProvider';
import { SKIN_LIST, useSkin } from '../lib/skin';
import { toast } from '../lib/save';

// Choose your skin: the accent colour SiteFlow uses for you (Brass, Amber or Navy)
export default function SkinPicker() {
  const { user } = useAuth();
  const [skin, setSkin] = useSkin(user?.uid);
  const pick = (k) => setSkin(k).catch(() => toast('Your skin is set on this browser but could not be saved to your account. Try again.', 'err'));
  return (
    <div className="skin-pick" role="radiogroup" aria-label="Skin">
      {SKIN_LIST.map(([k, label, color]) => (
        <button key={k} type="button" role="radio" aria-checked={skin === k} onClick={() => pick(k)}>
          <i style={{ background: color }} aria-hidden="true" />{label}
        </button>
      ))}
    </div>
  );
}
