import React from 'react'
import { AbsoluteFill } from 'remotion'

export const YouTubeThumbnail: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#070A11',
        backgroundImage: `
          radial-gradient(circle at 15% 20%, rgba(239, 68, 68, 0.25) 0%, transparent 45%),
          radial-gradient(circle at 85% 80%, rgba(16, 185, 129, 0.25) 0%, transparent 45%),
          radial-gradient(circle at 50% 50%, rgba(56, 189, 248, 0.2) 0%, transparent 60%),
          linear-gradient(to bottom, rgba(15, 23, 42, 0.8), rgba(7, 10, 17, 0.95))
        `,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        color: '#F8FAFC',
        overflow: 'hidden',
        boxSizing: 'border-box',
        padding: '36px 48px',
        display: 'flex',
        flexDirection: 'column',
        justify: 'space-between',
      }}
    >
      {/* Background Cyber Grid Lines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(56, 189, 248, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(56, 189, 248, 0.04) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          pointerEvents: 'none',
        }}
      />

      {/* Top Bar: Brand & Tech Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0EA5E9 0%, #3B82F6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '26px',
              boxShadow: '0 0 20px rgba(14, 165, 233, 0.6)',
            }}
          >
            ⚡
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.5px', color: '#FFFFFF' }}>
              WattWeave
            </div>
            <div style={{ fontSize: '13px', color: '#38BDF8', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>
              Interactive Load-Shifting Sandbox
            </div>
          </div>
        </div>

        {/* WebMCP Badge */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1.5px solid rgba(56, 189, 248, 0.5)',
            borderRadius: '9999px',
            padding: '8px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 0 18px rgba(56, 189, 248, 0.25)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#38BDF8', boxShadow: '0 0 10px #38BDF8' }} />
          <span style={{ fontSize: '15px', fontWeight: 800, color: '#E0F2FE', letterSpacing: '0.5px' }}>
            POWERED BY WebMCP AGENT
          </span>
        </div>
      </div>

      {/* Main Hook Header Text */}
      <div style={{ zIndex: 10, textAlign: 'center', marginTop: '4px' }}>
        <h1
          style={{
            fontSize: '54px',
            fontWeight: 900,
            lineHeight: 1.05,
            margin: 0,
            letterSpacing: '-1.5px',
            textTransform: 'uppercase',
            textShadow: '0 4px 20px rgba(0,0,0,0.8)',
          }}
        >
          <span style={{ color: '#FACC15', filter: 'drop-shadow(0 0 15px rgba(250, 204, 21, 0.5))' }}>
            AI STOPS ENTIRE BUILDING
          </span>{' '}
          <br />
          <span
            style={{
              background: 'linear-gradient(180deg, #FFFFFF 0%, #94A3B8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            PEAK ENERGY SURGE! ⚡
          </span>
        </h1>
      </div>

      {/* Center Hero Comparison Visual: CRISIS (Red) vs AGENT (Cyan) vs SOLUTION (Green) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 120px 1fr',
          gap: '20px',
          alignItems: 'center',
          zIndex: 10,
          marginTop: '10px',
        }}
      >
        {/* LEFT: THE CRISIS */}
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '2px solid rgba(239, 68, 68, 0.45)',
            borderRadius: '20px',
            padding: '20px',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 0 30px rgba(239, 68, 68, 0.2), inset 0 0 15px rgba(239, 68, 68, 0.1)',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '-14px',
              left: '20px',
              background: '#EF4444',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 900,
              padding: '4px 12px',
              borderRadius: '6px',
              letterSpacing: '1px',
              boxShadow: '0 0 12px rgba(239, 68, 68, 0.8)',
            }}
          >
            ⚠️ CRITICAL PEAK EVENT
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '6px' }}>
            <span style={{ fontSize: '14px', color: '#FCA5A5', fontWeight: 700 }}>Peak Demand</span>
            <span style={{ fontSize: '38px', fontWeight: 900, color: '#F87171', filter: 'drop-shadow(0 0 10px rgba(239,68,68,0.5))' }}>
              212 kW
            </span>
          </div>

          <div style={{ fontSize: '12px', color: '#EF4444', fontWeight: 700, margin: '4px 0 12px 0' }}>
            🚫 Exceeds 170 kW Grid Safety Limit!
          </div>

          {/* Graph Simulation Spike */}
          <div style={{ height: '85px', width: '100%', position: 'relative' }}>
            <svg width="100%" height="100%" viewBox="0 0 250 85" style={{ overflow: 'visible' }}>
              {/* Threshold Line */}
              <line x1="0" y1="45" x2="250" y2="45" stroke="#EF4444" strokeDasharray="4 4" strokeWidth="2" opacity="0.7" />
              <text x="5" y="40" fill="#EF4444" fontSize="10" fontWeight="bold">170 kW Limit</text>
              {/* Spike path */}
              <path
                d="M 0 65 Q 60 65 100 50 T 150 10 T 190 60 T 250 65"
                fill="none"
                stroke="#EF4444"
                strokeWidth="4.5"
                style={{ filter: 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.8))' }}
              />
              {/* Red Danger Glow Area */}
              <path
                d="M 0 65 Q 60 65 100 50 T 150 10 T 190 60 T 250 65 L 250 85 L 0 85 Z"
                fill="rgba(239, 68, 68, 0.25)"
              />
            </svg>
          </div>
        </div>

        {/* CENTER: THE AI AGENT SOLVER */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #38BDF8 0%, #3B82F6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              boxShadow: '0 0 30px rgba(56, 189, 248, 0.8)',
              border: '3px solid #FFFFFF',
            }}
          >
            🤖
          </div>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 900,
              color: '#38BDF8',
              textAlign: 'center',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              background: 'rgba(14, 165, 233, 0.15)',
              padding: '4px 10px',
              borderRadius: '8px',
              border: '1px solid rgba(56, 189, 248, 0.3)',
            }}
          >
            WebMCP
            <br />
            Solver
          </div>
        </div>

        {/* RIGHT: THE SAFE SOLUTION */}
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '2px solid rgba(16, 185, 129, 0.45)',
            borderRadius: '20px',
            padding: '20px',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 0 30px rgba(16, 185, 129, 0.2), inset 0 0 15px rgba(16, 185, 129, 0.1)',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '-14px',
              left: '20px',
              background: '#10B981',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 900,
              padding: '4px 12px',
              borderRadius: '6px',
              letterSpacing: '1px',
              boxShadow: '0 0 12px rgba(16, 185, 129, 0.8)',
            }}
          >
            ✅ SAFE LOAD PLAN
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '6px' }}>
            <span style={{ fontSize: '14px', color '#6EE7B7', fontWeight: 700 }}>Optimized Peak</span>
            <span style={{ fontSize: '38px', fontWeight: 900, color: '#34D399', filter: 'drop-shadow(0 0 10px rgba(52,211,153,0.5))' }}>
              168 kW
            </span>
          </div>

          <div style={{ fontSize: '12px', color: '#10B981', fontWeight: 700, margin: '4px 0 12px 0' }}>
            ⚡ Safe under 170 kW Limit (No Rebound!)
          </div>

          {/* Graph Simulation Smooth */}
          <div style={{ height: '85px', width: '100%', position: 'relative' }}>
            <svg width="100%" height="100%" viewBox="0 0 250 85" style={{ overflow: 'visible' }}>
              {/* Limit line */}
              <line x1="0" y1="45" x2="250" y2="45" stroke="#10B981" strokeDasharray="4 4" strokeWidth="2" opacity="0.6" />
              {/* Flattened smooth path */}
              <path
                d="M 0 65 Q 60 60 100 52 T 150 49 T 190 54 T 250 65"
                fill="none"
                stroke="#10B981"
                strokeWidth="4.5"
                style={{ filter: 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.8))' }}
              />
              {/* Green Safe Glow Area */}
              <path
                d="M 0 65 Q 60 60 100 52 T 150 49 T 190 54 T 250 65 L 250 85 L 0 85 Z"
                fill="rgba(16, 185, 129, 0.25)"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Bottom Feature Badges Bar */}
      <div
        style={{
          display: 'flex',
          justify: 'space-around',
          alignItems: 'center',
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '12px 24px',
          zIndex: 10,
          backdropFilter: 'blur(10px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 800, color: '#38BDF8' }}>
          <span>🔒</span> Human Constraint Pinning
        </div>
        <div style={{ color: 'rgba(255,255,255,0.2)' }}>|</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 800, color: '#FACC15' }}>
          <span>⏱️</span> Safe 15-Min Load Shifting
        </div>
        <div style={{ color: 'rgba(255,255,255,0.2)' }}>|</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 800, color: '#34D399' }}>
          <span>↩️</span> Reversible 1-Click Rollback
        </div>
      </div>
    </AbsoluteFill>
  )
}
