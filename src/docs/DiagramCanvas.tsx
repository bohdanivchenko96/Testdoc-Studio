import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BaseEdge,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getNodesBounds,
  Handle,
  MarkerType,
  NodeResizer,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';
import { useEffect, useRef, useState } from 'react';
import { emptyDiagram, parseDiagram, toMermaid, type Diagram, type Shape } from '../../shared/diagram';
import { docsApi } from '../api';

// editing: the label is open for typing. It lives only on the canvas and never reaches diagram-N.json.
type ShapeNode = Node<{ label: string; shape: Shape; editing?: boolean }, 'shape'>;
type FlowEdge = Edge<{ dotted: boolean; elbow?: boolean; editing?: boolean }, 'labeled'>;

const SHAPE_TOOLS: { shape: Shape; label: string; title: string; defaultText: string }[] = [
  { shape: 'rect', label: '▭', title: 'Step (rectangle)', defaultText: 'Step' },
  { shape: 'rounded', label: '▢', title: 'Action (rounded)', defaultText: 'Action' },
  { shape: 'diamond', label: '◇', title: 'Decision (diamond)', defaultText: 'Decision?' },
  { shape: 'stadium', label: '⬭', title: 'Start / end (stadium)', defaultText: 'Start' },
  { shape: 'circle', label: '○', title: 'Point (circle)', defaultText: '' },
  { shape: 'cylinder', label: '⛁', title: 'Database (cylinder)', defaultText: 'DB' },
];

const SNAPSHOT_PADDING = 24;

