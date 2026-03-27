"use client"

export function Bar({ label, percent, detail }: {
  label: string
  percent: number
  detail?: string
}) {
  const color =
    percent > 90 ? "bg-red-500"
    : percent > 70 ? "bg-yellow-500"
    : "bg-green-500"

  return (
    <div className="mb-4">
      <div className="flex justify-between mb-1 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-gray-400">
          {percent.toFixed(1)}%{detail ? ` - ${detail}` : ""}
        </span>
      </div>
      <div className="w-full h-4 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  )
}
