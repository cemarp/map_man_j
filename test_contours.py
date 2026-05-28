import cv2
import numpy as np

image = cv2.imread("backend/images/4b6df673-c755-42b5-954d-62c74d1aeed4.png")
if image is not None:
    # Let's write a custom script to inspect contours
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    lower_red1 = np.array([0, 100, 100])
    upper_red1 = np.array([10, 255, 255])
    lower_red2 = np.array([160, 100, 100])
    upper_red2 = np.array([180, 255, 255])
    mask_red1 = cv2.inRange(hsv, lower_red1, upper_red1)
    mask_red2 = cv2.inRange(hsv, lower_red2, upper_red2)
    mask_red = cv2.bitwise_or(mask_red1, mask_red2)

    contours_red, _ = cv2.findContours(mask_red, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    pin_center = None
    if contours_red:
        largest_red = max(contours_red, key=cv2.contourArea)
        if cv2.contourArea(largest_red) > 20:
            lowest_point = tuple(largest_red[largest_red[:, :, 1].argmax()][0])
            pin_center = lowest_point
            print(f"Targeting pin at: {pin_center}")

    lower_gray = np.array([0, 0, 200])
    upper_gray = np.array([180, 30, 255])
    mask = cv2.inRange(hsv, lower_gray, upper_gray)

    kernel = np.ones((5,5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)

    if pin_center is not None:
        pin_x, pin_y = float(pin_center[0]), float(pin_center[1])
        found = False
        for c in contours:
            area = cv2.contourArea(c)
            if area < 100: continue
            if cv2.pointPolygonTest(c, (pin_x, pin_y), False) >= 0:
                print(f"Found contour containing pin with area {area}")
                found = True
                break
        if not found:
            # Let's try distance based
            best_contour = None
            min_dist = float('inf')
            for c in contours:
                 M = cv2.moments(c)
                 if M["m00"] > 0:
                     cx = int(M["m10"] / M["m00"])
                     cy = int(M["m01"] / M["m00"])
                     dist = np.sqrt((cx - pin_x)**2 + (cy - pin_y)**2)
                     if dist < min_dist:
                         min_dist = dist
                         best_contour = c
            if best_contour is not None:
                print(f"Using closest contour, distance: {min_dist}, area: {cv2.contourArea(best_contour)}")
