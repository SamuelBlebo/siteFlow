import { useEffect, useState } from 'react';
import { useTitle } from '../lib/hooks';
import PageHead from '../components/PageHead';
import { ErrorState, Loading } from '../components/States';

// Who took the photos in the sample projects, and the licence each is used under
export default function PhotoCredits() {
  useTitle('Photo credits');
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { fetch('/demo/credits.json').then((r) => r.json()).then(setList, setError); }, []);
  return (
    <>
      <PageHead title="Photo credits" sub="Photos in the sample projects come from Wikimedia Commons. They were resized; nothing else was changed." />
      <section className="wrap">
        {error ? <ErrorState error={error} what="the photo credits" /> : !list ? <Loading /> : (
          <div className="scroll"><table>
            <thead><tr><th>Photo</th><th>Original</th><th>Author</th><th>Licence</th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.file}>
                  <td><img src={`/demo/${c.file.replace('.jpg', '-thumb.jpg')}`} alt="" width="96" height="64" style={{ objectFit: 'cover', borderRadius: 6 }} /></td>
                  <td><a href={c.source} target="_blank" rel="noreferrer">{c.title}</a></td>
                  <td>{c.author}</td>
                  <td><a href={c.licenseUrl} target="_blank" rel="noreferrer">{c.license}</a></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
