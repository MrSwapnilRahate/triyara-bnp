'use client'

import { useId } from 'react'

import { cn } from '../lib/cn'

/**
 * Charts (TRY-BNP-PORTAL-01 §9).
 *
 * Hand-drawn SVG rather than a charting library, for three reasons that all
 * point the same way:
 *
 *  - The data arrives already aggregated. The server groups by month and
 *    returns `{ label, value }[]`, so there is nothing here for a charting
 *    engine's scales, stacking or transforms to do.
 *  - Colour comes from the design tokens. A library brings its own palette and
 *    has to be fought back into `hsl(var(--accent))`, and it will not follow the
 *    light/dark switch without a second theme adapter.
 *  - Accessibility is the markup. Every chart below is a `<figure>` with a
 *    caption, an accessible name, and a real `<table>` of the same numbers for
 *    screen readers - which is what actually makes a chart readable, and which
 *    most libraries render as an unlabelled canvas.
 *
 * Responsiveness is `viewBox` plus `preserveAspectRatio`: the SVG scales to its
 * container with no resize observer and no re-render on resize.
 */

export interface ChartPoint {
  label: string
  value: number
}

interface ChartFrameProps {
  title: string
  description?: string
  points: ChartPoint[]
  /** How a value reads in the data table and tooltips. */
  format?: (value: number) => string
  className?: string
  children: React.ReactNode
}

/**
 * The shared shell: caption, accessible name, and the sighted-user-invisible
 * data table that makes the figure comprehensible without vision.
 */
