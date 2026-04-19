"""
CV pipeline for the AI Rally game.

Paddle detection uses the Roboflow "pickleball-paddle-detection" dataset
(YOLOv8n fine-tuned via setup_dataset.py) to locate the paddle bounding box.
When the YOLO model is unavailable, an HSV color-mask fallback is used, and
when both fail a synthetic box is generated from pose landmarks.

Forehand / backhand classification is **rule-based** — there is no ML dataset
for stroke types.  The classifier uses wrist x-displacement direction, elbow
angle, hip rotation, and wrist snap velocity to identify strokes from the
mirrored webcam feed.  See stroke_classifier.py for details.
"""
