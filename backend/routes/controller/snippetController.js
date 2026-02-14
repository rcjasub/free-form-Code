const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

exports.runSnippet = (req, res) => {
  const { code } = req.body;

  const filePath = path.join(__dirname, 'temp.cpp');
  fs.writeFileSync(filePath, code);

  exec(`g++ ${filePath} -o temp && ./temp`, { timeout: 3000 }, (error, stdout, stderr) => {
    if (error) {
      return res.json({ output: stderr || error.message });
    }
    res.json({ output: stdout });
  });
};
