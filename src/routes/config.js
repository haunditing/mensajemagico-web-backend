const express = require("express");
const router = express.Router();
const PLAN_CONFIG = require("../config/plans");

router.get("/plans", (req, res) => {
  res.json(PLAN_CONFIG);
});

module.exports = router;