import tensorflow as tf
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
import io
from PIL import Image
import numpy as np
import cv2
from fastapi.middleware.cors import CORSMiddleware
import traceback
import hashlib
import os
from contextlib import asynccontextmanager

# Create a dictionary to store models
ml_models = {}


# Use lifespan context manager to load model once at startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load model at startup
    try:
        # Clear any previous models from memory
        tf.keras.backend.clear_session()

        # Load model with compile=False to ensure clean loading
        MODEL_PATH = "model/last_train_model.keras"
        ml_models["model"] = tf.keras.models.load_model(MODEL_PATH, compile=False)
        print("✅ Model loaded successfully!")

        # Test the model output structure
        test_input = np.zeros((1, 224, 224, 3))
        test_output = ml_models["model"].predict(test_input)
        print("Model output structure:", type(test_output))
        if isinstance(test_output, dict):
            print("Model outputs:", list(test_output.keys()))
        elif isinstance(test_output, list):
            print("Model has multiple outputs:", len(test_output))
        else:
            print("Model output shape:", test_output.shape)
    except Exception as e:
        print(f"🚨 Model loading failed: {e}")
        print(traceback.format_exc())

    yield

    # Clean up resources
    ml_models.clear()
    print("✅ Model resources cleared")


# Create FastAPI app with lifespan
app = FastAPI(lifespan=lifespan)

# Allow frontend to access the backend API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define labels
smooth_outline_labels = [
    "Ideal",
    "Acceptable, minor irregularities present",
    "Moderate roughness present",
    "Unacceptable, very rough outline"
]

flat_floor_labels = [
    "Ideal",
    "Slight unevenness present",
    "Uneven floor in 50% of the cavity",
    "Unacceptable, no flatness at all"
]

depth_labels = [
    "Ideal, all over the cavity >2mm",
    "Acceptable, 75% of the cavity is well prepared",
    "Need improvements, about 50% of the cavity is well prepared",
    "Unacceptable, depth is <2mm"
]

undercut_labels = [
    "Ideal, present all over the cavity",
    "Acceptable, undercuts present >75% of the cavity",
    "Need improvements, undercuts present only <50% of the cavity",
    "Unacceptable, no undercuts at all"
]


@app.get("/")
async def root():
    return {"message": "FastAPI is running successfully!"}


# Function to calculate grade based on feature predictions
def calculate_grade(smooth_pred, flat_pred, depth_pred, undercut_pred):
    # Convert categorical predictions to scores
    score_mapping = {
        0: 5,  # Ideal
        1: 3,  # Acceptable
        2: 1,  # Needs improvement
        3: -10  # Unacceptable
    }

    smooth_points = score_mapping[smooth_pred]
    flat_points = score_mapping[flat_pred]
    depth_points = score_mapping[depth_pred]
    undercut_points = score_mapping[undercut_pred]

    total_points = smooth_points + flat_points + depth_points + undercut_points

    # Determine grade based on total points
    if total_points >= 20:
        return "A+", total_points
    elif total_points >= 18:
        return "A", total_points
    elif total_points >= 16:
        return "A-", total_points
    elif total_points >= 14:
        return "B+", total_points
    elif total_points >= 12:
        return "B", total_points
    elif total_points >= 10:
        return "B-", total_points
    else:
        return "C", total_points


@app.post("/predict/")
async def predict(file: UploadFile = File(...)):
    try:
        # Check if model is loaded
        if "model" not in ml_models:
            return JSONResponse(
                content={"error": "Model not loaded. Please try again later."},
                status_code=503
            )

        # Read image
        image_bytes = await file.read()

        # Get image hash to verify uniqueness
        image_hash = hashlib.md5(image_bytes).hexdigest()[:8]
        print(f"Processing image with hash: {image_hash}")

        # Load the image using OpenCV (similar to your Colab code)
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)  # Ensure RGB format

        # Preprocess the image (resize and normalize)
        img = cv2.resize(image, (224, 224))  # Resize to match model input
        img = img / 255.0  # Normalize pixel values
        img = np.expand_dims(img, axis=0)  # Add batch dimension

        # Print image shape and values to verify preprocessing
        print(f"Image shape: {img.shape}")
        print(f"Image min/max values: {np.min(img):.4f}/{np.max(img):.4f}")

        # Run prediction using the loaded model
        predictions = ml_models["model"].predict(img)

        # Print raw predictions to debug
        print(f"Raw predictions shape: {[p.shape for p in predictions]}")
        print(f"First few values: {[p[0][:3] for p in predictions]}")

        # Process predictions (assuming list output from model with 4 outputs)
        if isinstance(predictions, list) and len(predictions) == 4:
            smooth_pred = np.argmax(predictions[0][0])
            flat_pred = np.argmax(predictions[1][0])
            depth_pred = np.argmax(predictions[2][0])
            undercut_pred = np.argmax(predictions[3][0])

            # Print class predictions
            print(
                f"Class predictions: Smooth={smooth_pred}, Flat={flat_pred}, Depth={depth_pred}, Undercut={undercut_pred}")

            # Calculate grade
            grade, points = calculate_grade(smooth_pred, flat_pred, depth_pred, undercut_pred)

            # Use simplified labels like in Colab
            simple_labels = ['Ideal', 'Acceptable', 'Needs Improvement', 'Unacceptable']

            result = {
                "smooth_outline": {
                    "raw_prediction": predictions[0][0].tolist(),
                    "feedback": simple_labels[smooth_pred]
                },
                "flat_floor": {
                    "raw_prediction": predictions[1][0].tolist(),
                    "feedback": simple_labels[flat_pred]
                },
                "depth": {
                    "raw_prediction": predictions[2][0].tolist(),
                    "feedback": simple_labels[depth_pred]
                },
                "undercut": {
                    "raw_prediction": predictions[3][0].tolist(),
                    "feedback": simple_labels[undercut_pred]
                },
                "grade": grade,
                "points": points
            }
        else:
            # Handle unexpected model output format
            result = {
                "error": "Unexpected model output format"
            }

        return JSONResponse(content=result)

    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"Prediction error: {str(e)}")
        print(error_trace)
        return JSONResponse(
            content={"error": str(e), "traceback": error_trace},
            status_code=500
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
