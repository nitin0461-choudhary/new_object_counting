# Enhanced Backend Code
import cv2
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
import google.generativeai as genai
from datetime import datetime, timedelta
import os
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
load_dotenv()
import json

app = Flask(__name__)
CORS(app)

# Configuration
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv'}
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# MongoDB setup
try:
    client = MongoClient('mongodb://localhost:27017/')  # Update with your MongoDB URI
    db = client['object_counting']
    collection = db['video_analysis']
    print("Connected to MongoDB")
except Exception as e:
    print(f"MongoDB connection error: {e}")

# Gemini AI setup
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))  # Replace with your actual API key
model = genai.GenerativeModel('gemini-1.5-flash')

# YOLO setup
weights_path = "/home/nitin/Mern_stack_learning/new_object_counting/Backend/yolov4.weights"
config_path = "/home/nitin/Mern_stack_learning/new_object_counting/Backend/yolov4.cfg"
coco_names_path = "/home/nitin/Mern_stack_learning/new_object_counting/Backend/coco.names"

with open(coco_names_path, 'r') as f:
    classes = [line.strip() for line in f.readlines()]

# Load YOLO model
net = cv2.dnn.readNet(weights_path, config_path)
net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
layer_names = net.getLayerNames()
output_layers = [layer_names[i - 1] for i in net.getUnconnectedOutLayers()]

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def detect_objects_in_frame(frame):
    """Detect objects in a single frame"""
    height, width, _ = frame.shape
    blob = cv2.dnn.blobFromImage(frame, 0.00392, (416, 416), (0, 0, 0), swapRB=True, crop=False)
    net.setInput(blob)
    outputs = net.forward(output_layers)
    
    class_ids = []
    confidences = []
    boxes = []
    
    for output in outputs:
        for detection in output:
            scores = detection[5:]
            class_id = np.argmax(scores)
            confidence = scores[class_id]
            if confidence > 0.5:
                center_x = int(detection[0] * width)
                center_y = int(detection[1] * height)
                w = int(detection[2] * width)
                h = int(detection[3] * height)
                x = int(center_x - w / 2)
                y = int(center_y - h / 2)
                boxes.append([x, y, w, h])
                confidences.append(float(confidence))
                class_ids.append(class_id)
    
    indexes = cv2.dnn.NMSBoxes(boxes, confidences, 0.5, 0.4)
    
    detected_objects = {}
    if len(indexes) > 0:
        for i in indexes.flatten():
            class_name = classes[class_ids[i]]
            detected_objects[class_name] = detected_objects.get(class_name, 0) + 1
    
    return detected_objects, len(indexes)

def generate_summary(interval_data, interval_minutes):
    """Generate summary using Gemini AI"""
    try:
        prompt = f"""
        Analyze this object detection data from a {interval_minutes}-minute video interval:
        
        Objects detected: {interval_data['objects_detected']}
        Total count: {interval_data['total_count']}
        Timestamp: {interval_data['timestamp']}
        
        Please provide a brief summary of the activity level and any notable patterns or observations.
        Keep it concise and professional.
        """
        
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        print(f"Error generating summary: {e}")
        return "Summary generation failed"

