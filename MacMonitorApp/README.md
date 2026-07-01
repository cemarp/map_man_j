# MacMonitor - Battery & Hardware Monitoring for Apple Silicon

This repository contains the source code for a native SwiftUI macOS application designed to monitor Apple Silicon hardware metrics (Power, Temperatures) and control battery charging behavior (Charge Limits, Sailing Mode, Force Discharge) similar to AlDente.

> **Note:** This codebase was generated in a Linux environment. It provides the complete Swift architecture, XPC communication layer, and UI, but requires an Xcode project to be set up on a macOS machine to compile, link `IOKit`, and configure code signing for the Privileged Helper Tool.

## Project Structure

*   `Shared/`: Contains the `SystemMetrics` models and the `MacMonitorHelperProtocol` (XPC protocol) used by both the app and the helper.
*   `HelperTool/`: The daemon that runs as `root`. It handles privileged tasks like parsing `powermetrics` and writing to the SMC (System Management Controller) to control the battery.
*   `MacMonitor/`: The main SwiftUI application, featuring the XPC client, ViewModel (with a 7-day RAM buffer), and the charting/control interface.

## How to Build and Run on Your Mac

Because the interaction between a main app and a privileged helper tool via XPC requires strict Code Signing and Entitlements, you must create the Xcode project on your machine. Follow these exact steps:

### 1. Create the Xcode Project
1. Open **Xcode** and select **File > New > Project**.
2. Select **macOS > App** and click Next.
3. Name the product `MacMonitor`, choose **SwiftUI** for the interface, and **Swift** for the language. Ensure your personal Team is selected for code signing.
4. Save the project to your disk.

### 2. Copy the Main App Files
1. In Xcode, delete the default `ContentView.swift` and `MacMonitorApp.swift` files.
2. Drag and drop the following files from this repository into the `MacMonitor` folder in Xcode:
    *   `MacMonitor/MacMonitorApp.swift`
    *   `MacMonitor/DashboardView.swift`
    *   `MacMonitor/AppViewModel.swift`
    *   `MacMonitor/HelperClient.swift`
    *   `Shared/Models.swift`
    *   `Shared/XPCProtocol.swift`
3. Ensure "Copy items if needed" is checked and they are added to the `MacMonitor` target.

### 3. Create the Privileged Helper Tool Target
1. In Xcode, go to **File > New > Target**.
2. Select **macOS > XPC Service** (or Command Line Tool if you prefer configuring `SMAppService` manually, but XPC Service handles some boilerplate).
3. Name it `com.yourdomain.MacMonitor.HelperTool`.
4. Delete the default generated Swift files for this target (`main.swift` or the default service file), but **do NOT delete the `Info.plist`** if Xcode generated one in that folder. If Xcode 14+ didn't generate an `Info.plist` as a separate file, you can manage it via the Target's "Info" tab.
5. Drag and drop the following files into the new Helper Tool folder in Xcode:
    *   `HelperTool/main.swift`
    *   `HelperTool/MacMonitorHelper.swift`
    *   `Shared/Models.swift` (Make sure this is added to *both* targets)
    *   `Shared/XPCProtocol.swift` (Make sure this is added to *both* targets)

### 4. Configure Code Signing and Info.plist (Crucial)
For an app to install a helper tool, they must verify each other's code signatures.
1. In the Main App's `Info.plist`, add the `SMPrivilegedExecutables` key. The value should be a dictionary where the key is `com.yourdomain.MacMonitor.HelperTool` and the value is a string matching the helper's certificate requirement (e.g., `identifier "com.yourdomain.MacMonitor.HelperTool" and anchor apple generic and certificate leaf[subject.CN] = "Apple Development: Your Name (TeamID)"`).
2. In the Helper Tool's `Info.plist`, add the `SMAuthorizedClients` key. The value should be an array of strings, containing the requirement to verify the main app.
3. **Modern Alternative (macOS 13+):** Look into using `SMAppService.daemon(name:)`. It vastly simplifies installation compared to the older `SMJobBless` API.

### 5. Implement the Missing Privileged APIs
Search the code for `// In a real app`. I have stubbed out the OS-specific hardware calls:
1. **HelperClient.swift:** Implement the actual `SMAppService.daemon` or `SMJobBless` call in `installHelperTool()`.
2. **MacMonitorHelper.swift:**
    *   Replace the mock data generation in `getMetrics()` with a `Process` execution of `sudo powermetrics -n 1 --samplers smc,cpu_power,gpu_power` and parse the standard output.
    *   Implement SMC writes in `updateBatteryControlState()` using `IOKit`. You will need to link the `IOKit.framework` and find an open-source Swift SMC wrapper (like the ones used by AlDente or Stats) to write to keys like `BCLM` (Battery Charge Limit).

### 6. Build and Run
1. Select the `MacMonitor` scheme.
2. Hit **Run (Cmd+R)**.
3. The app will prompt you to install the helper tool (requiring Touch ID or password). Once installed, the mock data (or real data once you implement step 5) will flow into the Swift Charts!

## Features Implemented in Logic
*   **7-Day RAM Buffer:** The `AppViewModel` automatically culls data points older than 7 days based on a 5-second polling interval, storing them purely in RAM.
*   **Sailing Mode State Machine:** The ViewModel evaluates the current battery level against your upper and lower limits, sending `forceDischarge` commands to the helper when sailing is active.
*   **Real-time Charts:** Utilizes native iOS 16/macOS 13 `SwiftCharts` to plot multiple data series concurrently.