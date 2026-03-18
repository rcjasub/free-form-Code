const vm = require('vm')

async function runCode(req, res) {
  const { code, language = 'javascript' } = req.body

  if (!code) return res.status(400).json({ error: 'No code provided' })
  if (language !== 'javascript') {
    return res.status(400).json({ error: `Language "${language}" not supported yet` })
  }

  const logs = []

  const sandbox = {
    console: {
      log: (...args) => logs.push(args.map(String).join(' ')),
      error: (...args) => logs.push(args.map(String).join(' ')),
    },
  }

  try {
    vm.runInNewContext(code, sandbox, { timeout: 3000 })
    res.json({ output: logs.join('\n') || '(no output)' })
  } catch (err) {
    res.json({ output: err.message, error: true })
  }
}

module.exports = { runCode }