def process_video_with_intervals(video_path, interval_seconds, alert_limit):
    """Process video in time intervals"""
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        return {"error": "Unable to open video file"}
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    video_duration = total_frames / fps
    
    results = []
    alerts = []
    current_time = 0
    
    frames_per_interval = int(fps * interval_seconds)
    
    while current_time < video_duration:
        # Set video position
        cap.set(cv2.CAP_PROP_POS_MSEC, current_time * 1000)
        
        interval_objects = {}
        interval_total = 0
        frames_processed = 0
        
        # Process frames in this interval
        for _ in range(frames_per_interval):
            ret, frame = cap.read()
            if not ret:
                break
                
            detected_objects, total_count = detect_objects_in_frame(frame)
            
            # Aggregate objects for this interval
            for obj_class, count in detected_objects.items():
                interval_objects[obj_class] = interval_objects.get(obj_class, 0) + count
            
            interval_total += total_count
            frames_processed += 1
            
            # Sample every few frames to speed up processing
            for _ in range(5):  # Skip 5 frames
                ret, _ = cap.read()
                if not ret:
                    break
        
        # Calculate average for this interval
        if frames_processed > 0:
            avg_objects = {obj: count / frames_processed for obj, count in interval_objects.items()}
            avg_total = interval_total / frames_processed
        else:
            avg_objects = {}
            avg_total = 0
        
        # Create interval data
        interval_data = {
            "timestamp": current_time,
            "duration": interval_seconds,
            "objects_detected": avg_objects,
            "total_count": round(avg_total, 2),
            "alert": avg_total > alert_limit
        }
        
        # Check for alerts
        if avg_total > alert_limit:
            alerts.append({
                "timestamp": current_time,
                "count": round(avg_total, 2),
                "limit": alert_limit,
                "message": f"Alert: {round(avg_total, 2)} objects detected (limit: {alert_limit})"
            })
        
        # Generate AI summary
        interval_data["ai_summary"] = generate_summary(interval_data, interval_seconds / 60)
        
        results.append(interval_data)
        current_time += interval_seconds
    
    cap.release()
    
    return {
        "intervals": results,
        "alerts": alerts,
        "video_duration": video_duration,
        "total_intervals": len(results)
    }

def save_to_mongodb(video_filename, analysis_data, config):
    """Save analysis results to MongoDB"""
    try:
        document = {
            "video_filename": video_filename,
            "analysis_date": datetime.now(),
            "config": config,
            "intervals": analysis_data["intervals"],
            "alerts": analysis_data["alerts"],
            "video_duration": analysis_data["video_duration"],
            "total_intervals": analysis_data["total_intervals"]
        }
        
        result = collection.insert_one(document)
        return str(result.inserted_id)
    except Exception as e:
        print(f"Error saving to MongoDB: {e}")
        return None

@app.route('/upload', methods=['POST'])
def upload_video():
    if 'video' not in request.files:
        return jsonify({"error": "No video file uploaded"}), 400
    
    video = request.files['video']
    interval_seconds = int(request.form.get('interval_seconds', 60))  # Default 60 seconds
    alert_limit = int(request.form.get('alert_limit', 10))  # Default 10 objects
    
    if video.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    if not allowed_file(video.filename):
        return jsonify({"error": "Invalid file type"}), 400
    
    filename = secure_filename(video.filename)
    video_path = os.path.join(UPLOAD_FOLDER, filename)
    video.save(video_path)
    
    try:
        # Process video
        analysis_data = process_video_with_intervals(video_path, interval_seconds, alert_limit)
        
        if "error" in analysis_data:
            return jsonify(analysis_data), 500
        
        # Save to MongoDB
        config = {
            "interval_seconds": interval_seconds,
            "alert_limit": alert_limit
        }
        
        doc_id = save_to_mongodb(filename, analysis_data, config)
        analysis_data["document_id"] = doc_id
        
        # Clean up video file
        os.remove(video_path)
        
        return jsonify(analysis_data)
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/history', methods=['GET'])
def get_analysis_history():
    """Get analysis history from MongoDB"""
    try:
        # Get recent analyses
        analyses = list(collection.find().sort("analysis_date", -1).limit(10))
        
        # Convert ObjectId to string for JSON serialization
        for analysis in analyses:
            analysis["_id"] = str(analysis["_id"])
            analysis["analysis_date"] = analysis["analysis_date"].isoformat()
        
        return jsonify(analyses)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/analysis/<doc_id>', methods=['GET'])
def get_analysis(doc_id):
    """Get specific analysis by document ID"""
    try:
        from bson.objectid import ObjectId
        analysis = collection.find_one({"_id": ObjectId(doc_id)})
        
        if analysis:
            analysis["_id"] = str(analysis["_id"])
            analysis["analysis_date"] = analysis["analysis_date"].isoformat()
            return jsonify(analysis)
        else:
            return jsonify({"error": "Analysis not found"}), 404
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)