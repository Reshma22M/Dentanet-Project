const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");

const DED_API_URL = process.env.DED_API_URL || "http://127.0.0.1:8000/predict/";

/**
 * Evaluate one image through the DED FastAPI service
 * @param {string} filePath
 * @returns {Promise<Object>}
 */
async function evaluateSingleImage(filePath) {
  const formData = new FormData();
  formData.append("file", fs.createReadStream(filePath));

  try {
    const response = await axios.post(DED_API_URL, formData, {
      headers: {
        ...formData.getHeaders()
      },
      timeout: 60000
    });

    return response.data;
  } catch (error) {
    const detail =
      error.response?.data ||
      error.message ||
      "Unknown DED API error";

    console.error("DED API error for file:", filePath, detail);
    throw new Error(
      typeof detail === "string" ? detail : JSON.stringify(detail)
    );
  }
}

const SCORE_MAP = {
  Ideal: 5,
  Acceptable: 3,
  "Needs Improvement": 1,
  Unacceptable: -10
};

function getLabelFromAverage(average) {
  if (average >= 4) return "Ideal";
  if (average >= 2) return "Acceptable";
  if (average >= 0) return "Needs Improvement";
  return "Unacceptable";
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

/**
 * Evaluate multiple images and return one aggregated result
 * @param {string[]} filePaths
 * @returns {Promise<Object>}
 */
async function evaluateImages(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    throw new Error("No files provided for evaluation");
  }

  const evaluations = [];

  for (const filePath of filePaths) {
    const result = await evaluateSingleImage(filePath);

    if (!result || result.error) {
      continue;
    }

    evaluations.push(result);
  }

  if (evaluations.length === 0) {
    throw new Error("AI API returned errors for all images");
  }

  let totalPoints = 0;
  let smoothScores = 0;
  let flatScores = 0;
  let depthScores = 0;
  let undercutScores = 0;

  for (const ev of evaluations) {
    totalPoints += Number(ev.points || 0);
    smoothScores += SCORE_MAP[ev.smooth_outline?.feedback] || 0;
    flatScores += SCORE_MAP[ev.flat_floor?.feedback] || 0;
    depthScores += SCORE_MAP[ev.depth?.feedback] || 0;
    undercutScores += SCORE_MAP[ev.undercut?.feedback] || 0;
  }

  const n = evaluations.length;

  return {
    api_status: "SUCCESS",
    api_score: round2(totalPoints / n),
    confidence: n === filePaths.length ? 90.0 : 70.0,
    smooth_outline_status: getLabelFromAverage(smoothScores / n),
    flat_floor_status: getLabelFromAverage(flatScores / n),
    depth_status: getLabelFromAverage(depthScores / n),
    undercut_status: getLabelFromAverage(undercutScores / n),
    raw_response_json: JSON.stringify({
      image_count_requested: filePaths.length,
      image_count_evaluated: n,
      results: evaluations
    })
  };
}

module.exports = {
  evaluateImages
};