const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const DED_API_URL = process.env.DED_API_URL || 'http://127.0.0.1:8000/predict/';

/**
 * Evaluates a single image using the DEd Python API
 * @param {string} filePath path to the local image file
 * @returns {Promise<Object>} The API response
 */
async function evaluateSingleImage(filePath) {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));

    try {
        const response = await axios.post(DED_API_URL, formData, {
            headers: {
                ...formData.getHeaders()
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error calling DEd API for file:', filePath, error.message);
        throw error;
    }
}

/**
 * Maps categorical label to numerical score array
 */
const SCORE_MAP = {
    'Ideal': 5,
    'Acceptable': 3,
    'Needs Improvement': 1,
    'Unacceptable': -10
};

/**
 * Reverses point average to the closest label string
 */
function getLabelFromAverage(average) {
    // Distance based mapping
    // Ideal (5), Acceptable (3), Needs Improvement (1), Unacceptable (-10)
    if (average >= 4) return 'Ideal';
    if (average >= 2) return 'Acceptable';
    if (average >= 0) return 'Needs Improvement';
    return 'Unacceptable';
}

/**
 * Evaluates multiple images and aggregates the results
 * @param {string[]} filePaths Array of local file paths
 */
async function evaluateImages(filePaths) {
    if (!filePaths || filePaths.length === 0) {
        throw new Error('No files provided for evaluation');
    }

    const evaluations = [];
    for (const filePath of filePaths) {
        const result = await evaluateSingleImage(filePath);
        if (result && !result.error) {
            evaluations.push(result);
        }
    }

    if (evaluations.length === 0) {
        throw new Error('AI API returned errors for all images');
    }

    // If only one image, return its results directly
    if (evaluations.length === 1) {
        const ev = evaluations[0];
        return {
            api_status: 'SUCCESS',
            api_score: ev.points || 0,
            confidence: 90.0, // Default mock confidence from python API
            smooth_outline_status: ev.smooth_outline?.feedback || 'Acceptable',
            flat_floor_status: ev.flat_floor?.feedback || 'Acceptable',
            depth_status: ev.depth?.feedback || 'Acceptable',
            undercut_status: ev.undercut?.feedback || 'Acceptable',
            raw_response_json: JSON.stringify(evaluations)
        };
    }

    // Aggregate results for multiple images
    let totalPoints = 0;
    
    // Sum numeric scores to average them out
    let smoothScores = 0, flatScores = 0, depthScores = 0, undercutScores = 0;

    for (const ev of evaluations) {
        // Average total points
        totalPoints += (ev.points || 0);

        // Map textual feedback to numerical scores for averaging
        smoothScores += SCORE_MAP[ev.smooth_outline?.feedback] || 0;
        flatScores += SCORE_MAP[ev.flat_floor?.feedback] || 0;
        depthScores += SCORE_MAP[ev.depth?.feedback] || 0;
        undercutScores += SCORE_MAP[ev.undercut?.feedback] || 0;
    }

    const n = evaluations.length;

    return {
        api_status: 'SUCCESS',
        api_score: (totalPoints / n), // Average overall points
        confidence: 85.0,
        smooth_outline_status: getLabelFromAverage(smoothScores / n),
        flat_floor_status: getLabelFromAverage(flatScores / n),
        depth_status: getLabelFromAverage(depthScores / n),
        undercut_status: getLabelFromAverage(undercutScores / n),
        raw_response_json: JSON.stringify(evaluations)
    };
}

module.exports = {
    evaluateImages
};
