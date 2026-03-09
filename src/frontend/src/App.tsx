import React, { useState, useEffect } from 'react';
import { io } from "socket.io-client";

// Verbindung zum Backend auf Port 3000
const socket = io("http://localhost:3000");

export default function App() {
  const [metrics, setMetrics] = useState({ p95: 0, cost: 0, totalCost: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    // Empfange Updates vom Agenten
    socket.on("update", (data) => {
      setMetrics(data.metrics);
      setLogs(prev => [...prev, `Agent: ${data.result}`]);
    });

    socket.on("error", (msg) => {
      setLogs(prev => [...prev, `Error: ${msg}`]);
    });

    return () => {
      socket.off("update");
      socket.off("error");
    };
  }, []);


  const [provider, setProvider] = useState<"google" | "local">("google");

  // Beim Absenden der Frage:
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return; // Verhindert leere Nachrichten

    setLogs(prev => [...prev, `You: ${input}`]);

    socket.emit("run_optimization", { 
      input: input, 
      provider: provider 
    });

    setInput("");
  };

  return (
    <div style={{ backgroundColor: '#0f172a', color: 'white', minHeight: '100vh', padding: '2rem', fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: '1rem', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>CloudCost <span style={{ color: '#60a5fa' }}>Optimizer AI</span></h1>
        <div style={{ display: 'flex', gap: '2rem' }}>
          <Metric label="p95 Latency" value={`${metrics.p95}ms`} />
          <Metric label="Cost/Req" value={`$${metrics.cost.toFixed(4)}`} />
          <Metric label="Total Burn" value={`$${metrics.totalCost.toFixed(4)}`} />
        </div>
      </header>

      <main style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.8rem', color: provider === 'local' ? '#4ade80' : '#64748b' }}>Local (Ollama)</span>
          <input 
            type="checkbox" 
            checked={provider === 'google'} 
            onChange={() => setProvider(p => p === 'google' ? 'local' : 'google')} 
          />
          <span style={{ fontSize: '0.8rem', color: provider === 'google' ? '#60a5fa' : '#64748b' }}>Google Gemini</span>
        </div>
        <div style={{ backgroundColor: '#1e293b', borderRadius: '0.5rem', padding: '1.5rem', border: '1px solid #334155' }}>
          <h2 style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '1rem', textTransform: 'uppercase' }}>Agent Console</h2>
          <div style={{ height: '300px', overflowY: 'auto', backgroundColor: '#0f172a', padding: '1rem', borderRadius: '0.25rem', fontFamily: 'monospace', fontSize: '0.875rem', marginBottom: '1rem' }}>
            {logs.map((log, i) => (
              <div key={i} style={{ color: log.startsWith('You') ? '#94a3b8' : '#4ade80', marginBottom: '0.5rem' }}>
                {`> ${log}`}
              </div>
            ))}
          </div>
          <form onSubmit={handleSubmit}>
            <input 
              style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #475569', borderRadius: '0.25rem', padding: '0.5rem', color: 'white', outline: 'none' }}
              placeholder="Enter optimization prompt (e.g. Analyze costs)..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </form>
        </div>
        
        <div style={{ backgroundColor: '#1e293b', borderRadius: '0.5rem', padding: '1.5rem', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#64748b' }}>
            <p>Infrastructure Visualizer</p>
            <p style={{ fontSize: '0.75rem' }}>(Live Delta View)</p>
          </div>
        </div>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string, value: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <p style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', margin: 0 }}>{label}</p>
      <p style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#93c5fd', margin: 0 }}>{value}</p>
    </div>
  );
}
