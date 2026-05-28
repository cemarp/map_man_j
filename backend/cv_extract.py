import cv2
import numpy as np

def extract_building_outline(image_path: str):
    """
    Extracts the building outline from a Google Maps screenshot.
    Google maps default view renders buildings as slightly darker polygons.
    """
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError("Could not read image")

    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Building color in Google Maps default view is usually a distinct shade of light grey/tan
    # Let's try color thresholding in HSV space instead of edge detection
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    # Google maps buildings have a specific grey color #EBECE8 or similar
    # Adjust thresholds to be tighter to building colors to avoid capturing the whole map
    lower_bound = np.array([0, 0, 215])
    upper_bound = np.array([180, 25, 245])

    mask = cv2.inRange(hsv, lower_bound, upper_bound)

    # Clean up mask
    kernel = np.ones((5,5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    # Find contours
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    h, w = img.shape[:2]
    center = (w // 2, h // 2)

    # Try to find the red pin to use as the target point
    target_point = center
    lower_red1 = np.array([0, 100, 100])
    upper_red1 = np.array([10, 255, 255])
    mask1 = cv2.inRange(hsv, lower_red1, upper_red1)

    lower_red2 = np.array([170, 100, 100])
    upper_red2 = np.array([180, 255, 255])
    mask2 = cv2.inRange(hsv, lower_red2, upper_red2)

    mask_red = mask1 | mask2

    pin_contours, _ = cv2.findContours(mask_red, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if pin_contours:
        valid_pin_contours = [c for c in pin_contours if cv2.contourArea(c) > 50]
        if valid_pin_contours:
            largest_pin_contour = max(valid_pin_contours, key=cv2.contourArea)
            # Find the bottom-most point of the pin
            bottom_point = tuple(largest_pin_contour[largest_pin_contour[:, :, 1].argmax()][0])
            target_point = (int(bottom_point[0]), int(bottom_point[1]))

    best_contour = None
    best_score = float('inf')

    for cnt in contours:
        area = cv2.contourArea(cnt)
        # Buildings aren't usually > 25% of the screen.
        if area < 500 or area > (h * w * 0.25):
            continue

        epsilon = 0.01 * cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, epsilon, True)

        is_inside = cv2.pointPolygonTest(approx, target_point, False) >= 0

        M = cv2.moments(cnt)
        if M['m00'] != 0:
            cx = int(M['m10']/M['m00'])
            cy = int(M['m01']/M['m00'])

            # Distance to target point
            dist = np.sqrt((cx - target_point[0])**2 + (cy - target_point[1])**2)

            if is_inside:
                score = -1000000 + dist  # Strongly prefer contours that contain the pin
            else:
                score = dist / np.sqrt(area)

            if score < best_score:
                best_score = score
                best_contour = approx

    if best_contour is None:
        # Fallback to returning a smaller default square in the middle if nothing found
        s = 50
        best_contour = np.array([[[center[0]-s, center[1]-s]], [[center[0]+s, center[1]-s]], [[center[0]+s, center[1]+s]], [[center[0]-s, center[1]+s]]])

    pixel_area = cv2.contourArea(best_contour)
    pixel_perimeter = cv2.arcLength(best_contour, True)

    polygon_points = []
    for pt in best_contour:
        polygon_points.append({"x": int(pt[0][0]), "y": int(pt[0][1])})

    return polygon_points, pixel_area, pixel_perimeter

import math

def get_scale_from_lat_zoom(lat: float, zoom: float, device_scale_factor: int = 2):
    """
    Calculate feet per pixel based on Google Maps math.
    meters_per_pixel = 156543.03392 * cos(lat * pi / 180) / (2 ^ zoom)
    Since we use a device_scale_factor of 2 in Playwright, the pixels are doubled,
    so we need to divide by device_scale_factor.
    """
    meters_per_pixel = 156543.03392 * math.cos(lat * math.pi / 180) / (2 ** zoom)

    # Adjust for Playwright's device_scale_factor
    meters_per_pixel = meters_per_pixel / device_scale_factor

    # Convert meters to feet
    feet_per_pixel = meters_per_pixel * 3.28084
    return feet_per_pixel
