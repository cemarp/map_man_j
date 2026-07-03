import Foundation
import IOKit
import IOKit.ps

class MacMonitorHelper: NSObject, MacMonitorHelperProtocol {

    // MARK: - Battery Hardware APIs

    private func getBatteryVoltage() -> Int? {
        // 1. Locate the AppleSmartBattery service in the IORegistry
        let serviceMatching = IOServiceMatching("AppleSmartBattery")
        let platformExpert: io_service_t = IOServiceGetMatchingService(kIOMainPortDefault, serviceMatching)

        guard platformExpert != 0 else {
            print("Failed to find AppleSmartBattery service.")
            return nil
        }

        // 2. Extract the "Voltage" property from the hardware registry entry
        let keyAsCFString = IORegistryEntryCreateCFProperty(platformExpert, "Voltage" as CFString, kCFAllocatorDefault, 0)
        IOObjectRelease(platformExpert) // Clean up memory leak footprint

        // 3. Cast the unmanaged memory reference to a standard Swift Int
        if let resultRef = keyAsCFString?.takeRetainedValue() as? Int {
            return resultRef // Value returned is in millivolts (mV)
        }

        return nil
    }

    private func getBatteryAmperage() -> Int? {
        // Use IOPSCopyPowerSourcesInfo to get amperage
        guard let blob = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
              let list = IOPSCopyPowerSourcesList(blob)?.takeRetainedValue() as? [CFTypeRef],
              !list.isEmpty else {
            return nil
        }

        // Assume the first power source is the internal battery
        guard let powerSource = list.first,
              let info = IOPSGetPowerSourceDescription(blob, powerSource)?.takeUnretainedValue() as? [String: Any] else {
            return nil
        }

        // Return Amperage (in mA).
        // Positive = flowing into battery (charging)
        // Negative = flowing out of battery (discharging)
        if let amperage = info[kIOPSAmperageKey] as? Int {
            return amperage
        }

        return nil
    }

    // MARK: - Protocol Methods

    func getVersion(withReply reply: @escaping (String) -> Void) {
        reply("1.0.0")
    }

    func getMetrics(withReply reply: @escaping (Data?, Error?) -> Void) {
        do {
            // CPU/System power/temps still need powermetrics parsing.
            // But we can pull live battery stats via IOKit now.

            let voltage_mV = getBatteryVoltage() ?? 0
            let amperage_mA = getBatteryAmperage() ?? 0

            // Convert to standard units
            let voltage_V = Double(voltage_mV) / 1000.0
            let amperage_A = Double(amperage_mA) / 1000.0

            // Power = Voltage * Current (Watts)
            let power_W = voltage_V * amperage_A

            let isCharging = amperage_mA > 0
            let isDischarging = amperage_mA < 0

            let metrics = SystemMetrics(
                totalPower: Double.random(in: 5...30), // Still requires powermetrics
                cpuPower: Double.random(in: 1...15),   // Still requires powermetrics
                gpuPower: Double.random(in: 0...10),   // Still requires powermetrics
                anePower: Double.random(in: 0...2),    // Still requires powermetrics
                cpuTemp: Double.random(in: 40...80),   // Still requires powermetrics
                gpuTemp: Double.random(in: 40...75),   // Still requires powermetrics
                batteryTemp: Double.random(in: 25...40), // Still requires powermetrics
                batteryLevel: 80.0, // Should be fetched from IOPS keys too, mock for now
                batteryCycles: 150, // Should be fetched from IORegistry, mock for now
                batteryVoltage: voltage_V,
                batteryCurrent: amperage_A,
                batteryPower: power_W,
                isCharging: isCharging,
                isDischarging: isDischarging
            )

            let data = try JSONEncoder().encode(metrics)
            reply(data, nil)
        } catch {
            reply(nil, error)
        }
    }

    func updateBatteryControlState(_ stateData: Data, withReply reply: @escaping (Bool, Error?) -> Void) {
        do {
            let state = try JSONDecoder().decode(BatteryControlState.self, from: stateData)

            // Determine the target limit based on whether the feature is enabled
            let targetLimit = state.chargeLimitEnabled ? state.chargeLimit : 100

            // In a real app, this is where you write to the SMC keys to control charging.
            // e.g., to set charge limit:
            // smc_write("BCLM", targetLimit)

            // e.g., to force discharge (inhibit charging):
            // smc_write("CH0I", state.forceDischarge ? 1 : 0) // Example key, actual keys vary by Mac model

            print("Received new battery control state: LimitEnabled: \(state.chargeLimitEnabled) (Target: \(targetLimit)%), Sailing: \(state.sailingModeEnabled), Force Discharge: \(state.forceDischarge)")

            reply(true, nil)
        } catch {
            reply(false, error)
        }
    }
}