let nextId = 1;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${nextId++}`;

const STROKE = '#42526e';
// Paint goes in SVG attributes, not CSS: html-to-image drops stylesheet fills, and the PNG showed black shapes.
const SHAPE_PAINT = { fill: '#fff', stroke: STROKE, strokeWidth: 2, vectorEffect: 'non-scaling-stroke' } as const;

// In-place label editor. Enter or a click elsewhere keeps the text, Shift+Enter adds a line, Escape cancels.
// React Flow ignores its keyboard shortcuts (Delete) while a textarea has focus; nodrag/nopan keep mouse selection working.
function LabelInput({ initial, onDone }: { initial: string; onDone: (label: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  // Escape unmounts the textarea, which may still fire blur.
  const finished = useRef(false);

  // autoFocus is not enough: React Flow keeps a new node hidden until it has measured it, and a hidden element
  // can't take focus. Retry for a few frames.
  useEffect(() => {
    let frame = 0;
    let tries = 0;
    const tryFocus = () => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      if (document.activeElement === el) el.select();
      else if (++tries < 10) frame = requestAnimationFrame(tryFocus);
    };
    tryFocus();
    return () => cancelAnimationFrame(frame);
  }, []);

  const finish = (label: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(label);
  };
  return (
    <textarea
      ref={ref}
      className="label-input nodrag nopan nowheel"
      rows={1}
      value={value}
      aria-label="Label"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          finish(value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(null);
        }
      }}
    />
  );
}

// Each side has one handle; ConnectionMode.Loose lets any handle start or end an edge.
// A resized node has a fixed size; until then it fits its text.
function ShapeNodeView({ id, data, selected, width }: NodeProps<ShapeNode>) {
  const { updateNodeData } = useReactFlow<ShapeNode, FlowEdge>();
  const sized = width !== undefined;
  return (
    <div
      className={`shape-node shape-${data.shape}${selected ? ' selected' : ''}`}
      style={sized ? { width: '100%', height: '100%', minWidth: 0, minHeight: 0 } : undefined}
    >
      <NodeResizer isVisible={selected} minWidth={40} minHeight={30} keepAspectRatio={data.shape === 'circle'} color="#4c9aff" />
      {data.shape === 'diamond' && (
        <svg className="shape-bg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points="50,1 99,50 50,99 1,50" {...SHAPE_PAINT} />
        </svg>
      )}
      {data.shape === 'cylinder' && (
        <svg className="shape-bg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M1,12 A49,11 0 0 0 99,12 L99,88 A49,11 0 0 1 1,88 Z" {...SHAPE_PAINT} />
          <path d="M1,12 A49,11 0 0 1 99,12" {...SHAPE_PAINT} fill="none" />
        </svg>
      )}
      {data.editing ? (
        <LabelInput
          initial={data.label}
          onDone={(label) => updateNodeData(id, { editing: false, ...(label !== null && { label }) })}
        />
      ) : (
        <span className="shape-label">{data.label}</span>
      )}
      <Handle type="source" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <Handle type="source" position={Position.Left} id="l" />
    </div>
  );
}

// An elbow (right-angle bends, routed by the sides the edge leaves and enters) or curved edge whose label is HTML,
// so it can be edited in place. EdgeLabelRenderer draws inside the viewport, so the label still lands in the PNG.
function LabeledEdge({ id, label, data, markerEnd, style, ...geometry }: EdgeProps<FlowEdge>) {
  const { updateEdge, setEdges, setNodes } = useReactFlow<ShapeNode, FlowEdge>();
  // The label is HTML outside the edge's SVG, so a click on it selects the edge explicitly.
  const select = () => {
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setEdges((es) => es.map((e) => (e.selected !== (e.id === id) ? { ...e, selected: e.id === id } : e)));
  };
  const [path, labelX, labelY] = data?.elbow ? getSmoothStepPath({ ...geometry, borderRadius: 6 }) : getBezierPath(geometry);
  const text = typeof label === 'string' ? label : '';
  const edgeData = { dotted: data?.dotted ?? false, elbow: data?.elbow };
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {(text || data?.editing) && (
        <EdgeLabelRenderer>
          <div
            className="edge-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            onClick={() => !data?.editing && select()}
            onDoubleClick={() => updateEdge(id, { data: { ...edgeData, editing: true } })}
          >
            {data?.editing ? (
              <LabelInput
                initial={text}
                onDone={(next) => updateEdge(id, { data: edgeData, ...(next !== null && { label: next.trim() ? next : undefined }) })}
              />
            ) : (
              text
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { shape: ShapeNodeView };
const edgeTypes = { labeled: LabeledEdge };

function styled(edge: FlowEdge): FlowEdge {
  const dotted = edge.data?.dotted ?? false;
  return {
    ...edge,
    type: 'labeled',
    data: { dotted, elbow: edge.data?.elbow },
    markerEnd: { type: MarkerType.ArrowClosed, color: STROKE },
    style: { stroke: STROKE, strokeWidth: 1.5, ...(dotted && { strokeDasharray: '6 4' }) },
  };
}

function toFlow(diagram: Diagram): { nodes: ShapeNode[]; edges: FlowEdge[] } {
  return {
    nodes: diagram.nodes.map((n) => ({
      id: n.id,
      type: 'shape',
      position: { x: n.x, y: n.y },
      ...(n.width && n.height && { width: n.width, height: n.height }),
      data: { label: n.label, shape: n.shape },
    })),
    edges: diagram.edges.map((e) =>
      styled({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        label: e.label || undefined,
        data: { dotted: e.dotted, elbow: e.elbow },
      }),
    ),
  };
}

function fromFlow(direction: Diagram['direction'], nodes: ShapeNode[], edges: FlowEdge[]): Diagram {
  return {
    version: 1,
    direction,
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.data.label,
      shape: n.data.shape,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      ...(n.width !== undefined && n.height !== undefined && { width: Math.round(n.width), height: Math.round(n.height) }),
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === 'string' ? e.label : '',
      dotted: e.data?.dotted ?? false,
      ...(e.data?.elbow && { elbow: true }),
      ...(e.sourceHandle && { sourceHandle: e.sourceHandle }),
      ...(e.targetHandle && { targetHandle: e.targetHandle }),
    })),
  };
}

interface Props {
  docId: string;
  // diagram-N to edit, or null for a new diagram.
  diagram: string | null;
  onSaved: (diagram: string) => void;
  onClose: () => void;
  onError: (e: unknown) => void;
}

// Full-screen flowchart editor. Save writes diagram-N.json (this model), .mmd (Mermaid) and .png (a snapshot).
export function DiagramCanvas({ docId, diagram, onSaved, onClose, onError }: Props) {
  const [loaded, setLoaded] = useState(diagram === null);
  const [direction, setDirection] = useState<Diagram['direction']>('TD');
  const [nodes, setNodes] = useState<ShapeNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [saving, setSaving] = useState(false);
  const savedJson = useRef(JSON.stringify(emptyDiagram()));
  const flowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (diagram === null) return;
    fetch(docsApi.fileUrl(docId, `${diagram}.json`, Date.now()))
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load ${diagram}.json (${res.status})`);
        return res.text();
      })
      .then((json) => {
        const model = parseDiagram(json);
        const flow = toFlow(model);
        setDirection(model.direction);
        setNodes(flow.nodes);
        setEdges(flow.edges);
        savedJson.current = JSON.stringify(model);
        setLoaded(true);
      })
      .catch((e: unknown) => {
        onError(e);
        onClose();
      });
    // Loads once per opened diagram; the callbacks are not dependencies.
  }, [docId, diagram]);

  const model = () => fromFlow(direction, nodes, edges);

  // New shapes go below the lowest one, so they never land on top of each other.
  const addShape = (tool: (typeof SHAPE_TOOLS)[number]) => {
    const bottom = nodes.reduce((max, n) => Math.max(max, n.position.y + (n.measured?.height ?? 60)), 0);
    setNodes((ns) => [
      ...ns.map((n) => ({ ...n, selected: false })),
      {
        id: newId('node'),
        type: 'shape',
        position: { x: 80, y: nodes.length ? bottom + 60 : 40 },
        // Opens with the default text selected, so typing replaces it.
        data: { label: tool.defaultText, shape: tool.shape, editing: true },
        selected: true,
      },
    ]);
  };

  const toggleSelected = (flag: 'dotted' | 'elbow') =>
    setEdges((es) =>
      es.map((e) => (e.selected ? styled({ ...e, data: { dotted: false, ...e.data, [flag]: !e.data?.[flag] } }) : e)),
    );

  const snapshot = async (): Promise<string> => {
    // Clear the selection so the PNG shows no highlight, then wait for React Flow to repaint.
    setNodes((ns) => ns.map((n) => ({ ...n, selected: false })));
    setEdges((es) => es.map((e) => ({ ...e, selected: false })));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const bounds = getNodesBounds(nodes);
    const width = Math.ceil(bounds.width + SNAPSHOT_PADDING * 2);
    const height = Math.ceil(bounds.height + SNAPSHOT_PADDING * 2);
    const viewport = flowRef.current!.querySelector<HTMLElement>('.react-flow__viewport')!;
    const dataUrl = await toPng(viewport, {
      backgroundColor: '#ffffff',
      width,
      height,
      pixelRatio: 2,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${SNAPSHOT_PADDING - bounds.x}px, ${SNAPSHOT_PADDING - bounds.y}px) scale(1)`,
      },
      filter: (el) => !(el instanceof HTMLElement && el.classList.contains('react-flow__handle')),
    });
    return dataUrl.slice(dataUrl.indexOf(',') + 1);
  };

  const save = async () => {
    if (nodes.length === 0) {
      onError(new Error('Add at least one shape before saving'));
      return;
    }
    setSaving(true);
    try {
      const current = model();
      const { name } = await docsApi.saveDiagram(docId, diagram, {
        json: JSON.stringify(current, null, 2) + '\n',
        mmd: toMermaid(current),
        png: await snapshot(),
      });
      savedJson.current = JSON.stringify(current);
      onSaved(name);
    } catch (e) {
      onError(e);
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (JSON.stringify(model()) !== savedJson.current && !window.confirm('Discard unsaved diagram changes?')) return;
    onClose();
  };

  const selectedEdges = edges.filter((e) => e.selected).length;

  // Cmd/Ctrl+A selects every shape and arrow (React Flow has no shortcut for it). Inside a label it selects text.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'a' || !(e.metaKey || e.ctrlKey) || (e.target as HTMLElement).closest('input, textarea')) return;
      e.preventDefault();
      setNodes((ns) => ns.map((n) => ({ ...n, selected: true })));
      setEdges((es) => es.map((ed) => ({ ...ed, selected: true })));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="canvas-overlay" role="dialog" aria-label="Diagram editor">
      <div className="canvas-bar">
        <strong>{diagram ?? 'New diagram'}</strong>
        <div className="doc-toolbar-group">
          {SHAPE_TOOLS.map((tool) => (
            <button key={tool.shape} type="button" title={tool.title} onClick={() => addShape(tool)}>
              {tool.label}
            </button>
          ))}
        </div>
        <div className="doc-toolbar-group">
          <button type="button" title="Toggle dotted line on the selected arrows" disabled={!selectedEdges} onClick={() => toggleSelected('dotted')}>
            Dotted
          </button>
          <button
            type="button"
            title="Toggle the selected arrows between right-angle bends and a curve"
            disabled={!selectedEdges}
            onClick={() => toggleSelected('elbow')}
          >
            Elbow / curve
          </button>
          <button
            type="button"
            title="Layout direction draw.io will use: top-down or left-right"
            onClick={() => setDirection((d) => (d === 'TD' ? 'LR' : 'TD'))}
          >
            {direction === 'TD' ? 'Top → down' : 'Left → right'}
          </button>
        </div>
        <span
          className="muted canvas-hint"
          title="Drag on empty space to select an area · Shift/Cmd+click adds to the selection · Cmd+A selects all · drag a selected shape to move them all · scroll or right-drag to pan · pinch or Ctrl+scroll to zoom"
        >
          Drag from a dot to connect · double-click to edit text · drag on empty space to select · Delete removes
        </span>
        <button type="button" className="btn" onClick={close}>
          Close
        </button>
        <button type="button" className="btn btn-primary" disabled={saving || !loaded} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="canvas-flow" ref={flowRef}>
        {loaded && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            deleteKeyCode={['Backspace', 'Delete']}
            // As in draw.io: a drag on empty space draws a selection box; the canvas pans with scroll or a
            // right/middle-button drag. Shift (no longer needed for the box) joins Cmd/Ctrl for adding to a selection.
            selectionOnDrag
            selectionKeyCode={null}
            multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
            panOnDrag={[1, 2]}
            panOnScroll
            fitView={diagram !== null}
            onNodesChange={(changes) => setNodes((ns) => applyNodeChanges(changes, ns))}
            onEdgesChange={(changes) => setEdges((es) => applyEdgeChanges(changes, es))}
            connectionLineType={ConnectionLineType.SmoothStep}
            onConnect={(connection) =>
              setEdges((es) => addEdge(styled({ ...connection, id: newId('edge'), data: { dotted: false, elbow: true } }), es))
            }
            onNodeDoubleClick={(_, node) =>
              setNodes((ns) => ns.map((n) => (n.id === node.id ? { ...n, data: { ...n.data, editing: true } } : n)))
            }
            onEdgeDoubleClick={(_, edge) =>
              setEdges((es) => es.map((e) => (e.id === edge.id ? { ...e, data: { dotted: false, ...e.data, editing: true } } : e)))
            }
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
