import { Component } from 'react';

// Catches a crash in a page so the person sees what to do instead of a blank screen.
// The most common one in production: SiteFlow was updated while the page was open, and the old
// page asks for a file that no longer exists. Reloading fixes it.
const isNewVersion = (e) => /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(String(e?.message || e));

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Page crashed', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const update = isNewVersion(error);
    return (
      <section className="wrap narrow" role="alert">
        <h1>{update ? 'SiteFlow has been updated' : 'Something went wrong'}</h1>
        <p className="muted lead">
          {update
            ? 'A newer version is ready. Reload the page to continue.'
            : 'This page hit a problem. Your saved work is safe. Reload to try again; if it keeps happening, tell your SiteFlow contact what you were doing.'}
        </p>
        <div className="actions">
          <button type="button" className="btn" onClick={() => window.location.reload()}>Reload</button>
          {!update && <a className="btn ghost" href="/">Go to the start page</a>}
        </div>
      </section>
    );
  }
}
