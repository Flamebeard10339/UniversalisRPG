import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from 'reactflow';

type TravelEdgeData = {
  label: string;
};

export const TravelEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<TravelEdgeData>) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{ stroke: '#64748b', strokeWidth: 2 }}
      />
      <circle r="4" className="fill-cyan-300">
        <animateMotion dur="2.8s" repeatCount="indefinite" path={edgePath} />
      </circle>
      <EdgeLabelRenderer>
        <div
          className="pointer-events-none absolute rounded bg-slate-950/85 px-2 py-1 text-xs text-slate-200 shadow"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {data?.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};
