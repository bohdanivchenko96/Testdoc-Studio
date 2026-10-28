import { describe, expect, it } from 'vitest';
import { emptyDiagram, parseDiagram, SHAPES, toMermaid, type Diagram } from './diagram';

const node = (id: string, label: string, shape: Diagram['nodes'][number]['shape'] = 'rect') => ({ id, label, shape, x: 0, y: 0 });

describe('toMermaid', () => {
  it('writes every shape with quoted labels', () => {
    const diagram: Diagram = { ...emptyDiagram(), nodes: SHAPES.map((shape, i) => node(`x${i}`, shape, shape)) };
    expect(toMermaid(diagram)).toBe(
      [
        'flowchart TD',
        '  n1["rect"]',
        '  n2("rounded")',
        '  n3{"diamond"}',
        '  n4(["stadium"])',
        '  n5(("circle"))',
        '  n6[("cylinder")]',
        '',
      ].join('\n'),
    );
  });

  it('writes solid and dotted edges, with and without labels', () => {
    const diagram: Diagram = {
      version: 1,
      direction: 'LR',
      nodes: [node('a', 'Start'), node('b', 'OK?', 'diamond')],
      edges: [
        { id: 'e1', source: 'a', target: 'b', label: '', dotted: false },
        { id: 'e2', source: 'b', target: 'a', label: 'no', dotted: true },
        { id: 'e3', source: 'a', target: 'gone', label: '', dotted: false },
      ],
    };
    expect(toMermaid(diagram)).toBe(
      ['flowchart LR', '  n1["Start"]', '  n2{"OK?"}', '  n1 --> n2', '  n2 -.->|"no"| n1', ''].join('\n'),
    );
  });

  it('escapes characters that would break the syntax', () => {
    const diagram: Diagram = { ...emptyDiagram(), nodes: [node('a', 'Say "hi" | #1 <b>\nnext'), node('b', '  ')] };
    expect(toMermaid(diagram)).toBe(
      'flowchart TD\n  n1["Say #quot;hi#quot; #124; #35;1 #lt;b#gt;<br>next"]\n  n2[" "]\n',
    );
  });
});

describe('parseDiagram', () => {
  it('round-trips the JSON model', () => {
    const diagram: Diagram = { ...emptyDiagram(), direction: 'LR', nodes: [node('a', 'A')] };
    expect(parseDiagram(JSON.stringify(diagram))).toEqual(diagram);
  });

  it('rejects other JSON', () => {
    expect(() => parseDiagram('{"nodes": 1}')).toThrow('Not a diagram file');
  });
});
