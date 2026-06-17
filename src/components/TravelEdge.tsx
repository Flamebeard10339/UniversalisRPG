import { BaseEdge, type EdgeProps, getStraightPath } from 'reactflow';

type TravelEdgeData = {
  active: boolean;
  progress: number;
  sourcePoint: { x: number; y: number };
  targetPoint: { x: number; y: number };
};

export const TravelEdge = ({
  id,
  markerEnd,
  data,
}: EdgeProps<TravelEdgeData>) => {
  const sourcePoint = data?.sourcePoint ?? { x: 0, y: 0 };
  const targetPoint = data?.targetPoint ?? { x: 0, y: 0 };
  const progress = data?.progress ?? 0;
  const dotX = sourcePoint.x + (targetPoint.x - sourcePoint.x) * progress;
  const dotY = sourcePoint.y + (targetPoint.y - sourcePoint.y) * progress;
  const [edgePath] = getStraightPath({
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    targetX: targetPoint.x,
    targetY: targetPoint.y,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{ stroke: data?.active ? '#67e8f9' : '#64748b', strokeWidth: data?.active ? 3 : 2 }}
      />
      {data?.active && (
        <circle cx={dotX} cy={dotY} r="5" className="fill-cyan-200 drop-shadow" />
      )}
    </>
  );
};
