export interface Point {
  x: number;
  y: number;
}

export function extractBuildingOutline(canvas: HTMLCanvasElement): {
  polygon: Point[];
  area: number;
  perimeter: number;
} {
  const cv = (window as any).cv;
  if (!cv) {
    throw new Error("OpenCV.js is not loaded yet!");
  }

  // 1. Read image from canvas (RGBA format)
  let img = cv.imread(canvas);
  let hsv = new cv.Mat();
  let mask = new cv.Mat();
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();

  // Pin masks
  let mask1 = new cv.Mat();
  let mask2 = new cv.Mat();
  let maskRed = new cv.Mat();
  let pinContours = new cv.MatVector();
  let pinHierarchy = new cv.Mat();

  try {
    const h = img.rows;
    const w = img.cols;
    const center = { x: Math.floor(w / 2), y: Math.floor(h / 2) };

    // 2. Convert to HSV: RGBA -> RGB -> HSV
    let rgb = new cv.Mat();
    cv.cvtColor(img, rgb, cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
    rgb.delete();

    // 3. Google Maps/Leaflet grey building thresholds
    // lower_bound = [0, 0, 215], upper_bound = [180, 25, 245]
    let lowerBound = cv.matFromArray(1, 3, cv.CV_8U, [0, 0, 215]);
    let upperBound = cv.matFromArray(1, 3, cv.CV_8U, [180, 25, 245]);
    cv.inRange(hsv, lowerBound, upperBound, mask);
    lowerBound.delete();
    upperBound.delete();

    // 4. Clean up mask via morphology
    let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
    kernel.delete();

    // 5. Find contours
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // 6. Find red pin to use as the target point
    let targetPoint = { x: center.x, y: center.y };

    // Red range 1
    let lowerRed1 = cv.matFromArray(1, 3, cv.CV_8U, [0, 100, 100]);
    let upperRed1 = cv.matFromArray(1, 3, cv.CV_8U, [10, 255, 255]);
    cv.inRange(hsv, lowerRed1, upperRed1, mask1);
    lowerRed1.delete();
    upperRed1.delete();

    // Red range 2
    let lowerRed2 = cv.matFromArray(1, 3, cv.CV_8U, [170, 100, 100]);
    let upperRed2 = cv.matFromArray(1, 3, cv.CV_8U, [180, 255, 255]);
    cv.inRange(hsv, lowerRed2, upperRed2, mask2);
    lowerRed2.delete();
    upperRed2.delete();

    // Combine red masks
    cv.bitwise_or(mask1, mask2, maskRed);

    // Find red pin contours
    cv.findContours(maskRed, pinContours, pinHierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let largestPinArea = 0;
    let largestPinContourIndex = -1;

    for (let i = 0; i < pinContours.size(); ++i) {
      let cnt = pinContours.get(i);
      let area = cv.contourArea(cnt);
      if (area > 50 && area > largestPinArea) {
        largestPinArea = area;
        largestPinContourIndex = i;
      }
      cnt.delete();
    }

    if (largestPinContourIndex !== -1) {
      let cnt = pinContours.get(largestPinContourIndex);
      let points = cnt.data32S;
      let maxY = -1;
      let bottomX = center.x;
      let bottomY = center.y;

      for (let i = 0; i < points.length; i += 2) {
        let x = points[i];
        let y = points[i + 1];
        if (y > maxY) {
          maxY = y;
          bottomX = x;
          bottomY = y;
        }
      }
      targetPoint = { x: bottomX, y: bottomY };
      cnt.delete();
      console.log("Red pin bottom-most point detected at:", targetPoint);
    } else {
      console.log("No red pin detected, defaulting to image center:", targetPoint);
    }

    // 7. Find best building contour matching targetPoint
    let bestContourIndex = -1;
    let bestScore = Infinity;
    let bestApprox = new cv.Mat();

    for (let i = 0; i < contours.size(); ++i) {
      let cnt = contours.get(i);
      let area = cv.contourArea(cnt);

      if (area < 500 || area > (h * w * 0.25)) {
        cnt.delete();
        continue;
      }

      let perimeter = cv.arcLength(cnt, true);
      let approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.01 * perimeter, true);

      let pt = new cv.Point(targetPoint.x, targetPoint.y);
      let isInside = cv.pointPolygonTest(approx, pt, false) >= 0;

      let M = cv.moments(cnt, false);
      let cx = center.x;
      let cy = center.y;
      if (M.m00 !== 0) {
        cx = Math.floor(M.m10 / M.m00);
        cy = Math.floor(M.m01 / M.m00);
      }

      let dist = Math.sqrt((cx - targetPoint.x) ** 2 + (cy - targetPoint.y) ** 2);
      let score = dist / Math.sqrt(area);
      if (isInside) {
        score = -1000000 + dist;
      }

      if (score < bestScore) {
        bestScore = score;
        bestContourIndex = i;
        bestApprox.delete();
        bestApprox = approx;
      } else {
        approx.delete();
      }

      cnt.delete();
    }

    let finalPolygon: Point[] = [];
    let pixelArea = 0;
    let pixelPerimeter = 0;

    if (bestContourIndex !== -1 && bestApprox.rows > 0) {
      pixelArea = cv.contourArea(bestApprox);
      pixelPerimeter = cv.arcLength(bestApprox, true);

      let points = bestApprox.data32S;
      for (let i = 0; i < points.length; i += 2) {
        finalPolygon.push({ x: points[i], y: points[i + 1] });
      }
    } else {
      const s = 50;
      finalPolygon = [
        { x: center.x - s, y: center.y - s },
        { x: center.x + s, y: center.y - s },
        { x: center.x + s, y: center.y + s },
        { x: center.x - s, y: center.y + s }
      ];
      pixelArea = (s * 2) * (s * 2);
      pixelPerimeter = s * 8;
    }

    bestApprox.delete();

    return {
      polygon: finalPolygon,
      area: pixelArea,
      perimeter: pixelPerimeter
    };

  } finally {
    // 8. CRITICAL memory cleanup for WASM runtime
    img.delete();
    hsv.delete();
    mask.delete();
    contours.delete();
    hierarchy.delete();
    mask1.delete();
    mask2.delete();
    maskRed.delete();
    pinContours.delete();
    pinHierarchy.delete();
  }
}

export function getScaleFromLatZoom(lat: number, zoom: number): number {
  // meters_per_pixel = 156543.03392 * cos(lat * pi / 180) / (2 ^ zoom)
  const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  // Convert meters to feet
  const feetPerPixel = metersPerPixel * 3.28084;
  return feetPerPixel;
}
