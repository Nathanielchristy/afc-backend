const express = require('express');
const router = express.Router();
const { getPage, listPages } = require('../controllers/siteContentController');

// Public routes — no auth required
router.get('/', listPages);
router.get('/:key', getPage);

module.exports = router;
