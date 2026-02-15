const express = require('express');
const router = express.Router();
const { runSnippet } = require('./controller/snippetController');

router.post('/run', runSnippet);

module.exports = router;
