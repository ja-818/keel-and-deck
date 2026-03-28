import type React from "react"

export interface BoardItem {
  id: string
  title: string
  subtitle?: string
  status: string
  updatedAt: string
  icon?: React.ReactNode
  metadata?: Record<string, unknown>
}

export interface BoardColumn {
  id: string
  label: string
  statuses: string[]
}
