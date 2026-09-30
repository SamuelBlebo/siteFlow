import { materialStatus } from '@siteflow/shared';
import { Empty } from './States';

export default function MaterialsTable({ materials, usage }) {
  if (!materials.length) return <Empty title="No materials yet.">Materials are set up on the site page by a manager.</Empty>;
  return (
    <div className="scroll"><table>
      <thead><tr><th>Material</th><th>In stock</th><th>Used today</th><th>Usual daily use</th><th>Status</th></tr></thead>
      <tbody>
        {materials.map((m) => {
          const used = usage[m.id] || 0;
          const { low, highUse } = materialStatus(m, used);
          return (
            <tr key={m.id}>
              <td>{m.name}</td><td>{m.stock} {m.unit}</td><td>{used}</td><td>{m.avgDaily || '–'}</td>
              <td>
                {low && <span className="pill warn">Reorder</span>} {highUse && <span className="pill bad">High use</span>}
                {!low && !highUse && <span className="pill ok">OK</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table></div>
  );
}
