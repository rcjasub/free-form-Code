import { useState } from 'react';
import MonacoEditor from '@monaco-editor/react';
import axios from 'axios';

export default function SnippetBlock() {
  const [code, setCode] = useState(`#include <iostream>\nint main() { std::cout << "Hello"; return 0; }`);
  const [output, setOutput] = useState('');

  const runCode = async () => {
    try {
      const res = await axios.post('http://localhost:5000/api/snippets/run', { code });
      setOutput(res.data.output);
    } catch (err) {
      setOutput('Error running code');
    }
  };

  return (
    <div style={{ border: '1px solid #ccc', padding: 10, margin: 10 }}>
      <MonacoEditor
        height="200px"
        defaultLanguage="cpp"
        value={code}
        onChange={(value) => setCode(value)}
      />
      <button onClick={runCode}>Run</button>
      <pre>{output}</pre>
    </div>
  );
}
