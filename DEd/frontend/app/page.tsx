"use client";

import FileUploader from "./components/FileUploader";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-start min-h-screen bg-gradient-to-br from-blue-50 to-white p-6">
      {/* Top Title Section */}
      <div className="w-full text-center py-4 fixed top-0 left-0 bg-white shadow-md z-10">
        <h1 className="text-4xl font-bold text-blue-900">
          DentED - Dental AI Analysis
        </h1>
      </div>

      {/* Spacer to prevent content overlap */}
      <div className="h-24"></div>

      {/* File Upload Component */}
      <FileUploader />
    </div>
  );
}
