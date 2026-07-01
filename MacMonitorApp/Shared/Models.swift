import Foundation

public struct SystemMetrics: Codable, Identifiable {
    public let id: UUID
    public let timestamp: Date

    // Power (in Watts)
    public let totalPower: Double
    public let cpuPower: Double
    public let gpuPower: Double
    public let anePower: Double // Apple Neural Engine

    // Temperatures (in Celsius)
    public let cpuTemp: Double
    public let gpuTemp: Double
    public let batteryTemp: Double

    // Battery Info
    public let batteryLevel: Double // Percentage (0-100)
    public let batteryCycles: Int
    public let isCharging: Bool
    public let isDischarging: Bool

    public init(id: UUID = UUID(), timestamp: Date = Date(), totalPower: Double, cpuPower: Double, gpuPower: Double, anePower: Double, cpuTemp: Double, gpuTemp: Double, batteryTemp: Double, batteryLevel: Double, batteryCycles: Int, isCharging: Bool, isDischarging: Bool) {
        self.id = id
        self.timestamp = timestamp
        self.totalPower = totalPower
        self.cpuPower = cpuPower
        self.gpuPower = gpuPower
        self.anePower = anePower
        self.cpuTemp = cpuTemp
        self.gpuTemp = gpuTemp
        self.batteryTemp = batteryTemp
        self.batteryLevel = batteryLevel
        self.batteryCycles = batteryCycles
        self.isCharging = isCharging
        self.isDischarging = isDischarging
    }
}

public struct BatteryControlState: Codable {
    public var chargeLimit: Int // 0-100
    public var sailingModeEnabled: Bool
    public var sailingModeLowerLimit: Int // e.g., if limit is 80, lower limit might be 75
    public var forceDischarge: Bool

    public init(chargeLimit: Int = 80, sailingModeEnabled: Bool = false, sailingModeLowerLimit: Int = 75, forceDischarge: Bool = false) {
        self.chargeLimit = chargeLimit
        self.sailingModeEnabled = sailingModeEnabled
        self.sailingModeLowerLimit = sailingModeLowerLimit
        self.forceDischarge = forceDischarge
    }
}
