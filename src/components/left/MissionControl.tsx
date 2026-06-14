import { lazy, Suspense } from 'react';

const Graph3D = lazy(() => import('./graph3d/Graph3D').then((m) => ({ default: m.Graph3D })));
import { TaskTabs } from './TaskTabs';
import { EnvironmentBar } from './EnvironmentBar';
import { ArchiveIndex } from './ArchiveIndex';
import { TelemetryConsole } from './TelemetryConsole';
import { GraphQueryInput } from './GraphQueryInput';
import { Dropzone } from './Dropzone';
import { StateBlock } from '../common/StateBlock';
import { useT } from '../../i18n';

/** Loading fallback shown while the 3D graph chunk is fetched/initialised. */
function GraphLoading() {
  const t = useT();
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <StateBlock kind="loading" title={t('graph.loading')} />
    </div>
  );
}

/**
 * LEFT PANE — Mission Control.
 * Static context, the local knowledge-graph ecosystem (KG · GraphRAG · vectors),
 * isolated task threads, and the gated ingestion perimeter.
 */
export function MissionControl() {
  return (
    <div role="complementary" aria-label="Mission Control" className="flex flex-col h-full bg-neutral-950 border-r border-neutral-900">
      <TaskTabs />
      <EnvironmentBar />
      <div className="relative flex-1 min-h-0">
        <Dropzone>
          <Suspense fallback={<GraphLoading />}>
            <Graph3D />
          </Suspense>
          <ArchiveIndex />
          <TelemetryConsole />
          <GraphQueryInput />
        </Dropzone>
      </div>
    </div>
  );
}
