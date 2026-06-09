// ViewBox 0 0 120 150. Figure centred at x=80, rope tip at y=24.
import { MAX_WRONG } from '../lib/hangmanLogic'

const PX = 5
const OX = 80   // figure origin X
const OY = 26   // figure origin Y (top of head)

const rx = (col) => OX + col * PX
const ry = (row) => OY + row * PX

// Pixel cells [col, row]
const HEAD_PIXELS = [
  // 3-wide rounded head: solid except hollow centre row
  [-1,0],[0,0],[1,0],
  [-1,1],      [1,1],
  [-1,2],[0,2],[1,2],
]

const BODY_PIXELS = [
  [0,3],[0,4],[0,5],
]

const LEFT_ARM_PIXELS  = [[-1,3],[-2,4]]
const RIGHT_ARM_PIXELS = [[ 1,3],[ 2,4]]
const LEFT_LEG_PIXELS  = [[-1,6],[-2,7]]
const RIGHT_LEG_PIXELS = [[ 1,6],[ 2,7]]

// Long hair flowing down both sides of the head
const HAIR_PIXELS = [
  [-2,-1],[ 2,-1],  // above head
  [-2, 0],[ 2, 0],  // top of head level
  [-2, 1],[ 2, 1],  // mid head
  [-2, 2],[ 2, 2],  // bottom of head
  [-2, 3],[ 2, 3],  // shoulder level
  [-2, 4],[ 2, 4],  // arm level
]
const HAIR_COLOR = '#ffe600'

function Pixel({ col, row, slump = 0, fill = '#ff4081', opacity = 1 }) {
  return (
    <rect
      x={rx(col) - PX / 2}
      y={ry(row) + slump - PX / 2}
      width={PX}
      height={PX}
      fill={fill}
      opacity={opacity}
    />
  )
}

function PixelGroup({ pixels, slump = 0, fill = '#ff4081', opacity = 1 }) {
  return (
    <>
      {pixels.map(([col, row]) => (
        <Pixel key={`${col}-${row}`} col={col} row={row} slump={slump} fill={fill} opacity={opacity} />
      ))}
    </>
  )
}

