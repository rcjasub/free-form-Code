const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

exports.runSnippet = (req, res) => {
  const { code } = req.body;

  const filePath = path.join(__dirname, 'temp.cpp');
  const executableName = process.platform === 'win32' ? 'temp.exe' : './temp';

  fs.writeFileSync(filePath, code);

  // Compile first
  exec(`g++ temp.cpp -o temp`, { cwd: __dirname, timeout: 3000 }, (error, stdout, stderr) => {
    if (error) {
      fs.unlink(filePath, () => {});
      return res.json({ output: stderr || error.message });
    }

    // Then run - just use the executable name
    const runCommand = process.platform === 'win32' ? 'temp.exe' : './temp';
    exec(runCommand, { cwd: __dirname, timeout: 3000 }, (runError, runStdout, runStderr) => {
      fs.unlink(filePath, () => {});
      fs.unlink(path.join(__dirname, 'temp.exe'), () => {});
      fs.unlink(path.join(__dirname, 'temp'), () => {});

      if (runError) {
        return res.json({ output: runStderr || runError.message });
      }

      res.json({ output: runStdout });
    });
  });
};