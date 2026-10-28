// The canvas model behind diagram-N.json, and its translation to a Mermaid flowchart (diagram-N.mmd).
// Mermaid keeps no positions: draw.io lays the diagram out again when it is pasted into Confluence.

export const SHAPES = ['rect', 'rounded', 'diamond', 'stadium', 'circle', 'cylinder'] as const;
export type Shape = (typeof SHAPES)[number];

export interface DiagramNode {
  id: string;
  label: string;
  shape: Shape;
  x: number;
  y: number;
  // Set once the shape is resized on the canvas; otherwise it fits its text. Mermaid ignores them.
  width?: number;
  height?: number;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  dotted: boolean;
  // Drawn with right-angle bends on the canvas instead of a curve. Absent in diagrams saved before it existed.
  // Mermaid ignores it.
  elbow?: boolean;
  // Which side of each node the edge attaches to on the canvas. Mermaid ignores them.
  sourceHandle?: string;
  targetHandle?: string;
}

export interface Diagram {
  version: 1;
  direction: 'TD' | 'LR';
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export const emptyDiagram = (): Diagram => ({ version: 1, direction: 'TD', nodes: [], edges: [] });

const SHAPE_BRACKETS: Record<Shape, [string, string]> = {
  rect: ['[', ']'],
  rounded: ['(', ')'],
  diamond: ['{', '}'],
  stadium: ['([', '])'],
  circle: ['((', '))'],
  cylinder: ['[(', ')]'],
};

// Labels are always quoted. Inside quotes Mermaid reads #name; and #code; entities, so the characters that would
// break the syntax are written as entities and line breaks as <br>.
function quote(label: string): string {
  const text = label
    .replace(/#/g, '#35;')
    .replace(/"/g, '#quot;')
    .replace(/\|/g, '#124;')
    .replace(/</g, '#lt;')
    .replace(/>/g, '#gt;')
    .replace(/\r?\n/g, '<br>');
  return `"${text.trim() === '' ? ' ' : text}"`;
}

export function toMermaid(diagram: Diagram): string {
  // Canvas ids are arbitrary; Mermaid gets short stable ones in node order.
  const ids = new Map(diagram.nodes.map((n, i) => [n.id, `n${i + 1}`]));
  const lines = [`flowchart ${diagram.direction}`];
  for (const node of diagram.nodes) {
    const [open, close] = SHAPE_BRACKETS[node.shape];
    lines.push(`  ${ids.get(node.id)}${open}${quote(node.label)}${close}`);
  }
  for (const edge of diagram.edges) {
    const from = ids.get(edge.source);
    const to = ids.get(edge.target);
    if (!from || !to) continue;
    const arrow = edge.dotted ? '-.->' : '-->';
    const label = edge.label.trim() ? `|${quote(edge.label)}|` : '';
    lines.push(`  ${from} ${arrow}${label} ${to}`);
  }
  return lines.join('\n') + '\n';
}

export function parseDiagram(json: string): Diagram {
  const d = JSON.parse(json) as Partial<Diagram>;
  if (d.version !== 1 || !Array.isArray(d.nodes) || !Array.isArray(d.edges)) throw new Error('Not a diagram file');
  return { version: 1, direction: d.direction === 'LR' ? 'LR' : 'TD', nodes: d.nodes, edges: d.edges };
}
