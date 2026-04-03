/**
 * Tree types and builder for the FilesBrowser hierarchy.
 * Converts a flat list of FileEntry (with relative paths) into a nested tree.
 */
import type { FileEntry } from "./types"

export interface FolderNode {
  kind: "folder"
  name: string
  /** Relative path from workspace root (e.g. "2025/Investments - Fidelity") */
  path: string
  children: TreeNode[]
}

export interface FileNode {
  kind: "file"
  entry: FileEntry
}

export type TreeNode = FolderNode | FileNode

/**
 * Convert a flat list of FileEntry (with relative paths) into a tree.
 * Path separators are "/" (as produced by the Rust backend).
 *
 * Example: ["2025/Investments - Fidelity/statement.pdf", "2025/W2.pdf"]
 * Produces: root → 2025 → [Investments - Fidelity → [statement.pdf], W2.pdf]
 */
export function buildTree(files: FileEntry[]): FolderNode {
  const root: FolderNode = { kind: "folder", name: "", path: "", children: [] }

  for (const file of files) {
    const parts = file.path.split("/")
    let node = root
    // Walk/create intermediate folder nodes
    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i]
      const folderPath = parts.slice(0, i + 1).join("/")
      let child = node.children.find(
        (c): c is FolderNode => c.kind === "folder" && c.name === segment,
      )
      if (!child) {
        child = { kind: "folder", name: segment, path: folderPath, children: [] }
        node.children.push(child)
      }
      node = child
    }
    node.children.push({ kind: "file", entry: file })
  }

  return root
}

/** Count all file descendants of a folder node (recursively). */
export function countFiles(node: FolderNode): number {
  let count = 0
  for (const child of node.children) {
    if (child.kind === "file") count++
    else count += countFiles(child)
  }
  return count
}
