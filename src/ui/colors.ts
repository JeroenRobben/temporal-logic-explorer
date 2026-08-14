/** Per-subformula colors are DERIVED from the node id (data-driven, not
 *  theme-driven): the same subformula keeps the same hue across renders.
 *  These mid-tone hues are legible on both light and dark surfaces, so the
 *  palette deliberately stays out of the theme token system (which covers
 *  every fixed/semantic color — see src/styles.css). */
const PALETTE = [
  '#e05252', '#3a9ec2', '#52b788', '#e0a52e',
  '#9b6dd6', '#d66d9b', '#2ab5a5', '#7f8c3a',
];

export function colorForNode(nodeId: number): string {
  return PALETTE[nodeId % PALETTE.length];
}
