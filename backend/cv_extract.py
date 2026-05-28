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

    # These bounds are for the typical building color in maps
    lower_bound = np.array([0, 0, 200])
    upper_bound = np.array([40, 40, 250])

    mask = cv2.inRange(hsv, lower_bound, upper_bound)

    # Clean up mask
    kernel = np.ones((5,5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    # Find contours
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    h, w = img.shape[:2]
    center = (w // 2, h // 2)

    best_contour = None
    best_score = float('inf')

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 2000 or area > (h * w * 0.5): # Buildings are usually decently sized
            continue

        epsilon = 0.01 * cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, epsilon, True)

        M = cv2.moments(cnt)
        if M['m00'] != 0:
            cx = int(M['m10']/M['m00'])
            cy = int(M['m01']/M['m00'])

            # Distance to center
            dist = np.sqrt((cx - center[0])**2 + (cy - center[1])**2)

            # Score favors large area and closeness to center
            score = dist / np.sqrt(area)
            if score < best_score:
                best_score = score
                best_contour = approx

    if best_contour is None:
        # Fallback to returning a default square in the middle if nothing found
        s = 100
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
