'use client';
import { useState } from 'react';
import axios from 'axios';

export default function CodeRunner() {
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);

  const runCode = async () => {
    setLoading(true);
    try {
      const response = await axios.post('http://localhost:5000/api/snippets/run', {
        code: code
      });
      setOutput(response.data.output);
    } catch (error) {
      setOutput('Error connecting to backend: ' + error.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>C++ Code Runner</h1>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Write your C++ code here..."
        rows={15}
        cols={80}
      />
      <br />
      <button onClick={runCode} disabled={loading}>
        {loading ? 'Running...' : 'Run Code'}
      </button>
      <h2>Output:</h2>
      <pre>{output}</pre>
    </div>
  );
}