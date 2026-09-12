import { useEffect, useState } from 'react';
import { attemptMetrics, geometryModeLabels, HISTORY_LIMIT, serializeLabHistory, summarizeAttempts, type LabAttempt } from './lab-history';

export function LabHistory({history, busy, onInspect, onRate}: {
  history: LabAttempt[]; busy: boolean; onInspect: (item: LabAttempt) => void;
  onRate: (id: number, recognition: LabAttempt['recognition']) => void;
}) {
  const [exportText, setExportText] = useState('');
  const [exportUrl, setExportUrl] = useState('');
  useEffect(() => {
    if (!exportText) return;
    const url = URL.createObjectURL(new Blob([exportText], {type: 'application/json'}));
    setExportUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [exportText]);
  return <section className="json-inspector">
    <h2>Compare attempts</h2>
    <p>Last {HISTORY_LIMIT} attempts in this tab, including failures and cancellations. Export before leaving this page.</p>
    <div className="lab-actions"><button disabled={!history.length} onClick={() => setExportText(serializeLabHistory(history))}>Export comparison JSON</button></div>
    {exportText && <div className="comparison-export">
      <p>Snapshot of the attempts at export time. Download it or select and copy the JSON below.</p>
      {exportUrl && <a href={exportUrl} download="skyfall-generation-comparison.json">Download comparison JSON</a>}
      <textarea aria-label="Comparison JSON" readOnly value={exportText} onFocus={event => event.target.select()} rows={7}/>
    </div>}
    {summarizeAttempts(history).map((group, index) => <p key={index}>
      <strong>{group.label}</strong><br/>
      {group.ready}/{group.attempts} ready · {group.failed} failed · {group.cancelled} cancelled · {group.transcribed} transcribed ·
      {' '}median successful time: {group.medianMs === null ? '—' : (group.medianMs/1000).toFixed(1)+' s'}
    </p>)}
    <div className="comparison-scroll"><table className="comparison-table">
      <thead><tr><th>Prompt / models</th><th>Method / result</th><th>Time / tokens</th><th>Recognizable?</th><th>Inspect</th></tr></thead>
      <tbody>{history.map(item => {
        const metrics = attemptMetrics(item.events);
        const usageKnown = metrics.length === 2 && metrics.every(metric => metric.usage);
        return <tr key={item.id}>
          <td>{item.prompt}<small>{item.profile.label} · {item.profile.mode} · {item.inputSource??'text'}</small></td>
          <td>{geometryModeLabels[item.geometryMode]}<small>{item.outcome}</small></td>
          <td>{(item.elapsedMs/1000).toFixed(1)} s{item.voice&&<small>Capture {(item.voice.captureMs/1000).toFixed(1)} s · speech {item.voice.transcription?(item.voice.transcription.metric.durationMs/1000).toFixed(1)+' s':'unavailable'}</small>}<small>{usageKnown
            ? metrics.reduce((sum, metric) => sum+metric.usage!.inputTokens+metric.usage!.outputTokens, 0)+' total tokens'
            : 'Usage incomplete/unavailable'}</small></td>
          <td><select aria-label={'Recognizability of attempt '+item.id} value={item.recognition} disabled={item.outcome !== 'ready'}
            onChange={event => onRate(item.id, event.target.value as LabAttempt['recognition'])}>
            <option value="unrated">Unrated</option><option value="clear">Clear</option>
            <option value="partial">Partial</option><option value="unclear">Unclear</option>
          </select></td>
          <td><button disabled={busy} onClick={() => onInspect(item)}>Inspect</button></td>
        </tr>;
      })}</tbody>
    </table></div>
  </section>;
}
