"use client"

import type { ReactNode } from "react"

export function Modal({ title, onClose, actions, borderColor, children }: {
  title: string
  onClose: () => void
  actions?: ReactNode
  borderColor?: string
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className={`max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg border ${borderColor ?? "border-gray-700"} bg-gray-900 p-6`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-mono text-sm text-gray-400">{title}</h3>
          <div className="flex gap-3">
            {actions}
            <button onClick={onClose} className="text-gray-500 hover:text-white">
              Close
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
