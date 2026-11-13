// Experiment-tree records use `node-T05`, while the history-evidence atlas (research-data.json)
// keys the same nodes as `T05`. This is the single place that converts between the two.
const RESEARCH_NODE_ID = /^[A-Z]\d{2,3}$/;

export function researchNodeIdOf(recordId: unknown) {
    const raw = String(recordId ?? '').trim().replace(/^node-/, '');
    return RESEARCH_NODE_ID.test(raw) ? raw : '';
}
