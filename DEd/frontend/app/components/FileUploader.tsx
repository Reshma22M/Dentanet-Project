"use client";

import { useState, useEffect, useRef } from "react";
import { uploadImageForPrediction } from "../api/predict";
import Image from "next/image";
import ResultDisplay from "./ResultDisplay";

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

export default function FileUploader() {
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      setImage(file);
      setPrediction(null);
      setError(null);

      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
      setImageUrl(URL.createObjectURL(file));
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      setImage(file);
      setPrediction(null);
      setError(null);

      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
      setImageUrl(URL.createObjectURL(file));
    }
  };

  const handleUpload = async () => {
    if (!image) {
      alert("Please select an image first!");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await uploadImageForPrediction(image);
      console.log("API Response:", data.prediction);
      setPrediction(data.prediction);
    } catch (error: unknown) {
      console.error("Prediction Error:", error);

      if (error instanceof Error) {
        setError(error.message || "Prediction failed. Please try again.");
      } else {
        setError("Prediction failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChooseDifferentImage = () => {
    setImage(null);
    setPrediction(null);
    setError(null);
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
      setImageUrl(null);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 px-4 sm:px-6 lg:px-8">
      {/* Upload Section */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-4 sm:p-6 transition-all
          ${dragActive 
            ? "border-blue-500 bg-blue-50" 
            : "border-blue-200 hover:border-blue-300"
          }
          ${!image ? "cursor-pointer" : ""}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !image && fileInputRef.current?.click()}
      >
        <input
          id="fileInput"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          ref={fileInputRef}
        />

        {!image ? (
          <div className="text-center">
            <div className="mx-auto w-10 h-10 sm:w-12 sm:h-12 mb-3 sm:mb-4 flex items-center justify-center rounded-full bg-blue-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
            </div>
            <h3 className="text-base sm:text-lg font-semibold mb-2 text-blue-900">
              Upload Your Dental Image
            </h3>
            <p className="text-xs sm:text-sm text-blue-700 mb-2">
              Drag and drop your image here, or click to browse
            </p>
            <p className="text-xs text-blue-500">
              Supported formats: JPG, PNG, JPEG
            </p>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-blue-50">
              {imageUrl && (
                <Image
                  src={imageUrl}
                  alt="Preview"
                  width={500}
                  height={500}
                  className="w-full h-full object-contain"
                />
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
              <button
                onClick={handleChooseDifferentImage}
                className="px-4 py-2 sm:px-6 sm:py-2.5 rounded-lg border border-blue-300 hover:bg-blue-50 transition-colors text-xs sm:text-sm text-blue-700"
              >
                Choose Different Image
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpload();
                }}
                disabled={loading}
                className="px-4 py-2 sm:px-6 sm:py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-xs sm:text-sm text-white transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4 sm:h-5 sm:w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Processing...
                  </>
                ) : (
                  "Analyze Image"
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
          <h3 className="font-semibold mb-1">Error</h3>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Results Section */}
      {prediction && <ResultDisplay prediction={prediction} />}
    </div>
  );
}