function ChartFrame({
  title,
  description,
  points,
  format = String,
  className,
  children,
}: ChartFrameProps) {
  const tableId = useId()
  return (
    <figure className={cn('min-w-0', className)}>
      <figcaption className="mb-gap-lg">
        <span className="text-content text-base font-medium">{title}</span>
        {description ? (
          <span className="mt-gap-xs text-content-muted block text-xs">{description}</span>
        ) : null}
      </figcaption>

      <div role="img" aria-describedby={tableId} aria-label={title}>
        {children}
      </div>

      {/* The same numbers, reachable by a screen reader and by anyone who
          would rather read them. Visually hidden, never display:none - a
          hidden subtree is not announced. */}
      <table id={tableId} className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.label}>
              <th scope="row">{p.label}</th>
              <td>{format(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

function niceMax(values: number[]): number {
  const max = Math.max(0, ...values)
  if (max === 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(max))
  return Math.ceil(max / magnitude) * magnitude
}

export interface BarChartProps {
  title: string
  description?: string
  points: ChartPoint[]
  className?: string
  format?: (value: number) => string
}

/** Monthly counts. Bars, because the periods are discrete buckets. */
export function BarChart({ title, description, points, className, format }: BarChartProps) {
  const max = niceMax(points.map((p) => p.value))
  const width = 100
  const height = 48
  const gap = points.length > 1 ? 1.5 : 0
  const barWidth = (width - gap * (points.length - 1)) / Math.max(points.length, 1)

  return (
    <ChartFrame
      title={title}
      {...(description ? { description } : {})}
      points={points}
      {...(format ? { format } : {})}
      {...(className ? { className } : {})}
    >
      <svg
        viewBox={`0 0 ${width} ${height + 8}`}
        preserveAspectRatio="none"
        className="h-40 w-full"
        aria-hidden="true"
        focusable="false"
      >
        {/* Baseline, so an all-zero series still reads as a chart. */}
        <line
          x1="0"
          y1={height}
          x2={width}
          y2={height}
          stroke="hsl(var(--line))"
          strokeWidth="0.4"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => {
          const h = max === 0 ? 0 : (p.value / max) * height
          return (
            <rect
              key={p.label}
              x={i * (barWidth + gap)}
              y={height - h}
              width={barWidth}
              height={Math.max(h, p.value > 0 ? 0.6 : 0)}
              rx="0.6"
              fill="hsl(var(--accent))"
            >
              <title>{`${p.label}: ${(format ?? String)(p.value)}`}</title>
            </rect>
          )
        })}
      </svg>

      {/* Labels live outside the SVG so they never scale with it. */}
      <div className="mt-gap text-2xs text-content-subtle flex justify-between" aria-hidden="true">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </ChartFrame>
  )
}

/** Cumulative growth. A line, because the quantity is continuous over time. */
export function LineChart({ title, description, points, className, format }: BarChartProps) {
  const max = niceMax(points.map((p) => p.value))
  const width = 100
  const height = 48
  const step = points.length > 1 ? width / (points.length - 1) : 0
  const y = (v: number) => height - (max === 0 ? 0 : (v / max) * height)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${y(p.value)}`).join(' ')
  const area = `${path} L ${width} ${height} L 0 ${height} Z`

  return (
    <ChartFrame
      title={title}
      {...(description ? { description } : {})}
      points={points}
      {...(format ? { format } : {})}
      {...(className ? { className } : {})}
    >
      <svg
        viewBox={`0 0 ${width} ${height + 8}`}
        preserveAspectRatio="none"
        className="h-40 w-full"
        aria-hidden="true"
        focusable="false"
      >
        <line
          x1="0"
          y1={height}
          x2={width}
          y2={height}
          stroke="hsl(var(--line))"
          strokeWidth="0.4"
          vectorEffect="non-scaling-stroke"
        />
        {points.length > 1 ? (
          <>
            <path d={area} fill="hsl(var(--accent) / 0.12)" />
            <path
              d={path}
              fill="none"
              stroke="hsl(var(--accent))"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}
      </svg>
      <div className="mt-gap text-2xs text-content-subtle flex justify-between" aria-hidden="true">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </ChartFrame>
  )
}

/**
 * Ranked categories. Horizontal, because category names are words - rotating
 * them under a vertical axis is the most common way to make a chart unreadable.
 */
export function RankedBars({ title, description, points, className, format }: BarChartProps) {
  const max = niceMax(points.map((p) => p.value))
  const fmt = format ?? String

  return (
    <ChartFrame
      title={title}
      {...(description ? { description } : {})}
      points={points}
      {...(format ? { format } : {})}
      {...(className ? { className } : {})}
    >
      <ul className="space-y-gap" aria-hidden="true">
        {points.map((p) => (
          <li key={p.label} className="gap-gap grid grid-cols-[6rem_1fr_3rem] items-center">
            <span className="text-content-muted truncate text-xs">{p.label}</span>
            <span className="bg-surface-sunken h-2 rounded-xs">
              <span
                className="bg-accent block h-2 rounded-xs"
                style={{ width: `${max === 0 ? 0 : (p.value / max) * 100}%` }}
              />
            </span>
            <span className="text-content text-right text-xs tabular-nums">{fmt(p.value)}</span>
          </li>
        ))}
      </ul>
    </ChartFrame>
  )
}

/**
 * A funnel. Rendered in lifecycle order, never sorted by size: a stage nothing
 * has reached is the most interesting bar on the chart, and sorting would hide
 * it at the bottom.
 */
export function FunnelChart({ title, description, points, className, format }: BarChartProps) {
  const max = niceMax(points.map((p) => p.value))
  const fmt = format ?? String

  return (
    <ChartFrame
      title={title}
      {...(description ? { description } : {})}
      points={points}
      {...(format ? { format } : {})}
      {...(className ? { className } : {})}
    >
      <ol className="space-y-gap" aria-hidden="true">
        {points.map((p, i) => (
          <li key={p.label} className="gap-gap grid grid-cols-[8rem_1fr_3rem] items-center">
            <span className="text-content-muted truncate text-xs">{p.label}</span>
            <span className="bg-surface-sunken h-3 rounded-xs">
              <span
                className="block h-3 rounded-xs"
                style={{
                  width: `${max === 0 ? 0 : (p.value / max) * 100}%`,
                  // Later stages read as "further along", not as a new category.
                  backgroundColor: `hsl(var(--accent) / ${1 - i * 0.15})`,
                }}
              />
            </span>
            <span className="text-content text-right text-xs tabular-nums">{fmt(p.value)}</span>
          </li>
        ))}
      </ol>
    </ChartFrame>
  )
}
