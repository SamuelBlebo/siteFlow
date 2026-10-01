import { daysLeft, materialStatus } from '@siteflow/shared';
import { Empty } from './States';

// Stock on site. rates (optional): average daily use per material, for "days left".
export default function MaterialsTable({ materials, usage, rates }) {
  if (!materials.length) return <Empty title="No materials yet.">Materials are set up by a project manager under Set up.</Empty>;
  return (
    <div className="scroll"><table>
      <thead><tr>
        <th>Material</th><th>In stock</th><th>Used today</th>
        {rates && <><th>Average a day</th><th>Days left</th></>}
        <th>Reorder below</th><th>Status</th>
      </tr></thead>
      <tbody>
        {materials.map((m) => {
          const used = usage[m.id] || 0;
          const { low, highUse, negative } = materialStatus(m, used);
          const rate = rates?.[m.id] || m.avgDaily || 0;
          const left = daysLeft(m.stock, rate);
          return (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td className={negative ? 'neg' : ''}><b>{m.stock}</b> {m.unit}</td>
              <td>{used || '–'}</td>
              {rates && <><td>{rates[m.id] ? `${rates[m.id]} ${m.unit}` : '–'}</td><td>{left == null ? '–' : left === 0 ? 'Out' : `${left} day${left === 1 ? '' : 's'}`}</td></>}
              <td>{m.reorderLevel || '–'}</td>
              <td>
                {negative && <span className="pill bad" title="More recorded as used than received. Do a stock count.">Below zero</span>}
                {!negative && low && <span className="pill warn">Reorder</span>} {highUse && <span className="pill bad">High use today</span>}
                {!low && !highUse && !negative && <span className="pill ok">OK</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table></div>
  );
}
