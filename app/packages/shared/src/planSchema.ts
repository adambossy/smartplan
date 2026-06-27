import { z } from 'zod';

// ---------------------------------------------------------------------------
// The tree-first source model. manifest.json is the spine: nodes, nesting,
// hrefs, each page's ordered section ids, and a page's declared cross-links
// (its slice interface). plan-src/<id>.md files hang off the tree by id.
// ---------------------------------------------------------------------------

export interface TreeNode {
  id: string;
  label: string;
  href: string;
  sections: string[];
  crosslinks?: string[];
  children: TreeNode[];
}

export const TreeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    href: z.string().min(1),
    sections: z.array(z.string().min(1)),
    crosslinks: z.array(z.string().min(1)).optional(),
    children: z.array(TreeNodeSchema),
  }),
);

export const PlanManifestSchema = z.object({
  title: z.string().min(1),
  root: TreeNodeSchema,
});
export type PlanManifest = z.infer<typeof PlanManifestSchema>;

// ---------------------------------------------------------------------------
// Compiler output. Each page is rendered to HTML with the data attributes the
// anchor engine needs (data-target-kind / data-target-key / data-src-*-line).
// The CompiledPlan is what the server hands the browser and what the critique
// compiler reads source slices from.
// ---------------------------------------------------------------------------

export interface CompiledSection {
  id: string;
  title: string;
  /** Rendered HTML of this section's body, with anchor data attributes baked in. */
  html: string;
  /** 1-indexed source line of the section heading, so the heading is annotatable too. */
  headingLine: number;
}

export interface CompiledPage {
  id: string;
  label: string;
  href: string;
  depth: number;
  parentId: string | null;
  title: string;
  /** 1-indexed source line of the title, so the title is annotatable. */
  titleLine: number;
  eyebrow: string;
  /** Inline-rendered HTML for the page lede. */
  lede: string;
  /** 1-indexed source line span of the lede, so the lede is annotatable. */
  ledeStartLine: number;
  ledeEndLine: number;
  /** Each requirements statement with its source line, so requirements are annotatable. */
  requirements: { html: string; line: number }[];
  sections: CompiledSection[];
  /** The page's markdown source split into lines (index 0 === file line 1), for source slicing. */
  sourceLines: string[];
  crosslinks: string[];
}

export interface CompiledPlan {
  title: string;
  planId: string;
  manifest: PlanManifest;
  pages: CompiledPage[];
}

export function flattenTree(root: TreeNode): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (n: TreeNode) => {
    out.push(n);
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}