export default function HangmanGallows({ wrongCount = 0, flash = false }) {
  const isDead  = wrongCount >= MAX_WRONG
  const hasSway = wrongCount >= 2
  const slump   = isDead ? 1 : 0

  return (
    <div
      className="relative w-full flex justify-center"
      style={isDead ? { animation: 'gallows-shake 0.4s steps(8, end) 1' } : undefined}
    >
      {flash && (
        <div
          className="absolute inset-0 rounded pointer-events-none z-10"
          style={{ background: '#ff4081', animation: 'miss-flash 0.12s step-end forwards' }}
        />
      )}

      <svg
        viewBox="0 0 120 150"
        className="w-full max-w-[240px]"
        aria-label={`Hangwoman gallows — ${wrongCount} of ${MAX_WRONG} wrong`}
      >
        {/* ── Base platform — split with trapdoor when dead ── */}
        {isDead ? (
          <>
            {/* Left platform segment */}
            <rect x="4"  y="135" width="64" height="8" fill="#0c0c20" />
            {/* Right platform segment (gap x=68→92 under figure at x=80) */}
            <rect x="92" y="135" width="24" height="8" fill="#0c0c20" />
            {/* Platform top edge lines */}
            <line x1="4"  y1="135" x2="68"  y2="135" stroke="#2a2a50" strokeWidth="2" strokeLinecap="square" />
            <line x1="92" y1="135" x2="116" y2="135" stroke="#2a2a50" strokeWidth="2" strokeLinecap="square" />
            {/* Left trapdoor flap hanging down from left gap edge */}
            <rect x="64" y="143" width="6" height="10" fill="#0c0c20" stroke="#2a2a50" strokeWidth="1" />
            {/* Right trapdoor flap hanging down from right gap edge */}
            <rect x="90" y="143" width="6" height="10" fill="#0c0c20" stroke="#2a2a50" strokeWidth="1" />
          </>
        ) : (
          <>
            <rect x="4"  y="135" width="112" height="8" fill="#0c0c20" />
            <line x1="4" y1="135" x2="116" y2="135" stroke="#2a2a50" strokeWidth="2" strokeLinecap="square" />
          </>
        )}

        {/* ── Gallows frame (no strut) ── */}
        {/* Vertical pole */}
        <line x1="24" y1="135" x2="24" y2="11"
          stroke="#00e5ff" strokeWidth="3" strokeLinecap="square" strokeOpacity="0.65" />
        {/* Horizontal beam */}
        <line x1="24" y1="11" x2="80" y2="11"
          stroke="#00e5ff" strokeWidth="3" strokeLinecap="square" strokeOpacity="0.65" />

        {/* Rope — always visible */}
        <line x1="80" y1="11" x2="80" y2="24"
          stroke="#5a5a8a" strokeWidth="2" strokeLinecap="square" />

        {/* Drop group: noose + figure animate downward when dead */}
        <g style={isDead ? { animation: 'hangman-drop 0.25s steps(3, end) forwards' } : undefined}>
          {/* Rope extension: overlaps static rope when undropped; fills gap after 6px drop */}
          <line x1="80" y1="18" x2="80" y2="24"
            stroke="#5a5a8a" strokeWidth="2" strokeLinecap="square" />

          {/* Noose loop — appears with head */}
          {wrongCount >= 1 && (
            <>
              <rect x="77" y="21" width="6" height="4" rx="0" fill="none"
                stroke="#5a5a8a" strokeWidth="1.5" strokeLinecap="square" />
              <line x1="80" y1="25" x2="80" y2="26"
                stroke="#5a5a8a" strokeWidth="2" strokeLinecap="square" />
            </>
          )}

          {/* ── Pixel figure ── */}
          <g style={hasSway ? {
            transformOrigin: `${OX}px 24px`,
            animation: isDead
              ? 'hangman-sway-dead 2.4s steps(2, end) infinite'
              : 'hangman-sway 2.8s steps(2, end) infinite',
          } : undefined}>

            {/* Hair — appears with head, flows down sides */}
            {wrongCount >= 1 && (
              <PixelGroup
                pixels={HAIR_PIXELS}
                slump={slump}
                fill={HAIR_COLOR}
                opacity={isDead ? 0.55 : 0.9}
              />
            )}

            {/* 1 — Head */}
            {wrongCount >= 1 && !isDead && (
              <>
                {/* Outline pixels */}
                <PixelGroup pixels={HEAD_PIXELS} slump={slump} fill="#ff4081" />
                {/* Hollow centre with a face — tiny dot eyes */}
                <Pixel col={-1} row={1} slump={slump} fill="#ff4081" opacity={0.25} />
                <Pixel col={ 1} row={1} slump={slump} fill="#ff4081" opacity={0.25} />
                {/* Eye dots (2×2 inside) */}
                <rect x={rx(-1) - 1} y={ry(1) + slump - 1} width={2} height={2} fill="#ff4081" opacity={0.9} />
                <rect x={rx( 1) - 1} y={ry(1) + slump - 1} width={2} height={2} fill="#ff4081" opacity={0.9} />
              </>
            )}

            {/* Dead head — X eyes */}
            {isDead && (
              <>
                <PixelGroup pixels={HEAD_PIXELS} slump={slump} fill="#ff4081" opacity={0.65} />
                <Pixel col={-1} row={1} slump={slump} fill="#080810" opacity={1} />
                <Pixel col={ 1} row={1} slump={slump} fill="#080810" opacity={1} />
                {/* Left X */}
                <line x1={rx(-1)-2} y1={ry(1)+slump-2} x2={rx(-1)+2} y2={ry(1)+slump+2}
                  stroke="#ff4081" strokeWidth="1.5" strokeLinecap="square" />
                <line x1={rx(-1)+2} y1={ry(1)+slump-2} x2={rx(-1)-2} y2={ry(1)+slump+2}
                  stroke="#ff4081" strokeWidth="1.5" strokeLinecap="square" />
                {/* Right X */}
                <line x1={rx(1)-2} y1={ry(1)+slump-2} x2={rx(1)+2} y2={ry(1)+slump+2}
                  stroke="#ff4081" strokeWidth="1.5" strokeLinecap="square" />
                <line x1={rx(1)+2} y1={ry(1)+slump-2} x2={rx(1)-2} y2={ry(1)+slump+2}
                  stroke="#ff4081" strokeWidth="1.5" strokeLinecap="square" />
              </>
            )}

            {/* 2 — Body */}
            {wrongCount >= 2 && (
              <PixelGroup pixels={BODY_PIXELS} slump={slump} fill="#ff4081" />
            )}

            {/* 3 — Left arm */}
            {wrongCount >= 3 && (
              <PixelGroup pixels={LEFT_ARM_PIXELS} slump={slump} fill="#ff4081" />
            )}

            {/* 4 — Right arm */}
            {wrongCount >= 4 && (
              <PixelGroup pixels={RIGHT_ARM_PIXELS} slump={slump} fill="#ff4081" />
            )}

            {/* 5 — Left leg */}
            {wrongCount >= 5 && (
              <PixelGroup pixels={LEFT_LEG_PIXELS} slump={slump} fill="#ff4081" />
            )}

            {/* 6 — Right leg */}
            {wrongCount >= MAX_WRONG && (
              <PixelGroup pixels={RIGHT_LEG_PIXELS} slump={slump} fill="#ff4081" />
            )}
          </g>
        </g>
      </svg>
    </div>
  )
}
