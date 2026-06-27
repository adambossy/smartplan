import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type CompiledPage,
  type CompiledPlan,
  type PlanManifest,
  PlanManifestSchema,
  type TreeNode,
  flattenTree,
} from '@smartplan/shared/planSchema';
import { parsePage } from './parsePage.ts';

export function compilePlan(srcDir: string): CompiledPlan {
  const manifestRaw = readFileSync(join(srcDir, 'manifest.json'), 'utf8');
  const manifest: PlanManifest = PlanManifestSchema.parse(JSON.parse(manifestRaw));

  const parents = new Map<string, string | null>();
  const labels = new Map<string, string>();
  const assignParents = (node: TreeNode, parent: string | null) => {
    parents.set(node.id, parent);
    labels.set(node.id, node.label);
    node.children.forEach((c) => assignParents(c, node.id));
  };
  assignParents(manifest.root, null);

  const pages: CompiledPage[] = flattenTree(manifest.root).map((node) => compileNode(srcDir, node, manifest, parents, labels));

  return {
    title: manifest.title,
    planId: slugify(manifest.title),
    manifest,
    pages,
  };
}

function compileNode(
  srcDir: string,
  node: TreeNode,
  manifest: PlanManifest,
  parents: Map<string, string | null>,
  labels: Map<string, string>,
): CompiledPage {
  const mdPath = join(srcDir, 'plan-src', `${node.id}.md`);
  const raw = readFileSync(mdPath, 'utf8');
  const parsed = parsePage(raw);

  const parentId = parents.get(node.id) ?? null;
  const depth = node.href.split('/').length - 1;
  const eyebrow = parentId ? (labels.get(parentId) ?? manifest.title) : manifest.title;

  // Keep section order from the manifest, pulling rendered HTML from the parsed source.
  const byId = new Map(parsed.sections.map((s) => [s.id, s]));
  const sections = node.sections.map((id) => {
    const found = byId.get(id);
    return { id, title: found?.title ?? id, html: found?.html ?? '', headingLine: found?.headingLine ?? 1 };
  });

  return {
    id: node.id,
    label: node.label,
    href: node.href,
    depth,
    parentId,
    title: parsed.title,
    titleLine: parsed.titleLine,
    eyebrow,
    lede: parsed.ledeHtml,
    ledeStartLine: parsed.ledeStartLine,
    ledeEndLine: parsed.ledeEndLine,
    requirements: parsed.requirements,
    sections,
    sourceLines: parsed.rawLines,
    crosslinks: node.crosslinks ?? parsed.front.crosslinks,
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
