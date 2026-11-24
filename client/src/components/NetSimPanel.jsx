import { useEffect, useState } from 'react';
import { netSim, FAULTS } from '../lib/netSim.js';

// Panou de demonstrație: programează defecte de rețea pentru următoarele cereri de sincronizare.
export function NetSimPanel() {
  const [open, setOpen] = useState(false);
  const [sim, setSim] = useState({ queue: [], log: [] });
  useEffect(() => netSim.subscribe(setSim), []);

  return (
    <section className="card netsim">
      <button type="button" className="netsim-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        Simulator de rețea {sim.queue.length > 0 && `(${sim.queue.length} programate)`} {open ? '▲' : '▼'}
      </button>
      {open && (
        <div>
          <p className="muted">Următoarele cereri de sincronizare vor avea, în ordine, defectele alese:</p>
          <div className="btn-row">
            {Object.entries(FAULTS).map(([key, label]) => (
              <button key={key} type="button" className="btn btn-small" onClick={() => netSim.enqueue(key)}>+ {label}</button>
            ))}
            <button type="button" className="btn btn-small btn-ghost" onClick={() => netSim.clear()}>Golește</button>
          </div>
          <p><strong>Coadă:</strong> {sim.queue.length ? sim.queue.map((f) => FAULTS[f]).join(' → ') : 'goală (rețea normală)'}</p>
          {sim.log.length > 0 && (
            <ul className="netsim-log">
              {sim.log.map((e, i) => <li key={i}><span className="muted">{e.at}</span> {e.message}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
