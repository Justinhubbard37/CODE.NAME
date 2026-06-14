/**
 * LEGACY — kept for reference, NOT used by the running app.
 * These are the 2D React Flow node renderers from the original flat graph.
 * The live graph is the 3D one in src/components/left/graph3d/. Safe to delete
 * once the 3D graph fully covers every node type.
 */
import type { ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import { NodeData } from '../types';
import { FileText, Building2, User, Mic, Files } from 'lucide-react';

const NodeContainer = ({ children, selected }: { children: ReactNode; selected?: boolean }) => (
  <div className={`relative bg-neutral-950 border border-neutral-700/50 p-3 min-w-[200px] shadow-2xl backdrop-blur-sm ${selected ? 'border-neutral-300 shadow-[0_0_15px_rgba(255,255,255,0.1)]' : ''}`}>
    <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-neutral-500 !border-none" />
    <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-neutral-500 !border-none" />
    <Handle type="target" position={Position.Left} id="left" className="!w-1.5 !h-1.5 !bg-neutral-500 !border-none" />
    <Handle type="source" position={Position.Right} id="right" className="!w-1.5 !h-1.5 !bg-neutral-500 !border-none" />
    {children}
  </div>
);

const Field = ({ label, value }: { label: string; value?: string | number }) => {
  if (!value) return null;
  return (
    <div className="flex justify-between text-[10px] my-1 font-mono">
      <span className="text-neutral-500">{label}:</span>
      <span className="text-neutral-300">{value}</span>
    </div>
  );
};

export const DocNode = ({ data, selected }: { data: NodeData; selected?: boolean }) => {
  return (
    <NodeContainer selected={selected}>
      <div className="flex items-start gap-3 mb-2">
        <FileText className="w-6 h-6 text-neutral-400 stroke-[1.5]" />
        <div>
          <div className="text-xs text-neutral-200 font-bold tracking-wider">{data.label}</div>
        </div>
      </div>
      <div className="border-t border-neutral-800 pt-2">
        <Field label="TYPE" value={data.type} />
        <Field label="TITLE" value={data.title} />
        <Field label="PAGES" value={data.pages} />
        <Field label="DATE" value={data.date} />
        <Field label="CLASS" value={data.class} />
      </div>
    </NodeContainer>
  );
};

export const OrgNode = ({ data, selected }: { data: NodeData; selected?: boolean }) => {
  return (
    <NodeContainer selected={selected}>
      <div className="flex items-start gap-3 mb-2">
        <Building2 className="w-6 h-6 text-neutral-400 stroke-[1.5]" />
        <div>
          <div className="text-xs text-neutral-200 font-bold tracking-wider">{data.label}</div>
        </div>
      </div>
      <div className="border-t border-neutral-800 pt-2">
        <Field label="TYPE" value={data.type} />
        <Field label="NAME" value={data.name} />
        <Field label="TIER" value={data.tier} />
        <Field label="CLASS" value={data.class} />
      </div>
    </NodeContainer>
  );
};

export const SubjectNode = ({ data, selected }: { data: NodeData; selected?: boolean }) => {
  return (
    <NodeContainer selected={selected}>
      <div className="flex items-start gap-3 mb-2">
        <User className="w-6 h-6 text-neutral-400 stroke-[1.5]" />
        <div>
          <div className="text-xs text-neutral-200 font-bold tracking-wider">{data.label}</div>
        </div>
      </div>
      <div className="border-t border-neutral-800 pt-2">
        <Field label="TYPE" value={data.type} />
        <Field label="NAME" value={data.name} />
        <Field label="ALIAS" value={data.alias} />
        <Field label="NAT" value={data.nat} />
        <Field label="STATUS" value={data.status} />
        <Field label="CLASS" value={data.class} />
      </div>
    </NodeContainer>
  );
};

export const AudioNode = ({ data, selected }: { data: NodeData; selected?: boolean }) => {
  return (
    <NodeContainer selected={selected}>
      <div className="flex items-start gap-3 mb-2">
        <div className="flex gap-0.5 items-center justify-center w-8 h-6 overflow-hidden">
           {[...Array(8)].map((_, i) => (
             <div key={i} className="w-[1px] bg-neutral-500 animate-pulse" style={{ height: `${Math.random() * 100}%`, animationDelay: `${i * 0.1}s` }} />
           ))}
        </div>
        <div>
          <div className="text-xs text-neutral-200 font-bold tracking-wider">{data.label}</div>
        </div>
      </div>
      <div className="border-t border-neutral-800 pt-2">
        <Field label="TYPE" value={data.type} />
        <Field label="SRC" value={data.src} />
        <Field label="DATE" value={data.date} />
        <Field label="CLASS" value={data.class} />
      </div>
    </NodeContainer>
  );
};

export const ClusterNode = ({ data, selected }: { data: NodeData; selected?: boolean }) => {
  return (
    <NodeContainer selected={selected}>
      <div className="flex items-start gap-3 mb-2">
        <Files className="w-6 h-6 text-neutral-400 stroke-[1.5]" />
        <div>
          <div className="text-xs text-neutral-200 font-bold tracking-wider">{data.label}</div>
        </div>
      </div>
      <div className="border-t border-neutral-800 pt-2">
        <Field label="TYPE" value={data.type} />
        <Field label="ITEMS" value={data.items} />
        <Field label="CLASS" value={data.class} />
      </div>
      <div className="flex gap-1 mt-3">
         {[1,2,3,4].map(i => (
           <div key={i} className="flex-1 border border-neutral-700/50 p-1 flex flex-col items-center justify-center">
             <FileText className="w-3 h-3 text-neutral-600 mb-1" />
             <span className="text-[6px] text-neutral-500">FILE_{i}</span>
           </div>
         ))}
      </div>
    </NodeContainer>
  );
};
