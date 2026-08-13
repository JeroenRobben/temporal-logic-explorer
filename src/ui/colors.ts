const PALETTE = [
  '#e05252', '#3a9ec2', '#52b788', '#e0a52e',
  '#9b6dd6', '#d66d9b', '#2ab5a5', '#7f8c3a',
];

export function colorForNode(nodeId: number): string {
  return PALETTE[nodeId % PALETTE.length];
}

export const EVIDENCE_COLOR = '#ff7f2a';
export const TRACE_COLOR = '#7c3aed';
