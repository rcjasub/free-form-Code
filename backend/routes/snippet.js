const express = require('express');
const router = express.Router();
const { runSnippet } = require('../controllers/snippetsController');

router.post('/run', runSnippet);

module.exports = router;
