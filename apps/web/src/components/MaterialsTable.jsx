export default function MaterialsTable({ materials, usage }) {
  if (!materials.length) return <p className="empty">No materials yet.</p>;
  return (
    <div className="scroll"><table>
      <thead><tr><th>Material</th><th>In stock</th><th>Used today</th><th>Usual daily use</th><th>Status</th></tr></thead>
      <tbody>
        {materials.map((m) => {
          const used = usage[m.id] || 0;
          const high = m.avgDaily && used > m.avgDaily * 1.3;
          const low = m.stock < m.reorderLevel;
          return (
            <tr key={m.id}>
              <td>{m.name}</td><td>{m.stock} {m.unit}</td><td>{used}</td><td>{m.avgDaily || '–'}</td>
              <td>
                {low && <span className="pill warn">Reorder</span>} {high && <span className="pill bad">High use</span>}
                {!low && !high && <span className="pill ok">OK</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table></div>
  );
}
