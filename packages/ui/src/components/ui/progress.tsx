import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  max = 100,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const clampedMax =
    typeof max === "number" && Number.isFinite(max) && max > 0 ? max : 100
  const clampedValue =
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(clampedMax, Math.max(0, value))
      : null
  const percent = clampedValue === null ? 0 : (clampedValue / clampedMax) * 100

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={clampedValue}
      max={clampedMax}
      className={cn(
        "relative flex h-3 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="size-full flex-1 bg-primary transition-all"
        style={{ transform: `translateX(-${100 - percent}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
