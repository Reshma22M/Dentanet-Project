import React from "react";

// Define proper types for the prediction data structure
interface FeatureResult {
  feedback: string;
  raw_prediction: number[];
}

interface PredictionResult {
  smooth_outline?: FeatureResult;
  flat_floor?: FeatureResult;
  depth?: FeatureResult;
  undercut?: FeatureResult;
  grade?: string;
  points?: number;
  error?: string;
  [key: string]: FeatureResult | string | number | undefined;
}

interface ResultDisplayProps {
  prediction: PredictionResult;
}

const ResultDisplay: React.FC<ResultDisplayProps> = ({ prediction }) => {
  if (!prediction) return null;

  // Check if there's an error in the prediction
  if (prediction.error) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-md">
        <p className="font-medium">Analysis Error</p>
        <p>{prediction.error}</p>
      </div>
    );
  }

  // Format feature names for display
  const formatFeatureName = (key: string) => {
    return key
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Get color for grade display
  const getGradeColor = (grade: string) => {
    if (!grade) return "bg-gray-100";

    if (grade.startsWith("A")) return "bg-green-100 text-green-800 border-green-300";
    if (grade.startsWith("B")) return "bg-blue-100 text-blue-800 border-blue-300";
    return "bg-yellow-100 text-yellow-800 border-yellow-300";
  };

  // Get feedback description based on points
  const getFeedbackDescription = (points: number) => {
    if (points >= 16) return "Excellent cavity preparation";
    if (points >= 10) return "Good cavity preparation with minor issues";
    return "Needs significant improvement";
  };

  // Filter out grade and points to display features separately
  const featureEntries = Object.entries(prediction).filter(
    ([key]) => key !== "grade" && key !== "points" && key !== "error"
  );

  // Check if prediction has grade and points
  const hasGrade = prediction.grade && prediction.points;

  return (
    <div className="bg-white rounded-xl p-4 sm:p-6 shadow-lg border border-blue-100">
      <h3 className="text-base sm:text-lg font-semibold mb-4 text-blue-900">
        Analysis Results
      </h3>

      {/* Feature Results */}
      <div className="space-y-4 mb-6">
        {featureEntries.map(([key, value]) => {
          // Type guard to ensure value is a FeatureResult
          const featureValue = value as FeatureResult;
          return (
            <div key={key} className="bg-blue-50 rounded-lg p-4">
              <h4 className="font-medium text-blue-800 mb-2">
                {formatFeatureName(key)}
              </h4>
              {featureValue.feedback && (
                <div className="mb-2 text-blue-700">
                  <span className="font-medium">Result:</span> {featureValue.feedback}
                </div>
              )}
              {featureValue.raw_prediction && (
                <div className="text-xs text-blue-600">
                  <span className="font-medium">Confidence scores:</span>{" "}
                  {featureValue.raw_prediction.map((score, i) => (
                    <span key={i} className="ml-1">
                      {(score * 100).toFixed(1)}%{i < featureValue.raw_prediction.length - 1 ? "," : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Overall Grade */}
      {hasGrade && prediction.grade && prediction.points && (
        <div className="rounded-lg p-6 border-2 mt-6">
          <h4 className="font-semibold text-gray-800 mb-4 text-lg text-center">
            Overall Assessment
          </h4>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <div className={`${getGradeColor(prediction.grade)} rounded-full w-20 h-20 flex items-center justify-center text-3xl font-bold border-2`}>
              {prediction.grade}
            </div>
            <div className="text-gray-700 text-center sm:text-left">
              <p className="font-medium text-lg">Total Points: {prediction.points}</p>
              <p className="text-sm text-gray-600 mt-2">
                {getFeedbackDescription(prediction.points)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultDisplay;
