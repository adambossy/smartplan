import type { CompiledPlan, TreeNode } from '@smartplan/shared/planSchema';
import type { ReadState } from '../state.ts';
import { totalSectionsRead } from '../state.ts';

interface SidebarProps {
  plan: CompiledPlan;
  activePageId: string;
  onNavigate: (id: string) => void;
  readDotByNode: Map<string, 'empty' | 'partial' | 'full'>;
  commentCountByNode: Map<string, number>;
  readState: ReadState;
  onResetReadState: () => void;
}

export function Sidebar({
  plan,
  activePageId,
  onNavigate,
  readDotByNode,
  commentCountByNode,
  readState,
  onResetReadState,
}: SidebarProps) {
  const { read, total } = totalSectionsRead(plan, readState);
  const pct = total === 0 ? 0 : Math.round((read / total) * 100);
  const totalComments = commentCountByNode.get(plan.manifest.root.id) ?? 0;

  return (
    <aside className="sp-sidebar" aria-label="Plan navigation">
      <p className="sp-sidebar-title">SmartPlan</p>
      <p className="sp-sidebar-plan">{plan.title}</p>

      <ul className="sp-tree">
        <TreeBranch
          node={plan.manifest.root}
          activePageId={activePageId}
          onNavigate={onNavigate}
          readDotByNode={readDotByNode}
          commentCountByNode={commentCountByNode}
        />
      </ul>

      <div className="sp-progress">
        <span>
          {read} / {total} sections read · {pct}%
          {totalComments > 0 && <span className="sp-progress-comments"> · {totalComments} comments</span>}
        </span>
        <div className="sp-progress-bar">
          <div className="sp-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <button type="button" className="sp-reset" onClick={onResetReadState}>
          Reset read state
        </button>
      </div>
    </aside>
  );
}

interface BranchProps {
  node: TreeNode;
  activePageId: string;
  onNavigate: (id: string) => void;
  readDotByNode: Map<string, 'empty' | 'partial' | 'full'>;
  commentCountByNode: Map<string, number>;
}

function TreeBranch({ node, activePageId, onNavigate, readDotByNode, commentCountByNode }: BranchProps) {
  const dot = readDotByNode.get(node.id) ?? 'empty';
  const count = commentCountByNode.get(node.id) ?? 0;
  return (
    <li className="sp-tree-li">
      <button
        type="button"
        className={`sp-link${node.id === activePageId ? ' is-current' : ''}`}
        onClick={() => onNavigate(node.id)}
      >
        <span className={`sp-dot${dot === 'partial' ? ' is-partial' : dot === 'full' ? ' is-complete' : ''}`} aria-hidden="true" />
        <span className="sp-label">{node.label}</span>
        {count > 0 && (
          <span className="sp-comment-badge" title={`${count} comment${count === 1 ? '' : 's'}`}>
            {count}
          </span>
        )}
      </button>
      {node.children.length > 0 && (
        <ul className="sp-tree">
          {node.children.map((child) => (
            <TreeBranch
              key={child.id}
              node={child}
              activePageId={activePageId}
              onNavigate={onNavigate}
              readDotByNode={readDotByNode}
              commentCountByNode={commentCountByNode}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
