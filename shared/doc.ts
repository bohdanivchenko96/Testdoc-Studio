// A Confluence doc: data/docs/<id>/ holds page.wiki, meta.json and its files (see docs/spec.md > Docs).

export interface DocMeta {
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocSummary extends DocMeta {
  id: string;
}

export interface Doc extends DocSummary {
  // Stored verbatim.
  markup: string;
  // Attachment names in the doc folder, e.g. image-1.png, diagram-1.mmd.
  files: string[];
}

// Names the export folder and the URL path can safely carry.
export const FILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
