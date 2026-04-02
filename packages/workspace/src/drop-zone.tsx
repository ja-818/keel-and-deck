/**
 * Drop zone hooks for drag-and-drop file imports.
 * Container-level highlight + folder-level targeting (Finder-style).
 */
import { useCallback, useRef, useState } from "react"

/** Tracks whether files are being dragged over the container. */
export function useDropZone(
  onFilesDropped?: (files: File[], targetFolder?: string) => void,
) {
  const [isDragging, setIsDragging] = useState(false)
  const counter = useRef(0)

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    counter.current++
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    counter.current--
    if (counter.current === 0) setIsDragging(false)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      counter.current = 0
      setIsDragging(false)
      if (!onFilesDropped) return
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) onFilesDropped(files)
    },
    [onFilesDropped],
  )

  return {
    isDragging,
    dragHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop },
  }
}

/**
 * Tracks drag-over state for an entire folder section (header + children).
 * Stops propagation on drop so the container handler doesn't also fire.
 */
export function useFolderDropTarget(
  folder: string,
  onFilesDropped?: (files: File[], targetFolder?: string) => void,
) {
  const [isOver, setIsOver] = useState(false)
  const counter = useRef(0)

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    counter.current++
    if (e.dataTransfer.types.includes("Files")) setIsOver(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    counter.current--
    if (counter.current === 0) setIsOver(false)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation() // only stop propagation on drop to prevent container double-handling
      counter.current = 0
      setIsOver(false)
      if (!onFilesDropped) return
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) onFilesDropped(files, folder)
    },
    [onFilesDropped, folder],
  )

  return {
    isOver,
    folderHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop },
  }
}
