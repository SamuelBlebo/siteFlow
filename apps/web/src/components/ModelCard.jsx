import { useEffect, useRef, useState } from 'react';
import { MODEL_MAX_MB, checkModelFile, friendlyError } from '@siteflow/shared';
import { useAuth } from '../auth/AuthProvider';
import { removeModel, uploadModel } from '../lib/model';
import { save, toast } from '../lib/save';

// The architect's 3D model on the project overview. Managers upload, replace or remove it;
// everyone on the project opens it and turns it around. It downloads only when opened.

const FAILED = 'Could not open this model. Try a GLB or IFC export from your architect.';

export default function ModelCard({ cid, site }) {
  const { can } = useAuth();
  const manage = can('sites.manage');
  const model = site.model;
  const [open, setOpen] = useState(false);
  const [pct, setPct] = useState(null); // upload progress while a file uploads
  const uploading = pct !== null;
  const panel = useRef(null);
  useEffect(() => { setOpen(false); }, [model?.file]);

  if (!model && !manage) return null;
  return (
    <section ref={panel} className="panel model mb" aria-labelledby="model-h">
      <div className="panel-h">
        <div>
          <h2 id="model-h">3D model</h2>
          <p>{model
            ? `${model.name} · ${model.sizeMb} MB${model.uploadedByName ? ` · uploaded by ${model.uploadedByName}` : ''}`
            : 'Upload the architect’s 3D model (IFC or GLB), if you have one.'}</p>
        </div>
        <div className="row-actions">
          {model && !open && <button type="button" className="btn sm gold" onClick={() => setOpen(true)}>Open 3D model</button>}
          {manage && !uploading && <ModelUpload cid={cid} site={site} label={model ? 'Replace' : 'Upload 3D model'} onProgress={setPct} />}
          {manage && model && !uploading && <button type="button" className="btn sm ghost" onClick={async () => {
            if (!window.confirm('Remove the 3D model? The file is deleted for good.')) return;
            try { await save(removeModel(cid, site.id, model), 'The 3D model'); toast('3D model removed.'); } catch (e) { toast(friendlyError(e), 'err'); }
          }}>Remove</button>}
        </div>
      </div>
      {uploading && <div className="model-progress"><progress max="100" value={pct} aria-label="Uploading the 3D model" /> <span className="small muted">Uploading… {pct}%</span></div>}
      {open && model && <ModelViewer key={model.file} model={model} panel={panel} onClose={() => setOpen(false)} />}
    </section>
  );
}

// The file picker. onProgress gets 0-100 while the file uploads, then null.
function ModelUpload({ cid, site, label, onProgress }) {
  const { user, profile } = useAuth();
  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const check = checkModelFile(file.name, file.size);
    if ('error' in check) return toast(check.error, 'err');
    if (!navigator.onLine) return toast('Uploading a 3D model needs an internet connection.', 'err');
    onProgress(0);
    try {
      await uploadModel(cid, site.id, file, site.model || null, { uid: user.uid, name: profile.name }, onProgress);
      toast('3D model uploaded.');
    } catch (err) {
      console.error('Model upload failed', err);
      toast(friendlyError(err, 'Could not upload the 3D model. Try again.'), 'err');
    } finally { onProgress(null); }
  }
  return (
    <label className={`btn sm ${site.model ? 'ghost' : 'gold'}`}>
      {label}
      <input type="file" accept=".ifc,.glb,.gltf" hidden onChange={pick} aria-label={`${label} (IFC, GLB or glTF, up to ${MODEL_MAX_MB} MB)`} />
    </label>
  );
}

function ModelViewer({ model, panel, onClose }) {
  const box = useRef(null);
  const view = useRef(null);
  const [state, setState] = useState('loading'); // loading | ready | failed
  useEffect(() => {
    let gone = false;
    import('../lib/model3d').then(({ loadModel }) => loadModel(box.current, model)).then((v) => {
      if (gone) return v.dispose();
      view.current = v; setState('ready');
    }).catch((e) => { console.error('3D model failed to open', e); if (!gone) setState('failed'); });
    return () => { gone = true; view.current?.dispose(); view.current = null; };
    // Only a new file reloads: the project document changes often (reports, edits) without touching the model
  }, [model.file, model.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="model-view">
      <div ref={box} className="model-canvas" aria-label={`3D model: ${model.name}`} />
      {state === 'loading' && <p className="model-msg">Opening the 3D model… Large models can take a minute.</p>}
      {state === 'failed' && <p className="model-msg err" role="alert">{FAILED}</p>}
      <div className="model-bar">
        {state === 'ready' && <button type="button" className="btn sm ghost" onClick={() => view.current?.resetView()}>Reset view</button>}
        {state === 'ready' && panel.current?.requestFullscreen && <button type="button" className="btn sm ghost" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : panel.current.requestFullscreen())}>Full screen</button>}
        <button type="button" className="btn sm" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
