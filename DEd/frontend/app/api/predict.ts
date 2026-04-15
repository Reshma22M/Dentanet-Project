import axios from "axios";

// Backend API URL
const API_URL = "http://127.0.0.1:8000/predict/";

export const uploadImageForPrediction = async (image: File) => {
  try {
    const formData = new FormData();
    formData.append("file", image);

    const response = await axios.post(API_URL, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    return {
      prediction: response.data
    };
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
};
